from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timezone
from pydantic import BaseModel, Field

from database import get_db
from dependencies import get_current_user
from models import ReadingSession, LibraryItem, BookmarkHighlight, User
from schemas import (
    ReadingSessionResponse, ReadingSessionCreate,
    BookmarkHighlightResponse, BookmarkHighlightCreate, BookmarkType
)

router = APIRouter(tags=["reading"])

# ----------------- READING SESSIONS -----------------

@router.post("/reading/sessions", response_model=ReadingSessionResponse)
async def create_reading_session(
    body: ReadingSessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify library item belongs to user
    item_query = await db.execute(
        select(LibraryItem).where(and_(LibraryItem.id == body.library_item_id, LibraryItem.user_id == current_user.id))
    )
    item = item_query.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library item not found"
        )
        
    session = ReadingSession(
        library_item_id=body.library_item_id,
        duration_sec=body.duration_sec,
        words_covered=body.words_covered,
        progress_pct=body.progress_pct,
        ended_at=datetime.now(timezone.utc)
    )
    db.add(session)
    
    # Increment user reading sessions count
    current_user.reading_sessions_count += 1
    
    # Update library item progress
    item.progress_percent = body.progress_pct
    if body.progress_pct >= 100:
        item.is_finished = True
    
    # Recalibrate WPM if count >= 5
    if current_user.reading_sessions_count >= 5:
        # Get all reading sessions for this user's library items
        sessions_query = await db.execute(
            select(ReadingSession)
            .join(LibraryItem, ReadingSession.library_item_id == LibraryItem.id)
            .where(LibraryItem.user_id == current_user.id)
        )
        all_sessions = sessions_query.scalars().all()
        
        total_words = 0
        total_seconds = 0
        for s in all_sessions:
            if s.words_covered and s.duration_sec:
                total_words += s.words_covered
                total_seconds += s.duration_sec
        
        # Add the current session as well if it's not committed/queried yet
        total_words += body.words_covered
        total_seconds += body.duration_sec
        
        if total_seconds > 0:
            minutes = total_seconds / 60.0
            current_user.current_wpm = int(total_words / minutes)
            
    await db.commit()
    await db.refresh(session)
    return session

@router.get("/reading/sessions")
async def get_reading_sessions(
    library_item_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify library item ownership
    item_query = await db.execute(
        select(LibraryItem).where(and_(LibraryItem.id == library_item_id, LibraryItem.user_id == current_user.id))
    )
    item = item_query.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library item not found"
        )
        
    query = select(ReadingSession).where(ReadingSession.library_item_id == library_item_id).order_by(ReadingSession.started_at.desc())
    
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()
    
    items_query = query.limit(limit).offset(offset)
    items_result = await db.execute(items_query)
    items = items_result.scalars().all()
    
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset
    }

# ----------------- BOOKMARKS & HIGHLIGHTS -----------------

@router.post("/library/{id}/bookmarks", response_model=BookmarkHighlightResponse)
async def create_bookmark_highlight(
    id: int,
    body: BookmarkHighlightCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify library item belongs to user
    item_query = await db.execute(
        select(LibraryItem).where(and_(LibraryItem.id == id, LibraryItem.user_id == current_user.id))
    )
    item = item_query.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library item not found"
        )
        
    bookmark = BookmarkHighlight(
        library_item_id=id,
        type=body.type.value,
        position=body.position,
        highlighted_text=body.highlighted_text,
        note=body.note,
        color=body.color
    )
    db.add(bookmark)
    await db.commit()
    await db.refresh(bookmark)
    return bookmark

@router.get("/library/{id}/bookmarks")
async def get_bookmarks_highlights(
    id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify library item belongs to user
    item_query = await db.execute(
        select(LibraryItem).where(and_(LibraryItem.id == id, LibraryItem.user_id == current_user.id))
    )
    item = item_query.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library item not found"
        )
        
    query = select(BookmarkHighlight).where(BookmarkHighlight.library_item_id == id).order_by(BookmarkHighlight.created_at.desc())
    
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()
    
    items_query = query.limit(limit).offset(offset)
    items_result = await db.execute(items_query)
    items = items_result.scalars().all()
    
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset
    }

@router.delete("/bookmarks/{id}")
async def delete_bookmark_highlight(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify bookmark belongs to current user's library item
    bookmark_query = await db.execute(
        select(BookmarkHighlight)
        .join(LibraryItem, BookmarkHighlight.library_item_id == LibraryItem.id)
        .where(and_(BookmarkHighlight.id == id, LibraryItem.user_id == current_user.id))
    )
    bookmark = bookmark_query.scalar_one_or_none()
    if not bookmark:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bookmark/Highlight not found"
        )
        
    await db.delete(bookmark)
    await db.commit()
    return {"message": "Bookmark/Highlight deleted successfully"}
