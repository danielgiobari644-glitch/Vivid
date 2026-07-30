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


class ImageStyle(str, Enum):
    REALISTIC = "realistic"
    ANIME = "anime"
    DIGITAL_ART = "digital_art"
    OIL_PAINTING = "oil_painting"
    WATERCOLOR = "watercolor"
    SKETCH = "sketch"
    CYBERPUNK = "cyberpunk"
    MINIMALIST = "minimalist"
    CINEMATIC = "cinematic"
    NONE = "none"


class ImageGenerationStatus(str, Enum):
    QUEUED = "queued"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class RenderExportFormat(str, Enum):
    MP4 = "mp4"
    WEBM = "webm"
    MOV = "mov"
    GIF = "gif"
    APNG = "apng"
    WEBP_ANIMATED = "webp_animated"


class RenderPreset(str, Enum):
    TIKTOK = "tiktok"
    INSTAGRAM_REEL = "instagram_reel"
    INSTAGRAM_STORY = "instagram_story"
    YOUTUBE_SHORTS = "youtube_shorts"
    YOUTUBE_THUMBNAIL = "youtube_thumbnail"
    TWITTER_POST = "twitter_post"
    LINKEDIN_POST = "linkedin_post"
    CUSTOM = "custom"


class WatermarkPosition(str, Enum):
    TOP_LEFT = "top_left"
    TOP_RIGHT = "top_right"
    BOTTOM_LEFT = "bottom_left"
    BOTTOM_RIGHT = "bottom_right"
    CENTER = "center"
    BOTTOM_CENTER = "bottom_center"


class VideoCodec(str, Enum):
    H264 = "h264"
    H265 = "h265"
    VP9 = "vp9"
    AV1 = "av1"


class SubtitleFormat(str, Enum):
    SRT = "srt"
    VTT = "vtt"
    ASS = "ass"
    EMBEDDED = "embedded"


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


class VideoUploadResponse(BaseModel):
    url: str
    width: int
    height: int
    format: str
    size: int
    duration: float
    codec: str
    fps: float
    bitrate: Optional[int] = None
    has_audio: bool = False
    thumbnail_url: Optional[str] = None


class VideoConfig(BaseModel):
    id: Optional[str] = None
    url: Optional[str] = None
    base64_data: Optional[str] = None
    name: Optional[str] = None
    trim_start: float = Field(default=0.0, ge=0.0)
    trim_end: Optional[float] = None
    volume: float = Field(default=1.0, ge=0.0, le=2.0)
    order: int = Field(default=0, ge=0)
    speed: float = Field(default=1.0, ge=0.25, le=4.0)
    opacity: float = Field(default=1.0, ge=0.0, le=1.0)


# --- Image Generation Models ---


class ImageGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000, description="Text prompt describing the desired image")
    negative_prompt: Optional[str] = Field(None, max_length=1000, description="What to avoid in the generated image")
    style: ImageStyle = ImageStyle.NONE
    width: int = Field(default=1024, ge=256, le=2048, multiple_of=64, description="Image width in pixels")
    height: int = Field(default=1024, ge=256, le=2048, multiple_of=64, description="Image height in pixels")
    num_variations: int = Field(default=1, ge=1, le=4, description="Number of image variations to generate")
    seed: Optional[int] = Field(None, ge=0, description="Random seed for reproducibility")
    quality: str = Field(default="high", pattern=r"^(draft|standard|high|ultra)$")
    aspect_ratio: Optional[AspectRatio] = None
    reference_image_url: Optional[str] = Field(None, max_length=2000, description="Optional reference image for style transfer")
    reference_image_strength: float = Field(default=0.5, ge=0.0, le=1.0, description="Strength of reference image influence")


class ImageGenerationResponse(BaseModel):
    generation_id: str
    status: ImageGenerationStatus = ImageGenerationStatus.QUEUED
    images: List[Dict[str, Any]] = Field(default_factory=list, description="List of generated image objects with url, width, height")
    prompt: str
    style: ImageStyle
    seed_used: Optional[int] = None
    estimated_time_remaining: Optional[int] = None
    error: Optional[str] = None


class GeneratedImage(BaseModel):
    url: str
    width: int
    height: int
    format: str = "png"
    size_bytes: int
    seed: int
    variation_index: int = 0


class ImageGenerationBatchRequest(BaseModel):
    prompts: List[str] = Field(..., min_length=1, max_length=20, description="List of text prompts")
    style: ImageStyle = ImageStyle.NONE
    width: int = Field(default=1024, ge=256, le=2048, multiple_of=64)
    height: int = Field(default=1024, ge=256, le=2048, multiple_of=64)
    quality: str = Field(default="high", pattern=r"^(draft|standard|high|ultra)$")
    seed: Optional[int] = None


