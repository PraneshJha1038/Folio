from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from database import get_db
from dependencies import get_current_user
from models import User, UserGenrePreference, GENRES, ReadingSession, LibraryItem
from schemas import UserGenrePreferenceCreate

router = APIRouter(prefix="/profile", tags=["profile"])

@router.get("/genres")
async def get_user_genres(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(UserGenrePreference.genre).where(UserGenrePreference.user_id == current_user.id)
    result = await db.execute(query)
    genres = result.scalars().all()
    return {"genres": genres}

@router.get("/stats")
async def get_profile_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = """
        SELECT 
            COALESCE(SUM(rs.words_covered), 0) as total_words_read,
            COALESCE(SUM(rs.duration_sec), 0) as total_time_read_sec
        FROM reading_sessions rs
        JOIN library_items li ON rs.library_item_id = li.id
        WHERE li.user_id = :user_id
    """
    from sqlalchemy import text
    result = await db.execute(text(query), {"user_id": current_user.id})
    row = dict(result.fetchone()._mapping)
    
    return {
        "total_words_read": row["total_words_read"],
        "total_time_read_sec": row["total_time_read_sec"]
    }

@router.post("/genres")
async def add_user_genre(
    body: UserGenrePreferenceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if body.genre not in GENRES:
        raise HTTPException(status_code=422, detail=f"Invalid genre. Must be one of: {', '.join(GENRES)}")
        
    # Check if already exists
    query = select(UserGenrePreference).where(
        UserGenrePreference.user_id == current_user.id,
        UserGenrePreference.genre == body.genre
    )
    result = await db.execute(query)
    if result.scalar_one_or_none():
        return {"message": "Genre already added", "genre": body.genre}
        
    new_pref = UserGenrePreference(user_id=current_user.id, genre=body.genre)
    db.add(new_pref)
    await db.commit()
    return {"message": "Genre added", "genre": body.genre}

@router.delete("/genres/{genre}")
async def remove_user_genre(
    genre: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(UserGenrePreference).where(
        UserGenrePreference.user_id == current_user.id,
        UserGenrePreference.genre == genre
    )
    result = await db.execute(query)
    pref = result.scalar_one_or_none()
    
    if not pref:
        raise HTTPException(status_code=404, detail="Genre not found in your preferences")
        
    await db.delete(pref)
    await db.commit()
    return {"message": "Genre removed"}
