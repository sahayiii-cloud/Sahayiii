from decimal import Decimal

MAX_COMMISSION = Decimal("5000")  # keep here or move to config later

def calculate_commission(base: Decimal):
    base = base.quantize(Decimal("0.01"))

    # ---- Tiered pricing ----
    if base <= 50000:
        giver_rate = Decimal("0.05")
        worker_rate = Decimal("0.05")
    elif base <= 100000:
        giver_rate = Decimal("0.04")
        worker_rate = Decimal("0.04")
    else:
        giver_rate = Decimal("0.03")
        worker_rate = Decimal("0.03")

    giver_commission = (base * giver_rate).quantize(Decimal("0.01"))
    worker_commission = (base * worker_rate).quantize(Decimal("0.01"))

    # ---- Apply cap ----
    giver_commission = min(giver_commission, MAX_COMMISSION)
    worker_commission = min(worker_commission, MAX_COMMISSION)

    return giver_commission, worker_commission