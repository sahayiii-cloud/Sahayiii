#app\routers\welcome_api.py
from __future__ import annotations
from app.routers.auth import get_current_user_jwt

# app/routers/welcome_api.py

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Notification, WorkerProfile
from pydantic import BaseModel
router = APIRouter(tags=["welcome-api"])

@router.get("/welcome")
def welcome_api(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_jwt),
):

    unread_count = (
        db.query(Notification)
        .filter(
            Notification.recipient_id == current_user.id,
            Notification.is_read == False,
        )
        .count()
    )

    profile = (
        db.query(WorkerProfile)
        .filter(WorkerProfile.user_id == current_user.id)
        .first()
    )

    is_worker = bool(
        profile
        or getattr(current_user, "is_worker", False)
        or getattr(current_user, "role", "") == "worker"
        or getattr(current_user, "user_type", "") == "worker"
    )

    has_profile = bool(profile)

    return {
        "success": True,

        "user": {
            "id": current_user.id,
            "name": current_user.name,
            "phone": current_user.phone,
        },

        "unread_count": unread_count,

        "worker": (
            {
                "id": profile.id,
                "is_online": profile.is_online,
                "has_profile": True,

                "photo": (
                    f"/static/uploads/{profile.photo}"
                    if profile.photo
                    else None
                ),
            }
            if profile
            else None
        ),

        "links": {
            "worker_profile_url": "/seek_job",
            "create_worker_url": "/create_worker_profile",
        }
    }


# ===============================
# WORKER STATUS API
# ===============================

class StatusUpdate(BaseModel):
    status: bool


@router.post("/worker/status")
def set_status(
    data: StatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_jwt),
):

    profile = db.query(WorkerProfile).filter(
        WorkerProfile.user_id == user.id
    ).first()

    if not profile:
        return {
            "success": False,
            "message": "Worker profile not found"
        }

    profile.is_online = data.status
    db.commit()

    return {
        "success": True,
        "is_online": data.status
    }
