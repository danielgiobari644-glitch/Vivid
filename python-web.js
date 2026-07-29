// Python on Web Executor using Pyodide (WebAssembly)
let pyodideInstance = null;
let isPyodideLoading = false;

export async function getPyodide() {
  if (pyodideInstance) return pyodideInstance;
  if (isPyodideLoading) {
    while (isPyodideLoading) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return pyodideInstance;
  }

  isPyodideLoading = true;
  try {
    if (window.loadPyodide) {
      pyodideInstance = await window.loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/"
      });
      console.log("Python WebAssembly (Pyodide) loaded successfully!");
    } else {
      throw new Error("Pyodide library script not present on page.");
    }
  } catch (err) {
    console.error("Failed to load Pyodide:", err);
  } finally {
    isPyodideLoading = false;
  }
  return pyodideInstance;
}

export async function runPythonWebCode(code, onStdout) {
  const pyodide = await getPyodide();
  if (!pyodide) {
    throw new Error("Python Web Engine is initializing. Please wait a moment.");
  }

  // Redirect Python sys.stdout to output handler
  pyodide.setStdout({
    batched: (text) => {
      if (onStdout) onStdout(text);
    }
  });

  try {
    const result = await pyodide.runPythonAsync(code);
    return { success: true, result: result !== undefined ? String(result) : "" };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export const SAMPLE_PYTHON_SCRIPTS = {
  video_calculator: `# Python Web Script: Video Scene Timing & Word Count Calculator
scene_scripts = [
  "Welcome to Vivid Studio! Create stunning AI videos effortlessly.",
  "Generate script, narration, and images automatically in seconds.",
  "Export directly to social media or download your project instantly."
]

def analyze_video_timing(scripts, words_per_second=2.5):
    total_words = 0
    scenes_info = []
    
    for idx, script in enumerate(scripts, 1):
        words = len(script.split())
        duration = round(words / words_per_second, 1)
        duration = max(3.0, duration) # Minimum 3s per slide
        total_words += words
        scenes_info.append(f"Scene {idx}: {words} words -> Estimated {duration}s")
        
    total_est_duration = sum([max(3.0, round(len(s.split()) / words_per_second, 1)) for s in scripts])
    
    print("--- PYTHON VIDEO ANALYSIS ---")
    for info in scenes_info:
        print(info)
    print("-----------------------------")
    print(f"Total Video Words: {total_words}")
    print(f"Total Video Duration: {total_est_duration} seconds")
    return total_est_duration

analyze_video_timing(scene_scripts)
`,
  subtitle_generator: `# Python Web Script: Auto Subtitle Formatter & SRT Generator
def generate_srt(scene_texts, slide_duration=4.0):
    srt_output = []
    for idx, text in enumerate(scene_texts, 1):
        start_sec = (idx - 1) * slide_duration
        end_sec = idx * slide_duration
        
        def fmt_time(seconds):
            hrs = int(seconds // 3600)
            mins = int((seconds % 3600) // 60)
            secs = int(seconds % 60)
            millis = int((seconds % 1) * 1000)
            return f"{hrs:02d}:{mins:02d}:{secs:02d},{millis:03d}"
            
        srt_block = f"{idx}\\n{fmt_time(start_sec)} --> {fmt_time(end_sec)}\\n{text}\\n"
        srt_output.append(srt_block)
        
    full_srt = "\\n".join(srt_output)
    print("--- GENERATED SRT SUBTITLES ---")
    print(full_srt)
    return full_srt

lines = [
    "Transform ideas into viral videos.",
    "Powered by AI & Web Python.",
    "Save to Firebase instantly!"
]
generate_srt(lines)
`,
  text_cleaner: `# Python Web Script: Text Hashtag & Title Optimizer
import re

def optimize_social_caption(title, topic):
    clean_title = title.strip().title()
    keywords = re.findall(r'\\w+', topic.lower())
    hashtags = " ".join([f"#{w}" for w in keywords if len(w) > 3])
    
    output = f"🔥 {clean_title} 🔥\\n\\nCreated with #VividStudio #AI #PythonWeb\\n{hashtags}"
    print("--- SOCIAL MEDIA CAPTION ---")
    print(output)
    return output

optimize_social_caption("Top 5 Travel Destinations for 2026", "travel adventure vacation aesthetic reels")
`
};
