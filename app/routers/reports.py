from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models import Account, JournalLine
from sqlalchemy import extract
from fastapi import HTTPException
from decimal import Decimal
from app.razor_client import client as razor
from app.models import JournalEntry


router = APIRouter(tags=["reports"])

@router.get("/reports/balance-sheet")
def get_balance_sheet(db: Session = Depends(get_db)):
    rows = (
        db.query(
            Account.type,
            Account.name,
            func.coalesce(func.sum(JournalLine.debit - JournalLine.credit), 0).label("balance")
        )
        .outerjoin(JournalLine, Account.id == JournalLine.account_id)
        .group_by(Account.type, Account.name)
        .all()
    )

    result = {"ASSET": [], "LIABILITY": [], "REVENUE": [], "EXPENSE": []}

    for r in rows:
        result[r.type].append({
            "account": r.name,
            "balance": float(r.balance)
        })

    return result


@router.get("/reports/monthly-profit")
def monthly_profit(year: int, db: Session = Depends(get_db)):
    commission_account = db.query(Account).filter_by(name="Commission Revenue").first()

    if not commission_account:
        raise HTTPException(500, "Commission account missing")

    rows = (
        db.query(
            extract("month", JournalEntry.created_at).label("month"),
            func.sum(JournalLine.credit).label("revenue")
        )
        .join(JournalEntry, JournalLine.journal_id == JournalEntry.id)
        .filter(
            JournalLine.account_id == commission_account.id,
            extract("year", JournalEntry.created_at) == year
        )
        .group_by("month")
        .order_by("month")
        .all()
    )

    return [
        {"month": int(r.month), "revenue": float(r.revenue or 0)}
        for r in rows
    ]

@router.get("/reports/reconciliation")
def reconcile(db: Session = Depends(get_db)):
    settlements = razor.settlement.all().get("items", [])

    results = []

    for s in settlements:
        settlement_id = s.get("id")
        amount = Decimal(str(s.get("amount", 0))) / 100

        entries = db.query(JournalEntry).filter_by(settlement_id=settlement_id).all()

        system_amount = Decimal("0")
        for e in entries:
            for line in e.lines:
                system_amount += Decimal(line.debit or 0)

        results.append({
            "settlement_id": settlement_id,
            "razorpay_amount": float(amount),
            "system_amount": float(system_amount),
            "match": float(amount) == float(system_amount)
        })

    return results

from app.services.razorpay_reconcile import reconcile_settlements

@router.post("/reports/reconcile-settlements")
def reconcile_api(db: Session = Depends(get_db)):
    return reconcile_settlements(db)