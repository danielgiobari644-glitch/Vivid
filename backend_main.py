"""GIODAI Backend - AI Image-to-Video Creator.

FastAPI application with Firebase Admin SDK, video rendering, and project management.
"""

import os
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .routes import auth, projects, templates, video, generate

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global references
db = None
firebase_app = None


def initialize_firebase():
    """Initialize Firebase Admin SDK."""
    global firebase_app, db
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        if firebase_admin._apps:
            firebase_app = firebase_admin.get_app()
            logger.info("Firebase app already initialized")
        else:
            cred_dict = {
                "type": "service_account",
                "project_id": settings.FIREBASE_PROJECT_ID,
                "private_key": settings.FIREBASE_PRIVATE_KEY.replace("\\n", "\n"),
                "client_email": settings.FIREBASE_CLIENT_EMAIL,
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{settings.FIREBASE_CLIENT_EMAIL}",
            }
            cred = credentials.Certificate(cred_dict)
            firebase_app = firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin SDK initialized successfully")

        db = firestore.client()
        logger.info("Firestore client initialized")
    except Exception as e:
        logger.warning(f"Firebase initialization failed (running in dev mode): {e}")
        db = None
        firebase_app = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown events."""
    # Startup
    logger.info("Starting GIODAI Backend...")
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.TEMP_DIR, exist_ok=True)
    initialize_firebase()
    logger.info("GIODAI Backend started successfully")
    yield
    # Shutdown
    logger.info("Shutting down GIODAI Backend...")
    from .services.video_renderer import video_renderer
    video_renderer._executor.shutdown(wait=False)
    logger.info("GIODAI Backend shut down")


app = FastAPI(
    title="GIODAI API",
    description="AI Image-to-Video Creator Backend",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for uploads
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
try:
    app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
except Exception:
    pass

# Include routers
app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(templates.router)
app.include_router(video.router)
app.include_router(generate.router)


# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# Health check
@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    import datetime
    return {
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "firebase": firebase_app is not None,
        "environment": settings.ENVIRONMENT,
    }


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "GIODAI API",
        "version": "1.0.0",
        "description": "AI Image-to-Video Creator Backend",
        "docs": "/docs",
        "health": "/api/health",
    }
