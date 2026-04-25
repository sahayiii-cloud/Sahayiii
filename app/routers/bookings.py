# app/routers/bookings.py
from __future__ import annotations
import secrets
from decimal import Decimal
from typing import Optional
from sqlalchemy import desc, func
from geopy.distance import geodesic
from app.security.auth import get_current_user
from app.models import (
    User, Skill, Job,
    Booking, Notification, PriceNegotiation
)

from fastapi import APIRouter, Depends, HTTPException, Request, Form, status
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, time, timedelta
from app.models import SavedLocation
from app.database import get_db
from app.services.onsite_escrow import refund_onsite_escrow



router = APIRouter(tags=["bookings"])
templates = Jinja2Templates(directory="app/templates")



# ----------------------------
# Helpers
# ----------------------------
def generate_unique_token(db: Session) -> str:
    while True:
        token = secrets.token_hex(16)
        exists = db.query(Booking).filter(Booking.token == token).first()
        if not exists:
            return token


# ----------------------------
# GET + POST /confirm_booking/{worker_id}
# ----------------------------
@router.get(
    "/confirm_booking/{worker_id}",
    response_class=HTMLResponse,
    name="confirm_booking"
)
async def confirm_booking_get(
    worker_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HTMLResponse:
    """
    Renders confirm_booking.html with the same context your Flask route provided.
    """
    worker = db.get(User, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    skills = db.query(Skill).filter(Skill.user_id == worker.id).all()

    # ---- resolve selected_skill ----
    selected_skill: Optional[Skill] = None
    skill_id_qs = request.query_params.get("skill_id")
    if skill_id_qs and str(skill_id_qs).isdigit():
        s = db.get(Skill, int(skill_id_qs))
        if s and s.user_id == worker.id:
            selected_skill = s

    if not selected_skill:
        skill_name = request.query_params.get("skill")
        if skill_name:
            selected_skill = (
                db.query(Skill)
                .filter(
                    Skill.user_id == worker.id,
                    func.lower(func.trim(Skill.name)) == skill_name.lower().strip(),
                )
                .first()
            )

    if not selected_skill and skills:
        selected_skill = skills[0]

    job_id_val = request.query_params.get("job_id")
    job_id = int(job_id_val) if job_id_val is not None and str(job_id_val).isdigit() else None
    rate_type_norm = ((selected_skill.rate_type or "") if selected_skill else "").strip().lower()

    # detect WFH in GET route
    is_wfh = bool(
        selected_skill
        and selected_skill.category
        and selected_skill.category.strip().lower() in (
            "sahayi from home",
            "work from home",
            "remote",
            "wfh",
        )
    )

    # custom ONLY if NOT WFH
    is_custom = (rate_type_norm in ("custom", "per custom")) and not is_wfh

    # ---- agreed price if custom ----
    agreed_price: Optional[float] = None
    if is_custom:
        neg = (
            db.query(PriceNegotiation)
            .filter(
                PriceNegotiation.provider_id == current_user.id,
                PriceNegotiation.worker_id == worker.id,
                PriceNegotiation.job_id == job_id,
            )
            .order_by(desc(PriceNegotiation.updated_at))
            .first()
        )
        if neg and neg.status == "confirmed":
            val = neg.giver_price or neg.worker_price
            if isinstance(val, Decimal):
                val = float(val)
            agreed_price = float(val) if val is not None else None

    return templates.TemplateResponse(
        "confirm_booking.html",
        {
            "request": request,
            "worker": worker,
            "skills": skills,
            "selected_skill": selected_skill,
            "is_custom": is_custom,
            "agreed_price": agreed_price,
            "job_id": job_id,
        },
    )

@router.post("/confirm_booking/{worker_id}")
async def confirm_booking_post(
    worker_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Processes the booking submit. Returns JSON (with redirect key) just like your Flask route.
    """
    from datetime import datetime, timedelta

    # Load worker + profile
    worker = db.get(User, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    # 🚫 BLOCK SELF BOOKING (SERVER SIDE)
    if worker.id == current_user.id:
        return JSONResponse(
            {"error": "self_booking", "message": "❌ You cannot book yourself"},
            status_code=400,
        )

    # geopy import is at module top

    # parse form
    form = await request.form()
    description = (form.get("description") or "").strip()
    form_skill_id = form.get("skill_id")
    expected_price_raw = form.get("expected_price")
    deadline_raw = form.get("deadline")
    job_id_qs = request.query_params.get("job_id")
    job_id = int(job_id_qs) if job_id_qs is not None and job_id_qs.isdigit() else None

    # if current_user.busy:
    #     return JSONResponse(
    #         {"error": "giver_busy", "message": "⚠️ You already have an active booking or a active job request please wait"},
    #         status_code=400,
    #     )

    if not getattr(worker, "worker_profile", None) or not worker.worker_profile.is_online:
        return JSONResponse(
            {"error": "offline", "message": "⚠️ This worker is currently offline and cannot accept bookings."},
            status_code=400,
        )

    if not description:
        return JSONResponse({"error": "Invalid description"}, status_code=400)

    # validate skill
    try:
        skill_id = int(form_skill_id)
    except (TypeError, ValueError):
        return JSONResponse({"error": "Invalid skill selected"}, status_code=400)

    skill = db.get(Skill, skill_id)
    if not skill or skill.user_id != worker.id:
        return JSONResponse({"error": "Invalid skill selected"}, status_code=400)

    # ----- quantity / pricing handling -----
    rate_type_norm = (skill.rate_type or "").strip().lower()
    # initialize pricing variables (IMPORTANT)
    quantity: float = 0.0
    effective_rate: Optional[float] = None
    effective_rate_type: Optional[str] = None
    agreed_price: Optional[float] = None

    # detect WFH from skill category
    is_wfh = False
    if skill.category:
        is_wfh = skill.category.strip().lower() in (
            "sahayi from home",
            "work from home",
            "remote",
            "wfh",
        )


    # 🔹 CASE 1: WFH → price AFTER booking
    if is_wfh:
        # WFH requires expected price + deadline
        if not expected_price_raw or not deadline_raw:
            return JSONResponse(
                {"error": "invalid", "message": "Expected price and deadline are required for WFH jobs."},
                status_code=400,
            )

        try:
            expected_price = float(expected_price_raw)
        except ValueError:
            return JSONResponse(
                {"error": "invalid", "message": "Invalid expected price."},
                status_code=400,
            )

        try:
            # datetime-local → "YYYY-MM-DDTHH:MM"
            deadline = datetime.strptime(deadline_raw, "%Y-%m-%dT%H:%M")
        except ValueError:
            return JSONResponse(
                {"error": "invalid", "message": "Invalid deadline date & time."},
                status_code=400,
            )

        quantity = 1.0
        effective_rate = expected_price
        effective_rate_type = "expected"


    # 🔹 CASE 2: Non-WFH custom → price BEFORE booking
    elif rate_type_norm in ("custom", "per custom"):
        neg = (
            db.query(PriceNegotiation)
            .filter(
                PriceNegotiation.provider_id == current_user.id,
                PriceNegotiation.worker_id == worker.id,
                PriceNegotiation.job_id == job_id,
            )
            .order_by(desc(PriceNegotiation.updated_at))
            .first()
        )

        if neg and neg.status == "confirmed":
            val = neg.giver_price or neg.worker_price
            if isinstance(val, Decimal):
                val = float(val)
            agreed_price = float(val) if val is not None else None

        if agreed_price is None:
            return JSONResponse(
                {"error": "no_agreed_price", "message": "Please complete the negotiation first."},
                status_code=400,
            )

        quantity = 1.0
        effective_rate = agreed_price
        effective_rate_type = "custom"


    elif rate_type_norm == "per hour":
        # hours + minutes from form
        try:
            hours = float(form.get("hours") or 0)
            minutes = float(form.get("minutes") or 0)
        except ValueError:
            return JSONResponse({"error": "Invalid quantity"}, status_code=400)
        quantity = hours + (minutes / 60.0)
        effective_rate = float(skill.rate)
        effective_rate_type = skill.rate_type

    else:
        try:
            quantity = float(form.get("quantity") or 0)
        except ValueError:
            return JSONResponse({"error": "Invalid quantity"}, status_code=400)
        effective_rate = float(skill.rate)
        effective_rate_type = skill.rate_type

    if quantity <= 0:
        return JSONResponse({"error": "Invalid quantity"}, status_code=400)

    if is_wfh:
        booking = Booking(
            token=generate_unique_token(db),
            worker_id=worker.id,
            provider_id=current_user.id,
            job_id=job_id,
            booking_type="wfh",
            status="WFH_PENDING_PRICE",

            # ✅ FIX
            description=description,

            rate=None,
            rate_type=None,
            quantity=1,
            skill_name=skill.name,

            payment_required=True,
            payment_completed=False,

            # WFH-specific fields
            expected_price=expected_price,
            deadline=deadline,
            price_status="pending",
        )

    else:

        booking = Booking(
            token=generate_unique_token(db),
            worker_id=worker.id,
            provider_id=current_user.id,
            job_id=job_id,
            booking_type="onsite",
            status="Pending",
            payment_required=True,
            payment_completed=False,
            rate=effective_rate,
            rate_type=effective_rate_type,
            quantity=quantity,
            skill_name=skill.name,
            expires_at=datetime.utcnow() + timedelta(minutes=1),
        )
    # 🔥 GET location_id from frontend
    location_id = form.get("location_id")

    selected_location = None

    if location_id:
        selected_location = db.query(SavedLocation).filter(
            SavedLocation.id == int(location_id),
            SavedLocation.user_id == current_user.id
        ).first()

    # 🔥 fallback (optional)
    if not selected_location:
        selected_location = db.query(SavedLocation).filter(
            SavedLocation.user_id == current_user.id
        ).order_by(SavedLocation.created_at.desc()).first()

    if selected_location:
        booking.location_id = selected_location.id  # ✅ CRITICAL FIX
        booking.location_notes = selected_location.notes or ""
        booking.address_line = selected_location.address_line or ""
        booking.voice_note_url = selected_location.voice_note_url or ""

    db.add(booking)
    db.flush()


    db.commit()
    db.refresh(booking)
    # notification payload
    try:
        distance_km = round(
            geodesic(
                (current_user.latitude, current_user.longitude),
                (worker.latitude, worker.longitude),
            ).km,
            2,
        )
    except Exception:
        distance_km = "Unknown"

    # human quantity text
    if is_wfh:
        quantity_text = (
            f"WFH • Expected ₹{expected_price:.0f} • "
            f"Deadline: {deadline.strftime('%d %b %Y')}"
        )

    else:
        rt = (effective_rate_type or "").strip().lower()
        if rt == "per hour":
            hrs = int(quantity)
            mins = int(round((quantity - hrs) * 60))
            parts = []
            if hrs > 0:
                parts.append(f"{hrs} hr{'s' if hrs != 1 else ''}")
            if mins > 0 or hrs == 0:
                parts.append(f"{mins} min{'s' if mins != 1 else ''}")
            quantity_text = " ".join(parts)
        elif rt in ("custom", "per custom"):
            quantity_text = f"fixed ₹{effective_rate:.2f}"
        else:
            unit = rt.replace("per ", "")
            quantity_text = f"{quantity} {unit}{'s' if quantity > 1 else ''}"

    message = (
        f"📢 <b>New booking request</b><br>"
        f"🧰 <b>Skill:</b> {skill.name.title()}<br>"
        f"🕒 <b>Requested:</b> {quantity_text}<br>"
        f"📍 <b>Distance:</b> {distance_km} km<br>"
        f"📝 <b>Job Description:</b> {description[:150]}"
    )

    notif = Notification(
        recipient_id=worker.id,
        sender_id=current_user.id,
        message=message,
        action_type="wfh_booking" if is_wfh else "booking_request",
        job_id=job_id,
        booking_id=booking.id,
    )
    db.add(notif)
    db.commit()

    return RedirectResponse(
        url="/welcome",
        status_code=status.HTTP_303_SEE_OTHER
    )


@router.get("/check_pending_payment")
def check_pending_payment(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    booking = (
        db.query(Booking)
        .filter(
            Booking.provider_id == current_user.id,
            Booking.status.in_(["Accepted"]),
            Booking.booking_type != "wfh",  # ✅ EXCLUDE WFH
            Booking.expires_at > datetime.utcnow(),
        )
        .first()
    )

    if booking:
        # If your pay_token route is named differently, adjust this URL.
        return JSONResponse({"redirect_url": f"/pay_token/{booking.token}"})
    return JSONResponse({"redirect_url": None})




@router.post("/book_worker/{worker_id}")
def book_worker(
    worker_id: int,
    request: Request,
    job_id: int = Form(None),
    current_user: User = Depends(get_current_user),
):
    # Redirect to confirm page (keeps your original flow)
    to = f"/confirm_booking/{worker_id}"
    if job_id is not None:
        to = f"{to}?job_id={job_id}"
    return RedirectResponse(url=to, status_code=status.HTTP_303_SEE_OTHER)


@router.get("/booking_timeout/{token}")
def booking_timeout(
    token: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    booking = db.query(Booking).filter_by(token=token).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    # Only provider can access
    if current_user.id != booking.provider_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # ✅ If already cancelled, still try refund if escrow exists
    if booking.status != "Token Paid":
        booking.status = "Cancelled"

    # ✅ REFUND HERE (THIS WAS MISSING)
    if (
        booking.booking_type in {"onsite", "realtime"}  # keep realtime also
        and getattr(booking, "escrow_locked", False) is True
        and getattr(booking, "escrow_released", False) is False
    ):
        try:
            refund_ok = refund_onsite_escrow(db=db, booking=booking, reason="timeout_cancel")
            print(f"[booking_timeout] refund_ok={refund_ok} booking_id={booking.id}")
        except Exception as e:
            print("[booking_timeout] refund FAILED:", e)

    # free both sides
    if booking.provider:
        booking.provider.busy = False

    if booking.worker:
        booking.worker.busy = False

    db.commit()

    return RedirectResponse(url="/welcome", status_code=status.HTTP_303_SEE_OTHER)


@router.get("/waiting_for_payment/{token}", response_class=HTMLResponse)
def waiting_for_payment(
    token: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    booking = db.query(Booking).filter_by(token=token).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    # Only the worker can access this page
    if current_user.id != booking.worker_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    remaining = max(0, int((booking.expires_at - datetime.utcnow()).total_seconds()))
    return templates.TemplateResponse(
        "waiting_payment.html",
        {"request": request, "booking": booking, "remaining": remaining},
    )


async def _create_booking_internal(
    *,
    worker_id: int,
    request: Request,
    current_user: User,
    db: Session,
) -> Booking:
    """
    Shared booking logic for WEB + FLUTTER
    Returns created Booking object
    Raises HTTPException / JSONResponse on error
    """

    worker = db.get(User, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    # 🚫 BLOCK SELF BOOKING
    if worker.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot book yourself"
        )

    if current_user.busy:
        user_role = getattr(current_user, "role", None)

        # handle dict role
        if isinstance(user_role, dict):
            user_role = user_role.get("self")

        if user_role == "worker":
            raise HTTPException(
                status_code=400,
                detail="You already have an active booking",
            )
    if not getattr(worker, "worker_profile", None) or not worker.worker_profile.is_online:
        raise HTTPException(
            status_code=400,
            detail="Worker is offline",
        )

    form = await request.form()

    from app.models import SavedLocation

    location_id = form.get("location_id")

    selected_location = None

    if location_id:
        selected_location = db.query(SavedLocation).filter(
            SavedLocation.id == int(location_id)
        ).first()

    # 🔥 FALLBACK (IMPORTANT)
    if not selected_location:
        selected_location = db.query(SavedLocation).filter(
            SavedLocation.user_id == current_user.id
        ).order_by(SavedLocation.created_at.desc()).first()

    # ✅ ALWAYS USE DB DATA (NOT FRONTEND)
    address_line = selected_location.address_line if selected_location else ""
    location_notes = selected_location.notes if selected_location else ""
    voice_note_url = selected_location.voice_note_url if selected_location else ""

    description = (form.get("description") or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="Invalid description")

    try:
        skill_id = int(form.get("skill_id"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid skill")

    skill = db.get(Skill, skill_id)
    if not skill or skill.user_id != worker.id:
        raise HTTPException(status_code=400, detail="Invalid skill")

    rate_type_norm = (skill.rate_type or "").strip().lower()

    is_wfh = (
        skill.category
        and skill.category.strip().lower()
        in ("sahayi from home", "work from home", "remote", "wfh")
    )

    quantity = 0.0
    effective_rate = None
    effective_rate_type = None

    if is_wfh:
        expected_price = float(form.get("expected_price"))
        deadline = datetime.strptime(
            form.get("deadline"), "%Y-%m-%dT%H:%M"
        )

        booking = Booking(
            token=generate_unique_token(db),
            worker_id=worker.id,
            provider_id=current_user.id,
            location_id=int(location_id) if location_id else None,
            address_line=address_line,
            location_notes=location_notes,
            voice_note_url=voice_note_url,
            booking_type="wfh",
            status="WFH_PENDING_PRICE",
            description=description,
            skill_name=skill.name,
            expected_price=expected_price,
            deadline=deadline,
            price_status="pending",
        )

    else:
        if rate_type_norm == "per hour":
            hours = float(form.get("hours") or 0)
            minutes = float(form.get("minutes") or 0)
            quantity = hours + minutes / 60
        else:
            quantity = float(form.get("quantity") or 0)

        if quantity <= 0:
            raise HTTPException(status_code=400, detail="Invalid quantity")

        booking = Booking(
            token=generate_unique_token(db),
            worker_id=worker.id,
            provider_id=current_user.id,
            location_id=int(location_id) if location_id else None,
            address_line=address_line,
            location_notes=location_notes,
            voice_note_url=voice_note_url,
            booking_type="onsite",
            status="Pending",
            payment_required=True,
            payment_completed=False,
            description=description,
            skill_name=skill.name,
            rate=float(skill.rate),
            rate_type=skill.rate_type,
            quantity=quantity,
            expires_at=datetime.utcnow() + timedelta(minutes=1),
        )

    db.add(booking)


    db.commit()
    db.refresh(booking)

    return booking

@router.post("/api/flutter/confirm_booking/{worker_id}")
async def confirm_booking_flutter(
    worker_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    booking = await _create_booking_internal(
        worker_id=worker_id,
        request=request,
        current_user=current_user,
        db=db,
    )


    # -----------------------------
    # CREATE NOTIFICATION (MISSING)
    # -----------------------------

    worker = db.get(User, worker_id)

    # distance
    try:
        distance_km = round(
            geodesic(
                (current_user.latitude, current_user.longitude),
                (worker.latitude, worker.longitude),
            ).km,
            2,
        )
    except Exception:
        distance_km = "Unknown"

    # quantity text
    if booking.booking_type == "wfh":
        quantity_text = "WFH job"
    else:
        rt = (booking.rate_type or "").lower()

        if rt == "per hour":
            hrs = int(booking.quantity)
            mins = int(round((booking.quantity - hrs) * 60))

            parts = []
            if hrs > 0:
                parts.append(f"{hrs} hr")
            if mins > 0 or hrs == 0:
                parts.append(f"{mins} min")

            quantity_text = " ".join(parts)

        else:
            unit = rt.replace("per ", "")
            quantity_text = f"{booking.quantity} {unit}"

    message = (
        f"📢 <b>New booking request</b><br>"
        f"🧰 <b>Skill:</b> {booking.skill_name.title()}<br>"
        f"🕒 <b>Requested:</b> {quantity_text}<br>"
        f"📍 <b>Distance:</b> {distance_km} km<br>"
        f"📝 <b>Job Description:</b> {booking.description[:150]}"
    )

    notif = Notification(
        recipient_id=worker.id,
        sender_id=current_user.id,
        message=message,
        action_type="wfh_booking" if booking.booking_type == "wfh" else "booking_request",
        job_id=booking.job_id,
        booking_id=booking.id,
    )

    db.add(notif)
    db.commit()

    # -----------------------------
    # RESPONSE
    # -----------------------------

    return JSONResponse({
        "success": True,
        "booking_id": booking.id,
        "token": booking.token,
        "status": booking.status,
        "booking_type": booking.booking_type,
    })
