import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Modality } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Initialize Gemini AI Client lazily/safely with required headers
const getGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in secrets.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// --- API ROUTES ---

// Health Check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// AI Video Script & Scene Generator
app.post("/api/ai/generate-script", async (req, res) => {
  try {
    const { prompt, aspectRatio = "16:9", style = "modern", numScenes = 4 } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const ai = getGenAI();
    const systemInstruction = `You are a professional video director and storyboarding expert. 
Given a topic or concept, create a concise, highly visual slideshow video plan with ${numScenes} distinct scenes/slides.
Return a structured JSON object with video title, overall theme, background music suggestion, and an array of scenes.
Each scene must have:
- title: Short overlay title
- caption: Subtitle or caption text
- voiceScript: Short narration line (1-2 sentences)
- imagePrompt: Detailed descriptive prompt to generate or select a background image
- animationType: One of "pan-left", "pan-right", "zoom-in", "zoom-out", "spiral"
- transitionType: One of "fade", "slide-left", "slide-right", "blur", "zoom"
- duration: Duration in seconds (between 3 and 7)`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Topic: "${prompt}". Style: ${style}. Aspect Ratio: ${aspectRatio}.`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            themeColor: { type: Type.STRING },
            musicStyle: { type: Type.STRING },
            scenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  caption: { type: Type.STRING },
                  voiceScript: { type: Type.STRING },
                  imagePrompt: { type: Type.STRING },
                  animationType: { type: Type.STRING },
                  transitionType: { type: Type.STRING },
                  duration: { type: Type.NUMBER },
                },
                required: ["title", "voiceScript", "imagePrompt", "animationType", "transitionType", "duration"],
              },
            },
          },
          required: ["title", "scenes"],
        },
      },
    });

    const scriptData = JSON.parse(response.text || "{}");
    res.json({ success: true, script: scriptData });
  } catch (error: any) {
    console.error("Error generating video script:", error);
    res.status(500).json({ error: error.message || "Failed to generate video script" });
  }
});

// AI Voice Narration (TTS)
app.post("/api/ai/tts", async (req, res) => {
  try {
    const { text, voice = "Kore" } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Text is required for TTS" });
    }

    const ai = getGenAI();
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Say clearly and eloquently: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice || "Kore" },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return res.status(500).json({ error: "No audio generated" });
    }

    res.json({ success: true, audioBase64: base64Audio, mimeType: "audio/pcm;rate=24000" });
  } catch (error: any) {
    console.error("Error generating TTS audio:", error);
    res.status(500).json({ error: error.message || "Failed to generate voice narration" });
  }
});

// AI Image Generator
app.post("/api/ai/generate-image", async (req, res) => {
  try {
    const { prompt, aspectRatio = "16:9" } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Image prompt is required" });
    }

    const ai = getGenAI();
    // Map standard video aspect ratios to allowed image aspect ratios
    let validRatio = "16:9";
    if (aspectRatio === "9:16") validRatio = "9:16";
    else if (aspectRatio === "1:1") validRatio = "1:1";
    else if (aspectRatio === "4:3" || aspectRatio === "4:5") validRatio = "4:3";

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-image",
      contents: {
        parts: [{ text: `High quality cinematic photo for video slideshow: ${prompt}` }],
      },
      config: {
        imageConfig: {
          aspectRatio: validRatio as any,
        },
      },
    });

    let imageUrl = null;
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          imageUrl = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!imageUrl) {
      return res.status(500).json({ error: "Failed to generate image" });
    }

    res.json({ success: true, imageUrl });
  } catch (error: any) {
    console.error("Error generating AI image:", error);
    res.status(500).json({ error: error.message || "Failed to generate AI image" });
  }
});

// Preset Templates
app.get("/api/templates", (_req, res) => {
  const templates = [
    {
      id: "yt-shorts-1",
      title: "YouTube Shorts Viral Intro",
      category: "YouTube Shorts",
      aspectRatio: "9:16",
      thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80",
      description: "Punchy, fast-paced vertical video with dramatic zoom transitions.",
      slides: [
        {
          id: "s1",
          imageUrl: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1200&q=80",
          duration: 3,
          animationType: "zoom-in",
          transitionType: "slide-left",
          backgroundColor: "#0d0e15",
        },
        {
          id: "s2",
          imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80",
          duration: 3,
          animationType: "pan-right",
          transitionType: "fade",
          backgroundColor: "#0d0e15",
        },
      ],
      textTracks: [
        { id: "t1", text: "DID YOU KNOW THIS?", startTime: 0.5, duration: 2.5, positionY: 30, fontSize: 36, color: "#ffffff", strokeColor: "#000000", animation: "pop" },
        { id: "t2", text: "Watch till the end! 🚀", startTime: 3.2, duration: 2.5, positionY: 75, fontSize: 28, color: "#fbbf24", strokeColor: "#000000", animation: "fade" },
      ],
    },
    {
      id: "tiktok-trend",
      title: "TikTok Aesthetic Slideshow",
      category: "TikTok",
      aspectRatio: "9:16",
      thumbnail: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80",
      description: "Aesthetic pastel visuals with soft crossfade blur transitions.",
      slides: [
        {
          id: "s1",
          imageUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80",
          duration: 4,
          animationType: "pan-left",
          transitionType: "blur",
          backgroundColor: "#18181b",
        },
        {
          id: "s2",
          imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
          duration: 4,
          animationType: "zoom-out",
          transitionType: "fade",
          backgroundColor: "#18181b",
        },
      ],
      textTracks: [
        { id: "t1", text: "Unreal Places on Earth ✨", startTime: 0.2, duration: 3.8, positionY: 50, fontSize: 32, color: "#ffffff", strokeColor: "#000000", animation: "fade" },
      ],
    },
    {
      id: "insta-reel",
      title: "Instagram Reel Luxury Promo",
      category: "Instagram Reel",
      aspectRatio: "9:16",
      thumbnail: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80",
      description: "High-contrast luxury feel with slow Ken Burns pan.",
      slides: [
        {
          id: "s1",
          imageUrl: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
          duration: 5,
          animationType: "zoom-in",
          transitionType: "fade",
          backgroundColor: "#09090b",
        },
      ],
      textTracks: [
        { id: "t1", text: "DISCOVER ELEGANCE", startTime: 0.5, duration: 4.0, positionY: 45, fontSize: 38, color: "#fef08a", strokeColor: "#000000", animation: "fade" },
      ],
    },
    {
      id: "church-announcement",
      title: "Church Sunday Announcement",
      category: "Church Announcement",
      aspectRatio: "16:9",
      thumbnail: "https://images.unsplash.com/photo-1438232992991-995b7058bbb3?auto=format&fit=crop&w=600&q=80",
      description: "Inspiring background with elegant text overlays and worship aesthetics.",
      slides: [
        {
          id: "s1",
          imageUrl: "https://images.unsplash.com/photo-1438232992991-995b7058bbb3?auto=format&fit=crop&w=1200&q=80",
          duration: 6,
          animationType: "zoom-out",
          transitionType: "fade",
          backgroundColor: "#111827",
        },
      ],
      textTracks: [
        { id: "t1", text: "JOIN US THIS SUNDAY", startTime: 0.5, duration: 5.0, positionY: 35, fontSize: 42, color: "#ffffff", strokeColor: "#000000", animation: "fade" },
        { id: "t2", text: "Services at 9:00 AM & 11:00 AM", startTime: 1.5, duration: 4.0, positionY: 60, fontSize: 26, color: "#9ca3af", strokeColor: "#000000", animation: "fade" },
      ],
    },
    {
      id: "bible-verse",
      title: "Daily Bible Verse Video",
      category: "Bible Verse Video",
      aspectRatio: "1:1",
      thumbnail: "https://images.unsplash.com/photo-1504052434569-70ad5836ab65?auto=format&fit=crop&w=600&q=80",
      description: "Square video with peaceful background and scripture typography.",
      slides: [
        {
          id: "s1",
          imageUrl: "https://images.unsplash.com/photo-1504052434569-70ad5836ab65?auto=format&fit=crop&w=1200&q=80",
          duration: 7,
          animationType: "pan-right",
          transitionType: "fade",
          backgroundColor: "#18181b",
        },
      ],
      textTracks: [
        { id: "t1", text: "“The Lord is my shepherd; I shall not want.”", startTime: 0.5, duration: 6.0, positionY: 40, fontSize: 30, color: "#ffffff", strokeColor: "#000000", animation: "fade" },
        { id: "t2", text: "— Psalm 23:1", startTime: 2.0, duration: 4.5, positionY: 70, fontSize: 22, color: "#fbbf24", strokeColor: "#000000", animation: "fade" },
      ],
    },
  ];

  res.json({ success: true, templates });
});

// START EXPRESS SERVER & VITE INTEGRATION
async function startServer() {
  app.use(express.static(process.cwd()));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Vivid Studio server running on http://localhost:${PORT}`);
  });
}

startServer();
