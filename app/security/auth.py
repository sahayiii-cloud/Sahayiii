#app\security\auth.py
from fastapi import Request, HTTPException, Depends
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from app.database import get_db
from app.models import User
from app.settings import settings


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:

    auth = request.headers.get("Authorization")

    user: User | None = None

    # -------- JWT --------
    if auth and auth.startswith("Bearer "):

        token = auth.replace("Bearer ", "")

        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=["HS256"],
            )

            user_id = payload.get("sub") or payload.get("user_id")


            if not user_id:
                raise HTTPException(401)

            user = db.get(User, int(user_id))

        except JWTError:
            raise HTTPException(401, "Invalid token")

    # -------- Session --------
    if not user:

        uid = request.session.get("user_id")

        if uid:
            user = db.get(User, int(uid))

    if not user:
        raise HTTPException(401, "Not authenticated")

    # -------- Moderation --------
    profile = user.worker_profile

    if profile:

        if profile.moderation_status == "suspended":
            request.session.clear()
            raise HTTPException(403, "account_suspended")

        if profile.moderation_status == "banned":
            request.session.clear()
            raise HTTPException(403, "account_banned")

    return user

