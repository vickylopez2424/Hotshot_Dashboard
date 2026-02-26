"""
JWT Authentication + Approval Middleware

Validates Supabase JWTs on every protected API request and checks
that the user's account has been manually approved by an admin.

Flow:
  1. User logs in → Supabase issues a signed JWT
  2. Frontend sends JWT as: Authorization: Bearer <token>
  3. This middleware validates the JWT signature
  4. Checks profiles.approved = true in Supabase
  5. If not approved → 403 with clear message
  6. If approved → request proceeds normally

Approval cache: 5 minutes per user ID to avoid hitting Supabase
on every single API call.
"""
import time
import os
import logging
from functools import lru_cache
from typing import Optional

import httpx
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt as pyjwt

logger = logging.getLogger(__name__)

SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_JWT_SECRET  = os.getenv("SUPABASE_JWT_SECRET", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

_bearer = HTTPBearer(auto_error=False)

# ─── Per-user approval cache ──────────────────────────────────────────────────
_approval_cache: dict = {}   # user_id -> {"approved": bool, "ts": float}
APPROVAL_CACHE_TTL = 300     # 5 minutes


def _get_cached_approval(user_id: str) -> Optional[bool]:
    entry = _approval_cache.get(user_id)
    if entry and time.time() - entry["ts"] < APPROVAL_CACHE_TTL:
        return entry["approved"]
    return None


def _set_cached_approval(user_id: str, approved: bool):
    _approval_cache[user_id] = {"approved": approved, "ts": time.time()}


# ─── JWT validation ───────────────────────────────────────────────────────────

def _decode_token(token: str) -> dict:
    """Decode and validate a Supabase JWT."""
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(status_code=500, detail="SUPABASE_JWT_SECRET not configured")
    try:
        payload = pyjwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired — please log in again")
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


# ─── Approval check via Supabase REST API ─────────────────────────────────────

def _check_approval(user_id: str) -> bool:
    """Query Supabase profiles table to check if user is approved."""
    cached = _get_cached_approval(user_id)
    if cached is not None:
        return cached

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        logger.warning("Supabase not configured — allowing all authenticated users")
        return True

    try:
        resp = httpx.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            params={"id": f"eq.{user_id}", "select": "approved"},
            headers={
                "apikey":        SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            },
            timeout=5,
        )
        resp.raise_for_status()
        rows = resp.json()
        approved = rows[0]["approved"] if rows else False
        _set_cached_approval(user_id, approved)
        return approved

    except Exception as e:
        logger.error("Approval check failed for user %s: %s", user_id, e)
        return False


# ─── FastAPI dependencies ─────────────────────────────────────────────────────

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(_bearer),
) -> dict:
    """
    FastAPI dependency — validates JWT and returns the decoded user payload.
    Raises 401 if token is missing or invalid.
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    return _decode_token(credentials.credentials)


def get_approved_user(user: dict = Depends(get_current_user)) -> dict:
    """
    FastAPI dependency — validates JWT AND checks that the account
    has been manually approved by an admin.

    Use this on all dashboard endpoints.
    Raises 403 with a clear message if not yet approved.
    """
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user token")

    if not _check_approval(user_id):
        raise HTTPException(
            status_code=403,
            detail=(
                "Your account is pending approval. "
                "You'll receive an email once an admin approves your access."
            ),
        )
    return user


def get_admin_user(user: dict = Depends(get_approved_user)) -> dict:
    """
    FastAPI dependency — requires approved user with role='admin'.
    Used for admin-only endpoints (approve/reject users).
    """
    role = user.get("user_metadata", {}).get("role") or user.get("role", "user")
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def invalidate_approval_cache(user_id: str):
    """Call this after approving/rejecting a user to clear the cache."""
    _approval_cache.pop(user_id, None)
