import React, { useState, useEffect } from "react";
import { db, storage, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { CivicReport, CivicIssueCategory, GPSLocation } from "../types";
import { 
  CheckCircle, 
  Clock, 
  MapPin, 
  Filter, 
  ArrowUpDown, 
  Upload, 
  Camera, 
  Check, 
  X, 
  AlertCircle, 
  Loader2, 
  ChevronRight, 
  Eye,
  RefreshCw,
  Image as ImageIcon
} from "lucide-react";
import CameraCapture from "./CameraCapture";
import IssueTimeline from "./IssueTimeline";

interface MunicipalPortalProps {
  currentUserId: string;
  userRole: "citizen" | "municipal" | "government";
}

export default function MunicipalPortal({ currentUserId, userRole }: MunicipalPortalProps) {
  const [reports, setReports] = useState<CivicReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Sorting State
  const [statusFilter, setStatusFilter] = useState<"Verified" | "In Progress" | "All">("All");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "votes">("newest");

  // Resolution Proof Flow State
  const [resolvingReportId, setResolvingReportId] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);
  const [resolvedGps, setResolvedGps] = useState<GPSLocation | null>(null);
  const [resolvedAt, setResolvedAt] = useState<Date | null>(null);
  const [isSubmittingResolution, setIsSubmittingResolution] = useState(false);
  const [uploadProgressPhase, setUploadProgressPhase] = useState<string | null>(null);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // Fetch reports in "Verified" or "In Progress" status
  useEffect(() => {
    setLoading(true);
    setError(null);

    // Fetch both 'Verified' and 'In Progress' reports so municipal staff can transition them
    const q = query(
      collection(db, "reports"),
      where("status", "in", ["Verified", "In Progress"])
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: CivicReport[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            userId: data.userId,
            photoUrl: data.photoUrl,
            gps: data.gps,
            landmark: data.landmark,
            category: data.category,
            status: data.status,
            timestamp: data.timestamp ? data.timestamp.toDate() : new Date(),
            aiDescription: data.aiDescription,
            upvote_count: data.upvote_count || 0,
            downvote_count: data.downvote_count || 0,
            upvotedBy: data.upvotedBy || [],
            downvotedBy: data.downvotedBy || [],
            afterPhotoUrl: data.afterPhotoUrl,
            video_url: data.video_url,
            videoUrl: data.videoUrl || data.video_url,
            resolvedGps: data.resolvedGps,
            resolvedAt: data.resolvedAt ? (typeof data.resolvedAt.toDate === "function" ? data.resolvedAt.toDate() : new Date(data.resolvedAt)) : undefined,
            verifiedAt: data.verifiedAt ? (typeof data.verifiedAt.toDate === "function" ? data.verifiedAt.toDate() : new Date(data.verifiedAt)) : undefined,
            inProgressAt: data.inProgressAt ? (typeof data.inProgressAt.toDate === "function" ? data.inProgressAt.toDate() : new Date(data.inProgressAt)) : undefined,
            reopened: data.reopened || false,
            reopenedAt: data.reopenedAt ? (typeof data.reopenedAt.toDate === "function" ? data.reopenedAt.toDate() : new Date(data.reopenedAt)) : undefined,
            hadNeedsReview: data.hadNeedsReview || false,
          });
        });
        setReports(list);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching municipal reports:", err);
        setError("Failed to fetch reports. Make sure you have database permissions.");
        setLoading(false);
        handleFirestoreError(err, OperationType.GET, "reports");
      }
    );

    return () => unsubscribe();
  }, []);

  // Access check
  if (userRole !== "municipal" && userRole !== "government") {
    return (
      <div id="municipal_access_denied" className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 text-center max-w-lg mx-auto my-12">
        <div className="h-14 w-14 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mx-auto mb-4 border border-rose-100">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h3 className="font-sans text-xl font-bold text-slate-900 tracking-tight">
          Municipal Access Denied
        </h3>
        <p className="text-slate-500 text-sm mt-2 leading-relaxed">
          The Municipal Queue is restricted to authorized municipal workers. Please toggle your simulation role to "Municipal Staff" or "Government Staff" in the top bar to proceed.
        </p>
      </div>
    );
  }

  // Handle Mark In Progress
  const handleMarkInProgress = async (reportId: string) => {
    try {
      const docRef = doc(db, "reports", reportId);
      await updateDoc(docRef, {
        status: "In Progress",
        inProgressAt: new Date(),
      });
    } catch (err: any) {
      console.error("Error setting In Progress status:", err);
      setError("Failed to update status. Please try again.");
    }
  };

  // Handle resolution submit
  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingReportId || !afterPhoto) return;

    setIsSubmittingResolution(true);
    setUploadProgressPhase("Uploading proof image...");

    let finalAfterPhotoUrl = "";

    try {
      // Upload proof to Firebase Storage with a timeout fallback
      try {
        const storagePath = `resolutions/resolved_${resolvingReportId}_${Date.now()}.jpg`;
        const imageRef = ref(storage, storagePath);
        
        // Define a timeout promise
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Firebase Storage upload timed out")), 4000)
        );

        // Run upload and get download URL in a single promise flow
        const uploadProcess = async () => {
          const uploadResult = await uploadString(imageRef, afterPhoto, "data_url");
          return await getDownloadURL(uploadResult.ref);
        };

        // Race the upload against our 4-second timeout
        finalAfterPhotoUrl = await Promise.race([uploadProcess(), timeoutPromise]);
      } catch (storageErr) {
        console.warn("Storage upload failed, falling back to base64 string storage:", storageErr);
        // Fallback to storing raw base64 data url directly in firestore
        finalAfterPhotoUrl = afterPhoto;
      }

      setUploadProgressPhase("Updating civic database record...");

      // Update Firestore document
      const docRef = doc(db, "reports", resolvingReportId);
      const updateData: any = {
        status: "Resolved",
        afterPhotoUrl: finalAfterPhotoUrl,
      };
      if (resolvedGps) {
        updateData.resolvedGps = resolvedGps;
      }
      if (resolvedAt) {
        updateData.resolvedAt = resolvedAt;
      }
      await updateDoc(docRef, updateData);

      // Reset states
      setResolvingReportId(null);
      setAfterPhoto(null);
      setResolvedGps(null);
      setResolvedAt(null);
    } catch (err: any) {
      console.error("Resolution error:", err);
      setError("Failed to mark report as resolved: " + err.message);
    } finally {
      setIsSubmittingResolution(false);
      setUploadProgressPhase(null);
    }
  };

  // File selection/Drag & Drop helper
  const processImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (PNG/JPG).");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAfterPhoto(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImageFile(e.target.files[0]);
    }
  };

  // Category filter matcher
  const getCategoryEmoji = (cat: CivicIssueCategory) => {
    switch (cat) {
      case "Pothole": return "🕳️";
      case "Water Leak": return "💧";
      case "Broken Light": return "💡";
      case "Waste Problem": return "🗑️";
      default: return "⚠️";
    }
  };

  // Filter & Sort logic
  const filteredReports = reports
    .filter((report) => {
      // Status Filter
      if (statusFilter !== "All" && report.status !== statusFilter) {
        return false;
      }
      // Category Filter
      if (categoryFilter !== "All") {
        if (categoryFilter === "Pothole" && report.category !== "Pothole") return false;
        if (categoryFilter === "Water Leak" && report.category !== "Water Leak") return false;
        if (categoryFilter === "Broken Light" && report.category !== "Broken Light") return false;
        if (categoryFilter === "Waste Problem" && report.category !== "Waste Problem") return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "oldest") {
        return a.timestamp.getTime() - b.timestamp.getTime();
      }
      if (sortBy === "votes") {
        return (b.upvote_count - b.downvote_count) - (a.upvote_count - a.downvote_count);
      }
      // Default: newest
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

  return (
    <div id="municipal_portal_root" className="space-y-6">
      
      {/* Overview Banner */}
      <div id="municipal_header_card" className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4 opacity-10 pointer-events-none">
          <CheckCircle className="h-64 w-64" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
              Municipal Portal
            </span>
            <h2 className="font-sans text-2xl font-bold tracking-tight mt-2">
              Verified Issues Dispatcher
            </h2>
            <p className="text-slate-300 text-xs mt-1 max-w-xl">
              Inspect and dispatch field teams to address community-verified hazards. Mark issues "In Progress" when crews deploy, and upload after-photos to verify completed resolutions.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2.5 bg-white/10 rounded-xl border border-white/10 text-center">
              <p className="text-[10px] text-slate-300 uppercase font-semibold">Active Dispatch</p>
              <p className="text-lg font-bold text-white">{reports.length}</p>
            </div>
            <div className="px-4 py-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-center">
              <p className="text-[10px] text-emerald-300 uppercase font-semibold">Verified Queue</p>
              <p className="text-lg font-bold text-emerald-300">
                {reports.filter(r => r.status === "Verified").length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div id="municipal_error_alert" className="p-4 bg-rose-50 border-l-4 border-rose-500 rounded-r-lg flex gap-3 text-rose-700 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto hover:text-rose-900 font-bold">×</button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div id="municipal_filters_card" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left: Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter className="h-3 w-3" /> Filter Status
          </span>
          <button
            id="status_filter_all"
            onClick={() => setStatusFilter("All")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              statusFilter === "All"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-100"
            }`}
          >
            All Active ({reports.length})
          </button>
          <button
            id="status_filter_verified"
            onClick={() => setStatusFilter("Verified")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              statusFilter === "Verified"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-100"
            }`}
          >
            Verified ({reports.filter((r) => r.status === "Verified").length})
          </button>
          <button
            id="status_filter_progress"
            onClick={() => setStatusFilter("In Progress")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              statusFilter === "In Progress"
                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-100"
            }`}
          >
            In Progress ({reports.filter((r) => r.status === "In Progress").length})
          </button>
        </div>

        {/* Right: Dropdowns */}
        <div className="flex items-center gap-2">
          {/* Category Dropdown */}
          <div className="relative">
            <select
              id="municipal_category_select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 border border-slate-200 rounded-xl bg-slate-50 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="All">All Categories</option>
              <option value="Pothole">🕳️ Potholes</option>
              <option value="Water Leak">💧 Water Leaks</option>
              <option value="Broken Light">💡 Broken Streetlights</option>
              <option value="Waste Problem">🗑️ Waste Problems</option>
            </select>
            <ChevronRight className="h-3 w-3 text-slate-400 absolute right-2.5 top-3 rotate-90 pointer-events-none" />
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <select
              id="municipal_sort_select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="appearance-none pl-3 pr-8 py-2 border border-slate-200 rounded-xl bg-slate-50 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="votes">Top Upvoted</option>
            </select>
            <ChevronRight className="h-3 w-3 text-slate-400 absolute right-2.5 top-3 rotate-90 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Main Queue List */}
      {loading ? (
        <div className="py-20 text-center text-slate-400">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">Loading Municipal Work Orders...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-150/80 p-12 text-center shadow-sm">
          <CheckCircle className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-base font-bold text-slate-800">No issues matching selection</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            All caught up! There are no unresolved reports with the selected criteria currently in the dispatch queue.
          </p>
        </div>
      ) : (
        <div id="municipal_dispatch_queue" className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredReports.map((report) => (
            <div 
              key={report.id} 
              id={`municipal_card_${report.id}`}
              className={`bg-white rounded-2xl border transition-all duration-200 flex flex-col overflow-hidden shadow-sm ${
                resolvingReportId === report.id
                  ? "border-blue-500 ring-2 ring-blue-100"
                  : report.status === "In Progress"
                    ? "border-indigo-100 hover:border-indigo-200"
                    : "border-slate-100 hover:border-slate-200"
              }`}
            >
              {/* Card Photo Header */}
              <div id="municipal_card_banner" className="relative h-48 bg-slate-100 overflow-hidden shrink-0">
                {report.videoUrl || report.video_url ? (
                  <video 
                    src={report.videoUrl || report.video_url} 
                    controls
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img 
                    src={report.photoUrl} 
                    alt="Issue incident photo" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                )}
                
                {/* Status Badges */}
                <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                  <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full shadow-sm border ${
                    report.status === "Verified"
                      ? "bg-emerald-500 text-white border-emerald-400"
                      : "bg-indigo-600 text-white border-indigo-500"
                  }`}>
                    {report.status}
                  </span>
                  
                  <span className="px-2.5 py-1 text-[10px] font-semibold tracking-wide rounded-full bg-slate-900/80 backdrop-blur-md text-white shadow-sm flex items-center gap-1">
                    <span>{getCategoryEmoji(report.category)}</span>
                    <span>{report.category}</span>
                  </span>
                </div>

                {/* Score badge */}
                <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg text-[10px] font-semibold text-white shadow-sm">
                  Score: +{report.upvote_count - report.downvote_count} ({report.upvote_count}▲ / {report.downvote_count}▼)
                </div>
              </div>

              {/* Card Body */}
              <div id="municipal_card_body" className="p-4 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-1.5 text-slate-800">
                    <MapPin className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Landmark Location</p>
                      <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">{report.landmark}</p>
                    </div>
                  </div>

                  {report.aiDescription && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1 mb-1">
                        ✨ AI Description
                      </p>
                      <p className="text-xs text-slate-600 italic leading-relaxed">
                        "{report.aiDescription}"
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-slate-500 text-xs pt-1.5">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span>{report.timestamp.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</span>
                    </div>
                    {report.gps && (
                      <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
                        <span>{report.gps.latitude.toFixed(4)}, {report.gps.longitude.toFixed(4)}</span>
                      </div>
                    )}
                  </div>

                  {/* Visual Progress Roadmap/Timeline */}
                  <IssueTimeline report={report} />
                </div>

                {/* Dispatch / Update Operations Panel */}
                <div id={`ops_panel_${report.id}`} className="pt-3 border-t border-slate-100 space-y-3">
                  
                  {resolvingReportId === report.id ? (
                    /* Inline proof form */
                    <form onSubmit={handleResolveSubmit} className="space-y-3.5 bg-slate-50/80 p-3 rounded-xl border border-blue-200/50">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1">
                          📸 Capture Live On-Site Resolution Proof
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setResolvingReportId(null);
                            setAfterPhoto(null);
                            setResolvedGps(null);
                            setResolvedAt(null);
                          }}
                          className="text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {afterPhoto ? (
                        <div className="space-y-3">
                          <div className="relative h-40 w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-black">
                            <img
                              src={afterPhoto}
                              alt="Resolution proof preview"
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setAfterPhoto(null);
                                setResolvedGps(null);
                                setResolvedAt(null);
                              }}
                              className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white transition cursor-pointer"
                              title="Remove Photo"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Live verified metadata display */}
                          {resolvedGps && (
                            <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl space-y-1">
                              <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1">
                                🛡️ Verified On-Site Metadata
                              </p>
                              <div className="grid grid-cols-2 gap-2 text-[10px] text-emerald-700">
                                <div className="flex items-center gap-1 font-mono">
                                  <MapPin className="h-3 w-3 text-emerald-500 shrink-0" />
                                  <span className="truncate">GPS: {resolvedGps.latitude.toFixed(5)}, {resolvedGps.longitude.toFixed(5)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-emerald-500 shrink-0" />
                                  <span className="truncate">Captured: {resolvedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Only Live Camera Capture option is allowed */
                        <div className="border-2 border-dashed border-blue-200 bg-blue-50/10 rounded-xl p-5 text-center transition-all flex flex-col items-center justify-center">
                          <div className="p-3 bg-blue-50 text-blue-600 rounded-full mb-3 shadow-inner">
                            <Camera className="h-6 w-6" />
                          </div>
                          <p className="text-xs font-bold text-slate-800 mb-1">
                            Live Camera Verification Required
                          </p>
                          <p className="text-[10px] text-slate-500 max-w-xs mx-auto mb-4 leading-relaxed">
                            No files or gallery uploads allowed. You must capture a real-time, live photo on-site of the fixed issue to auto-validate GPS coordinates and current timestamp.
                          </p>

                          <button
                            type="button"
                            onClick={() => setIsCameraOpen(true)}
                            className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-100 transition inline-flex items-center gap-2 cursor-pointer"
                          >
                            <Camera className="h-4 w-4" />
                            Open Live Capture Camera
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={!afterPhoto || isSubmittingResolution}
                          className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-100 disabled:opacity-50 disabled:shadow-none cursor-pointer"
                        >
                          {isSubmittingResolution ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>{uploadProgressPhase || "Saving..."}</span>
                            </>
                          ) : (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              <span>Complete Resolution</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  ) : (
                    /* Main Action Buttons */
                    <div className="flex items-center gap-2">
                      {report.status === "Verified" && (
                        <button
                          id={`btn_progress_${report.id}`}
                          onClick={() => handleMarkInProgress(report.id!)}
                          className="flex-1 py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 border border-indigo-100 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Clock className="h-3.5 w-3.5" />
                          <span>Deploy Crew (In Progress)</span>
                        </button>
                      )}

                      <button
                        id={`btn_resolve_${report.id}`}
                        onClick={() => setResolvingReportId(report.id!)}
                        className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                          report.status === "In Progress"
                            ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-100"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                        }`}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span>File Resolution Proof</span>
                      </button>
                    </div>
                  )}

                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Camera Capture Modal Integration */}
      {isCameraOpen && (
        <CameraCapture
          onCapture={(photoBase64, gps) => {
            setAfterPhoto(photoBase64);
            setResolvedGps(gps);
            setResolvedAt(new Date());
            setIsCameraOpen(false);
          }}
          onCancel={() => setIsCameraOpen(false)}
        />
      )}

    </div>
  );
}
