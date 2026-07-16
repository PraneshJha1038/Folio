"""
auth_utils.py
=============
Pure JWT logic — no FastAPI, no database. Just create_access_token (used
at login/signup) and decode_access_token (used by get_current_user).
Kept separate so it's testable on its own and reusable anywhere.
"""
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import os

load_dotenv()

# ---------------------------------------------------------------------------
# SECRET_KEY signs every token. Anyone with this key could forge a valid
# token for any user — treat it like a password. Generate a real one with:
#     python -c "import secrets; print(secrets.token_hex(32))"
# and put it in .env as JWT_SECRET_KEY. Never commit it, never hardcode it.
# ---------------------------------------------------------------------------
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30  # 30 days


def create_access_token(user_id: int) -> str:
    """
    Called once, at login or right after successful signup. Packs the
    user's id into a signed token the frontend stores and sends back on
    every future request.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    # "sub" (subject) is the JWT-standard claim name for "who this token
    # belongs to" — using the standard name isn't required, but it's what
    # most JWT tooling/libraries expect by convention.
    payload = {
        "sub": str(user_id),  # JWT spec requires "sub" to be a string
        "exp": expire
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> int:
    """
    Reverses create_access_token. Verifies the signature and expiry
    automatically (jwt.decode raises JWTError if either check fails),
    then returns the user_id that was packed in at creation time.

    Raises JWTError on any problem — caller is responsible for turning
    that into an HTTP 401.
    """
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    user_id_str = payload.get("sub")

    if user_id_str is None:
        raise JWTError("Token missing 'sub' claim")

    return int(user_id_str)
