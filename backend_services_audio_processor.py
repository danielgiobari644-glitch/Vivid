"""Audio processing service using MoviePy."""

import base64
import io
import os
import uuid
import numpy as np
from typing import Dict, Any, Optional


class AudioProcessor:
    """Handles audio processing operations using MoviePy."""

    SUPPORTED_FORMATS = {"mp3", "wav", "ogg", "aac", "flac", "m4a"}

    def process_audio(self, file_data: bytes, filename: str = "audio") -> Dict[str, Any]:
        """Process an uploaded audio file and return metadata plus base64 data."""
        try:
            from moviepy.audio.io.AudioFileClip import AudioFileClip
            import tempfile

            suffix = os.path.splitext(filename)[1] or ".mp3"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(file_data)
                tmp_path = tmp.name

            try:
                clip = AudioFileClip(tmp_path)
                duration = clip.duration
                sample_rate = getattr(clip, "fps", 44100) or 44100
                clip.close()
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

            audio_format = suffix.lstrip(".").lower()
            if audio_format == "m4a":
                audio_format = "aac"

            base64_data = base64.b64encode(file_data).decode("utf-8")

            return {
                "duration": duration,
                "format": audio_format,
                "sample_rate": int(sample_rate),
                "base64_data": base64_data,
                "size": len(file_data),
                "filename": filename,
            }
        except Exception as e:
            raise ValueError(f"Failed to process audio: {str(e)}")

    def trim_audio(self, audio_data: str, start: float, end: float) -> str:
        """Trim an audio clip and return base64 encoded result."""
        import tempfile
        from moviepy.audio.io.AudioFileClip import AudioFileClip

        audio_bytes = self._decode_audio(audio_data)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            clip = AudioFileClip(tmp_path)
            trimmed = clip.subclip(start, min(end, clip.duration))
            out_path = f"temp/{uuid.uuid4().hex}.mp3"
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            trimmed.write_audiofile(out_path, codec="libmp3lame", bitrate="192k")
            trimmed.close()
            clip.close()

            with open(out_path, "rb") as f:
                result = base64.b64encode(f.read()).decode("utf-8")

            os.unlink(out_path)
            return result
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    def get_waveform_data(self, audio_data: str, num_samples: int = 200) -> list:
        """Extract waveform amplitude data for visualization."""
        import tempfile
        from moviepy.audio.io.AudioFileClip import AudioFileClip

        audio_bytes = self._decode_audio(audio_data)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            clip = AudioFileClip(tmp_path)
            samples = clip.to_soundarray()
            clip.close()

            if len(samples.shape) > 1:
                samples = np.mean(samples, axis=1)

            chunk_size = max(1, len(samples) // num_samples)
            waveform = []
            for i in range(0, len(samples), chunk_size):
                chunk = samples[i : i + chunk_size]
                amplitude = float(np.max(np.abs(chunk)))
                waveform.append(amplitude)

            max_amp = max(waveform) if waveform else 1.0
            if max_amp > 0:
                waveform = [a / max_amp for a in waveform]

            return waveform
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    def normalize_volume(self, audio_data: str, target_dbfs: float = -14.0) -> str:
        """Normalize audio volume to target dBFS."""
        import tempfile
        from moviepy.audio.io.AudioFileClip import AudioFileClip

        audio_bytes = self._decode_audio(audio_data)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            clip = AudioFileClip(tmp_path)
            current_max = float(np.max(np.abs(clip.to_soundarray())))

            if current_max > 0:
                target_linear = 10 ** (target_dbfs / 20.0)
                current_dbfs = 20 * np.log10(current_max)
                adjustment_db = target_dbfs - current_dbfs
                adjustment_linear = 10 ** (adjustment_db / 20.0)
                normalized = clip.volumex(adjustment_linear)
            else:
                normalized = clip

            out_path = f"temp/{uuid.uuid4().hex}.mp3"
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            normalized.write_audiofile(out_path, codec="libmp3lame", bitrate="192k")
            normalized.close()
            clip.close()

            with open(out_path, "rb") as f:
                result = base64.b64encode(f.read()).decode("utf-8")

            os.unlink(out_path)
            return result
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    def _decode_audio(self, base64_data: str) -> bytes:
        """Decode base64 audio data to bytes."""
        if base64_data.startswith("data:"):
            base64_data = base64_data.split(",", 1)[1]
        return base64.b64decode(base64_data)


audio_processor = AudioProcessor()
