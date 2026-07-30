"""Project CRUD routes."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request, Query, Header
from firebase_admin import firestore
from ..routes.auth import verify_token
import datetime
import uuid
import copy

router = APIRouter(prefix="/api/projects", tags=["projects"])


def get_db() -> firestore.firestore.Client:
    from ..main import db
    return db


def _serialize_project(doc_id: str, data: dict) -> dict:
    """Convert a Firestore document to a response dictionary."""
    return {
        "id": doc_id,
        "userId": data.get("userId", ""),
        "name": data.get("name", ""),
        "description": data.get("description"),
        "aspectRatio": data.get("aspectRatio", "16:9"),
        "images": data.get("images", []),
        "texts": data.get("texts", []),
        "audio": data.get("audio"),
        "settings": data.get("settings", {}),
        "createdAt": data.get("createdAt"),
        "updatedAt": data.get("updatedAt"),
    }


def _clean_image(img: dict) -> dict:
    """Remove base64_data from image config for storage."""
    cleaned = {k: v for k, v in img.items() if k != "base64_data"}
    return cleaned


def _clean_text(txt: dict) -> dict:
    """Clean text config for storage."""
    return {k: v for k, v in txt.items() if v is not None}


def _clean_audio(audio: Optional[dict]) -> Optional[dict]:
    """Remove base64_data from audio config for storage."""
    if not audio:
        return None
    cleaned = {k: v for k, v in audio.items() if k != "base64_data"}
    return cleaned


@router.get("/")
async def list_projects(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    sort: str = Query("updatedAt", regex="^(updatedAt|createdAt|name)$"),
    authorization: Optional[str] = Header(None),
):
    """List all projects for the authenticated user."""
    user_data = await verify_token(authorization)
    uid = user_data["uid"]

    db = get_db()
    query = (db.collection("projects")
             .where("userId", "==", uid)
             .order_by(sort, direction=firestore.Query.DESCENDING)
             .offset((page - 1) * limit)
             .limit(limit))

    docs = query.get()
    projects = [_serialize_project(doc.id, doc.to_dict()) for doc in docs]

    count_query = db.collection("projects").where("userId", "==", uid)
    total = len(list(count_query.get()))

    return {
        "items": projects,
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": (page * limit) < total,
    }


@router.post("/")
async def create_project(request: Request, authorization: Optional[str] = Header(None)):
    """Create a new project."""
    user_data = await verify_token(authorization)
    uid = user_data["uid"]

    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Project name is required")

    now = datetime.datetime.utcnow().isoformat()
    project_id = uuid.uuid4().hex

    images = [_clean_image(img) for img in body.get("images", [])]
    texts = [_clean_text(txt) for txt in body.get("texts", [])]
    audio = _clean_audio(body.get("audio"))
    settings = body.get("settings", {})

    project_data = {
        "userId": uid,
        "name": name,
        "description": body.get("description", ""),
        "aspectRatio": body.get("aspectRatio", "16:9"),
        "images": images,
        "texts": texts,
        "audio": audio,
        "settings": settings,
        "createdAt": now,
        "updatedAt": now,
    }

    db = get_db()
    db.collection("projects").document(project_id).set(project_data)

    return _serialize_project(project_id, project_data)


@router.get("/{project_id}")
async def get_project(project_id: str, authorization: Optional[str] = Header(None)):
    """Get a project by ID."""
    user_data = await verify_token(authorization)
    uid = user_data["uid"]

    db = get_db()
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")

    data = doc.to_dict()
    if data.get("userId") != uid:
        raise HTTPException(status_code=403, detail="Access denied")

    return _serialize_project(project_id, data)


@router.put("/{project_id}")
async def update_project(project_id: str, request: Request, authorization: Optional[str] = Header(None)):
    """Update a project."""
    user_data = await verify_token(authorization)
    uid = user_data["uid"]

    db = get_db()
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")
    existing = doc.to_dict()
    if existing.get("userId") != uid:
        raise HTTPException(status_code=403, detail="Access denied")

    body = await request.json()
    now = datetime.datetime.utcnow().isoformat()
    update_data = {"updatedAt": now}

    if "name" in body and body["name"] is not None:
        update_data["name"] = body["name"].strip()
    if "description" in body and body["description"] is not None:
        update_data["description"] = body["description"]
    if "aspectRatio" in body and body["aspectRatio"] is not None:
        update_data["aspectRatio"] = body["aspectRatio"]
    if "images" in body and body["images"] is not None:
        update_data["images"] = [_clean_image(img) for img in body["images"]]
    if "texts" in body and body["texts"] is not None:
        update_data["texts"] = [_clean_text(txt) for txt in body["texts"]]
    if "audio" in body and body["audio"] is not None:
        update_data["audio"] = _clean_audio(body["audio"])
    if "settings" in body and body["settings"] is not None:
        update_data["settings"] = body["settings"]

    db.collection("projects").document(project_id).update(update_data)
    existing.update(update_data)

    return _serialize_project(project_id, existing)


@router.delete("/{project_id}")
async def delete_project(project_id: str, authorization: Optional[str] = Header(None)):
    """Delete a project and its subcollections."""
    user_data = await verify_token(authorization)
    uid = user_data["uid"]

    db = get_db()
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")
    data = doc.to_dict()
    if data.get("userId") != uid:
        raise HTTPException(status_code=403, detail="Access denied")

    subcollections = ["renders", "comments", "versions"]
    for sub in subcollections:
        subs = db.collection("projects").document(project_id).collection(sub).list_documents()
        for sub_doc in subs:
            sub_doc.delete()

    db.collection("projects").document(project_id).delete()

    return {"message": "Project deleted successfully"}


@router.post("/{project_id}/duplicate")
async def duplicate_project(project_id: str, authorization: Optional[str] = Header(None)):
    """Duplicate a project."""
    user_data = await verify_token(authorization)
    uid = user_data["uid"]

    db = get_db()
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")
    data = doc.to_dict()
    if data.get("userId") != uid:
        raise HTTPException(status_code=403, detail="Access denied")

    new_id = uuid.uuid4().hex
    now = datetime.datetime.utcnow().isoformat()
    new_data = copy.deepcopy(data)
    new_data["name"] = f"{data.get('name', 'Project')} (Copy)"
    new_data["createdAt"] = now
    new_data["updatedAt"] = now

    db.collection("projects").document(new_id).set(new_data)

    return _serialize_project(new_id, new_data)
