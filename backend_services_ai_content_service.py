"""AI-powered content generation service.

Provides intelligent content creation capabilities for GIODAI projects:
- Generate video scripts and scene breakdowns from a topic
- Suggest text overlays, captions, and titles
- Recommend effects, transitions, and pacing
- Auto-compose full project structures from a prompt
- Generate SEO-friendly titles and descriptions

Uses an OpenAI-compatible chat completions API (configurable endpoint).
"""

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# Default system prompt that encapsulates GIODAI's domain knowledge
_DEFAULT_SYSTEM_PROMPT = """\
You are GIODAI's creative assistant — an expert in short-form video production.
You help users plan and generate content for image-to-video projects.

Your outputs must be valid JSON matching the requested schema exactly.
Follow these domain rules:
- Image durations should range from 2 to 5 seconds per slide for social media.
- Text overlays should be concise (under 10 words per overlay ideally).
- Choose effects and transitions that match the emotional tone of the content.
- Ken Burns / smooth zoom work well for storytelling; pan effects for scenic content.
- For social media (9:16), keep text larger and more centered.
- For landscape (16:9), text can be positioned more freely.
- Always suggest background music style appropriate to the mood.
"""


# -------------------------------------------------------------------
# Prompt templates
# -------------------------------------------------------------------

_SCRIPT_PROMPT = """\
Create a {num_scenes}-scene video script for the following topic.

Topic: {topic}
Target platform: {platform}
Aspect ratio: {aspect_ratio}
Tone: {tone}

For each scene, provide:
- "description": A vivid visual description of what the image should show
- "duration_seconds": How long the scene should last (2-5s recommended)
- "text_overlay": A short caption or title for this scene (optional, can be empty string)
- "effect": One of [ken_burns, smooth_zoom, zoom_in, zoom_out, pan_left, pan_right, pan_up, pan_down, none]
- "transition_to_next": One of [fade, crossfade, slide_left, slide_right, slide_up, slide_down, blur, none]

Also include:
- "title": A catchy video title (under 60 chars)
- "description": A short description for the video (under 200 chars)
- "suggested_music_style": What kind of background music would fit (e.g., "upbeat electronic", "calm piano")
- "suggested_bg_color": A hex color for the background (e.g., "#000000")

Respond with a JSON object in this exact shape:
{{
  "title": "...",
  "description": "...",
  "suggested_music_style": "...",
  "suggested_bg_color": "#000000",
  "scenes": [
    {{
      "description": "...",
      "duration_seconds": 3.0,
      "text_overlay": "...",
      "effect": "...",
      "transition_to_next": "..."
    }}
  ]
}}
"""

_CAPTIONS_PROMPT = """\
Generate compelling text overlays for a video with {num_images} image scenes.

Context: {context}
Tone: {tone}
Target platform: {platform}

For each image (by 1-based index), provide a text overlay that will appear on screen.
Keep each overlay under 15 words. Use impactful, concise language.
You may leave some blank (empty string) if an image works better without text.

Respond with a JSON object:
{{
  "captions": [
    {{"image_index": 1, "text": "Your caption here", "animation": "fade_in"}},
    {{"image_index": 2, "text": "", "animation": "none"}}
  ]
}}

Animation options: [fade_in, fade_out, slide_up_in, slide_down_in, none]
"""

_PROJECT_FROM_PROMPT = """\
Generate a complete GIODAI project configuration from a user's natural-language request.

User request: {prompt}
Number of images: {num_images}
Aspect ratio: {aspect_ratio}

Respond with a JSON object matching this schema exactly:
{{
  "name": "Project title (under 100 chars)",
  "description": "Project description (under 200 chars)",
  "aspect_ratio": "{aspect_ratio}",
  "settings": {{
    "resolution": "1080p",
    "fps": 30,
    "quality": "high",
    "background_color": "#000000"
  }},
  "images": [
    {{
      "duration": 3.0,
      "effect": "ken_burns",
      "transition": "crossfade",
      "description": "What this image should depict"
    }}
  ],
  "texts": [
    {{
      "content": "Overlay text",
      "font": "Arial",
      "size": 48,
      "color": "#FFFFFF",
      "stroke_color": "#000000",
      "stroke_width": 2,
      "x": 0.5,
      "y": 0.5,
      "start_time": 0.0,
      "end_time": 3.0,
      "animation": "fade_in"
    }}
  ],
  "transitions": ["crossfade", "fade", "slide_left", ...]
}}

Rules:
- Generate exactly {num_images} image entries.
- Duration per image: 2-5 seconds.
- Text overlays should complement (not duplicate) each other.
- Match the tone and style implied by the user's request.
- Choose appropriate effects and transitions for the mood.
"""

_EFFECTS_RECOMMENDATION_PROMPT = """\
Recommend visual effects and transitions for a video project.

Content theme: {theme}
Mood: {mood}
Platform: {platform}
Number of scenes: {num_scenes}

For each scene, recommend:
- "effect": The best visual effect for that scene
- "reasoning": A brief explanation of why

Also recommend an overall pacing style and a list of transitions between scenes.

Respond with JSON:
{{
  "pacing_style": "slow|medium|fast",
  "overall_transition": "crossfade",
  "scene_recommendations": [
    {{"scene_index": 1, "effect": "ken_burns", "reasoning": "..."}}
  ],
  "transition_sequence": ["crossfade", "fade", ...],
  "tips": ["General tip for this style of video"]
}}
"""

_SEO_PROMPT = """\
Generate SEO-optimized metadata for a video.

Video topic: {topic}
Platform: {platform}
Content summary: {summary}

Respond with JSON:
{{
  "title": "SEO title (under 70 chars)",
  "description": "SEO description (under 160 chars for search, under 200 for social)",
  "tags": ["tag1", "tag2", ...],
  "hashtags": ["#hashtag1", "#hashtag2", ...],
  "thumbnail_text": "Short text for thumbnail overlay (under 8 words)"
}}
"""


