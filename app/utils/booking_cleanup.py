# app/utils/booking_cleanup.py

from datetime import datetime
from sqlalchemy import func
from app.models import Booking, User


def cleanup_expired_unpaid_bookings(db):
    """
    Cancel expired unpaid Accepted bookings
    and free worker + provider
    """

    expired = db.query(Booking).filter(
        Booking.status == "Accepted",
        Booking.payment_required == True,
        Booking.payment_completed == False,
        Booking.expires_at != None,
        Booking.expires_at < datetime.utcnow()
    ).all()

    for booking in expired:

        # Cancel booking
        booking.status = "Cancelled"
        booking.payment_required = False
        booking.payment_completed = False
        booking.razorpay_status = None

        # Free worker
        if booking.worker:
            booking.worker.busy = False

        # Free provider
        if booking.provider:
            booking.provider.busy = False

    if expired:
        db.commit()
