"""
Session auth for the HITL workflow.

Demo-simple: an HMAC-signed cookie carrying the user id. Anyone listed in the
users table (seeded at DB init) can log in by id from the /auth/login endpoint
without a password. Enough to demonstrate the workflow with named reviewers.

Production deployment must replace this with NHS Identity / OAuth2 / SAML.
Do NOT reuse this flow with real clinical data.
"""

import base64
import hmac
import hashlib
import logging
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from app.config import SESSION_SECRET
from app.db import hitl_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_NAME = "nice_session"
COOKIE_MAX_AGE = 60 * 60 * 12  # 12h


def _sign(user_id: int) -> str:
    """Return 'b64(user_id).hex(hmac)' — a signed session token."""
    payload = str(user_id).encode("utf-8")
    sig = hmac.new(SESSION_SECRET.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return f"{base64.urlsafe_b64encode(payload).decode()}.{sig}"


def _verify(token: str) -> Optional[int]:
    """Verify a session token and return user_id, or None if invalid."""
    try:
        b64_payload, sig = token.split(".", 1)
        payload = base64.urlsafe_b64decode(b64_payload.encode())
        expected = hmac.new(SESSION_SECRET.encode("utf-8"), payload, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        return int(payload)
    except (ValueError, TypeError):
        return None


# --- FastAPI dependency -----------------------------------------------------

def get_current_user(
    nice_session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
) -> dict:
    """Resolve current user from the session cookie, or 401."""
    if not nice_session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = _verify(nice_session)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid session")
    user = hitl_store.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_current_user_optional(
    nice_session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
) -> Optional[dict]:
    """Same as above but returns None instead of 401 — use on public endpoints."""
    if not nice_session:
        return None
    user_id = _verify(nice_session)
    if user_id is None:
        return None
    return hitl_store.get_user(user_id)


# --- Endpoints --------------------------------------------------------------

class LoginRequest(BaseModel):
    user_id: int


@router.get("/users")
async def list_demo_users():
    """List seeded demo users so the frontend can render a picker."""
    return hitl_store.list_users()


@router.post("/login")
async def login(body: LoginRequest, req: Request, response: Response):
    """
    Demo login: trust the user_id posted by the client, check it exists,
    set a signed cookie. Real auth goes here in production.
    """
    user = hitl_store.get_user(body.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    token = _sign(user["id"])
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=req.url.scheme == "https",
    )
    logger.info("user %s logged in", user["name"])
    return user


@router.post("/logout", status_code=204)
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user
