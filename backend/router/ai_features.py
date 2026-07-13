import os
import httpx
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, case
from pydantic import BaseModel

from database import AsyncSessionLocal, get_db
from dependencies import get_current_user
from models import (
    User, ContentSource, AIJobResult, LibraryItem, 
    ContentGenre, ReadingSession, UserGenrePreference
)

router = APIRouter(prefix="/ai", tags=["ai"])

async def call_ai_service(endpoint: str, payload: dict) -> dict | None:
    """
    Generic AI service caller. Returns the parsed JSON response, or None
    if the call failed for any reason (connection error, non-2xx).
    Callers are responsible for falling back to their own logic on None.
    """
    AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:3001")
    try:
        async with httpx.AsyncClient(timeout=None) as client:
            response = await client.post(f"{AI_SERVICE_URL}{endpoint}", json=payload)
            result = response.json()
            response.raise_for_status()
            await asyncio.sleep(10)
            return result
    except (httpx.HTTPStatusError, httpx.RequestError) as e:
        print(f"AI Service Call failed: {e}")
        await asyncio.sleep(10)
        return None

# ==============================================================================
# GROUP A: Direct DB Mapping Features
# ==============================================================================

class ContentIdRequest(BaseModel):
    content_id: int

async def bg_understand(content_id: int, job_id: int | None = None):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ContentSource).where(ContentSource.id == content_id))
        content = result.scalar_one_or_none()
        if not content: return
        
        job = None
        if job_id:
            job_result = await db.execute(select(AIJobResult).where(AIJobResult.id == job_id))
            job = job_result.scalar_one_or_none()
        
        ai_res = None
        if content.raw_text:
            payload = {"title": content.title, "content": content.raw_text}
            ai_res = await call_ai_service("/api/analyze/understand", payload)
        
        if ai_res:
            if "summary" in ai_res: content.summary = ai_res["summary"]
            if "difficulty" in ai_res: content.difficulty = ai_res["difficulty"]
            if "key_concepts" in ai_res: content.key_concepts = ai_res["key_concepts"]
            if "topics" in ai_res: content.tags = ai_res["topics"]
            if "category" in ai_res: content.category = ai_res["category"]
            
            if job:
                job.status = "completed"
                job.result = ai_res
                job.source = "ai"
        else:
            content.summary = f"An analytical review of '{content.title}'. This document explains key core concepts, provides step-by-step methodologies, and walks through practical industry examples to ensure clear understanding."
            content.difficulty = "Medium"
            content.key_concepts = ["Core Theory", "Case Studies", "Methodology"]
            content.tags = ["General"]
            content.category = "General"
            
            if job:
                job.status = "completed"
                job.result = {
                    "summary": content.summary,
                    "difficulty": content.difficulty,
                    "key_concepts": content.key_concepts,
                    "topics": content.tags,
                    "category": content.category
                }
                job.source = "fallback"
                
        content.ai_processed = True
        await db.commit()

async def bg_roi(content_id: int, user_wpm: int, job_id: int | None = None):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ContentSource).where(ContentSource.id == content_id))
        content = result.scalar_one_or_none()
        if not content or not content.raw_text: return
        
        job = None
        if job_id:
            job_result = await db.execute(select(AIJobResult).where(AIJobResult.id == job_id))
            job = job_result.scalar_one_or_none()
        
        reading_time_minutes = (content.word_count / user_wpm) if content.word_count else None
        
        payload = {
            "title": content.title, 
            "content": content.raw_text, 
            "reading_time_minutes": reading_time_minutes
        }
        ai_res = await call_ai_service("/api/analyze/roi", payload)
        
        if ai_res and "roi_score" in ai_res:
            content.roi_score = ai_res["roi_score"]
            content.ai_processed = True
            if job:
                job.status = "completed"
                job.result = ai_res
                job.source = "ai"
        else:
            if job:
                job.status = "failed"
                job.result = {"error": "AI service failed or returned invalid response"}
                job.source = "ai"
        await db.commit()