class ImageGenerationBatchResponse(BaseModel):
    batch_id: str
    total_prompts: int
    status: ImageGenerationStatus = ImageGenerationStatus.QUEUED
    results: List[Dict[str, Any]] = Field(default_factory=list)
    estimated_time_remaining: Optional[int] = None


# --- Enhanced Render Models ---


class WatermarkConfig(BaseModel):
    text: Optional[str] = Field(None, max_length=200, description="Watermark text")
    image_url: Optional[str] = Field(None, max_length=2000, description="Watermark image URL")
    position: WatermarkPosition = WatermarkPosition.BOTTOM_RIGHT
    opacity: float = Field(default=0.3, ge=0.0, le=1.0)
    scale: float = Field(default=0.1, ge=0.02, le=0.5, description="Watermark size as fraction of video dimensions")
    margin: int = Field(default=20, ge=0, le=200, description="Margin from edge in pixels")
    rotation: float = Field(default=0.0, ge=-180.0, le=180.0)


class SubtitleConfig(BaseModel):
    content: str = Field(..., min_length=1, description="Subtitle text content in SRT/VTT format")
    format: SubtitleFormat = SubtitleFormat.SRT
    font: str = Field(default="Arial", max_length=100)
    size: int = Field(default=24, ge=10, le=72)
    color: str = Field(default="#FFFFFF", pattern=r"^#[0-9A-Fa-f]{6}$")
    background_color: Optional[str] = Field(default="#000000", pattern=r"^#[0-9A-Fa-f]{6}$")
    background_opacity: float = Field(default=0.6, ge=0.0, le=1.0)
    position: str = Field(default="bottom_center", pattern=r"^(top|bottom|center)_(left|center|right)$")


class EnhancedProjectSettings(ProjectSettings):
    """Extends base ProjectSettings with advanced rendering options."""
    codec: VideoCodec = VideoCodec.H264
    export_format: RenderExportFormat = RenderExportFormat.MP4
    audio_bitrate: Optional[int] = Field(None, ge=64, le=512, description="Audio bitrate in kbps")
    video_bitrate: Optional[int] = Field(None, ge=500, le=50000, description="Video bitrate in kbps")
    two_pass_encoding: bool = Field(default=False, description="Use two-pass encoding for better quality")
    hardware_acceleration: bool = Field(default=True, description="Use GPU/hardware acceleration if available")
    color_profile: str = Field(default="srgb", pattern=r"^(srgb|rec709|rec2020|display_p3)$")


class EnhancedRenderRequest(BaseModel):
    """Extended render request supporting watermarks, subtitles, presets, and video layers."""
    images: List[ImageConfig] = Field(default_factory=list)
    videos: List[VideoConfig] = Field(default_factory=list)
    texts: List[TextConfig] = Field(default_factory=list)
    audio: Optional[AudioConfig] = None
    subtitle: Optional[SubtitleConfig] = None
    watermark: Optional[WatermarkConfig] = None
    settings: EnhancedProjectSettings = Field(default_factory=EnhancedProjectSettings)
    aspect_ratio: AspectRatio = AspectRatio.LANDSCAPE
    preset: Optional[RenderPreset] = None
    effects: Optional[List[str]] = None
    transitions: Optional[List[str]] = None
    duration: Optional[float] = Field(None, ge=1.0, le=600.0)
    resolution: Resolution = Resolution.HD_720P
    callback_url: Optional[str] = Field(None, max_length=2000, description="URL to receive render completion webhook")
    priority: int = Field(default=5, ge=1, le=10, description="Render job priority (1=highest, 10=lowest)")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Arbitrary metadata attached to the render job")


class BatchRenderRequest(BaseModel):
    """Submit multiple render jobs in a single request."""
    jobs: List[EnhancedRenderRequest] = Field(..., min_length=1, max_length=50, description="List of render job configs")
    callback_url: Optional[str] = Field(None, max_length=2000, description="URL to receive batch completion webhook")
    parallel: bool = Field(default=False, description="Whether to render jobs in parallel")


class BatchRenderResponse(BaseModel):
    batch_id: str
    total_jobs: int
    job_ids: List[str]
    status: RenderStatus = RenderStatus.PENDING
    message: str = "Batch render job submitted"


class EnhancedRenderStatusResponse(BaseModel):
    """Extended status response with detailed render metadata."""
    render_id: str
    batch_id: Optional[str] = None
    status: RenderStatus
    progress: float = Field(default=0.0, ge=0.0, le=100.0)
    download_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    file_size: Optional[int] = None
    duration_seconds: Optional[float] = None
    error: Optional[str] = None
    estimated_time_remaining: Optional[int] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    settings_used: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


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
