import { 
  loginUser, 
  registerUser, 
  loginGuest, 
  logoutUser, 
  watchAuthState, 
  saveProject, 
  fetchUserProjects, 
  deleteUserProject 
} from "./firebase.js";
import { runPythonWebCode, SAMPLE_PYTHON_SCRIPTS } from "./python-web.js";

// Global App State
const state = {
  user: null,
  activeTab: "home", // home, editor, python, projects, templates
  projects: [],
  currentProject: createNewProject("Untitled Video"),
  isGeneratingAI: false,
  isPlaying: false,
  currentSlideIndex: 0,
  playbackTime: 0,
  playbackInterval: null,
  pythonCode: SAMPLE_PYTHON_SCRIPTS.video_calculator,
  pythonOutput: "",
  isPythonRunning: false,
  templates: []
};

function createNewProject(title = "New Slideshow Video") {
  return {
    id: `proj_${Date.now()}`,
    title,
    aspectRatio: "16:9",
    slides: [
      {
        id: "slide_1",
        imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80",
        duration: 4,
        animationType: "zoom-in",
        transitionType: "fade",
        backgroundColor: "#0d0e15",
        caption: "Welcome to Vivid Studio",
        voiceScript: "Welcome to Vivid Studio AI."
      },
      {
        id: "slide_2",
        imageUrl: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1200&q=80",
        duration: 4,
        animationType: "pan-right",
        transitionType: "slide-left",
        backgroundColor: "#0d0e15",
        caption: "Create Videos & Run Python on Web",
        voiceScript: "Create videos and execute Python on web."
      }
    ],
    textTracks: [
      { id: "text_1", text: "Vivid Studio AI", startTime: 0, duration: 3.5, positionY: 50, fontSize: 36, color: "#ffffff", strokeColor: "#000000" },
      { id: "text_2", text: "Powered by Firebase & Python Web", startTime: 4, duration: 3.5, positionY: 50, fontSize: 28, color: "#f59e0b", strokeColor: "#000000" }
    ],
    updatedAt: new Date().toISOString()
  };
}

// Initialization
document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  setupAuth();
  setupGeneratorForm();
  setupEditorControls();
  setupPythonStudio();
  loadTemplates();
  renderApp();

  // Watch Firebase Auth
  watchAuthState(async (user) => {
    state.user = user;
    renderUserUI();
    if (user) {
      state.projects = await fetchUserProjects(user.uid);
    } else {
      state.projects = [];
    }
    renderProjectsList();
  });
});

// UI Navigation
function setupNavigation() {
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      setActiveTab(targetTab);
    });
  });
}

function setActiveTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll(".tab-content").forEach((el) => {
    el.classList.add("hidden");
  });
  const targetEl = document.getElementById(`tab-${tabName}`);
  if (targetEl) targetEl.classList.remove("hidden");

  document.querySelectorAll("[data-tab]").forEach((btn) => {
    if (btn.getAttribute("data-tab") === tabName) {
      btn.classList.add("bg-amber-500/10", "text-amber-500", "border-amber-500/30");
      btn.classList.remove("text-zinc-400");
    } else {
      btn.classList.remove("bg-amber-500/10", "text-amber-500", "border-amber-500/30");
      btn.classList.add("text-zinc-400");
    }
  });

  if (tabName === "editor") renderEditor();
  if (tabName === "projects") renderProjectsList();
}

// Authentication Handlers
function setupAuth() {
  const loginBtn = document.getElementById("btn-login-open");
  const modal = document.getElementById("auth-modal");
  const modalClose = document.getElementById("auth-modal-close");
  const authForm = document.getElementById("auth-form");
  const guestBtn = document.getElementById("btn-guest-login");
  const logoutBtn = document.getElementById("btn-logout");

  if (loginBtn) loginBtn.addEventListener("click", () => modal.classList.remove("hidden"));
  if (modalClose) modalClose.addEventListener("click", () => modal.classList.add("hidden"));

  if (authForm) {
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("auth-email").value;
      const pass = document.getElementById("auth-password").value;
      const isRegister = document.getElementById("auth-is-register").checked;
      const errorMsg = document.getElementById("auth-error");
      errorMsg.textContent = "Processing...";

      const res = isRegister ? await registerUser(email, pass) : await loginUser(email, pass);
      if (res.success) {
        modal.classList.add("hidden");
        errorMsg.textContent = "";
      } else {
        errorMsg.textContent = res.error;
      }
    });
  }

  if (guestBtn) {
    guestBtn.addEventListener("click", async () => {
      const res = await loginGuest();
      if (res.success) modal.classList.add("hidden");
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await logoutUser();
    });
  }
}

