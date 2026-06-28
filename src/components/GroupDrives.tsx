import React, { useState, useEffect } from "react";
import { db, storage, auth } from "../lib/firebase";
import { collection, doc, addDoc, updateDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { GroupDrive, GPSLocation } from "../types";
import { 
  Users, 
  Calendar, 
  MapPin, 
  Camera, 
  CheckCircle2, 
  X, 
  Plus, 
  ArrowRight,
  AlertCircle,
  Clock,
  Loader2,
  Check,
  Award,
  Sparkles
} from "lucide-react";
import CameraCapture from "./CameraCapture";

interface GroupDrivesProps {
  currentUserId: string;
}

const COMMON_LANDMARKS = [
  "Town Hall Square",
  "Central Market",
  "Civic Hospital Junction",
  "Metro Station Main Gate",
  "District Public Library",
  "City Stadium Parking",
  "High Street Intersection"
];

export default function GroupDrives({ currentUserId }: GroupDrivesProps) {
  const [drives, setDrives] = useState<GroupDrive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [landmarkName, setLandmarkName] = useState("");
  const [driveDate, setDriveDate] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Active drive completion state
  const [completingDriveId, setCompletingDriveId] = useState<string | null>(null);
  const [beforePhoto, setBeforePhoto] = useState<string | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);
  const [cameraType, setCameraType] = useState<'before' | 'after' | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);

  // Filter tabs
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'completed'>('all');

  // Real-time listener for group drives
  useEffect(() => {
    const q = collection(db, "group_drives");
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: GroupDrive[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          landmarkName: data.landmarkName,
          date: data.date,
          creatorId: data.creatorId,
          creatorName: data.creatorName,
          participants: data.participants || [],
          minParticipants: data.minParticipants || 10,
          status: data.status || 'Open',
          beforePhotoUrl: data.beforePhotoUrl,
          afterPhotoUrl: data.afterPhotoUrl,
          completedAt: data.completedAt ? (typeof data.completedAt.toDate === "function" ? data.completedAt.toDate() : new Date(data.completedAt)) : undefined,
        });
      });
      // Sort: Open/Confirmed first, then newest first
      list.sort((a, b) => {
        if (a.status === 'Completed' && b.status !== 'Completed') return 1;
        if (a.status !== 'Completed' && b.status === 'Completed') return -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
      setDrives(list);
      setLoading(false);
    }, (err) => {
      console.error("Error loading group drives:", err);
      setError("Failed to stream group drives: " + err.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleCreateDrive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!landmarkName.trim() || !driveDate) {
      setError("Please fill in all fields.");
      return;
    }

    try {
      setIsCreating(true);
      setError(null);

      const creatorUser = auth.currentUser;
      const userName = creatorUser?.displayName || creatorUser?.email || creatorUser?.phoneNumber || "Demo Citizen";

      const newDrive: Omit<GroupDrive, 'id'> = {
        landmarkName: landmarkName.trim(),
        date: driveDate,
        creatorId: currentUserId,
        creatorName: userName,
        participants: [currentUserId], // Automatically join
        minParticipants: 10,
        status: "Open"
      };

      await addDoc(collection(db, "group_drives"), newDrive);

      setLandmarkName("");
      setDriveDate("");
      setIsCreateOpen(false);
    } catch (err: any) {
      console.error("Error creating drive:", err);
      setError("Failed to create drive: " + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinDrive = async (driveId: string, currentParticipants: string[]) => {
    try {
      if (currentParticipants.includes(currentUserId)) return;
      const updatedParticipants = [...currentParticipants, currentUserId];
      const updatedStatus = updatedParticipants.length >= 10 ? "Confirmed" : "Open";

      await updateDoc(doc(db, "group_drives", driveId), {
        participants: updatedParticipants,
        status: updatedStatus
      });
    } catch (err: any) {
      console.error("Error joining drive:", err);
    }
  };

  const handleCameraCapture = (photoBase64: string) => {
    if (cameraType === 'before') {
      setBeforePhoto(photoBase64);
    } else if (cameraType === 'after') {
      setAfterPhoto(photoBase64);
    }
    setIsCameraOpen(false);
    setCameraType(null);
  };

  const handleCompleteDriveSubmit = async () => {
    if (!completingDriveId || !beforePhoto || !afterPhoto) {
      setCompletionError("Both before and after photos are strictly required to complete the drive.");
      return;
    }

    try {
      setIsCompleting(true);
      setCompletionError(null);

      // Upload photos to Storage
      const beforeRef = ref(storage, `group_drives/${completingDriveId}_before.jpg`);
      await uploadString(beforeRef, beforePhoto, "data_url");
      const beforePhotoUrl = await getDownloadURL(beforeRef);

      const afterRef = ref(storage, `group_drives/${completingDriveId}_after.jpg`);
      await uploadString(afterRef, afterPhoto, "data_url");
      const afterPhotoUrl = await getDownloadURL(afterRef);

      // Update Firestore Group Drive
      await updateDoc(doc(db, "group_drives", completingDriveId), {
        status: "Completed",
        beforePhotoUrl,
        afterPhotoUrl,
        completedAt: serverTimestamp()
      });

      // Clear state
      setCompletingDriveId(null);
      setBeforePhoto(null);
      setAfterPhoto(null);
    } catch (err: any) {
      console.error("Error completing drive:", err);
      setCompletionError("Failed to submit completion proof: " + err.message);
    } finally {
      setIsCompleting(false);
    }
  };

  const filteredDrives = drives.filter(d => {
    if (filterTab === 'active') return d.status !== 'Completed';
    if (filterTab === 'completed') return d.status === 'Completed';
    return true;
  });

  return (
    <div id="group_drives_panel" className="space-y-6">
      {/* Tab Header / Controls */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            🚗 Community Group Drives
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Coordinate civic actions. Launch a local drive, gather 10+ participants, and work together on-site!
          </p>
        </div>
        <button
          id="btn_start_group_drive"
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center justify-center gap-1.5 px-4.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-md shadow-blue-100"
        >
          <Plus className="h-4 w-4" />
          Start a Group Drive
        </button>
      </div>

      {/* Create Drive Dialog Modal */}
      {isCreateOpen && (
        <div id="create_drive_modal" className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 max-w-md w-full p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Start a Community Drive
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDrive} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Area / Landmark Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Central Market Parking Lot"
                  value={landmarkName}
                  onChange={(e) => setLandmarkName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {COMMON_LANDMARKS.slice(0, 4).map((landmark) => (
                    <button
                      key={landmark}
                      type="button"
                      onClick={() => setLandmarkName(landmark)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] text-slate-600 transition cursor-pointer"
                    >
                      {landmark}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Target Drive Date
                </label>
                <input
                  type="date"
                  required
                  value={driveDate}
                  onChange={(e) => setDriveDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-100/50 rounded-xl">
                <p className="text-[10px] text-blue-800 leading-relaxed">
                  💡 <strong>Dynamic Validation Note:</strong> The group drive requires a minimum of <strong>10 participants</strong>. Once reached, it receives the official <strong>"Drive Confirmed"</strong> status. The creator can then record live before/after verification photos on-site to mark it Completed.
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create Drive
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Active Drive Completion Modal */}
      {completingDriveId && (
        <div id="complete_drive_modal" className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 max-w-lg w-full p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Mark Group Drive Complete
              </h3>
              <button
                onClick={() => {
                  setCompletingDriveId(null);
                  setBeforePhoto(null);
                  setAfterPhoto(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                To finalize this drive, you must capture a live <strong>Before Photo</strong> (at the start of cleanup) and a <strong>After Photo</strong> (of the finished cleanup) on-site.
              </p>

              <div className="grid grid-cols-2 gap-4">
                {/* Before Photo Box */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Before Photo
                  </span>
                  {beforePhoto ? (
                    <div className="relative h-32 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                      <img src={beforePhoto} alt="Before preview" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setBeforePhoto(null)}
                        className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-black/80 rounded-full text-white transition cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setCameraType('before');
                        setIsCameraOpen(true);
                      }}
                      className="h-32 w-full rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/50 flex flex-col items-center justify-center gap-1.5 text-slate-500 hover:text-blue-600 transition cursor-pointer"
                    >
                      <Camera className="h-5 w-5" />
                      <span className="text-[10px] font-bold">Capture Before</span>
                    </button>
                  )}
                </div>

                {/* After Photo Box */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    After Photo
                  </span>
                  {afterPhoto ? (
                    <div className="relative h-32 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                      <img src={afterPhoto} alt="After preview" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setAfterPhoto(null)}
                        className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-black/80 rounded-full text-white transition cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setCameraType('after');
                        setIsCameraOpen(true);
                      }}
                      className="h-32 w-full rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/50 flex flex-col items-center justify-center gap-1.5 text-slate-500 hover:text-blue-600 transition cursor-pointer"
                    >
                      <Camera className="h-5 w-5" />
                      <span className="text-[10px] font-bold">Capture After</span>
                    </button>
                  )}
                </div>
              </div>

              {completionError && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{completionError}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCompletingDriveId(null);
                    setBeforePhoto(null);
                    setAfterPhoto(null);
                  }}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCompleteDriveSubmit}
                  disabled={isCompleting || !beforePhoto || !afterPhoto}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isCompleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Confirm & Complete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Camera Overlay */}
      {isCameraOpen && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onCancel={() => {
            setIsCameraOpen(false);
            setCameraType(null);
          }}
        />
      )}

      {/* Filter Options */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              filterTab === 'all'
                ? "bg-slate-100 text-slate-800"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            All Drives
          </button>
          <button
            onClick={() => setFilterTab('active')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              filterTab === 'active'
                ? "bg-slate-100 text-slate-800"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilterTab('completed')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              filterTab === 'completed'
                ? "bg-slate-100 text-slate-800"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Completed
          </button>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          {filteredDrives.length} drives listed
        </span>
      </div>

      {/* List / Grid of Drives */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin mb-2" />
          <p className="text-xs text-slate-500">Syncing live group drives...</p>
        </div>
      ) : filteredDrives.length === 0 ? (
        <div className="bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-10 text-center">
          <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-700">No community drives found</p>
          <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
            Get the neighborhood together! Click "Start a Group Drive" above to organize a local clean-up.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDrives.map((drive) => {
            const hasJoined = drive.participants.includes(currentUserId);
            const isCreator = drive.creatorId === currentUserId;
            const percentage = Math.min(100, (drive.participants.length / 10) * 100);

            return (
              <div
                key={drive.id}
                className={`bg-white rounded-2xl border p-5 shadow-sm transition-all duration-200 flex flex-col justify-between ${
                  drive.status === 'Completed'
                    ? "border-emerald-100 bg-emerald-50/5 hover:border-emerald-200"
                    : drive.status === 'Confirmed'
                    ? "border-amber-200 bg-amber-50/10 hover:border-amber-300 shadow-amber-50/10"
                    : "border-slate-100 hover:border-slate-200"
                }`}
              >
                <div className="space-y-3.5">
                  {/* Card Header Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold font-mono tracking-wider text-slate-400 flex items-center gap-1 uppercase">
                      <Clock className="h-3 w-3 text-slate-300 shrink-0" />
                      Date: {drive.date}
                    </span>
                    {drive.status === "Completed" ? (
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Completed
                      </span>
                    ) : drive.status === "Confirmed" || drive.participants.length >= 10 ? (
                      <span className="px-2.5 py-1 bg-emerald-500 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm animate-pulse">
                        <Award className="h-3.5 w-3.5 text-white" />
                        Drive Confirmed
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-[10px] font-bold">
                        Open Group Drive
                      </span>
                    )}
                  </div>

                  {/* Landmarks */}
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-800 tracking-tight leading-snug flex items-center gap-1">
                      <MapPin className="h-4 w-4 text-rose-500 shrink-0" />
                      Cleanup at {drive.landmarkName}
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Organized by <span className="font-semibold text-slate-600">{drive.creatorName}</span>
                    </p>
                  </div>

                  {/* Progress Bar (participants) */}
                  {drive.status !== 'Completed' && (
                    <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-600 flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-slate-400" />
                          Participants count
                        </span>
                        <span className="font-bold text-slate-800 font-mono">
                          {drive.participants.length} / 10 joined
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 rounded-full ${
                            drive.participants.length >= 10 ? "bg-emerald-500" : "bg-blue-600"
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      {drive.participants.length >= 10 && (
                        <p className="text-[9px] font-bold text-emerald-700 tracking-wide uppercase flex items-center gap-0.5 mt-1 animate-bounce">
                          🎉 Goal Met! Ready to Cleanup
                        </p>
                      )}
                    </div>
                  )}

                  {/* Before/After visual comparison */}
                  {drive.status === 'Completed' && drive.beforePhotoUrl && drive.afterPhotoUrl && (
                    <div className="grid grid-cols-2 gap-2 bg-slate-50/50 p-2 rounded-xl border border-slate-100">
                      <div className="space-y-1">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block text-center">Before Cleanup</span>
                        <div className="h-20 rounded-lg overflow-hidden border border-slate-200 bg-black">
                          <img src={drive.beforePhotoUrl} alt="Before" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[8px] font-bold text-emerald-600 uppercase tracking-wider block text-center">After Fixed</span>
                        <div className="h-20 rounded-lg overflow-hidden border border-emerald-200 bg-black">
                          <img src={drive.afterPhotoUrl} alt="After" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions Bottom panel */}
                <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {hasJoined && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700">
                        <Check className="h-3 w-3 text-blue-600 shrink-0" />
                        You've Joined
                      </span>
                    )}
                    {isCreator && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700">
                        <Sparkles className="h-3 w-3 text-purple-600 shrink-0" />
                        Organized by you
                      </span>
                    )}
                  </div>

                  {drive.status !== 'Completed' && (
                    <div className="flex items-center gap-2">
                      {isCreator && (
                        <button
                          id={`btn_complete_drive_${drive.id}`}
                          onClick={() => setCompletingDriveId(drive.id!)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center gap-1 shadow-sm"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Mark Complete
                        </button>
                      )}

                      {!hasJoined && (
                        <button
                          id={`btn_join_drive_${drive.id}`}
                          onClick={() => handleJoinDrive(drive.id!, drive.participants)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                        >
                          <Users className="h-3.5 w-3.5" />
                          Join Drive
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
