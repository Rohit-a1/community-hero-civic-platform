import { db } from "./firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

export interface PredictionInsight {
  landmark: string;
  category: string;
  risk_level: "High" | "Medium" | "Low";
  prediction: string;
  recommended_action: string;
}

export async function fetchPredictiveInsights(): Promise<PredictionInsight[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Use memory filtering as fallback to avoid any index errors
  let querySnapshot;
  try {
    const q = query(
      collection(db, "reports"),
      where("timestamp", ">=", thirtyDaysAgo)
    );
    querySnapshot = await getDocs(q);
  } catch (err) {
    console.warn("Firestore query with timestamp range failed, trying fetch-all fallback:", err);
    const qAll = query(collection(db, "reports"));
    querySnapshot = await getDocs(qAll);
  }

  const reports: { landmark: string; category: string }[] = [];

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    // Support server timestamp / offline cache fallback
    const rawTs = data.timestamp;
    let ts: Date | null = null;
    if (rawTs) {
      if (typeof rawTs.toDate === "function") {
        ts = rawTs.toDate();
      } else {
        ts = new Date(rawTs);
      }
    }
    
    // Default to true if timestamp is missing/null, to be safe
    const isWithin30Days = ts ? ts >= thirtyDaysAgo : true;

    if (isWithin30Days && data.landmark && data.category) {
      reports.push({
        landmark: data.landmark,
        category: data.category,
      });
    }
  });

  if (reports.length === 0) {
    throw new Error("NO_DATA");
  }

  // Group by landmark and category
  const groups: { [key: string]: number } = {};
  reports.forEach((r) => {
    const key = `Landmark: ${r.landmark}, Category: ${r.category}`;
    groups[key] = (groups[key] || 0) + 1;
  });

  // Build the summary string
  const summaryLines = Object.entries(groups).map(
    ([key, count]) => `${key}, Reports in 30 days: ${count}`
  );
  const summaryText = summaryLines.join("\n");

  // Call server-side API endpoint for Gemini
  const response = await fetch("/api/predictive-insights", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ summary: summaryText }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || "Failed to generate predictions");
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("INVALID_JSON");
  }

  return data as PredictionInsight[];
}