function renderUserUI() {
  const authStatus = document.getElementById("auth-status-text");
  const userBadge = document.getElementById("user-badge");
  const loginBtn = document.getElementById("btn-login-open");
  const logoutBtn = document.getElementById("btn-logout");

  if (state.user) {
    if (authStatus) authStatus.textContent = state.user.isAnonymous ? "Guest Mode" : state.user.email;
    if (userBadge) userBadge.classList.remove("hidden");
    if (loginBtn) loginBtn.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.remove("hidden");
  } else {
    if (authStatus) authStatus.textContent = "Not logged in";
    if (userBadge) userBadge.classList.add("hidden");
    if (loginBtn) loginBtn.classList.remove("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
  }
}

// AI Generator
function setupGeneratorForm() {
  const form = document.getElementById("ai-generator-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = document.getElementById("gen-prompt").value.trim();
    const aspectRatio = document.getElementById("gen-aspect").value;
    const style = document.getElementById("gen-style").value;
    const numScenes = parseInt(document.getElementById("gen-scenes").value, 10);
    const statusBox = document.getElementById("gen-status");

    if (!prompt) return;

    state.isGeneratingAI = true;
    if (statusBox) {
      statusBox.classList.remove("hidden");
      statusBox.textContent = "✨ Directing video scenes with Gemini AI...";
    }

    try {
      const res = await fetch("/api/ai/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, aspectRatio, style, numScenes })
      });
      const data = await res.json();

      if (!data.success || !data.script) {
        throw new Error(data.error || "Failed to generate script");
      }

      if (statusBox) statusBox.textContent = "🖼️ Generating AI visuals for each slide...";

      // Generate imagery for slides
      const script = data.script;
      const newSlides = [];
      const newTextTracks = [];

      let currentTime = 0;
      for (let i = 0; i < script.scenes.length; i++) {
        const sc = script.scenes[i];
        let imgUrl = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80";

        try {
          const imgRes = await fetch("/api/ai/generate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: sc.imagePrompt, aspectRatio })
          });
          const imgData = await imgRes.json();
          if (imgData.success && imgData.imageUrl) {
            imgUrl = imgData.imageUrl;
          }
        } catch {
          // fallback to stock
        }

        newSlides.push({
          id: `slide_${Date.now()}_${i}`,
          imageUrl: imgUrl,
          duration: sc.duration || 4,
          animationType: sc.animationType || "zoom-in",
          transitionType: sc.transitionType || "fade",
          backgroundColor: script.themeColor || "#0d0e15",
          caption: sc.caption || sc.title,
          voiceScript: sc.voiceScript
        });

        if (sc.title) {
          newTextTracks.push({
            id: `text_${Date.now()}_${i}`,
            text: sc.title.toUpperCase(),
            startTime: currentTime + 0.5,
            duration: (sc.duration || 4) - 0.5,
            positionY: 45,
            fontSize: 34,
            color: "#ffffff",
            strokeColor: "#000000"
          });
        }
        currentTime += sc.duration || 4;
      }

      state.currentProject = {
        id: `proj_${Date.now()}`,
        title: script.title || prompt,
        aspectRatio,
        slides: newSlides,
        textTracks: newTextTracks,
        updatedAt: new Date().toISOString()
      };

      if (state.user) {
        await saveProject(state.user.uid, state.currentProject);
        state.projects = await fetchUserProjects(state.user.uid);
      }

      if (statusBox) {
        statusBox.textContent = "✅ Video created! Launching Studio Editor...";
      }

      setTimeout(() => {
        if (statusBox) statusBox.classList.add("hidden");
        setActiveTab("editor");
      }, 1000);

    } catch (err) {
      if (statusBox) statusBox.textContent = `❌ Error: ${err.message}`;
    } finally {
      state.isGeneratingAI = false;
    }
  });
}

