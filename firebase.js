import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  signInAnonymously
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  deleteDoc,
  serverTimestamp
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDemoPlaceholderKeyForStudioApp123",
  authDomain: "vivid-studio-demo.firebaseapp.com",
  projectId: "vivid-studio-demo",
  storageBucket: "vivid-studio-demo.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

// Async load config if present
fetch("./firebase-applet-config.json")
  .then((res) => (res.ok ? res.json() : null))
  .then((data) => {
    if (data && data.apiKey) Object.assign(firebaseConfig, data);
  })
  .catch(() => {});

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

// Authentication Functions
export async function loginUser(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: cred.user };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function registerUser(email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Initialize profile doc
    await setDoc(doc(db, "users", cred.user.uid), {
      email,
      createdAt: new Date().toISOString(),
      role: "creator",
      projectsCount: 0
    });
    return { success: true, user: cred.user };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function loginGuest() {
  try {
    const cred = await signInAnonymously(auth);
    return { success: true, user: cred.user };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function logoutUser() {
  await signOut(auth);
}

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

// Firestore Database Functions
export async function saveProject(userId, projectData) {
  try {
    const projId = projectData.id || `proj_${Date.now()}`;
    const ref = doc(db, "users", userId, "projects", projId);
    const dataToSave = {
      ...projectData,
      id: projId,
      updatedAt: new Date().toISOString()
    };
    await setDoc(ref, dataToSave, { merge: true });
    return { success: true, id: projId };
  } catch (err) {
    console.error("Firebase save error:", err);
    return { success: false, error: err.message };
  }
}

export async function fetchUserProjects(userId) {
  try {
    const q = collection(db, "users", userId, "projects");
    const snapshot = await getDocs(q);
    const projects = [];
    snapshot.forEach((d) => projects.push(d.data()));
    return projects;
  } catch (err) {
    console.error("Firebase fetch error:", err);
    return [];
  }
}

export async function deleteUserProject(userId, projectId) {
  try {
    const ref = doc(db, "users", userId, "projects", projectId);
    await deleteDoc(ref);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
