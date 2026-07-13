from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from datetime import datetime, timedelta, timezone
import random
import hashlib
import bcrypt

from database import get_db
from models import User, PendingOtp, LibraryItem
from auth_utils import create_access_token
from services.email_service import send_otp_email
from dependencies import get_current_user
from schemas import UserResponse, UserUpdate

router = APIRouter(prefix="/auth", tags=["auth"])

def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def _verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

class SendOtpRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class VerifyOtpRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    otp: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

def get_sha256_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

@router.post("/send-otp")
async def send_otp(body: SendOtpRequest, db: AsyncSession = Depends(get_db)):
    # 1. Reject if email already in users
    user_exists = await db.execute(select(User).where(User.email == body.email))
    if user_exists.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # 2. Generate 6-digit OTP
    otp = f"{random.randint(100000, 999999)}"
    otp_hash = get_sha256_hash(otp)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    
    # 3. Upsert into pending_otps
    # Check if there is already an OTP for this email
    existing_otp_query = await db.execute(select(PendingOtp).where(PendingOtp.email == body.email))
    existing_otp = existing_otp_query.scalar_one_or_none()
    
    if existing_otp:
        existing_otp.otp_hash = otp_hash
        existing_otp.expires_at = expires_at
    else:
        new_otp = PendingOtp(
            email=body.email,
            otp_hash=otp_hash,
            expires_at=expires_at
        )
        db.add(new_otp)
        
    await db.commit()
    
    # 4. Email it (Background Task or directly, since we can wait or do it sync)
    # The requirement says "email it", we can await the email service directly.
    await send_otp_email(body.email, otp)
    
    return {"message": "OTP sent to your email"}

@router.post("/verify-otp")
async def verify_otp(body: VerifyOtpRequest, db: AsyncSession = Depends(get_db)):
    # Fetch pending row
    otp_query = await db.execute(select(PendingOtp).where(PendingOtp.email == body.email))
    pending_row = otp_query.scalar_one_or_none()
    
    if not pending_row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP"
        )
        
    # Check expiry
    current_time = datetime.now(timezone.utc)
    # Ensure expires_at is timezone-aware
    expires_at = pending_row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
        
    if current_time > expires_at:
        await db.execute(delete(PendingOtp).where(PendingOtp.email == body.email))
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP"
        )
        
    # Check hash match
    input_hash = get_sha256_hash(body.otp)
    if pending_row.otp_hash != input_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP"
        )
        
    # On success:
    # 1. Create user row
    hashed_password = _hash_password(body.password)
    new_user = User(
        email=body.email,
        password_hash=hashed_password,
        display_name=body.name,
        default_wpm=238, # as specified in the "users" table description: default 238
        reading_sessions_count=0
    )
    db.add(new_user)
    
    # 2. Delete the pending_otps row
    await db.delete(pending_row)
    await db.commit()
    await db.refresh(new_user)
    
    # 3. Issue JWT
    token = create_access_token(new_user.id)
    return {"access_token": token, "token_type": "bearer"}

@router.post("/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user_query = await db.execute(select(User).where(User.email == body.email))
    user = user_query.scalar_one_or_none()
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password",
        headers={"WWW-Authenticate": "Bearer"}
    )
    
    if not user:
        raise credentials_exception
        
    if not _verify_password(body.password, user.password_hash):
        raise credentials_exception
        
    token = create_access_token(user.id)
    # Commit to close the read transaction and prevent ROLLBACK logs
    await db.commit()
    return {"access_token": token, "token_type": "bearer"}

@router.get("/users/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.commit()
    return current_user

@router.patch("/users/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if body.display_name is not None:
        current_user.display_name = body.display_name
    if body.default_wpm is not None:
        current_user.default_wpm = body.default_wpm
    if body.current_wpm is not None:
        current_user.current_wpm = body.current_wpm
    await db.commit()
    await db.refresh(current_user)
    return current_user

@router.get("/users/count")
async def get_users_count(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(func.count(User.id)))
    count = result.scalar()
    await db.commit()
    return {"count": count}
@router.get("/users/items")
async def get_items_count(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(func.count(LibraryItem.id)))
    count = result.scalar()
    await db.commit()
    return {"count": count}
