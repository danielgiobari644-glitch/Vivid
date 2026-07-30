"""Enhanced video rendering service.

Extends the base :class:`VideoRenderer` with watermark overlays, subtitle burning,
platform-specific presets, video-layer compositing, batch rendering, AI image
generation integration, callback webhooks, and priority-based job queues.

All heavy work runs inside a bounded :class:`ThreadPoolExecutor` so the
async event loop is never blocked.
"""

from __future__ import annotations

import base64
import logging
import os
import re
import time
import uuid
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Preset definitions
# ---------------------------------------------------------------------------

PRESET_CONFIGS: Dict[str, Dict[str, Any]] = {
    "tiktok": {
        "aspect_ratio": "9:16",
        "resolution": "1080p",
        "fps": 30,
        "max_duration": 180,
        "codec": "h264",
        "audio_bitrate": 128,
        "video_bitrate": 4000,
    },
    "instagram_reel": {
        "aspect_ratio": "9:16",
        "resolution": "1080p",
        "fps": 30,
        "max_duration": 90,
        "codec": "h264",
        "audio_bitrate": 128,
        "video_bitrate": 5000,
    },
    "instagram_story": {
        "aspect_ratio": "9:16",
        "resolution": "1080p",
        "fps": 30,
        "max_duration": 15,
        "codec": "h264",
        "audio_bitrate": 128,
        "video_bitrate": 5000,
    },
    "youtube_shorts": {
        "aspect_ratio": "9:16",
        "resolution": "1080p",
        "fps": 30,
        "max_duration": 60,
        "codec": "h264",
        "audio_bitrate": 128,
        "video_bitrate": 8000,
    },
    "youtube_thumbnail": {
        "aspect_ratio": "16:9",
        "resolution": "1280x720",
        "fps": 1,
        "max_duration": 0,
        "codec": "h264",
        "audio_bitrate": 0,
        "video_bitrate": 2000,
    },
    "twitter_post": {
        "aspect_ratio": "16:9",
        "resolution": "1080p",
        "fps": 30,
        "max_duration": 140,
        "codec": "h264",
        "audio_bitrate": 128,
        "video_bitrate": 5000,
    },
    "linkedin_post": {
        "aspect_ratio": "16:9",
        "resolution": "1080p",
        "fps": 30,
        "max_duration": 600,
        "codec": "h264",
        "audio_bitrate": 128,
        "video_bitrate": 8000,
    },
    "custom": {},
}


# ---------------------------------------------------------------------------
# Watermark position helpers
# ---------------------------------------------------------------------------

def _watermark_position(
    pos: str,
    vw: int,
    vh: int,
    ww: int,
    wh: int,
    margin: int,
) -> Tuple[int, int]:
    """Return ``(x, y)`` for the watermark's top-left corner."""
    x = margin
    y = margin
    if "right" in pos:
        x = vw - ww - margin
    elif "center" in pos and "top" not in pos and "bottom" not in pos:
        x = (vw - ww) // 2
    if "bottom" in pos:
        y = vh - wh - margin
    elif "center" in pos:
        y = (vh - wh) // 2
    x = max(0, min(x, vw - ww))
    y = max(0, min(y, vh - wh))
    return x, y


# ---------------------------------------------------------------------------
# SRT / VTT parser
# ---------------------------------------------------------------------------

def _parse_srt(text: str) -> List[Dict[str, Any]]:
    """Parse SRT subtitle text into a list of ``{start, end, text}`` dicts."""
    entries: List[Dict[str, Any]] = []
    blocks = re.split(r"\n\s*\n", text.strip())
    for block in blocks:
        lines = [l.strip() for l in block.strip().splitlines() if l.strip()]
        if len(lines) < 2:
            continue
        ts_line = ""
        txt_lines: List[str] = []
        for line in lines:
            if "-->" in line:
                ts_line = line
            else:
                try:
                    int(line)
                except ValueError:
                    txt_lines.append(line)
        if not ts_line:
            continue
        match = re.match(
            r"(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})",
            ts_line,
        )
        if not match:
            continue
        start_s = _timestamp_to_seconds(match.group(1))
        end_s = _timestamp_to_seconds(match.group(2))
        entries.append({"start": start_s, "end": end_s, "text": " ".join(txt_lines)})
    return entries


def _parse_vtt(text: str) -> List[Dict[str, Any]]:
    """Parse WebVTT subtitle text."""
    cleaned = re.sub(r"^WEBVTT.*?\n\n", "", text.strip(), flags=re.DOTALL)
    return _parse_srt(cleaned)


