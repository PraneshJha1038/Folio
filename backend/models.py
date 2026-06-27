from sqlalchemy import (
    String, Integer, Text, Boolean, TIMESTAMP, Float, ForeignKey,
    CheckConstraint, Index, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from database import Base
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles

@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"

GENRES = [
    'Action & Adventure', 'Academic Paper', 'Agriculture', 'Anthropology', 
    'Archaeology', 'Architecture', 'Art & Photography', 'Astronomy', 
    'Biography & Memoir', 'Biology', 'Business & Finance', 'Chemistry', 
    'Childrens Literature', 'Classics', 'Crafts & Hobbies', 'Current Affairs', 
    'Cybersecurity', 'Drama & Plays', 'Dystopian', 'Earth Sciences', 
    'Economics', 'Education', 'Engineering', 'Environment & Ecology', 
    'Epic Fantasy', 'Essays & Anthologies', 'Fashion & Beauty', 'Fiction', 
    'General Knowledge', 'Geography', 'Graphic Novels & Manga', 'Health & Wellness', 
    'Historical Fiction', 'History', 'Horror', 'Humor & Comedy', 
    'Interviews & Profiles', 'Investigative Journalism', 'Law & Jurisprudence', 
    'Linguistics', 'Literary Fiction', 'Magical Realism', 'Mathematics', 
    'Medical Sciences', 'Metaphysics', 'Military & Warfare', 'Music & Performing Arts', 
    'Mystery & Crime', 'Mythology & Folklore', 'Nature & Wildlife', 'News Reporting', 
    'Non-Fiction', 'Opinion & Editorial', 'Parenting & Family', 'Philosophy', 
    'Physics', 'Poetry', 'Political Science', 'Psychology', 'Public Policy', 
    'Reference & Dictionaries', 'Religion & Spirituality', 'Romance', 'Satire', 
    'Science Fiction', 'Self-Help', 'Sociology', 'Sports & Recreation', 
    'Technology & Computing', 'Thriller & Suspense', 'Travel & Tourism', 
    'True Crime', 'Utopian Fiction', 'Westerns', 'Young Adult'
]

GENRE_CHECK_SQL = f"genre IN ({', '.join(f"'{g}'" for g in GENRES)})"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str | None] = mapped_column(String(100))
    default_wpm: Mapped[int] = mapped_column(Integer, default=200)
    current_wpm: Mapped[int | None] = mapped_column(Integer)
    reading_sessions_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

class ContentSource(Base):
    __tablename__ = "content_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(10))
    title: Mapped[str] = mapped_column(String(500))
    author: Mapped[str | None] = mapped_column(String(255))  
    source_url: Mapped[str | None] = mapped_column(Text)
    file_path: Mapped[str | None] = mapped_column(Text)
    raw_text: Mapped[str | None] = mapped_column(Text)
    cover_image_url: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(50))
    difficulty: Mapped[str | None] = mapped_column(String(10))
    key_concepts: Mapped[list | None] = mapped_column(JSONB)
    roi_score: Mapped[float | None] = mapped_column(Float)
    worth_reading_cache: Mapped[dict | None] = mapped_column(JSONB)
    time_sensitivity: Mapped[str | None] = mapped_column(String(20))
    ai_processed: Mapped[bool] = mapped_column(Boolean, default=False)
    word_count: Mapped[int | None] = mapped_column(Integer)
    visibility: Mapped[str] = mapped_column(String(10), default="local")
    created_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "difficulty IS NULL OR difficulty IN ('Easy', 'Medium', 'Hard')",
            name="check_difficulty"
        ),
        CheckConstraint(
            "roi_score IS NULL OR (roi_score >= 0 AND roi_score <= 10)",
            name="check_roi_score"
        ),
        CheckConstraint(
            "time_sensitivity IS NULL OR time_sensitivity IN ('Evergreen', 'Standard', 'Time-Sensitive')",
            name="check_time_sensitivity"
        ),
        CheckConstraint("type IN ('article', 'pdf', 'epub')", name="check_content_type"),
        CheckConstraint("visibility IN ('local', 'global')", name="check_visibility"),
        CheckConstraint("source_url IS NOT NULL OR file_path IS NOT NULL", name="chk_has_source"),
        Index("idx_content_sources_owner", "owner_id"),
        Index("idx_content_sources_global", "id", postgresql_where="visibility = 'global'"),
    )

