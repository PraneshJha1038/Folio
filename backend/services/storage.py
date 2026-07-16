# ── SSL fix: patch urllib3 BEFORE cloudinary is imported ─────────────
# Cloudinary's uploader uses urllib3.PoolManager directly for multipart
# file uploads — it never goes through requests, so REQUESTS_CA_BUNDLE
# env vars are ignored. We must patch urllib3 itself before any import
# of the cloudinary package.
import urllib3
import urllib3.poolmanager

_OriginalPoolManager = urllib3.poolmanager.PoolManager

class _NoVerifyPoolManager(_OriginalPoolManager):
    def __init__(self, *args, **kwargs):
        kwargs['cert_reqs'] = 'CERT_NONE'
        super().__init__(*args, **kwargs)

urllib3.poolmanager.PoolManager = _NoVerifyPoolManager
urllib3.PoolManager              = _NoVerifyPoolManager
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
# ─────────────────────────────────────────────────────────────────────

import cloudinary
import cloudinary.uploader
import cloudinary.api
from fastapi import UploadFile, HTTPException, status
from settings import CLOUDINARY_CONFIG
import zipfile
import xml.etree.ElementTree as ET
import io
import posixpath
from urllib.parse import unquote

cloudinary.config(
    cloud_name=CLOUDINARY_CONFIG['cloud_name'],
    api_key=CLOUDINARY_CONFIG['api_key'],
    api_secret=CLOUDINARY_CONFIG['api_secret'],
    secure=True
)

def upload_file_to_cloudinary(file_content: bytes, public_id: str | None = None) -> str:
    """
    Synchronously uploads an uploaded file to Cloudinary.
    Since we support PDF and EPUB (non-image files), we set resource_type to 'raw'.
    Returns the secure URL of the uploaded file.
    """
    try:
        upload_options = {"resource_type": "raw"}
        if public_id:
            upload_options["public_id"] = public_id

        response = cloudinary.uploader.upload(
            file_content,
            **upload_options
        )
        
        secure_url = response.get("secure_url")
        if not secure_url:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Cloudinary did not return a secure URL"
            )
        return secure_url
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload file to Cloudinary: {str(e)}"
        )


def extract_text_from_pdf(file_content: bytes) -> str | None:
    """
    Extract text from a PDF upload when pypdf is available, preserving structure and outline.
    """
    try:
        from pypdf import PdfReader
    except ImportError:
        print("WARNING: pypdf is not installed! PDF text extraction is disabled. Run: pip install pypdf")
        return None

    try:
        reader = PdfReader(io.BytesIO(file_content))
        
        # Try to read outline/bookmarks
        outline = []
        try:
            def parse_outline(outline_list):
                entries = []
                for item in outline_list:
                    if isinstance(item, list):
                        entries.extend(parse_outline(item))
                    else:
                        title = item.get('/Title')
                        page_num = None
                        try:
                            page_num = reader.get_destination_page_number(item)
                        except Exception:
                            pass
                        if title:
                            entries.append({"title": title, "page": page_num})
                return entries
            if reader.outline:
                outline = parse_outline(reader.outline)
        except Exception as e:
            print(f"Failed to read PDF outline: {e}")
            
        pages = []
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text() or ""
            page_html = ""
            
            # Insert outline headings matching this page
            matching_outline = [o for o in outline if o["page"] == i]
            for o in matching_outline:
                page_html += f"<h2 class='pdf-outline' id='pdf-page-{i}-{o['title'].replace(' ', '_')}'>{o['title']}</h2>\n"
            
            # Split page text into paragraphs
            paragraphs = page_text.split("\n\n")
            for p in paragraphs:
                if p.strip():
                    page_html += f"<p>{p.strip()}</p>\n"
            
            if page_html:
                pages.append(f"<div class='pdf-page' id='pdf-p-{i}'>\n{page_html}\n</div>")
                
        text = "\n\n".join(pages).strip()
        return text or None
    except Exception as e:
        print(f"Failed to extract PDF text: {e}")
        return None




