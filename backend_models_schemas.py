from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# --- Enums ---


class AspectRatio(str, Enum):
    LANDSCAPE = "16:9"
    PORTRAIT = "9:16"
    SQUARE = "1:1"
    INSTAGRAM = "4:5"
    PHOTO = "3:2"


class ImageEffect(str, Enum):
    KEN_BURNS = "ken_burns"
    SMOOTH_ZOOM = "smooth_zoom"
    PAN_LEFT = "pan_left"
    PAN_RIGHT = "pan_right"
    PAN_UP = "pan_up"
    PAN_DOWN = "pan_down"
    ZOOM_IN = "zoom_in"
    ZOOM_OUT = "zoom_out"
    NONE = "none"


class TransitionType(str, Enum):
    FADE = "fade"
    SLIDE_LEFT = "slide_left"
    SLIDE_RIGHT = "slide_right"
    SLIDE_UP = "slide_up"
    SLIDE_DOWN = "slide_down"
    BLUR = "blur"
    CROSSFADE = "crossfade"
    NONE = "none"


class TextAnimation(str, Enum):
    FADE_IN = "fade_in"
    FADE_OUT = "fade_out"
    SLIDE_UP_IN = "slide_up_in"
    SLIDE_DOWN_IN = "slide_down_in"
    TYPEWRITER = "typewriter"
    NONE = "none"


class Resolution(str, Enum):
    HD_720P = "720p"
    FULL_HD_1080P = "1080p"
    UHD_4K = "4K"


class RenderStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# --- Auth Models ---


class UserCreate(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., min_length=6, description="User password (min 6 characters)")
    display_name: str = Field(..., min_length=1, max_length=100, description="Display name")


class UserLogin(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class GoogleAuthRequest(BaseModel):
    id_token: str = Field(..., description="Google ID token")


class UserUpdate(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=100)
    photo_url: Optional[str] = Field(None, max_length=500)


class UserResponse(BaseModel):
    uid: str
    email: str
    display_name: str
    photo_url: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    token: Optional[str] = None

    class Config:
        from_attributes = True


# --- Project Models ---


class ImageConfig(BaseModel):
    id: Optional[str] = None
    url: Optional[str] = None
    base64_data: Optional[str] = None
    name: Optional[str] = None
    duration: float = Field(default=3.0, ge=0.5, le=30.0)
    order: int = Field(default=0, ge=0)
    effect: ImageEffect = ImageEffect.NONE
    transition: TransitionType = TransitionType.CROSSFADE


class TextConfig(BaseModel):
    id: Optional[str] = None
    content: str = Field(..., min_length=1, max_length=500)
    font: str = Field(default="Arial", max_length=100)
    size: int = Field(default=48, ge=8, le=200)
    color: str = Field(default="#FFFFFF", pattern=r"^#[0-9A-Fa-f]{6}$")
    stroke_color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    stroke_width: int = Field(default=0, ge=0, le=10)
    x: float = Field(default=0.5, ge=0.0, le=1.0)
    y: float = Field(default=0.5, ge=0.0, le=1.0)
    start_time: float = Field(default=0.0, ge=0.0)
    end_time: float = Field(default=5.0, ge=0.0)
    animation: TextAnimation = TextAnimation.NONE


class AudioConfig(BaseModel):
    url: Optional[str] = None
    base64_data: Optional[str] = None
    name: Optional[str] = None
    volume: float = Field(default=1.0, ge=0.0, le=2.0)
    fade_in: float = Field(default=0.5, ge=0.0, le=10.0)
    fade_out: float = Field(default=0.5, ge=0.0, le=10.0)
    trim_start: float = Field(default=0.0, ge=0.0)
    trim_end: Optional[float] = None


class ProjectSettings(BaseModel):
    resolution: Resolution = Resolution.HD_720P
    fps: int = Field(default=30, ge=15, le=60)
    quality: str = Field(default="high", pattern=r"^(low|medium|high)$")
    background_color: str = Field(default="#000000", pattern=r"^#[0-9A-Fa-f]{6}$")


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    aspect_ratio: AspectRatio = AspectRatio.LANDSCAPE
    images: List[ImageConfig] = Field(default_factory=list)
    texts: List[TextConfig] = Field(default_factory=list)
    audio: Optional[AudioConfig] = None
    settings: ProjectSettings = Field(default_factory=ProjectSettings)


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    aspect_ratio: Optional[AspectRatio] = None
    images: Optional[List[ImageConfig]] = None
    texts: Optional[List[TextConfig]] = None
    audio: Optional[AudioConfig] = None
    settings: Optional[ProjectSettings] = None


class ProjectResponse(BaseModel):
    id: str
    userId: str
    name: str
    description: Optional[str] = None
    aspectRatio: str
    images: List[Dict[str, Any]] = Field(default_factory=list)
    texts: List[Dict[str, Any]] = Field(default_factory=list)
    audio: Optional[Dict[str, Any]] = None
    settings: Dict[str, Any] = Field(default_factory=dict)
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None

    class Config:
        from_attributes = True


# --- Template Models ---


class TemplateResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    category: str
    thumbnail: Optional[str] = None
    aspectRatio: str
    images: List[Dict[str, Any]] = Field(default_factory=list)
    texts: List[Dict[str, Any]] = Field(default_factory=list)
    audio: Optional[Dict[str, Any]] = None
    settings: Dict[str, Any] = Field(default_factory=dict)
    isPremium: bool = False
    downloadCount: int = 0
    rating: float = Field(default=0.0, ge=0.0, le=5.0)

    class Config:
        from_attributes = True


class TemplateCategory(BaseModel):
    name: str
    slug: str
    count: int = 0
    thumbnail: Optional[str] = None


# --- Render Models ---


class RenderRequest(BaseModel):
    images: List[ImageConfig] = Field(..., min_length=1)
    texts: List[TextConfig] = Field(default_factory=list)
    audio: Optional[AudioConfig] = None
    settings: ProjectSettings = Field(default_factory=ProjectSettings)
    aspect_ratio: AspectRatio = AspectRatio.LANDSCAPE
    effects: Optional[List[str]] = None
    transitions: Optional[List[str]] = None
    duration: Optional[float] = Field(None, ge=1.0, le=300.0)
    resolution: Resolution = Resolution.HD_720P


class RenderResponse(BaseModel):
    render_id: str
    status: RenderStatus = RenderStatus.PENDING
    message: str = "Render job started"


class RenderStatusResponse(BaseModel):
    render_id: str
    status: RenderStatus
    progress: float = Field(default=0.0, ge=0.0, le=100.0)
    download_url: Optional[str] = None
    error: Optional[str] = None
    estimated_time_remaining: Optional[int] = None


# --- Upload Models ---


class ImageUploadResponse(BaseModel):
    url: str
    width: int
    height: int
    format: str
    size: int


class AudioUploadResponse(BaseModel):
    url: str
    duration: float
    format: str
    size: int
    sample_rate: int


# --- Common Models ---


class HealthResponse(BaseModel):
    status: str = "healthy"
    version: str = "1.0.0"
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class MessageResponse(BaseModel):
    message: str
    success: bool = True


class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    limit: int
    has_more: bool
