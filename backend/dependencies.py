"""
dependencies.py
================
FastAPI dependencies shared across routes. Two things live here:
    - get_db            (re-exported from database.py for convenience)
    - get_current_user  (the auth gatekeeper for every protected route)

Usage in any route that needs to know who's calling:
    
    from dependencies import get_current_user
    from models import User
    from fastapi import Depends

    @router.get("/library")
    async def get_my_library(user: User = Depends(get_current_user)):
        # `user` is a fully loaded User object — already verified, already
        # fetched from the DB. If the token was invalid/expired, or the
        # user no longer exists, this route function never even runs —
        # FastAPI returns 401 before reaching your code.
        ...
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError

from database import get_db  # re-exported so routes only need one import line
from auth_utils import decode_access_token
from models import User

# ---------------------------------------------------------------------------
# OAuth2PasswordBearer is just a header-reader — it does NOT do OAuth2,
# despite the name. It looks for "Authorization: Bearer <token>" in the
# incoming request and extracts the token string. tokenUrl is required by
# the class but mostly just powers FastAPI's auto-generated docs UI (the
# "Authorize" button at /docs) — it doesn't need to be a real working route
# for this to function correctly as a header-reader.
# ---------------------------------------------------------------------------
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    The auth gatekeeper. Runs before any route that declares it as a
    dependency. Four steps, matching exactly what we discussed:

        1. oauth2_scheme above already extracted the token from the header
        2. decode + verify the JWT (signature + expiry)
        3. pull the user_id out of the verified payload
        4. look that user up in the DB — if they don't exist, reject

    Both failure points return the SAME generic error message on purpose —
    don't let the response reveal whether the token was invalid/expired
    vs. the user simply not existing anymore. That distinction is not
    useful to a legitimate caller and is a minor info leak to an attacker
    probing for valid user IDs.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # --- Step 2 & 3: decode the token, extract user_id ---
    try:
        user_id = decode_access_token(token)
    except JWTError:
        # Covers BOTH a tampered signature AND an expired token —
        # jwt.decode raises JWTError for both cases.
        raise credentials_exception

    # --- Step 4: look the user up for real ---
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        # Token was technically valid, but the user it points to is gone
        # (e.g. account deleted after the token was issued).
        raise credentials_exception

    return user