// Studio Editor Controls
function setupEditorControls() {
  const playBtn = document.getElementById("btn-play");
  const saveBtn = document.getElementById("btn-save-project");
  const addSlideBtn = document.getElementById("btn-add-slide");
  const ttsBtn = document.getElementById("btn-generate-tts");

  if (playBtn) playBtn.addEventListener("click", togglePlay);
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      if (!state.user) {
        document.getElementById("auth-modal").classList.remove("hidden");
        return;
      }
      saveBtn.textContent = "Saving to Firebase...";
      const res = await saveProject(state.user.uid, state.currentProject);
      if (res.success) {
        saveBtn.textContent = "✓ Saved to Firebase";
        state.projects = await fetchUserProjects(state.user.uid);
      } else {
        saveBtn.textContent = "❌ Error Saving";
      }
      setTimeout(() => (saveBtn.textContent = "💾 Save to Firebase"), 2000);
    });
  }

  if (addSlideBtn) {
    addSlideBtn.addEventListener("click", () => {
      const newSlide = {
        id: `slide_${Date.now()}`,
        imageUrl: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1200&q=80",
        duration: 4,
        animationType: "zoom-in",
        transitionType: "fade",
        backgroundColor: "#0d0e15",
        caption: "New Slide Caption",
        voiceScript: "New slide narration text"
      };
      state.currentProject.slides.push(newSlide);
      renderEditor();
    });
  }

  if (ttsBtn) {
    ttsBtn.addEventListener("click", async () => {
      const activeSlide = state.currentProject.slides[state.currentSlideIndex];
      if (!activeSlide || !activeSlide.voiceScript) return;

      ttsBtn.textContent = "🎙️ Synthesizing Voice...";
      try {
        const res = await fetch("/api/ai/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: activeSlide.voiceScript })
        });
        const data = await res.json();
        if (data.success && data.audioBase64) {
          const audio = new Audio(`data:${data.mimeType};base64,${data.audioBase64}`);
          audio.play();
          ttsBtn.textContent = "🔊 Playing Audio";
        } else {
          ttsBtn.textContent = "❌ TTS Failed";
        }
      } catch {
        ttsBtn.textContent = "❌ TTS Error";
      }
      setTimeout(() => (ttsBtn.textContent = "🎙️ AI Voice Narration"), 2500);
    });
  }
}

function togglePlay() {
  const playBtn = document.getElementById("btn-play");
  if (state.isPlaying) {
    state.isPlaying = false;
    clearInterval(state.playbackInterval);
    if (playBtn) playBtn.textContent = "▶ Play Video";
  } else {
    state.isPlaying = true;
    if (playBtn) playBtn.textContent = "⏸ Pause Video";
    
    const totalDuration = state.currentProject.slides.reduce((acc, s) => acc + s.duration, 0);
    state.playbackInterval = setInterval(() => {
      state.playbackTime += 0.1;
      if (state.playbackTime >= totalDuration) {
        state.playbackTime = 0;
      }

      // Determine active slide index
      let accumulated = 0;
      for (let i = 0; i < state.currentProject.slides.length; i++) {
        accumulated += state.currentProject.slides[i].duration;
        if (state.playbackTime <= accumulated) {
          state.currentSlideIndex = i;
          break;
        }
      }

      updatePreviewCanvas();
      updateTimelineProgress();
    }, 100);
  }
}

function renderEditor() {
  const titleInput = document.getElementById("editor-project-title");
  if (titleInput) {
    titleInput.value = state.currentProject.title;
    titleInput.oninput = (e) => {
      state.currentProject.title = e.target.value;
    };
  }

  updatePreviewCanvas();
  renderSlidesList();
  renderTimeline();
}

function updatePreviewCanvas() {
  const canvasContainer = document.getElementById("canvas-container");
  if (!canvasContainer) return;

  const slide = state.currentProject.slides[state.currentSlideIndex] || state.currentProject.slides[0];
  if (!slide) return;

  let animClass = "anim-zoom-in";
  if (slide.animationType === "pan-left") animClass = "anim-pan-left";
  if (slide.animationType === "pan-right") animClass = "anim-pan-right";
  if (slide.animationType === "zoom-out") animClass = "anim-zoom-out";

  // Calculate overlay text at current time
  const currentTextTrack = state.currentProject.textTracks.find(
    (t) => state.playbackTime >= t.startTime && state.playbackTime <= t.startTime + t.duration
  );

  canvasContainer.innerHTML = `
    <div class="relative w-full h-full overflow-hidden flex items-center justify-center bg-zinc-950">
      <img src="${slide.imageUrl}" class="w-full h-full object-cover transition-all duration-700 ${animClass}" />
      ${
        slide.caption
          ? `<div class="absolute bottom-6 left-6 right-6 bg-black/60 backdrop-blur-md text-white p-3 rounded-xl text-center text-sm font-medium border border-white/10">
              ${slide.caption}
            </div>`
          : ""
      }
      ${
        currentTextTrack
          ? `<div class="absolute inset-x-4 text-center font-extrabold tracking-wide drop-shadow-lg" style="top: ${currentTextTrack.positionY}%; font-size: ${currentTextTrack.fontSize}px; color: ${currentTextTrack.color}; text-shadow: 2px 2px 4px ${currentTextTrack.strokeColor};">
              ${currentTextTrack.text}
            </div>`
          : ""
      }
    </div>
  `;
}

