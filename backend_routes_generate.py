"""Generate router - AI image and video generation endpoints.

Provides endpoints for AI-powered image generation, batch generation,
style transfer, and project-to-video generation.
"""

import os
import uuid
import time
import logging
import base64
import random
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Header, Request, Query
from firebase_admin import firestore

from ..routes.auth import verify_token
from ..config import settings
from ..models.schemas import (
ImageStyle,
ImageGenerationStatus,
AspectRatio,
Resolution,
RenderStatus,
)

router = APIRouter(prefix="/api/generate", tags=["generate"])
logger = logging.getLogger(__name__)

# In-memory generation job store (production would use Firestore or a task queue)
_generation_jobs: Dict[str, dict] = {}
_batch_jobs: Dict[str, dict] = {}
_project_renders: Dict[str, dict] = {}


# --- Helpers ---


def get_db() -> firestore.firestore.Client:
"""Get Firestore client."""
from ..main import db
return db


def _get_resolution_dims(resolution: str, aspect_ratio: str = "16:9") -> tuple:
"""Calculate pixel dimensions from resolution and aspect ratio."""
res_map = {
    "720p": (1280, 720),
    "1080p": (1920, 1080),
    "4K": (3840, 2160),
}
base_w, base_h = res_map.get(resolution, (1024, 1024))

ar_map = {
    "16:9": (16 / 9),
    "9:16": (9 / 16),
    "1:1": 1.0,
    "4:5": (4 / 5),
    "3:2": (3 / 2),
}
target_ar = ar_map.get(aspect_ratio, 16 / 9)

if target_ar >= 1:
    w = base_w
    h = int(base_w / target_ar)
else:
    h = base_w
    w = int(base_w * target_ar)

