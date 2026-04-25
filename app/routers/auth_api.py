# app/routers/auth_api.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.routers.auth import create_access_token
from datetime import timedelta
from app.database import get_db
from app.models import User
from werkzeug.security import check_password_hash
from pydantic import BaseModel
from werkzeug.security import generate_password_hash

router = APIRouter(prefix="/api", tags=["auth-api"])


# ---------- Request Schema ----------
class LoginRequest(BaseModel):
    phone: str
    password: str


# ---------- Mobile Login ----------
@router.post("/login")
def api_login(data: LoginRequest, db: Session = Depends(get_db)):

    # Normalize phone
    phone = data.phone.strip()
    if not phone.startswith("+91"):
        phone = "+91" + phone[-10:]

    user = (
        db.query(User)
        .filter(
            (User.phone == phone) |
            (User.phone == phone.replace("+91", ""))
        )
        .first()
    )

    if not user:
        raise HTTPException(status_code=401, detail="Invalid phone")

    if not user.password:
        raise HTTPException(status_code=401, detail="Password not set")

    if not check_password_hash(user.password, data.password):
        raise HTTPException(status_code=401, detail="Invalid password")

    # Check ban/suspend
    profile = user.worker_profile
    if profile:
        if profile.moderation_status == "suspended":
            raise HTTPException(403, "Account suspended")
        if profile.moderation_status == "banned":
            raise HTTPException(403, "Account banned")

    # Success
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=60),
    )

    # ---- RETURN TOKEN TO MOBILE ----
    return {
        "success": True,
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user.id,
        "name": user.name,
        "phone": user.phone,
    }

from pydantic import BaseModel
from werkzeug.security import generate_password_hash

class SignupRequest(BaseModel):
    phone: str
    name: str
    password: str


@router.post("/signup")
def api_signup(data: SignupRequest, db: Session = Depends(get_db)):

    # Normalize phone
    phone = data.phone.strip()
    if not phone.startswith("+91"):
        phone = "+91" + phone[-10:]

    # Check existing user
    existing = db.query(User).filter(
        (User.phone == phone) |
        (User.phone == phone.replace("+91", ""))
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Account already exists")

    # Create user
    user = User(
        name=data.name,
        phone=phone,
        password=generate_password_hash(data.password),
        location="Not Provided",
        contact="Not Provided",
        busy=False,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    # ✅ SAME AS LOGIN → RETURN TOKEN
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=60),
    )

    return {
        "success": True,
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user.id,
        "name": user.name,
        "phone": user.phone,
    }