import React from "react";
import { CivicReport } from "../types";
import { Check, Clock, AlertTriangle, RefreshCw, AlertCircle } from "lucide-react";

interface IssueTimelineProps {
  report: CivicReport;
}

export default function IssueTimeline({ report }: IssueTimelineProps) {
  // Graceful timestamp formatter
  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return null;
    try {
      const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
      // Format as e.g. "Jun 28, 01:24 PM"
      return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return null;
    }
  };

  // Determine which step is active or completed
  const status = report.status;
  
  const isReportedCompleted = true;
  const isReportedActive = status === "Reported";

  const isVerifiedCompleted = ["Verified", "In Progress", "Resolved"].includes(status) || !!report.verifiedAt;
  const isVerifiedActive = status === "Verified";

  const isInProgressCompleted = ["In Progress", "Resolved"].includes(status) || !!report.inProgressAt;
  const isInProgressActive = status === "In Progress";

  const isResolvedCompleted = status === "Resolved" || !!report.resolvedAt;
  const isResolvedActive = status === "Resolved";

  // Build the state configuration for the 4 primary steps
  const steps = [
    {
      id: "reported",
      label: "Reported",
      completed: isReportedCompleted,
      active: isReportedActive,
      timestamp: formatTimestamp(report.timestamp),
      bgColor: "bg-blue-600",
      borderColor: "border-blue-600",
      textColor: "text-blue-700",
      icon: <Clock className="h-4 w-4 text-white" />,
    },
    {
      id: "verified",
      label: "Verified",
      completed: isVerifiedCompleted,
      active: isVerifiedActive,
      timestamp: formatTimestamp(report.verifiedAt) || (isVerifiedCompleted ? "System Verified" : null),
      bgColor: "bg-indigo-600",
      borderColor: "border-indigo-600",
      textColor: "text-indigo-700",
      icon: isVerifiedCompleted ? (
        <Check className="h-4 w-4 text-white" />
      ) : (
        <Check className="h-4 w-4 text-slate-400" />
      ),
    },
    {
      id: "inprogress",
      label: "In Progress",
      completed: isInProgressCompleted,
      active: isInProgressActive,
      timestamp: formatTimestamp(report.inProgressAt) || (isInProgressCompleted ? "In Queue" : null),
      bgColor: "bg-amber-500",
      borderColor: "border-amber-500",
      textColor: "text-amber-700",
      icon: isInProgressCompleted ? (
        <Check className="h-4 w-4 text-white" />
      ) : (
        <RefreshCw className="h-4 w-4 text-slate-400" />
      ),
    },
    {
      id: "resolved",
      label: "Resolved",
      completed: isResolvedCompleted,
      active: isResolvedActive,
      timestamp: formatTimestamp(report.resolvedAt),
      bgColor: "bg-emerald-600",
      borderColor: "border-emerald-600",
      textColor: "text-emerald-700",
      icon: isResolvedCompleted ? (
        <Check className="h-4 w-4 text-white" />
      ) : (
        <Check className="h-4 w-4 text-slate-300" />
      ),
    },
  ];

  return (
    <div id={`timeline_container_${report.id}`} className="mt-4 pt-4 border-t border-slate-100/80">
      <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <span>📍</span> Progress Roadmap
      </h5>

      {/* Horizontal Connector Line & Steps */}
      <div className="relative flex items-center justify-between w-full px-2">
        {/* Connection line background */}
        <div className="absolute left-8 right-8 top-5 h-0.5 bg-slate-100 -z-10"></div>
        
        {/* Progress Fill bar (based on status) */}
        <div 
          className="absolute left-8 top-5 h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 transition-all duration-500 -z-10"
          style={{
            width: 
              status === "Resolved" 
                ? "calc(100% - 4rem)" 
                : status === "In Progress" 
                ? "66%" 
                : status === "Verified" 
                ? "33%" 
                : "0%"
          }}
        ></div>

        {/* Steps Loop */}
        {steps.map((step, index) => {
          const isDone = step.completed && !step.active;
          const isCurrent = step.active;
          const isUpcoming = !step.completed;

          return (
            <div key={step.id} className="flex flex-col items-center flex-1 text-center group">
              {/* Step bubble */}
              <div
                className={`h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 shadow-sm ${
                  isCurrent
                    ? `${step.bgColor} ${step.borderColor} text-white ring-4 ring-offset-2 ring-blue-500/10 scale-110 animate-pulse`
                    : isDone
                    ? `${step.bgColor} ${step.borderColor} text-white`
                    : "bg-slate-50 border-slate-200 text-slate-400"
                }`}
              >
                {step.icon}
              </div>

              {/* Step metadata */}
              <div className="mt-2.5">
                <p
                  className={`text-xs font-bold tracking-tight transition-colors ${
                    isCurrent
                      ? step.textColor
                      : isDone
                      ? "text-slate-800"
                      : "text-slate-400"
                  }`}
                >
                  {step.label}
                </p>
                {step.timestamp && (
                  <span className="block text-[9px] font-medium text-slate-500 mt-0.5">
                    {step.timestamp}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Warning/Branch Notes for Needs Review or Reopened states */}
      {(status === "Needs Review" || report.hadNeedsReview || report.reopened) && (
        <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-2">
          {/* Reopened Event Branch */}
          {report.reopened && (
            <div className="flex items-start gap-2.5 text-xs text-slate-600">
              <span className="text-amber-500 font-bold shrink-0 mt-0.5 flex items-center gap-1">
                <span className="text-slate-400 font-mono">└──</span>
                <RefreshCw className="h-3.5 w-3.5 animate-spin-slow text-orange-500" />
              </span>
              <div>
                <span className="font-bold text-orange-800">Reopened:</span> Failed resolution confirmation. Turned back to <strong className="text-amber-600">In Progress</strong>.
                {report.reopenedAt && (
                  <span className="block text-[9px] text-slate-400 font-medium mt-0.5">
                    Reopened on: {formatTimestamp(report.reopenedAt)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Needs Review Event Branch */}
          {(status === "Needs Review" || report.hadNeedsReview) && (
            <div className="flex items-start gap-2.5 text-xs text-slate-600">
              <span className="text-rose-500 font-bold shrink-0 mt-0.5 flex items-center gap-1">
                <span className="text-slate-400 font-mono">└──</span>
                <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
              </span>
              <div>
                <span className="font-bold text-rose-800">Needs Review:</span> Citizen downvotes exceed upvotes.
                {status === "Needs Review" ? (
                  <span className="inline-block ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-rose-100 text-rose-800 animate-pulse">
                    Currently Blocked
                  </span>
                ) : (
                  <span className="block text-[9px] text-slate-400 font-medium mt-0.5">
                    Flagged historical review record. Verified path reinstated.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
