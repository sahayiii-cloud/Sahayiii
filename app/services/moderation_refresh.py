from app.database import SessionLocal
from app.models import WorkerProfile
from app.services.moderation import recalc_worker_moderation


def refresh_worker_moderation():

    db = SessionLocal()

    try:

        workers = (
            db.query(WorkerProfile.user_id)
            .filter(
                WorkerProfile.moderation_status.in_(["limited", "suspended"])
            )
            .all()
        )

        for (worker_id,) in workers:
            recalc_worker_moderation(db, worker_id)

    finally:
        db.close()