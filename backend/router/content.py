from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import Any
import os
import uuid

from database import get_db
from dependencies import get_current_user, security
from models import ContentSource, ContentGenre, ContentReport, User
from auth_utils import decode_access_token
from schemas import ContentSourceResponse, ContentReportResponse, Visibility, ContentType, ContentGenreCreate
from services.storage import (
    upload_file_to_cloudinary,
    extract_epub_cover_and_upload,
    extract_uploaded_text,
)
from services.scraper import scrape_url
from fastapi.security import HTTPAuthorizationCredentials

router = APIRouter(prefix="/content", tags=["content"])

async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User | None:
    if not credentials:
        return None
    try:
        user_id = decode_access_token(credentials.credentials)
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()
    except Exception:
        return None

@router.post("/upload", response_model=ContentSourceResponse)
async def upload_content(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    author: str | None = Form(None),
    visibility: Visibility = Form(Visibility.local),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Determine type based on extension
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".pdf":
        content_type = ContentType.pdf
    elif ext == ".epub":
        content_type = ContentType.epub
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file extension. Only PDF and EPUB are supported."
        )

    file_content = file.file.read()

    # 1. Upload to Cloudinary
    file_url = upload_file_to_cloudinary(file_content, public_id=file.filename)
    
    # 1b. Extract and upload cover image for EPUB
    cover_image_url = None
    if content_type == ContentType.epub:
        cover_image_url = extract_epub_cover_and_upload(file_content)

    raw_text, toc = extract_uploaded_text(file_content, content_type.value)
    word_count = len(raw_text.split()) if raw_text else 5000
    
    db_title = title if title else os.path.splitext(filename)[0]

    # 2. Create ContentSource row
    content_source = ContentSource(
        owner_id=current_user.id,
        type=content_type.value,
        title=db_title,
        author=author,
        file_path=file_url,
        cover_image_url=cover_image_url,
        raw_text=raw_text,
        toc=toc,
        word_count=word_count,
        visibility=visibility.value
    )
    
    db.add(content_source)
    await db.commit()
    await db.refresh(content_source)
    
    # Auto-add to user's library with isolated failure handling
    from models import LibraryItem
    try:
        library_item = LibraryItem(
            user_id=current_user.id,
            content_id=content_source.id,
            is_finished=False
        )
        db.add(library_item)
        await db.commit()
    except Exception as e:
        print(f"Isolated failure: Could not auto-add to local library. Error: {e}")
        # We do not rollback or fail the upload request
    
    return content_source

@router.post("/{id}/cover", response_model=ContentSourceResponse)
async def upload_cover_image(
    id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ContentSource).where(ContentSource.id == id))
    content_source = result.scalar_one_or_none()
    if not content_source:
        raise HTTPException(status_code=404, detail="Content not found")
    if content_source.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this content")
        
    # Upload image to cloudinary
    try:
        import cloudinary.uploader
        file_content = file.file.read()
        response = cloudinary.uploader.upload(
            file_content,
            resource_type="image"
        )
        secure_url = response.get("secure_url")
        if secure_url:
            content_source.cover_image_url = secure_url
            await db.commit()
            await db.refresh(content_source)
            return content_source
        else:
            raise HTTPException(status_code=500, detail="Cloudinary upload failed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload cover: {str(e)}")

class UrlUploadRequest(Any):
    # Pydantic schema helper
    pass

from pydantic import BaseModel

class UrlUploadBody(BaseModel):
    url: str
    visibility: Visibility = Visibility.local

