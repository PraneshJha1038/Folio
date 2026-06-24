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
from services.storage import upload_file_to_cloudinary
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

    # 1. Upload to Cloudinary
    file_url = upload_file_to_cloudinary(file)
    
    # Estimate word count if possible (or default to 0 for uploads, calibrated later)
    # Simple default for hackathon MVP uploads
    word_count = 5000 
    
    db_title = title if title else os.path.splitext(filename)[0]

    # 2. Create ContentSource row
    content_source = ContentSource(
        owner_id=current_user.id,
        type=content_type.value,
        title=db_title,
        author=author,
        file_path=file_url,
        word_count=word_count,
        visibility=visibility.value
    )
    
    db.add(content_source)
    await db.commit()
    await db.refresh(content_source)
    
    return content_source

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
