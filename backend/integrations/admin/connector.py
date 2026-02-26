"""
Admin API — User Approval Management

Endpoints for the admin to list pending users and approve/reject accounts.
All endpoints require an approved user with role='admin'.

How to make yourself admin:
  1. Sign up normally
  2. In Supabase Studio → Table Editor → profiles
  3. Find your row, set approved=true, role='admin'
  4. Log out and back in
"""
import httpx
import logging
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from auth import get_admin_user, invalidate_approval_cache

router = APIRouter()
logger = logging.getLogger(__name__)

SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


class ApprovalRequest(BaseModel):
    user_id: str
    notes:   Optional[str] = None


def _supabase_headers() -> dict:
    return {
        "apikey":          SUPABASE_SERVICE_KEY,
        "Authorization":   f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type":    "application/json",
        "Prefer":          "return=representation",
    }


@router.get("/pending")
def pending_users(admin = Depends(get_admin_user)):
    """
    List all users pending approval.
    Returns user ID, email, name, signup date, and any notes.
    """
    try:
        resp = httpx.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            params={"approved": "eq.false", "select": "id,email,full_name,created_at,notes"},
            headers=_supabase_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        return {"pending": resp.json(), "count": len(resp.json())}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/users")
def all_users(admin = Depends(get_admin_user)):
    """List all users (approved and pending)."""
    try:
        resp = httpx.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            params={"select": "id,email,full_name,approved,role,created_at,approved_at,notes",
                    "order": "created_at.desc"},
            headers=_supabase_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        return {"users": resp.json(), "count": len(resp.json())}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/approve")
def approve_user(body: ApprovalRequest, admin: dict = Depends(get_admin_user)):
    """
    Approve a user account — grants dashboard access immediately.
    The user will be able to log in on their next attempt.
    """
    return _set_approval(body.user_id, approved=True, notes=body.notes, admin=admin)


@router.post("/reject")
def reject_user(body: ApprovalRequest, admin: dict = Depends(get_admin_user)):
    """
    Reject / revoke a user account — removes dashboard access.
    """
    return _set_approval(body.user_id, approved=False, notes=body.notes, admin=admin)


def _set_approval(user_id: str, approved: bool, notes: Optional[str], admin: dict) -> dict:
    from datetime import datetime, timezone

    payload = {
        "approved":    approved,
        "approved_by": admin.get("email") or admin.get("sub", "admin"),
    }
    if approved:
        payload["approved_at"] = datetime.now(timezone.utc).isoformat()
    if notes is not None:
        payload["notes"] = notes

    try:
        resp = httpx.patch(
            f"{SUPABASE_URL}/rest/v1/profiles",
            params={"id": f"eq.{user_id}"},
            json=payload,
            headers=_supabase_headers(),
            timeout=10,
        )
        resp.raise_for_status()
        invalidate_approval_cache(user_id)
        action = "approved" if approved else "rejected"
        logger.info("Admin %s %s user %s", admin.get("sub"), action, user_id)
        return {"status": action, "user_id": user_id}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