async def bg_worth_reading(content_id: int, job_id: int | None = None):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ContentSource).where(ContentSource.id == content_id))
        content = result.scalar_one_or_none()
        if not content or not content.raw_text: return
        
        job = None
        if job_id:
            job_result = await db.execute(select(AIJobResult).where(AIJobResult.id == job_id))
            job = job_result.scalar_one_or_none()
        
        payload = {"title": content.title, "content": content.raw_text}
        ai_res = await call_ai_service("/api/analyze/worth-reading", payload)
        
        if ai_res:
            content.worth_reading_cache = ai_res
            content.ai_processed = True
            if job:
                job.status = "completed"
                job.result = ai_res
                job.source = "ai"
        else:
            if job:
                job.status = "failed"
                job.result = {"error": "AI service failed"}
                job.source = "ai"
        await db.commit()

@router.post("/understand")
async def understand_content(req: ContentIdRequest, bg_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    job = create_job(user.id, "understand", db)
    await db.commit()
    await db.refresh(job)
    bg_tasks.add_task(bg_understand, req.content_id, job.id)
    return {"status": "pending", "request_id": job.id}

@router.post("/roi")
async def roi_content(req: ContentIdRequest, bg_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    job = create_job(user.id, "roi", db)
    await db.commit()
    await db.refresh(job)
    wpm = user.current_wpm or user.default_wpm
    bg_tasks.add_task(bg_roi, req.content_id, wpm, job.id)
    return {"status": "pending", "request_id": job.id}

@router.post("/worth-reading")
async def worth_reading_content(req: ContentIdRequest, bg_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    job = create_job(user.id, "worth-reading", db)
    await db.commit()
    await db.refresh(job)
    bg_tasks.add_task(bg_worth_reading, req.content_id, job.id)
    return {"status": "pending", "request_id": job.id}

# ==============================================================================
# GROUP C: Background Job Wrapper & Features
# ==============================================================================

async def execute_ai_job(job_id: int, endpoint: str, payload: dict):
    async with AsyncSessionLocal() as db:
        ai_res = await call_ai_service(endpoint, payload)
        result = await db.execute(select(AIJobResult).where(AIJobResult.id == job_id))
        job = result.scalar_one_or_none()
        if not job: return
        
        if ai_res:
            job.status = "completed"
            job.result = ai_res
            job.source = "ai"
            
            # Post-processing to persist Step 4 outputs to DB
            if endpoint == "/api/backlog/decay" and "decay_results" in ai_res:
                for item in ai_res["decay_results"]:
                    lib_item_id = item.get("article_id")
                    if lib_item_id:
                        li_res = await db.execute(
                            select(LibraryItem).where(LibraryItem.id == int(lib_item_id))
                        )
                        lib_item = li_res.scalar_one_or_none()
                        if lib_item:
                            rem_val = item.get("remaining_value_percent", 100)
                            lib_item.decay_percent = float(100 - rem_val)
                            
                            # Also write time_sensitivity to ContentSource
                            cs_res = await db.execute(
                                select(ContentSource).where(ContentSource.id == lib_item.content_id)
                            )
                            content = cs_res.scalar_one_or_none()
                            if content:
                                content.time_sensitivity = item.get("time_sensitivity")
        else:
            job.status = "failed"
            # Only produce a structured fallback for the learning-path endpoint
            if endpoint == "/api/personalization/learning-path":
                job.status = "completed"
                job.result = {
                    "curriculum": [
                        {
                            "phase": "Phase 1: Foundations",
                            "description": f"Initial concepts and core definitions related to the goal: '{payload.get('topic', 'Topic')}'",
                            "resources": [a["title"] for a in payload.get("articles", [])[:2]] if payload.get("articles") else ["Introductory Reading"]
                        },
                        {
                            "phase": "Phase 2: Deep Dive",
                            "description": "Exploration of methods, challenges, and implementation techniques.",
                            "resources": [a["title"] for a in payload.get("articles", [])[2:4]] if len(payload.get("articles", [])) > 2 else ["Intermediate Materials"]
                        },
                        {
                            "phase": "Phase 3: Final Project",
                            "description": "Integration of concepts, practical application, and performance tuning.",
                            "resources": [a["title"] for a in payload.get("articles", [])[4:]] if len(payload.get("articles", [])) > 4 else ["Advanced Frameworks"]
                        }
                    ]
                }
                job.source = "fallback"
            else:
                job.result = {"error": "AI service call failed or input was empty", "endpoint": endpoint}
                job.source = "failed"
        await db.commit()

def create_job(user_id: int, feature_type: str, db: AsyncSession) -> AIJobResult:
    job = AIJobResult(
        user_id=user_id,
        feature_type=feature_type,
        status="pending",
        source="ai"
    )
    db.add(job)
    return job

class TopicRequest(BaseModel):
    topic: str

@router.post("/learning-path")
async def learning_path(req: TopicRequest, bg_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    job = create_job(user.id, "learning-path", db)
    await db.commit()
    await db.refresh(job)
    
    query = """
        SELECT 
            li.id, 
            cs.title, 
            cs.difficulty,
            cs.tags as topics
        FROM library_items li
        JOIN content_sources cs ON li.content_id = cs.id
        WHERE li.user_id = :user_id
    """
    result = await db.execute(text(query), {"user_id": user.id})
    articles = [dict(row._mapping) for row in result]
    
    # Ensure topics is always a list
    for article in articles:
        if not article.get("topics"):
            article["topics"] = []
            
    payload = {"topic": req.topic, "articles": articles}
    bg_tasks.add_task(execute_ai_job, job.id, "/api/personalization/learning-path", payload)
    return {"status": "pending", "request_id": job.id}

@router.post("/heatmap")
async def heatmap(bg_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    job = create_job(user.id, "heatmap", db)
    await db.commit()
    await db.refresh(job)
    
    # Query updated to read cs.tags directly
    query = """
        SELECT 
            li.id, 
            li.is_finished, 
            COALESCE(MAX(rs.started_at), li.added_at) as date,
            cs.tags as genres
        FROM library_items li
        JOIN content_sources cs ON li.content_id = cs.id
        LEFT JOIN reading_sessions rs ON li.id = rs.library_item_id
        WHERE li.user_id = :user_id
        GROUP BY li.id, li.is_finished, li.added_at, cs.tags
    """
    result = await db.execute(text(query), {"user_id": user.id})
    history = []
    for row in result:
        d = dict(row._mapping)
        if not d.get("genres"):
            d["genres"] = []
        if d.get("date"):
            d["date"] = d["date"].isoformat()
        history.append(d)
        
    payload = {"reading_history": history}
    bg_tasks.add_task(execute_ai_job, job.id, "/api/personalization/heatmap", payload)
    return {"status": "pending", "request_id": job.id}

@router.post("/predict-read")
async def predict_read(req: ContentIdRequest, bg_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    job = create_job(user.id, "predict-read", db)
    
    article_res = await db.execute(
        select(ContentSource).where(ContentSource.id == req.content_id)
    )
    article = article_res.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
        
    await db.commit()
    await db.refresh(job)
    
    stats_query = """
        SELECT 
            (SELECT count(*) FROM library_items WHERE user_id = :user_id AND is_finished = False) as total_unread,
            (SELECT COALESCE(count(CASE WHEN is_finished = True THEN 1 END)::float / nullif(count(*), 0), 0.0) FROM library_items WHERE user_id = :user_id) as avg_completion_rate,
            (SELECT COALESCE(avg(duration_sec), 0.0) FROM reading_sessions rs JOIN library_items li ON rs.library_item_id = li.id WHERE li.user_id = :user_id) as avg_reading_time
    """
    stats_res = await db.execute(text(stats_query), {"user_id": user.id})
    stats_row = dict(stats_res.fetchone()._mapping)
    
    topics_res = await db.execute(
        select(UserGenrePreference.genre).where(UserGenrePreference.user_id == user.id)
    )
    preferred_topics = [row[0] for row in topics_res]
    
    user_stats = {
        "total_unread": stats_row["total_unread"],
        "avg_completion_rate": stats_row["avg_completion_rate"],
        "avg_reading_time": stats_row["avg_reading_time"],
        "preferred_topics": preferred_topics
    }
    user_stats["avg_reading_time"] = float(user_stats["avg_reading_time"])
    payload = {
        "article": {"title": article.title, "content": article.raw_text},
        "user_stats": user_stats
    }
    bg_tasks.add_task(execute_ai_job, job.id, "/api/analyze/predict-read", payload)
    return {"status": "pending", "request_id": job.id}

@router.post("/recommendations")
async def recommendations(bg_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    job = create_job(user.id, "recommendations", db)
    await db.commit()
    await db.refresh(job)
    
    # Build user interests from explicit preferences + tags on finished articles
    interests_query = """
        SELECT ugp.genre, 1.0 as score
        FROM user_genre_preferences ugp
        WHERE ugp.user_id = :user_id
    """
    interests_res = await db.execute(text(interests_query), {"user_id": user.id})
    user_interests = {row[0]: float(row[1]) for row in interests_res}
    
    recent_query = """
        SELECT cs.title FROM library_items li 
        JOIN content_sources cs ON li.content_id = cs.id
        WHERE li.user_id = :user_id AND li.is_finished = True
        ORDER BY li.finished_at DESC LIMIT 10
    """
    recent_res = await db.execute(text(recent_query), {"user_id": user.id})
    recently_read = [row[0] for row in recent_res]
    
    unread_query = """
        SELECT cs.title, cs.raw_text as content FROM library_items li 
        JOIN content_sources cs ON li.content_id = cs.id
        WHERE li.user_id = :user_id AND li.is_finished = False
    """
    unread_res = await db.execute(text(unread_query), {"user_id": user.id})
    unread_articles = [dict(row._mapping) for row in unread_res]
    
    payload = {
        "user_interests": user_interests,
        "recently_read": recently_read,
        "unread_articles": unread_articles
    }
    bg_tasks.add_task(execute_ai_job, job.id, "/api/personalization/recommendations", payload)
    return {"status": "pending", "request_id": job.id}

@router.post("/decay")
async def decay(bg_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    job = create_job(user.id, "decay", db)
    await db.commit()
    await db.refresh(job)
    
    query = """
        SELECT li.id, cs.title, li.added_at as saved_at, cs.tags as topics, cs.raw_text
        FROM library_items li
        JOIN content_sources cs ON li.content_id = cs.id
        WHERE li.user_id = :user_id AND li.is_finished = False
    """
    res = await db.execute(text(query), {"user_id": user.id})
    articles = []
    for row in res:
        d = dict(row._mapping)
        if not d.get("topics"): d["topics"] = []
        if d["saved_at"]: d["saved_at"] = d["saved_at"].isoformat()
        raw_text = d.pop("raw_text") or ""
        d["content_snippet"] = raw_text[:200]
        articles.append(d)
        
    payload = {"articles": articles}
    bg_tasks.add_task(execute_ai_job, job.id, "/api/backlog/decay", payload)
    return {"status": "pending", "request_id": job.id}

class GuiltRequest(BaseModel):
    threshold_days: int = 90

@router.post("/guilt")
async def guilt(req: GuiltRequest, bg_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    job = create_job(user.id, "guilt", db)
    await db.commit()
    await db.refresh(job)
    
    from datetime import timedelta
    threshold_date = datetime.now(timezone.utc) - timedelta(days=req.threshold_days)
    
    untouched_res = await db.execute(text("""
        SELECT li.id, cs.title, li.added_at 
        FROM library_items li JOIN content_sources cs ON li.content_id = cs.id
        WHERE li.user_id = :user_id AND li.is_finished = False 
        AND li.added_at < :threshold
    """), {"user_id": user.id, "threshold": threshold_date})
    
    articles = []
    for row in untouched_res:
        d = dict(row._mapping)
        if d["added_at"]: d["added_at"] = d["added_at"].isoformat()
        articles.append(d)
        
    # Build user patterns from tags on unfinished articles vs preferences
    pattern_query = """
        SELECT ugp.genre
        FROM user_genre_preferences ugp
        WHERE ugp.user_id = :user_id
    """
    pattern_res = await db.execute(text(pattern_query), {"user_id": user.id})
    user_patterns = {row[0]: "preferred topic" for row in pattern_res}
    
    payload = {
        "articles": articles,
        "threshold_days": req.threshold_days,
        "user_patterns": user_patterns
    }
    bg_tasks.add_task(execute_ai_job, job.id, "/api/backlog/guilt", payload)
    return {"status": "pending", "request_id": job.id}

class BankruptcyRequest(BaseModel):
    keep_percent: int = 20

@router.post("/bankruptcy")
async def bankruptcy(req: BankruptcyRequest, bg_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    job = create_job(user.id, "bankruptcy", db)
    await db.commit()
    await db.refresh(job)
    
    query = """
        SELECT li.id, cs.title, cs.roi_score, li.decay_percent, cs.tags as topics
        FROM library_items li
        JOIN content_sources cs ON li.content_id = cs.id
        WHERE li.user_id = :user_id AND li.is_finished = False
    """
    res = await db.execute(text(query), {"user_id": user.id})
    
    articles = []
    for row in res:
        d = dict(row._mapping)
        if not d.get("topics"): d["topics"] = []
        d["decay_percent"] = round(d.get("decay_percent") or 0.0, 2)
        articles.append(d)
        
    payload = {"articles": articles, "keep_percent": req.keep_percent}
    bg_tasks.add_task(execute_ai_job, job.id, "/api/backlog/bankruptcy", payload)
    return {"status": "pending", "request_id": job.id}

class OptimizeRequest(BaseModel):
    available_minutes: int = 60

@router.post("/queue/optimize")
async def queue_optimize(req: OptimizeRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Greedy knapsack queue optimizer — algorithmic, no AI call needed."""
    query = """
        SELECT li.id, cs.title, cs.roi_score, li.decay_percent, cs.tags as topics,
               (cs.word_count::float / NULLIF(:wpm, 0)) as reading_time_minutes
        FROM library_items li
        JOIN content_sources cs ON li.content_id = cs.id
        WHERE li.user_id = :user_id AND li.is_finished = False
        ORDER BY cs.roi_score DESC NULLS LAST
    """
    wpm = user.current_wpm or user.default_wpm or 200
    res = await db.execute(text(query), {"user_id": user.id, "wpm": wpm})
    
    preferred_topics_res = await db.execute(
        select(UserGenrePreference.genre).where(UserGenrePreference.user_id == user.id)
    )
    preferred_topics = [r[0] for r in preferred_topics_res]
    
    articles = []
    for row in res:
        d = dict(row._mapping)
        if not d.get("topics"): d["topics"] = []
        d["roi_score"] = d.get("roi_score") or 5.0
        d["decay_percent"] = d.get("decay_percent") or 0.0
        d["reading_time_minutes"] = round(d.get("reading_time_minutes") or 5.0, 2)
        articles.append(d)
    
    # Greedy knapsack: score = roi * topic_boost * (1 - decay/100)
    for a in articles:
        topic_boost = 1.2 if any(t in preferred_topics for t in a["topics"]) else 1.0
        a["_score"] = a["roi_score"] * topic_boost * (1 - a["decay_percent"] / 100)
    
    articles.sort(key=lambda x: x["_score"], reverse=True)
    
    queue = []
    skipped = []
    remaining = float(req.available_minutes)
    
    for a in articles:
        t = a["reading_time_minutes"]
        if t <= remaining:
            reason = "High value read"
            if a["decay_percent"] > 70: reason = "Read now before it decays completely"
            elif a["_score"] > 8: reason = "Highest ROI in your backlog"
            elif t <= 5: reason = "Quick, high-value read"
            queue.append({"id": a["id"], "title": a["title"], "reading_time_minutes": t, "reason": reason})
            remaining -= t
        else:
            skipped.append({"id": a["id"], "reason": f"Doesn't fit remaining time ({t}m > {remaining}m)"})
    
    return {
        "queue": queue,
        "total_minutes": req.available_minutes - remaining,
        "skipped": skipped
    }

@router.post("/graveyard")
async def graveyard(bg_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    job = create_job(user.id, "graveyard", db)
    await db.commit()
    await db.refresh(job)
    
    query = """
        SELECT li.id, li.is_archived, li.is_finished, cs.title 
        FROM library_items li
        JOIN content_sources cs ON li.content_id = cs.id
        WHERE li.user_id = :user_id AND (li.is_archived = True OR li.is_finished = True)
    """
    res = await db.execute(text(query), {"user_id": user.id})
    
    archived = []
    completed = []
    for row in res:
        d = dict(row._mapping)
        item = {"id": d["id"], "title": d["title"]}
        if d["is_archived"]: archived.append(item)
        if d["is_finished"]: completed.append(item)
        
    payload = {"archived_articles": archived, "completed_articles": completed}
    bg_tasks.add_task(execute_ai_job, job.id, "/api/backlog/graveyard", payload)
    return {"status": "pending", "request_id": job.id}

@router.get("/jobs/{id}")
async def get_ai_job(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from schemas import AIJobResultResponse
    result = await db.execute(
        select(AIJobResult).where(AIJobResult.id == id, AIJobResult.user_id == current_user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