class ContentGenre(Base):
    __tablename__ = "content_genres"
    content_id: Mapped[int] = mapped_column(
        ForeignKey("content_sources.id", ondelete="CASCADE"), primary_key=True
    )
    genre: Mapped[str] = mapped_column(String(50), primary_key=True)

    __table_args__ = (
        CheckConstraint(GENRE_CHECK_SQL, name="content_genres_genre_check"),
        Index("idx_content_genres_genre", "genre"),
    )


# ---------------------------------------------------------------------------
# 4. user_genre_preferences
# ---------------------------------------------------------------------------
class UserGenrePreference(Base):
    __tablename__ = "user_genre_preferences"
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    genre: Mapped[str] = mapped_column(String(50), primary_key=True)
    created_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(GENRE_CHECK_SQL, name="user_genre_preferences_genre_check"),
    )

class Shelf(Base):
    __tablename__ = "shelves"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    __table_args__ = (
        Index("idx_shelves_user", "user_id"),
    )

class LibraryItem(Base):
    __tablename__ = "library_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    content_id: Mapped[int] = mapped_column(ForeignKey("content_sources.id", ondelete="CASCADE"))
    added_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    last_opened_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))
    current_position: Mapped[str | None] = mapped_column(String(255))
    is_finished: Mapped[bool] = mapped_column(Boolean, default=False)
    finished_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    archived_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))
    
    content_source: Mapped["ContentSource"] = relationship("ContentSource")
    __table_args__ = (
        UniqueConstraint("user_id", "content_id", name="uq_user_content"),
        Index("idx_library_items_content", "content_id"),
        Index("idx_library_items_user", "user_id"),
    )

class ShelfItem(Base):
    __tablename__ = "shelf_items"
    shelf_id: Mapped[int] = mapped_column(
        ForeignKey("shelves.id", ondelete="CASCADE"), primary_key=True
    )
    library_item_id: Mapped[int] = mapped_column(
        ForeignKey("library_items.id", ondelete="CASCADE"), primary_key=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    added_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())


class ReadingSession(Base):
    __tablename__ = "reading_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    library_item_id: Mapped[int] = mapped_column(ForeignKey("library_items.id", ondelete="CASCADE"))
    started_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    ended_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))
    duration_sec: Mapped[int | None] = mapped_column(Integer)
    words_covered: Mapped[int | None] = mapped_column(Integer)
    progress_pct: Mapped[float | None] = mapped_column(Float)

    __table_args__ = (
        CheckConstraint("progress_pct >= 0 AND progress_pct <= 100", name="check_progress_pct"),
        Index("idx_reading_sessions_library_item", "library_item_id"),
        Index("idx_reading_sessions_started_at", "started_at"),
    )

class BookmarkHighlight(Base):
    __tablename__ = "bookmarks_highlights"

    id: Mapped[int] = mapped_column(primary_key=True)
    library_item_id: Mapped[int] = mapped_column(ForeignKey("library_items.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(10))
    position: Mapped[str] = mapped_column(String(255))
    highlighted_text: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("type IN ('bookmark', 'highlight')", name="check_bookmark_type"),
        Index("idx_bookmarks_highlights_library_item", "library_item_id"),
    )

class ContentReport(Base):
    __tablename__ = "content_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    content_id: Mapped[int] = mapped_column(ForeignKey("content_sources.id", ondelete="CASCADE"))
    reported_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default="open")
    created_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    __table_args__ = (
        CheckConstraint("status IN ('open', 'reviewed')", name="check_status"),
        Index("idx_content_reports_content", "content_id"),
    )

class PendingOtp(Base):
    __tablename__ = "pending_otps"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    otp_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True))
    created_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())



class SuggestionRequest(Base):
    __tablename__ = "suggestion_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    time_budget_minutes: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10), default="pending")
    result: Mapped[dict | None] = mapped_column(JSONB)  # [{library_item_id, score, reason}, ...]
    created_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    completed_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'completed', 'failed')", name="check_suggestion_status"),
    )

class AIJobResult(Base):
    __tablename__ = "ai_job_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    feature_type: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    result: Mapped[dict | list | None] = mapped_column(JSONB)
    source: Mapped[str] = mapped_column(String(20)) # 'ai' or 'fallback'
    created_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'completed', 'failed')", name="check_ai_job_status"),
        Index("idx_ai_job_results_user_feature", "user_id", "feature_type"),
    )