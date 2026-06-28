import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

export interface UserProfile {
  userId: string;
  streakCount: number;
  lastActiveDate: string; // YYYY-MM-DD
  name?: string;
  age?: string;
  photoUrl?: string;
  role?: string;
  phoneNumber?: string;
  signupDate?: string;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  if (!userId) return null;
  
  // Sandbox users are purely local mock profiles stored in client storage
  if (userId.startsWith("sandbox_")) {
    return null; // Triggers immediate safe local storage fallback
  }

  try {
    const docRef = doc(db, "users", userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.warn("Firestore getUserProfile error (falling back to local storage):", error);
    return null;
  }
}

export async function updateUserStreak(userId: string): Promise<UserProfile | null> {
  if (!userId) return null;

  // Sandbox users use client-side storage only
  if (userId.startsWith("sandbox_")) {
    return null; // Triggers immediate safe local storage fallback
  }

  try {
    const docRef = doc(db, "users", userId);
    const docSnap = await getDoc(docRef);
    
    // Get current local date in YYYY-MM-DD format
    const today = new Date();
    const currentDateStr = today.toLocaleDateString("en-CA"); // Always YYYY-MM-DD
    
    // Get yesterday's date in YYYY-MM-DD format
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const yesterdayDateStr = yesterday.toLocaleDateString("en-CA");
    
    let currentProfile: UserProfile;
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      const lastActiveDate = data.lastActiveDate || "";
      const currentStreak = data.streakCount || 0;
      
      if (lastActiveDate === currentDateStr) {
        // Already performed an action today, streak is maintained but not incremented
        currentProfile = {
          userId,
          streakCount: currentStreak,
          lastActiveDate: currentDateStr,
        };
      } else if (lastActiveDate === yesterdayDateStr) {
        // Action performed yesterday, so streak continues!
        currentProfile = {
          userId,
          streakCount: currentStreak + 1,
          lastActiveDate: currentDateStr,
        };
        await setDoc(docRef, currentProfile, { merge: true });
      } else {
        // Last action was older than yesterday, or streak was broken. Start/Reset streak at 1.
        currentProfile = {
          userId,
          streakCount: 1,
          lastActiveDate: currentDateStr,
        };
        await setDoc(docRef, currentProfile, { merge: true });
      }
    } else {
      // First time ever performing an action! Create profile and set streak to 1.
      currentProfile = {
        userId,
        streakCount: 1,
        lastActiveDate: currentDateStr,
      };
      await setDoc(docRef, currentProfile, { merge: true });
    }
    
    return currentProfile;
  } catch (error) {
    console.warn("Firestore updateUserStreak error (falling back to local storage):", error);
    return null;
  }
}

export async function safeUpdateUserStreak(userId: string): Promise<UserProfile | null> {
  try {
    const profile = await updateUserStreak(userId);
    if (profile) {
      const localKey = `civic_hero_streak_${userId}`;
      localStorage.setItem(localKey, JSON.stringify(profile));
      return profile;
    }
  } catch (e) {
    console.warn("Failed to update user streak in Firestore, running with local storage fallback:", e);
  }

  // Local storage backup for offline, sandbox, or restricted Firestore roles
  const localKey = `civic_hero_streak_${userId}`;
  const today = new Date();
  const currentDateStr = today.toLocaleDateString("en-CA");
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const yesterdayDateStr = yesterday.toLocaleDateString("en-CA");
  
  const saved = localStorage.getItem(localKey);
  let currentStreak = 0;
  let lastActiveDate = "";
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      currentStreak = parsed.streakCount || 0;
      lastActiveDate = parsed.lastActiveDate || "";
    } catch (_) {}
  }
  
  let updatedProfile: UserProfile;
  if (lastActiveDate === currentDateStr) {
    updatedProfile = { userId, streakCount: currentStreak, lastActiveDate: currentDateStr };
  } else if (lastActiveDate === yesterdayDateStr) {
    updatedProfile = { userId, streakCount: currentStreak + 1, lastActiveDate: currentDateStr };
  } else {
    updatedProfile = { userId, streakCount: 1, lastActiveDate: currentDateStr };
  }
  localStorage.setItem(localKey, JSON.stringify(updatedProfile));
  return updatedProfile;
}

export async function safeGetUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const profile = await getUserProfile(userId);
    if (profile) {
      const localKey = `civic_hero_streak_${userId}`;
      localStorage.setItem(localKey, JSON.stringify(profile));
      return profile;
    }
  } catch (e) {
    console.warn("Failed to get user profile from Firestore, using local fallback:", e);
  }
  
  // Fallback to local storage for robust sandbox usage
  const localKey = `civic_hero_streak_${userId}`;
  const saved = localStorage.getItem(localKey);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (_) {}
  }
  return null;
}
