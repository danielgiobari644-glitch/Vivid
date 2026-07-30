"""Centralized file storage and lifecycle management service.

Manages in-memory file caches, temporary files, upload persistence,
and automatic cleanup of stale resources. Replaces the scattered
cache/file handling that was previously spread across routes and processors.
"""

import os
import time
import uuid
import hashlib
import threading
import logging
from typing import Dict, Any, Optional, Tuple, BinaryIO
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class CachedFile:
    """Represents a single cached file entry."""
    file_id: str
    data: bytes
    filename: str
    mime_type: str
    size: int
    created_at: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)
    access_count: int = 0
    last_accessed: float = field(default_factory=time.time)

    def touch(self) -> None:
        """Update last accessed timestamp and increment access count."""
        self.last_accessed = time.time()
        self.access_count += 1

    def is_stale(self, max_age_seconds: float) -> bool:
        """Check if this entry has exceeded the maximum age."""
        return (time.time() - self.created_at) > max_age_seconds

    @property
    def size_mb(self) -> float:
        return round(self.size / (1024 * 1024), 3)


@dataclass
class TempFileRecord:
    """Tracks a temporary file on disk for cleanup."""
    path: str
    created_at: float = field(default_factory=time.time)
    auto_delete: bool = True
    max_age_seconds: float = 3600.0  # 1 hour default

    def is_expired(self) -> bool:
        return (time.time() - self.created_at) > self.max_age_seconds


