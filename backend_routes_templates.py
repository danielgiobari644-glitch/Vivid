"""Template routes."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Header
from firebase_admin import firestore
from ..routes.auth import verify_token
import re

router = APIRouter(prefix="/api/templates", tags=["templates"])

CATEGORY_SLUG_MAP = {
    "YouTube Shorts": "youtube-shorts",
    "TikTok": "tiktok",
    "Instagram Reels": "instagram-reels",
    "Facebook Videos": "facebook-videos",
    "Church Announcements": "church-announcements",
    "Event Promotions": "event-promotions",
    "Bible Verse Videos": "bible-verse-videos",
    "Testimony Videos": "testimony-videos",
    "Quote Videos": "quote-videos",
    "Worship Backgrounds": "worship-backgrounds",
}


def get_db() -> firestore.firestore.Client:
    from ..main import db
    return db


def _serialize_template(doc_id: str, data: dict) -> dict:
    return {
        "id": doc_id,
        "name": data.get("name", ""),
        "description": data.get("description"),
        "category": data.get("category", ""),
        "thumbnail": data.get("thumbnail"),
        "aspectRatio": data.get("aspectRatio", "16:9"),
        "images": data.get("images", []),
        "texts": data.get("texts", []),
        "audio": data.get("audio"),
        "settings": data.get("settings", {}),
        "isPremium": data.get("isPremium", False),
        "downloadCount": data.get("downloadCount", 0),
        "rating": data.get("rating", 0.0),
    }


@router.get("/")
async def list_templates(
    category: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """List all templates, optionally filtered by category."""
    db = get_db()

    if category:
        query = (db.collection("templates")
                 .where("category", "==", category)
                 .order_by("downloadCount", direction=firestore.Query.DESCENDING)
                 .offset((page - 1) * limit)
                 .limit(limit))
        count_query = db.collection("templates").where("category", "==", category)
    else:
        query = (db.collection("templates")
                 .order_by("downloadCount", direction=firestore.Query.DESCENDING)
                 .offset((page - 1) * limit)
                 .limit(limit))
        count_query = db.collection("templates")

    docs = query.get()
    templates = [_serialize_template(doc.id, doc.to_dict()) for doc in docs]
    total = len(list(count_query.get()))

    return {
        "items": templates,
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": (page * limit) < total,
    }


@router.get("/{template_id}")
async def get_template(template_id: str):
    """Get a template by ID."""
    db = get_db()
    doc = db.collection("templates").document(template_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Template not found")
    return _serialize_template(template_id, doc.to_dict())


@router.get("/categories")
async def list_categories():
    """List all available template categories."""
    db = get_db()
    categories = []

    for name, slug in CATEGORY_SLUG_MAP.items():
        count_query = db.collection("templates").where("category", "==", name)
        count = len(list(count_query.get()))
        categories.append({
            "name": name,
            "slug": slug,
            "count": count,
            "thumbnail": None,
        })

    return categories
