# app/routers/auth.py
from datetime import datetime, timedelta
from jose import jwt, JWTError
from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer
from app.settings import settings
from app.models import User
from sqlalchemy.orm import Session
from app.database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

def get_current_user_jwt(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=["HS256"],
        )

        user_id = payload.get("sub") or payload.get("user_id")


        if not user_id:
            raise HTTPException(401)

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    user = db.get(User, int(user_id))

    if not user:
        raise HTTPException(401)

    return user

router = APIRouter(prefix="/auth", tags=["auth"])

# -------------------------------
# JWT Config
# -------------------------------
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # 1 hour


# -------------------------------
# Token Utilities
# -------------------------------
def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """
    Create a JWT access token.
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Verify a JWT and return the decoded payload.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

# -------------------------------
# Simple Ping Test
# -------------------------------
@router.get("/ping")
def ping():
    return {"ok": True}

# -------------------------------
# Example Protected Route (Optional)
# -------------------------------
@router.get("/whoami")
def whoami(payload: dict = Depends(verify_token)):
    """
    Example protected route that shows the decoded JWT payload.
    """
    return {"decoded": payload}







