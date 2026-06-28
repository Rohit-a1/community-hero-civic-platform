import React, { useState } from "react";
import { db, storage } from "../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadString, getDownloadURL, uploadBytes } from "firebase/storage";
import { Camera, MapPin, Check, Sparkles, RefreshCw, AlertCircle, Bookmark } from "lucide-react";
import { CivicIssueCategory, GPSLocation } from "../types";
import CameraCapture from "./CameraCapture";

interface ReportFormProps {
  userId: string;
  onReportSubmitted: () => void;
}

const COMMON_LANDMARKS = [
  "Central Market",
  "Town Hall Square",
  "Metro Station Main Gate",
  "Civic Hospital Junction",
  "District Public Library",
  "City Stadium Parking",
  "High Street Intersection"
];

const ISSUE_CATEGORIES: { value: CivicIssueCategory; label: string; description: string; emoji: string }[] = [
  { value: "Pothole", label: "Pothole", description: "Damaged road, craters, cracks", emoji: "🕳️" },
  { value: "Water Leak", label: "Water Leak", description: "Burst pipe, overflow, pooling water", emoji: "💧" },
  { value: "Broken Light", label: "Broken Streetlight", description: "Dark street, flickering light, damaged post", emoji: "💡" },
  { value: "Waste Problem", label: "Waste Problem", description: "Uncollected garbage, litter, illegal dumping", emoji: "🗑️" },
  { value: "Other", label: "Other", description: "Other general public safety/civic problems", emoji: "⚠️" }
];

