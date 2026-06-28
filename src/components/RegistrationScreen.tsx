import React, { useState, useRef, useEffect } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { User, Camera, Upload, ArrowRight, Shield, Calendar, Award, ArrowLeft, Star } from "lucide-react";

interface RegistrationScreenProps {
  user: any;
  onRegisterComplete: (profileData: {
    name: string;
    age?: string;
    photoUrl?: string;
    role: "citizen";
    phoneNumber?: string;
    signupDate: string;
  }) => void;
  onBack?: () => void;
}

const DEFAULT_AVATARS = [
  "https://api.dicebear.com/7.x/bottts/svg?seed=hero1",
  "https://api.dicebear.com/7.x/bottts/svg?seed=hero2",
  "https://api.dicebear.com/7.x/bottts/svg?seed=hero3",
  "https://api.dicebear.com/7.x/bottts/svg?seed=hero4",
];

export default function RegistrationScreen({ user, onRegisterComplete, onBack }: RegistrationScreenProps) {
  const [fullName, setFullName] = useState(() => {
    if (!user?.uid) return "";
    return sessionStorage.getItem(`registration_fullName_${user.uid}`) || user.displayName || "";
  });
  const [age, setAge] = useState(() => {
    if (!user?.uid) return "";
    return sessionStorage.getItem(`registration_age_${user.uid}`) || "";
  });
  const [photoUrl, setPhotoUrl] = useState(() => {
    if (!user?.uid) return "";
    return sessionStorage.getItem(`registration_photoUrl_${user.uid}`) || "";
  });
  const [selectedRole, setSelectedRole] = useState<"citizen" | "municipal" | "government">(() => {
    if (!user?.uid) return "citizen";
    return (sessionStorage.getItem(`registration_selectedRole_${user.uid}`) as any) || "citizen";
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user?.uid) {
      sessionStorage.setItem(`registration_fullName_${user.uid}`, fullName);
    }
  }, [fullName, user?.uid]);

  useEffect(() => {
    if (user?.uid) {
      sessionStorage.setItem(`registration_age_${user.uid}`, age);
    }
  }, [age, user?.uid]);

  useEffect(() => {
    if (user?.uid) {
      sessionStorage.setItem(`registration_photoUrl_${user.uid}`, photoUrl);
    }
  }, [photoUrl, user?.uid]);

  useEffect(() => {
    if (user?.uid) {
      sessionStorage.setItem(`registration_selectedRole_${user.uid}`, selectedRole);
    }
  }, [selectedRole, user?.uid]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (PNG, JPG, etc.).");
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      setError("Image size should be less than 1.5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setPhotoUrl(e.target.result as string);
        setError(null);
      }
    };
    reader.onerror = () => {
      setError("Error reading file.");
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    setLoading(true);
    setError(null);

    const signupDate = new Date().toISOString();
    const finalPhoto = photoUrl || DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];

    const rawProfileData = {
      userId: user.uid,
      name: fullName.trim(),
      age: age.trim() ? age.trim() : null,
      photoUrl: finalPhoto,
      phoneNumber: user.phoneNumber || user.email || "",
      signupDate: signupDate,
      role: "citizen" as const, // Standard role is citizen initially, approved when approved
      requestedRole: selectedRole,
      approvalStatus: selectedRole === "citizen" ? "approved" : "pending",
      streakCount: 1, // Start with a day-1 streak!
      lastActiveDate: new Date().toLocaleDateString("en-CA"),
    };

    // Sanitize any undefined fields to be safe with Firestore setDoc
    const profileData = Object.fromEntries(
      Object.entries(rawProfileData).filter(([_, v]) => v !== undefined)
    );

    try {
      // 1. Write user profile to Firestore
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, profileData, { merge: true });

      // 2. Also back up locally to local storage (crucial for local sandbox consistency)
      const localKey = `civic_hero_streak_${user.uid}`;
      localStorage.setItem(localKey, JSON.stringify({
        userId: user.uid,
        streakCount: 1,
        lastActiveDate: rawProfileData.lastActiveDate,
        name: rawProfileData.name,
        age: rawProfileData.age,
        photoUrl: rawProfileData.photoUrl,
        signupDate: rawProfileData.signupDate,
        role: rawProfileData.role,
        requestedRole: rawProfileData.requestedRole,
        approvalStatus: rawProfileData.approvalStatus,
        phoneNumber: rawProfileData.phoneNumber
      }));

      // 3. Callback to update state
      onRegisterComplete(profileData as any);
    } catch (err: any) {
      console.error("Error creating user profile:", err);
      setError(err.message || "Failed to save profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="registration_container" className="min-h-screen bg-slate-50 flex flex-col justify-start">
      {/* Top Navigation Header */}
      <header id="registration_header" className="w-full bg-white border-b border-slate-100 shadow-sm py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                id="btn_registration_header_back"
                onClick={onBack}
                className="p-2 rounded-xl text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/60 transition-colors flex items-center justify-center cursor-pointer shadow-sm"
                title="Back to Sign In"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-100">
              <Star className="h-5 w-5 fill-white" />
            </div>
            <div>
              <h1 className="font-sans text-base font-semibold tracking-tight text-slate-900 leading-tight">
                Community Hero
              </h1>
              <span className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">
                Civic Action Portal
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            <div className="h-12 w-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
              <Award className="h-6 w-6" />
            </div>
          </div>
          <h2 id="registration_title" className="mt-6 text-center text-3xl font-bold tracking-tight text-slate-900 font-sans">
            Create Your Citizen Profile
          </h2>
          <p className="mt-2 text-center text-sm text-slate-600">
            Join your local community and start earning civic hero badges
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow-md rounded-3xl border border-slate-100 sm:px-10">
            <form id="registration_form" onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div id="registration_error" className="p-4 bg-rose-50 border-l-4 border-rose-500 rounded-r-lg text-rose-700 text-xs font-semibold leading-relaxed">
                {error}
              </div>
            )}

            {/* Profile Photo Upload */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Profile Photo (Optional)
              </label>
              
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center relative group">
                  {photoUrl ? (
                    <img src={photoUrl} alt="Avatar Preview" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-8 w-8 text-slate-400" />
                  )}
                </div>

                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed ${
                    dragActive ? "border-blue-500 bg-blue-50/50" : "border-slate-200 hover:border-blue-500 hover:bg-slate-50"
                  } rounded-2xl p-4 cursor-pointer transition-all text-center`}
                >
                  <Upload className="h-5 w-5 text-slate-400 mb-1" />
                  <p className="text-[11px] font-semibold text-slate-700">
                    Drag & drop or <span className="text-blue-600">browse</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">PNG, JPG up to 1.5MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>

              {photoUrl && (
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => setPhotoUrl("")}
                    className="text-xs text-rose-600 hover:underline font-semibold cursor-pointer"
                  >
                    Remove Photo
                  </button>
                </div>
              )}
            </div>

            {/* Full Name */}
            <div>
              <label htmlFor="reg_full_name" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Full Name <span className="text-red-500">*</span>
              </label>
              <div className="mt-2">
                <input
                  id="reg_full_name"
                  type="text"
                  required
                  placeholder="e.g. Rohit Kumar"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={loading}
                  className="block w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium transition-colors text-slate-950"
                />
              </div>
            </div>

            {/* Age */}
            <div>
              <label htmlFor="reg_age" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Age (Optional)
              </label>
              <div className="mt-2">
                <input
                  id="reg_age"
                  type="number"
                  min="1"
                  max="125"
                  placeholder="e.g. 28"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  disabled={loading}
                  className="block w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium transition-colors text-slate-950"
                />
              </div>
            </div>

            {/* Role Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Select Your Role <span className="text-red-500">*</span>
              </label>
              <div className="mt-3 grid grid-cols-1 gap-3">
                <button
                  type="button"
                  id="role_citizen"
                  onClick={() => setSelectedRole("citizen")}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedRole === "citizen"
                      ? "border-blue-600 bg-blue-50/40 ring-1 ring-blue-600"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                  }`}
                >
                  <div className={`mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                    selectedRole === "citizen" ? "border-blue-600" : "border-slate-300"
                  }`}>
                    {selectedRole === "citizen" && <div className="h-2 w-2 rounded-full bg-blue-600" />}
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-900">👤 Citizen Profile</span>
                    <span className="block text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                      Instant access to report hazards, track community cleanup metrics, and participate in group drives.
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  id="role_municipal"
                  onClick={() => setSelectedRole("municipal")}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedRole === "municipal"
                      ? "border-blue-600 bg-blue-50/40 ring-1 ring-blue-600"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                  }`}
                >
                  <div className={`mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                    selectedRole === "municipal" ? "border-blue-600" : "border-slate-300"
                  }`}>
                    {selectedRole === "municipal" && <div className="h-2 w-2 rounded-full bg-blue-600" />}
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-900">👷 Municipal Staff</span>
                    <span className="block text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                      Access Dispatch Queue to process civic reports, update fix statuses, and coordinate with crews. (Requires Approval)
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  id="role_government"
                  onClick={() => setSelectedRole("government")}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedRole === "government"
                      ? "border-blue-600 bg-blue-50/40 ring-1 ring-blue-600"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                  }`}
                >
                  <div className={`mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                    selectedRole === "government" ? "border-blue-600" : "border-slate-300"
                  }`}>
                    {selectedRole === "government" && <div className="h-2 w-2 rounded-full bg-blue-600" />}
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-900">🏛️ Government Staff</span>
                    <span className="block text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                      Access Government Analytics, review resource allocation, approve staff, and see region heatmaps. (Requires Approval)
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div>
              <button
                id="btn_submit_registration"
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? "Registering Profile..." : "Complete Registration"}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
);
}
