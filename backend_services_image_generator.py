"""Image generation service using Pillow."""

import base64
import io
import math
import random
import uuid
from typing import Dict, Any, Optional, Tuple, List
from PIL import Image, ImageDraw, ImageFont, ImageFilter


class ImageGenerator:
    """Handles image generation operations using Pillow."""

    DEFAULT_FORMAT = "PNG"
    DEFAULT_QUALITY = 95
    DEFAULT_BG_COLOR = (30, 30, 46)
    DEFAULT_TEXT_COLOR = (205, 214, 244)
    DEFAULT_ACCENT_COLOR = (137, 180, 250)

    def generate(
        self,
        width: int = 800,
        height: int = 600,
        format: str = DEFAULT_FORMAT,
        quality: int = DEFAULT_QUALITY,
        **kwargs,
    ) -> str:
        kind = kwargs.pop("kind", "solid")
        dispatch = {
            "solid": self.solid_color,
            "gradient": self.gradient,
            "checkerboard": self.checkerboard,
            "stripes": self.stripes,
            "dots": self.dots,
            "noise": self.noise,
            "placeholder": self.placeholder,
            "text": self.text_image,
            "radial_gradient": self.radial_gradient,
            "concentric": self.concentric_circles,
            "wave": self.wave,
        }
        generator = dispatch.get(kind, self.solid_color)
        image = generator(width=width, height=height, **kwargs)
        return self._encode(image, format, quality)

    def solid_color(
        self, width: int = 800, height: int = 600,
        color: Optional[Tuple[int, int, int]] = None, **_kwargs,
    ) -> Image.Image:
        color = color or self.DEFAULT_BG_COLOR
        return Image.new("RGB", (width, height), color)

    def gradient(
        self, width: int = 800, height: int = 600,
        start_color: Optional[Tuple[int, int, int]] = None,
        end_color: Optional[Tuple[int, int, int]] = None,
        direction: str = "vertical", **_kwargs,
    ) -> Image.Image:
        start_color = start_color or (30, 30, 46)
        end_color = end_color or (137, 180, 250)
        image = Image.new("RGB", (width, height))
        draw = ImageDraw.Draw(image)
        if direction == "horizontal":
            for x in range(width):
                ratio = x / max(width - 1, 1)
                color = self._lerp_color(start_color, end_color, ratio)
                draw.line([(x, 0), (x, height - 1)], fill=color)
        elif direction == "diagonal":
            max_dist = math.hypot(width, height)
            for y in range(height):
                for x in range(width):
                    ratio = (x + y) / max_dist
                    color = self._lerp_color(start_color, end_color, min(ratio, 1.0))
                    image.putpixel((x, y), color)
        else:
            for y in range(height):
                ratio = y / max(height - 1, 1)
                color = self._lerp_color(start_color, end_color, ratio)
                draw.line([(0, y), (width - 1, y)], fill=color)
        return image

    def radial_gradient(
        self, width: int = 800, height: int = 600,
        center_color: Optional[Tuple[int, int, int]] = None,
        edge_color: Optional[Tuple[int, int, int]] = None, **_kwargs,
    ) -> Image.Image:
        center_color = center_color or (137, 180, 250)
        edge_color = edge_color or (30, 30, 46)
        cx, cy = width / 2, height / 2
        max_radius = math.hypot(cx, cy)
        image = Image.new("RGB", (width, height))
        for y in range(height):
            for x in range(width):
                dist = math.hypot(x - cx, y - cy)
                ratio = min(dist / max_radius, 1.0)
                color = self._lerp_color(center_color, edge_color, ratio)
                image.putpixel((x, y), color)
        return image

    def checkerboard(
        self, width: int = 800, height: int = 600, tile_size: int = 40,
        color_a: Optional[Tuple[int, int, int]] = None,
        color_b: Optional[Tuple[int, int, int]] = None, **_kwargs,
    ) -> Image.Image:
        color_a = color_a or (205, 214, 244)
        color_b = color_b or (30, 30, 46)
        image = Image.new("RGB", (width, height))
        draw = ImageDraw.Draw(image)
        for y in range(0, height, tile_size):
            for x in range(0, width, tile_size):
                color = color_a if ((x // tile_size) + (y // tile_size)) % 2 == 0 else color_b
                draw.rectangle(
                    [x, y, min(x + tile_size - 1, width - 1), min(y + tile_size - 1, height - 1)],
                    fill=color,
                )
        return image

    def stripes(
        self, width: int = 800, height: int = 600, stripe_width: int = 20,
        color_a: Optional[Tuple[int, int, int]] = None,
        color_b: Optional[Tuple[int, int, int]] = None,
        angle: float = 0.0, **_kwargs,
    ) -> Image.Image:
        color_a = color_a or (137, 180, 250)
        color_b = color_b or (30, 30, 46)
        diag = math.hypot(width, height)
        temp_size = int(diag) + 2 * stripe_width
        temp = Image.new("RGB", (temp_size, temp_size), color_b)
        draw = ImageDraw.Draw(temp)
        for y in range(0, temp_size, stripe_width * 2):
            draw.rectangle([0, y, temp_size, y + stripe_width - 1], fill=color_a)
        rotated = temp.rotate(angle, resample=Image.Resampling.BICUBIC, expand=False)
        left = (rotated.width - width) // 2
        top = (rotated.height - height) // 2
        return rotated.crop((left, top, left + width, top + height))

    def dots(
        self, width: int = 800, height: int = 600, dot_radius: int = 8,
        spacing: int = 30,
        dot_color: Optional[Tuple[int, int, int]] = None,
        bg_color: Optional[Tuple[int, int, int]] = None, **_kwargs,
    ) -> Image.Image:
        dot_color = dot_color or (137, 180, 250)
        bg_color = bg_color or (30, 30, 46)
        image = Image.new("RGB", (width, height), bg_color)
        draw = ImageDraw.Draw(image)
        for y in range(spacing, height, spacing):
            for x in range(spacing, width, spacing):
                draw.ellipse(
                    [x - dot_radius, y - dot_radius, x + dot_radius, y + dot_radius],
                    fill=dot_color,
                )
        return image

    def noise(
        self, width: int = 800, height: int = 600, intensity: int = 128,
        mono: bool = False, seed: Optional[int] = None, **_kwargs,
    ) -> Image.Image:
        rng = random.Random(seed)
        if mono:
            data = bytes(rng.randint(0, intensity) for _ in range(width * height))
            image = Image.frombytes("L", (width, height), data)
            return image.convert("RGB")
        data = bytes(rng.randint(0, intensity) for _ in range(width * height * 3))
        return Image.frombytes("RGB", (width, height), data)

    def placeholder(
        self, width: int = 800, height: int = 600,
        bg_color: Optional[Tuple[int, int, int]] = None,
        text_color: Optional[Tuple[int, int, int]] = None,
        border_color: Optional[Tuple[int, int, int]] = None, **_kwargs,
    ) -> Image.Image:
        bg_color = bg_color or self.DEFAULT_BG_COLOR
        text_color = text_color or self.DEFAULT_TEXT_COLOR
        border_color = border_color or self.DEFAULT_ACCENT_COLOR
        image = Image.new("RGB", (width, height), bg_color)
        draw = ImageDraw.Draw(image)
        border_w = max(2, min(width, height) // 40)
        draw.rectangle([0, 0, width - 1, height - 1], outline=border_color, width=border_w)
        label = f"{width} x {height}"
        font = self._get_scaled_font(draw, label, max(width, height) // 6)
        bbox = draw.textbbox((0, 0), label, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        tx = (width - tw) // 2 - bbox[0]
        ty = (height - th) // 2 - bbox[1]
        draw.text((tx, ty), label, fill=text_color, font=font)
        return image

    def text_image(
        self, width: int = 800, height: int = 600, text: str = "Hello, World!",
        bg_color: Optional[Tuple[int, int, int]] = None,
        text_color: Optional[Tuple[int, int, int]] = None,
        font_size: Optional[int] = None, align: str = "center", **_kwargs,
    ) -> Image.Image:
        bg_color = bg_color or self.DEFAULT_BG_COLOR
        text_color = text_color or self.DEFAULT_TEXT_COLOR
        image = Image.new("RGB", (width, height), bg_color)
        draw = ImageDraw.Draw(image)
        if font_size is None:
            font_size = max(12, min(width, height) // max(len(text) // 10 + 1, 1) // 2)
        font = self._load_font(font_size)
        lines = self._wrap_text(text, font, width - 40, draw)
        line_height = font_size + 4
        total_h = line_height * len(lines)
        y_start = (height - total_h) // 2
        for i, line in enumerate(lines):
            bbox = draw.textbbox((0, 0), line, font=font)
            tw = bbox[2] - bbox[0]
            if align == "left":
                tx = 20
            elif align == "right":
                tx = width - tw - 20
            else:
                tx = (width - tw) // 2
            ty = y_start + i * line_height
            draw.text((tx, ty), line, fill=text_color, font=font)
        return image

    def concentric_circles(
        self, width: int = 800, height: int = 600, num_rings: int = 10,
        color_a: Optional[Tuple[int, int, int]] = None,
        color_b: Optional[Tuple[int, int, int]] = None,
        line_width: int = 2, **_kwargs,
    ) -> Image.Image:
        color_a = color_a or (137, 180, 250)
        color_b = color_b or (30, 30, 46)
        image = Image.new("RGB", (width, height), color_b)
        draw = ImageDraw.Draw(image)
        cx, cy = width // 2, height // 2
        max_radius = math.hypot(cx, cy)
        step = max_radius / num_rings
        for i in range(num_rings, 0, -1):
            ratio = i / num_rings
            color = self._lerp_color(color_b, color_a, ratio)
            r = int(step * i)
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=line_width)
        return image

    def wave(
        self, width: int = 800, height: int = 600, num_waves: int = 5,
        color_a: Optional[Tuple[int, int, int]] = None,
        color_b: Optional[Tuple[int, int, int]] = None,
        amplitude: Optional[int] = None, frequency: float = 0.02, **_kwargs,
    ) -> Image.Image:
        color_a = color_a or (137, 180, 250)
        color_b = color_b or (30, 30, 46)
        amplitude = amplitude or height // (num_waves * 2 + 2)
        image = Image.new("RGB", (width, height), color_b)
        draw = ImageDraw.Draw(image)
        for i in range(num_waves):
            ratio = (i + 1) / (num_waves + 1)
            color = self._lerp_color(color_b, color_a, ratio)
            y_base = int(height * ratio)
            phase = i * math.pi / 3
            points = []
            for x in range(width):
                y = y_base + int(amplitude * math.sin(frequency * x + phase))
                points.append((x, y))
            if len(points) > 1:
                draw.line(points, fill=color, width=3)
        return image

    def overlay_text(
        self, base_image_data: str, text: str, position: str = "center",
        font_size: int = 32,
        text_color: Optional[Tuple[int, int, int]] = None,
        shadow: bool = True, format: str = DEFAULT_FORMAT,
        quality: int = DEFAULT_QUALITY,
    ) -> str:
        image = self._decode(base_image_data)
        draw = ImageDraw.Draw(image)
        text_color = text_color or (255, 255, 255)
        font = self._load_font(font_size)
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        w, h = image.size
        if position == "top-left":
            tx, ty = 20, 20
        elif position == "top-right":
            tx, ty = w - tw - 20, 20
        elif position == "bottom-left":
            tx, ty = 20, h - th - 20
        elif position == "bottom-right":
            tx, ty = w - tw - 20, h - th - 20
        else:
            tx, ty = (w - tw) // 2, (h - th) // 2
        if shadow:
            shadow_offset = max(2, font_size // 16)
            draw.text((tx + shadow_offset, ty + shadow_offset), text, fill=(0, 0, 0), font=font)
        draw.text((tx, ty), text, fill=text_color, font=font)
        return self._encode(image, format, quality)

    def add_watermark(
        self, base_image_data: str, watermark_text: str, opacity: int = 60,
        font_size: int = 24, format: str = DEFAULT_FORMAT,
        quality: int = DEFAULT_QUALITY,
    ) -> str:
        image = self._decode(base_image_data)
        w, h = image.size
        font = self._load_font(font_size)
        bbox = font.getbbox(watermark_text)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        padding = 40
        tile_w = tw + padding * 2
        tile_h = th + padding * 2
        tile = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, 0))
        tile_draw = ImageDraw.Draw(tile)
        tile_draw.text((padding, padding), watermark_text, fill=(255, 255, 255, opacity), font=font)
        watermark_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        for y in range(-tile_h, h, tile_h):
            for x in range(-tile_w, w, tile_w):
                watermark_layer.paste(tile, (x, y))
        watermark_layer = watermark_layer.rotate(-30, resample=Image.Resampling.BICUBIC, expand=True)
        ww, wh = watermark_layer.size
        watermark_layer = watermark_layer.crop(((ww - w) // 2, (wh - h) // 2, (ww + w) // 2, (wh + h) // 2))
        if image.mode != "RGBA":
            image = image.convert("RGBA")
        result = Image.alpha_composite(image, watermark_layer)
        return self._encode(result.convert("RGB"), format, quality)

    def create_collage(
        self, image_data_list: List[str], columns: int = 2, padding: int = 10,
        bg_color: Optional[Tuple[int, int, int]] = None,
        format: str = DEFAULT_FORMAT, quality: int = DEFAULT_QUALITY,
    ) -> str:
        if not image_data_list:
            raise ValueError("image_data_list must not be empty")
        bg_color = bg_color or (30, 30, 46)
        images = [self._decode(d) for d in image_data_list]
        target_h = min(img.height for img in images)
        resized = []
        for img in images:
            ratio = target_h / img.height
            new_w = int(img.width * ratio)
            resized.append(img.resize((new_w, target_h), Image.Resampling.LANCZOS))
        rows = math.ceil(len(resized) / columns)
        tile_w = max(img.width for img in resized)
        canvas_w = columns * tile_w + (columns + 1) * padding
        canvas_h = rows * target_h + (rows + 1) * padding
        canvas = Image.new("RGB", (canvas_w, canvas_h), bg_color)
        for idx, img in enumerate(resized):
            row, col = divmod(idx, columns)
            x = padding + col * (tile_w + padding) + (tile_w - img.width) // 2
            y = padding + row * (target_h + padding)
            canvas.paste(img, (x, y))
        return self._encode(canvas, format, quality)

    def blur_image(
        self, base_image_data: str, radius: int = 10,
        format: str = DEFAULT_FORMAT, quality: int = DEFAULT_QUALITY,
    ) -> str:
        image = self._decode(base_image_data)
        blurred = image.filter(ImageFilter.GaussianBlur(radius=radius))
        return self._encode(blurred, format, quality)

    @staticmethod
    def _lerp_color(a: Tuple[int, int, int], b: Tuple[int, int, int], t: float) -> Tuple[int, int, int]:
        t = max(0.0, min(1.0, t))
        return (int(a[0] + (b[0] - a[0]) * t), int(a[1] + (b[1] - a[1]) * t), int(a[2] + (b[2] - a[2]) * t))

    @staticmethod
    def _load_font(size: int) -> ImageFont.FreeTypeFont:
        font_paths = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/TTF/DejaVuSans.ttf",
            "/usr/share/fonts/dejavu/DejaVuSans.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
            "C:\\Windows\\Fonts\\arial.ttf",
        ]
        for path in font_paths:
            try:
                return ImageFont.truetype(path, size)
            except (OSError, IOError):
                continue
        return ImageFont.load_default()

    def _get_scaled_font(self, draw: ImageDraw.Draw, text: str, max_size: int) -> ImageFont.FreeTypeFont:
        for size in range(max_size, 8, -2):
            font = self._load_font(size)
            bbox = draw.textbbox((0, 0), text, font=font)
            if bbox[2] - bbox[0] <= max_size:
                return font
        return self._load_font(8)

    @staticmethod
    def _wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int, draw: ImageDraw.Draw) -> List[str]:
        words = text.split()
        if not words:
            return []
        lines: List[str] = []
        current_line = ""
        for word in words:
            test = f"{current_line} {word}".strip()
            bbox = draw.textbbox((0, 0), test, font=font)
            if bbox[2] - bbox[0] <= max_width:
                current_line = test
            else:
                if current_line:
                    lines.append(current_line)
                current_line = word
        if current_line:
            lines.append(current_line)
        return lines or [""]

    @staticmethod
    def _decode(base64_data: str) -> Image.Image:
        if base64_data.startswith("data:"):
            base64_data = base64_data.split(",", 1)[1]
        return Image.open(io.BytesIO(base64.b64decode(base64_data)))

    @staticmethod
    def _encode(image: Image.Image, format: str = "PNG", quality: int = 95) -> str:
        fmt = format.upper()
        if fmt in ("JPEG", "JPG"):
            if image.mode in ("RGBA", "P", "LA"):
                bg = Image.new("RGB", image.size, (0, 0, 0))
                if image.mode == "P":
                    image = image.convert("RGBA")
                if image.mode in ("RGBA", "LA"):
                    bg.paste(image, mask=image.split()[-1])
                else:
                    bg.paste(image)
                image = bg
            elif image.mode != "RGB":
                image = image.convert("RGB")
        buffer = io.BytesIO()
        save_kwargs: Dict[str, Any] = {"format": fmt}
        if fmt in ("JPEG", "JPG", "WEBP"):
            save_kwargs["quality"] = quality
        image.save(buffer, **save_kwargs)
        return base64.b64encode(buffer.getvalue()).decode("utf-8")


image_generator = ImageGenerator()
