from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
from pydantic import BaseModel

from database import get_db, AsyncSessionLocal
from dependencies import get_current_user
from models import SuggestionRequest, LibraryItem, ContentSource, ContentGenre, UserGenrePreference, User
from schemas import SuggestionRequestResponse
from router.ai_features import call_ai_service

router = APIRouter(prefix="/suggestions", tags=["suggestions"])

class SuggestionCreateRequest(BaseModel):
    time_budget_minutes: int

async def run_suggestion_algorithm(request_id: int, user_id: int, time_budget: int):
    # Establish a fresh async session for background execution
    async with AsyncSessionLocal() as db:
        try:
            # 1. Fetch user to get WPM
            user_query = await db.execute(select(User).where(User.id == user_id))
            user = user_query.scalar_one_or_none()
            if not user:
                raise ValueError("User not found")
                
            wpm = user.current_wpm if user.current_wpm else user.default_wpm
            if not wpm:
                wpm = 238
                
            # 2. Get user's top genres (history-based first, preference-based fallback)
            # Find recently finished items
            finished_query = await db.execute(
                select(LibraryItem)
                .where(and_(LibraryItem.user_id == user_id, LibraryItem.is_finished == True))
                .order_by(LibraryItem.finished_at.desc())
                .limit(10)
            )
            finished_items = finished_query.scalars().all()
            
            user_genres = set()
            if finished_items:
                finished_content_ids = [item.content_id for item in finished_items]
                genres_query = await db.execute(
                    select(ContentGenre.genre)
                    .where(ContentGenre.content_id.in_(finished_content_ids))
                )
                user_genres = set(genres_query.scalars().all())
                
            if not user_genres:
                # Fallback to user_genre_preferences
                pref_query = await db.execute(
                    select(UserGenrePreference.genre)
                    .where(UserGenrePreference.user_id == user_id)
                )
                user_genres = set(pref_query.scalars().all())

            # 3. Query all unfinished library items
            unfinished_query = await db.execute(
                select(LibraryItem)
                .options(selectinload(LibraryItem.content_source))
                .where(and_(LibraryItem.user_id == user_id, LibraryItem.is_finished == False))
            )
            unfinished_items = unfinished_query.scalars().all()
            
            # Group B AI Feature: Optimize Queue
            ai_payload = {
                "available_minutes": time_budget,
                "articles": [],
                "user_preferred_topics": list(user_genres)
            }
            
            for item in unfinished_items:
                cs = item.content_source
                if not cs or not cs.word_count: continue
                est_minutes = cs.word_count / wpm
                cg_query = await db.execute(
                    select(ContentGenre.genre).where(ContentGenre.content_id == cs.id)
                )
                item_genres = set(cg_query.scalars().all())
                
                ai_payload["articles"].append({
                    "id": item.id,
                    "title": cs.title,
                    "estimated_minutes": round(est_minutes, 1),
                    "genres": list(item_genres)
                })

            ai_res = await call_ai_service("/api/queue/optimize", ai_payload)
            
            if ai_res and isinstance(ai_res, list):
                top_5 = ai_res[:5]
                # Format to match existing schema if AI doesn't exactly match
                for i in range(len(top_5)):
                    if "library_item_id" not in top_5[i] and "id" in top_5[i]:
                        top_5[i]["library_item_id"] = top_5[i]["id"]
            else:
                # FALLBACK LOGIC
                candidates = []
                max_allowed_time = time_budget * 1.1 # 10% tolerance
                
                for article in ai_payload["articles"]:
                    est_minutes = article["estimated_minutes"]
                    if est_minutes <= max_allowed_time:
                        item_genres = set(article["genres"])
                        
                        if not item_genres:
                            genre_match = 0.0
                        else:
                            overlap = item_genres.intersection(user_genres)
                            genre_match = len(overlap) / len(item_genres)
                            
                        time_fit = est_minutes / time_budget
                        if time_fit > 1.0:
                            time_fit = 1.0 - (time_fit - 1.0)
                            
                        score = (0.6 * genre_match) + (0.4 * time_fit)
                        
                        reason = f"Estimated reading time matches budget ({int(est_minutes)} min)."
                        if genre_match > 0:
                            overlap = item_genres.intersection(user_genres)
                            reason += f" Matches your interest in {', '.join(overlap)}."
                            
                        candidates.append({
                            "library_item_id": article["id"],
                            "score": round(score, 3),
                            "reason": reason,
                            "title": article["title"],
                            "estimated_minutes": est_minutes
                        })
                
                candidates.sort(key=lambda x: x["score"], reverse=True)
                top_5 = candidates[:5]
            
            # Update suggestion request
            req_query = await db.execute(select(SuggestionRequest).where(SuggestionRequest.id == request_id))
            req_row = req_query.scalar_one_or_none()
            if req_row:
                req_row.status = "completed"
                req_row.result = top_5
                req_row.completed_at = datetime.now(timezone.utc)
                await db.commit()
                
        except Exception as e:
            # Mark suggestion request as failed
            req_query = await db.execute(select(SuggestionRequest).where(SuggestionRequest.id == request_id))
            req_row = req_query.scalar_one_or_none()
            if req_row:
                req_row.status = "failed"
                req_row.result = {"error": str(e)}
                req_row.completed_at = datetime.now(timezone.utc)
                await db.commit()

@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_suggestion(
    body: SuggestionCreateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    request_row = SuggestionRequest(
        user_id=current_user.id,
        time_budget_minutes=body.time_budget_minutes,
        status="pending"
    )
    db.add(request_row)
    await db.commit()
    await db.refresh(request_row)
    
    # Schedule background task
    background_tasks.add_task(
        run_suggestion_algorithm,
        request_row.id,
        current_user.id,
        body.time_budget_minutes
    )
    
    return {
        "status": "pending",
        "request_id": request_row.id
    }

@router.get("/{request_id}", response_model=SuggestionRequestResponse)
async def get_suggestion(
    request_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(SuggestionRequest).where(
            and_(SuggestionRequest.id == request_id, SuggestionRequest.user_id == current_user.id)
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Suggestion request not found"
        )
    return req
