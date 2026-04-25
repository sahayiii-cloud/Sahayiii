# app/routers/worker.py

from fastapi import APIRouter, Depends,HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import Skill, Rating, Booking,ShowcaseImage
from app.database import get_db
from app.security.auth import get_current_user
from app.models import User, WorkerProfile

router = APIRouter(tags=["worker"])


@router.post("/api/worker/status")
def set_status(
    status: bool,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    profile = (
        db.query(WorkerProfile)
        .filter(WorkerProfile.user_id == user.id)
        .first()
    )

    if not profile:
        return {
            "success": False,
            "message": "Worker profile not found",
        }

    profile.is_online = status

    db.commit()

    return {
        "success": True,
        "is_online": profile.is_online,
    }


@router.get("/api/worker/profile/{worker_id}")
def get_worker_profile(
    worker_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):

    worker = db.get(User, worker_id)
    if not worker:
        raise HTTPException(404, "Worker not found")

    profile = db.query(WorkerProfile).filter(
        WorkerProfile.user_id == worker_id
    ).first()

    skills = db.query(Skill).filter(
        Skill.user_id == worker_id
    ).all()

    ratings = db.query(Rating).filter(
        Rating.worker_id == worker_id
    ).all()

    showcase = db.query(ShowcaseImage).filter(
        ShowcaseImage.user_id == worker_id
    ).all()

    # ---------------- SAFE PROFILE ----------------

    if not profile:
        profile_data = {
            "photo": None,
            "age": None,
            "gender": None,
            "about": "",
            "experience": "",
            "qualification": "",
            "is_verified": False,
        }
    else:
        profile_data = {
            "photo": profile.photo,
            "age": profile.age,
            "gender": profile.gender,
            "about": profile.about or "",
            "experience": profile.experience or "",
            "qualification": profile.qualification or "",
            "is_verified": profile.is_verified,
        }

    # ---------------- SAFE STATS ----------------

    avg_rating = (
        round(sum(r.stars for r in ratings) / len(ratings), 1)
        if ratings else 0.0
    )

    completed_jobs = db.query(func.count(Booking.id)).filter(
        Booking.worker_id == worker_id,
        Booking.status == "completed"
    ).scalar() or 0

    # ---------------- RESPONSE ----------------

    return {
        "user": {
            "id": worker.id,
            "name": worker.name,
            "created_at": worker.created_at.isoformat(),
        },

        "profile": profile_data,

        "stats": {
            "avg_rating": avg_rating,
            "reviews": len(ratings),
            "jobs_completed": int(completed_jobs),  # 🔥 FIX
        },

        "skills": [
            {
                "name": s.name,
                "rate": s.rate or "",
                "rate_type": s.rate_type or "",
            }
            for s in skills
        ],

        "showcase": [
            {
                "image_url": s.image_url,
            }
            for s in showcase
        ],

        "ratings": [
            {
                "stars": r.stars,
                "rater": r.rater.name if r.rater else "User",
                "comment": r.comment or "",
            }
            for r in ratings
        ],
    }

