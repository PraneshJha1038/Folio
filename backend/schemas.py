from pydantic import BaseModel, ConfigDict, EmailStr, HttpUrl, field_validator
from typing import List, Optional, Any
from datetime import datetime
import re

from models import GENRE_CHECK_SQL

# Dynamically extract genres from the SQL constraint to ensure a single source of truth
VALID_GENRES = set(re.findall(r"'([^']+)'", GENRE_CHECK_SQL))

def validate_genres_list(genres: List[str]) -> List[str]:
    for g in genres:
        if g not in VALID_GENRES:
            raise ValueError(f"Invalid genre: '{g}'. Must be one of the supported genres.")
    return genres

def validate_single_genre(genre: str) -> str:
    if genre not in VALID_GENRES:
        raise ValueError(f"Invalid genre: '{genre}'. Must be one of the supported genres.")
    return genre

# --- Auth Schemas ---

class SendOtpRequest(BaseModel):
    name: Optional[str] = None
    email: EmailStr
    password: str

class VerifyOtpRequest(BaseModel):
    name: Optional[str] = None
    email: EmailStr
    password: str
    otp: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserResponse(BaseModel):
    id: int
    email: str
    display_name: Optional[str] = None
    current_wpm: Optional[int] = None
    default_wpm: int
    model_config = ConfigDict(from_attributes=True)

# --- Content Schemas ---

class ContentSourceBase(BaseModel):
    type: str
    title: str
    author: Optional[str] = None
    visibility: str = "local"
    word_count: Optional[int] = None

class ContentSourceResponse(ContentSourceBase):
    id: int
    owner_id: int
    source_url: Optional[str] = None
    file_path: Optional[str] = None
    cover_image_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class URLContentRequest(BaseModel):
    url: HttpUrl
    visibility: str = "local"
    genres: List[str] = []

    @field_validator('genres')
    @classmethod
    def check_genres(cls, v):
        return validate_genres_list(v)

class UploadContentResponse(BaseModel):
    status: str
    content_id: int

# --- Library Schemas ---

class LibraryItemResponse(BaseModel):
    id: int
    user_id: int
    content_id: int
    added_at: datetime
    last_opened_at: Optional[datetime] = None
    current_position: Optional[str] = None
    is_finished: bool
    finished_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class AddLibraryItemRequest(BaseModel):
    content_id: int

class UpdateVisibilityRequest(BaseModel):
    visibility: str

    @field_validator('visibility')
    @classmethod
    def check_visibility(cls, v):
        if v not in ('local', 'global'):
            raise ValueError("Visibility must be 'local' or 'global'")
        return v

class ShelfCreateRequest(BaseModel):
    name: str

class ShelfResponse(BaseModel):
    id: int
    name: str
    sort_order: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# --- Reading Schemas ---

class ReadingSessionRequest(BaseModel):
    library_item_id: int
    duration_sec: int
    words_covered: int
    progress_pct: float
    started_at: datetime
    ended_at: datetime

    @field_validator('progress_pct')
    @classmethod
    def check_progress(cls, v):
        if not (0.0 <= v <= 100.0):
            raise ValueError("Progress percentage must be between 0 and 100")
        return v

class BookmarkHighlightRequest(BaseModel):
    library_item_id: int
    type: str
    position: str
    highlighted_text: Optional[str] = None
    note: Optional[str] = None

    @field_validator('type')
    @classmethod
    def check_type(cls, v):
        if v not in ('bookmark', 'highlight'):
            raise ValueError("Type must be 'bookmark' or 'highlight'")
        return v

# --- Suggestions Schemas ---

class TimeBudgetRequest(BaseModel):
    time_minutes: int

class SuggestionResponse(BaseModel):
    status: str
    message: str