function renderSlidesList() {
  const container = document.getElementById("slides-list");
  if (!container) return;

  container.innerHTML = state.currentProject.slides
    .map(
      (slide, idx) => `
    <div class="p-3 rounded-xl border ${
      idx === state.currentSlideIndex
        ? "border-amber-500 bg-amber-500/10"
        : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
    } flex items-center gap-3 cursor-pointer" onclick="window.selectSlide(${idx})">
      <img src="${slide.imageUrl}" class="w-14 h-10 rounded-md object-cover" />
      <div class="flex-1 min-w-0">
        <div class="text-xs font-semibold text-white truncate">Slide ${idx + 1}</div>
        <div class="text-[10px] text-zinc-400">${slide.duration}s • ${slide.animationType}</div>
      </div>
      <button class="text-zinc-500 hover:text-red-400 p-1" onclick="event.stopPropagation(); window.deleteSlide(${idx})">🗑</button>
    </div>
  `
    )
    .join("");
}

window.selectSlide = (idx) => {
  state.currentSlideIndex = idx;
  renderEditor();
};

window.deleteSlide = (idx) => {
  if (state.currentProject.slides.length <= 1) return;
  state.currentProject.slides.splice(idx, 1);
  if (state.currentSlideIndex >= state.currentProject.slides.length) {
    state.currentSlideIndex = 0;
  }
  renderEditor();
};

function renderTimeline() {
  const container = document.getElementById("timeline-tracks");
  if (!container) return;

  const totalTime = state.currentProject.slides.reduce((acc, s) => acc + s.duration, 0);

  container.innerHTML = `
    <div class="relative h-16 w-full timeline-track rounded-xl overflow-hidden border border-zinc-800 flex">
      ${state.currentProject.slides
        .map(
          (slide, idx) => `
        <div style="width: ${(slide.duration / totalTime) * 100}%" 
             class="h-full border-r border-zinc-800 p-2 flex flex-col justify-between text-xs overflow-hidden ${
               idx === state.currentSlideIndex ? "bg-amber-500/20" : "bg-zinc-900/80"
             }">
          <span class="font-bold text-zinc-300 text-[10px] truncate">Slide ${idx + 1}</span>
          <span class="text-[9px] text-zinc-500">${slide.duration}s</span>
        </div>
      `
        )
        .join("")}
      <div id="timeline-progress-bar" class="absolute top-0 bottom-0 w-0.5 bg-amber-500 shadow-md" style="left: 0%;"></div>
    </div>
  `;
}

function updateTimelineProgress() {
  const bar = document.getElementById("timeline-progress-bar");
  const totalTime = state.currentProject.slides.reduce((acc, s) => acc + s.duration, 0);
  if (bar && totalTime > 0) {
    const pct = (state.playbackTime / totalTime) * 100;
    bar.style.left = `${pct}%`;
  }
}

