import React, { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, query, onSnapshot } from "firebase/firestore";
import { CivicReport, CivicIssueCategory } from "../types";
import ReportMap from "./ReportMap";
import { fetchPredictiveInsights, PredictionInsight } from "../lib/predictiveInsights";
import { 
  Building2, 
  AlertTriangle, 
  Clock, 
  MapPin, 
  TrendingUp, 
  Loader2, 
  AlertCircle,
  FileText,
  Calendar,
  CheckCircle,
  ShieldAlert,
  Sliders,
  Sparkles,
  X,
  Search,
  Eye,
  ThumbsUp,
  ThumbsDown,
  ExternalLink
} from "lucide-react";
import IssueTimeline from "./IssueTimeline";

interface GovernmentPortalProps {
  currentUserId: string;
  userRole: "citizen" | "municipal" | "government";
}

export default function GovernmentPortal({ currentUserId, userRole }: GovernmentPortalProps) {
  const [reports, setReports] = useState<CivicReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Predictive insights state
  const [predictions, setPredictions] = useState<PredictionInsight[]>([]);
  const [predictiveLoading, setPredictiveLoading] = useState(false);
  const [predictiveError, setPredictiveError] = useState<string | null>(null);

  // Government report detail drill-down and search/filters
  const [selectedReport, setSelectedReport] = useState<CivicReport | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  // Fetch all reports to compute government metrics
  useEffect(() => {
    setLoading(true);
    setError(null);

    const q = query(collection(db, "reports"));

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
            verifiedAt: data.verifiedAt ? (typeof data.verifiedAt.toDate === "function" ? data.verifiedAt.toDate() : new Date(data.verifiedAt)) : undefined,
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
        console.error("Error fetching government reports:", err);
        setError("Failed to fetch reports. Make sure you have database permissions.");
        setLoading(false);
        handleFirestoreError(err, OperationType.GET, "reports");
      }
    );

    return () => unsubscribe();
  }, []);

  const handleGeneratePredictions = async () => {
    setPredictiveLoading(true);
    setPredictiveError(null);
    try {
      const results = await fetchPredictiveInsights();
      setPredictions(results);
    } catch (err: any) {
      console.error("Error generating predictive insights:", err);
      if (err.message === "NO_DATA") {
        setPredictiveError("Not enough data yet. Insights will appear once citizens start reporting.");
      } else {
        setPredictiveError("Unable to generate insights. Try again.");
      }
    } finally {
      setPredictiveLoading(false);
    }
  };

  const getCategoryStyle = (category: string) => {
    const cat = category.toLowerCase();
    if (cat.includes("water") || cat.includes("leak")) {
      return "bg-rose-50 text-rose-700 border-rose-100";
    }
    if (cat.includes("pothole")) {
      return "bg-orange-50 text-orange-700 border-orange-100";
    }
    if (cat.includes("light") || cat.includes("street")) {
      return "bg-amber-50 text-amber-700 border-amber-100";
    }
    if (cat.includes("waste") || cat.includes("garbage") || cat.includes("trash")) {
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    }
    return "bg-slate-50 text-slate-700 border-slate-100";
  };

  const getRiskStyle = (riskLevel: string) => {
    const risk = riskLevel.toLowerCase();
    if (risk.includes("high")) {
      return "bg-rose-500 text-white";
    }
    if (risk.includes("medium")) {
      return "bg-amber-500 text-white";
    }
    if (risk.includes("low")) {
      return "bg-emerald-500 text-white";
    }
    return "bg-slate-500 text-white";
  };

  // SLA window definition in hours
  const getSLALimitHours = (category: CivicIssueCategory): number => {
    switch (category) {
      case "Water Leak": return 48; // 48 hours
      case "Pothole": return 7 * 24; // 7 days = 168 hours
      case "Broken Light": return 5 * 24; // 5 days = 120 hours
      case "Waste Problem": return 3 * 24; // 3 days = 72 hours
      default: return 24; // fallback 24 hours
    }
  };

  const getSLALabel = (category: CivicIssueCategory): string => {
    switch (category) {
      case "Water Leak": return "48 Hours";
      case "Pothole": return "7 Days";
      case "Broken Light": return "5 Days";
      case "Waste Problem": return "3 Days";
      default: return "24 Hours";
    }
  };

  // Access check
  if (userRole !== "government") {
    return (
      <div id="government_access_denied" className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 text-center max-w-lg mx-auto my-12">
        <div className="h-14 w-14 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mx-auto mb-4 border border-rose-100">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h3 className="font-sans text-xl font-bold text-slate-900 tracking-tight">
          Government Access Denied
        </h3>
        <p className="text-slate-500 text-sm mt-2 leading-relaxed">
          The Government Administration Portal is restricted to regulatory oversight staff. Please toggle your simulation role to "Government Staff" in the top bar to inspect city metrics.
        </p>
      </div>
    );
  }

  // Compute status counts
  const statusCounts = {
    Reported: 0,
    Verified: 0,
    InProgress: 0,
    Resolved: 0,
    NeedsReview: 0,
  };

  reports.forEach((report) => {
    if (report.status === "Reported") statusCounts.Reported++;
    else if (report.status === "Verified") statusCounts.Verified++;
    else if (report.status === "In Progress") statusCounts.InProgress++;
    else if (report.status === "Resolved") statusCounts.Resolved++;
    else if (report.status === "Needs Review") statusCounts.NeedsReview++;
  });

  // Calculate Overdue issues (Verified or In Progress, and elapsed time since creation/verification is > SLA)
  const overdueIssues = reports
    .filter((report) => {
      if (report.status !== "Verified" && report.status !== "In Progress") {
        return false;
      }
      const baselineTime = report.verifiedAt || report.timestamp;
      if (!baselineTime) return false;

      const elapsedMs = Date.now() - new Date(baselineTime).getTime();
      const elapsedHours = elapsedMs / (1000 * 60 * 60);
      const limitHours = getSLALimitHours(report.category);

      return elapsedHours > limitHours;
    })
    .map((report) => {
      const baselineTime = report.verifiedAt || report.timestamp;
      const elapsedMs = Date.now() - new Date(baselineTime).getTime();
      const elapsedHours = Math.floor(elapsedMs / (1000 * 60 * 60));
      const limitHours = getSLALimitHours(report.category);
      
      let overdueText = "";
      if (elapsedHours > 24) {
        overdueText = `${Math.floor(elapsedHours / 24)}d ${elapsedHours % 24}h overdue`;
      } else {
        overdueText = `${elapsedHours}h overdue`;
      }

      return {
        ...report,
        elapsedHours,
        limitHours,
        overdueText,
      };
    })
    .sort((a, b) => b.elapsedHours - a.elapsedHours); // Highest overdue first

  // Landmark counts (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const landmarkReportMap: Record<string, { count: number; landmark: string }> = {};

  reports.forEach((report) => {
    const reportDate = report.timestamp ? new Date(report.timestamp) : new Date();
    if (reportDate >= thirtyDaysAgo) {
      const landmarkName = (report.landmark || "Unknown Location").trim();
      if (!landmarkReportMap[landmarkName]) {
        landmarkReportMap[landmarkName] = { count: 0, landmark: landmarkName };
      }
      landmarkReportMap[landmarkName].count++;
    }
  });

  const landmarkLeaderboard = Object.values(landmarkReportMap).sort((a, b) => b.count - a.count);
  const maxLandmarkCount = landmarkLeaderboard.length > 0 ? landmarkLeaderboard[0].count : 1;

  // Filter all reports for the Government Audit Feed
  const filteredAuditReports = reports.filter((report) => {
    const matchesSearch =
      (report.landmark || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (report.aiDescription || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (report.citizenDescription || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (report.category || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = categoryFilter === "All" || report.category === categoryFilter;
    const matchesStatus = statusFilter === "All" || report.status === statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div id="government_portal_root" className="space-y-8">
      
      {/* Government Executive Banner */}
      <div id="government_header_card" className="bg-gradient-to-r from-slate-900 via-slate-850 to-blue-950 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4 opacity-10 pointer-events-none">
          <Building2 className="h-64 w-64 text-blue-500" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
              Regulatory Oversight
            </span>
            <h2 className="font-sans text-2xl font-bold tracking-tight mt-2 flex items-center gap-2">
              <Building2 className="h-6.5 w-6.5 text-blue-400" />
              Municipal Governance Dashboard
            </h2>
            <p className="text-slate-300 text-xs mt-1 max-w-xl">
              Monitor civic hazard resolution times, track category SLA compliance, and identify hotspot landmarks with disproportionately high reporting volume.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2.5 bg-white/5 rounded-xl border border-white/10 text-center">
              <p className="text-[10px] text-slate-300 uppercase font-semibold">Total Reports</p>
              <p className="text-lg font-bold text-white">{reports.length}</p>
            </div>
            <div className="px-4 py-2.5 bg-rose-500/10 rounded-xl border border-rose-500/20 text-center">
              <p className="text-[10px] text-rose-300 uppercase font-semibold">SLA Violations</p>
              <p className="text-lg font-bold text-rose-400">
                {overdueIssues.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div id="government_error_alert" className="p-4 bg-rose-50 border-l-4 border-rose-500 rounded-r-lg flex gap-3 text-rose-700 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto hover:text-rose-900 font-bold">×</button>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-slate-400">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">Consolidating Municipal Datasets...</p>
        </div>
      ) : (
        <>
          {/* Executive Metrics Grid */}
          <div id="government_metrics_grid" className="grid grid-cols-2 md:grid-cols-5 gap-4">
            
            <div id="metric_reported" className="bg-white p-4 rounded-2xl border border-slate-150 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Reported</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-bold text-slate-900">{statusCounts.Reported}</span>
                <span className="text-xs text-slate-500 font-medium">pending</span>
              </div>
              <div className="w-full bg-slate-100 h-1 rounded-full mt-3 overflow-hidden">
                <div 
                  className="bg-slate-400 h-full rounded-full transition-all duration-550" 
                  style={{ width: `${reports.length > 0 ? (statusCounts.Reported / reports.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div id="metric_verified" className="bg-white p-4 rounded-2xl border border-slate-150 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] text-teal-600 font-extrabold uppercase tracking-wider">Verified</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-bold text-teal-700">{statusCounts.Verified}</span>
                <span className="text-xs text-teal-500 font-medium">approved</span>
              </div>
              <div className="w-full bg-teal-50 h-1 rounded-full mt-3 overflow-hidden">
                <div 
                  className="bg-teal-500 h-full rounded-full transition-all duration-550" 
                  style={{ width: `${reports.length > 0 ? (statusCounts.Verified / reports.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div id="metric_in_progress" className="bg-white p-4 rounded-2xl border border-slate-150 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] text-indigo-600 font-extrabold uppercase tracking-wider">In Progress</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-bold text-indigo-700">{statusCounts.InProgress}</span>
                <span className="text-xs text-indigo-500 font-medium">dispatched</span>
              </div>
              <div className="w-full bg-indigo-50 h-1 rounded-full mt-3 overflow-hidden">
                <div 
                  className="bg-indigo-500 h-full rounded-full transition-all duration-550" 
                  style={{ width: `${reports.length > 0 ? (statusCounts.InProgress / reports.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div id="metric_resolved" className="bg-white p-4 rounded-2xl border border-slate-150 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-wider">Resolved</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-bold text-emerald-700">{statusCounts.Resolved}</span>
                <span className="text-xs text-emerald-500 font-medium">fixed</span>
              </div>
              <div className="w-full bg-emerald-50 h-1 rounded-full mt-3 overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-550" 
                  style={{ width: `${reports.length > 0 ? (statusCounts.Resolved / reports.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div id="metric_needs_review" className="bg-white p-4 rounded-2xl border border-slate-150 shadow-sm flex flex-col justify-between col-span-2 md:col-span-1">
              <span className="text-[10px] text-amber-600 font-extrabold uppercase tracking-wider">Needs Review</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl font-bold text-amber-700">{statusCounts.NeedsReview}</span>
                <span className="text-xs text-amber-500 font-medium">flagged</span>
              </div>
              <div className="w-full bg-amber-50 h-1 rounded-full mt-3 overflow-hidden">
                <div 
                  className="bg-amber-500 h-full rounded-full transition-all duration-550" 
                  style={{ width: `${reports.length > 0 ? (statusCounts.NeedsReview / reports.length) * 100 : 0}%` }}
                />
              </div>
            </div>

          </div>

          {/* Interactive Google Maps Hotspot View */}
          <div id="government_map_section" className="animate-fade-in my-8">
            <ReportMap reports={reports} height="420px" />
          </div>

          {/* Overdue Issues & Landmark Leaderboard Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* SLA Compliance Panel */}
            <div id="sla_overdue_panel" className="lg:col-span-7 bg-white rounded-2xl border border-slate-150 shadow-sm p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-rose-500" />
                    SLA Violations ({overdueIssues.length})
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Verified issues exceeding category resolution targets (Water: 48h, Pothole: 7d, Streetlight: 5d, Waste: 3d)
                  </p>
                </div>
                <span className="bg-rose-50 text-rose-700 px-2.5 py-1 rounded-full text-[10px] font-bold border border-rose-100 flex items-center gap-1">
                  Overdue SLA
                </span>
              </div>

              {overdueIssues.length === 0 ? (
                <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center">
                  <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-800">100% SLA Compliance</p>
                  <p className="text-xs text-slate-500 mt-0.5">All active verified dispatches are within target category S.L.A. windows!</p>
                </div>
              ) : (
                <div id="overdue_list_container" className="space-y-4 max-h-[480px] overflow-y-auto pr-2">
                  {overdueIssues.map((report) => (
                    <div 
                      key={report.id} 
                      id={`overdue_item_${report.id}`}
                      onClick={() => setSelectedReport(report)}
                      className="p-4 rounded-xl border border-rose-100 bg-rose-50/10 flex gap-4 items-start transition-all hover:bg-rose-50/25 hover:border-rose-300 cursor-pointer shadow-sm"
                      title="Click to drill into details & visual timeline"
                    >
                      <div className="h-16 w-16 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0 shadow-sm">
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
                            alt="Overdue issue" 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded-full bg-slate-900 text-[9px] font-bold text-white uppercase tracking-wider">
                            {report.category}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-rose-500 text-[9px] font-extrabold text-white uppercase tracking-wider flex items-center gap-1 shadow-sm">
                            <Clock className="h-3 w-3" />
                            {report.overdueText}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-slate-800 font-semibold text-xs mt-1.5">
                          <MapPin className="h-3.5 w-3.5 text-rose-500" />
                          <span className="truncate">{report.landmark}</span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-slate-400">
                          <span>SLA Limit: {getSLALabel(report.category)}</span>
                          <span>•</span>
                          <span className="text-rose-600 font-medium">Status: {report.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Landmarks Leaderboard Panel */}
            <div id="landmarks_leaderboard_panel" className="lg:col-span-5 bg-white rounded-2xl border border-slate-150 shadow-sm p-6 space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  Landmarks Hotspots
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Active reported incidents in the last 30 days grouped by landmark location
                </p>
              </div>

              {landmarkLeaderboard.length === 0 ? (
                <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center">
                  <MapPin className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-800">No Landmark Incidents</p>
                  <p className="text-xs text-slate-500 mt-0.5">No reports have been submitted at any landmark in the past 30 days.</p>
                </div>
              ) : (
                <div id="landmarks_table_container" className="overflow-x-auto">
                  <table id="landmarks_leaderboard_table" className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="pb-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Landmark</th>
                        <th className="pb-3 text-right text-[10px] font-extrabold text-slate-400 uppercase tracking-wider w-24">Issues (30d)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {landmarkLeaderboard.map((item, index) => (
                        <tr key={index} className="group hover:bg-slate-50/40 transition-colors">
                          <td className="py-3.5 pr-2">
                            <div className="font-semibold text-slate-900 text-xs flex items-center gap-2">
                              <span className="w-5 text-[10px] text-slate-400 font-extrabold">#{index + 1}</span>
                              <span className="truncate max-w-[140px]" title={item.landmark}>{item.landmark}</span>
                            </div>
                            {/* Visual proportion line */}
                            <div className="w-full bg-slate-50 h-1.5 rounded-full mt-2 overflow-hidden">
                              <div 
                                className="bg-blue-500 h-full rounded-full transition-all duration-550" 
                                style={{ width: `${(item.count / maxLandmarkCount) * 100}%` }}
                              />
                            </div>
                          </td>
                          <td className="py-3.5 text-right font-extrabold text-xs text-slate-850">
                            {item.count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

          {/* Predictive Risk Insights Panel */}
          <div id="predictive_insights_panel" className="bg-white rounded-2xl border border-slate-150 shadow-sm p-6 space-y-6 mt-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-500 fill-indigo-100 animate-pulse" />
                  🔮 Predictive Risk Insights (AI-Powered)
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Generate predictive risk modeling of municipal issues over the next 30 days based on active localized report densities
                </p>
              </div>
              <button
                id="btn_generate_predictions"
                onClick={handleGeneratePredictions}
                disabled={predictiveLoading}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm self-start sm:self-auto shrink-0"
              >
                {predictiveLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Analyzing 30-day patterns...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate Predictions
                  </>
                )}
              </button>
            </div>

            {/* Local Errors or No Data Notices */}
            {predictiveError && (
              <div id="predictive_error_notice" className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex gap-3 text-rose-700 text-xs items-center">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{predictiveError}</span>
                <button onClick={() => setPredictiveError(null)} className="ml-auto hover:text-rose-900 font-bold">×</button>
              </div>
            )}

            {/* If no predictions and not loading/error, show a beautiful blank state */}
            {!predictiveLoading && !predictiveError && predictions.length === 0 && (
              <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center bg-slate-50/50">
                <Sparkles className="h-10 w-10 text-indigo-300 mx-auto mb-2 animate-bounce" style={{ animationDuration: '3s' }} />
                <p className="text-xs font-bold text-slate-800">No Insights Generated Yet</p>
                <p className="text-[11px] text-slate-550 mt-0.5">Click the "Generate Predictions" button above to run community risk modeling using Gemini AI.</p>
              </div>
            )}

            {/* Loading State Spinner */}
            {predictiveLoading && (
              <div className="py-12 text-center text-slate-450">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">Analyzing 30-day patterns...</p>
                <p className="text-[10px] text-slate-500 mt-1">Calling Gemini AI engine to compute civic risk probabilities...</p>
              </div>
            )}

            {/* Predictions List */}
            {!predictiveLoading && predictions.length > 0 && (
              <div id="predictions_cards_list" className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {predictions.map((p, index) => (
                  <div
                    key={index}
                    id={`prediction_card_${index}`}
                    className="p-5 rounded-xl border border-slate-100 bg-slate-50/30 flex flex-col justify-between hover:shadow-md transition-all duration-300"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-extrabold text-slate-900 leading-snug truncate" title={p.landmark}>
                          {p.landmark}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase shrink-0 shadow-sm ${getRiskStyle(p.risk_level)}`}>
                          {p.risk_level} Risk
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold border uppercase tracking-wider ${getCategoryStyle(p.category)}`}>
                          {p.category}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed font-sans font-medium">
                        {p.prediction}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100/80">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">
                        Recommended Action:
                      </p>
                      <p className="text-[11px] text-slate-600 italic leading-relaxed">
                        {p.recommended_action}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Powered by text */}
            <div className="text-center pt-2 border-t border-slate-100">
              <span className="text-[10px] text-slate-400 font-medium">
                Powered by Google Gemini AI • Based on last 30 days of community reports
              </span>
            </div>
          </div>

          {/* City Incident Audit Feed & Drill-down Detail Panel */}
          <div id="city_incidents_audit_panel" className="bg-white rounded-2xl border border-slate-150 shadow-sm p-6 space-y-6 mt-8">
            <div>
              <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                📋 City Incident Audit Feed
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Audit, search, and drill down into the full lifecycle of all reported civic incidents in the city.
              </p>
            </div>

            {/* Audit Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
              {/* Search Box */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  id="audit_search_input"
                  type="text"
                  placeholder="Search by landmark, category..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800"
                />
              </div>

              {/* Category Filter */}
              <div>
                <select
                  id="audit_category_filter"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="py-2 px-3 text-xs bg-white border border-slate-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 cursor-pointer"
                >
                  <option value="All">All Categories</option>
                  <option value="Pothole">Potholes</option>
                  <option value="Water Leak">Water Leaks</option>
                  <option value="Broken Light">Broken Streetlights</option>
                  <option value="Waste Problem">Waste Problems</option>
                  <option value="Other">Other Issues</option>
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <select
                  id="audit_status_filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="py-2 px-3 text-xs bg-white border border-slate-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 cursor-pointer"
                >
                  <option value="All">All Statuses</option>
                  <option value="Reported">Reported</option>
                  <option value="Verified">Verified</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Needs Review">Needs Review</option>
                </select>
              </div>
            </div>

            {/* Incidents Grid */}
            {filteredAuditReports.length === 0 ? (
              <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center bg-slate-50/50">
                <p className="text-xs font-bold text-slate-800">No Incidents Match Search Criteria</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Try widening your search terms or clearing the filters.</p>
              </div>
            ) : (
              <div id="audit_grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAuditReports.map((report) => {
                  const score = (report.upvote_count || 0) - (report.downvote_count || 0);
                  
                  return (
                    <div
                      key={report.id}
                      id={`audit_card_${report.id}`}
                      className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm hover:shadow transition-all duration-200 flex flex-col justify-between gap-3 group"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-700">
                            {report.category}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            report.status === "Resolved" ? "bg-emerald-50 text-emerald-700" :
                            report.status === "In Progress" ? "bg-indigo-50 text-indigo-700" :
                            report.status === "Verified" ? "bg-teal-50 text-teal-700" :
                            report.status === "Needs Review" ? "bg-amber-50 text-amber-700 animate-pulse" :
                            "bg-blue-50 text-blue-700"
                          }`}>
                            {report.status}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs">
                          <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                          <span className="truncate">{report.landmark}</span>
                        </div>

                        {report.aiDescription && (
                          <p className="text-[11px] text-slate-500 italic line-clamp-2 leading-relaxed">
                            "{report.aiDescription}"
                          </p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-50 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                        <div className="flex flex-col">
                          <span>Reported: {report.timestamp ? new Date(report.timestamp).toLocaleDateString() : "Unknown"}</span>
                          <span>Score: +{score} ({report.upvote_count}▲ / {report.downvote_count}▼)</span>
                        </div>
                        
                        <button
                          id={`btn_audit_drill_${report.id}`}
                          onClick={() => setSelectedReport(report)}
                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-[10px] transition cursor-pointer flex items-center gap-1"
                        >
                          <Eye className="h-3 w-3" />
                          Drill In
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Drill-down Detail Modal Overlay */}
      {selectedReport && (
        <div 
          id="government_drilldown_modal" 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                  Incident Details & Lifecycle
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Report ID: {selectedReport.id?.slice(0, 8)}...
                </h3>
              </div>
              <button 
                id="btn_close_drilldown"
                onClick={() => setSelectedReport(null)}
                className="h-10 w-10 bg-slate-50 hover:bg-slate-100 border border-slate-200/60 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Side: Photo and Metadata */}
                <div className="space-y-4">
                  <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-slate-100 shadow-sm">
                    {selectedReport.videoUrl || selectedReport.video_url ? (
                      <video 
                        src={selectedReport.videoUrl || selectedReport.video_url} 
                        controls
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img 
                        src={selectedReport.photoUrl} 
                        alt="Incident" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <span className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md text-[9px] font-bold text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Report Photo
                    </span>
                  </div>

                  {selectedReport.afterPhotoUrl && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Resolution Proof Image</p>
                      <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-slate-100 shadow-sm">
                        <img 
                          src={selectedReport.afterPhotoUrl} 
                          alt="After resolution" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute bottom-3 left-3 bg-emerald-600/90 text-[9px] font-bold text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                          After Resolution Proof
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Descriptions */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-1.5 text-slate-800">
                      <MapPin className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Landmark Location</p>
                        <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedReport.landmark}</p>
                      </div>
                    </div>

                    {selectedReport.aiDescription && (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1 mb-1">
                          ✨ AI Auto-Analysis
                        </p>
                        <p className="text-xs text-slate-600 italic leading-relaxed">
                          "{selectedReport.aiDescription}"
                        </p>
                      </div>
                    )}

                    {selectedReport.citizenDescription && (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1 mb-1">
                          📣 Citizen Description
                        </p>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          "{selectedReport.citizenDescription}"
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: Timeline and Analytics */}
                <div className="space-y-6">
                  {/* Visual Roadmap / Timeline */}
                  <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 shadow-sm">
                    <IssueTimeline report={selectedReport} />
                  </div>

                  {/* Core Metrics */}
                  <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Incident Audit Profile
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-3 text-xs font-sans">
                      <div className="p-2.5 bg-white rounded-xl border border-slate-100">
                        <span className="block text-[9px] text-slate-400 font-bold uppercase">Category</span>
                        <span className="font-bold text-slate-900 mt-0.5 block">{selectedReport.category}</span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-100">
                        <span className="block text-[9px] text-slate-400 font-bold uppercase">Status</span>
                        <span className="font-bold text-slate-900 mt-0.5 block">{selectedReport.status}</span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-100">
                        <span className="block text-[9px] text-slate-400 font-bold uppercase">Community Score</span>
                        <span className="font-bold text-slate-900 mt-0.5 block">+{selectedReport.upvote_count - selectedReport.downvote_count}</span>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-slate-100">
                        <span className="block text-[9px] text-slate-400 font-bold uppercase">Severity Rating</span>
                        <span className="font-bold text-slate-900 mt-0.5 block">{selectedReport.severity || "Unrated"}</span>
                      </div>
                    </div>

                    <div className="text-[10px] font-medium text-slate-400 space-y-1">
                      <p>Reported: {selectedReport.timestamp ? new Date(selectedReport.timestamp).toLocaleString() : "Unknown"}</p>
                      {selectedReport.verifiedAt && <p>Verified: {new Date(selectedReport.verifiedAt).toLocaleString()}</p>}
                      {selectedReport.inProgressAt && <p>In Progress: {new Date(selectedReport.inProgressAt).toLocaleString()}</p>}
                      {selectedReport.resolvedAt && <p>Resolved: {new Date(selectedReport.resolvedAt).toLocaleString()}</p>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
              <button 
                id="btn_modal_close_footer"
                onClick={() => setSelectedReport(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