@router.post("/url", response_model=ContentSourceResponse)
async def upload_url(
    body: UrlUploadBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # 1. Scrape content
    scraped_data = scrape_url(body.url)
    
    # 2. Write text content directly to raw_text DB column instead of local file
    
    # 3. Save to database
    content_source = ContentSource(
        owner_id=current_user.id,
        type=ContentType.article.value,
        title=scraped_data["title"],
        author=scraped_data["author"],
        source_url=body.url,
        file_path=None, # file_path strictly excluded for URLs
        raw_text=scraped_data["text"],
        word_count=scraped_data["word_count"],
        visibility=body.visibility.value
    )
    
    db.add(content_source)
    await db.commit()
    await db.refresh(content_source)
    
    # Auto-add to user's library with isolated failure handling
    from models import LibraryItem
    try:
        library_item = LibraryItem(
            user_id=current_user.id,
            content_id=content_source.id,
            is_finished=False
        )
        db.add(library_item)
        await db.commit()
    except Exception as e:
        print(f"Isolated failure: Could not auto-add to local library. Error: {e}")
        # We do not rollback or fail the upload request
        
    return content_source

@router.get("/global")
async def get_global_content(
    genre: str | None = Query(None),
    title: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    # Base query for global visibility
    query = select(ContentSource).where(ContentSource.visibility == "global")
    
    # Join with genres if genre is provided
    if genre:
        query = query.join(ContentGenre, ContentSource.id == ContentGenre.content_id).where(ContentGenre.genre == genre)
        
    if title:
        query = query.where(ContentSource.title.ilike(f"%{title}%"))
        
    # Total count query
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()
    
    # Paginated items query
    items_query = query.limit(limit).offset(offset)
    items_result = await db.execute(items_query)
    items = items_result.scalars().all()
    
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset
    }

@router.get("/{id}", response_model=ContentSourceResponse)
async def get_content_by_id(
    id: int,
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ContentSource).where(ContentSource.id == id))
    content = result.scalar_one_or_none()
    
    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content not found"
        )
        
    # Access checks
    if content.visibility != "global":
        if not current_user or content.owner_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to local content"
            )
            
    return content

from schemas import ContentSourceUpdate

@router.patch("/{id}", response_model=ContentSourceResponse)
async def update_content(
    id: int,
    body: ContentSourceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ContentSource).where(ContentSource.id == id))
    content = result.scalar_one_or_none()
    
    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content not found"
        )
        
    # Enforce owner-only edit rule
    if content.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own content"
        )
        
    # Update allowed fields
    if body.title is not None: content.title = body.title
    if body.author is not None: content.author = body.author
    if body.cover_image_url is not None: content.cover_image_url = body.cover_image_url
    if body.visibility is not None: content.visibility = body.visibility.value
    if body.description is not None: content.description = body.description
    if body.tags is not None: content.tags = body.tags
    if body.category is not None: content.category = body.category
    if body.publisher is not None: content.publisher = body.publisher
    if body.language is not None: content.language = body.language
    if body.page_count is not None: content.page_count = body.page_count
    if body.isbn is not None: content.isbn = body.isbn
    if body.series is not None: content.series = body.series
    if body.format is not None: content.format = body.format

    await db.commit()
    await db.refresh(content)
    return content

class ReportBody(BaseModel):
    reason: str

@router.post("/{id}/report", response_model=ContentReportResponse)
async def report_content(
    id: int,
    body: ReportBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Check if content exists
    result = await db.execute(select(ContentSource).where(ContentSource.id == id))
    content = result.scalar_one_or_none()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content not found"
        )
        
    report = ContentReport(
        content_id=id,
        reported_by=current_user.id,
        reason=body.reason,
        status="open"
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report

@router.post("/{id}/genres", response_model=ContentGenreCreate)
async def add_content_genre(
    id: int,
    body: ContentGenreCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Check if content exists
    result = await db.execute(select(ContentSource).where(ContentSource.id == id))
    content = result.scalar_one_or_none()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content not found"
        )
        
    # Access checks
    if content.visibility != "global" and content.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to local content"
        )
        
    # Check if genre already exists for this content
    existing_genre_result = await db.execute(
        select(ContentGenre)
        .where(ContentGenre.content_id == id)
        .where(ContentGenre.genre == body.genre)
    )
    if existing_genre_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Genre already added to this content"
        )
        
    new_genre = ContentGenre(content_id=id, genre=body.genre)
    db.add(new_genre)
    await db.commit()
    
    return {"genre": new_genre.genre}

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_content(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Check if content exists
    result = await db.execute(select(ContentSource).where(ContentSource.id == id))
    content = result.scalar_one_or_none()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content not found"
        )
        
    # Access checks
    if content.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own content"
        )
        
    await db.delete(content)
    await db.commit()
