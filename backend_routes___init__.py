"""Backend route modules."""

from .auth import router as auth_router
from .video import router as video_router
from .templates import router as templates_router
from .projects import router as projects_router
from .generate import router as generate_router
from .history import router as history_router

__all__ = [
    "auth_router",
    "video_router",
    "templates_router",
    "projects_router",
    "generate_router",
    "history_router",
]
