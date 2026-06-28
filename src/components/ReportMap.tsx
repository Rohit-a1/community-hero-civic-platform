import React, { useState, useMemo } from "react";
import { APIProvider, Map, AdvancedMarker, InfoWindow, useAdvancedMarkerRef } from "@vis.gl/react-google-maps";
import { CivicReport, CivicIssueCategory } from "../types";
import { MapPin, Calendar, ListFilter, Flame, Sparkles, HelpCircle } from "lucide-react";

// Access API key from injected build/runtime process environment
const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  "";

const hasValidKey = Boolean(API_KEY) && API_KEY !== "YOUR_API_KEY";

interface ReportMapProps {
  reports: CivicReport[];
  height?: string;
  className?: string;
}

interface LandmarkGroup {
  name: string;
  lat: number;
  lng: number;
  totalCount: number;
  countLast30Days: number;
  categories: Record<CivicIssueCategory, number>;
  latestReports: CivicReport[];
}

export default function ReportMap({ reports, height = "400px", className = "" }: ReportMapProps) {
  const [selectedLandmark, setSelectedLandmark] = useState<LandmarkGroup | null>(null);
  const [markerRef, marker] = useAdvancedMarkerRef();

  // If key is invalid/missing, gracefully hide/skip the Maps section entirely
  if (!hasValidKey) {
    return null;
  }

  // Group reports by landmark name
  const landmarks: LandmarkGroup[] = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const groupMap: Record<string, {
      name: string;
      latitudes: number[];
      longitudes: number[];
      totalCount: number;
      countLast30Days: number;
      categories: Record<string, number>;
      latestReports: CivicReport[];
    }> = {};

    reports.forEach((report) => {
      const landmarkName = (report.landmark || "Unknown Location").trim();
      if (!landmarkName) return;

      if (!groupMap[landmarkName]) {
        groupMap[landmarkName] = {
          name: landmarkName,
          latitudes: [],
          longitudes: [],
          totalCount: 0,
          countLast30Days: 0,
          categories: {},
          latestReports: [],
        };
      }

      const grp = groupMap[landmarkName];
      grp.totalCount++;

      // Check if reported in the last 30 days
      const reportDate = report.timestamp ? new Date(report.timestamp) : new Date();
      if (reportDate >= thirtyDaysAgo) {
        grp.countLast30Days++;
      }

      if (report.gps?.latitude && report.gps?.longitude) {
        grp.latitudes.push(report.gps.latitude);
        grp.longitudes.push(report.gps.longitude);
      }

      // Add to categories
      const cat = report.category || "Other";
      grp.categories[cat] = (grp.categories[cat] || 0) + 1;

      // Collect reports for this landmark
      grp.latestReports.push(report);
    });

    return Object.values(groupMap).map((grp) => {
      // Find average lat/lng of all reports at this landmark, or fallback to San Francisco default
      let lat = 37.7749;
      let lng = -122.4194;

      if (grp.latitudes.length > 0 && grp.longitudes.length > 0) {
        lat = grp.latitudes.reduce((s, v) => s + v, 0) / grp.latitudes.length;
        lng = grp.longitudes.reduce((s, v) => s + v, 0) / grp.longitudes.length;
      }

      // Sort reports by date (latest first)
      const sortedReports = [...grp.latestReports].sort((a, b) => {
        const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tB - tA;
      });

      return {
        name: grp.name,
        lat,
        lng,
        totalCount: grp.totalCount,
        countLast30Days: grp.countLast30Days,
        categories: grp.categories as Record<CivicIssueCategory, number>,
        latestReports: sortedReports.slice(0, 5), // Keep latest 5
      };
    });
  }, [reports]);

  // Determine center of map based on landmarks, or fallback to default
  const mapCenter = useMemo(() => {
    if (landmarks.length === 0) {
      return { lat: 37.7749, lng: -122.4194 };
    }
    // Average coordinate of all landmarks
    const latSum = landmarks.reduce((s, l) => s + l.lat, 0);
    const lngSum = landmarks.reduce((s, l) => s + l.lng, 0);
    return {
      lat: latSum / landmarks.length,
      lng: lngSum / landmarks.length,
    };
  }, [landmarks]);

  // Style logic based on number of active issues in the last 30 days
  const getPinStyle = (count: number) => {
    if (count === 0) {
      return {
        bgColor: "bg-emerald-500 border-emerald-300",
        pulseColor: "bg-emerald-400",
        textColor: "text-white",
        size: 26,
        severity: "Safe / Resolved",
      };
    } else if (count <= 2) {
      return {
        bgColor: "bg-amber-500 border-amber-300",
        pulseColor: "bg-amber-400",
        textColor: "text-slate-900",
        size: 30,
        severity: "Low Severity",
      };
    } else if (count <= 5) {
      return {
        bgColor: "bg-orange-500 border-orange-300",
        pulseColor: "bg-orange-400",
        textColor: "text-white",
        size: 36,
        severity: "Medium Severity",
      };
    } else {
      return {
        bgColor: "bg-rose-600 border-rose-400",
        pulseColor: "bg-rose-500",
        textColor: "text-white",
        size: 42,
        severity: "High Volume Hotspot",
      };
    }
  };

  const categoryEmojis: Record<CivicIssueCategory, string> = {
    "Pothole": "🕳️",
    "Water Leak": "💧",
    "Broken Light": "💡",
    "Waste Problem": "🗑️",
    "Other": "⚠️",
  };

  return (
    <div id="report_map_outer_card" className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col ${className}`}>
      {/* Map Header with quick summary metrics */}
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <MapPin className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Civic Hotspot Map</h4>
            <p className="text-[10px] text-slate-400 mt-0.5">Real-time landmark risk & safety telemetry</p>
          </div>
        </div>

        {/* Mini Legend / quick summary stats */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-slate-500 font-medium">Safe (0)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-[10px] text-slate-500 font-medium">1-2 issues</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            <span className="text-[10px] text-slate-500 font-medium">3-5 issues</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-600" />
            <span className="text-[10px] text-slate-500 font-medium">6+ issues</span>
          </div>
        </div>
      </div>

      {/* Main Map Box */}
      <div className="relative flex-1" style={{ height }}>
        <APIProvider apiKey={API_KEY} version="weekly">
          <Map
            defaultCenter={mapCenter}
            defaultZoom={13}
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={["gmp_mcp_codeassist_v1_aistudio"]}
            style={{ width: "100%", height: "100%" }}
            gestureHandling="greedy"
            disableDefaultUI={false}
          >
            {landmarks.map((landmarkGroup) => {
              const style = getPinStyle(landmarkGroup.countLast30Days);
              const isSelected = selectedLandmark?.name === landmarkGroup.name;

              return (
                <AdvancedMarker
                  key={landmarkGroup.name}
                  ref={isSelected ? markerRef : null}
                  position={{ lat: landmarkGroup.lat, lng: landmarkGroup.lng }}
                  onClick={() => setSelectedLandmark(landmarkGroup)}
                  title={`${landmarkGroup.name} (${landmarkGroup.countLast30Days} issues in last 30d)`}
                >
                  <div className="relative flex items-center justify-center cursor-pointer transition-transform hover:scale-115">
                    {/* Pulsing ring for hot zones */}
                    {landmarkGroup.countLast30Days > 0 && (
                      <span
                        className={`absolute inline-flex rounded-full opacity-60 animate-ping ${style.pulseColor}`}
                        style={{
                          width: `${style.size * 1.6}px`,
                          height: `${style.size * 1.6}px`,
                        }}
                      />
                    )}
                    {/* Inner Pin Body */}
                    <div
                      className={`rounded-full border-2 flex items-center justify-center font-bold text-center shadow-lg select-none transition-all ${style.bgColor} ${style.textColor}`}
                      style={{
                        width: `${style.size}px`,
                        height: `${style.size}px`,
                        fontSize: landmarkGroup.countLast30Days >= 10 ? "11px" : "12px",
                      }}
                    >
                      {landmarkGroup.countLast30Days}
                    </div>
                  </div>
                </AdvancedMarker>
              );
            })}

            {/* Info Window for Selected Landmark */}
            {selectedLandmark && (
              <InfoWindow
                anchor={marker}
                onCloseClick={() => setSelectedLandmark(null)}
                headerDisabled
              >
                <div className="p-3 max-w-[280px] text-slate-900 font-sans">
                  {/* Title & Stats */}
                  <div className="border-b border-slate-100 pb-2 mb-2">
                    <h5 className="font-bold text-sm tracking-tight text-slate-900 flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">{selectedLandmark.name}</span>
                    </h5>
                    <div className="flex gap-2 mt-1.5 text-[10px] text-slate-500">
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded font-semibold text-slate-700">
                        Total Reports: {selectedLandmark.totalCount}
                      </span>
                      <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold">
                        Last 30 days: {selectedLandmark.countLast30Days}
                      </span>
                    </div>
                  </div>

                  {/* Category Breakdown list */}
                  <div className="space-y-1 mb-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Issues Reported Here
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(selectedLandmark.categories).map(([cat, count]) => (
                        <span
                          key={cat}
                          className="bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5 text-[10px] flex items-center gap-1 text-slate-700"
                        >
                          <span>{categoryEmojis[cat as CivicIssueCategory] || "⚠️"}</span>
                          <span>
                            {cat}: {count}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* List of latest incidents */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Recent History (Latest First)
                    </p>
                    <div className="space-y-1 max-h-[110px] overflow-y-auto pr-1">
                      {selectedLandmark.latestReports.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="text-[10px] p-1.5 bg-slate-50/80 rounded border border-slate-100/50 flex flex-col"
                        >
                          <div className="flex items-center justify-between font-semibold">
                            <span className="text-slate-800">
                              {categoryEmojis[item.category]} {item.category}
                            </span>
                            <span
                              className={`px-1 rounded-[3px] text-[8px] uppercase tracking-wider ${
                                item.status === "Resolved" || item.status === "Verified"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>
                          {item.aiDescription && (
                            <p className="text-slate-500 italic mt-0.5 line-clamp-1 leading-normal">
                              "{item.aiDescription}"
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </InfoWindow>
            )}
          </Map>
        </APIProvider>
      </div>
    </div>
  );
}
