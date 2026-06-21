from pydantic import BaseModel, Field, field_validator, EmailStr, model_validator
from fastapi import HTTPException
from enum import Enum
from datetime import datetime

GENRE_CHECK_SQL = [
    "'Action & Adventure', 'Academic Paper', 'Agriculture', 'Anthropology', "
    "'Archaeology', 'Architecture', 'Art & Photography', 'Astronomy', "
    "'Biography & Memoir', 'Biology', 'Business & Finance', 'Chemistry', "
    "'Childrens Literature', 'Classics', 'Crafts & Hobbies', 'Current Affairs', "
    "'Cybersecurity', 'Drama & Plays', 'Dystopian', 'Earth Sciences', "
    "'Economics', 'Education', 'Engineering', 'Environment & Ecology', "
    "'Epic Fantasy', 'Essays & Anthologies', 'Fashion & Beauty', 'Fiction', "
    "'General Knowledge', 'Geography', 'Graphic Novels & Manga', 'Health & Wellness', "
    "'Historical Fiction', 'History', 'Horror', 'Humor & Comedy', "
    "'Interviews & Profiles', 'Investigative Journalism', 'Law & Jurisprudence', "
    "'Linguistics', 'Literary Fiction', 'Magical Realism', 'Mathematics', "
    "'Medical Sciences', 'Metaphysics', 'Military & Warfare', 'Music & Performing Arts', "
    "'Mystery & Crime', 'Mythology & Folklore', 'Nature & Wildlife', 'News Reporting', "
    "'Non-Fiction', 'Opinion & Editorial', 'Parenting & Family', 'Philosophy', "
    "'Physics', 'Poetry', 'Political Science', 'Psychology', 'Public Policy', "
    "'Reference & Dictionaries', 'Religion & Spirituality', 'Romance', 'Satire', "
    "'Science Fiction', 'Self-Help', 'Sociology', 'Sports & Recreation', "
    "'Technology & Computing', 'Thriller & Suspense', 'Travel & Tourism', "
    "'True Crime', 'Utopian Fiction', 'Westerns', 'Young Adult'"
]


class UserCreate(BaseModel):
    display_name: str 
    email: EmailStr 
    password: str = Field(min_length=8)
    @field_validator("password")
    @classmethod
    def check_password(cls, password):
        special_characters: str = "!@#$%^&*()-_:'?/><.,~`"
        has_special_character: bool = False
        has_upper_case: bool = False
        for character in password:
            if character in special_characters:
                has_special_character = True
            elif character.isupper():
                has_upper_case = True
        if not has_special_character:
            raise ValueError("Password must contain at least one special character")
        if not has_upper_case:
            raise ValueError("Password must contain at least one uppercase letter")
        if len(password) < 8: 
            raise ValueError("Password must be at least 8 characters long")
        return password

class UserResponse(BaseModel):
    id: int
    display_name: str
    default_wpm: int 
    current_wpm: int | None = None
    reading_sesion_count: int | None = None
    created_at : datetime

class UserUpdate(BaseModel):
    display_name: str | None 
    email: EmailStr | None


class ValidTypes(str, Enum):
    article = "article"
    pdf = "pdf"
    epub = "epub"

class ContentSourceCreate(BaseModel):
    type: str 
    @field_validator("type")
    @classmethod
    def check_valid_type(cls, type: str) -> str:
        try:
            ValidTypes(type)
        except ValueError:
            valid_values = ", ".join(item.value for item in ValidTypes)
            raise ValueError(f"Invalid type: {type}. Must be one of: {valid_values}")
        return type
    title: str  
    author: str | None = None
    visibility: str | None = 'local'
    file_path: str |None = None
    source_url: str|None = None
    @model_validator(mode="after")
    def check_has_source(self):
        if not (self.file_path or self.source_url):
            raise ValueError("Either file_path or source_url is required")
        if self.file_path and self.source_url:
            raise ValueError("Provide only one of file_path or source_url, not both")
        return self

class ContentSourceResponse(BaseModel):
    id: int 
    owner_id: int 
    type: str 
    title: str
    author: str|None
    cover_image_url: str | None
    word_count: int
    visibility: str | None = "local"
    @field_validator("visibility")
    @classmethod
    def check_valid_visibility(cls, visibility):
        if visibility not in ['local', 'global']:
            raise ValueError("VIsibility can either be local or global")
        return visibility
    created_at: datetime
    updated_at: datetime

class ContentSourceUpdate(BaseModel):
    title: str | None = None
    cover_image_url : str | None = None
    visibility: str | None = None
    @field_validator("visibility")
    @classmethod
    def check_valid_visibility(cls, visibility):
        if visibility not in ['local', 'global']:
            raise ValueError("VIsibility can either be local or global")
    updated_at: datetime 

class ContentGenresCreate(BaseModel):
    genre: str | None =  None
    @model_validator(mode="after")
    def isValidGenre(self):
        if self.genre not in GENRE_CHECK_SQL:
            raise ValueError(f"Enter a valid genre. Genre must be a child of {GENRE_CHECK_SQL}")
        return self


class ContentGenresResponse(BaseModel):
    genre: str | None = None
    @model_validator(mode="after")
    def isValidGenre(self):
        if self.genre not in GENRE_CHECK_SQL:
            raise ValueError(f"Enter a valid genre. Genre must be a child of {GENRE_CHECK_SQL}")
        return self
    content_id : int 

class ContentGenresUpdate(BaseModel):
    genre: str | None 
    @model_validator(mode="after")
    def isValidGenre(self):
        if self.genre not in GENRE_CHECK_SQL:
            raise ValueError(f"Enter a valid genre. Genre must be a child of {GENRE_CHECK_SQL}")
        return self

class ContentGenresPreferencesCreate(BaseModel):
    user_id : int 
    @field_validator("user_id")
    @classmethod
    def isNull(cls, user_id):
        if not user_id:
            raise ValueError("User Id can't be empty")
        return user_id
