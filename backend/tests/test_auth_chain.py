"""
tests/test_auth_chain.py
========================
End-to-end auth flow: send-otp -> verify-otp -> login -> token decode.

Strategy:
- Each test gets its own fresh in-memory SQLite engine (per-test fixture).
  This is the only approach that works reliably when route handlers call
  db.commit() multiple times within a single test — savepoint-based rollback
  collapses and gives unpredictable isolation.
- JSONB (PostgreSQL-only) is patched to generic JSON before any create_all.
- The FastAPI `get_db` dependency is overridden to use the per-test session.
- Email is monkeypatched in `router.auth` (where it was bound at import time,
  not in the service module — patching the service module has no effect).
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import pytest_asyncio

from httpx import AsyncClient, ASGITransport
from sqlalchemy import JSON
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

# ---------------------------------------------------------------------------
# Import models BEFORE patching so all ORM classes are registered on Base.
# ---------------------------------------------------------------------------
from database import Base, get_db
import models  # noqa: F401

# ---------------------------------------------------------------------------
# JSONB -> JSON patch: must happen before any create_all call.
# ---------------------------------------------------------------------------
from models import SuggestionRequest
SuggestionRequest.__table__.c["result"].type = JSON()


# ---------------------------------------------------------------------------
# OTP capture helper (module-level mutable dict so monkeypatch can reset it)
# ---------------------------------------------------------------------------
_captured = {"otp": None, "email": None}


async def _mock_send_otp(email: str, otp: str):
    _captured["otp"] = otp
    _captured["email"] = email


# ---------------------------------------------------------------------------
# Per-test fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture()
async def db_session():
    """
    Fresh in-memory SQLite DB per test.
    Each test starts with empty tables; disposing the engine clears everything.
    """
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture()
async def client(db_session: AsyncSession):
    """
    AsyncClient wired to the FastAPI app.
    - get_db overridden to use the per-test session.
    - send_otp_email patched in router.auth (where it was bound at import time).
    """
    from main import app
    import router.auth as auth_module

    # Reset captured OTP state before each test
    _captured["otp"] = None
    _captured["email"] = None

    # Override DB dependency
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    # Patch email in the module that imported the function — not the service module
    original_send_otp = auth_module.send_otp_email
    auth_module.send_otp_email = _mock_send_otp

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    # Restore
    auth_module.send_otp_email = original_send_otp
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------
VALID_EMAIL = "testuser@example.com"
VALID_NAME = "Test User"
VALID_PASSWORD = "Str0ng!Pass99"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_send_otp_new_email(client):
    """send-otp with a fresh email must return 200 and a message."""
    resp = await client.post("/auth/send-otp", json={
        "name": VALID_NAME, "email": VALID_EMAIL, "password": VALID_PASSWORD,
    })
    assert resp.status_code == 200, resp.text
    assert "OTP" in resp.json()["message"]


@pytest.mark.asyncio
async def test_send_otp_duplicate_email(client):
    """send-otp for an already-registered email must return 400."""
    # Register fully
    await client.post("/auth/send-otp", json={
        "name": VALID_NAME, "email": VALID_EMAIL, "password": VALID_PASSWORD,
    })
    otp = _captured["otp"]
    await client.post("/auth/verify-otp", json={
        "name": VALID_NAME, "email": VALID_EMAIL,
        "password": VALID_PASSWORD, "otp": otp,
    })

    # Second send-otp for same email should be blocked
    resp = await client.post("/auth/send-otp", json={
        "name": VALID_NAME, "email": VALID_EMAIL, "password": VALID_PASSWORD,
    })
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == "Email already registered"


@pytest.mark.asyncio
async def test_verify_otp_wrong_otp(client):
    """verify-otp with wrong OTP must return 400 with generic message."""
    await client.post("/auth/send-otp", json={
        "name": VALID_NAME, "email": VALID_EMAIL, "password": VALID_PASSWORD,
    })

    resp = await client.post("/auth/verify-otp", json={
        "name": VALID_NAME, "email": VALID_EMAIL,
        "password": VALID_PASSWORD, "otp": "000000",
    })
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == "Invalid or expired OTP"


@pytest.mark.asyncio
async def test_full_signup_flow(client):
    """
    Full happy-path: send-otp -> verify-otp -> returns access_token.
    Token must decode to an integer user_id.
    """
    # 1. Send OTP
    resp = await client.post("/auth/send-otp", json={
        "name": VALID_NAME, "email": VALID_EMAIL, "password": VALID_PASSWORD,
    })
    assert resp.status_code == 200, resp.text
    captured_otp = _captured["otp"]
    assert captured_otp is not None and len(captured_otp) == 6

    # 2. Verify OTP
    resp = await client.post("/auth/verify-otp", json={
        "name": VALID_NAME, "email": VALID_EMAIL,
        "password": VALID_PASSWORD, "otp": captured_otp,
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"

    # 3. Decode the token and confirm it yields a valid int user_id
    from auth_utils import decode_access_token
    user_id = decode_access_token(body["access_token"])
    assert isinstance(user_id, int)
    assert user_id > 0


@pytest.mark.asyncio
async def test_login_after_signup(client):
    """After successful signup, login with correct credentials must return a token."""
    await client.post("/auth/send-otp", json={
        "name": VALID_NAME, "email": VALID_EMAIL, "password": VALID_PASSWORD,
    })
    otp = _captured["otp"]
    await client.post("/auth/verify-otp", json={
        "name": VALID_NAME, "email": VALID_EMAIL,
        "password": VALID_PASSWORD, "otp": otp,
    })

    resp = await client.post("/auth/login", json={
        "email": VALID_EMAIL,
        "password": VALID_PASSWORD,
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"

    from auth_utils import decode_access_token
    user_id = decode_access_token(body["access_token"])
    assert isinstance(user_id, int)
    assert user_id > 0


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    """Login with wrong password must return 401 — same message as unknown email (no enumeration)."""
    await client.post("/auth/send-otp", json={
        "name": VALID_NAME, "email": VALID_EMAIL, "password": VALID_PASSWORD,
    })
    otp = _captured["otp"]
    await client.post("/auth/verify-otp", json={
        "name": VALID_NAME, "email": VALID_EMAIL,
        "password": VALID_PASSWORD, "otp": otp,
    })

    resp = await client.post("/auth/login", json={
        "email": VALID_EMAIL,
        "password": "Wr0ng!Pass99",
    })
    assert resp.status_code == 401, resp.text
    assert resp.json()["detail"] == "Incorrect email or password"


@pytest.mark.asyncio
async def test_login_nonexistent_email(client):
    """Login with email that was never registered must return the same 401 (no enumeration)."""
    resp = await client.post("/auth/login", json={
        "email": "ghost@example.com",
        "password": VALID_PASSWORD,
    })
    assert resp.status_code == 401, resp.text
    assert resp.json()["detail"] == "Incorrect email or password"


@pytest.mark.asyncio
async def test_protected_route_requires_token(client):
    """A protected route hit without a token must return 401."""
    resp = await client.get("/library")
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
async def test_protected_route_with_valid_token(client):
    """A protected route hit with a valid token from signup must return 200 with paginated envelope."""
    await client.post("/auth/send-otp", json={
        "name": VALID_NAME, "email": VALID_EMAIL, "password": VALID_PASSWORD,
    })
    otp = _captured["otp"]
    reg_resp = await client.post("/auth/verify-otp", json={
        "name": VALID_NAME, "email": VALID_EMAIL,
        "password": VALID_PASSWORD, "otp": otp,
    })
    assert reg_resp.status_code == 200, reg_resp.text
    token = reg_resp.json()["access_token"]

    resp = await client.get("/library", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "items" in body
    assert "total" in body
    assert "limit" in body
    assert "offset" in body
    assert body["items"] == []  # freshly registered user has empty library
    assert body["total"] == 0
