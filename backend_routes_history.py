"""Activity history routes.

Provides endpoints for logging, querying, and managing user activity history.
The history collection is append-only per Firestore security rules — users can
create and read entries but may not update or delete them.  A dedicated cleanup
endpoint is reserved for server-side housekeeping.
"""

from typing import Optional
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Header, Query, Request
from firebase_admin import firestore

from ..routes.auth import verify_token
from ..config import settings

router = APIRouter(prefix="/api/history", tags=["history"])

# ----- helpers ---------------------------------------------------------------


def get_db() -> firestore.firestore.Client:
    from ..main import db
    return db


VALID_ACTIONS = frozenset({
    "create_project",
    "edit_project",
    "delete_project",
    "duplicate_project",
    "render",
    "render_completed",
    "render_failed",
    "export",
    "import",
    "update_settings",
    "upload_image",
    "upload_audio",
    "upload_video",
    "use_template",
    "login",
    "signup",
    "password_reset",
    "profile_update",
})


# ----- endpoints --------------------------------------------------------------


@router.get("/")
async def list_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    action: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None, alias="projectId"),
    days: Optional[int] = Query(None, ge=1, le=365),
    authorization: Optional[str] = Header(None),
):
    """List activity history for the authenticated user.

    Supports optional filtering by ``action`` type, ``projectId``, and a time
    window (``days`` — entries newer than N days).  Results are always
    ordered by ``createdAt`` descending.
    """
    user_data = await verify_token(authorization)
    uid = user_data["uid"]

    db = get_db()
    base_query = db.collection("history").where("userId", "==", uid)

    if action:
        if action not in VALID_ACTIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid action filter. Must be one of: {sorted(VALID_ACTIONS)}",
            )
        base_query = base_query.where("action", "==", action)

    if project_id:
        base_query = base_query.where("projectId", "==", project_id)

    if days is not None:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        base_query = base_query.where("createdAt", ">=", cutoff)

    # Apply ordering.  Firestore requires the same direction for all order-by
    # clauses, so we use the most common pattern: createdAt DESC.
    try:
        ordered = base_query.order_by("createdAt", direction=firestore.Query.DESCENDING)
    except Exception:
        # Composite index missing — fall back to client-side sort.
        ordered = base_query

    total_docs = list(ordered.get())
    total = len(total_docs)

    # Pagination
    offset = (page - 1) * limit
    page_docs = total_docs[offset : offset + limit]

    entries = []
    for doc in page_docs:
        data = doc.to_dict()
        entries.append({
            "id": doc.id,
            "userId": data.get("userId", ""),
            "projectId": data.get("projectId"),
            "action": data.get("action", ""),
            "details": data.get("details", ""),
            "createdAt": data.get("createdAt"),
        })

    return {
        "items": entries,
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": (page * limit) < total,
    }


@router.get("/stats")
async def history_stats(
    days: int = Query(30, ge=1, le=365),
    authorization: Optional[str] = Header(None),
):
    """Aggregate statistics about the user's activity.

    Returns per-action counts and a simple daily-breakdown for the last N days,
    useful for building activity dashboards and streak trackers.
    """
    user_data = await verify_token(authorization)
    uid = user_data["uid"]

    db = get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    query = (
        db.collection("history")
        .where("userId", "==", uid)
        .where("createdAt", ">=", cutoff)
    )
    docs = list(query.get())

    action_counts: dict[str, int] = {}
    daily_counts: dict[str, int] = {}
    project_counts: dict[str, int] = {}
    total = len(docs)

    for doc in docs:
        data = doc.to_dict()
        action = data.get("action", "unknown")
        action_counts[action] = action_counts.get(action, 0) + 1

        # Daily bucket — just the date portion (YYYY-MM-DD).
        created_at = data.get("createdAt", "")
        if isinstance(created_at, str) and len(created_at) >= 10:
            day_key = created_at[:10]
        else:
            day_key = "unknown"
        daily_counts[day_key] = daily_counts.get(day_key, 0) + 1

        pid = data.get("projectId")
        if pid:
            project_counts[pid] = project_counts.get(pid, 0) + 1

    # Sort daily counts chronologically.
    sorted_daily = dict(sorted(daily_counts.items()))

    # Find the most active project.
    most_active_project = None
    if project_counts:
        most_active_project = max(project_counts, key=project_counts.get)

    return {
        "total_entries": total,
        "period_days": days,
        "action_counts": action_counts,
        "daily_counts": sorted_daily,
        "unique_projects": len(project_counts),
        "most_active_project": most_active_project,
    }


