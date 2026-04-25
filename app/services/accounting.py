def create_journal_entry(db, booking_id, reference, lines):
    from app.models import JournalEntry, JournalLine, Account
    from decimal import Decimal

    # ✅ Prevent duplicate entries
    existing = db.query(JournalEntry).filter_by(reference=reference).first()
    if existing:
        return existing

    # ✅ Ensure balanced BEFORE hitting DB
    total_debit = sum(Decimal(str(a)) for _, t, a in lines if t == "debit")
    total_credit = sum(Decimal(str(a)) for _, t, a in lines if t == "credit")

    if total_debit != total_credit:
        raise Exception(f"Journal not balanced: {total_debit} != {total_credit}")

    # ✅ Create journal entry
    entry = JournalEntry(
        reference=reference,
        booking_id=booking_id,
        settlement_id=None
    )
    db.add(entry)

    # ✅ CRITICAL: get entry.id without triggering line insert issues
    db.flush([entry])

    # ✅ ACCOUNT TYPE MAP
    ACCOUNT_TYPE_MAP = {
        "Cash/Bank": "asset",
        "Bank Account": "asset",
        "Authorized Payments": "asset",

        "Escrow Liability": "liability",
        "Worker Payable": "liability",

        "Commission Revenue": "revenue",
        "Platform Revenue": "revenue",
    }

    # ✅ Add journal lines
    for name, typ, amount in lines:

        account = db.query(Account).filter_by(name=name).first()

        if not account:
            account = Account(
                name=name,
                type=ACCOUNT_TYPE_MAP.get(name, "other")
            )
            db.add(account)

            # ✅ get account.id safely
            db.flush([account])

        amt = Decimal(str(amount)).quantize(Decimal("0.01"))

        line = JournalLine(
            journal_id=entry.id,   # ✅ now guaranteed valid
            account_id=account.id,
            debit=amt if typ == "debit" else Decimal("0.00"),
            credit=amt if typ == "credit" else Decimal("0.00")
        )

        db.add(line)

    # ✅ FINAL flush (all lines together → trigger passes)
    db.flush()

    return entry