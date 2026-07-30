"""Video processing service using MoviePy."""

import base64
import io
import os
import uuid
import time
from typing import Dict, Any, Optional, List, Tuple


class VideoProcessor:
    """Handles processing of uploaded video files using MoviePy.

    Provides operations such as metadata extraction, trimming, frame
    extraction, audio extraction, format conversion, and thumbnail generation.
    """

    SUPPORTED_FORMATS = {"mp4", "avi", "mov", "mkv", "webm", "flv", "wmv", "m4v", "mpeg", "mpg"}

    THUMBNAIL_SIZE = (320, 180)

    RESOLUTION_PRESETS = {
        "720p": (1280, 720),
        "1080p": (1920, 1080),
        "4K": (3840, 2160),
        "480p": (854, 480),
        "360p": (640, 360),
    }

    def __init__(self):
        os.makedirs("temp", exist_ok=True)
        os.makedirs("uploads", exist_ok=True)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_upload(self, file_data: bytes, filename: str = "video.mp4") -> Dict[str, Any]:
        """Process an uploaded video file and return metadata + base64 thumbnail.

        Returns a dict with keys: duration, width, height, fps, format, size,
        filename, thumbnail (base64 JPEG), frame_count.
        """
        suffix = os.path.splitext(filename)[1] or ".mp4"
        fmt = suffix.lstrip(".").lower()
        if fmt not in self.SUPPORTED_FORMATS:
            raise ValueError(
                f"Unsupported video format '.{fmt}'. "
                f"Supported: {', '.join(sorted(self.SUPPORTED_FORMATS))}"
            )

        tmp_path = self._write_temp(file_data, suffix)
        try:
            from moviepy.editor import VideoFileClip

            with VideoFileClip(tmp_path) as clip:
                duration = clip.duration
                w, h = clip.size
                fps = clip.fps or 24.0
                frame_count = int(duration * fps)

                thumbnail_b64 = self._extract_thumbnail(clip)

            return {
                "duration": duration,
                "width": w,
                "height": h,
                "fps": fps,
                "format": fmt,
                "size": len(file_data),
                "filename": filename,
                "frame_count": frame_count,
                "thumbnail": thumbnail_b64,
            }
        except Exception as e:
            raise ValueError(f"Failed to process video: {e}")
        finally:
            self._safe_unlink(tmp_path)

    def get_metadata(self, file_data: bytes, filename: str = "video.mp4") -> Dict[str, Any]:
        """Extract metadata from a video without generating a thumbnail."""
        suffix = os.path.splitext(filename)[1] or ".mp4"
        tmp_path = self._write_temp(file_data, suffix)
        try:
            from moviepy.editor import VideoFileClip

            with VideoFileClip(tmp_path) as clip:
                return {
                    "duration": clip.duration,
                    "width": clip.size[0],
                    "height": clip.size[1],
                    "fps": clip.fps or 24.0,
                    "frame_count": int(clip.duration * (clip.fps or 24.0)),
                    "has_audio": clip.audio is not None,
                    "size": len(file_data),
                    "filename": filename,
                }
        except Exception as e:
            raise ValueError(f"Failed to read video metadata: {e}")
        finally:
            self._safe_unlink(tmp_path)

    def trim_video(
        self,
        file_data: bytes,
        filename: str,
        start: float,
        end: Optional[float] = None,
    ) -> str:
        """Trim a video and return the result as a base64-encoded string.

        Parameters
        ----------
        file_data : bytes
            Raw video file bytes.
        filename : str
            Original filename (used to determine extension).
        start : float
            Start time in seconds.
        end : float or None
            End time in seconds. If *None*, trims from *start* to the end.

        Returns
        -------
        str
            Base64-encoded trimmed video.
        """
        suffix = os.path.splitext(filename)[1] or ".mp4"
        tmp_path = self._write_temp(file_data, suffix)
        try:
            from moviepy.editor import VideoFileClip

            with VideoFileClip(tmp_path) as clip:
                if end is None:
                    end = clip.duration
                end = min(end, clip.duration)
                if start >= end:
                    raise ValueError("start time must be less than end time")

                trimmed = clip.subclip(start, end)
                out_path = f"temp/{uuid.uuid4().hex}.mp4"
                trimmed.write_videofile(
                    out_path,
                    codec="libx264",
                    audio_codec="aac",
                    preset="medium",
                    threads=2,
                    logger=None,
                )
                trimmed.close()

            with open(out_path, "rb") as f:
                result = base64.b64encode(f.read()).decode("utf-8")

            self._safe_unlink(out_path)
            return result
        finally:
            self._safe_unlink(tmp_path)

    def extract_frames(
        self,
        file_data: bytes,
        filename: str,
        num_frames: int = 4,
        format: str = "JPEG",
        quality: int = 85,
    ) -> List[str]:
        """Extract evenly-spaced preview frames as base64 images.

        Parameters
        ----------
        file_data : bytes
            Raw video file bytes.
        filename : str
            Original filename.
        num_frames : int
            Number of frames to extract (default 4).
        format : str
            Image format — "JPEG" or "PNG".
        quality : int
            JPEG quality 1-100.

        Returns
        -------
        list[str]
            Base64-encoded frame images.
        """
        suffix = os.path.splitext(filename)[1] or ".mp4"
        tmp_path = self._write_temp(file_data, suffix)
        try:
            from moviepy.editor import VideoFileClip
            from PIL import Image as PILImage

            with VideoFileClip(tmp_path) as clip:
                duration = clip.duration
                if duration <= 0:
                    return []

                frames: List[str] = []
                for i in range(num_frames):
                    t = duration * i / num_frames
                    frame_array = clip.get_frame(t)
                    pil_img = PILImage.fromarray(frame_array)
                    buffer = io.BytesIO()
                    save_kwargs: Dict[str, Any] = {"format": format}
                    if format.upper() == "JPEG":
                        save_kwargs["quality"] = quality
                    pil_img.save(buffer, **save_kwargs)
                    frames.append(base64.b64encode(buffer.getvalue()).decode("utf-8"))

            return frames
        except Exception as e:
            raise ValueError(f"Failed to extract frames: {e}")
        finally:
            self._safe_unlink(tmp_path)

    def extract_audio(
        self,
        file_data: bytes,
        filename: str,
        audio_format: str = "mp3",
        bitrate: str = "192k",
    ) -> Dict[str, Any]:
        """Extract the audio track from a video.

        Returns a dict with: duration, format, base64_data, size.
        """
        suffix = os.path.splitext(filename)[1] or ".mp4"
        tmp_path = self._write_temp(file_data, suffix)
        try:
            from moviepy.editor import VideoFileClip

            with VideoFileClip(tmp_path) as clip:
                if clip.audio is None:
                    raise ValueError("This video has no audio track")

                audio_clip = clip.audio
                duration = audio_clip.duration

                ext = audio_format if audio_format.startswith(".") else f".{audio_format}"
                out_path = f"temp/{uuid.uuid4().hex}{ext}"

                codec_map = {
                    "mp3": "libmp3lame",
                    "aac": "aac",
                    "wav": "pcm_s16le",
                    "ogg": "libvorbis",
                    "flac": "flac",
                }
                codec = codec_map.get(audio_format.lower(), "libmp3lame")

                write_kwargs: Dict[str, Any] = {"codec": codec, "bitrate": bitrate, "logger": None}
                if audio_format.lower() in ("wav", "flac"):
                    write_kwargs.pop("bitrate", None)

                audio_clip.write_audiofile(out_path, **write_kwargs)
                audio_clip.close()

            with open(out_path, "rb") as f:
                audio_bytes = f.read()

            self._safe_unlink(out_path)

            return {
                "duration": duration,
                "format": audio_format.lower(),
                "base64_data": base64.b64encode(audio_bytes).decode("utf-8"),
                "size": len(audio_bytes),
            }
        except Exception as e:
            raise ValueError(f"Failed to extract audio: {e}")
        finally:
            self._safe_unlink(tmp_path)

    def convert_video(
        self,
        file_data: bytes,
        filename: str,
        output_format: str = "mp4",
        resolution: Optional[str] = None,
        fps: Optional[float] = None,
        preset: str = "medium",
    ) -> str:
        """Convert a video to a different format / resolution / fps.

        Returns base64-encoded video bytes.
        """
        suffix = os.path.splitext(filename)[1] or ".mp4"
        tmp_path = self._write_temp(file_data, suffix)
        try:
            from moviepy.editor import VideoFileClip

            with VideoFileClip(tmp_path) as clip:
                target_fps = fps if fps is not None else clip.fps or 24.0

                if resolution and resolution in self.RESOLUTION_PRESETS:
                    target_w, target_h = self.RESOLUTION_PRESETS[resolution]
                    clip = clip.resize((target_w, target_h))

                ext = f".{output_format}" if not output_format.startswith(".") else output_format
                out_path = f"temp/{uuid.uuid4().hex}{ext}"

                codec = "libx264"
                audio_codec = "aac"
                if output_format.lower() == "webm":
                    codec = "libvpx-vp9"
                    audio_codec = "libopus"

                clip.write_videofile(
                    out_path,
                    fps=target_fps,
                    codec=codec,
                    audio_codec=audio_codec,
                    preset=preset,
                    threads=2,
                    logger=None,
                )
                clip.close()

            with open(out_path, "rb") as f:
                result = base64.b64encode(f.read()).decode("utf-8")

            self._safe_unlink(out_path)
            return result
        except Exception as e:
            raise ValueError(f"Failed to convert video: {e}")
        finally:
            self._safe_unlink(tmp_path)

    def generate_thumbnail(
        self,
        file_data: bytes,
        filename: str,
        time_offset: Optional[float] = None,
        width: int = 320,
        height: int = 180,
        quality: int = 85,
    ) -> str:
        """Generate a single thumbnail at a specific time.

        If *time_offset* is None, the frame at 10 % of the duration is used.
        Returns a base64-encoded JPEG string.
        """
        suffix = os.path.splitext(filename)[1] or ".mp4"
        tmp_path = self._write_temp(file_data, suffix)
        try:
            from moviepy.editor import VideoFileClip
            from PIL import Image as PILImage

            with VideoFileClip(tmp_path) as clip:
                if time_offset is None:
                    time_offset = clip.duration * 0.1
                time_offset = max(0.0, min(time_offset, clip.duration - 0.01))

                frame_array = clip.get_frame(time_offset)
                pil_img = PILImage.fromarray(frame_array)
                pil_img = pil_img.resize((width, height), PILImage.Resampling.LANCZOS)

                buffer = io.BytesIO()
                pil_img.save(buffer, format="JPEG", quality=quality)
                return base64.b64encode(buffer.getvalue()).decode("utf-8")
        except Exception as e:
            raise ValueError(f"Failed to generate thumbnail: {e}")
        finally:
            self._safe_unlink(tmp_path)

    def get_frame_at_time(
        self,
        file_data: bytes,
        filename: str,
        time_offset: float,
        width: Optional[int] = None,
        height: Optional[int] = None,
    ) -> str:
        """Extract a single full-resolution (or optionally resized) frame.

        Returns a base64-encoded PNG string for lossless quality.
        """
        suffix = os.path.splitext(filename)[1] or ".mp4"
        tmp_path = self._write_temp(file_data, suffix)
        try:
            from moviepy.editor import VideoFileClip
            from PIL import Image as PILImage

            with VideoFileClip(tmp_path) as clip:
                time_offset = max(0.0, min(time_offset, clip.duration - 0.01))
                frame_array = clip.get_frame(time_offset)
                pil_img = PILImage.fromarray(frame_array)

                if width and height:
                    pil_img = pil_img.resize((width, height), PILImage.Resampling.LANCZOS)

                buffer = io.BytesIO()
                pil_img.save(buffer, format="PNG")
                return base64.b64encode(buffer.getvalue()).decode("utf-8")
        except Exception as e:
            raise ValueError(f"Failed to extract frame: {e}")
        finally:
            self._safe_unlink(tmp_path)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _write_temp(self, data: bytes, suffix: str) -> str:
        """Write bytes to a temp file and return its path."""
        import tempfile
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tmp.write(data)
        tmp.close()
        return tmp.name

    def _safe_unlink(self, path: str) -> None:
        """Remove a file, ignoring errors if it doesn't exist."""
        if path and os.path.exists(path):
            try:
                os.unlink(path)
            except OSError:
                pass

    def _extract_thumbnail(self, clip, width: int = 320, height: int = 180) -> str:
        """Extract a JPEG thumbnail from a VideoFileClip at 10 % duration."""
        from PIL import Image as PILImage

        t = clip.duration * 0.1
        frame = clip.get_frame(t)
        pil_img = PILImage.fromarray(frame)
        pil_img = pil_img.resize((width, height), PILImage.Resampling.LANCZOS)
        buffer = io.BytesIO()
        pil_img.save(buffer, format="JPEG", quality=85)
        return base64.b64encode(buffer.getvalue()).decode("utf-8")


video_processor = VideoProcessor()