class AIContentService:
    """AI-powered content generation for GIODAI video projects.

    Communicates with an OpenAI-compatible chat completions API.
    The endpoint, API key, and model are configurable via constructor
    arguments or environment variables.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        api_base: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 2,
    ):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        self.api_base = (
            api_base
            or os.getenv("OPENAI_API_BASE", "")
            or "https://api.openai.com/v1"
        )
        self.model = model or os.getenv("AI_MODEL", "gpt-4o-mini")
        self.timeout = timeout
        self.max_retries = max_retries
        self._client = httpx.Client(timeout=timeout)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_script(
        self,
        topic: str,
        num_scenes: int = 5,
        platform: str = "YouTube Shorts",
        aspect_ratio: str = "9:16",
        tone: str = "engaging",
    ) -> Dict[str, Any]:
        """Generate a complete video script with scene breakdowns.

        Returns a dict with keys: title, description, suggested_music_style,
        suggested_bg_color, scenes[].
        """
        prompt = _SCRIPT_PROMPT.format(
            num_scenes=num_scenes,
            topic=topic,
            platform=platform,
            aspect_ratio=aspect_ratio,
            tone=tone,
        )
        return self._call_and_parse(prompt)

    def generate_captions(
        self,
        num_images: int,
        context: str = "",
        tone: str = "engaging",
        platform: str = "YouTube Shorts",
    ) -> Dict[str, Any]:
        """Generate text overlay captions for a set of images.

        Returns a dict with key "captions" containing a list of
        {image_index, text, animation} dicts.
        """
        prompt = _CAPTIONS_PROMPT.format(
            num_images=num_images,
            context=context or "General video content",
            tone=tone,
            platform=platform,
        )
        return self._call_and_parse(prompt)

    def generate_project_from_prompt(
        self,
        prompt: str,
        num_images: int = 5,
        aspect_ratio: str = "9:16",
    ) -> Dict[str, Any]:
        """Generate a full GIODAI project config from a natural-language prompt.

        Returns a dict matching the project creation schema (name, images,
        texts, transitions, settings, etc.).
        """
        template = _PROJECT_FROM_PROMPT.format(
            prompt=prompt,
            num_images=num_images,
            aspect_ratio=aspect_ratio,
        )
        result = self._call_and_parse(template)
        # Ensure aspect_ratio is set correctly (LLM may hallucinate)
        result["aspect_ratio"] = aspect_ratio
        return result

    def recommend_effects(
        self,
        theme: str,
        mood: str = "inspirational",
        platform: str = "YouTube Shorts",
        num_scenes: int = 5,
    ) -> Dict[str, Any]:
        """Get AI-recommended effects and transitions for a project.

        Returns pacing_style, scene_recommendations[], transition_sequence[], tips[].
        """
        prompt = _EFFECTS_RECOMMENDATION_PROMPT.format(
            theme=theme,
            mood=mood,
            platform=platform,
            num_scenes=num_scenes,
        )
        return self._call_and_parse(prompt)

    def generate_seo_metadata(
        self,
        topic: str,
        platform: str = "YouTube Shorts",
        summary: str = "",
    ) -> Dict[str, Any]:
        """Generate SEO-optimized title, description, tags, and hashtags.

        Returns title, description, tags[], hashtags[], thumbnail_text.
        """
        prompt = _SEO_PROMPT.format(
            topic=topic,
            platform=platform,
            summary=summary or topic,
        )
        return self._call_and_parse(prompt)

    def is_configured(self) -> bool:
        """Check whether the service has a valid API key configured."""
        return bool(self.api_key)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _call_and_parse(self, user_prompt: str) -> Dict[str, Any]:
        """Send a prompt to the LLM and parse the JSON response.

        Raises:
            ValueError: If the API key is not set, the API call fails,
                        or the response cannot be parsed as JSON.
        """
        if not self.api_key:
            raise ValueError(
                "AI content service is not configured. "
                "Set the OPENAI_API_KEY environment variable."
            )

        raw = self._chat_completion(user_prompt)
        return self._extract_json(raw)

    def _chat_completion(self, user_prompt: str) -> str:
        """Call the OpenAI-compatible chat completions endpoint."""
        url = f"{self.api_base.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": _DEFAULT_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.7,
            "max_tokens": 2048,
        }

        last_error: Optional[Exception] = None
        for attempt in range(1, self.max_retries + 1):
            try:
                response = self._client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"].strip()
            except (httpx.HTTPStatusError, httpx.RequestError, KeyError, IndexError) as exc:
                last_error = exc
                logger.warning(
                    "AI API call attempt %d/%d failed: %s",
                    attempt, self.max_retries, exc,
                )

        raise ValueError(
            f"AI content generation failed after {self.max_retries} attempts: {last_error}"
        )

    @staticmethod
    def _extract_json(text: str) -> Dict[str, Any]:
        """Extract and parse a JSON object from LLM output.

        Handles markdown code fences, leading/trailing prose, and
        common formatting quirks.
        """
        # Try to find a fenced JSON block first
        fence_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
        if fence_match:
            text = fence_match.group(1).strip()

        # Find the outermost { ... } block
        brace_start = text.find("{")
        brace_end = text.rfind("}")
        if brace_start != -1 and brace_end > brace_start:
            text = text[brace_start : brace_end + 1]

        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Failed to parse AI response as JSON: {exc}\n"
                f"Raw response (first 500 chars): {text[:500]}"
            ) from exc

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()


# Module-level singleton
ai_content_service = AIContentService()
