# Vivid Studio - Professional AI Image-to-Video Creator 🚀

Vivid Studio is a complete, production-ready web application for creating videos from images, featuring an interactive multi-track timeline editor, Ken Burns pan & zoom animations, transition effects, AI script & voice narration via Google Gemini, pre-built templates, and complete Firebase synchronization.

---

## 🌟 Key Features

- **Multi-Track Studio Timeline Editor**: Visual playhead, tracks for Images, Text Overlays, and Audio narration.
- **Ken Burns & Animation FX**: Pan Left, Pan Right, Zoom In, Zoom Out, Spiral Zoom, Fade, Slide, and Blur transitions.
- **Aspect Ratio Selector**: 16:9 (YouTube/Landscape), 9:16 (Shorts/TikTok/Reels), 1:1 (Square), 4:5 (Instagram), 3:2 (Classic).
- **AI Scene & Script Wizard**: Describe any video idea, and Gemini automatically generates scenes, titles, captions, image prompts, and narration scripts.
- **AI Voice Narration (TTS)**: High-quality natural voice generation powered by Gemini TTS preview models.
- **AI Image Generator**: Generate custom high-resolution slide backgrounds directly inside the editor.
- **Templates Library**: Pre-seeded editable templates for YouTube Shorts, TikTok, Instagram Reels, Church Announcements, Event Promos, Bible Verses, Quotes, and Worship Backgrounds.
- **Firebase Authentication & Firestore**: Secure user profiles, project autosave, templates library, and recent exported video metadata.
- **Client & Server Video Rendering**: Instant client-side HTML5 Canvas + MediaRecorder export plus Python FastAPI MoviePy server endpoints.

---

## 🌐 Deploying Directly from GitHub (Zero Local Setup)

This repository is built for **100% cloud deployment** directly from GitHub. You do **NOT** need Node.js, Python, Docker, FFmpeg, or any CLI tools on your personal computer.

### Option A: Frontend Deployment on Netlify

1. Push this repository to your **GitHub** account.
2. Log into [Netlify](https://netlify.com) and click **Add new site** -> **Import an existing project**.
3. Select your GitHub repository.
4. Netlify will auto-detect the Vite build:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
5. In Netlify Site Settings -> **Environment variables**, add:
   - `GEMINI_API_KEY`: Your Gemini API key from Google AI Studio.
6. Click **Deploy Site**! Your studio frontend is live.

### Option B: Python Backend Rendering Engine on Render / Railway

If you wish to host the dedicated Python MoviePy rendering server:

1. Connect your GitHub repository to [Render.com](https://render.com) or [Railway.app].
2. Create a new **Web Service** pointing to the `/backend` folder.
3. Render will auto-detect Python using `backend/runtime.txt` and `backend/requirements.txt`.
4. Set the start command to:
   ```bash
   gunicorn -w 2 -k uvicorn.workers.UvicornWorker main:app
   ```
5. Click **Deploy**!

---

## 🔒 Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com).
2. Create a project and enable **Authentication** (Email/Password & Google) and **Firestore Database**.
3. Copy your web app credentials into `src/lib/firebase.ts` (or set environment variables).
4. Apply the included `firestore.rules` for security.

---

## 📄 License

Apache-2.0 License.