@router.get("/streak")
async def activity_streak(
    authorization: Optional[str] = Header(None),
):
    """Calculate the user's current and longest activity streaks.

    A "day" counts if the user has at least one history entry on that calendar
    day (UTC).  Returns both the running streak (counting back from today) and
    the all-time longest streak.
    """
    user_data = await verify_token(authorization)
    uid = user_data["uid"]

    db = get_db()
    query = (
        db.collection("history")
        .where("userId", "==", uid)
        .order_by("createdAt", direction=firestore.Query.DESCENDING)
    )
    docs = list(query.get())

    if not docs:
        return {"current_streak": 0, "longest_streak": 0, "active_days": 0}

    # Collect unique UTC dates.
    unique_dates: set[str] = set()
    for doc in docs:
        created_at = doc.to_dict().get("createdAt", "")
        if isinstance(created_at, str) and len(created_at) >= 10:
            unique_dates.add(created_at[:10])

    if not unique_dates:
        return {"current_streak": 0, "longest_streak": 0, "active_days": 0}

    sorted_dates = sorted(unique_dates, reverse=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    # Current streak: count consecutive days backwards from today/yesterday.
    current_streak = 0
    if sorted_dates[0] == today or sorted_dates[0] == yesterday:
        current_streak = 1
        expected = (datetime.strptime(sorted_dates[0], "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
        for date_str in sorted_dates[1:]:
            if date_str == expected:
                current_streak += 1
                expected = (datetime.strptime(expected, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
            else:
                break

    # Longest streak across all time.
    all_dates_sorted = sorted(unique_dates)
    longest_streak = 1
    run = 1
    for i in range(1, len(all_dates_sorted)):
        prev = datetime.strptime(all_dates_sorted[i - 1], "%Y-%m-%d")
        curr = datetime.strptime(all_dates_sorted[i], "%Y-%m-%d")
        if (curr - prev).days == 1:
            run += 1
        else:
            longest_streak = max(longest_streak, run)
            run = 1
    longest_streak = max(longest_streak, run)

    return {
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "active_days": len(unique_dates),
    }


@router.post("/")
async def create_history_entry(
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Create a new history entry.

    Accepts ``action``, optional ``projectId``, and optional ``details``.  The
    ``userId`` and ``createdAt`` fields are set server-side.
    """
    user_data = await verify_token(authorization)
    uid = user_data["uid"]

    body = await request.json()
    action = body.get("action", "").strip().lower()
    if not action:
        raise HTTPException(status_code=400, detail="'action' is required")
    if action not in VALID_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid action '{action}'. Must be one of: {sorted(VALID_ACTIONS)}",
        )

    project_id = body.get("projectId")
    details = body.get("details", "").strip()

    # Limit detail length to keep document sizes reasonable.
    MAX_DETAILS_LEN = 2000
    if len(details) > MAX_DETAILS_LEN:
        details = details[:MAX_DETAILS_LEN - 3] + "..."

    now = datetime.now(timezone.utc).isoformat()
    import uuid
    entry_id = uuid.uuid4().hex

    entry_data = {
        "userId": uid,
        "projectId": project_id,
        "action": action,
        "details": details,
        "createdAt": now,
    }

    db = get_db()
    db.collection("history").document(entry_id).set(entry_data)

    return {
        "id": entry_id,
        **entry_data,
    }


@router.post("/bulk")
async def create_bulk_history(
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """Create multiple history entries in a single request.

    Useful for re-syncing activity or importing from another source.  Each
    entry is validated individually; invalid entries are skipped and reported.
    """
    user_data = await verify_token(authorization)
    uid = user_data["uid"]

    body = await request.json()
    entries = body.get("entries", [])
    if not isinstance(entries, list) or not entries:
        raise HTTPException(status_code=400, detail="'entries' must be a non-empty array")
    if len(entries) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 entries per bulk request")

    now = datetime.now(timezone.utc).isoformat()
    import uuid

    db = get_db()
    created = []
    skipped = []

    for idx, entry in enumerate(entries):
        if not isinstance(entry, dict):
            skipped.append({"index": idx, "reason": "not an object"})
            continue

        action = str(entry.get("action", "")).strip().lower()
        if not action or action not in VALID_ACTIONS:
            skipped.append({"index": idx, "reason": f"invalid action '{action}'"})
            continue

        details = str(entry.get("details", "")).strip()
        MAX_DETAILS_LEN = 2000
        if len(details) > MAX_DETAILS_LEN:
            details = details[:MAX_DETAILS_LEN - 3] + "..."

        entry_id = uuid.uuid4().hex
        entry_data = {
            "userId": uid,
            "projectId": entry.get("projectId"),
            "action": action,
            "details": details,
            "createdAt": now,
        }
        db.collection("history").document(entry_id).set(entry_data)
        created.append({"id": entry_id, "action": action})

    return {
        "created_count": len(created),
        "skipped_count": len(skipped),
        "created": created,
        "skipped": skipped,
    }


@router.get("/project/{project_id}")
async def project_history(
    project_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    authorization: Optional[str] = Header(None),
):
    """List all history entries for a specific project.

    Requires that the calling user owns the project.
    """
    user_data = await verify_token(authorization)
    uid = user_data["uid"]

    db = get_db()

    # Verify project ownership.
    project_doc = db.collection("projects").document(project_id).get()
    if not project_doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")
    if project_doc.to_dict().get("userId") != uid:
        raise HTTPException(status_code=403, detail="Access denied")

    query = (
        db.collection("history")
        .where("userId", "==", uid)
        .where("projectId", "==", project_id)
        .order_by("createdAt", direction=firestore.Query.DESCENDING)
        .offset((page - 1) * limit)
        .limit(limit)
    )

    docs = list(query.get())
    entries = []
    for doc in docs:
        data = doc.to_dict()
        entries.append({
            "id": doc.id,
            "userId": data.get("userId", ""),
            "projectId": data.get("projectId"),
            "action": data.get("action", ""),
            "details": data.get("details", ""),
            "createdAt": data.get("createdAt"),
        })

    # Total count for pagination.
    count_query = (
        db.collection("history")
        .where("userId", "==", uid)
        .where("projectId", "==", project_id)
    )
    total = len(list(count_query.get()))

    return {
        "project_id": project_id,
        "items": entries,
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": (page * limit) < total,
    }


@router.delete("/cleanup")
async def cleanup_old_history(
    days: int = Query(90, ge=30, le=730),
    authorization: Optional[str] = Header(None),
):
    """Remove history entries older than *days* for the authenticated user.

    This is the only mutation that deletes history documents.  It exists because
    the Firestore security rules prevent client-side deletes on the ``history``
    collection — only the backend (admin SDK) may remove old entries.
    """
    user_data = await verify_token(authorization)
    uid = user_data["uid"]

    db = get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    query = (
        db.collection("history")
        .where("userId", "==", uid)
        .where("createdAt", "<", cutoff)
    )
    docs = list(query.get())

    deleted = 0
    batch_size = 500  # Firestore batch write limit.
    for i in range(0, len(docs), batch_size):
        batch = db.batch()
        chunk = docs[i : i + batch_size]
        for doc in chunk:
            batch.delete(doc.reference)
        batch.commit()
        deleted += len(chunk)

    return {
        "message": f"Deleted {deleted} history entries older than {days} days",
        "deleted_count": deleted,
        "cutoff_date": cutoff,
    }


@router.get("/timeline/{project_id}")
async def project_timeline(
    project_id: str,
    authorization: Optional[str] = Header(None),
):
    """Return a compact timeline of all events for a project.

    Unlike the paginated ``/project/{project_id}`` endpoint, this returns
    *all* entries (up to 500) as a lightweight list suitable for building a
    timeline UI component.
    """
    user_data = await verify_token(authorization)
    uid = user_data["uid"]

    db = get_db()

    # Verify ownership.
    project_doc = db.collection("projects").document(project_id).get()
    if not project_doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")
    if project_doc.to_dict().get("userId") != uid:
        raise HTTPException(status_code=403, detail="Access denied")

    query = (
        db.collection("history")
        .where("userId", "==", uid)
        .where("projectId", "==", project_id)
        .order_by("createdAt", direction=firestore.Query.DESCENDING)
        .limit(500)
    )

    docs = list(query.get())
    timeline = []
    for doc in docs:
        data = doc.to_dict()
        timeline.append({
            "action": data.get("action", ""),
            "details": data.get("details", ""),
            "createdAt": data.get("createdAt", ""),
        })

    return {
        "project_id": project_id,
        "timeline": timeline,
        "total_events": len(timeline),
    }
