from apscheduler.schedulers.background import BackgroundScheduler
from app.database import SessionLocal
from app.services.razorpay_reconcile import reconcile_settlements
import os
import logging
from app.services.daily_report import generate_daily_report

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()

def run_reconciliation():
    db = SessionLocal()
    try:
        result = reconcile_settlements(db)
        logger.info(f"[RECONCILE] Updated: {result}")
    except Exception as e:
        logger.error(f"[RECONCILE ERROR]: {e}")
    finally:
        db.close()


def start_scheduler():
    if os.environ.get("RUN_MAIN") == "true" or not scheduler.running:
        scheduler.add_job(
            run_reconciliation,
            "interval",
            minutes=15,
            id="reconciliation_job",
            replace_existing=True
        )
        scheduler.add_job(
            run_daily_report,
            "cron",
            hour=23,
            minute=59,
            id="daily_report_job",
            replace_existing=True
        )
        scheduler.start()

def run_daily_report():
    db = SessionLocal()
    try:
        result = generate_daily_report(db)
        logger.info(f"[DAILY REPORT] {result}")
    except Exception as e:
        print(f"[REPORT ERROR]: {e}")
    finally:
        db.close()