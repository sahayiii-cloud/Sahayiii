from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from app.models import JournalEntry, JournalLine, Account
from app.services.email_service import send_email
from app.services.pdf_report import generate_pdf_report
import os

def generate_daily_report(db: Session):
    today = datetime.utcnow().date()
    start = datetime.combine(today, datetime.min.time())
    end = datetime.combine(today, datetime.max.time())

    # Get accounts
    revenue_acc = db.query(Account).filter_by(name="Commission Revenue").first()
    bank_acc = db.query(Account).filter_by(name="Bank Account").first()
    escrow_acc = db.query(Account).filter_by(name="Escrow Liability").first()

    # Revenue
    revenue = db.query(func.sum(JournalLine.credit)).join(JournalEntry).filter(
        JournalLine.account_id == revenue_acc.id,
        JournalEntry.created_at >= start,
        JournalEntry.created_at <= end
    ).scalar() or 0

    # Total money received
    total_payments = db.query(func.sum(JournalLine.debit)).join(JournalEntry).filter(
        JournalLine.account_id == bank_acc.id,
        JournalEntry.created_at >= start,
        JournalEntry.created_at <= end
    ).scalar() or 0

    # Escrow balance (current)
    escrow_balance = db.query(func.sum(JournalLine.credit - JournalLine.debit)).filter(
        JournalLine.account_id == escrow_acc.id
    ).scalar() or 0

    # Transactions count
    tx_count = db.query(JournalEntry).filter(
        JournalEntry.created_at >= start,
        JournalEntry.created_at <= end
    ).count()

    body = f"""
Daily Report ({today})

Revenue: ₹{float(revenue):,.2f}
Total Payments: ₹{float(total_payments):,.2f}
Escrow Held: ₹{float(escrow_balance):,.2f}
Transactions: {tx_count}
"""

    # ✅ generate PDF file
    file_path = f"/tmp/daily_report_{today}.pdf"

    generate_pdf_report({
        "revenue": float(revenue),
        "payments": float(total_payments),
        "escrow": float(escrow_balance),
        "transactions": tx_count
    }, file_path)

    # ✅ send email with attachment
    send_email(
        subject=f"Daily Report - {today}",
        body=body,
        attachment_path=file_path
    )

    # optional cleanup
    try:
        os.remove(file_path)
    except:
        pass

    return {
        "revenue": float(revenue),
        "payments": float(total_payments),
        "escrow": float(escrow_balance),
        "transactions": tx_count
    }