def extract_text_from_epub(file_content: bytes) -> tuple[str | None, list | None]:
    """
    Extract readable HTML structured content from EPUB chapters using BeautifulSoup.
    Also extracts the Table of Contents (TOC) from EPUB 3 nav or EPUB 2 NCX.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("WARNING: BeautifulSoup (beautifulsoup4) is not installed!")
        return None, None

    try:
        with zipfile.ZipFile(io.BytesIO(file_content)) as archive:
            try:
                container_xml = archive.read("META-INF/container.xml")
            except KeyError as e:
                print(f"ERROR: META-INF/container.xml not found in EPUB: {e}")
                return None, None

            container_tree = ET.fromstring(container_xml)
            rootfile_path = None
            for element in container_tree.iter():
                if element.tag.split("}")[-1] == "rootfile":
                    rootfile_path = element.attrib.get("full-path")
                    break

            if not rootfile_path:
                print("ERROR: rootfile path not found in container.xml")
                return None, None

            opf_bytes = archive.read(rootfile_path)
            opf_tree = ET.fromstring(opf_bytes)
            namespace_free = lambda tag: tag.split("}")[-1]

            manifest = {}
            spine = []
            opf_dir = posixpath.dirname(rootfile_path)

            nav_href = None
            ncx_href = None

            for element in opf_tree.iter():
                tag = namespace_free(element.tag)
                if tag == "item":
                    item_id = element.attrib.get("id")
                    href = element.attrib.get("href")
                    properties = element.attrib.get("properties") or ""
                    media_type = element.attrib.get("media-type") or ""
                    if item_id and href:
                        manifest[item_id] = href
                    if "nav" in properties.split():
                        nav_href = href
                    elif media_type == "application/x-dtbncx+xml" or item_id == "ncx":
                        ncx_href = href
                elif tag == "itemref":
                    idref = element.attrib.get("idref")
                    if idref:
                        spine.append(idref)

            # Build mapping from chapter file path in zip to its href
            chapter_paths_map = {}
            chapter_texts = []
            for item_id in spine:
                href = manifest.get(item_id)
                if not href:
                    continue

                href = unquote(href)
                chapter_path = posixpath.join(opf_dir, href) if opf_dir else href
                chapter_paths_map[posixpath.normpath(chapter_path)] = href

                try:
                    chapter_bytes = archive.read(chapter_path)
                except KeyError as e:
                    print(f"WARNING: Spine chapter {chapter_path} not found in zip archive: {e}")
                    continue

                try:
                    import re
                    import base64
                    import mimetypes
                    
                    # Use html.parser which is built-in and safe
                    soup = BeautifulSoup(chapter_bytes, "html.parser")
                    
                    # Strip stylesheet, scripts, metadata, link, and title elements (handling possible namespaces)
                    for tag in soup.find_all(re.compile(r"(?:^|:)(?:style|script|link|meta|title)$", re.I)):
                        tag.decompose()
                        
                    body = soup.find(re.compile(r"(?:^|:)body$", re.I))
                    if body:
                        chapter_html = "".join(str(child) for child in body.children)
                    else:
                        chapter_html = str(soup)
                    
                    # Prefix IDs to avoid collisions and rewrite internal hrefs
                    chapter_id = href.replace("/", "_").replace(".", "_")
                    chapter_soup = BeautifulSoup(chapter_html, "html.parser")
                    
                    # Wrap chapter in a div to serve as TOC target
                    chapter_text = f"<div class='epub-chapter' id='{chapter_id}_start'>\n"
                    
                    for elem in chapter_soup.find_all(id=True):
                        elem['id'] = f"{chapter_id}_{elem['id']}"
                        
                    for a in chapter_soup.find_all("a", href=True):
                        link_href = a['href']
                        if not (link_href.startswith("http://") or link_href.startswith("https://") or link_href.startswith("mailto:") or link_href.startswith("data:")):
                            if "#" in link_href:
                                file_part, anchor_part = link_href.split("#", 1)
                            else:
                                file_part, anchor_part = link_href, "start"
                                
                            if not file_part:
                                target_id = f"{chapter_id}_{anchor_part}"
                            else:
                                target_href = posixpath.normpath(posixpath.join(posixpath.dirname(href), file_part))
                                target_chapter_id = target_href.replace("/", "_").replace(".", "_")
                                target_id = f"{target_chapter_id}_{anchor_part}"
                                
                            a['href'] = f"#{target_id}"
                            
                    # Embed images as base64
                    for img in chapter_soup.find_all(["img", "image"]):
                        src_attr = 'src' if img.name == 'img' else 'href'
                        # In SVG, href might be xlink:href
                        if not img.has_attr(src_attr):
                            if img.has_attr('xlink:href'):
                                src_attr = 'xlink:href'
                            else:
                                continue
                                
                        img_src = img[src_attr]
                        if not (img_src.startswith("http://") or img_src.startswith("https://") or img_src.startswith("data:")):
                            try:
                                img_href = posixpath.normpath(posixpath.join(posixpath.dirname(href), img_src))
                                img_bytes = archive.read(unquote(img_href))
                                mime_type, _ = mimetypes.guess_type(img_href)
                                if not mime_type:
                                    mime_type = "image/jpeg"
                                b64 = base64.b64encode(img_bytes).decode('utf-8')
                                img[src_attr] = f"data:{mime_type};base64,{b64}"
                            except Exception as e:
                                print(f"Failed to embed image {img_src}: {e}")
                                
                    chapter_text += str(chapter_soup)
                    chapter_text += "\n</div>"
                    chapter_texts.append(chapter_text)
                except Exception as e:
                    print(f"Failed to parse chapter HTML: {e}")
                    continue

            text = "\n\n".join(chapter_texts).strip()

            # Parse Table of Contents (TOC)
            toc_entries = []

            # 1. Try EPUB 3 Nav
            if nav_href:
                try:
                    nav_path = posixpath.join(opf_dir, unquote(nav_href)) if opf_dir else unquote(nav_href)
                    nav_bytes = archive.read(nav_path)
                    nav_soup = BeautifulSoup(nav_bytes, "html.parser")
                    nav_elem = nav_soup.find("nav")
                    if nav_elem:
                        a_tags = nav_elem.find_all("a", href=True)
                        nav_dir = posixpath.dirname(nav_path)
                        for a in a_tags:
                            label = a.get_text(strip=True)
                            href_val = unquote(a["href"])
                            if "#" in href_val:
                                file_part, anchor_part = href_val.split("#", 1)
                            else:
                                file_part, anchor_part = href_val, None
                                
                            target_file_path = posixpath.normpath(posixpath.join(nav_dir, file_part))
                            matched_href = chapter_paths_map.get(target_file_path)
                            if matched_href:
                                chapter_id = matched_href.replace("/", "_").replace(".", "_")
                                target_id = f"{chapter_id}_{anchor_part}" if anchor_part else f"{chapter_id}_start"
                                toc_entries.append({
                                    "label": label,
                                    "target_file": file_part,
                                    "target_anchor": anchor_part,
                                    "id": target_id
                                })
                except Exception as e:
                    print(f"ERROR: Failed to parse EPUB 3 Nav document: {e}")

            # 2. Fallback to EPUB 2 NCX
            if not toc_entries and ncx_href:
                try:
                    ncx_path = posixpath.join(opf_dir, unquote(ncx_href)) if opf_dir else unquote(ncx_href)
                    ncx_bytes = archive.read(ncx_path)
                    ncx_tree = ET.fromstring(ncx_bytes)
                    
                    root_tag = ncx_tree.tag
                    ns = ""
                    if '}' in root_tag:
                        ns = root_tag.split('}')[0] + '}'
                        
                    ncx_dir = posixpath.dirname(ncx_path)
                    
                    for elem in ncx_tree.iter():
                        tag_name = namespace_free(elem.tag)
                        if tag_name == 'navPoint':
                            label = ""
                            label_elem = elem.find(f'{ns}navLabel')
                            if label_elem is not None:
                                text_elem = label_elem.find(f'{ns}text')
                                if text_elem is not None:
                                    label = text_elem.text or ""
                                    
                            src = ""
                            content_elem = elem.find(f'{ns}content')
                            if content_elem is not None:
                                src = unquote(content_elem.attrib.get('src', ''))
                                
                            if src:
                                if "#" in src:
                                    file_part, anchor_part = src.split("#", 1)
                                else:
                                    file_part, anchor_part = src, None
                                    
                                target_file_path = posixpath.normpath(posixpath.join(ncx_dir, file_part))
                                matched_href = chapter_paths_map.get(target_file_path)
                                if matched_href:
                                    chapter_id = matched_href.replace("/", "_").replace(".", "_")
                                    target_id = f"{chapter_id}_{anchor_part}" if anchor_part else f"{chapter_id}_start"
                                    toc_entries.append({
                                        "label": label,
                                        "target_file": file_part,
                                        "target_anchor": anchor_part,
                                        "id": target_id
                                    })
                except Exception as e:
                    print(f"ERROR: Failed to parse EPUB 2 NCX document: {e}")

            return text or None, toc_entries or None
    except Exception as e:
        print(f"ERROR: Failed to extract EPUB text: {e}")
        return None, None


def extract_uploaded_text(file_content: bytes, file_type: str) -> tuple[str | None, list | None]:
    if file_type == "pdf":
        return extract_text_from_pdf(file_content), None
    if file_type == "epub":
        return extract_text_from_epub(file_content)
    return None, None

def extract_epub_cover_and_upload(file_content: bytes) -> str | None:
    """
    Extracts the cover image from an EPUB file (if present) and uploads it to Cloudinary.
    Supports both EPUB 2 (metadata name="cover") and EPUB 3 (properties="cover-image").
    Returns the secure URL of the uploaded image, or None if no cover is found.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(file_content)) as z:
            # 1. Parse container.xml
            try:
                container = z.read("META-INF/container.xml")
            except KeyError:
                return None
            
            # Use a dummy namespace map or just remove namespaces for easier finding
            # Etree can be annoying with namespaces. It's safer to strip or ignore namespaces
            # using regex or just properly defining them. Let's use wildcard namespaces.
            # However, standard ET doesn't support wildcard in findall easily in all python versions.
            # Let's just strip namespaces from tags.
            def strip_ns(tag):
                return tag.split('}')[-1] if '}' in tag else tag

            tree = ET.fromstring(container)
            rootfile_path = None
            for elem in tree.iter():
                if strip_ns(elem.tag) == 'rootfile':
                    rootfile_path = elem.attrib.get('full-path')
                    break
                    
            if not rootfile_path:
                return None
            
            # 2. Parse the OPF file
            opf_content = z.read(rootfile_path)
            opf_tree = ET.fromstring(opf_content)
            
            cover_item_id = None
            # Look for <meta name="cover" content="COVER_ID" />
            for elem in opf_tree.iter():
                if strip_ns(elem.tag) == 'meta':
                    if elem.attrib.get('name') == 'cover':
                        cover_item_id = elem.attrib.get('content')
                        break
            
            cover_href = None
            # Look in <manifest> for <item>
            for elem in opf_tree.iter():
                if strip_ns(elem.tag) == 'item':
                    # EPUB 3
                    if elem.attrib.get('properties') == 'cover-image':
                        cover_href = elem.attrib.get('href')
                        break
                    # EPUB 2
                    if cover_item_id and elem.attrib.get('id') == cover_item_id:
                        cover_href = elem.attrib.get('href')
                        break
                        
            if not cover_href:
                return None
                
            # Resolve the image path relative to the OPF file
            opf_dir = posixpath.dirname(rootfile_path)
            if opf_dir:
                # Need to handle URL encoding in href
                import urllib.parse
                cover_href = urllib.parse.unquote(cover_href)
                cover_image_path = posixpath.join(opf_dir, cover_href)
            else:
                cover_image_path = cover_href
                
            # Extract image content
            try:
                image_content = z.read(cover_image_path)
            except KeyError:
                return None
                
            # Upload to Cloudinary as image
            response = cloudinary.uploader.upload(
                image_content,
                resource_type="image"
            )
            return response.get("secure_url")
    except Exception as e:
        print(f"Failed to extract epub cover: {e}")
        return None