// Python Web Studio Setup
function setupPythonStudio() {
  const runBtn = document.getElementById("btn-run-python");
  const editor = document.getElementById("python-code-input");
  const consoleOut = document.getElementById("python-console-output");
  const presetSelect = document.getElementById("python-preset-select");

  if (editor) editor.value = state.pythonCode;

  if (presetSelect) {
    presetSelect.addEventListener("change", (e) => {
      const key = e.target.value;
      if (SAMPLE_PYTHON_SCRIPTS[key]) {
        state.pythonCode = SAMPLE_PYTHON_SCRIPTS[key];
        if (editor) editor.value = state.pythonCode;
      }
    });
  }

  if (runBtn) {
    runBtn.addEventListener("click", async () => {
      if (editor) state.pythonCode = editor.value;
      runBtn.textContent = "🐍 Running Python...";
      if (consoleOut) consoleOut.textContent = "Executing Python WebAssembly script...\n";

      let logs = [];
      const res = await runPythonWebCode(state.pythonCode, (stdout) => {
        logs.push(stdout);
        if (consoleOut) consoleOut.textContent += stdout + "\n";
      });

      if (res.success) {
        if (consoleOut && logs.length === 0) {
          consoleOut.textContent += `✓ Return Value: ${res.result || "(Script finished with no output)"}\n`;
        }
        runBtn.textContent = "▶ Run Python Script";
      } else {
        if (consoleOut) consoleOut.textContent += `❌ Python Error: ${res.error}\n`;
        runBtn.textContent = "▶ Run Python Script";
      }
    });
  }
}

// Templates & Projects List
async function loadTemplates() {
  try {
    const res = await fetch("/api/templates");
    const data = await res.json();
    if (data.success && data.templates) {
      state.templates = data.templates;
      renderTemplatesList();
    }
  } catch {
    // fallback
  }
}

function renderTemplatesList() {
  const container = document.getElementById("templates-grid");
  if (!container) return;

  container.innerHTML = state.templates
    .map(
      (tmpl) => `
    <div class="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden flex flex-col hover:border-amber-500/50 transition-all">
      <img src="${tmpl.thumbnail}" class="w-full h-40 object-cover" />
      <div class="p-4 flex-1 flex flex-col justify-between">
        <div>
          <span class="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full uppercase">${tmpl.category}</span>
          <h3 class="font-bold text-base text-white mt-1">${tmpl.title}</h3>
          <p class="text-xs text-zinc-400 mt-1 line-clamp-2">${tmpl.description}</p>
        </div>
        <button class="mt-4 w-full py-2 bg-zinc-800 hover:bg-amber-500 hover:text-black font-semibold text-xs text-white rounded-xl transition-all" onclick="window.useTemplate('${tmpl.id}')">
          Use Template
        </button>
      </div>
    </div>
  `
    )
    .join("");
}

window.useTemplate = (tmplId) => {
  const tmpl = state.templates.find((t) => t.id === tmplId);
  if (!tmpl) return;

  state.currentProject = {
    id: `proj_${Date.now()}`,
    title: tmpl.title,
    aspectRatio: tmpl.aspectRatio,
    slides: tmpl.slides.map((s) => ({ ...s, id: `slide_${Date.now()}_${Math.random()}` })),
    textTracks: tmpl.textTracks || [],
    updatedAt: new Date().toISOString()
  };

  setActiveTab("editor");
};

function renderProjectsList() {
  const container = document.getElementById("projects-grid");
  if (!container) return;

  if (state.projects.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center text-zinc-400 bg-zinc-900/50 rounded-2xl border border-zinc-800 p-6">
        <p class="font-semibold text-base text-white">No saved projects yet</p>
        <p class="text-xs mt-1">Create a video in the AI Generator or Studio Editor and save to Firebase!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.projects
    .map(
      (proj) => `
    <div class="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-4">
      <div>
        <h4 class="font-bold text-white text-sm">${proj.title}</h4>
        <p class="text-xs text-zinc-500 mt-0.5">${proj.slides ? proj.slides.length : 0} slides • ${proj.aspectRatio || "16:9"}</p>
      </div>
      <div class="flex items-center gap-2">
        <button class="px-3 py-1.5 bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-black text-xs font-semibold rounded-lg transition-all" onclick="window.openProject('${proj.id}')">Open</button>
        <button class="px-2 py-1.5 text-zinc-500 hover:text-red-400 text-xs" onclick="window.removeProject('${proj.id}')">🗑</button>
      </div>
    </div>
  `
    )
    .join("");
}

window.openProject = (projId) => {
  const p = state.projects.find((item) => item.id === projId);
  if (p) {
    state.currentProject = p;
    setActiveTab("editor");
  }
};

window.removeProject = async (projId) => {
  if (!state.user) return;
  await deleteUserProject(state.user.uid, projId);
  state.projects = await fetchUserProjects(state.user.uid);
  renderProjectsList();
};

function renderApp() {
  setActiveTab("home");
}