export default function ReportForm({ userId, onReportSubmitted }: ReportFormProps) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [gps, setGps] = useState<GPSLocation | null>(null);
  const [landmark, setLandmark] = useState("");
  const [category, setCategory] = useState<CivicIssueCategory>("Pothole");
  const [severity, setSeverity] = useState<'Low' | 'Medium' | 'High' | 'Critical'>("Medium");
  const [aiDescription, setAiDescription] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [citizenDescription, setCitizenDescription] = useState("");
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionPhase, setSubmissionPhase] = useState<"idle" | "uploading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleCapture = async (photoBase64: string, gpsCoords: GPSLocation, vBlob?: Blob | null) => {
    setPhoto(photoBase64);
    setGps(gpsCoords);
    setVideoBlob(vBlob || null);
    setIsCameraOpen(false);
    setError(null);
    setIsAnalyzing(true);
    setCategory("Other");
    setSeverity("Medium");
    setAiDescription("");

    try {
      const analyzeRes = await fetch("/api/analyze-issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ photo: photoBase64 }),
      });

      if (analyzeRes.ok) {
        const analysis = await analyzeRes.json();
        if (analysis.category) {
          setCategory(analysis.category as CivicIssueCategory);
        }
        if (analysis.severity) {
          setSeverity(analysis.severity as 'Low' | 'Medium' | 'High' | 'Critical');
        }
        if (analysis.description) {
          setAiDescription(analysis.description);
        }
      } else {
        console.warn("AI analysis returned non-ok status, defaulting to Other choice.");
        setCategory("Other");
        setSeverity("Medium");
        setAiDescription("Civic hazard reported.");
      }
    } catch (aiErr) {
      console.warn("Failed to contact AI service for auto-classification:", aiErr);
      setCategory("Other");
      setSeverity("Medium");
      setAiDescription("Civic hazard reported.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSelectLandmark = (name: string) => {
    setLandmark(name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo) {
      setError("Please capture a live photo of the issue first.");
      return;
    }
    if (!gps) {
      setError("GPS coordinates are missing. Please re-capture photo with location enabled.");
      return;
    }
    if (!landmark.trim()) {
      setError("Please specify or select a nearby landmark.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSubmissionPhase("uploading");

    let finalPhotoUrl = "";
    let finalVideoUrl = "";

    try {
      const timestampVal = Date.now();
      
      // 1. Attempt upload to Firebase Storage
      try {
        const photoPath = `reports/${userId}_${timestampVal}.jpg`;
        const reportImageRef = ref(storage, photoPath);
        
        // Define a timeout promise to prevent hanging in iframe/sandbox or unconfigured storage environments
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Firebase Storage upload timed out")), 4000)
        );

        // Run upload and get download URL in a single promise flow
        const uploadProcess = async () => {
          const uploadResult = await uploadString(reportImageRef, photo, "data_url");
          return await getDownloadURL(uploadResult.ref);
        };

        // Race the upload against our 4-second timeout
        finalPhotoUrl = await Promise.race([uploadProcess(), timeoutPromise]);
        console.log("Photo uploaded successfully to storage:", finalPhotoUrl);

        // If there is a video blob, upload it too
        if (videoBlob) {
          const videoPath = `reports/${userId}_${timestampVal}.webm`;
          const reportVideoRef = ref(storage, videoPath);
          
          const uploadVideoProcess = async () => {
            const uploadResult = await uploadBytes(reportVideoRef, videoBlob);
            return await getDownloadURL(uploadResult.ref);
          };

          finalVideoUrl = await Promise.race([uploadVideoProcess(), timeoutPromise]);
          console.log("Video uploaded successfully to storage:", finalVideoUrl);
        }
      } catch (storageErr) {
        console.warn("Firebase Storage upload failed, falling back to database base64 storage:", storageErr);
        // Fallback: Use direct base64 data URL in Firestore so the app never fails!
        finalPhotoUrl = photo;
        
        if (videoBlob) {
          try {
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = () => resolve("");
            });
            reader.readAsDataURL(videoBlob);
            finalVideoUrl = await base64Promise;
          } catch (readErr) {
            console.error("Failed to read video blob as data url fallback:", readErr);
          }
        }
      }

      setSubmissionPhase("saving");

      // 2. Save report to Firestore reports collection
      const reportData: any = {
        userId: userId,
        photoUrl: finalPhotoUrl,
        gps: {
          latitude: gps.latitude,
          longitude: gps.longitude,
        },
        landmark: landmark.trim(),
        category: category,
        status: "Reported",
        timestamp: serverTimestamp(),
        aiDescription: aiDescription || "Civic hazard reported.",
        citizenDescription: citizenDescription.trim() || "",
        severity: severity,
        upvote_count: 0,
        downvote_count: 0,
        upvotedBy: [],
        downvotedBy: [],
      };

      if (finalVideoUrl) {
        reportData.video_url = finalVideoUrl;
        reportData.videoUrl = finalVideoUrl;
      }

      await addDoc(collection(db, "reports"), reportData);
      
      // Dispatch civic action event to increment user streak
      window.dispatchEvent(new CustomEvent("civic-action", { detail: { userId } }));
      
      setSuccess(true);
      setPhoto(null);
      setVideoBlob(null);
      setGps(null);
      setLandmark("");
      setCategory("Pothole");
      setSeverity("Medium");
      setAiDescription("");
      setCitizenDescription("");
      
      // Auto-dismiss success and refresh list
      setTimeout(() => {
        setSuccess(false);
        onReportSubmitted();
      }, 2000);

    } catch (err: any) {
      console.error("Firestore submission error:", err);
      setError(err.message || "Failed to submit civic report. Please check database permissions.");
    } finally {
      setIsSubmitting(false);
      setSubmissionPhase("idle");
    }
  };

  return (
    <div id="report_form_container" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 md:p-6">
      <div className="flex items-center gap-2 mb-6">
        <Sparkles className="h-5 w-5 text-blue-600" />
        <h3 className="font-sans text-lg font-semibold tracking-tight text-slate-900">
          Report Civic Issue
        </h3>
      </div>

      {error && (
        <div id="form_error_alert" className="mb-5 p-4 bg-rose-50 border-l-4 border-rose-500 rounded-r-lg flex gap-3 text-rose-700 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div id="form_success_alert" className="mb-5 p-4 bg-emerald-50 border-l-4 border-emerald-500 rounded-r-lg flex items-center gap-3 text-emerald-800 text-sm font-medium">
          <Check className="h-5 w-5 shrink-0 text-emerald-600 animate-bounce" />
          <span>Thank you! Your civic report has been submitted successfully.</span>
        </div>
      )}

      <form id="civic_report_form" onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Camera Live Capture */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            1. Evidence (Live Camera / Video Only)
          </label>
          
          {photo ? (
            <div id="preview_frame" className="relative h-64 w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 group shadow-inner">
              <img
                id="photo_preview_img"
                src={photo}
                alt="Captured issue preview"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              
              {videoBlob && (
                <div id="video_evidence_badge" className="absolute top-3 left-3 bg-red-600/90 text-white px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 shadow border border-red-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  <span>Video Captured</span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  id="btn_relaunch_camera"
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className="py-2 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-medium text-xs shadow-lg transition flex items-center gap-1.5"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Retake Photo
                </button>
              </div>
              {gps && (
                <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-mono text-white flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-emerald-400" />
                  <span>{gps.latitude.toFixed(5)}, {gps.longitude.toFixed(5)}</span>
                </div>
              )}
            </div>
          ) : (
            <button
              id="btn_open_camera"
              type="button"
              onClick={() => setIsCameraOpen(true)}
              className="w-full h-44 border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/10 rounded-2xl flex flex-col items-center justify-center text-slate-500 transition-all gap-2 group cursor-pointer"
            >
              <div className="p-3 rounded-full bg-slate-100 group-hover:bg-blue-50 text-slate-600 group-hover:text-blue-600 transition-colors">
                <Camera className="h-6 w-6" />
              </div>
              <span className="text-sm font-medium text-slate-700 group-hover:text-blue-700">Open Live Camera</span>
              <span className="text-xs text-slate-400">Launches camera to capture issue & GPS</span>
            </button>
          )}
        </div>

        {/* Optional Additional Details */}
        <div>
          <label htmlFor="citizen_description_input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            Additional Details (Optional)
          </label>
          <textarea
            id="citizen_description_input"
            rows={3}
            placeholder="Provide any additional details or context about the issue in your own words..."
            value={citizenDescription}
            onChange={(e) => setCitizenDescription(e.target.value)}
            className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs text-slate-800 transition placeholder:text-slate-400"
          />
        </div>

        {/* Step 2: Issue Category (Auto-Detected by Gemini) */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2.5">
            2. Issue Category & AI Description
          </label>
          
          {isAnalyzing ? (
            <div id="ai_analyzing_state" className="p-4 bg-blue-50 border border-blue-200/50 rounded-2xl flex items-center gap-3 text-blue-800 text-xs font-semibold animate-pulse shadow-sm">
              <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
              <span>Gemini AI is analyzing the photo to detect the category...</span>
            </div>
          ) : photo ? (
            <div id="ai_classified_state" className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-2.5 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI Classification Results</span>
                <span className="bg-blue-100 text-blue-800 font-extrabold text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5" /> Auto-Detected
                </span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-3xl select-none">
                  {category === "Pothole" && "🕳️"}
                  {category === "Water Leak" && "💧"}
                  {category === "Broken Light" && "💡"}
                  {category === "Waste Problem" && "🗑️"}
                  {category === "Other" && "⚠️"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-800 flex items-center gap-1.5 flex-wrap">
                    Category: <span className="text-blue-600 font-extrabold">{category === "Broken Light" ? "Broken Streetlight" : category}</span>
                    <span className="text-slate-300">|</span>
                    Severity: 
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                      severity === "Critical" ? "bg-rose-100 text-rose-800 border border-rose-200" :
                      severity === "High" ? "bg-amber-100 text-amber-800 border border-amber-200" :
                      severity === "Medium" ? "bg-yellow-100 text-yellow-800 border border-yellow-200" :
                      "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    }`}>
                      {severity}
                    </span>
                  </p>
                  {aiDescription ? (
                    <p className="text-xs text-slate-500 mt-1 italic leading-relaxed">
                      "{aiDescription}"
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1 italic">
                      Detecting problem description...
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div id="ai_empty_state" className="p-4 border border-dashed border-slate-200 rounded-2xl text-center text-slate-400 text-xs">
              Capture a live photo above to let Gemini AI automatically detect the category and generate the description.
            </div>
          )}
        </div>

        {/* Step 3: Landmark selection/type */}
        <div>
          <label htmlFor="landmark_input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            3. Nearby Landmark
          </label>
          <div className="space-y-2.5">
            <input
              id="landmark_input"
              type="text"
              placeholder="Type landmark (e.g., Near Red Maple Coffee, 5th Avenue)"
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              required
              className="block w-full px-3 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-slate-950 transition-colors"
            />
            
            {/* Quick Landmark list */}
            <div>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">
                Or Quick Select Common Landmarks
              </p>
              <div id="landmark_chips" className="flex flex-wrap gap-1.5">
                {COMMON_LANDMARKS.map((name) => (
                  <button
                    key={name}
                    id={`landmark_chip_${name.toLowerCase().replace(/\s/g, "_")}`}
                    type="button"
                    onClick={() => handleSelectLandmark(name)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                      landmark === name
                        ? "bg-slate-950 border-slate-950 text-white"
                        : "bg-white border-slate-200 hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          id="btn_submit_report"
          type="submit"
          disabled={isSubmitting || isAnalyzing || !photo || !gps || !landmark.trim()}
          className="w-full py-4 px-4 border border-transparent rounded-xl shadow-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              {submissionPhase === "uploading" && "Uploading evidence photo..."}
              {submissionPhase === "saving" && "Filing report to Civic Desk..."}
              {submissionPhase === "idle" && "Submitting Report..."}
            </>
          ) : isAnalyzing ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              AI Analyzing Photo...
            </>
          ) : (
            "Submit Civic Report"
          )}
        </button>
      </form>

      {/* Camera Capture Modal Overlay */}
      {isCameraOpen && (
        <CameraCapture
          onCapture={handleCapture}
          onCancel={() => setIsCameraOpen(false)}
        />
      )}
    </div>
  );
}