class StorageService:
    """Centralized storage manager for in-memory caches and temporary files.

    Provides:
    - In-memory file caching with configurable TTL and max capacity
    - Temp file lifecycle tracking and automatic cleanup
    - Upload file management with size/format validation
    - Storage usage statistics and manual cleanup controls
    """

    # Default configuration
    DEFAULT_CACHE_TTL = 7200          # 2 hours
    DEFAULT_MAX_CACHE_SIZE_MB = 500   # 500 MB total cache limit
    DEFAULT_MAX_FILES = 2000          # Maximum cached files
    DEFAULT_TEMP_MAX_AGE = 3600       # 1 hour for temp files
    CLEANUP_INTERVAL = 300            # Run cleanup every 5 minutes

    # Allowed MIME types
    IMAGE_MIME_TYPES = {
        "image/jpeg", "image/png", "image/webp", "image/gif",
        "image/bmp", "image/tiff",
    }
    AUDIO_MIME_TYPES = {
        "audio/mpeg", "audio/wav", "audio/ogg", "audio/aac",
        "audio/flac", "audio/mp4", "audio/x-m4a",
    }
    VIDEO_MIME_TYPES = {
        "video/mp4", "video/webm", "video/quicktime",
    }

    def __init__(
        self,
        cache_ttl: int = DEFAULT_CACHE_TTL,
        max_cache_size_mb: int = DEFAULT_MAX_CACHE_SIZE_MB,
        max_files: int = DEFAULT_MAX_FILES,
        temp_max_age: int = DEFAULT_TEMP_MAX_AGE,
        upload_dir: str = "uploads",
        temp_dir: str = "temp",
    ):
        self._cache: Dict[str, CachedFile] = {}
        self._temp_files: Dict[str, TempFileRecord] = {}
        self._lock = threading.RLock()

        self.cache_ttl = cache_ttl
        self.max_cache_size_bytes = max_cache_size_mb * 1024 * 1024
        self.max_files = max_files
        self.temp_max_age = temp_max_age
        self.upload_dir = upload_dir
        self.temp_dir = temp_dir

        self._cleanup_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

        # Ensure directories exist
        os.makedirs(self.upload_dir, exist_ok=True)
        os.makedirs(self.temp_dir, exist_ok=True)

        # Start background cleanup
        self._start_cleanup_thread()

    # ------------------------------------------------------------------
    # Cache Operations
    # ------------------------------------------------------------------

    def store(
        self,
        data: bytes,
        filename: str = "file",
        mime_type: str = "application/octet-stream",
        file_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Store a file in the in-memory cache and return its ID.

        Args:
            data: Raw file bytes to cache.
            filename: Original filename for reference.
            mime_type: MIME type of the file.
            file_id: Optional explicit ID; one is generated if not provided.
            metadata: Optional dict of extra metadata to attach.

        Returns:
            The file_id that can be used to retrieve the file later.

        Raises:
            ValueError: If the cache is full or the file exceeds limits.
        """
        with self._lock:
            self._evict_if_needed(len(data))

            if file_id is None:
                file_id = uuid.uuid4().hex

            entry = CachedFile(
                file_id=file_id,
                data=data,
                filename=filename,
                mime_type=mime_type,
                size=len(data),
                metadata=metadata or {},
            )
            self._cache[file_id] = entry
            logger.debug("Cached file %s (%s, %s)", file_id, filename, entry.size_mb)
            return file_id

    def retrieve(self, file_id: str) -> Optional[CachedFile]:
        """Retrieve a cached file by ID. Returns None if not found or expired."""
        with self._lock:
            entry = self._cache.get(file_id)
            if entry is None:
                return None
            if entry.is_stale(self.cache_ttl):
                del self._cache[file_id]
                logger.debug("Evicted stale cache entry %s", file_id)
                return None
            entry.touch()
            return entry

    def retrieve_data(self, file_id: str) -> Optional[bytes]:
        """Convenience: retrieve raw bytes for a cached file ID."""
        entry = self.retrieve(file_id)
        return entry.data if entry else None

    def delete(self, file_id: str) -> bool:
        """Remove a file from cache. Returns True if it existed."""
        with self._lock:
            entry = self._cache.pop(file_id, None)
            if entry:
                logger.debug("Deleted cache entry %s (%s)", file_id, entry.filename)
                return True
            return False

    def exists(self, file_id: str) -> bool:
        """Check whether a file ID exists in cache."""
        with self._lock:
            entry = self._cache.get(file_id)
            if entry is None:
                return False
            if entry.is_stale(self.cache_ttl):
                del self._cache[file_id]
                return False
            return True

    def get_metadata(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Get metadata for a cached file without retrieving the full data."""
        entry = self.retrieve(file_id)
        if entry is None:
            return None
        return {
            "file_id": entry.file_id,
            "filename": entry.filename,
            "mime_type": entry.mime_type,
            "size": entry.size,
            "size_mb": entry.size_mb,
            "created_at": entry.created_at,
            "last_accessed": entry.last_accessed,
            "access_count": entry.access_count,
            **entry.metadata,
        }

    # ------------------------------------------------------------------
    # Temp File Operations
    # ------------------------------------------------------------------

    def create_temp_file(
        self,
        data: bytes,
        suffix: str = ".tmp",
        max_age: float = DEFAULT_TEMP_MAX_AGE,
    ) -> str:
        """Write data to a temp file, track it for cleanup, and return the path."""
        path = os.path.join(self.temp_dir, f"{uuid.uuid4().hex}{suffix}")
        with open(path, "wb") as f:
            f.write(data)

        with self._lock:
            self._temp_files[path] = TempFileRecord(
                path=path,
                max_age_seconds=max_age,
            )
        logger.debug("Created temp file: %s (%d bytes)", path, len(data))
        return path

    def register_temp_file(
        self,
        path: str,
        max_age: float = DEFAULT_TEMP_MAX_AGE,
        auto_delete: bool = True,
    ) -> None:
        """Register an externally-created temp file for automatic cleanup."""
        with self._lock:
            self._temp_files[path] = TempFileRecord(
                path=path,
                auto_delete=auto_delete,
                max_age_seconds=max_age,
            )

    def release_temp_file(self, path: str, delete_now: bool = False) -> bool:
        """Remove a temp file from tracking and optionally delete it from disk."""
        with self._lock:
            record = self._temp_files.pop(path, None)

        if record and delete_now:
            self._safe_delete(path)
            return True
        return record is not None

    def cleanup_temp_files(self) -> int:
        """Delete all expired temp files. Returns the number of files removed."""
        removed = 0
        with self._lock:
            expired = [
                path for path, rec in self._temp_files.items()
                if rec.is_expired()
            ]
            for path in expired:
                del self._temp_files[path]

        for path in expired:
            if self._safe_delete(path):
                removed += 1

        if removed:
            logger.info("Cleaned up %d expired temp file(s)", removed)
        return removed

    # ------------------------------------------------------------------
    # Upload File Operations
    # ------------------------------------------------------------------

    def save_upload(
        self,
        data: bytes,
        filename: str,
        subfolder: str = "",
    ) -> Tuple[str, str]:
        """Persist an uploaded file to the upload directory.

        Returns:
            Tuple of (file_path, public_url_path).
        """
        ext = os.path.splitext(filename)[1] or ".bin"
        file_id = uuid.uuid4().hex
        relative_dir = os.path.join(self.upload_dir, subfolder) if subfolder else self.upload_dir
        os.makedirs(relative_dir, exist_ok=True)

        file_path = os.path.join(relative_dir, f"{file_id}{ext}")
        with open(file_path, "wb") as f:
            f.write(data)

        url_path = f"/{self.upload_dir}"
        if subfolder:
            url_path = f"{url_path}/{subfolder}"
        url_path = f"{url_path}/{file_id}{ext}"

        logger.info("Saved upload: %s (%d bytes)", file_path, len(data))
        return file_path, url_path

    def delete_upload(self, file_path: str) -> bool:
        """Delete an uploaded file from disk."""
        # Safety: only allow deletion within the upload directory
        abs_path = os.path.abspath(file_path)
        abs_upload = os.path.abspath(self.upload_dir)
        if not abs_path.startswith(abs_upload):
            logger.warning("Attempted to delete file outside upload dir: %s", file_path)
            return False
        return self._safe_delete(abs_path)

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    @staticmethod
    def validate_image(file_data: bytes, max_size: int = 50 * 1024 * 1024) -> Tuple[bool, str]:
        """Validate an image file. Returns (is_valid, error_message)."""
        if len(file_data) > max_size:
            return False, f"Image exceeds maximum size of {max_size // (1024*1024)}MB"
        if len(file_data) < 10:
            return False, "File is too small to be a valid image"
        return True, ""

    @staticmethod
    def validate_audio(file_data: bytes, max_size: int = 50 * 1024 * 1024) -> Tuple[bool, str]:
        """Validate an audio file. Returns (is_valid, error_message)."""
        if len(file_data) > max_size:
            return False, f"Audio exceeds maximum size of {max_size // (1024*1024)}MB"
        if len(file_data) < 10:
            return False, "File is too small to be a valid audio file"
        return True, ""

    @staticmethod
    def guess_mime_type(filename: str, fallback: str = "application/octet-stream") -> str:
        """Simple MIME type guesser from file extension."""
        ext = os.path.splitext(filename)[1].lower()
        mime_map = {
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".png": "image/png", ".webp": "image/webp",
            ".gif": "image/gif", ".bmp": "image/bmp",
            ".tiff": "image/tiff", ".tif": "image/tiff",
            ".mp3": "audio/mpeg", ".wav": "audio/wav",
            ".ogg": "audio/ogg", ".flac": "audio/flac",
            ".aac": "audio/aac", ".m4a": "audio/mp4",
            ".mp4": "video/mp4", ".webm": "video/webm",
            ".mov": "video/quicktime",
        }
        return mime_map.get(ext, fallback)

    # ------------------------------------------------------------------
    # Statistics & Cleanup
    # ------------------------------------------------------------------

    def get_stats(self) -> Dict[str, Any]:
        """Return storage usage statistics."""
        with self._lock:
            total_cache_bytes = sum(e.size for e in self._cache.values())
            active_temp = sum(1 for r in self._temp_files.values() if not r.is_expired())

        return {
            "cache": {
                "file_count": len(self._cache),
                "total_bytes": total_cache_bytes,
                "total_mb": round(total_cache_bytes / (1024 * 1024), 2),
                "max_mb": round(self.max_cache_size_bytes / (1024 * 1024), 2),
                "utilization_pct": round(
                    (total_cache_bytes / self.max_cache_size_bytes) * 100, 1
                ) if self.max_cache_size_bytes > 0 else 0,
                "max_files": self.max_files,
                "ttl_seconds": self.cache_ttl,
            },
            "temp_files": {
                "tracked_count": len(self._temp_files),
                "active_count": active_temp,
                "temp_dir": self.temp_dir,
            },
            "uploads": {
                "upload_dir": self.upload_dir,
            },
        }

    def clear_cache(self) -> int:
        """Clear all cached files. Returns the number of entries removed."""
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
        logger.info("Cleared %d cache entries", count)
        return count

    def clear_all_temp(self) -> int:
        """Delete all tracked temp files. Returns the number removed."""
        with self._lock:
            paths = list(self._temp_files.keys())
            self._temp_files.clear()

        removed = 0
        for path in paths:
            if self._safe_delete(path):
                removed += 1
        logger.info("Cleared %d temp files", removed)
        return removed

    def cleanup_cache(self) -> int:
        """Remove expired cache entries. Returns the number evicted."""
        evicted = 0
        with self._lock:
            stale_ids = [
                fid for fid, entry in self._cache.items()
                if entry.is_stale(self.cache_ttl)
            ]
            for fid in stale_ids:
                del self._cache[fid]
                evicted += 1
        if evicted:
            logger.info("Evicted %d stale cache entries", evicted)
        return evicted

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def shutdown(self) -> None:
        """Stop background cleanup and release resources."""
        self._stop_event.set()
        if self._cleanup_thread and self._cleanup_thread.is_alive():
            self._cleanup_thread.join(timeout=5)
        # Final cleanup pass
        self.cleanup_temp_files()
        logger.info("Storage service shut down")

    # ------------------------------------------------------------------
    # Internal Helpers
    # ------------------------------------------------------------------

    def _evict_if_needed(self, incoming_bytes: int) -> None:
        """Evict stale or least-recently-used entries if the cache would overflow."""
        total = sum(e.size for e in self._cache.values()) + incoming_bytes

        # First pass: evict stale entries
        if total > self.max_cache_size_bytes or len(self._cache) >= self.max_files:
            self.cleanup_cache()
            total = sum(e.size for e in self._cache.values()) + incoming_bytes

        # Second pass: LRU eviction until we fit
        if total > self.max_cache_size_bytes or len(self._cache) >= self.max_files:
            sorted_entries = sorted(
                self._cache.values(), key=lambda e: e.last_accessed
            )
            while (
                (total > self.max_cache_size_bytes or len(self._cache) >= self.max_files)
                and sorted_entries
            ):
                victim = sorted_entries.pop(0)
                self._cache.pop(victim.file_id, None)
                total -= victim.size
                logger.debug(
                    "LRU evicted cache entry %s (freed %s)",
                    victim.file_id, victim.size_mb,
                )

    def _start_cleanup_thread(self) -> None:
        """Start the background cleanup daemon thread."""
        def _cleanup_loop():
            while not self._stop_event.wait(self.CLEANUP_INTERVAL):
                try:
                    self.cleanup_cache()
                    self.cleanup_temp_files()
                except Exception:
                    logger.exception("Error in storage cleanup loop")

        self._cleanup_thread = threading.Thread(
            target=_cleanup_loop, daemon=True, name="storage-cleanup"
        )
        self._cleanup_thread.start()
        logger.debug("Storage cleanup thread started")

    @staticmethod
    def _safe_delete(path: str) -> bool:
        """Delete a file from disk, ignoring errors."""
        try:
            if os.path.exists(path):
                os.unlink(path)
                return True
        except OSError as exc:
            logger.warning("Failed to delete %s: %s", path, exc)
        return False


# Module-level singleton
storage_service = StorageService()
