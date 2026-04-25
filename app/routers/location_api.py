from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import SavedLocation, User
from app.routers.auth import get_current_user_jwt

router = APIRouter(prefix="/location", tags=["location"])


# =========================
# REQUEST MODELS
# =========================

class UpdateLocationRequest(BaseModel):
    latitude: float
    longitude: float
    state: str | None = None
    zipcode: str | None = None
    force_update: bool = False


class SaveLocationRequest(BaseModel):
    name: str
    latitude: float
    longitude: float
    state: str | None = None
    zipcode: str | None = None

    # 🔥 ADD THESE
    address_line: str | None = None
    notes: str | None = None
    voice_note_url: str | None = None

class UpdateLocationFullRequest(BaseModel):
    location_id: int
    notes: str | None = None
    voice_note_url: str | None = None

# =========================
# DISTANCE FUNCTION
# =========================

from math import radians, sin, cos, sqrt, atan2

def distance_meters(lat1, lon1, lat2, lon2):
    R = 6371000
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)

    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    )

    return 2 * R * atan2(sqrt(a), sqrt(1 - a))


# =========================
# UPDATE LOCATION
# =========================

@router.post("/update")
def update_location(
    data: UpdateLocationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_jwt),
):

    lat = float(data.latitude)
    lon = float(data.longitude)

    if user.latitude is not None and user.longitude is not None:

        if not data.force_update:
            moved = distance_meters(
                user.latitude,
                user.longitude,
                lat,
                lon
            )

            if moved < 5:
                return {"status": "ignored_small_movement"}

    user.latitude = lat
    user.longitude = lon
    user.state = data.state
    user.zipcode = data.zipcode

    db.commit()

    return {"status": "success"}


# =========================
# SET CURRENT LOCATION
# =========================

@router.post("/set_current")
def set_current_location(
    data: UpdateLocationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_jwt),
):

    user.latitude = float(data.latitude)
    user.longitude = float(data.longitude)
    user.state = data.state
    user.zipcode = data.zipcode

    db.commit()

    return {"success": True, "message": "Current location updated"}


# =========================
# SAVE LOCATION
# =========================

@router.post("/save")
def save_location(
    data: SaveLocationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_jwt),
):

    existing = db.query(SavedLocation).filter(
        SavedLocation.user_id == user.id,
        SavedLocation.latitude == data.latitude,
        SavedLocation.longitude == data.longitude
    ).first()

    if existing:
        return {
            "id": existing.id,
            "name": existing.name,
            "latitude": existing.latitude,
            "longitude": existing.longitude,
            "state": existing.state,
            "zipcode": existing.zipcode,
            "address_line": existing.address_line,
            "notes": existing.notes,
            "voice_note_url": existing.voice_note_url,
        }

    loc = SavedLocation(
        user_id=user.id,
        name=data.name,
        latitude=data.latitude,
        longitude=data.longitude,
        state=data.state,
        zipcode=data.zipcode,

        # 🔥 ADD THESE
        address_line=data.address_line,
        notes=data.notes,
        voice_note_url=data.voice_note_url,
    )

    db.add(loc)
    db.commit()
    db.refresh(loc)

    return {
        "id": loc.id,
        "name": loc.name,
        "latitude": loc.latitude,
        "longitude": loc.longitude,
        "state": loc.state,
        "zipcode": loc.zipcode,
        "address_line": loc.address_line,
        "notes": loc.notes,
        "voice_note_url": loc.voice_note_url,
    }


# =========================
# GET MY LOCATIONS
# =========================

@router.get("/my")
def get_my_locations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_jwt),
):

    locations = db.query(SavedLocation)\
        .filter(SavedLocation.user_id == user.id)\
        .order_by(SavedLocation.created_at.desc())\
        .all()

    return {
        "success": True,
        "data": [
            {
                "id": l.id,
                "name": l.name,
                "lat": l.latitude,
                "lng": l.longitude,
                "state": l.state,
                "zipcode": l.zipcode,
            }
            for l in locations
        ]
    }


# =========================
# GET CURRENT LOCATION (🔥 FIXED)
# =========================

@router.get("/current")
def get_current_location(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_jwt),
):
    try:
        if user.latitude is None or user.longitude is None:
            return {}

        saved = db.query(SavedLocation).filter(
            SavedLocation.user_id == user.id
        ).all()

        matched = None
        closest = None
        min_dist = float("inf")

        # 🔥 IMPROVED MATCHING (FIXED)
        for loc in saved:
            dist = distance_meters(
                user.latitude,
                user.longitude,
                loc.latitude,
                loc.longitude
            )

            if dist < min_dist:
                min_dist = dist
                closest = loc

        # 🔥 USE CLOSEST LOCATION IF WITHIN RANGE
        if closest and min_dist < 150:  # ✅ increased tolerance
            matched = closest

        print("📍 MATCHED:", matched.id if matched else None)
        print("📍 DIST:", min_dist)

        return {
            "id": matched.id if matched else None,
            "name": matched.name if matched else "Current Location",
            "state": matched.state if matched else user.state,
            "zipcode": matched.zipcode if matched else user.zipcode,

            "notes": matched.notes if matched and matched.notes else "",


            "voice_note_url": matched.voice_note_url if matched else None,

            "lat": user.latitude,
            "lng": user.longitude,
        }

    except Exception as e:
        print("🔥 ERROR IN /location/current:", e)
        return {"error": str(e)}

# =========================
# UPDATE NOTES (NEW)
# =========================

from pydantic import BaseModel

class UpdateNotesRequest(BaseModel):
    location_id: int
    notes: str


@router.post("/update_notes")
def update_location_notes(
    data: UpdateNotesRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_jwt),
):
    loc = db.query(SavedLocation).filter(
        SavedLocation.id == data.location_id,
        SavedLocation.user_id == user.id
    ).first()

    if not loc:
        return {"success": False}

    loc.notes = data.notes
    db.commit()

    return {"success": True}

@router.post("/update_full")
def update_location_full(
    data: UpdateLocationFullRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_jwt),
):
    loc = db.query(SavedLocation).filter(
        SavedLocation.id == data.location_id,
        SavedLocation.user_id == user.id
    ).first()

    if not loc:
        return {"success": False, "message": "Location not found"}

    # 🔥 UPDATE BOTH
    if data.notes is not None:
        loc.notes = data.notes

    if data.voice_note_url is not None:
        loc.voice_note_url = data.voice_note_url

    db.commit()

    return {"success": True}