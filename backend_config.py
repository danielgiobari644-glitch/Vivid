from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    # Firebase Configuration
    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_PRIVATE_KEY: str = ""
    FIREBASE_CLIENT_EMAIL: str = ""
    FIREBASE_WEB_API_KEY: str = ""

    # Application Configuration
    BACKEND_URL: str = "http://localhost:8000"
    CORS_ORIGINS: str = "*"
    ENVIRONMENT: str = "development"

    # Rendering Configuration
    DEFAULT_FPS: int = 30
    MAX_RENDER_DURATION: int = 300
    MAX_FILE_SIZE: int = 50 * 1024 * 1024
    RENDER_QUALITY: str = "high"

    # Upload Configuration
    UPLOAD_DIR: str = "uploads"
    TEMP_DIR: str = "temp"
    MAX_IMAGES_PER_PROJECT: int = 50
    MAX_TEXT_OVERLAYS: int = 20

    # Template Categories
    TEMPLATE_CATEGORIES: List[str] = [
        "YouTube Shorts",
        "TikTok",
        "Instagram Reels",
        "Facebook Videos",
        "Church Announcements",
        "Event Promotions",
        "Bible Verse Videos",
        "Testimony Videos",
        "Quote Videos",
        "Worship Backgrounds",
    ]

    # Supported Aspect Ratios
    SUPPORTED_ASPECT_RATIOS: List[str] = ["16:9", "9:16", "1:1", "4:5", "3:2"]

    # Supported Resolutions
    RESOLUTION_MAP: dict = {
        "720p": (1280, 720),
        "1080p": (1920, 1080),
        "4K": (3840, 2160),
    }

    @property
    def cors_origins_list(self) -> List[str]:
        if self.CORS_ORIGINS == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


settings = Settings()
