from app.razor_client import client as razor
from app.models import JournalEntry
from sqlalchemy.orm import Session


def reconcile_settlements(db: Session):
    settlements = razor.settlement.all().get("items", [])

    updated = 0

    for settlement in settlements:
        settlement_id = settlement.get("id")

        payments = razor.settlement.fetch(settlement_id).get("payments", [])

        for p in payments:
            payment_id = p.get("id")

            entry = db.query(JournalEntry).filter_by(
                razorpay_payment_id=payment_id
            ).first()

            if entry and not entry.settlement_id:
                entry.settlement_id = settlement_id
                db.add(entry)
                updated += 1

    db.commit()
    return {"updated_entries": updated}