# GIODAI - Turn Images Into Cinematic Videos

GIODAI is a premium AI-powered creative platform that transforms images into professional videos with Ken Burns effects, smooth transitions, text overlays, and background music.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, Vanilla JavaScript |
| Backend | Python, FastAPI, MoviePy, Pillow, OpenCV, NumPy |
| Auth & Database | Firebase Authentication, Cloud Firestore |
| Frontend Hosting | Netlify |
| Backend Hosting | Any Python PaaS (Render, Railway, Heroku) |

---

## Project Structure

```
giodai/
├── frontend/
│   ├── index.html              # Landing page
│   ├── dashboard.html           # Main dashboard app
│   ├── editor.html              # Video editor workspace
│   ├── css/
│   │   ├── variables.css        # Design system tokens
│   │   ├── main.css             # Base styles & components
│   │   ├── auth.css             # Authentication pages
│   │   ├── dashboard.css        # Dashboard layout & pages
│   │   ├── editor.css           # Video editor workspace
│   │   └── components.css       # Reusable components
│   ├── js/
│   │   ├── firebase-init.js     # Firebase initialization
│   │   ├── utils.js             # Utility functions
│   │   ├── auth.js              # Authentication logic
│   │   ├── dashboard.js         # Dashboard page rendering
│   │   └── editor.js            # Video editor logic
│   ├── auth/
│   │   ├── login.html           # Sign in page
│   │   ├── register.html        # Create account page
│   │   └── forgot-password.html # Password reset page
│   ├── netlify.toml             # Netlify configuration
│   └── _redirects               # Netlify redirects
├── backend/
│   ├── main.py                  # FastAPI application entry
│   ├── config.py                # Environment configuration
│   ├── requirements.txt         # Python dependencies
│   ├── Procfile                 # Process definition for hosting
│   ├── runtime.txt              # Python version
│   ├── routes/
│   │   ├── auth.py              # Authentication endpoints
│   │   ├── projects.py          # Project CRUD endpoints
│   │   ├── templates.py         # Template endpoints
│   │   └── video.py              # Video rendering endpoints
│   ├── services/
│   │   ├── video_renderer.py    # MoviePy rendering engine
│   │   ├── image_processor.py   # Pillow image processing
│   │   └── audio_processor.py   # Audio processing
│   └── models/
│       └── schemas.py           # Pydantic models
├── firestore.rules              # Firestore security rules
├── firestore.indexes.json       # Firestore composite indexes
├── firebase.json                # Firebase hosting config
├── .firebaserc                   # Firebase project config
├── database-schema.md           # Database documentation
├── .env.example                 # Environment variables template
└── README.md                    # This file
```

---

## Features

- **Image to Video**: Upload images and create professional videos
- **Ken Burns Effects**: Smooth zoom and pan animations
- **Transitions**: Fade, slide, blur, and crossfade between images
- **Text Editor**: Titles, captions, subtitles with fonts, colors, shadows, outlines
- **Audio**: Upload music, volume control, fade in/out, trimming
- **Templates**: Pre-built templates for YouTube, TikTok, Instagram, and more
- **Export**: MP4 in 720p, 1080p, or 4K
- **Aspect Ratios**: 16:9, 9:16, 1:1, 4:5, 3:2
- **Dark/Light Mode**: Full theme support
- **Responsive**: Works on desktop, tablet, and mobile
- **Undo/Redo**: Full history management
- **Auto-Save**: Automatic project saving

---

## Deployment

### Prerequisites

- A [Netlify](https://netlify.com) account
- A [Python hosting platform](https://render.com) account (Render, Railway, etc.)
- Firebase project configured (already set up for you)

### Step 1: Deploy Frontend to Netlify

1. Push the `frontend/` folder to a GitHub repository
2. Go to [Netlify](https://app.netlify.com)
3. Click **New site from Git**
4. Select your repository
5. Set the **Publish directory** to `frontend`
6. Click **Deploy site**
7. Your frontend is now live!

### Step 2: Deploy Backend

1. Push the `backend/` folder to a GitHub repository (can be the same repo)
2. Go to your Python hosting platform (e.g., [Render](https://render.com))
3. Create a new **Web Service**
4. Connect your GitHub repository
5. Set the **Root Directory** to `backend`
6. The platform will automatically install dependencies from `requirements.txt`
7. Add the following **Environment Variables** from your Firebase service account:
   - `FIREBASE_PROJECT_ID=giodai`
   - `FIREBASE_PRIVATE_KEY` (your service account private key)
   - `FIREBASE_CLIENT_EMAIL` (your service account email)
   - `FIREBASE_WEB_API_KEY=AIzaSyCsYhrSKrCRfxGnsx7NHNESalMc4fEUiTU`
8. Deploy!

### Step 3: Configure Firebase

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select the **giodai** project
3. Go to **Firestore Database** > **Rules** tab
4. Paste the contents of `firestore.rules`
5. Go to **Firestore Database** > **Indexes** tab
6. Click **Create missing indexes** (or deploy `firestore.indexes.json` via Firebase CLI)
7. Go to **Authentication** > **Sign-in method**
8. Enable **Email/Password** and **Google** sign-in providers

### Step 4: Connect Frontend to Backend

1. Get your backend URL (e.g., `https://giodai-backend.onrender.com`)
2. In the GIODAI dashboard, go to **Settings**
3. Set the **Backend URL** to your deployed backend URL
4. The app will use this URL for all API calls

---

## Firebase Configuration

The app is pre-configured with the following Firebase project:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyCsYhrSKrCRfxGnsx7NHNESalMc4fEUiTU",
  authDomain: "giodai.firebaseapp.com",
  projectId: "giodai",
  storageBucket: "giodai.firebasestorage.app",
  messagingSenderId: "479061806124",
  appId: "1:479061806124:web:ce8dbcf3f7b7a104ba5589",
  measurementId: "G-FX7SECG3ZB"
};
```

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Sign in |
| POST | /api/auth/google | Google sign-in |
| POST | /api/auth/reset-password | Password reset |
| GET | /api/auth/me | Get current user |
| PUT | /api/auth/me | Update profile |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/projects | List projects |
| POST | /api/projects | Create project |
| GET | /api/projects/{id} | Get project |
| PUT | /api/projects/{id} | Update project |
| DELETE | /api/projects/{id} | Delete project |
| POST | /api/projects/{id}/duplicate | Duplicate project |

### Templates
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/templates | List templates |
| GET | /api/templates/{id} | Get template |
| GET | /api/templates/categories | List categories |

### Video
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/video/render | Start rendering |
| GET | /api/video/status/{id} | Check render status |
| POST | /api/video/upload-image | Upload image |
| POST | /api/video/upload-audio | Upload audio |

---

## Database Schema

See [database-schema.md](database-schema.md) for the complete Firestore schema documentation.

---

## License

MIT