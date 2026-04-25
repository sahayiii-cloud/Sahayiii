# app/main.py
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from fastapi.templating import Jinja2Templates
from .settings import settings
from .database import ensure_db_and_tables
from pathlib import Path
from dotenv import load_dotenv
import asyncio
from app.database import SessionLocal
from app.services.wfh_escrow import release_expired_wfh_escrows
from fastapi import Request, HTTPException
from fastapi.responses import RedirectResponse,JSONResponse
from starlette.status import HTTP_303_SEE_OTHER
# Routers
from app.routers import (
    pages,
    auth,
    auth_pages,
    otp,
    warnings,
    warnings_check,
    payment_history,
    bookings,
    booking_details,
    booking_actions,
    realtime_jobs,
    worker_profile,
    book_again,
    wallet,
    wallet_pages,
    location,
    notifications,
    welcome,
    jobs,
    calls,
    worker_and_negotiation,
    payments_calls,
    wfh_bookings,
    report,
    auth_api,
    worker,
    welcome_api,
    location_api,
    reports,
)

from app.routers.admin_refund import router as admin_refund_router
from app import actions
from app import dev_auth
from app.services.moderation_refresh import refresh_worker_moderation
from app.services.scheduler import start_scheduler

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)

app = FastAPI(title="Trust API (FastAPI + PostgreSQL)")


@app.on_event("startup")
def startup_event():
    start_scheduler()

# Sessions
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)

# Static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Templates
templates = Jinja2Templates(directory="app/templates")

# Ensure upload dir exists
settings.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)


# Background escrow loop
async def escrow_loop():
    while True:
        db = SessionLocal()
        try:
            release_expired_wfh_escrows(db)
        except Exception:
            db.rollback()
        finally:
            db.close()

        await asyncio.sleep(60)



async def moderation_loop():
    while True:

        try:
            refresh_worker_moderation()
        except Exception as e:
            print("Moderation refresh error:", e)

        await asyncio.sleep(3600)


from fastapi.responses import JSONResponse

@app.exception_handler(HTTPException)
async def global_auth_exception_handler(request: Request, exc: HTTPException):

    # ✅ IMPORTANT: DO NOT REDIRECT FOR API CALLS
    if request.url.path.startswith("/api"):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail}
        )

    # 🔴 Suspended / banned → redirect (WEB ONLY)
    if exc.status_code == 403 and exc.detail in ("account_suspended", "account_banned"):
        request.session.clear()
        return RedirectResponse(
            url=f"/login?error={exc.detail}",
            status_code=HTTP_303_SEE_OTHER,
        )

    # 🔵 Not authenticated → redirect (WEB ONLY)
    if exc.status_code == 401:
        request.session.clear()
        return RedirectResponse(
            url="/login",
            status_code=HTTP_303_SEE_OTHER,
        )

    raise exc

# -----------------------------
# ROUTER ORDER (CRITICAL)
# -----------------------------

# Admin & pages
app.include_router(admin_refund_router)
app.include_router(pages.router)
app.include_router(auth.router)
app.include_router(auth_pages.router)
app.include_router(auth_api.router)
app.include_router(reports.router)

# Static / specific routes
app.include_router(wfh_bookings.router)
app.include_router(bookings.router)
app.include_router(booking_details.router)
app.include_router(booking_actions.router)
app.include_router(report.router)

# Notifications & realtime
app.include_router(notifications.router)
app.include_router(welcome.router)
app.include_router(realtime_jobs.router)
app.include_router(welcome_api.router, prefix="/api")

# Payments & wallet
app.include_router(wallet.router)
app.include_router(wallet_pages.router)
app.include_router(payment_history.router)
app.include_router(payments_calls.router)


# 🔥🔥🔥 WORKER ROUTES (STATIC FIRST)
app.include_router(worker_profile.router)   # /worker/availability

# ❌ Dynamic /worker/{id} routes AFTER
app.include_router(worker_and_negotiation.router)
app.include_router(calls.router)
app.include_router(jobs.router)

# Misc
app.include_router(location.router)
app.include_router(location_api.router)
app.include_router(warnings.router)
app.include_router(warnings_check.router)
app.include_router(otp.router)
app.include_router(otp.legacy_router)

# Actions
app.include_router(actions.router)
app.include_router(book_again.router)
app.include_router(worker.router)


# Dev auth
if settings.ALLOW_DEV_TOKENS:
    app.include_router(dev_auth.router)


@app.on_event("startup")
async def startup():
    ensure_db_and_tables()
    asyncio.create_task(escrow_loop())
    asyncio.create_task(moderation_loop())