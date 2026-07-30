"""Image processing service using Pillow."""

import base64
import io
import uuid
from typing import Dict, Any, Optional, Tuple
from PIL import Image


class ImageProcessor:
    """Handles image processing operations using Pillow."""

    SUPPORTED_FORMATS = {"JPEG", "PNG", "WEBP", "GIF", "BMP", "TIFF"}
    MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20MB

    def process_image(self, file_data: bytes, filename: str = "image") -> Dict[str, Any]:
        """Process an uploaded image and return metadata plus base64 data."""
        try:
            image = Image.open(io.BytesIO(file_data))
            image.load()

            if image.format not in self.SUPPORTED_FORMATS:
                raise ValueError(f"Unsupported image format: {image.format}")

            width, height = image.size
            img_format = image.format or "JPEG"
            img_mode = image.mode

            if img_mode in ("RGBA", "P"):
                if img_mode == "P":
                    image = image.convert("RGBA")
                background = Image.new("RGB", (width, height), (0, 0, 0))
                if image.mode == "RGBA":
                    background.paste(image, mask=image.split()[3])
                else:
                    background.paste(image)
                image = background
            elif img_mode != "RGB":
                image = image.convert("RGB")

            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=95)
            base64_data = base64.b64encode(buffer.getvalue()).decode("utf-8")

            return {
                "width": width,
                "height": height,
                "format": img_format,
                "mode": img_mode,
                "base64_data": base64_data,
                "size": len(file_data),
                "mime_type": f"image/{img_format.lower()}",
                "filename": filename,
            }
        except Exception as e:
            raise ValueError(f"Failed to process image: {str(e)}")

    def crop_image(
        self, image_data: str, x: int, y: int, width: int, height: int
    ) -> str:
        """Crop an image from base64 data and return cropped base64."""
        image = self._decode_image(image_data)
        cropped = image.crop((x, y, x + width, y + height))
        return self._encode_image(cropped)

    def rotate_image(self, image_data: str, degrees: float) -> str:
        """Rotate an image by the given degrees and return base64."""
        image = self._decode_image(image_data)
        rotated = image.rotate(degrees, expand=True, fillcolor=(0, 0, 0))
        return self._encode_image(rotated)

    def resize_image(self, image_data: str, width: int, height: int) -> str:
        """Resize an image to the given dimensions and return base64."""
        image = self._decode_image(image_data)
        resized = image.resize((width, height), Image.Resampling.LANCZOS)
        return self._encode_image(resized)

    def get_thumbnail(self, image_data: str, max_size: int = 200) -> str:
        """Generate a thumbnail of the image and return base64."""
        image = self._decode_image(image_data)
        image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        return self._encode_image(image)

    def ensure_rgb(self, image_data: str) -> Tuple[Image.Image, str]:
        """Ensure image is in RGB mode, return (PIL Image, file path)."""
        image = self._decode_image(image_data)
        if image.mode != "RGB":
            if image.mode in ("RGBA", "LA", "P"):
                background = Image.new("RGB", image.size, (0, 0, 0))
                if image.mode == "P":
                    image = image.convert("RGBA")
                if image.mode in ("RGBA", "LA"):
                    background.paste(image, mask=image.split()[-1])
                else:
                    background.paste(image)
                image = background
            else:
                image = image.convert("RGB")

        temp_path = f"temp/{uuid.uuid4().hex}.jpg"
        image.save(temp_path, "JPEG", quality=95)
        return image, temp_path

    def _decode_image(self, base64_data: str) -> Image.Image:
        """Decode a base64 string to a PIL Image."""
        if base64_data.startswith("data:"):
            base64_data = base64_data.split(",", 1)[1]
        image_bytes = base64.b64decode(base64_data)
        return Image.open(io.BytesIO(image_bytes))

    def _encode_image(self, image: Image.Image) -> str:
        """Encode a PIL Image to base64 JPEG string."""
        if image.mode in ("RGBA", "P"):
            if image.mode == "P":
                image = image.convert("RGBA")
            background = Image.new("RGB", image.size, (0, 0, 0))
            background.paste(image, mask=image.split()[3])
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")

        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=90)
        return base64.b64encode(buffer.getvalue()).decode("utf-8")


image_processor = ImageProcessor()
