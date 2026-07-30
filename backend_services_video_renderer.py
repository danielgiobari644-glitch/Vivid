"""Video rendering service — composites image clips, video clips, transitions,
text overlays, watermarks, subtitles, and background audio into a single
output video.

Public contract (preserved for backward-compatibility):
    video_renderer.render(project_config: dict) -> str   # returns render_id
    video_renderer.get_status(render_id: str) -> dict
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx
import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RESOLUTION_MAP: Dict[str, Tuple[int, int]] = {
    "480p": (854, 480),
    "720p": (1280, 720),
    "1080p": (1920, 1080),
    "4K": (3840, 2160),
}

ASPECT_RATIO_MAP: Dict[str, Tuple[int, int]] = {
    "16:9": (16, 9),
    "9:16": (9, 16),
    "1:1": (1, 1),
    "4:5": (4, 5),
    "3:2": (3, 2),
}

PRESET_CONFIGS: Dict[str, Dict[str, Any]] = {
    "tiktok": {
        "aspect_ratio": "9:16", "resolution": "1080p", "fps": 30,
        "max_duration": 180, "video_bitrate": 4000, "audio_bitrate": 128,
    },
    "instagram_reel": {
        "aspect_ratio": "9:16", "resolution": "1080p", "fps": 30,
        "max_duration": 90, "video_bitrate": 5000, "audio_bitrate": 128,
    },
    "instagram_story": {
        "aspect_ratio": "9:16", "resolution": "1080p", "fps": 30,
        "max_duration": 15, "video_bitrate": 4000, "audio_bitrate": 128,
    },
    "youtube_shorts": {
        "aspect_ratio": "9:16", "resolution": "1080p", "fps": 30,
        "max_duration": 60, "video_bitrate": 8000, "audio_bitrate": 192,
    },
    "youtube_thumbnail": {
        "aspect_ratio": "16:9", "resolution": "1280x720", "fps": 1,
        "max_duration": 1, "video_bitrate": 2000, "audio_bitrate": 0,
    },
    "twitter_post": {
        "aspect_ratio": "16:9", "resolution": "720p", "fps": 30,
        "max_duration": 140, "video_bitrate": 5000, "audio_bitrate": 128,
    },
    "linkedin_post": {
        "aspect_ratio": "16:9", "resolution": "1080p", "fps": 30,
        "max_duration": 10, "video_bitrate": 5000, "audio_bitrate": 128,
    },
    "custom": {},
}

QUALITY_PRESETS: Dict[str, Dict[str, Any]] = {
    "draft":  {"crf": 28, "preset": "ultrafast"},
    "low":    {"crf": 26, "preset": "fast"},
    "medium": {"crf": 23, "preset": "medium"},
    "high":   {"crf": 20, "preset": "medium"},
    "ultra":  {"crf": 17, "preset": "slow"},
}

SUPPORTED_VIDEO_EXTS = {"mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v"}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class RenderJob:
    status: str = "pending"
    progress: float = 0.0
    download_url: Optional[str] = None
    error: Optional[str] = None
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None
    file_size: Optional[int] = None
    thumbnail_url: Optional[str] = None
    callback_url: Optional[str] = None
    batch_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    settings_used: Dict[str, Any] = field(default_factory=dict)


class RenderError(Exception):
    """Raised when a render step fails."""
    pass


# ---------------------------------------------------------------------------
# VideoRenderer
# ---------------------------------------------------------------------------

class VideoRenderer:
    """Composites image clips, video clips, transitions, text overlays,
    watermarks, subtitles, and background audio into a single output video.

    Heavy rendering runs inside a :class:`ThreadPoolExecutor` so the
    async event loop is never blocked.
    """

    def __init__(self, max_workers: int = 2):
        self.render_jobs: Dict[str, RenderJob] = {}
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._lock = __import__("threading").Lock()
        os.makedirs("temp", exist_ok=True)
        os.makedirs("uploads", exist_ok=True)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def render(self, project_config: Dict[str, Any]) -> str:
        """Start an async render job and return the render_id."""
        render_id = uuid.uuid4().hex
        self.render_jobs[render_id] = RenderJob(
            started_at=time.time(),
            callback_url=project_config.get("callback_url"),
            batch_id=project_config.get("batch_id"),
            metadata=project_config.get("metadata", {}),
        )
        self._executor.submit(self._render_worker, render_id, project_config)
        return render_id

    def get_status(self, render_id: str) -> Dict[str, Any]:
        """Get the status of a render job."""
        if render_id not in self.render_jobs:
            return {"status": "not_found", "progress": 0, "error": "Render job not found"}
        job = self.render_jobs[render_id]
        result: Dict[str, Any] = {
            "status": job.status,
            "progress": job.progress,
            "download_url": job.download_url,
            "error": job.error,
            "width": job.width,
            "height": job.height,
            "duration": job.duration,
            "file_size": job.file_size,
            "thumbnail_url": job.thumbnail_url,
            "batch_id": job.batch_id,
            "metadata": job.metadata,
            "settings_used": job.settings_used,
        }
        if job.started_at:
            elapsed = time.time() - job.started_at
            progress = job.progress
            if 0 < progress < 100:
                result["estimated_time_remaining"] = int((elapsed / progress) * (100 - progress))
            if job.completed_at:
                result["render_time"] = job.completed_at - job.started_at
        return result

    # ------------------------------------------------------------------
    # Main worker
    # ------------------------------------------------------------------

    def _render_worker(self, render_id: str, project_config: Dict[str, Any]) -> None:
        job = self.render_jobs[render_id]
        job.status = "processing"
        temp_dir: Optional[str] = None
        try:
            # Resolve settings (presets override explicit values)
            settings = self._resolve_settings(project_config)
            job.settings_used = settings

            final_w, final_h = self._compute_dimensions(settings)
            fps = settings["fps"]

            temp_dir = tempfile.mkdtemp(prefix=f"render_{render_id}_", dir="temp")

            # --- Stage 1: Prepare individual clip files -------------------
            job.progress = 5.0
            image_clips = project_config.get("images", [])
            video_clips = project_config.get("videos", [])
            total_sources = len(image_clips) + len(video_clips)

            if total_sources == 0:
                raise RenderError("At least one image or video clip is required")

            prepared_clips: List[Dict[str, Any]] = []
            idx = 0
            for img_conf in image_clips:
                job.progress = 5.0 + (35.0 * idx / max(total_sources, 1))
                clip_info = self._prepare_image_clip(
                    img_conf, final_w, final_h, fps, temp_dir
                )
                if clip_info:
                    prepared_clips.append(clip_info)
                idx += 1

            for vid_conf in video_clips:
                job.progress = 5.0 + (35.0 * idx / max(total_sources, 1))
                clip_info = self._prepare_video_clip(
                    vid_conf, final_w, final_h, fps, temp_dir
                )
                if clip_info:
                    prepared_clips.append(clip_info)
                idx += 1

            if not prepared_clips:
                raise RenderError("No valid clips to render")

            # Sort by order if available
            prepared_clips.sort(key=lambda c: c.get("order", 0))

            job.progress = 42.0

            # --- Stage 2: Concatenate clips (with transitions) ------------
            transitions = project_config.get("transitions", [])
            concat_path = os.path.join(temp_dir, "concat.mp4")
            self._concatenate_clips(prepared_clips, transitions, concat_path, fps, final_w, final_h)

            job.progress = 60.0

            # --- Stage 3: Add text overlays --------------------------------
            texts = project_config.get("texts", [])
            with_text_path = os.path.join(temp_dir, "with_text.mp4")
            if texts:
                self._burn_text_overlays(concat_path, texts, with_text_path, final_w, final_h)
            else:
                shutil.copy2(concat_path, with_text_path)

            job.progress = 70.0

            # --- Stage 4: Add watermark -----------------------------------
            watermark_conf = project_config.get("watermark")
            with_wm_path = os.path.join(temp_dir, "with_wm.mp4")
            if watermark_conf:
                self._burn_watermark(with_text_path, watermark_conf, with_wm_path, final_w, final_h)
            else:
                shutil.copy2(with_text_path, with_wm_path)

            job.progress = 75.0

            # --- Stage 5: Add subtitles ------------------------------------
            subtitle_conf = project_config.get("subtitle")
            with_sub_path = os.path.join(temp_dir, "with_sub.mp4")
            if subtitle_conf:
                self._burn_subtitles(with_wm_path, subtitle_conf, with_sub_path, temp_dir)
            else:
                shutil.copy2(with_wm_path, with_sub_path)

            job.progress = 80.0

            # --- Stage 6: Mix audio ----------------------------------------
            audio_config = project_config.get("audio")
            with_audio_path = os.path.join(temp_dir, "with_audio.mp4")
            if audio_config:
                self._mix_audio(with_sub_path, audio_config, with_audio_path, temp_dir)
            else:
                shutil.copy2(with_sub_path, with_audio_path)

            job.progress = 88.0

            # --- Stage 7: Final encode ------------------------------------
            output_path = os.path.join("uploads", f"{render_id}.mp4")
            self._final_encode(with_audio_path, output_path, settings, final_w, final_h)

            job.progress = 95.0

            # --- Stage 8: Extract metadata and thumbnail -------------------
            duration, out_w, out_h, file_size = self._probe_output(output_path)
            job.duration = duration
            job.width = out_w
            job.height = out_h
            job.file_size = file_size
            job.download_url = f"/api/video/download/{render_id}"

            thumb_path = os.path.join(temp_dir, "thumb.jpg")
            self._extract_thumbnail(output_path, thumb_path, duration)
            thumb_b64 = self._file_to_b64(thumb_path)
            if thumb_b64:
                # Store thumbnail in job for retrieval
                job.thumbnail_url = f"data:image/jpeg;base64,{thumb_b64[:100]}..."
                job.metadata["thumbnail_b64"] = thumb_b64

            job.progress = 100.0
            job.status = "completed"
            job.completed_at = time.time()

            # Fire callback if configured
            if job.callback_url:
                self._fire_callback(job.callback_url, render_id, job)

            logger.info(
                "Render %s completed: %.1fs, %dx%d, %d bytes",
                render_id, duration, out_w, out_h, file_size,
            )

        except Exception as e:
            job.status = "failed"
            job.error = str(e)
            job.progress = 0.0
            logger.error("Render %s failed: %s", render_id, e, exc_info=True)
        finally:
            # Clean up temp directory
            if temp_dir and os.path.isdir(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)

    # ------------------------------------------------------------------
    # Settings resolution
    # ------------------------------------------------------------------

    def _resolve_settings(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Merge preset defaults, explicit settings, and schema defaults."""
        raw_settings = config.get("settings", {})
        if isinstance(raw_settings, dict):
            raw = raw_settings
        else:
            raw = {}

        # Start with quality preset
        quality = raw.get("quality", config.get("quality", "high"))
        qp = QUALITY_PRESETS.get(quality, QUALITY_PRESETS["high"])

        result: Dict[str, Any] = {
            "crf": qp["crf"],
            "preset": qp["preset"],
            "quality": quality,
            "fps": raw.get("fps", 30),
            "resolution": raw.get("resolution", config.get("resolution", "720p")),
            "aspect_ratio": raw.get("aspect_ratio", config.get("aspect_ratio", "16:9")),
            "background_color": raw.get("background_color", "#000000"),
            "codec": raw.get("codec", config.get("codec", "h264")),
            "export_format": raw.get("export_format", config.get("export_format", "mp4")),
            "audio_bitrate": raw.get("audio_bitrate", 128),
            "video_bitrate": raw.get("video_bitrate"),
            "two_pass": raw.get("two_pass_encoding", False),
            "hardware_accel": raw.get("hardware_acceleration", True),
            "color_profile": raw.get("color_profile", "srgb"),
        }

        # Apply platform preset overrides
        preset_name = config.get("preset")
        if preset_name and preset_name != "custom":
            pc = PRESET_CONFIGS.get(preset_name, {})
            for key in ("aspect_ratio", "resolution", "fps", "video_bitrate", "audio_bitrate"):
                if key in pc:
                    result[key] = pc[key]

        return result

    def _compute_dimensions(self, settings: Dict[str, Any]) -> Tuple[int, int]:
        """Compute final pixel dimensions from resolution + aspect ratio."""
        res_key = str(settings.get("resolution", "720p"))
        if "x" in res_key:
            parts = res_key.split("x")
            target_w, target_h = int(parts[0]), int(parts[1])
        else:
            target_w, target_h = RESOLUTION_MAP.get(res_key, (1280, 720))

        ar_key = str(settings.get("aspect_ratio", "16:9"))
        ar_w, ar_h = ASPECT_RATIO_MAP.get(ar_key, (16, 9))

        # Fit the aspect ratio within the resolution bounds
        calc_h = int(target_w * ar_h / ar_w)
        if calc_h <= target_h:
            final_w, final_h = target_w, calc_h
        else:
            final_w = int(target_h * ar_w / ar_h)
            final_h = target_h

        # Ensure even dimensions (required by many codecs)
        final_w = max(final_w - (final_w % 2), 2)
        final_h = max(final_h - (final_h % 2), 2)
        return final_w, final_h

    # ------------------------------------------------------------------
    # Clip preparation
    # ------------------------------------------------------------------

    def _prepare_image_clip(
        self,
        img_conf: Dict[str, Any],
        target_w: int,
        target_h: int,
        fps: int,
        temp_dir: str,
    ) -> Optional[Dict[str, Any]]:
        """Convert a single image config into a video clip file.

        Returns a dict with keys: path, duration, order, or None on failure.
        """
        img_url = img_conf.get("url")
        img_b64 = img_conf.get("base64_data")
        duration = float(img_conf.get("duration", 3.0))
        effect = img_conf.get("effect", "none")
        order = int(img_conf.get("order", 0))

        # Acquire the image file
        img_path: Optional[str] = None
        try:
            if img_b64:
                img_path = self._save_b64_to_file(img_b64, temp_dir, ".jpg")
            elif img_url:
                img_path = self._download_file(img_url, temp_dir, ".jpg")
            else:
                logger.warning("Image clip has no url or base64_data, skipping")
                return None

            # Use ffmpeg to turn the image into a video clip with effects
            clip_path = os.path.join(temp_dir, f"clip_img_{uuid.uuid4().hex}.mp4")
            self._image_to_video(img_path, clip_path, duration, target_w, target_h, fps, effect)
            return {"path": clip_path, "duration": duration, "order": order}

        except Exception as e:
            logger.warning("Failed to prepare image clip: %s", e)
            return None

    def _prepare_video_clip(
        self,
        vid_conf: Dict[str, Any],
        target_w: int,
        target_h: int,
        fps: int,
        temp_dir: str,
    ) -> Optional[Dict[str, Any]]:
        """Prepare a video clip: download, trim, resize, adjust speed/volume.

        Returns a dict with keys: path, duration, order, or None on failure.
        """
        vid_url = vid_conf.get("url")
        vid_b64 = vid_conf.get("base64_data")
        trim_start = float(vid_conf.get("trim_start", 0.0))
        trim_end = vid_conf.get("trim_end")
        speed = float(vid_conf.get("speed", 1.0))
        volume = float(vid_conf.get("volume", 1.0))
        opacity = float(vid_conf.get("opacity", 1.0))
        order = int(vid_conf.get("order", 0))

        # Acquire the video file
        src_path: Optional[str] = None
        try:
            if vid_b64:
                src_path = self._save_b64_to_file(vid_b64, temp_dir, ".mp4")
            elif vid_url:
                src_path = self._download_file(vid_url, temp_dir, ".mp4")
            else:
                logger.warning("Video clip has no url or base64_data, skipping")
                return None

            # Probe source duration
            src_duration = self._probe_duration(src_path)
            if src_duration <= 0:
                raise RenderError(f"Source video has invalid duration: {src_duration}")

            # Apply trim
            if trim_end is not None:
                trim_end = min(float(trim_end), src_duration)
            else:
                trim_end = src_duration
            if trim_start >= trim_end:
                raise RenderError("trim_start must be less than trim_end")

            clip_duration = trim_end - trim_start

            # Calculate actual output duration accounting for speed
            out_duration = clip_duration / max(speed, 0.01)

            clip_path = os.path.join(temp_dir, f"clip_vid_{uuid.uuid4().hex}.mp4")
            self._process_video_clip(
                src_path, clip_path,
                trim_start=trim_start,
                trim_end=trim_end,
                speed=speed,
                volume=volume,
                opacity=opacity,
                target_w=target_w,
                target_h=target_h,
                fps=fps,
            )

            return {"path": clip_path, "duration": out_duration, "order": order}

        except Exception as e:
            logger.warning("Failed to prepare video clip: %s", e)
            return None

    # ------------------------------------------------------------------
    # ffmpeg helpers
    # ------------------------------------------------------------------

    def _run_ffmpeg(self, args: List[str], timeout: int = 300) -> None:
        """Run an ffmpeg command, raising RenderError on failure."""
        cmd = ["ffmpeg", "-y", "-v", "warning"] + args
        logger.debug("Running: %s", " ".join(cmd))
        try:
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=timeout,
            )
            if result.returncode != 0:
                stderr = result.stderr.decode("utf-8", errors="replace")[-2000:]
                raise RenderError(f"ffmpeg failed (code {result.returncode}): {stderr}")
        except subprocess.TimeoutExpired:
            raise RenderError("ffmpeg command timed out")
        except FileNotFoundError:
            raise RenderError("ffmpeg is not installed or not on PATH")

    def _run_ffprobe(self, args: List[str]) -> str:
        """Run ffprobe and return stdout."""
        cmd = ["ffprobe", "-v", "quiet"] + args
        try:
            result = subprocess.run(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30
            )
            return result.stdout.decode("utf-8", errors="replace")
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return ""

    def _probe_duration(self, file_path: str) -> float:
        """Get duration of a media file in seconds."""
        output = self._run_ffprobe([
            "-print_format", "json", "-show_format", file_path
        ])
        try:
            info = json.loads(output)
            return float(info["format"]["duration"])
        except (json.JSONDecodeError, KeyError, ValueError):
            return 0.0

    def _probe_output(self, file_path: str) -> Tuple[float, int, int, int]:
        """Probe the final output for duration, width, height, and file size."""
        file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
        output = self._run_ffprobe([
            "-print_format", "json",
            "-show_format", "-show_streams", file_path
        ])
        duration = 0.0
        width = 0
        height = 0
        try:
            info = json.loads(output)
            duration = float(info.get("format", {}).get("duration", 0))
            for stream in info.get("streams", []):
                if stream.get("codec_type") == "video":
                    width = stream.get("width", 0)
                    height = stream.get("height", 0)
                    break
        except (json.JSONDecodeError, KeyError, ValueError):
            pass
        return duration, width, height, file_size

    # ------------------------------------------------------------------
    # Image → video conversion
    # ------------------------------------------------------------------

    def _image_to_video(
        self,
        img_path: str,
        out_path: str,
        duration: float,
        target_w: int,
        target_h: int,
        fps: int,
        effect: str,
    ) -> None:
        """Convert a still image to a video clip using ffmpeg.

        Handles resize-to-cover, Ken Burns / pan / zoom effects via
        the zoompan filter.
        """
        # Build the zoompan filter expression
        zoompan_expr = self._build_zoompan_filter(effect, duration, fps, target_w, target_h)

        args = [
            "-loop", "1",
            "-i", img_path,
            "-vf", zoompan_expr,
            "-t", str(duration),
            "-s", f"{target_w}x{target_h}",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "ultrafast",
            "-an",
            out_path,
        ]
        self._run_ffmpeg(args)

    def _build_zoompan_filter(
        self,
        effect: str,
        duration: float,
        fps: int,
        target_w: int,
        target_h: int,
    ) -> str:
        """Build a ffmpeg zoompan filter string for the given effect.

        The zoompan filter is highly efficient for pan/zoom on still images.
        """
        total_frames = int(duration * fps)
        if total_frames < 1:
            total_frames = 1

        if effect in ("none", "", None):
            # Simple static image → video (no zoompan needed, just scale)
            return f"scale={target_w}:{target_h}:force_original_aspect_ratio=increase,"
            return f"crop={target_w}:{target_h}"

        # Default: zoom from 1.0 to 1.2 over the duration
        z_start = 1.0
        z_end = 1.2
        x_expr = "iw/2-(iw/zoom/2)"
        y_expr = "ih/2-(ih/zoom/2)"

        if effect == "ken_burns":
            z_start, z_end = 1.0, 1.3
            x_expr = "iw/2-(iw/zoom/2)+((iw-iw/zoom)/2)*on/{0}".format(total_frames)
            y_expr = "ih/2-(ih/zoom/2)"
        elif effect == "smooth_zoom":
            z_start, z_end = 1.0, 1.2
        elif effect == "zoom_in":
            z_start, z_end = 1.0, 1.4
        elif effect == "zoom_out":
            z_start, z_end = 1.4, 1.0
        elif effect == "pan_left":
            z_start, z_end = 1.2, 1.2
            x_expr = "(iw-iw/zoom)*(1-on/{0})".format(total_frames)
        elif effect == "pan_right":
            z_start, z_end = 1.2, 1.2
            x_expr = "(iw-iw/zoom)*(on/{0})".format(total_frames)
        elif effect == "pan_up":
            z_start, z_end = 1.2, 1.2
            y_expr = "(ih-ih/zoom)*(1-on/{0})".format(total_frames)
        elif effect == "pan_down":
            z_start, z_end = 1.2, 1.2
            y_expr = "(ih-ih/zoom)*(on/{0})".format(total_frames)

        # Interpolate zoom: z = z_start + (z_end - z_start) * (on / total_frames)
        if z_start != z_end:
            z_expr = "{0}+({1}-{0})*on/{2}".format(z_start, z_end, total_frames)
        else:
            z_expr = str(z_start)

        zp = (
            f"zoompan=z=\'{z_expr}\':x=\'{x_expr}\':y=\'{y_expr}\'"
            f":d={total_frames}:s={target_w}x{target_h}:fps={fps}"
        )
        return zp

    # ------------------------------------------------------------------
    # Video clip processing
    # ------------------------------------------------------------------

    def _process_video_clip(
        self,
        src_path: str,
        out_path: str,
        trim_start: float,
        trim_end: float,
        speed: float,
        volume: float,
        opacity: float,
        target_w: int,
        target_h: int,
        fps: int,
    ) -> None:
        """Trim, resize, speed-adjust, and normalize a video clip."""
        vf_parts: List[str] = []
        af_parts: List[str] = []

        # Scale to fit (letterbox/pillarbox to maintain aspect ratio)
        vf_parts.append(f"scale={target_w}:{target_h}:force_original_aspect_ratio=decrease")
        vf_parts.append(f"pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:black")

        # Opacity
        if opacity < 1.0:
            vf_parts.append(f"colorchannelmixer=aa={opacity}")

        # Speed (video)
        if speed != 1.0:
            # Use setpts for video speed. For audio, use atempo.
            vf_parts.append(f"setpts=PTS/{speed}")
            if speed != 1.0:
                af_parts.append(self._build_atempo_chain(speed))

        # Volume
        if volume != 1.0:
            af_parts.append(f"volume={volume}")

        vf = ",".join(vf_parts) if vf_parts else None
        af = ",".join(af_parts) if af_parts else None

        args = ["-ss", str(trim_start), "-to", str(trim_end), "-i", src_path]
        if vf:
            args += ["-vf", vf]
        if af:
            args += ["-af", af]
        args += [
            "-r", str(fps),
            "-c:v", "libx264",
            "-c:a", "aac",
            "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            out_path,
        ]
        self._run_ffmpeg(args)

    @staticmethod
    def _build_atempo_chain(speed: float) -> str:
        """Build an atempo filter chain for speeds outside the [0.5, 2.0] range.

        atempo only supports values in [0.5, 100.0] but for best quality
        we chain multiple atempo filters for extreme speeds.
        """
        filters = []
        remaining = speed
        while remaining > 2.0:
            filters.append("atempo=2.0")
            remaining /= 2.0
        while remaining < 0.5:
            filters.append("atempo=0.5")
            remaining /= 0.5
        filters.append(f"atempo={remaining:.4f}")
        return ",".join(filters)

    # ------------------------------------------------------------------
    # Concatenation with transitions
    # ------------------------------------------------------------------

    def _concatenate_clips(
        self,
        clips: List[Dict[str, Any]],
        transitions: List[str],
        out_path: str,
        fps: int,
        target_w: int,
        target_h: int,
    ) -> None:
        """Concatenate prepared clips, applying transitions between them.

        Strategy:
        - If no transitions (or all "none"), use ffmpeg concat demuxer (fastest).
        - If transitions are specified, use xfade filter between adjacent clips.
        """
        if len(clips) == 1:
            shutil.copy2(clips[0]["path"], out_path)
            return

        # Determine if we need xfade or can use simple concat
        has_transitions = any(
            t and t != "none" for t in transitions
        )

        if not has_transitions:
            self._concat_demuxer(clips, out_path)
        else:
            self._concat_with_xfade(clips, transitions, out_path, fps, target_w, target_h)

    def _concat_demuxer(self, clips: List[Dict[str, Any]], out_path: str) -> None:
        """Fast concatenation using ffmpeg concat demuxer.

        All clips must have the same codec/parameters.
        """
        # Create a concat list file
        list_path = os.path.join(os.path.dirname(out_path), "concat_list.txt")
        with open(list_path, "w") as f:
            for clip in clips:
                f.write(f"file \'{clip["path"]}\'\n")

        self._run_ffmpeg([
            "-f", "concat", "-safe", "0",
            "-i", list_path,
            "-c", "copy",
            "-movflags", "+faststart",
            out_path,
        ])
        os.unlink(list_path)

    def _concat_with_xfade(
        self,
        clips: List[Dict[str, Any]],
        transitions: List[str],
        out_path: str,
        fps: int,
        target_w: int,
        target_h: int,
    ) -> None:
        """Concatenate clips using ffmpeg xfade filter for transitions.

        Supports: fade, crossfade, slideleft, slideright, slideup,
        slidedown, wipeleft, wiperight, circleopen, circleclose, etc.
        """
        # Normalize transition names to ffmpeg xfade types
        transition_map = {
            "crossfade": "fade",
            "fade": "fade",
            "slide_left": "slideleft",
            "slide_right": "slideright",
            "slide_up": "slideup",
            "slide_down": "slidedown",
            "wipe_left": "wipeleft",
            "wipe_right": "wiperight",
            "blur": "smoothleft",
            "dissolve": "dissolve",
            "none": None,
        }

        transition_duration = 0.5

        # Build input arguments
        input_args: List[str] = []
        for clip in clips:
            input_args.extend(["-i", clip["path"]])

        # Build the xfade filter chain
        # For n clips, we need n-1 xfade filters
        n = len(clips)
        filter_parts: List[str] = []
        audio_parts: List[str] = []

        # Track cumulative offset for xfade timing
        offset = 0.0
        for i in range(n - 1):
            t_name = transitions[i] if i < len(transitions) else "crossfade"
            xfade_type = transition_map.get(t_name, "fade")
            if xfade_type is None:
                # No transition — just offset
                offset += clips[i]["duration"]
                continue

            td = min(transition_duration, clips[i]["duration"] * 0.5, clips[i + 1]["duration"] * 0.5)

            if i == 0:
                in_a = "[0:v]"
            else:
                in_a = f"[v{i}]"

            in_b = f"[{i + 1}:v]"
            out_label = f"[v{i + 1}]" if i < n - 2 else "[vout]"

            filter_parts.append(
                f"{in_a}{in_b}xfade=transition={xfade_type}:duration={td}:offset={offset:.3f}{out_label}"
            )

            # Audio crossfade
            if i == 0:
                audio_in_a = "[0:a]"
            else:
                audio_in_a = f"[a{i}]"
            audio_in_b = f"[{i + 1}:a]"
            audio_out = f"[a{i + 1}]" if i < n - 2 else "[aout]"
            audio_parts.append(
                f"{audio_in_a}{audio_in_b}acrossfade=d={td}{audio_out}"
            )

            offset += clips[i]["duration"] - td

        # If some transitions were "none", we need to concat those parts
        if not filter_parts:
            # All transitions are "none" — fall back to demuxer
            self._concat_demuxer(clips, out_path)
            return

        # Check if all clips have audio; if not, skip audio filter
        has_audio = True
        for clip in clips:
            probe = self._run_ffprobe([
                "-select_streams", "a",
                "-show_entries", "stream=codec_type",
                "-print_format", "json",
                clip["path"],
            ])
            if "\"codec_type\": \"audio\"" not in probe:
                has_audio = False
                break

        vf = ";".join(filter_parts)
        args = input_args + ["-filter_complex", vf]

        if has_audio and audio_parts:
            af = ";".join(audio_parts)
            args += ["-map", "[vout]", "-map", "[aout]"]
            # Merge filter_complex for both video and audio
            args = input_args + ["-filter_complex", f"{vf};{af}", "-map", "[vout]", "-map", "[aout]"]
        else:
            args = input_args + ["-filter_complex", vf, "-map", "[vout]"]

        args += [
            "-r", str(fps),
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            out_path,
        ]
        self._run_ffmpeg(args)

    # ------------------------------------------------------------------
    # Text overlays
    # ------------------------------------------------------------------

    def _burn_text_overlays(
        self,
        input_path: str,
        texts: List[Dict[str, Any]],
        out_path: str,
        video_w: int,
        video_h: int,
    ) -> None:
        """Burn text overlays into the video using ffmpeg drawtext filter.

        Supports positioning, font size, color, stroke, and animations
        (fade in/out, slide in).
        """
        drawtext_filters: List[str] = []

        for i, txt in enumerate(texts):
            content = txt.get("content", "").strip()
            if not content:
                continue

            font = txt.get("font", "Arial")
            font_size = int(txt.get("size", 48))
            color = txt.get("color", "#FFFFFF").lstrip("#")
            stroke_color = (txt.get("stroke_color") or "").lstrip("#")
            stroke_width = int(txt.get("stroke_width", 0))
            x_ratio = float(txt.get("x", 0.5))
            y_ratio = float(txt.get("y", 0.5))
            start_time = float(txt.get("start_time", 0.0))
            end_time = txt.get("end_time")  # None means until end
            animation = txt.get("animation", "none")

            # Escape special characters for drawtext
            safe_text = content.replace("\'", "\'\\\\\'\'\\\\\'\'").replace(":", "\\\\:").replace("\\", "\\\\\\\\")

            # Compute pixel positions
            x_px = int(x_ratio * video_w)
            y_px = int(y_ratio * video_h)

            # Build enable expression for timing
            enable = f"between(t,{start_time:.2f},{end_time or 99999:.2f})"

            # Build base drawtext
            dt = f"drawtext=text=\'{safe_text}\':fontfile={self._find_font(font)}:fontsize={font_size}:fontcolor=#{color}:x={x_px}-text_w/2:y={y_px}-text_h/2:enable=\'{enable}\'"

            if stroke_color and stroke_width > 0:
                dt += f":borderw={stroke_width}:bordercolor=#{stroke_color}"

            # Animations
            if animation == "fade_in":
                fade_dur = 0.5
                dt += f":alpha=\'if(lt(t-{start_time:.2f},{fade_dur}),(t-{start_time:.2f})/{fade_dur},1)\'"
            elif animation == "fade_out":
                if end_time:
                    fade_dur = 0.5
                    dt += f":alpha=\'if(gt(t,{end_time - fade_dur:.2f}),1-(t-{end_time - fade_dur:.2f})/{fade_dur},1)\'"
            elif animation == "slide_up_in":
                slide_dur = 0.5
                base_y = y_px + 100
                dt += f":y=\'if(lt(t-{start_time:.2f},{slide_dur}),{base_y}-100*(t-{start_time:.2f})/{slide_dur},{y_px})-text_h/2\'"
            elif animation == "slide_down_in":
                slide_dur = 0.5
                base_y = y_px - 100
                dt += f":y=\'if(lt(t-{start_time:.2f},{slide_dur}),{base_y}+100*(t-{start_time:.2f})/{slide_dur},{y_px})-text_h/2\'"

            drawtext_filters.append(dt)

        if not drawtext_filters:
            shutil.copy2(input_path, out_path)
            return

        vf = ",".join(drawtext_filters)
        self._run_ffmpeg([
            "-i", input_path,
            "-vf", vf,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-c:a", "copy",
            "-movflags", "+faststart",
            out_path,
        ])

    def _find_font(self, font_name: str) -> str:
        """Find a font file path. Falls back to DejaVu Sans if not found."""
        import subprocess
        common_paths = [
            f"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            f"/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            f"/usr/share/fonts/TTF/DejaVuSans.ttf",
            f"/usr/share/fonts/dejavu/DejaVuSans.ttf",
            f"/usr/local/share/fonts/dejavu/DejaVuSans.ttf",
        ]
        for p in common_paths:
            if os.path.exists(p):
                return p
        # Try fc-match
        try:
            result = subprocess.run(
                ["fc-match", "-f", "%{file}", font_name],
                capture_output=True, text=True, timeout=5
            )
            if result.stdout.strip() and os.path.exists(result.stdout.strip()):
                return result.stdout.strip()
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass
        # Ultimate fallback
        return "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

    # ------------------------------------------------------------------
    # Watermark
    # ------------------------------------------------------------------

    def _burn_watermark(
        self,
        input_path: str,
        watermark_conf: Dict[str, Any],
        out_path: str,
        video_w: int,
        video_h: int,
    ) -> None:
        """Burn a watermark (text or image) onto the video."""
        wm_text = watermark_conf.get("text")
        wm_url = watermark_conf.get("image_url")
        position = watermark_conf.get("position", "bottom_right")
        opacity = float(watermark_conf.get("opacity", 0.3))
        scale_frac = float(watermark_conf.get("scale", 0.1))
        margin = int(watermark_conf.get("margin", 20))

        if not wm_text and not wm_url:
            shutil.copy2(input_path, out_path)
            return

        if wm_url:
            # Image watermark
            temp_dir = os.path.dirname(out_path)
            wm_img_path = self._download_file(wm_url, temp_dir, ".png")
            wm_w = int(video_w * scale_frac)
            wm_h = int(video_h * scale_frac)

            # Compute overlay position
            x, y = self._compute_overlay_position(position, video_w, video_h, wm_w, wm_h, margin)

            self._run_ffmpeg([
                "-i", input_path,
                "-i", wm_img_path,
                "-filter_complex",
                f"[1:v]scale={wm_w}:{wm_h},format=rgba,colorchannelmixer=aa={opacity}[wm];[0:v][wm]overlay={x}:{y}",
                "-c:v", "libx264", "-preset", "ultrafast",
                "-c:a", "copy",
                "-movflags", "+faststart",
                out_path,
            ])
        else:
            # Text watermark
            font = self._find_font("Arial")
            font_size = max(int(video_h * scale_frac * 0.5), 12)
            color = "#FFFFFF"
            x, y = self._compute_overlay_position(position, video_w, video_h, font_size * 6, font_size, margin)

            self._run_ffmpeg([
                "-i", input_path,
                "-vf", f"drawtext=text=\'{wm_text}\':fontfile={font}:fontsize={font_size}:fontcolor={color}@{opacity}:x={x}:y={y}",
                "-c:v", "libx264", "-preset", "ultrafast",
                "-c:a", "copy",
                "-movflags", "+faststart",
                out_path,
            ])

    @staticmethod
    def _compute_overlay_position(
        position: str, vw: int, vh: int, ow: int, oh: int, margin: int
    ) -> Tuple[int, int]:
        """Compute overlay x,y from a named position."""
        positions = {
            "top_left": (margin, margin),
            "top_right": (vw - ow - margin, margin),
            "bottom_left": (margin, vh - oh - margin),
            "bottom_right": (vw - ow - margin, vh - oh - margin),
            "center": ((vw - ow) // 2, (vh - oh) // 2),
            "bottom_center": ((vw - ow) // 2, vh - oh - margin),
            "top_center": ((vw - ow) // 2, margin),
        }
        return positions.get(position, positions["bottom_right"])

    # ------------------------------------------------------------------
    # Subtitles
    # ------------------------------------------------------------------

    def _burn_subtitles(
        self,
        input_path: str,
        subtitle_conf: Dict[str, Any],
        out_path: str,
        temp_dir: str,
    ) -> None:
        """Burn subtitles into the video.

        Accepts SRT or VTT content, converts to ASS for styled rendering.
        """
        content = subtitle_conf.get("content", "").strip()
        if not content:
            shutil.copy2(input_path, out_path)
            return

        fmt = subtitle_conf.get("format", "srt")
        font = subtitle_conf.get("font", "Arial")
        font_size = int(subtitle_conf.get("size", 24))
        color = subtitle_conf.get("color", "#FFFFFF").lstrip("#")
        bg_color = (subtitle_conf.get("background_color") or "#000000").lstrip("#")
        bg_opacity = float(subtitle_conf.get("background_opacity", 0.6))
        position = subtitle_conf.get("position", "bottom_center")

        # Map position to ASS alignment
        alignment_map = {
            "bottom_left": "1", "bottom_center": "2", "bottom_right": "3",
            "mid_left": "4", "mid_center": "5", "mid_right": "6",
            "top_left": "7", "top_center": "8", "top_right": "9",
        }
        alignment = alignment_map.get(position, "2")

        # Convert SRT/VTT content to ASS format
        if fmt == "srt":
            ass_content = self._srt_to_ass(content, font, font_size, color, bg_color, bg_opacity, alignment)
        elif fmt == "vtt":
            srt_content = self._vtt_to_srt(content)
            ass_content = self._srt_to_ass(srt_content, font, font_size, color, bg_color, bg_opacity, alignment)
        elif fmt == "ass":
            ass_content = content
        else:
            # embedded or unknown — try as SRT
            ass_content = self._srt_to_ass(content, font, font_size, color, bg_color, bg_opacity, alignment)

        # Write ASS file
        ass_path = os.path.join(temp_dir, "subs.ass")
        with open(ass_path, "w", encoding="utf-8") as f:
            f.write(ass_content)

        self._run_ffmpeg([
            "-i", input_path,
            "-vf", f"ass={ass_path}",
            "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "copy",
            "-movflags", "+faststart",
            out_path,
        ])

    @staticmethod
    def _srt_to_ass(
        srt_content: str,
        font: str,
        font_size: int,
        color: str,
        bg_color: str,
        bg_opacity: float,
        alignment: str,
    ) -> str:
        """Convert SRT subtitle content to ASS format."""
        # ASS header
        bg_a = int(bg_opacity * 255)
        ass = f"""[Script Info]
Title: Subtitles
ScriptType: v4.00+
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font},{font_size},&H{color[4:6]}{color[2:4]}{color[0:2]},&H000000FF,&H00000000,&H{bg_color[4:6]}{bg_color[2:4]}{bg_color[0:2]}{bg_a:02X},0,0,0,0,100,100,0,0,1,2,0,{alignment},10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

        # Parse SRT entries
        import re
        # Split by blank lines
        blocks = re.split(r"\n\s*\n", srt_content.strip())
        for block in blocks:
            lines = block.strip().split("\n")
            if len(lines) < 3:
                continue
            # Find timestamp line
            for i, line in enumerate(lines):
                if "-->" in line:
                    time_line = line.strip()
                    text_lines = lines[i + 1:]
                    break
            else:
                continue

            # Parse timestamp: 00:00:00,000 --> 00:00:00,000
            match = re.match(
                r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})",
                time_line,
            )
            if not match:
                continue

            h1, m1, s1, ms1, h2, m2, s2, ms2 = match.groups()
            start = f"{h1}:{m1}:{s1}.{ms1}"
            end = f"{h2}:{m2}:{s2}.{ms2}"
            text = "\\N".join(l.strip() for l in text_lines)
            text = text.replace("<", "{\\i1}").replace(">", "{\\i0}")

            ass += f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}\n"

        return ass

    @staticmethod
    def _vtt_to_srt(vtt_content: str) -> str:
        """Convert WebVTT content to SRT format."""
        import re
        # Remove WEBVTT header and any metadata
        lines = vtt_content.strip().split("\n")
        srt_lines = []
        entry_num = 0
        for line in lines:
            line = line.strip()
            if line.startswith("WEBVTT") or line.startswith("Kind:") or line.startswith("Language:"):
                continue
            if not line:
                srt_lines.append("")
                continue
            # Convert VTT timestamp (00:00:00.000) to SRT (00:00:00,000)
            if "-->" in line:
                entry_num += 1
                srt_lines.append(str(entry_num))
                line = line.replace(".", ",")
            srt_lines.append(line)
        return "\n".join(srt_lines)

    # ------------------------------------------------------------------
    # Audio mixing
    # ------------------------------------------------------------------

    def _mix_audio(
        self,
        video_path: str,
        audio_config: Dict[str, Any],
        out_path: str,
        temp_dir: str,
    ) -> None:
        """Mix background audio into the video.

        Downloads audio from URL or decodes base64, then mixes it with
        the video\'s existing audio track (if any) using amix.
        """
        audio_url = audio_config.get("url")
        audio_b64 = audio_config.get("base64_data")
        volume = float(audio_config.get("volume", 1.0))
        fade_in = float(audio_config.get("fade_in", 0.5))
        fade_out = float(audio_config.get("fade_out", 0.5))
        trim_start = float(audio_config.get("trim_start", 0.0))
        trim_end = audio_config.get("trim_end")

        # Acquire audio file
        audio_path: Optional[str] = None
        try:
            if audio_b64:
                audio_path = self._save_b64_to_file(audio_b64, temp_dir, ".mp3")
            elif audio_url:
                audio_path = self._download_file(audio_url, temp_dir, ".mp3")
            else:
                shutil.copy2(video_path, out_path)
                return

            # Get video duration for trimming
            video_duration = self._probe_duration(video_path)

            # Build audio filter: trim + volume + fades
            af_parts: List[str] = []
            if trim_start > 0:
                af_parts.append(f"atrim=start={trim_start}")
            if trim_end is not None:
                af_parts.append(f"atrim=end={trim_end}")
            if volume != 1.0:
                af_parts.append(f"volume={volume}")
            if fade_in > 0:
                af_parts.append(f"afade=t=in:d={fade_in}")
            if fade_out > 0:
                af_parts.append(f"afade=t=out:d={fade_out}")

            # Trim audio to video duration
            af = ",".join(af_parts) if af_parts else None

            # Check if video has existing audio
            has_video_audio = self._has_audio_stream(video_path)

            if has_video_audio:
                # Mix both audio tracks
                args = ["-i", video_path, "-i", audio_path]
                if af:
                    args.extend(["-filter_complex", f"[1:a]{af}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]"])
                    args.extend(["-map", "0:v", "-map", "[aout]"])
                else:
                    args.extend(["-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]"])
                    args.extend(["-map", "0:v", "-map", "[aout]"])
            else:
                # Just add the audio track
                args = ["-i", video_path, "-i", audio_path]
                if af:
                    args.extend(["-filter_complex", f"[1:a]{af}[aout]"])
                    args.extend(["-map", "0:v", "-map", "[aout]"])
                else:
                    args.extend(["-map", "0:v", "-map", "1:a"])

            args.extend([
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "128k",
                "-shortest",
                "-movflags", "+faststart",
                out_path,
            ])
            self._run_ffmpeg(args)

        finally:
            if audio_path and os.path.exists(audio_path):
                os.unlink(audio_path)

    def _has_audio_stream(self, file_path: str) -> bool:
        """Check if a file has an audio stream."""
        output = self._run_ffprobe([
            "-select_streams", "a",
            "-show_entries", "stream=codec_type",
            "-print_format", "json",
            file_path,
        ])
        return "\"codec_type\": \"audio\"" in output

    # ------------------------------------------------------------------
    # Final encoding
    # ------------------------------------------------------------------

    def _final_encode(
        self,
        input_path: str,
        output_path: str,
        settings: Dict[str, Any],
        target_w: int,
        target_h: int,
    ) -> None:
        """Apply final encoding settings (codec, CRF, preset, faststart)."""
        crf = settings.get("crf", 20)
        preset = settings.get("preset", "medium")
        video_bitrate = settings.get("video_bitrate")
        audio_bitrate = settings.get("audio_bitrate", 128)
        codec = settings.get("codec", "h264")
        two_pass = settings.get("two_pass", False)

        codec_map = {
            "h264": "libx264",
            "h265": "libx265",
            "hevc": "libx265",
            "vp9": "libvpx-vp9",
            "av1": "libaom-av1",
        }
        vcodec = codec_map.get(codec, "libx264")

        if two_pass and vcodec in ("libx264", "libx265"):
            # Two-pass encoding
            pass1_path = output_path + ".pass1.mp4"
            self._run_ffmpeg([
                "-i", input_path,
                "-c:v", vcodec,
                "-b:v", f"{video_bitrate or 4000}k" if video_bitrate else "-crf" + str(crf),
                "-preset", preset,
                "-pix_fmt", "yuv420p",
                "-pass", "1",
                "-an",
                "-f", "mp4",
                "-y",
                "/dev/null",
            ])
            self._run_ffmpeg([
                "-i", input_path,
                "-c:v", vcodec,
                "-b:v", f"{video_bitrate or 4000}k" if video_bitrate else "-crf" + str(crf),
                "-preset", preset,
                "-pix_fmt", "yuv420p",
                "-pass", "2",
                "-c:a", "aac", "-b:a", f"{audio_bitrate}k",
                "-movflags", "+faststart",
                output_path,
            ])
            # Clean up pass log files
            for ext in ["-0.log", "-0.log.mbtree"]:
                log_path = f"ffmpeg2pass{ext}"
                if os.path.exists(log_path):
                    os.unlink(log_path)
        else:
            args = ["-i", input_path]

            if video_bitrate:
                args.extend(["-c:v", vcodec, "-b:v", f"{video_bitrate}k"])
            else:
                args.extend(["-c:v", vcodec, "-crf", str(crf)])

            args.extend([
                "-preset", preset,
                "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", f"{audio_bitrate}k",
                "-movflags", "+faststart",
                output_path,
            ])
            self._run_ffmpeg(args)

    # ------------------------------------------------------------------
    # Thumbnail extraction
    # ------------------------------------------------------------------

    def _extract_thumbnail(
        self, video_path: str, out_path: str, duration: float
    ) -> None:
        """Extract a JPEG thumbnail at 10% of the video duration."""
        t = max(duration * 0.1, 0.1)
        self._run_ffmpeg([
            "-ss", str(t),
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "2",
            "-y",
            out_path,
        ])

    # ------------------------------------------------------------------
    # Callback webhook
    # ------------------------------------------------------------------

    def _fire_callback(self, url: str, render_id: str, job: RenderJob) -> None:
        """POST render completion status to a callback URL."""
        payload = {
            "render_id": render_id,
            "status": job.status,
            "progress": job.progress,
            "download_url": job.download_url,
            "error": job.error,
            "width": job.width,
            "height": job.height,
            "duration": job.duration,
            "file_size": job.file_size,
            "metadata": job.metadata,
        }
        try:
            resp = httpx.post(url, json=payload, timeout=10.0)
            logger.info("Callback to %s returned %d", url, resp.status_code)
        except Exception as e:
            logger.warning("Callback to %s failed: %s", url, e)

    # ------------------------------------------------------------------
    # Utility helpers
    # ------------------------------------------------------------------

    def _save_b64_to_file(self, b64_data: str, directory: str, suffix: str) -> str:
        """Decode base64 data (with or without data URI prefix) and save."""
        if b64_data.startswith("data:"):
            b64_data = b64_data.split(",", 1)[1]
        data = base64.b64decode(b64_data)
        path = os.path.join(directory, f"{uuid.uuid4().hex}{suffix}")
        with open(path, "wb") as f:
            f.write(data)
        return path

    def _download_file(self, url: str, directory: str, suffix: str) -> str:
        """Download a file from URL to the given directory."""
        response = httpx.get(url, follow_redirects=True, timeout=30.0)
        response.raise_for_status()
        path = os.path.join(directory, f"{uuid.uuid4().hex}{suffix}")
        with open(path, "wb") as f:
            f.write(response.content)
        return path

    @staticmethod
    def _file_to_b64(path: str) -> Optional[str]:
        """Read a file and return its base64-encoded contents, or None."""
        if not path or not os.path.exists(path):
            return None
        try:
            with open(path, "rb") as f:
                return base64.b64encode(f.read()).decode("utf-8")
        except OSError:
            return None

    @staticmethod
    def _hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
        """Convert hex color to (R, G, B)."""
        h = hex_color.lstrip("#")
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

video_renderer = VideoRenderer()