# Round to nearest multiple of 64 (required by many image models)
w = max(256, (w // 64) * 64)
h = max(256, (h // 64) * 64)
return w, h


def _simulate_image_generation(job: dict):
"""Simulate an AI image generation job (placeholder for real AI service).

In production this would call an actual AI image generation API
(e.g. DALL-E, Stable Diffusion, Midjourney API, etc.).
"""
job["status"] = ImageGenerationStatus.GENERATING
job["started_at"] = time.time()

# Simulate processing time based on quality
quality_delays = {"draft": 1, "standard": 2, "high": 3, "ultra": 5}
delay = quality_delays.get(job.get("quality", "high"), 3)
time.sleep(delay)

w = job.get("width", 1024)
h = job.get("height", 1024)
num_variations = job.get("num_variations", 1)

# Generate placeholder images (solid color PNGs)
images = []
base_seed = job.get("seed") or random.randint(0, 2**32 - 1)

for i in range(num_variations):
    seed = base_seed + i
    # Create a minimal valid PNG (1x1 pixel, will be replaced by real AI service)
    png_bytes = _create_placeholder_png(w, h, seed)
    b64 = base64.b64encode(png_bytes).decode("utf-8")

    image_id = uuid.uuid4().hex
    images.append({
        "id": image_id,
        "url": f"/api/generate/image/{image_id}/file",
        "width": w,
        "height": h,
        "format": "png",
        "size_bytes": len(png_bytes),
        "seed": seed,
        "variation_index": i,
        "base64_data": b64,
    })

job["status"] = ImageGenerationStatus.COMPLETED
job["completed_at"] = time.time()
job["images"] = images
job["seed_used"] = base_seed

# Store generated images for retrieval
for img in images:
    _generation_jobs[f"img_{img['id']}"] = {
        "data": img["base64_data"],
        "width": img["width"],
        "height": img["height"],
    }


def _create_placeholder_png(width: int, height: int, seed: int) -> bytes:
"""Create a placeholder PNG image.

In production, this is replaced by an actual AI image generation call.
Creates a minimal valid PNG with the specified dimensions.
"""
try:
    from PIL import Image, ImageDraw
    import struct
    import zlib

    rng = random.Random(seed)
    r = rng.randint(40, 80)
    g = rng.randint(40, 80)
    b = rng.randint(60, 120)

    img = Image.new("RGB", (width, height), (r, g, b))
    draw = ImageDraw.Draw(img)

    # Draw a subtle grid pattern for visual distinction
    for x in range(0, width, 64):
        draw.line([(x, 0), (x, height)], fill=(r + 10, g + 10, b + 10), width=1)
    for y in range(0, height, 64):
        draw.line([(0, y), (width, y)], fill=(r + 10, g + 10, b + 10), width=1)

    # Draw a centered label
    text = f"GIODAI Generated ({width}x{height})"
    try:
        bbox = draw.textbbox((0, 0), text)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        draw.text(
            ((width - tw) // 2, (height - th) // 2),
            text,
            fill=(200, 200, 220),
        )
    except Exception:
        pass

    import io
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
except ImportError:
    # Fallback: minimal valid 1x1 PNG if Pillow is not available
    import struct, zlib
    def _chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack(">I", len(data)) + c + crc
    raw = b"\x00\x00\x00\x00\x00"
    compressed = zlib.compress(raw)
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n"
           + _chunk(b"IHDR", ihdr)
           + _chunk(b"IDAT", compressed)
           + _chunk(b"IEND", b""))
    return png


# --- Endpoints ---


@router.get("/status")
async def generation_status():
"""Check video generation service status."""
active_jobs = sum(
    1 for j in _generation_jobs.values()
    if j.get("type") == "single" and j.get("status") == ImageGenerationStatus.GENERATING
)
active_batches = sum(
    1 for j in _batch_jobs.values()
    if j.get("status") == ImageGenerationStatus.GENERATING
)
active_renders = sum(
    1 for j in _project_renders.values()
    if j.get("status") == RenderStatus.PROCESSING
)

return {
    "status": "available",
    "message": "Video generation service is ready",
    "active_image_jobs": active_jobs,
    "active_batch_jobs": active_batches,
    "active_project_renders": active_renders,
    "supported_styles": [s.value for s in ImageStyle],
    "supported_resolutions": [r.value for r in Resolution],
    "supported_aspect_ratios": [a.value for a in AspectRatio],
}


@router.get("/styles")
async def list_styles():
"""List all available AI image generation styles with descriptions."""
style_info = {
    ImageStyle.REALISTIC: {
        "name": "Realistic",
        "description": "Photorealistic images with natural lighting and detail",
        "examples": ["portrait photo", "landscape photography", "product shot"],
        "recommended_for": ["Social media posts", "Marketing materials", "Presentations"],
    },
    ImageStyle.ANIME: {
        "name": "Anime",
        "description": "Japanese animation style with vibrant colors and expressive characters",
        "examples": ["anime character", "manga style scene", "anime landscape"],
        "recommended_for": ["YouTube thumbnails", "Social content", "Fan art"],
    },
    ImageStyle.DIGITAL_ART: {
        "name": "Digital Art",
        "description": "Modern digital illustration with clean lines and vibrant colors",
        "examples": ["digital illustration", "concept art", "fantasy scene"],
        "recommended_for": ["Book covers", "Game assets", "Concept design"],
    },
    ImageStyle.OIL_PAINTING: {
        "name": "Oil Painting",
        "description": "Classic oil painting style with rich textures and brushstrokes",
        "examples": ["oil painting landscape", "classical portrait", "still life"],
        "recommended_for": ["Art prints", "Wall art", "Elegant presentations"],
    },
    ImageStyle.WATERCOLOR: {
        "name": "Watercolor",
        "description": "Soft watercolor painting with gentle color bleeds and transparency",
        "examples": ["watercolor flower", "watercolor cityscape", "botanical art"],
        "recommended_for": ["Invitations", "Greeting cards", "Decorative content"],
    },
    ImageStyle.SKETCH: {
        "name": "Sketch",
        "description": "Pencil or ink sketch with hand-drawn quality",
        "examples": ["pencil sketch portrait", "architectural drawing", "line art"],
        "recommended_for": ["Storyboards", "Wireframes", "Artistic content"],
    },
    ImageStyle.CYBERPUNK: {
        "name": "Cyberpunk",
        "description": "Futuristic cyberpunk aesthetic with neon lights and tech elements",
        "examples": ["cyberpunk city", "neon lit street", "futuristic character"],
        "recommended_for": ["Gaming content", "Tech branding", "Music visuals"],
    },
    ImageStyle.MINIMALIST: {
        "name": "Minimalist",
        "description": "Clean, simple design with minimal elements and negative space",
        "examples": ["minimalist design", "clean composition", "simple shapes"],
        "recommended_for": ["Logo backgrounds", "Social headers", "Clean layouts"],
    },
    ImageStyle.CINEMATIC: {
        "name": "Cinematic",
        "description": "Movie-quality still frames with dramatic lighting and composition",
        "examples": ["cinematic shot", "movie scene", "dramatic lighting"],
        "recommended_for": ["Video thumbnails", "Film content", "Dramatic visuals"],
    },
    ImageStyle.NONE: {
        "name": "Default",
        "description": "No specific style applied, uses the model's default output",
        "examples": ["any prompt", "natural generation", "unstyled"],
        "recommended_for": ["General use", "Testing", "Custom styling"],
    },
}

styles = []
for style_enum, info in style_info.items():
    styles.append({
        "id": style_enum.value,
        "name": info["name"],
        "description": info["description"],
        "examples": info["examples"],
        "recommended_for": info["recommended_for"],
    })

return {"styles": styles, "total": len(styles)}


@router.post("/image")
async def generate_image(
request: Request,
authorization: Optional[str] = Header(None),
):
"""Generate AI images from a text prompt.

Accepts a prompt and optional style, resolution, and other parameters.
Returns a generation_id that can be polled for status.
"""
user_data = await verify_token(authorization)
uid = user_data["uid"]

body = await request.json()
prompt = body.get("prompt", "").strip()
if not prompt:
    raise HTTPException(status_code=400, detail="Prompt is required")
if len(prompt) > 2000:
    raise HTTPException(status_code=400, detail="Prompt must be 2000 characters or less")

# Parse parameters
style = body.get("style", "none")
if style not in [s.value for s in ImageStyle]:
    raise HTTPException(
        status_code=400,
        detail=f"Invalid style. Must be one of: {[s.value for s in ImageStyle]}",
    )

quality = body.get("quality", "high")
if quality not in ("draft", "standard", "high", "ultra"):
    raise HTTPException(
        status_code=400,
        detail="Quality must be one of: draft, standard, high, ultra",
    )

resolution = body.get("resolution", "720p")
if resolution not in [r.value for r in Resolution]:
    raise HTTPException(
        status_code=400,
        detail=f"Invalid resolution. Must be one of: {[r.value for r in Resolution]}",
    )

aspect_ratio = body.get("aspect_ratio", "16:9")
if aspect_ratio not in settings.SUPPORTED_ASPECT_RATIOS:
    raise HTTPException(
        status_code=400,
        detail=f"Invalid aspect ratio. Must be one of: {settings.SUPPORTED_ASPECT_RATIOS}",
    )

width = body.get("width")
height = body.get("height")
if width is None or height is None:
    width, height = _get_resolution_dims(resolution, aspect_ratio)

# Validate dimensions
for dim_name, dim_val in [("width", width), ("height", height)]:
    if not isinstance(dim_val, int) or dim_val < 256 or dim_val > 2048:
        raise HTTPException(
            status_code=400,
            detail=f"{dim_name} must be between 256 and 2048 and a multiple of 64",
        )
    if dim_val % 64 != 0:
        raise HTTPException(
            status_code=400,
            detail=f"{dim_name} must be a multiple of 64",
        )

num_variations = body.get("num_variations", 1)
if not isinstance(num_variations, int) or num_variations < 1 or num_variations > 4:
    raise HTTPException(
        status_code=400,
        detail="num_variations must be between 1 and 4",
    )

seed = body.get("seed")
if seed is not None and (not isinstance(seed, int) or seed < 0):
    raise HTTPException(status_code=400, detail="seed must be a non-negative integer")

reference_image_url = body.get("reference_image_url")
reference_image_strength = body.get("reference_image_strength", 0.5)
if reference_image_strength is not None:
    if not isinstance(reference_image_strength, (int, float)) or not (0.0 <= reference_image_strength <= 1.0):
        raise HTTPException(
            status_code=400,
            detail="reference_image_strength must be between 0.0 and 1.0",
        )

# Create generation job
generation_id = uuid.uuid4().hex
job = {
    "type": "single",
    "generation_id": generation_id,
    "user_id": uid,
    "prompt": prompt,
    "negative_prompt": body.get("negative_prompt"),
    "style": style,
    "width": width,
    "height": height,
    "resolution": resolution,
    "aspect_ratio": aspect_ratio,
    "num_variations": num_variations,
    "seed": seed,
    "quality": quality,
    "reference_image_url": reference_image_url,
    "reference_image_strength": reference_image_strength,
    "status": ImageGenerationStatus.QUEUED,
    "images": [],
    "created_at": time.time(),
}

_generation_jobs[generation_id] = job

# Persist to Firestore if available
try:
    db = get_db()
    if db:
        db.collection("generations").document(generation_id).set({
            "userId": uid,
            "prompt": prompt,
            "negative_prompt": body.get("negative_prompt"),
            "style": style,
            "width": width,
            "height": height,
            "resolution": resolution,
            "aspect_ratio": aspect_ratio,
            "num_variations": num_variations,
            "seed": seed,
            "quality": quality,
            "status": ImageGenerationStatus.QUEUED,
            "createdAt": __import__("datetime").datetime.utcnow().isoformat(),
        })
except Exception as e:
    logger.warning(f"Failed to persist generation to Firestore: {e}")

# Start generation in background (placeholder - in production use a task queue)
import threading
thread = threading.Thread(target=_simulate_image_generation, args=(job,), daemon=True)
thread.start()

return {
    "generation_id": generation_id,
    "status": ImageGenerationStatus.QUEUED,
    "images": [],
    "prompt": prompt,
    "style": style,
    "seed_used": seed,
    "estimated_time_remaining": {"draft": 2, "standard": 3, "high": 5, "ultra": 8}.get(quality, 5),
}


@router.get("/image/{generation_id}")
async def get_generation_status(generation_id: str):
"""Get the status and results of an image generation job."""
job = _generation_jobs.get(generation_id)
if not job or job.get("type") != "single":
    raise HTTPException(status_code=404, detail="Generation job not found")

status = job.get("status", ImageGenerationStatus.QUEUED)
response = {
    "generation_id": generation_id,
    "status": status,
    "prompt": job.get("prompt", ""),
    "style": job.get("style", "none"),
    "seed_used": job.get("seed_used"),
    "images": [],
}

if status == ImageGenerationStatus.COMPLETED:
    # Return image metadata without base64 data
    images = job.get("images", [])
    response["images"] = [
        {k: v for k, v in img.items() if k != "base64_data"}
        for img in images
    ]
    response["completed_at"] = job.get("completed_at")
elif status == ImageGenerationStatus.FAILED:
    response["error"] = job.get("error", "Unknown error")
elif status == ImageGenerationStatus.GENERATING:
    started = job.get("started_at")
    if started:
        elapsed = time.time() - started
        quality = job.get("quality", "high")
        total_est = {"draft": 1, "standard": 2, "high": 3, "ultra": 5}.get(quality, 3)
        progress = min(95.0, (elapsed / total_est) * 100)
        response["progress"] = round(progress, 1)
        response["estimated_time_remaining"] = max(0, int(total_est - elapsed))
else:
    quality = job.get("quality", "high")
    response["estimated_time_remaining"] = {"draft": 2, "standard": 3, "high": 5, "ultra": 8}.get(quality, 5)

return response


@router.get("/image/{image_id}/file")
async def get_generated_image_file(image_id: str):
"""Retrieve a generated image file by its ID."""
img_data = _generation_jobs.get(f"img_{image_id}")
if not img_data:
    raise HTTPException(status_code=404, detail="Generated image not found")

img_bytes = base64.b64decode(img_data["data"])
from fastapi.responses import Response
return Response(
    content=img_bytes,
    media_type="image/png",
    headers={
        "Content-Disposition": f"inline; filename=giodai_{image_id}.png",
        "X-Image-Width": str(img_data["width"]),
        "X-Image-Height": str(img_data["height"]),
    },
)


@router.post("/image/batch")
async def generate_image_batch(
request: Request,
authorization: Optional[str] = Header(None),
):
"""Generate images from multiple prompts in a single batch request.

Returns a batch_id that can be polled for overall and per-prompt status.
"""
user_data = await verify_token(authorization)
uid = user_data["uid"]

body = await request.json()
prompts = body.get("prompts", [])
if not prompts or not isinstance(prompts, list):
    raise HTTPException(status_code=400, detail="prompts must be a non-empty list of strings")
if len(prompts) > 20:
    raise HTTPException(status_code=400, detail="Maximum 20 prompts per batch")
for i, p in enumerate(prompts):
    if not isinstance(p, str) or not p.strip():
        raise HTTPException(
            status_code=400,
            detail=f"Prompt at index {i} must be a non-empty string",
        )
    if len(p) > 2000:
        raise HTTPException(
            status_code=400,
            detail=f"Prompt at index {i} exceeds 2000 characters",
        )

style = body.get("style", "none")
if style not in [s.value for s in ImageStyle]:
    raise HTTPException(status_code=400, detail=f"Invalid style: {style}")

quality = body.get("quality", "high")
if quality not in ("draft", "standard", "high", "ultra"):
    raise HTTPException(status_code=400, detail=f"Invalid quality: {quality}")

resolution = body.get("resolution", "720p")
if resolution not in [r.value for r in Resolution]:
    raise HTTPException(status_code=400, detail=f"Invalid resolution: {resolution}")

seed = body.get("seed")
if seed is not None and (not isinstance(seed, int) or seed < 0):
    raise HTTPException(status_code=400, detail="seed must be a non-negative integer")

batch_id = uuid.uuid4().hex
individual_ids = []
results = []

# Create individual generation jobs for each prompt
for i, prompt in enumerate(prompts):
    gen_id = uuid.uuid4().hex
    individual_ids.append(gen_id)

    width = body.get("width", 1024)
    height = body.get("height", 1024)
    if width is None or height is None:
        width, height = _get_resolution_dims(resolution, "1:1")

    job = {
        "type": "single",
        "generation_id": gen_id,
        "user_id": uid,
        "prompt": prompt.strip(),
        "negative_prompt": body.get("negative_prompt"),
        "style": style,
        "width": width,
        "height": height,
        "resolution": resolution,
        "aspect_ratio": "1:1",
        "num_variations": 1,
        "seed": (seed + i) if seed else None,
        "quality": quality,
        "status": ImageGenerationStatus.QUEUED,
        "images": [],
        "created_at": time.time(),
    }

    _generation_jobs[gen_id] = job
    results.append({
        "index": i,
        "prompt": prompt.strip(),
        "generation_id": gen_id,
        "status": ImageGenerationStatus.QUEUED,
    })

    # Start individual generation
    import threading
    thread = threading.Thread(
        target=_simulate_image_generation, args=(job,), daemon=True
    )
    thread.start()

_batch_jobs[batch_id] = {
    "batch_id": batch_id,
    "user_id": uid,
    "total_prompts": len(prompts),
    "job_ids": individual_ids,
    "results": results,
    "status": ImageGenerationStatus.GENERATING,
    "created_at": time.time(),
}

# Persist to Firestore
try:
    db = get_db()
    if db:
        db.collection("batch_generations").document(batch_id).set({
            "userId": uid,
            "totalPrompts": len(prompts),
            "style": style,
            "quality": quality,
            "status": ImageGenerationStatus.GENERATING,
            "createdAt": __import__("datetime").datetime.utcnow().isoformat(),
        })
except Exception as e:
    logger.warning(f"Failed to persist batch to Firestore: {e}")

return {
    "batch_id": batch_id,
    "total_prompts": len(prompts),
    "status": ImageGenerationStatus.GENERATING,
    "results": [
        {k: v for k, v in r.items() if k != "images"}
        for r in results
    ],
    "estimated_time_remaining": len(prompts) * {"draft": 2, "standard": 3, "high": 5, "ultra": 8}.get(quality, 5),
}


@router.get("/image/batch/{batch_id}")
async def get_batch_status(batch_id: str):
"""Get the status and results of a batch image generation job."""
batch = _batch_jobs.get(batch_id)
if not batch:
    raise HTTPException(status_code=404, detail="Batch generation job not found")

job_ids = batch.get("job_ids", [])
results = []
completed = 0
failed = 0

for i, gen_id in enumerate(job_ids):
    job = _generation_jobs.get(gen_id, {})
    status = job.get("status", ImageGenerationStatus.QUEUED)

    if status == ImageGenerationStatus.COMPLETED:
        completed += 1
    elif status == ImageGenerationStatus.FAILED:
        failed += 1

    result_entry = {
        "index": i,
        "generation_id": gen_id,
        "prompt": job.get("prompt", ""),
        "status": status,
        "images": [],
        "error": job.get("error"),
    }

    if status == ImageGenerationStatus.COMPLETED:
        imgs = job.get("images", [])
        result_entry["images"] = [
            {k: v for k, v in img.items() if k != "base64_data"}
            for img in imgs
        ]

    results.append(result_entry)

# Determine overall batch status
if completed == len(job_ids):
    overall_status = ImageGenerationStatus.COMPLETED
elif failed == len(job_ids):
    overall_status = ImageGenerationStatus.FAILED
elif completed + failed == len(job_ids):
    overall_status = ImageGenerationStatus.COMPLETED if completed > 0 else ImageGenerationStatus.FAILED
else:
    overall_status = ImageGenerationStatus.GENERATING

batch["status"] = overall_status

return {
    "batch_id": batch_id,
    "total_prompts": batch["total_prompts"],
    "completed": completed,
    "failed": failed,
    "pending": len(job_ids) - completed - failed,
    "status": overall_status,
    "results": results,
}


@router.post("/image/{generation_id}/cancel")
async def cancel_generation(
generation_id: str,
authorization: Optional[str] = Header(None),
):
"""Cancel a pending or generating image generation job."""
user_data = await verify_token(authorization)
uid = user_data["uid"]

job = _generation_jobs.get(generation_id)
if not job or job.get("type") != "single":
    raise HTTPException(status_code=404, detail="Generation job not found")

if job.get("user_id") != uid:
    raise HTTPException(status_code=403, detail="Access denied")

status = job.get("status")
if status in (ImageGenerationStatus.COMPLETED, ImageGenerationStatus.FAILED, ImageGenerationStatus.CANCELLED):
    raise HTTPException(
        status_code=400,
        detail=f"Cannot cancel a job with status: {status}",
    )

job["status"] = ImageGenerationStatus.CANCELLED
job["cancelled_at"] = time.time()

# Update Firestore
try:
    db = get_db()
    if db:
        db.collection("generations").document(generation_id).update({
            "status": ImageGenerationStatus.CANCELLED,
            "updatedAt": __import__("datetime").datetime.utcnow().isoformat(),
        })
except Exception as e:
    logger.warning(f"Failed to update Firestore: {e}")

return {"message": "Generation job cancelled", "generation_id": generation_id, "status": ImageGenerationStatus.CANCELLED}


@router.post("/video-from-project/{project_id}")
async def generate_video_from_project(
project_id: str,
request: Request,
authorization: Optional[str] = Header(None),
):
"""Generate a video from an existing project.

Reads the project's images, texts, audio, and settings,
then triggers the video renderer.
"""
user_data = await verify_token(authorization)
uid = user_data["uid"]

body = await request.json() if hasattr(request, '_body') else {}
# Read body if present
try:
    body = await request.json()
except Exception:
    body = {}

# Fetch project from Firestore
try:
    db = get_db()
    if not db:
        raise HTTPException(status_code=503, detail="Database is not available")

    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")

    project_data = doc.to_dict()
    if project_data.get("userId") != uid:
        raise HTTPException(status_code=403, detail="Access denied")
except HTTPException:
    raise
except Exception as e:
    raise HTTPException(status_code=500, detail=f"Failed to fetch project: {str(e)}")

images = project_data.get("images", [])
if not images:
    raise HTTPException(status_code=400, detail="Project has no images to render")

# Build render payload from project data
render_payload = {
    "images": images,
    "texts": project_data.get("texts", []),
    "audio": project_data.get("audio"),
    "settings": project_data.get("settings", {}),
    "aspect_ratio": project_data.get("aspectRatio", "16:9"),
}

# Allow overrides from request body
if "settings" in body and body["settings"]:
    render_payload["settings"].update(body["settings"])
if "aspect_ratio" in body and body["aspect_ratio"]:
    render_payload["aspect_ratio"] = body["aspect_ratio"]

# Delegate to the video renderer
from ..services.video_renderer import video_renderer

try:
    render_id = video_renderer.render(render_payload)
except Exception as e:
    raise HTTPException(status_code=500, detail=f"Failed to start render: {str(e)}")

# Track this project render
project_render_id = uuid.uuid4().hex
_project_renders[project_render_id] = {
    "project_render_id": project_render_id,
    "project_id": project_id,
    "render_id": render_id,
    "user_id": uid,
    "status": RenderStatus.PENDING,
    "created_at": time.time(),
}

# Log render in Firestore
try:
    if db:
        now = __import__("datetime").datetime.utcnow().isoformat()
        db.collection("projects").document(project_id).collection("renders").document(render_id).set({
            "userId": uid,
            "status": RenderStatus.PENDING,
            "settings": render_payload["settings"],
            "createdAt": now,
        })
except Exception as e:
    logger.warning(f"Failed to log render to Firestore: {e}")

return {
    "project_render_id": project_render_id,
    "render_id": render_id,
    "project_id": project_id,
    "status": RenderStatus.PENDING,
    "message": "Video render started from project",
    "video_status_url": f"/api/video/status/{render_id}",
}


@router.get("/video-from-project/{project_id}/history")
async def get_project_render_history(
project_id: str,
authorization: Optional[str] = Header(None),
page: int = Query(1, ge=1),
limit: int = Query(20, ge=1, le=100),
):
"""Get the render history for a project."""
user_data = await verify_token(authorization)
uid = user_data["uid"]

try:
    db = get_db()
    if not db:
        raise HTTPException(status_code=503, detail="Database is not available")

    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")

    project_data = doc.to_dict()
    if project_data.get("userId") != uid:
        raise HTTPException(status_code=403, detail="Access denied")

    renders_ref = (
        db.collection("projects")
        .document(project_id)
        .collection("renders")
        .order_by("createdAt", direction=firestore.Query.DESCENDING)
        .offset((page - 1) * limit)
        .limit(limit)
    )
    docs = list(renders_ref.get())

    total_ref = (
        db.collection("projects")
        .document(project_id)
        .collection("renders")
    )
    total = len(list(total_ref.get()))

    renders = []
    for render_doc in docs:
        data = render_doc.to_dict()
        renders.append({
            "render_id": render_doc.id,
            "status": data.get("status"),
            "settings": data.get("settings", {}),
            "created_at": data.get("createdAt"),
        })

    return {
        "project_id": project_id,
        "items": renders,
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": (page * limit) < total,
    }
except HTTPException:
    raise
except Exception as e:
    raise HTTPException(status_code=500, detail=f"Failed to fetch render history: {str(e)}")


@router.get("/history")
async def get_generation_history(
authorization: Optional[str] = Header(None),
page: int = Query(1, ge=1),
limit: int = Query(20, ge=1, le=100),
status_filter: Optional[str] = Query(None, alias="status"),
):
"""Get the current user's image generation history.

Supports pagination and optional status filtering.
"""
user_data = await verify_token(authorization)
uid = user_data["uid"]

# Filter in-memory jobs by user
all_jobs = [
    job for job in _generation_jobs.values()
    if job.get("type") == "single" and job.get("user_id") == uid
]

if status_filter:
    all_jobs = [j for j in all_jobs if j.get("status") == status_filter]

# Sort by creation time (newest first)
all_jobs.sort(key=lambda j: j.get("created_at", 0), reverse=True)

total = len(all_jobs)
start = (page - 1) * limit
end = start + limit
page_jobs = all_jobs[start:end]

items = []
for job in page_jobs:
    item = {
        "generation_id": job["generation_id"],
        "prompt": job.get("prompt", ""),
        "style": job.get("style", "none"),
        "status": job.get("status"),
        "width": job.get("width"),
        "height": job.get("height"),
        "quality": job.get("quality"),
        "num_variations": job.get("num_variations", 1),
        "seed_used": job.get("seed_used"),
        "created_at": job.get("created_at"),
        "completed_at": job.get("completed_at"),
        "image_count": len(job.get("images", [])),
    }
    items.append(item)

return {
    "items": items,
    "total": total,
    "page": page,
    "limit": limit,
    "has_more": (page * limit) < total,
}


@router.delete("/image/{generation_id}")
async def delete_generation(
generation_id: str,
authorization: Optional[str] = Header(None),
):
"""Delete a generation job and its associated generated images."""
user_data = await verify_token(authorization)
uid = user_data["uid"]

job = _generation_jobs.get(generation_id)
if not job or job.get("type") != "single":
    raise HTTPException(status_code=404, detail="Generation job not found")

if job.get("user_id") != uid:
    raise HTTPException(status_code=403, detail="Access denied")

# Remove associated image data
for img in job.get("images", []):
    img_id = img.get("id")
    if img_id:
        _generation_jobs.pop(f"img_{img_id}", None)

# Remove the job itself
del _generation_jobs[generation_id]

# Remove from Firestore
try:
    db = get_db()
    if db:
        db.collection("generations").document(generation_id).delete()
except Exception as e:
    logger.warning(f"Failed to delete from Firestore: {e}")

return {"message": "Generation job deleted", "generation_id": generation_id}