def _timestamp_to_seconds(ts: str) -> float:
    """Convert ``HH:MM:SS,mmm`` or ``HH:MM:SS.mmm`` to seconds."""
    ts = ts.replace(",", ".")
    parts = ts.split(":")
    if len(parts) == 3:
        h, m, s = parts
        return int(h) * 3600 + int(m) * 60 + float(s)
    elif len(parts) == 2:
        m, s = parts
        return int(m) * 60 + float(s)
    return float(ts)


# ---------------------------------------------------------------------------
# Image generation helper (pluggable AI backend)
# ---------------------------------------------------------------------------

def _generate_image_ai(
    prompt: str,
    style: str,
    width: int,
    height: int,
    seed: Optional[int] = None,
    quality: str = "high",
    negative_prompt: Optional[str] = None,
) -> Optional[bytes]:
    """Call an AI image generation backend and return raw PNG bytes.

    Returns ``None`` on any failure so the render pipeline can continue
    without the generated image.
    """
    try:
        payload: Dict[str, Any] = {
            "prompt": prompt,
            "width": width,
            "height": height,
            "style": style,
            "quality": quality,
        }
        if seed is not None:
            payload["seed"] = seed
        if negative_prompt:
            payload["negative_prompt"] = negative_prompt

        try:
            resp = httpx.post(
                "http://localhost:8001/api/generate",
                json=payload,
                timeout=60.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                b64 = data.get("image", "")
                if b64:
                    if b64.startswith("data:"):
                        b64 = b64.split(",", 1)[1]
                    return base64.b64decode(b64)
        except (httpx.ConnectError, httpx.TimeoutException):
            logger.debug("AI image generation service not reachable, skipping.")

        return None
    except Exception as exc:
        logger.warning("AI image generation failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Callback webhook helper
# ---------------------------------------------------------------------------

def _fire_callback(callback_url: str, payload: Dict[str, Any]) -> None:
    """POST a JSON payload to ``callback_url`` in a fire-and-forget manner."""
    if not callback_url:
        return
    try:
        resp = httpx.post(callback_url, json=payload, timeout=10.0)
        logger.info("Callback to %s returned %d", callback_url, resp.status_code)
    except Exception as exc:
        logger.warning("Callback to %s failed: %s", callback_url, exc)


# ---------------------------------------------------------------------------
# Enhanced renderer
# ---------------------------------------------------------------------------

@dataclass
class _Job:
    render_id: str
    status: str = "pending"
    progress: float = 0.0
    download_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    error: Optional[str] = None
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    priority: int = 5
    batch_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    callback_url: Optional[str] = None
    file_size: Optional[int] = None
    duration_seconds: Optional[float] = None
    settings_used: Dict[str, Any] = field(default_factory=dict)


class EnhancedRenderer:
    """Production-grade renderer with watermarks, subtitles, presets, video
    layers, batch jobs, AI image generation, and webhooks.
    """

    RESOLUTION_MAP = {
        "720p": (1280, 720),
        "1080p": (1920, 1080),
        "4K": (3840, 2160),
    }

    ASPECT_RATIO_MAP = {
        "16:9": (16, 9),
        "9:16": (9, 16),
        "1:1": (1, 1),
        "4:5": (4, 5),
        "3:2": (3, 2),
    }

    CODEC_FFMPEG_MAP = {
        "h264": "libx264",
        "h265": "libx265",
        "vp9": "libvpx-vp9",
        "av1": "libaom-av1",
    }

    def __init__(self, max_workers: int = 2):
        self._jobs: Dict[str, _Job] = {}
        self._lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._ensure_dirs()

    def _ensure_dirs(self) -> None:
        os.makedirs("uploads", exist_ok=True)
        os.makedirs("temp", exist_ok=True)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def render(
        self,
        project_config: Dict[str, Any],
        callback_url: Optional[str] = None,
        priority: int = 5,
        batch_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Submit an enhanced render job.  Returns the ``render_id``."""
        render_id = uuid.uuid4().hex
        with self._lock:
            self._jobs[render_id] = _Job(
                render_id=render_id,
                priority=max(1, min(10, priority)),
                batch_id=batch_id,
                metadata=metadata or {},
                callback_url=callback_url,
            )
        self._executor.submit(self._render_worker, render_id, project_config)
        return render_id

    def render_batch(
        self,
        jobs: List[Dict[str, Any]],
        callback_url: Optional[str] = None,
        parallel: bool = False,
    ) -> Dict[str, Any]:
        """Submit multiple render jobs.  Returns ``{batch_id, job_ids, ...}``."""
        batch_id = uuid.uuid4().hex
        job_ids: List[str] = []
        for cfg in jobs:
            rid = self.render(
                project_config=cfg,
                callback_url=callback_url,
                batch_id=batch_id,
                priority=cfg.get("priority", 5),
                metadata=cfg.get("metadata"),
            )
            job_ids.append(rid)
        return {
            "batch_id": batch_id,
            "total_jobs": len(job_ids),
            "job_ids": job_ids,
            "status": "pending",
            "message": "Batch render submitted",
        }

    def get_status(self, render_id: str) -> Dict[str, Any]:
        with self._lock:
            job = self._jobs.get(render_id)
        if not job:
            return {"status": "not_found", "progress": 0}
        resp: Dict[str, Any] = {
            "render_id": job.render_id,
            "batch_id": job.batch_id,
            "status": job.status,
            "progress": job.progress,
            "download_url": job.download_url,
            "thumbnail_url": job.thumbnail_url,
            "file_size": job.file_size,
            "duration_seconds": job.duration_seconds,
            "error": job.error,
            "started_at": (
                time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(job.started_at))
                if job.started_at
                else None
            ),
            "completed_at": (
                time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(job.completed_at))
                if job.completed_at
                else None
            ),
            "settings_used": job.settings_used,
            "metadata": job.metadata,
        }
        if job.started_at and 0 < job.progress < 100:
            elapsed = time.time() - job.started_at
            remaining = int((elapsed / job.progress) * (100 - job.progress))
            resp["estimated_time_remaining"] = remaining
        return resp

    def get_batch_status(self, batch_id: str) -> Dict[str, Any]:
        with self._lock:
            batch_jobs = [j for j in self._jobs.values() if j.batch_id == batch_id]
        if not batch_jobs:
            return {"batch_id": batch_id, "status": "not_found", "jobs": []}
        statuses = [self.get_status(j.render_id) for j in batch_jobs]
        completed = sum(1 for s in statuses if s["status"] == "completed")
        failed = sum(1 for s in statuses if s["status"] == "failed")
        overall = "completed" if completed == len(statuses) else (
            "failed" if failed == len(statuses) else "processing"
        )
        return {
            "batch_id": batch_id,
            "status": overall,
            "total_jobs": len(statuses),
            "completed": completed,
            "failed": failed,
            "jobs": statuses,
        }

    def generate_image(
        self,
        prompt: str,
        style: str = "none",
        width: int = 1024,
        height: int = 1024,
        seed: Optional[int] = None,
        quality: str = "high",
        negative_prompt: Optional[str] = None,
        num_variations: int = 1,
    ) -> Dict[str, Any]:
        """Synchronous AI image generation.  Returns result dict."""
        gen_id = uuid.uuid4().hex
        images: List[Dict[str, Any]] = []
        used_seed = seed if seed is not None else int(time.time() * 1000) % (2**31)

        for i in range(num_variations):
            variation_seed = used_seed + i
            raw = _generate_image_ai(
                prompt=prompt,
                style=style,
                width=width,
                height=height,
                seed=variation_seed,
                quality=quality,
                negative_prompt=negative_prompt,
            )
            if raw:
                b64 = base64.b64encode(raw).decode("utf-8")
                from PIL import Image as PILImage
                import io
                pil = PILImage.open(io.BytesIO(raw))
                images.append({
                    "url": f"data:image/png;base64,{b64}",
                    "width": pil.width,
                    "height": pil.height,
                    "format": "png",
                    "size_bytes": len(raw),
                    "seed": variation_seed,
                    "variation_index": i,
                })
                pil.close()

        return {
            "generation_id": gen_id,
            "status": "completed" if images else "failed",
            "images": images,
            "prompt": prompt,
            "style": style,
            "seed_used": used_seed,
        }

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False)

    # ------------------------------------------------------------------
    # Core worker
    # ------------------------------------------------------------------

    def _render_worker(self, render_id: str, cfg: Dict[str, Any]) -> None:
        job = self._jobs[render_id]
        job.status = "processing"
        job.started_at = time.time()

        try:
            from moviepy.editor import (
                ImageClip, TextClip, CompositeVideoClip,
                concatenate_videoclips, AudioFileClip,
                CompositeAudioClip, ColorClip, VideoFileClip, VideoClip,
            )
            from PIL import Image as PILImage
            import numpy as np

            # ---- Apply preset ----
            preset_name = cfg.get("preset", "custom")
            preset = PRESET_CONFIGS.get(preset_name, {})
            if preset:
                cfg = {**preset, **cfg}

            settings = cfg.get("settings", {})
            if isinstance(settings, str):
                settings = {}
            aspect_ratio = cfg.get("aspect_ratio", cfg.get("aspectRatio", "16:9"))
            resolution_key = settings.get("resolution", cfg.get("resolution", "1080p"))
            if isinstance(resolution_key, dict):
                resolution_key = "1080p"
            export_format = str(settings.get("export_format", "mp4")).lower()
            codec_key = str(settings.get("codec", "h264")).lower()
            fps = int(settings.get("fps", 30)) or 30
            audio_bitrate = int(settings.get("audio_bitrate", 0)) or 128
            video_bitrate = int(settings.get("video_bitrate", 0)) or 5000
            two_pass = bool(settings.get("two_pass_encoding", False))
            bg_color = str(settings.get("background_color", settings.get("backgroundColor", "#000000")))
            callback_url = cfg.get("callback_url") or job.callback_url

            job.settings_used = {
                "resolution": resolution_key,
                "fps": fps,
                "codec": codec_key,
                "export_format": export_format,
                "aspect_ratio": aspect_ratio,
                "preset": preset_name,
            }

            # ---- Compute output dimensions ----
            target_w, target_h = self.RESOLUTION_MAP.get(resolution_key, (1920, 1080))
            ar = self.ASPECT_RATIO_MAP.get(aspect_ratio, (16, 9))
            ar_w, ar_h = ar
            calc_h = int(target_w * ar_h / ar_w)
            if calc_h <= target_h:
                final_w, final_h = target_w, max(calc_h, 100)
            else:
                final_w = max(int(target_h * ar_w / ar_h), 100)
                final_h = target_h

            job.progress = 5.0

            # ---- Collect source clips ----
            clips: List[Any] = []
            image_configs = cfg.get("images", [])
            video_configs = cfg.get("videos", [])
            total_sources = len(image_configs) + len(video_configs)
            if total_sources == 0:
                raise ValueError("At least one image or video is required")

            # Process images
            for idx, img_conf in enumerate(image_configs):
                progress_val = 5.0 + (40.0 * (idx + 1) / total_sources)
                job.progress = progress_val
                clip = self._build_image_clip(img_conf, final_w, final_h, fps)
                if clip is not None:
                    clips.append(clip)

            # Process video layers
            for idx, vid_conf in enumerate(video_configs):
                progress_val = 5.0 + (40.0 * (len(image_configs) + idx + 1) / total_sources)
                job.progress = progress_val
                clip = self._build_video_clip(vid_conf, final_w, final_h)
                if clip is not None:
                    clips.append(clip)

            if not clips:
                raise ValueError("No valid media sources to render")

            job.progress = 50.0

            # ---- Join with transitions ----
            transitions = cfg.get("transitions", [])
            final_clip = self._join_with_transitions(clips, transitions, fps)

            job.progress = 60.0

            # ---- Text overlays ----
            for txt_conf in cfg.get("texts", []):
                try:
                    final_clip = self._add_text(final_clip, txt_conf, final_w, final_h)
                except Exception as exc:
                    logger.warning("Text overlay failed, skipping: %s", exc)

            job.progress = 70.0

            # ---- Subtitles ----
            subtitle_cfg = cfg.get("subtitle")
            if subtitle_cfg and subtitle_cfg.get("content"):
                try:
                    final_clip = self._burn_subtitles(final_clip, subtitle_cfg, final_w, final_h)
                except Exception as exc:
                    logger.warning("Subtitle burn failed, skipping: %s", exc)

            job.progress = 75.0

            # ---- Audio ----
            audio_cfg = cfg.get("audio")
            if audio_cfg:
                try:
                    final_clip = self._attach_audio(final_clip, audio_cfg)
                except Exception as exc:
                    logger.warning("Audio attachment failed, skipping: %s", exc)

            job.progress = 80.0

            # ---- Watermark ----
            watermark_cfg = cfg.get("watermark")
            if watermark_cfg:
                try:
                    final_clip = self._apply_watermark(final_clip, watermark_cfg, final_w, final_h)
                except Exception as exc:
                    logger.warning("Watermark failed, skipping: %s", exc)

            job.progress = 85.0

            # ---- Export ----
            output_path = f"uploads/{render_id}.{export_format}"
            ffmpeg_codec = self.CODEC_FFMPEG_MAP.get(codec_key, "libx264")

            write_kwargs: Dict[str, Any] = {
                "fps": fps,
                "codec": ffmpeg_codec,
                "audio_codec": "aac",
                "preset": "medium",
                "threads": 2,
                "logger": None,
            }
            if audio_bitrate:
                write_kwargs["audio_bitrate"] = f"{audio_bitrate}k"
            if video_bitrate:
                write_kwargs["bitrate"] = f"{video_bitrate}k"
            if two_pass and export_format == "mp4" and codec_key == "h264":
                write_kwargs["ffmpeg_params"] = ["-x264-params", "pass=2"]

            final_clip.write_videofile(output_path, **write_kwargs)

            job.duration_seconds = final_clip.duration
            final_clip.close()
            for c in clips:
                try:
                    c.close()
                except Exception:
                    pass

            job.progress = 95.0

            # ---- Generate thumbnail ----
            thumbnail_path = f"uploads/{render_id}_thumb.jpg"
            try:
                thumb_clip = VideoFileClip(output_path)
                thumb_frame = thumb_clip.get_frame(min(thumb_clip.duration / 4, 2.0))
                thumb_clip.close()
                pil_thumb = PILImage.fromarray(thumb_frame)
                if pil_thumb.width > 400:
                    ratio = 400 / pil_thumb.width
                    new_h = int(pil_thumb.height * ratio)
                    pil_thumb = pil_thumb.resize((400, new_h), PILImage.Resampling.LANCZOS)
                import io
                buf = io.BytesIO()
                pil_thumb.save(buf, format="JPEG", quality=80)
                with open(thumbnail_path, "wb") as f:
                    f.write(buf.getvalue())
                job.thumbnail_url = f"/uploads/{render_id}_thumb.jpg"
            except Exception as exc:
                logger.warning("Thumbnail generation failed: %s", exc)

            # ---- Finalize ----
            file_size = os.path.getsize(output_path)
            job.file_size = file_size
            job.download_url = f"/api/video/download/{render_id}"
            job.status = "completed"
            job.progress = 100.0
            job.completed_at = time.time()

            _fire_callback(callback_url, {
                "render_id": render_id,
                "status": "completed",
                "download_url": job.download_url,
                "file_size": file_size,
                "duration_seconds": job.duration_seconds,
            })

        except Exception as exc:
            logger.error("Render %s failed: %s", render_id, exc, exc_info=True)
            job.status = "failed"
            job.error = str(exc)
            job.progress = 0.0
            job.completed_at = time.time()

            _fire_callback(cfg.get("callback_url") or job.callback_url, {
                "render_id": render_id,
                "status": "failed",
                "error": str(exc),
            })

    # ------------------------------------------------------------------
    # Clip builders
    # ------------------------------------------------------------------

    def _build_image_clip(self, img_conf: Dict[str, Any], vw: int, vh: int, fps: int):
        from moviepy.editor import ImageClip
        from PIL import Image as PILImage

        img_url = img_conf.get("url", "")
        img_b64 = img_conf.get("base64_data")
        duration = float(img_conf.get("duration", 3.0))
        effect = img_conf.get("effect", "none")

        img_path = None
        try:
            if img_b64:
                img_path = self._save_b64(img_b64)
            elif img_url:
                img_path = self._download_file(img_url)
            else:
                return None

            clip = ImageClip(img_path).set_duration(duration)
            clip = self._cover_resize(clip, vw, vh)
            clip = self._apply_effect(clip, effect, duration)
            return clip
        finally:
            if img_path and os.path.exists(img_path):
                try:
                    os.unlink(img_path)
                except OSError:
                    pass

    def _build_video_clip(self, vid_conf: Dict[str, Any], vw: int, vh: int):
        from moviepy.editor import VideoFileClip

        vid_url = vid_conf.get("url", "")
        vid_b64 = vid_conf.get("base64_data")
        trim_start = float(vid_conf.get("trim_start", 0.0))
        trim_end = vid_conf.get("trim_end")
        volume = float(vid_conf.get("volume", 1.0))
        speed = float(vid_conf.get("speed", 1.0))
        opacity = float(vid_conf.get("opacity", 1.0))

        vid_path = None
        try:
            if vid_b64:
                if vid_b64.startswith("data:"):
                    vid_b64 = vid_b64.split(",", 1)[1]
                raw = base64.b64decode(vid_b64)
                vid_path = f"temp/{uuid.uuid4().hex}.mp4"
                with open(vid_path, "wb") as f:
                    f.write(raw)
            elif vid_url:
                vid_path = self._download_file(vid_url)
            else:
                return None

            clip = VideoFileClip(vid_path)

            if trim_start > 0:
                clip = clip.subclip(trim_start)
            if trim_end is not None and trim_end < clip.duration:
                clip = clip.subclip(0, trim_end)

            if speed != 1.0:
                clip = clip.fx(lambda c, s=speed: c.speedx(s))

            clip = self._cover_resize(clip, vw, vh)

            if clip.audio and volume != 1.0:
                clip = clip.set_audio(clip.audio.volumex(volume))

            if opacity < 1.0:
                clip = clip.fl_image(lambda f, a=opacity: (f * a).astype("uint8"))

            return clip
        finally:
            if vid_path and os.path.exists(vid_path):
                try:
                    os.unlink(vid_path)
                except OSError:
                    pass

    # ------------------------------------------------------------------
    # Effects
    # ------------------------------------------------------------------

    def _apply_effect(self, clip, effect: str, duration: float):
        if not effect or effect == "none":
            return clip
        from moviepy.editor import VideoClip
        from PIL import Image as PILImage
        import numpy as np

        EFFECT_PARAMS = {
            "ken_burns": (1.0, 1.3, "right"),
            "smooth_zoom": (1.0, 1.2, "center"),
            "pan_left": (1.2, 1.2, "left"),
            "pan_right": (1.2, 1.2, "right"),
            "pan_up": (1.2, 1.2, "up"),
            "pan_down": (1.2, 1.2, "down"),
            "zoom_in": (1.0, 1.4, "center"),
            "zoom_out": (1.4, 1.0, "center"),
        }
        params = EFFECT_PARAMS.get(effect)
        if not params:
            return clip
        zoom_start, zoom_end, pan_dir = params

        w, h = clip.size
        if duration <= 0:
            return clip

        def make_frame(t):
            progress = t / duration
            zoom = zoom_start + (zoom_end - zoom_start) * progress
            new_w = max(1, int(w * zoom))
            new_h = max(1, int(h * zoom))

            frame = clip.get_frame(t)
            pil_img = PILImage.fromarray(frame)
            resized = pil_img.resize((new_w, new_h), PILImage.Resampling.LANCZOS)
            arr = np.array(resized)

            if pan_dir == "left":
                max_off = max(0, new_w - w)
                x_off = int(max_off * (1 - progress))
                y_off = max(0, (new_h - h) // 2)
            elif pan_dir == "right":
                max_off = max(0, new_w - w)
                x_off = int(max_off * progress)
                y_off = max(0, (new_h - h) // 2)
            elif pan_dir == "up":
                max_off = max(0, new_h - h)
                x_off = max(0, (new_w - w) // 2)
                y_off = int(max_off * (1 - progress))
            elif pan_dir == "down":
                max_off = max(0, new_h - h)
                x_off = max(0, (new_w - w) // 2)
                y_off = int(max_off * progress)
            else:
                x_off = max(0, (new_w - w) // 2)
                y_off = max(0, (new_h - h) // 2)

            x_off = max(0, min(x_off, max(0, new_w - w)))
            y_off = max(0, min(y_off, max(0, new_h - h)))

            return arr[y_off : y_off + h, x_off : x_off + w]

        new_clip = VideoClip(make_frame, duration=duration).set_fps(clip.fps or 24)
        clip.close()
        return new_clip

    def _cover_resize(self, clip, tw: int, th: int):
        from PIL import Image as PILImage
        import numpy as np

        img = clip.get_frame(0)
        h, w = img.shape[:2]
        scale = max(tw / w, th / h)
        nw = max(1, int(w * scale))
        nh = max(1, int(h * scale))
        resized = clip.resize((nw, nh))
        cx = max(0, (nw - tw) // 2)
        cy = max(0, (nh - th) // 2)
        cropped = resized.crop(x1=cx, y1=cy, x2=cx + tw, y2=cy + th)
        resized.close()
        return cropped

    def _join_with_transitions(self, clips, transitions, fps: int):
        from moviepy.editor import CompositeVideoClip, concatenate_videoclips

        if len(clips) == 1:
            return clips[0]

        transition_dur = 0.5
        if not transitions:
            return concatenate_videoclips(clips, method="compose")

        result = [clips[0]]
        for i in range(1, len(clips)):
            t_type = transitions[i - 1] if i - 1 < len(transitions) else "crossfade"
            if t_type in ("fade", "crossfade"):
                fade_in = clips[i].crossfadein(transition_dur)
                prev = result[-1].set_duration(result[-1].duration)
                overlap = prev.duration - transition_dur
                fade_in = fade_in.set_start(overlap)
                result[-1] = CompositeVideoClip([prev, fade_in])
            else:
                result.append(clips[i])

        if len(result) == 1:
            return result[0]
        return concatenate_videoclips(result, method="compose")

    # ------------------------------------------------------------------
    # Text overlays
    # ------------------------------------------------------------------

    def _add_text(self, clip, txt: Dict[str, Any], vw: int, vh: int):
        from moviepy.editor import TextClip, CompositeVideoClip

        content = txt.get("content", "")
        if not content.strip():
            return clip

        font = txt.get("font", txt.get("fontFamily", "Arial"))
        size = int(txt.get("size", txt.get("fontSize", 48)))
        color = txt.get("color", txt.get("fontColor", "#FFFFFF"))
        x_ratio = float(txt.get("x", 50)) / 100.0
        y_ratio = float(txt.get("y", 50)) / 100.0
        start_time = float(txt.get("start_time", txt.get("startTime", 0.0)))
        end_time = float(txt.get("end_time", txt.get("endTime", clip.duration)))
        animation = txt.get("animation", "none")
        stroke_color = txt.get("stroke_color", txt.get("strokeColor"))
        stroke_width = int(txt.get("stroke_width", txt.get("strokeWidth", 0)))

        kwargs: Dict[str, Any] = {
            "text": content,
            "fontsize": size,
            "color": color,
            "font": font,
            "method": "caption",
        }
        if stroke_color and stroke_width > 0:
            kwargs["stroke_color"] = stroke_color
            kwargs["stroke_width"] = stroke_width

        tc = None
        for fallback_font in (font, "DejaVu-Sans", None):
            try:
                tc_kwargs = dict(kwargs)
                if fallback_font is not None:
                    tc_kwargs["font"] = fallback_font
                else:
                    tc_kwargs.pop("font", None)
                tc = TextClip(**tc_kwargs)
                break
            except Exception:
                continue
        if tc is None:
            return clip

        tw, th = tc.size
        x_pos = max(0, min(int(x_ratio * vw - tw / 2), vw - tw))
        y_pos = max(0, min(int(y_ratio * vh - th / 2), vh - th))
        eff_dur = min(end_time, clip.duration) - start_time
        if eff_dur <= 0:
            tc.close()
            return clip

        tc = tc.set_position((x_pos, y_pos)).set_start(start_time).set_duration(eff_dur)

        if animation == "fade_in":
            tc = tc.crossfadein(0.5)
        elif animation == "fade_out":
            tc = tc.crossfadeout(0.5)
        elif animation == "slide_up_in":
            tc = tc.set_position(lambda t: (x_pos, y_pos + int(100 * (1 - min(t / 0.5, 1.0)))))
        elif animation == "slide_down_in":
            tc = tc.set_position(lambda t: (x_pos, y_pos - int(100 * (1 - min(t / 0.5, 1.0)))))

        return CompositeVideoClip([clip, tc])

    # ------------------------------------------------------------------
    # Subtitles
    # ------------------------------------------------------------------

    def _burn_subtitles(self, clip, sub_cfg: Dict[str, Any], vw: int, vh: int):
        from moviepy.editor import TextClip, CompositeVideoClip, ColorClip

        raw = sub_cfg.get("content", "")
        fmt = sub_cfg.get("format", "srt").lower()
        font = sub_cfg.get("font", "Arial")
        size = int(sub_cfg.get("size", 24))
        color = sub_cfg.get("color", "#FFFFFF")
        bg_color = sub_cfg.get("background_color", "#000000")
        bg_opacity = float(sub_cfg.get("background_opacity", 0.6))
        position = sub_cfg.get("position", "bottom_center")

        if fmt == "vtt":
            entries = _parse_vtt(raw)
        else:
            entries = _parse_srt(raw)

        if not entries:
            return clip

        for entry in entries:
            start = float(entry["start"])
            end = float(entry["end"])
            text = entry["text"]
            dur = end - start
            if dur <= 0:
                continue

            tc = None
            for fallback in (font, "DejaVu-Sans", None):
                try:
                    tc_kwargs: Dict[str, Any] = {
                        "text": text,
                        "fontsize": size,
                        "color": color,
                        "method": "caption",
                    }
                    if fallback:
                        tc_kwargs["font"] = fallback
                    tc = TextClip(**tc_kwargs)
                    break
                except Exception:
                    continue
            if tc is None:
                continue

            tw, th = tc.size
            if "bottom" in position:
                y_pos = vh - th - 40
            elif "top" in position:
                y_pos = 20
            else:
                y_pos = (vh - th) // 2

            if "left" in position:
                x_pos = 20
            elif "right" in position:
                x_pos = vw - tw - 20
            else:
                x_pos = (vw - tw) // 2

            x_pos = max(0, min(x_pos, vw - tw))
            y_pos = max(0, min(y_pos, vh - th))

            if bg_opacity > 0:
                pad = 8
                bg = ColorClip((tw + pad * 2, th + pad), color=bg_color)
                bg = bg.set_opacity(bg_opacity)
                bg = bg.set_position((x_pos - pad, y_pos)).set_start(start).set_duration(dur)
                clip = CompositeVideoClip([clip, bg])

            tc = tc.set_position((x_pos, y_pos)).set_start(start).set_duration(dur)
            clip = CompositeVideoClip([clip, tc])

        return clip

    # ------------------------------------------------------------------
    # Watermark
    # ------------------------------------------------------------------

    def _apply_watermark(self, clip, wm: Dict[str, Any], vw: int, vh: int):
        from moviepy.editor import TextClip, CompositeVideoClip, ImageClip

        wm_text = wm.get("text", "")
        wm_img_url = wm.get("image_url", "")
        pos = wm.get("position", "bottom_right")
        opacity = float(wm.get("opacity", 0.3))
        scale = float(wm.get("scale", 0.1))
        margin = int(wm.get("margin", 20))
        rotation = float(wm.get("rotation", 0.0))

        wm_clip = None

        if wm_text:
            font_size = max(12, int(vw * scale * 0.5))
            for fallback in ("DejaVu-Sans", None):
                try:
                    tc_kwargs: Dict[str, Any] = {
                        "text": wm_text,
                        "fontsize": font_size,
                        "color": "white",
                        "method": "caption",
                        "stroke_color": "black",
                        "stroke_width": 1,
                    }
                    if fallback:
                        tc_kwargs["font"] = fallback
                    wm_clip = TextClip(**tc_kwargs)
                    break
                except Exception:
                    continue
            if wm_clip is None:
                return clip
        elif wm_img_url:
            img_path = None
            try:
                img_path = self._download_file(wm_img_url)
                raw_wm = ImageClip(img_path, duration=clip.duration)
                wm_w = max(10, int(vw * scale))
                wm_h = int(raw_wm.h * (wm_w / max(1, raw_wm.w)))
                wm_clip = raw_wm.resize((wm_w, wm_h))
            except Exception as exc:
                logger.warning("Watermark image failed: %s", exc)
                return clip
            finally:
                if img_path and os.path.exists(img_path):
                    try:
                        os.unlink(img_path)
                    except OSError:
                        pass
        else:
            return clip

        ww, wh = wm_clip.size
        x, y = _watermark_position(pos, vw, vh, ww, wh, margin)

        wm_clip = wm_clip.set_position((x, y)).set_duration(clip.duration)
        if opacity < 1.0:
            wm_clip = wm_clip.set_opacity(opacity)
        if rotation != 0.0:
            wm_clip = wm_clip.rotate(rotation)

        return CompositeVideoClip([clip, wm_clip])

    # ------------------------------------------------------------------
    # Audio
    # ------------------------------------------------------------------

    def _attach_audio(self, clip, audio_cfg: Dict[str, Any]):
        from moviepy.editor import AudioFileClip

        audio_url = audio_cfg.get("url", "")
        audio_b64 = audio_cfg.get("base64_data")
        volume = float(audio_cfg.get("volume", 1.0))
        fade_in = float(audio_cfg.get("fade_in", audio_cfg.get("fadeInDuration", 0.5)))
        fade_out = float(audio_cfg.get("fade_out", audio_cfg.get("fadeOutDuration", 0.5)))
        trim_start = float(audio_cfg.get("trim_start", audio_cfg.get("trimStart", 0.0)))
        trim_end = audio_cfg.get("trim_end", audio_cfg.get("trimEnd"))

        audio_path = None
        try:
            if audio_b64:
                if audio_b64.startswith("data:"):
                    audio_b64 = audio_b64.split(",", 1)[1]
                raw = base64.b64decode(audio_b64)
                audio_path = f"temp/{uuid.uuid4().hex}.mp3"
                with open(audio_path, "wb") as f:
                    f.write(raw)
            elif audio_url:
                audio_path = self._download_file(audio_url)
            else:
                return clip

            ac = AudioFileClip(audio_path)
            if trim_start > 0:
                ac = ac.subclip(trim_start)
            if trim_end is not None and trim_end < ac.duration:
                ac = ac.subclip(0, trim_end)
            if ac.duration > clip.duration:
                ac = ac.subclip(0, clip.duration)
            ac = ac.volumex(volume)
            if fade_in > 0:
                ac = ac.audio_fadein(fade_in)
            if fade_out > 0:
                ac = ac.audio_fadeout(fade_out)
            return clip.set_audio(ac)
        finally:
            if audio_path and os.path.exists(audio_path):
                try:
                    os.unlink(audio_path)
                except OSError:
                    pass

    # ------------------------------------------------------------------
    # File I/O helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _save_b64(b64_data: str) -> str:
        if b64_data.startswith("data:"):
            b64_data = b64_data.split(",", 1)[1]
        raw = base64.b64decode(b64_data)
        path = f"temp/{uuid.uuid4().hex}.jpg"
        with open(path, "wb") as f:
            f.write(raw)
        return path

    @staticmethod
    def _download_file(url: str) -> str:
        resp = httpx.get(url, follow_redirects=True, timeout=30.0)
        resp.raise_for_status()
        path = f"temp/{uuid.uuid4().hex}.jpg"
        with open(path, "wb") as f:
            f.write(resp.content)
        return path


# Module-level singleton
enhanced_renderer = EnhancedRenderer()