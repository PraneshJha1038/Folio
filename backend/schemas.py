from pydantic import BaseModel, Field, field_validator, EmailStr, model_validator, ConfigDict
from enum import Enum
from datetime import datetime
from models import GENRES

# Enums
class ContentType(str, Enum):
    article = "article"
    pdf = "pdf"
    epub = "epub"

class Visibility(str, Enum):
    local = "local"
    global_ = "global"  # global is a keyword in Python, so using global_ but mapped to value "global"
    
    @classmethod
    def _missing_(cls, value):
        if value == "global":
            return cls.global_
        return super()._missing_(value)

    # Use value serialization for Pydantic/fastapi response
    def __str__(self):
        return self.value

class BookmarkType(str, Enum):
    bookmark = "bookmark"
    highlight = "highlight"
    underline = "underline"
    strikethrough = "strikethrough"

class ReportStatus(str, Enum):
    open = "open"
    reviewed = "reviewed"

class SuggestionStatus(str, Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"

# 1. User schemas
class UserCreate(BaseModel):
    display_name: str
    email: EmailStr
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def check_password(cls, password: str) -> str:
        special_characters = "!@#$%^&*()-_:'?/><.,~`"
        has_special_character = any(char in special_characters for char in password)
        has_upper_case = any(char.isupper() for char in password)
        
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not has_special_character:
            raise ValueError("Password must contain at least one special character")
        if not has_upper_case:
            raise ValueError("Password must contain at least one uppercase letter")
        return password

class UserResponse(BaseModel):
    id: int
    display_name: str | None
    email: EmailStr
    default_wpm: int
    current_wpm: int | None
    reading_sessions_count: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UserUpdate(BaseModel):
    display_name: str | None = None
    email: EmailStr | None = None
    default_wpm: int | None = None
    current_wpm: int | None = None

# 2. ContentSource schemas
class ContentSourceCreate(BaseModel):
    type: ContentType
    title: str = Field(max_length=500)
    author: str | None = Field(default=None, max_length=255)
    source_url: str | None = None
    file_path: str | None = None
    visibility: Visibility = Visibility.local

    @model_validator(mode="after")
    def check_has_source(self) -> "ContentSourceCreate":
        file_path = self.file_path
        source_url = self.source_url
        if not file_path and not source_url:
            raise ValueError("Either file_path or source_url is required")
        if file_path and source_url:
            raise ValueError("Provide only one of file_path or source_url, not both")
        return self

class ContentSourceResponse(BaseModel):
    id: int
    owner_id: int
    type: ContentType
    title: str
    author: str | None
    source_url: str | None
    file_path: str | None
    raw_text: str | None
    cover_image_url: str | None
    word_count: int | None
    visibility: Visibility
    summary: str | None = None
    category: str | None = None
    difficulty: str | None = None
    key_concepts: list | None = None
    roi_score: float | None = None
    worth_reading_cache: dict | None = None
    time_sensitivity: str | None = None
    ai_processed: bool = False
    publisher: str | None = None
    language: str | None = None
    page_count: int | None = None
    isbn: str | None = None
    description: str | None = None
    tags: list | None = None
    series: str | None = None
    file_size_bytes: int | None = None
    format: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ContentSourceUpdate(BaseModel):
    title: str | None = None
    author: str | None = None
    cover_image_url: str | None = None
    visibility: Visibility | None = None
    description: str | None = None
    tags: list | None = None
    category: str | None = None
    publisher: str | None = None
    language: str | None = None
    page_count: int | None = None
    isbn: str | None = None
    series: str | None = None
    format: str | None = None

# 3. ContentGenre schemas
class ContentGenreCreate(BaseModel):
    genre: str

    @field_validator("genre")
    @classmethod
    def check_genre(cls, v: str) -> str:
        if v not in GENRES:
            raise ValueError(f"Invalid genre. Must be one of: {', '.join(GENRES)}")
        return v

class ContentGenreResponse(BaseModel):
    content_id: int
    genre: str

    model_config = ConfigDict(from_attributes=True)

# 4. UserGenrePreference schemas
class UserGenrePreferenceCreate(BaseModel):
    genre: str

    @field_validator("genre")
    @classmethod
    def check_genre(cls, v: str) -> str:
        if v not in GENRES:
            raise ValueError(f"Invalid genre. Must be one of: {', '.join(GENRES)}")
        return v

class UserGenrePreferenceResponse(BaseModel):
    user_id: int
    genre: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# 5. Shelf schemas
class ShelfCreate(BaseModel):
    name: str = Field(max_length=100)
    sort_order: int = 0

class ShelfResponse(BaseModel):
    id: int
    user_id: int
    name: str
    sort_order: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ShelfUpdate(BaseModel):
    name: str | None = None
    sort_order: int | None = None

# 6. LibraryItem schemas
class LibraryItemCreate(BaseModel):
    content_id: int

class LibraryItemResponse(BaseModel):
    id: int
    user_id: int
    content_id: int
    added_at: datetime
    last_opened_at: datetime | None
    current_position: str | None
    is_finished: bool
    finished_at: datetime | None
    is_favorite: bool = False
    progress_percent: float | None = 0.0
    content_source: ContentSourceResponse | None = None

    model_config = ConfigDict(from_attributes=True)

class LibraryItemUpdate(BaseModel):
    current_position: str | None = None
    is_finished: bool | None = None
    is_favorite: bool | None = None

# 7. ShelfItem schemas
class ShelfItemCreate(BaseModel):
    library_item_id: int
    sort_order: int = 0

class ShelfItemResponse(BaseModel):
    shelf_id: int
    library_item_id: int
    sort_order: int
    added_at: datetime

    model_config = ConfigDict(from_attributes=True)

# 8. ReadingSession schemas
class ReadingSessionCreate(BaseModel):
    library_item_id: int
    duration_sec: int = Field(gt=0)
    words_covered: int = Field(gt=0)
    progress_pct: float = Field(ge=0, le=100)

class ReadingSessionResponse(BaseModel):
    id: int
    library_item_id: int
    started_at: datetime
    ended_at: datetime | None
    duration_sec: int | None
    words_covered: int | None
    progress_pct: float | None

    model_config = ConfigDict(from_attributes=True)

# 9. BookmarkHighlight schemas
class BookmarkHighlightCreate(BaseModel):
    type: BookmarkType
    position: str = Field(max_length=255)
    highlighted_text: str | None = None
    note: str | None = None
    label: str | None = None
    color: str | None = "yellow"

class BookmarkHighlightResponse(BaseModel):
    id: int
    library_item_id: int
    type: BookmarkType
    position: str
    highlighted_text: str | None
    note: str | None
    label: str | None
    color: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# 10. ContentReport schemas
class ContentReportCreate(BaseModel):
    reason: str

class ContentReportResponse(BaseModel):
    id: int
    content_id: int
    reported_by: int
    reason: str
    status: ReportStatus
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

# 11. SuggestionRequest schemas
class SuggestionRequestCreate(BaseModel):
    time_budget_minutes: int = Field(gt=0)

class SuggestionRequestResponse(BaseModel):
    id: int
    user_id: int
    time_budget_minutes: int
    status: SuggestionStatus
    result: list | dict | None
    created_at: datetime
    completed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)

class AIJobStatus(str, Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"

class AIJobResultResponse(BaseModel):
    id: int
    user_id: int
    feature_type: str
    status: AIJobStatus
    result: list | dict | None = None
    source: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)