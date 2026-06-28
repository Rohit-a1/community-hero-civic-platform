import React, { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { CivicReport, CivicIssueCategory } from "../types";
import { MapPin, Calendar, Clock, RefreshCw, Layers, ShieldAlert, ExternalLink, ThumbsUp, ThumbsDown, AlertCircle, Check, X } from "lucide-react";
import ReportMap from "./ReportMap";
import ReportComments from "./ReportComments";
import IssueTimeline from "./IssueTimeline";

interface ReportListProps {
  currentUserId: string;
  currentUser?: any;
}

const CATEGORY_STYLES: Record<CivicIssueCategory, { badge: string; emoji: string }> = {
  "Pothole": { badge: "bg-amber-50 text-amber-800 border-amber-200", emoji: "🕳️" },
  "Water Leak": { badge: "bg-blue-50 text-blue-800 border-blue-200", emoji: "💧" },
  "Broken Light": { badge: "bg-yellow-50 text-yellow-800 border-yellow-200", emoji: "💡" },
  "Waste Problem": { badge: "bg-purple-50 text-purple-800 border-purple-200", emoji: "🗑️" },
  "Other": { badge: "bg-slate-50 text-slate-800 border-slate-200", emoji: "⚠️" }
};

const STATUS_STYLES = {
  "Reported": "bg-blue-50 text-blue-700 border-blue-100",
  "In Progress": "bg-indigo-50 text-indigo-700 border-indigo-100",
  "Resolved": "bg-emerald-50 text-emerald-700 border-emerald-100",
  "Verified": "bg-teal-50 text-teal-700 border-teal-200 font-bold",
  "Needs Review": "bg-rose-50 text-rose-700 border-rose-200 font-bold animate-pulse-subtle"
};

export default function ReportList({ currentUserId, currentUser }: ReportListProps) {
  const [reports, setReports] = useState<CivicReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("All");
  const [viewAfterPhoto, setViewAfterPhoto] = useState<Record<string, boolean>>({});
  const [confirmedResolved, setConfirmedResolved] = useState<Record<string, boolean>>({});

  const handleRejectResolution = async (reportId: string) => {
    try {
      const docRef = doc(db, "reports", reportId);
      await updateDoc(docRef, {
        status: "In Progress",
        reopened: true,
        reopenedAt: new Date(),
      });
    } catch (err: any) {
      console.error("Error reverting status back to In Progress:", err);
      setError("Failed to update status. Please try again.");
    }
  };

  const handleConfirmResolution = async (reportId: string) => {
    try {
      const docRef = doc(db, "reports", reportId);
      await updateDoc(docRef, {
        status: "Verified",
        verifiedAt: new Date()
      });
      setConfirmedResolved(prev => ({ ...prev, [reportId]: true }));
      // Dispatch civic action event to increment user streak on confirming resolution
      window.dispatchEvent(new CustomEvent("civic-action", { detail: { userId: currentUserId } }));
    } catch (err: any) {
      console.error("Error confirming resolution:", err);
      setError("Failed to confirm resolution. Please try again.");
    }
  };

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      const q = query(collection(db, "reports"), orderBy("timestamp", "desc"));
      
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list: CivicReport[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            list.push({
              id: doc.id,
              userId: data.userId,
              photoUrl: data.photoUrl,
              gps: data.gps,
              landmark: data.landmark,
              category: data.category,
              status: data.status,
              timestamp: data.timestamp ? data.timestamp.toDate() : new Date(),
              aiDescription: data.aiDescription,
              citizenDescription: data.citizenDescription,
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
          console.error("Firestore listening error:", err);
          setError("Failed to stream civic reports. If you just created the collection, wait a moment.");
          setLoading(false);
          handleFirestoreError(err, OperationType.GET, "reports");
        }
      );

      return () => unsubscribe();
    } catch (err: any) {
      console.error("Query setup error:", err);
      setError("Failed to initialize database queries.");
      setLoading(false);
    }
  }, []);

  const handleVote = async (reportId: string, voteType: "upvote" | "downvote") => {
    if (!currentUserId) {
      setError("You must be signed in to cast a vote on civic issues.");
      return;
    }

    const report = reports.find((r) => r.id === reportId);
    if (!report) return;

    let upvotedBy = [...(report.upvotedBy || [])];
    let downvotedBy = [...(report.downvotedBy || [])];

    const hasUpvoted = upvotedBy.includes(currentUserId);
    const hasDownvoted = downvotedBy.includes(currentUserId);

    if (voteType === "upvote") {
      if (hasUpvoted) {
        // Toggle off
        upvotedBy = upvotedBy.filter((uid) => uid !== currentUserId);
      } else {
        // Toggle on
        upvotedBy.push(currentUserId);
        // Remove from downvotes if previously downvoted
        if (hasDownvoted) {
          downvotedBy = downvotedBy.filter((uid) => uid !== currentUserId);
        }
      }
    } else {
      // Downvote
      if (hasDownvoted) {
        // Toggle off
        downvotedBy = downvotedBy.filter((uid) => uid !== currentUserId);
      } else {
        // Toggle on
        downvotedBy.push(currentUserId);
        // Remove from upvotes if previously upvoted
        if (hasUpvoted) {
          upvotedBy = upvotedBy.filter((uid) => uid !== currentUserId);
        }
      }
    }

    const upvote_count = upvotedBy.length;
    const downvote_count = downvotedBy.length;

    // Determine status automatically
    let status = report.status;
    let hadNeedsReview = report.hadNeedsReview || false;
    if (downvote_count > upvote_count) {
      status = "Needs Review";
      hadNeedsReview = true;
    } else {
      if (upvote_count >= 3) {
        if (report.status === "Reported" || report.status === "Needs Review") {
          status = "Verified";
        }
      } else {
        if (report.status === "Verified" || report.status === "Needs Review") {
          status = "Reported";
        }
      }
    }

    const docUpdates: any = {
      upvotedBy,
      downvotedBy,
      upvote_count,
      downvote_count,
      status,
      hadNeedsReview,
    };

    if (status === "Verified" && report.status !== "Verified" && !report.verifiedAt) {
      docUpdates.verifiedAt = new Date();
    }

    try {
      const docRef = doc(db, "reports", reportId);
      await updateDoc(docRef, docUpdates);
      
      // Dispatch civic action event to increment user streak on voting
      window.dispatchEvent(new CustomEvent("civic-action", { detail: { userId: currentUserId } }));
    } catch (err: any) {
      console.error("Failed to cast vote:", err);
      setError("Failed to cast your vote. Make sure you are authenticated.");
    }
  };

  const formatTimestamp = (date: Date) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch (e) {
      return "Just now";
    }
  };

  const filteredReports = filterCategory === "All"
    ? reports
    : reports.filter((r) => r.category === filterCategory);

  return (
    <div id="report_list_container" className="space-y-6">
      {/* Category filters */}
      <div id="filter_panel" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4.5 w-4.5 text-slate-500" />
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Civic Feed
          </span>
        </div>
        <div id="filter_buttons" className="flex flex-wrap gap-1.5 justify-center sm:justify-end">
          {["All", "Pothole", "Water Leak", "Broken Light", "Waste Problem", "Other"].map((cat) => (
            <button
              key={cat}
              id={`filter_tab_${cat.toLowerCase().replace(" ", "_")}`}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                filterCategory === cat
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-transparent hover:border-slate-200"
              }`}
            >
              {cat === "Broken Light" ? "Broken Streetlight" : cat}
            </button>
          ))}
        </div>
      </div>

      {!loading && (
        <div id="citizen_report_map_container" className="animate-fade-in">
          <ReportMap reports={reports} height="360px" />
        </div>
      )}

      {error && (
        <div id="list_error_alert" className="p-4 bg-rose-50 border-l-4 border-rose-500 rounded-r-lg flex gap-3 text-rose-700 text-sm">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div id="list_loading" className="flex flex-col items-center justify-center py-20 text-slate-400">
          <RefreshCw className="h-8 w-8 animate-spin mb-2" />
          <p className="text-sm font-medium">Streaming latest reports...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div id="list_empty" className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-500">
          <div className="text-4xl mb-3">📍</div>
          <p className="text-sm font-semibold text-slate-800">No active reports found</p>
          <p className="text-xs text-slate-400 mt-1">
            {filterCategory === "All"
              ? "Be the community hero by submitting the first civic issue!"
              : `No reports found for category "${filterCategory}".`}
          </p>
        </div>
      ) : (
        <div id="reports_grid" className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredReports.map((report) => {
            const catStyle = CATEGORY_STYLES[report.category] || CATEGORY_STYLES["Other"];
            const isMyReport = report.userId === currentUserId;

            return (
              <div
                key={report.id}
                id={`report_card_${report.id}`}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow group"
              >
                {/* Photo & Category Badge Overlay */}
                <div id="card_media" className="relative aspect-video w-full overflow-hidden bg-slate-900 border-b border-slate-100">
                  {(!viewAfterPhoto[report.id!] && (report.videoUrl || report.video_url)) ? (
                    <video
                      id={`report_video_${report.id}`}
                      src={report.videoUrl || report.video_url}
                      controls
                      playsInline
                      className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                    />
                  ) : (
                    <img
                      id={`report_img_${report.id}`}
                      src={viewAfterPhoto[report.id!] && report.afterPhotoUrl ? report.afterPhotoUrl : report.photoUrl}
                      alt={report.category}
                      className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  
                  {/* Before / After Slider Toggle for Resolved Issues */}
                  {report.status === "Resolved" && report.afterPhotoUrl && (
                    <div id={`before_after_toggle_${report.id}`} className="absolute top-12 left-3 z-10 flex gap-1 bg-black/80 backdrop-blur-md p-1 rounded-xl border border-white/15 shadow">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setViewAfterPhoto(prev => ({ ...prev, [report.id!]: false }));
                        }}
                        className={`px-2 py-1 text-[9px] font-extrabold rounded-lg uppercase transition cursor-pointer select-none ${
                          !viewAfterPhoto[report.id!] ? "bg-amber-600 text-white" : "text-slate-300 hover:text-white"
                        }`}
                      >
                        Before
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setViewAfterPhoto(prev => ({ ...prev, [report.id!]: true }));
                        }}
                        className={`px-2 py-1 text-[9px] font-extrabold rounded-lg uppercase transition cursor-pointer select-none ${
                          viewAfterPhoto[report.id!] ? "bg-emerald-600 text-white" : "text-slate-300 hover:text-white"
                        }`}
                      >
                        After Proof
                      </button>
                    </div>
                  )}

                  {/* Category Badge */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide border flex items-center gap-1 shadow-sm backdrop-blur-md ${catStyle.badge}`}>
                      <span>{catStyle.emoji}</span>
                      <span>{report.category === "Broken Light" ? "Broken Streetlight" : report.category}</span>
                    </span>
                    {report.severity && (
                      <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-sm backdrop-blur-md ${
                        report.severity === "Critical" ? "bg-red-600/90 text-white border-red-500/50" :
                        report.severity === "High" ? "bg-amber-600/90 text-white border-amber-500/50" :
                        report.severity === "Medium" ? "bg-yellow-500/90 text-slate-950 border-yellow-400/50" :
                        "bg-emerald-600/90 text-white border-emerald-500/50"
                      }`}>
                        {report.severity}
                      </span>
                    )}
                  </div>

                  {/* My Report Badge */}
                  {isMyReport && (
                    <div className="absolute top-3 right-3">
                      <span className="bg-slate-900/80 backdrop-blur-md border border-white/25 text-white text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full uppercase">
                        My Report
                      </span>
                    </div>
                  )}

                  {/* Status Overlay */}
                  <div className="absolute bottom-3 right-3">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide border uppercase shadow-sm backdrop-blur-sm ${STATUS_STYLES[report.status] || STATUS_STYLES["Reported"]}`}>
                      {report.status}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div id="card_content" className="p-4 flex-1 flex flex-col justify-between gap-4 bg-white">
                  <div className="space-y-3">
                    <div className="flex items-start gap-1.5 text-slate-800">
                      <MapPin className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Landmark</p>
                        <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">{report.landmark}</p>
                      </div>
                    </div>

                    {report.aiDescription && (
                      <div className="p-3 bg-slate-50/60 rounded-xl border border-slate-100/50">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1 mb-1">
                          ✨ AI Auto-Analysis
                        </p>
                        <p className="text-xs text-slate-600 italic leading-relaxed">
                          "{report.aiDescription}"
                        </p>
                      </div>
                    )}

                    {report.citizenDescription && (
                      <div className="p-3 bg-slate-50/60 rounded-xl border border-slate-100/50">
                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1 mb-1">
                          📣 Citizen Description
                        </p>
                        <p className="text-xs text-slate-700 leading-relaxed font-normal">
                          "{report.citizenDescription}"
                        </p>
                      </div>
                    )}

                    {report.status === "Resolved" && (
                      <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100/50 space-y-1.5">
                        <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                          🛡️ Verified On-Site Resolution
                        </p>
                        <div className="text-[11px] text-emerald-700 space-y-1">
                          <p className="leading-relaxed">
                            This report was resolved live on-site. The photo was verified to be captured physically at the location:
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 font-mono text-[10px] bg-white/65 p-2 rounded border border-emerald-100/50">
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-emerald-500 shrink-0" />
                              <span className="truncate">GPS: {report.resolvedGps ? `${report.resolvedGps.latitude.toFixed(4)}, ${report.resolvedGps.longitude.toFixed(4)}` : "Unavailable"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-emerald-500 shrink-0" />
                              <span className="truncate">Time: {report.resolvedAt ? new Date(report.resolvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Unavailable"}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Community Voice / Voting Section */}
                    <div id={`report_voting_panel_${report.id}`} className="flex items-center justify-between pt-1">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Community Voice
                        </span>
                        <span className="text-[9px] text-slate-400 mt-0.5">
                          {report.upvote_count >= 3 ? "✓ Verified Hub" : "Vouch or Flag"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Upvote Button */}
                        <button
                          id={`upvote_btn_${report.id}`}
                          onClick={() => handleVote(report.id!, "upvote")}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer select-none ${
                            report.upvotedBy?.includes(currentUserId)
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm"
                              : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-100/80"
                          }`}
                          title="I see this issue too (+1 Upvote)"
                        >
                          <ThumbsUp className={`h-3.5 w-3.5 ${report.upvotedBy?.includes(currentUserId) ? "fill-emerald-600 text-emerald-600" : "text-slate-400"}`} />
                          <span>{report.upvote_count || 0}</span>
                        </button>

                        {/* Downvote Button */}
                        <button
                          id={`downvote_btn_${report.id}`}
                          onClick={() => handleVote(report.id!, "downvote")}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer select-none ${
                            report.downvotedBy?.includes(currentUserId)
                              ? "bg-rose-50 text-rose-700 border-rose-200 shadow-sm"
                              : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-100/80"
                          }`}
                          title="This is fake or already resolved (+1 Downvote)"
                        >
                          <ThumbsDown className={`h-3.5 w-3.5 ${report.downvotedBy?.includes(currentUserId) ? "fill-rose-600 text-rose-600" : "text-slate-400"}`} />
                          <span>{report.downvote_count || 0}</span>
                        </button>
                      </div>
                    </div>

                    {/* Was this actually fixed? Feedback Banner for reporting citizen */}
                    {isMyReport && report.status === "Resolved" && (
                      <div id={`feedback_panel_${report.id}`} className="mt-3 p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl space-y-3">
                        <div className="flex items-start gap-1.5 text-amber-900">
                          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-xs font-bold uppercase tracking-wider">Verification Required</p>
                            <p className="text-[11px] text-amber-700 leading-relaxed mt-0.5 font-medium">
                              Municipal staff marked this issue as <strong>Resolved</strong>. Please inspect the work below.
                            </p>
                          </div>
                        </div>

                        {report.afterPhotoUrl && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Resolution Proof Image</p>
                            <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-black">
                              <img src={report.afterPhotoUrl} alt="After resolution proof" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              <span className="absolute bottom-2 left-2 bg-emerald-600 text-[9px] font-bold text-white px-2 py-0.5 rounded uppercase tracking-wide">After Proof</span>
                            </div>
                          </div>
                        )}

                        {confirmedResolved[report.id!] ? (
                          <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-bold pt-1">
                            <Check className="h-4 w-4" />
                            <span>Resolution confirmed. Thank you for your feedback!</span>
                          </div>
                        ) : (
                          <div className="space-y-1.5 pt-1">
                            <p className="text-[11px] font-bold text-slate-800">Was this issue actually fixed?</p>
                            <div className="flex gap-2">
                              <button
                                id={`btn_feedback_yes_${report.id}`}
                                type="button"
                                onClick={() => handleConfirmResolution(report.id!)}
                                className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Yes
                              </button>
                              <button
                                id={`btn_feedback_no_${report.id}`}
                                type="button"
                                onClick={() => handleRejectResolution(report.id!)}
                                className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                              >
                                <X className="h-3.5 w-3.5" />
                                No
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <IssueTimeline report={report} />

                    <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-slate-100">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-[11px] font-medium">{formatTimestamp(report.timestamp)}</span>
                      </div>
                      
                      <a
                        id={`report_map_link_${report.id}`}
                        href={`https://www.google.com/maps/search/?api=1&query=${report.gps.latitude},${report.gps.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-end gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-500 hover:underline transition"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Open Map</span>
                      </a>
                    </div>

                    {/* Interactive Real-time Comment Feed */}
                    <ReportComments reportId={report.id!} currentUser={currentUser} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
