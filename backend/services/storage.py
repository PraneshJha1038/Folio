import cloudinary
import cloudinary.uploader
from fastapi import UploadFile, HTTPException, status
from settings import CLOUDINARY_CONFIG
import zipfile
import xml.etree.ElementTree as ET
import io
import posixpath

cloudinary.config(
    cloud_name=CLOUDINARY_CONFIG['cloud_name'],
    api_key=CLOUDINARY_CONFIG['api_key'],
    api_secret=CLOUDINARY_CONFIG['api_secret'],
    secure=True
)

def upload_file_to_cloudinary(file: UploadFile) -> str:
    """
    Synchronously uploads an uploaded file to Cloudinary.
    Since we support PDF and EPUB (non-image files), we set resource_type to 'raw'.
    Returns the secure URL of the uploaded file.
    """
    try:
        # Read file content
        file_content = file.file.read()
        
        # Upload
        response = cloudinary.uploader.upload(
            file_content,
            public_id=file.filename,
            resource_type="raw"
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
