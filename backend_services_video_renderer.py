"""Video rendering service using MoviePy."""

import base64
import os
import uuid
import threading
import time
from typing import Dict, Any, Optional, List, Tuple
from concurrent.futures import ThreadPoolExecutor


class VideoRenderer:
    """Handles video rendering using MoviePy with effects, transitions, and overlays."""

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

    def __init__(self):
        self.render_jobs: Dict[str, Dict[str, Any]] = {}
        self._executor = ThreadPoolExecutor(max_workers=2)
        os.makedirs("temp", exist_ok=True)
        os.makedirs("uploads", exist_ok=True)

    def render(self, project_config: Dict[str, Any]) -> str:
        """Start an async render job and return the render_id."""
        render_id = uuid.uuid4().hex
        self.render_jobs[render_id] = {
            "status": "pending",
            "progress": 0.0,
            "download_url": None,
            "error": None,
            "started_at": time.time(),
        }
        self._executor.submit(self._render_worker, render_id, project_config)
        return render_id

    def get_status(self, render_id: str) -> Dict[str, Any]:
        """Get the status of a render job."""
        if render_id not in self.render_jobs:
            return {"status": "not_found", "progress": 0, "error": "Render job not found"}
        return self.render_jobs[render_id]

    def _render_worker(self, render_id: str, project_config: Dict[str, Any]):
        """Worker that performs the actual rendering."""
        job = self.render_jobs[render_id]
        job["status"] = "processing"
        try:
            from moviepy.editor import (
                ImageClip, TextClip, CompositeVideoClip,
                concatenate_videoclips, AudioFileClip,
                CompositeAudioClip, ColorClip,
            )
            from PIL import Image as PILImage
            import numpy as np

            images = project_config.get("images", [])
            texts = project_config.get("texts", [])
            audio_config = project_config.get("audio")
            settings = project_config.get("settings", {})
            aspect_ratio = project_config.get("aspect_ratio", "16:9")
            resolution_key = settings.get("resolution", "720p") if isinstance(settings, dict) else "720p"

            if not images:
                raise ValueError("At least one image is required for rendering")

            target_w, target_h = self.RESOLUTION_MAP.get(resolution_key, (1280, 720))
            ar = self.ASPECT_RATIO_MAP.get(aspect_ratio, (16, 9))
            ar_w, ar_h = ar
            calc_h = int(target_w * ar_h / ar_w)
            if calc_h <= target_h:
                final_w, final_h = target_w, calc_h
            else:
                final_w = int(target_h * ar_w / ar_h)
                final_h = target_h
            final_w = max(final_w, 100)
            final_h = max(final_h, 100)

            fps = settings.get("fps", 30) if isinstance(settings, dict) else 30
            bg_color = settings.get("background_color", "#000000") if isinstance(settings, dict) else "#000000"
            bg_rgb = self._hex_to_rgb(bg_color)

            job["progress"] = 5.0

            clips = []
            total_images = len(images)
            for i, img_conf in enumerate(images):
                progress_val = 5.0 + (40.0 * (i + 1) / total_images)
                job["progress"] = progress_val

                img_url = img_conf.get("url")
                img_b64 = img_conf.get("base64_data")
                duration = float(img_conf.get("duration", 3.0))
                effect = img_conf.get("effect", "none")

                img_path = None
                try:
                    if img_b64:
                        img_path = self._save_base64_image(img_b64)
                    elif img_url:
                        img_path = self._download_image(img_url)
                    else:
                        continue

                    clip = ImageClip(img_path).set_duration(duration)
                    clip = self._resize_to_cover(clip, final_w, final_h)
                    clip = self._apply_effect(clip, effect, duration)
                    clips.append(clip)
                finally:
                    if img_path and os.path.exists(img_path):
                        try:
                            os.unlink(img_path)
                        except OSError:
                            pass

            if not clips:
                raise ValueError("No valid images to render")

            job["progress"] = 50.0

            transitions_list = project_config.get("transitions", [])
            final_clip = self._join_clips_with_transitions(clips, transitions_list, fps)

            job["progress"] = 65.0

            for text_conf in texts:
                try:
                    final_clip = self._add_text_overlay(final_clip, text_conf, final_w, final_h)
                except Exception:
                    pass

            job["progress"] = 75.0

            if audio_config:
                try:
                    final_clip = self._add_audio(final_clip, audio_config)
                except Exception:
                    pass

            job["progress"] = 85.0

            output_path = f"uploads/{render_id}.mp4"
            final_clip.write_videofile(
                output_path,
                fps=fps,
                codec="libx264",
                audio_codec="aac",
                preset="medium",
                threads=2,
                logger=None,
            )
            final_clip.close()
            for c in clips:
                try:
                    c.close()
                except Exception:
                    pass

            job["progress"] = 100.0
            job["status"] = "completed"
            job["download_url"] = f"/api/video/download/{render_id}"

        except Exception as e:
            job["status"] = "failed"
            job["error"] = str(e)
            job["progress"] = 0.0

    def _save_base64_image(self, base64_data: str) -> str:
        """Save base64 image data to a temp file and return path."""
        if base64_data.startswith("data:"):
            base64_data = base64_data.split(",", 1)[1]
        img_bytes = base64.b64decode(base64_data)
        path = f"temp/{uuid.uuid4().hex}.jpg"
        with open(path, "wb") as f:
            f.write(img_bytes)
        return path

    def _download_image(self, url: str) -> str:
        """Download image from URL and save to temp file."""
        import httpx
        response = httpx.get(url, follow_redirects=True, timeout=30.0)
        response.raise_for_status()
        path = f"temp/{uuid.uuid4().hex}.jpg"
        with open(path, "wb") as f:
            f.write(response.content)
        return path

    def _resize_to_cover(self, clip, target_w: int, target_h: int):
        """Resize image to cover the target dimensions (like CSS object-fit: cover)."""
        from PIL import Image as PILImage
        import numpy as np

        img = clip.get_frame(0)
        h, w = img.shape[:2]
        scale_w = target_w / w
        scale_h = target_h / h
        scale = max(scale_w, scale_h)
        new_w = int(w * scale)
        new_h = int(h * scale)
        if new_w < 1:
            new_w = 1
        if new_h < 1:
            new_h = 1

        resized = clip.resize((new_w, new_h))
        crop_x = (new_w - target_w) // 2
        crop_y = (new_h - target_h) // 2
        if crop_x < 0:
            crop_x = 0
        if crop_y < 0:
            crop_y = 0
        cropped = resized.crop(x1=crop_x, y1=crop_y, x2=crop_x + target_w, y2=crop_y + target_h)
        resized.close()
        return cropped

    def _apply_effect(self, clip, effect: str, duration: float):
        """Apply a visual effect to a clip."""
        if effect == "none" or not effect:
            return clip

        if effect == "ken_burns":
            return self._apply_ken_burns(clip, zoom_start=1.0, zoom_end=1.3, pan_direction="right")
        elif effect == "smooth_zoom":
            return self._apply_ken_burns(clip, zoom_start=1.0, zoom_end=1.2, pan_direction="center")
        elif effect == "pan_left":
            return self._apply_ken_burns(clip, zoom_start=1.2, zoom_end=1.2, pan_direction="left")
        elif effect == "pan_right":
            return self._apply_ken_burns(clip, zoom_start=1.2, zoom_end=1.2, pan_direction="right")
        elif effect == "pan_up":
            return self._apply_ken_burns(clip, zoom_start=1.2, zoom_end=1.2, pan_direction="up")
        elif effect == "pan_down":
            return self._apply_ken_burns(clip, zoom_start=1.2, zoom_end=1.2, pan_direction="down")
        elif effect == "zoom_in":
            return self._apply_ken_burns(clip, zoom_start=1.0, zoom_end=1.4, pan_direction="center")
        elif effect == "zoom_out":
            return self._apply_ken_burns(clip, zoom_start=1.4, zoom_end=1.0, pan_direction="center")
        return clip

    def _apply_ken_burns(self, clip, zoom_start: float = 1.0, zoom_end: float = 1.3, pan_direction: str = "right"):
        """Apply Ken Burns effect (slow zoom + pan) to a clip."""
        import numpy as np

        w, h = clip.size
        duration = clip.duration
        if duration == 0:
            return clip

        def make_frame(t):
            progress = t / duration
            zoom = zoom_start + (zoom_end - zoom_start) * progress

            new_w = int(w * zoom)
            new_h = int(h * zoom)
            if new_w < 1:
                new_w = 1
            if new_h < 1:
                new_h = 1

            frame = clip.get_frame(t)
            from PIL import Image as PILImage
            pil_img = PILImage.fromarray(frame)
            resized = pil_img.resize((new_w, new_h), PILImage.Resampling.LANCZOS)
            arr = np.array(resized)

            if pan_direction == "left":
                max_offset_x = new_w - w
                if max_offset_x > 0:
                    x_offset = int(max_offset_x * (1 - progress))
                    x_offset = max(0, min(x_offset, max_offset_x))
                else:
                    x_offset = 0
                y_offset = (new_h - h) // 2
            elif pan_direction == "right":
                max_offset_x = new_w - w
                if max_offset_x > 0:
                    x_offset = int(max_offset_x * progress)
                    x_offset = max(0, min(x_offset, max_offset_x))
                else:
                    x_offset = 0
                y_offset = (new_h - h) // 2
            elif pan_direction == "up":
                x_offset = (new_w - w) // 2
                max_offset_y = new_h - h
                if max_offset_y > 0:
                    y_offset = int(max_offset_y * (1 - progress))
                    y_offset = max(0, min(y_offset, max_offset_y))
                else:
                    y_offset = 0
            elif pan_direction == "down":
                x_offset = (new_w - w) // 2
                max_offset_y = new_h - h
                if max_offset_y > 0:
                    y_offset = int(max_offset_y * progress)
                    y_offset = max(0, min(y_offset, max_offset_y))
                else:
                    y_offset = 0
            else:
                x_offset = (new_w - w) // 2
                y_offset = (new_h - h) // 2

            x_offset = max(0, min(x_offset, max(0, new_w - w)))
            y_offset = max(0, min(y_offset, max(0, new_h - h)))

            result = arr[y_offset:y_offset + h, x_offset:x_offset + w]
            return result

        from moviepy.editor import VideoClip
        new_clip = VideoClip(make_frame, duration=duration)
        new_clip = new_clip.set_fps(clip.fps or 24)
        clip.close()
        return new_clip

    def _join_clips_with_transitions(self, clips, transitions_list, fps: int):
        """Join clips with transitions between them."""
        from moviepy.editor import CompositeVideoClip, concatenate_videoclips, ColorClip
        import numpy as np

        if len(clips) == 1:
            return clips[0]

        transition_duration = 0.5

        if not transitions_list:
            return concatenate_videoclips(clips, method="compose")

        result_clips = []
        for i, clip in enumerate(clips):
            if i == 0:
                result_clips.append(clip)
                continue

            prev_clip = result_clips[-1]
            transition_type = transitions_list[i - 1] if i - 1 < len(transitions_list) else "crossfade"

            if transition_type == "none":
                result_clips.append(clip)
            elif transition_type in ("fade", "crossfade"):
                fade_clip = clip.crossfadein(transition_duration)
                prev_clip = prev_clip.set_duration(prev_clip.duration)
                overlap_start = prev_clip.duration - transition_duration
                fade_clip = fade_clip.set_start(overlap_start)
                result_clips[-1] = CompositeVideoClip([prev_clip, fade_clip])
            elif transition_type.startswith("slide_"):
                direction = transition_type.replace("slide_", "")
                result_clips.append(clip)
            elif transition_type == "blur":
                result_clips.append(clip)
            else:
                result_clips.append(clip)

        if len(result_clips) == 1:
            return result_clips[0]
        return concatenate_videoclips(result_clips, method="compose")

    def _add_text_overlay(self, clip, text_config: dict, video_w: int, video_h: int):
        """Add a text overlay to the clip."""
        from moviepy.editor import TextClip, CompositeVideoClip

        content = text_config.get("content", "")
        if not content.strip():
            return clip

        font = text_config.get("font", "Arial")
        font_size = int(text_config.get("size", 48))
        color = text_config.get("color", "#FFFFFF")
        x_ratio = float(text_config.get("x", 0.5))
        y_ratio = float(text_config.get("y", 0.5))
        start_time = float(text_config.get("start_time", 0.0))
        end_time = float(text_config.get("end_time", clip.duration))
        animation = text_config.get("animation", "none")
        stroke_color = text_config.get("stroke_color")
        stroke_width = int(text_config.get("stroke_width", 0))

        text_clip_kwargs = {
            "text": content,
            "fontsize": font_size,
            "color": color,
            "font": font,
            "method": "caption",
        }
        if stroke_color and stroke_width > 0:
            text_clip_kwargs["stroke_color"] = stroke_color
            text_clip_kwargs["stroke_width"] = stroke_width

        try:
            txt_clip = TextClip(**text_clip_kwargs)
        except Exception:
            text_clip_kwargs["font"] = "DejaVu-Sans"
            try:
                txt_clip = TextClip(**text_clip_kwargs)
            except Exception:
                text_clip_kwargs.pop("font", None)
                txt_clip = TextClip(**text_clip_kwargs)

        txt_w, txt_h = txt_clip.size
        x_pos = int(x_ratio * video_w - txt_w / 2)
        y_pos = int(y_ratio * video_h - txt_h / 2)
        x_pos = max(0, min(x_pos, video_w - txt_w))
        y_pos = max(0, min(y_pos, video_h - txt_h))

        effective_duration = min(end_time, clip.duration) - start_time
        if effective_duration <= 0:
            return clip

        txt_clip = (txt_clip
                     .set_position((x_pos, y_pos))
                     .set_start(start_time)
                     .set_duration(effective_duration))

        if animation == "fade_in":
            txt_clip = txt_clip.crossfadein(0.5)
        elif animation == "fade_out":
            txt_clip = txt_clip.crossfadeout(0.5)
        elif animation == "slide_up_in":
            txt_clip = txt_clip.set_position(lambda t: (x_pos, y_pos + (100 * (1 - min(t / 0.5, 1.0)))))
        elif animation == "slide_down_in":
            txt_clip = txt_clip.set_position(lambda t: (x_pos, y_pos - (100 * (1 - min(t / 0.5, 1.0)))))

        return CompositeVideoClip([clip, txt_clip])

    def _add_audio(self, clip, audio_config: dict):
        """Add audio to the clip with volume and fade settings."""
        from moviepy.editor import AudioFileClip, CompositeAudioClip
        import tempfile

        audio_url = audio_config.get("url")
        audio_b64 = audio_config.get("base64_data")
        volume = float(audio_config.get("volume", 1.0))
        fade_in = float(audio_config.get("fade_in", 0.5))
        fade_out = float(audio_config.get("fade_out", 0.5))
        trim_start = float(audio_config.get("trim_start", 0.0))
        trim_end = audio_config.get("trim_end")

        audio_path = None
        try:
            if audio_b64:
                if audio_b64.startswith("data:"):
                    audio_b64 = audio_b64.split(",", 1)[1]
                audio_bytes = base64.b64decode(audio_b64)
                audio_path = f"temp/{uuid.uuid4().hex}.mp3"
                with open(audio_path, "wb") as f:
                    f.write(audio_bytes)
            elif audio_url:
                import httpx
                response = httpx.get(audio_url, follow_redirects=True, timeout=30.0)
                response.raise_for_status()
                audio_path = f"temp/{uuid.uuid4().hex}.mp3"
                with open(audio_path, "wb") as f:
                    f.write(response.content)
            else:
                return clip

            audio_clip = AudioFileClip(audio_path)

            if trim_start > 0:
                audio_clip = audio_clip.subclip(trim_start)
            if trim_end is not None:
                audio_clip = audio_clip.subclip(0, min(trim_end, audio_clip.duration))

            if audio_clip.duration > clip.duration:
                audio_clip = audio_clip.subclip(0, clip.duration)

            audio_clip = audio_clip.volumex(volume)

            if fade_in > 0:
                audio_clip = audio_clip.audio_fadein(fade_in)
            if fade_out > 0:
                audio_clip = audio_clip.audio_fadeout(fade_out)

            result = clip.set_audio(audio_clip)
            return result

        finally:
            if audio_path and os.path.exists(audio_path):
                try:
                    os.unlink(audio_path)
                except OSError:
                    pass

    def _hex_to_rgb(self, hex_color: str) -> Tuple[int, int, int]:
        """Convert hex color string to RGB tuple."""
        hex_color = hex_color.lstrip("#")
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

    def _generate_preview_frames(self, clip, num_frames: int = 4) -> List[str]:
        """Generate preview frames as base64 encoded JPEG images."""
        frames = []
        duration = clip.duration
        for i in range(num_frames):
            t = duration * i / num_frames
            frame = clip.get_frame(t)
            from PIL import Image as PILImage
            import io
            pil_img = PILImage.fromarray(frame)
            buffer = io.BytesIO()
            pil_img.save(buffer, format="JPEG", quality=80)
            frames.append(base64.b64encode(buffer.getvalue()).decode("utf-8"))
        return frames


video_renderer = VideoRenderer()