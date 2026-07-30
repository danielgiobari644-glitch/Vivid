"""Video rendering and upload routes."""

import os
import uuid
import base64
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Header, Form
from fastapi.responses import FileResponse
from ..routes.auth import verify_token
from ..services.video_renderer import video_renderer
from ..services.image_processor import image_processor
from ..services.audio_processor import audio_processor
from ..config import settings

router = APIRouter(prefix="/api/video", tags=["video"])


@router.post("/render")
async def render_video(authorization: Optional[str] = Header(None), body: dict = None):
    """Start a video render job."""
    user_data = await verify_token(authorization)
    uid = user_data["uid"]

    if body is None:
        raise HTTPException(status_code=400, detail="Request body is required")

    images = body.get("images", [])
    if not images:
        raise HTTPException(status_code=400, detail="At least one image is required")

    total_duration = sum(float(img.get("duration", 3.0)) for img in images)
    if total_duration > settings.MAX_RENDER_DURATION:
        raise HTTPException(
            status_code=400,
            detail=f"Total duration exceeds maximum of {settings.MAX_RENDER_DURATION} seconds"
        )

    render_id = video_renderer.render(body)

    return {
        "render_id": render_id,
        "status": "pending",
        "message": "Render job started",
    }


@router.get("/status/{render_id}")
async def get_render_status(render_id: str):
    """Check the status of a render job."""
    status = video_renderer.get_status(render_id)

    if status.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Render job not found")

    response = {
        "render_id": render_id,
        "status": status.get("status", "unknown"),
        "progress": status.get("progress", 0),
        "download_url": status.get("download_url"),
        "error": status.get("error"),
    }

    if status.get("started_at"):
        elapsed = __import__("time").time() - status["started_at"]
        progress = status.get("progress", 0)
        if progress > 0 and progress < 100:
            remaining = int((elapsed / progress) * (100 - progress))
            response["estimated_time_remaining"] = remaining

    return response


@router.get("/download/{render_id}")
async def download_video(render_id: str):
    """Download a rendered video file."""
    status = video_renderer.get_status(render_id)

    if status.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Render job not found")

    if status.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Video is not ready yet")

    file_path = f"uploads/{render_id}.mp4"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video file not found")

    return FileResponse(
        path=file_path,
        media_type="video/mp4",
        filename=f"giodai_{render_id}.mp4",
    )


@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    """Upload an image file and return URL and metadata."""
    user_data = await verify_token(authorization)

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    file_data = await file.read()
    if len(file_data) > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum of {settings.MAX_FILE_SIZE // (1024*1024)}MB"
        )

    try:
        result = image_processor.process_image(file_data, file.filename)
        image_id = uuid.uuid4().hex
        url = f"/api/video/image/{image_id}"

        image_processor._image_cache = getattr(image_processor, '_image_cache', {})
        image_processor._image_cache[image_id] = result["base64_data"]

        return {
            "url": url,
            "width": result["width"],
            "height": result["height"],
            "format": result["format"],
            "size": result["size"],
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process image: {str(e)}")


@router.post("/upload-audio")
async def upload_audio(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    """Upload an audio file and return URL and metadata."""
    user_data = await verify_token(authorization)

    if not file.content_type or not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="File must be an audio file")

    file_data = await file.read()
    if len(file_data) > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum of {settings.MAX_FILE_SIZE // (1024*1024)}MB"
        )

    try:
        result = audio_processor.process_audio(file_data, file.filename)
        audio_id = uuid.uuid4().hex
        url = f"/api/video/audio/{audio_id}"

        audio_processor._audio_cache = getattr(audio_processor, '_audio_cache', {})
        audio_processor._audio_cache[audio_id] = result["base64_data"]

        return {
            "url": url,
            "duration": result["duration"],
            "format": result["format"],
            "size": result["size"],
            "sample_rate": result["sample_rate"],
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process audio: {str(e)}")


@router.get("/image/{image_id}")
async def get_uploaded_image(image_id: str):
    """Retrieve an uploaded image by ID."""
    cache = getattr(image_processor, '_image_cache', {})
    if image_id not in cache:
        raise HTTPException(status_code=404, detail="Image not found")

    img_bytes = base64.b64decode(cache[image_id])
    from fastapi.responses import Response
    return Response(content=img_bytes, media_type="image/jpeg")


@router.get("/audio/{audio_id}")
async def get_uploaded_audio(audio_id: str):
    """Retrieve an uploaded audio file by ID."""
    cache = getattr(audio_processor, '_audio_cache', {})
    if audio_id not in cache:
        raise HTTPException(status_code=404, detail="Audio not found")

    audio_bytes = base64.b64decode(cache[audio_id])
    from fastapi.responses import Response
    return Response(content=audio_bytes, media_type="audio/mpeg")
