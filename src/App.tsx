import React, { useState, useEffect, useRef } from "react";
import { auth, db } from "./lib/firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { collection, query, where, getDocs, setDoc, doc, getDoc } from "firebase/firestore";
import { LogOut, Star, Map, UserCheck, ShieldCheck, RefreshCw, Building2, Sparkles, X, ArrowLeft } from "lucide-react";
import AuthScreen from "./components/AuthScreen";
import ReportForm from "./components/ReportForm";
import ReportList from "./components/ReportList";
import MunicipalPortal from "./components/MunicipalPortal";
import GovernmentPortal from "./components/GovernmentPortal";
import GroupDrives from "./components/GroupDrives";
import { safeGetUserProfile, safeUpdateUserStreak, UserProfile } from "./lib/streaks";
import RegistrationScreen from "./components/RegistrationScreen";
import AdminApprovalPortal from "./components/AdminApprovalPortal";

// Seeding helper to pre-populate approved staff members if the collection is empty
const seedApprovedStaff = async () => {
  try {
    const staffRef = collection(db, "approved_staff");
    const snapshot = await getDocs(staffRef);
    if (snapshot.empty) {
      const defaultStaff = [
        { contact: "krohit78051@gmail.com", role: "government" },
        { contact: "google-hero@sandbox.local", role: "municipal" },
        { contact: "demo-hero@sandbox.local", role: "citizen" },
        { contact: "+11111111111", role: "municipal" },
        { contact: "+15555555555", role: "government" },
        { contact: "+919999999999", role: "government" }
      ];
      for (const staff of defaultStaff) {
        const docId = staff.contact.replace(/[^a-zA-Z0-9]/g, "_");
        await setDoc(doc(db, "approved_staff", docId), staff);
      }
      console.log("Pre-approved staff collection populated with government and municipal staff.");
    }
  } catch (err) {
    console.warn("Seeding approved_staff skipped or failed (expected if database is preparing):", err);
  }
};

const seedSuperAdminConfig = async () => {
  try {
    const docRef = doc(db, "config", "admin");
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      await setDoc(docRef, {
        superAdminEmail: "krohit78051@gmail.com"
      });
      console.log("Pre-seeded Super Admin config with krohit78051@gmail.com");
    }
  } catch (err) {
    console.warn("Seeding config collection failed/skipped:", err);
  }
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [userRole, setUserRole] = useState<"citizen" | "municipal" | "government">("citizen");
  const [activeTab, setActiveTab] = useState<"citizen" | "drives" | "municipal" | "government" | "admin">("citizen");
  const [isApprovedStaff, setIsApprovedStaff] = useState<boolean>(false);
  const [checkingStaff, setCheckingStaff] = useState<boolean>(false);
  const [isDemoUser, setIsDemoUser] = useState<boolean>(false);
  const [superAdminEmail, setSuperAdminEmail] = useState<string | null>(null);
  const isSuperAdmin = !!(user?.email && superAdminEmail && user.email.toLowerCase().trim() === superAdminEmail.toLowerCase().trim());
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState<boolean>(true);
  const [congratsMessage, setCongratsMessage] = useState<string | null>(null);
  const [isGeneratingCongrats, setIsGeneratingCongrats] = useState(false);
  const streakRef = useRef<number>(0);

  useEffect(() => {
    if (userProfile) {
      streakRef.current = userProfile.streakCount || 0;
    }
  }, [userProfile]);

  const fetchCongratsMessage = async (streakCount: number) => {
    setIsGeneratingCongrats(true);
    try {
      const res = await fetch("/api/streak-congrats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ streakCount }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setCongratsMessage(data.message);
        }
      }
    } catch (err) {
      console.error("Error fetching congrats message:", err);
    } finally {
      setIsGeneratingCongrats(false);
    }
  };

  useEffect(() => {
    // Check if there is a saved sandbox user in localStorage
    const savedSandboxUser = localStorage.getItem("community_hero_sandbox_user");
    if (savedSandboxUser) {
      try {
        setUser(JSON.parse(savedSandboxUser));
        setLoading(false);
        return;
      } catch (e) {
        localStorage.removeItem("community_hero_sandbox_user");
      }
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const fetchUserProfile = async () => {
    if (user?.uid) {
      setLoadingProfile(true);
      try {
        const profile = await safeGetUserProfile(user.uid);
        setUserProfile(profile);
      } catch (err) {
        console.error("Error fetching user profile:", err);
      } finally {
        setLoadingProfile(false);
      }
    } else {
      setUserProfile(null);
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    fetchUserProfile();
  }, [user, refreshTrigger]);

  useEffect(() => {
    const handleCivicAction = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const uid = customEvent.detail?.userId;
      if (uid && user && uid === user.uid) {
        const prevStreak = streakRef.current;
        const updated = await safeUpdateUserStreak(uid);
        if (updated) {
          setUserProfile(updated);
          if (updated.streakCount > prevStreak) {
            fetchCongratsMessage(updated.streakCount);
          }
        }
      }
    };
    window.addEventListener("civic-action", handleCivicAction);
    return () => window.removeEventListener("civic-action", handleCivicAction);
  }, [user]);

  // Fetch approved staff and check matching email/phone number
  useEffect(() => {
    if (!user) {
      setUserRole("citizen");
      setActiveTab("citizen");
      setIsApprovedStaff(false);
      setIsDemoUser(false);
      return;
    }

    const verifyStaffStatus = async () => {
      const isDemo = !!(
        user.isAnonymous ||
        (user as any).isSandbox ||
        user.email?.endsWith("@sandbox.local")
      );
      setIsDemoUser(isDemo);

      setCheckingStaff(true);
      try {
        await seedApprovedStaff();
        await seedSuperAdminConfig();

        // Fetch super admin config from Firestore
        let fetchedSuperAdminEmail = "krohit78051@gmail.com";
        try {
          const configRef = doc(db, "config", "admin");
          const configSnap = await getDoc(configRef);
          if (configSnap.exists()) {
            fetchedSuperAdminEmail = configSnap.data().superAdminEmail || "krohit78051@gmail.com";
          }
        } catch (configErr) {
          console.warn("Failed to fetch superAdmin config:", configErr);
        }
        setSuperAdminEmail(fetchedSuperAdminEmail);

        let foundRole: "citizen" | "municipal" | "government" = "citizen";
        
        // 1. Check live Firestore 'users' collection first
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        let userDocRole: string | undefined = undefined;
        let approvalStatus: string | undefined = undefined;

        if (userSnap.exists()) {
          const userData = userSnap.data();
          userDocRole = userData.role;
          approvalStatus = userData.approvalStatus;
        }

        // If user profile has "municipal" or "government" and is approved, use it.
        // If it's pending, they are treated as a standard "citizen" (with a pending status banner).
        if (userDocRole === "municipal" || userDocRole === "government") {
          if (approvalStatus !== "pending") {
            foundRole = userDocRole as "municipal" | "government";
          }
        } else {
          // 2. Fallback check against 'approved_staff' list for pre-approved or demo accounts
          const staffCollection = collection(db, "approved_staff");
          const queries = [];

          if (user.email) {
            queries.push(query(staffCollection, where("contact", "==", user.email.trim())));
          }
          
          if (user.phoneNumber) {
            const normalizedUserPhone = user.phoneNumber.replace(/[\s\-()]/g, "");
            queries.push(query(staffCollection, where("contact", "==", normalizedUserPhone)));
            if (normalizedUserPhone !== user.phoneNumber) {
              queries.push(query(staffCollection, where("contact", "==", user.phoneNumber)));
            }
          }

          for (const q of queries) {
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
              const data = snapshot.docs[0].data() as { contact?: string; role?: string };
              if (data.role === "municipal" || data.role === "government" || data.role === "citizen") {
                foundRole = data.role as "citizen" | "municipal" | "government";
              }
              break;
            }
          }
        }

        setUserRole(foundRole);
        setActiveTab((prev) => {
          // Only switch automatically if previous tab was the role tab or citizen
          if (prev === "citizen" || prev === "municipal" || prev === "government") {
            return foundRole;
          }
          return prev;
        });
        setIsApprovedStaff(foundRole !== "citizen");
      } catch (err) {
        console.error("Error verifying staff status against Firestore:", err);
        setUserRole("citizen");
        setActiveTab("citizen");
        setIsApprovedStaff(false);
      } finally {
        setCheckingStaff(false);
      }
    };

    verifyStaffStatus();
  }, [user, refreshTrigger]);

  const handleLogout = async () => {
    try {
      localStorage.removeItem("community_hero_sandbox_user");
      setUser(null);
      await signOut(auth);
    } catch (err) {
      console.error("Error signing out:", err);
    }
  };

  const handleAuthSuccess = (uid: string) => {
    console.log("Auth success! UID:", uid);
    const savedSandboxUser = localStorage.getItem("community_hero_sandbox_user");
    if (savedSandboxUser) {
      try {
        setUser(JSON.parse(savedSandboxUser));
      } catch (e) {}
    }
  };

  const triggerRefreshList = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleRegisterComplete = (profileData: any) => {
    setUserProfile(profileData);
  };

  if (loading || checkingStaff || (user && loadingProfile)) {
    return (
      <div id="app_loading_screen" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-400">
        <RefreshCw className="h-10 w-10 animate-spin text-blue-600 mb-2" />
        <p className="text-sm font-semibold text-slate-800">
          {checkingStaff ? "Verifying authorized credentials..." : "Authenticating Civic Portal..."}
        </p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onSuccess={handleAuthSuccess} />;
  }

  // If user is logged in, but has no name registered, show the Registration Screen
  if (!userProfile || !userProfile.name) {
    return <RegistrationScreen user={user} onRegisterComplete={handleRegisterComplete} onBack={handleLogout} />;
  }

  // Get masked/simple UID or phone for header display
  const userIdentifier = userProfile.name || user.phoneNumber || (user.isAnonymous ? "Demo Citizen" : "Citizen User");

  return (
    <div id="app_dashboard" className="min-h-screen bg-slate-50/50 text-slate-900 flex flex-col">
      {/* Top Navigation Header */}
      <header id="app_header" className="sticky top-0 z-45 w-full bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-3 sm:py-0 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <button
              id="btn_header_back"
              onClick={() => {
                if (activeTab !== "citizen") {
                  setActiveTab("citizen");
                } else {
                  handleLogout();
                }
              }}
              className="mr-1.5 p-2 rounded-xl text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/60 transition-colors flex items-center justify-center cursor-pointer shadow-sm"
              title={activeTab !== "citizen" ? "Back to Citizen Dashboard" : "Sign Out"}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
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

          {/* User profile & Sign out */}
          <div id="user_profile_action" className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-3">
            
            {isApprovedStaff ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-xs font-bold text-emerald-800">
                {userRole === "government" ? "🏛️ Government Account" : "👷 Municipal Account"}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-xl text-xs font-bold text-blue-800">
                👤 Citizen Account
              </div>
            )}

            {userProfile && userProfile.streakCount > 0 && (
              <div id="header_streak_badge" className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200/50 rounded-xl text-xs font-black text-amber-800" title={`Current streak: ${userProfile.streakCount} days`}>
                <span>🔥 {userProfile.streakCount} Day Streak</span>
                {userProfile.streakCount >= 25 && <span className="text-sm" title="Gold Civic Hero">🥇</span>}
                {userProfile.streakCount >= 10 && userProfile.streakCount < 25 && <span className="text-sm" title="Silver Civic Hero">🥈</span>}
                {userProfile.streakCount >= 5 && userProfile.streakCount < 10 && <span className="text-sm" title="Bronze Civic Hero">🥉</span>}
              </div>
            )}

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 text-xs font-medium text-slate-700">
              <UserCheck className="h-3.5 w-3.5 text-blue-500" />
              <span>{userIdentifier}</span>
            </div>
            
            <button
              id="btn_logout"
              onClick={handleLogout}
              className="p-2.5 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center justify-center cursor-pointer border border-transparent hover:border-rose-100"
              title="Sign Out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main id="app_main_content" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {userProfile?.approvalStatus === "pending" && (
          <div id="pending_approval_banner" className="mb-6 p-4 bg-amber-50 border-2 border-amber-500/30 rounded-2xl shadow-sm flex items-start gap-3.5">
            <div className="h-10 w-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center text-lg shrink-0">
              ⏳
            </div>
            <div>
              <h4 className="text-xs font-black text-amber-800 uppercase tracking-wider">
                Access Request Pending
              </h4>
              <p className="text-sm font-semibold text-slate-800 mt-1 leading-snug">
                Your Municipal/Government access request is pending approval.
              </p>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                Requested Role: <strong className="capitalize text-amber-800">{userProfile.requestedRole} Staff</strong>. You can use the Citizen Reporting Center while an administrator reviews your request.
              </p>
            </div>
          </div>
        )}

        {/* Navigation Tabs for Municipal & Government workers */}
        {/* Navigation Tabs for all roles */}
        <div id="app_tabs_container" className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-8 border-b border-slate-200/60 pb-px">
          <button
            id="tab_citizen_view"
            onClick={() => setActiveTab("citizen")}
            className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "citizen"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            📣 Citizen Reporting Center
          </button>
          
          <button
            id="tab_group_drives"
            onClick={() => setActiveTab("drives")}
            className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "drives"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            🚗 Group Drives
          </button>

          {(userRole === "municipal" || userRole === "government") && (
            <>
              <button
                id="tab_municipal_view"
                onClick={() => setActiveTab("municipal")}
                className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === "municipal"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                👷 Municipal Dispatch Queue
              </button>
              {userRole === "government" && (
                <>
                  <button
                    id="tab_government_view"
                    onClick={() => setActiveTab("government")}
                    className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === "government"
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    🏛️ Government Analytics Portal
                  </button>
                  {isSuperAdmin && (
                    <button
                      id="tab_admin_view"
                      onClick={() => setActiveTab("admin")}
                      className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                        activeTab === "admin"
                          ? "border-blue-600 text-blue-600"
                          : "border-transparent text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      🔑 Staff Approvals
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {activeTab === "municipal" && (userRole === "municipal" || userRole === "government") ? (
          <MunicipalPortal currentUserId={user.uid} userRole={userRole} />
        ) : activeTab === "government" && userRole === "government" ? (
          <GovernmentPortal currentUserId={user.uid} userRole={userRole} />
        ) : activeTab === "admin" && isSuperAdmin ? (
          <AdminApprovalPortal 
            currentUserId={user.uid} 
            onActionComplete={triggerRefreshList} 
            isSuperAdmin={isSuperAdmin}
            currentUserEmail={user?.email || ""}
          />
        ) : activeTab === "drives" ? (
          <GroupDrives currentUserId={user.uid} />
        ) : (
          <>
            {/* Welcome Section */}
            <div id="welcome_banner" className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="font-sans text-2xl font-bold tracking-tight text-slate-900">
                  Hello, Community Hero!
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Snap photos of local infrastructure hazards, auto-tag GPS locations, and submit reports to help keep our neighborhood safe.
                </p>
              </div>
              
              <div className="flex items-center gap-2 text-xs bg-emerald-50 text-emerald-800 border border-emerald-100 px-3.5 py-2 rounded-xl font-medium max-w-max">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>Active Reporting Zone</span>
              </div>
            </div>

            {/* Gemini Streak Congrats Banner */}
            {congratsMessage && (
              <div id="streak_congrats_banner" className="mb-6 p-4 bg-gradient-to-r from-yellow-500/10 via-amber-500/10 to-orange-500/10 border-2 border-amber-500/30 rounded-2xl relative shadow-md flex items-center justify-between gap-4 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-amber-500/20 text-amber-600 rounded-xl flex items-center justify-center text-lg select-none">
                    ✨
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-amber-800 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-amber-600" /> New Milestone Reached!
                    </h4>
                    <p className="text-sm font-semibold text-slate-800 mt-1 leading-snug">
                      {congratsMessage}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setCongratsMessage(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition-colors cursor-pointer"
                  title="Dismiss message"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Streak & Badges Widget */}
            <div id="streak_milestones_card" className="mb-8 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="h-12 w-12 bg-amber-500 rounded-xl flex items-center justify-center shadow-md shadow-amber-500/20 text-white font-sans text-xl font-black">
                  🔥
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">Your Civic Activity Streak</span>
                    <span className="bg-amber-100 text-amber-800 font-extrabold text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      {userProfile?.streakCount || 0} Day{(userProfile?.streakCount || 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">
                    Increment your streak daily by reporting issues, voting, or confirming fixes!
                  </p>
                </div>
              </div>

              {/* Milestone Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all duration-300 ${
                  (userProfile?.streakCount || 0) >= 5
                    ? "bg-amber-100 text-amber-800 border-amber-300 shadow-sm font-bold"
                    : "bg-slate-50 text-slate-400 border-slate-100 opacity-60"
                }`} title="Unlock at a 5-day active streak">
                  <span>🥉 Bronze Civic Hero</span>
                  {(userProfile?.streakCount || 0) >= 5 && <span className="text-[10px] text-amber-600 font-extrabold uppercase ml-0.5">Unlocked</span>}
                </div>
                
                <div className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all duration-300 ${
                  (userProfile?.streakCount || 0) >= 10
                    ? "bg-slate-100 text-slate-800 border-slate-300 shadow-sm font-bold"
                    : "bg-slate-50 text-slate-400 border-slate-100 opacity-60"
                }`} title="Unlock at a 10-day active streak">
                  <span>🥈 Silver Civic Hero</span>
                  {(userProfile?.streakCount || 0) >= 10 && <span className="text-[10px] text-slate-600 font-extrabold uppercase ml-0.5">Unlocked</span>}
                </div>

                <div className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all duration-300 ${
                  (userProfile?.streakCount || 0) >= 25
                    ? "bg-yellow-100 text-yellow-800 border-yellow-300 shadow-sm font-bold animate-bounce-subtle"
                    : "bg-slate-50 text-slate-400 border-slate-100 opacity-60"
                }`} title="Unlock at a 25-day active streak">
                  <span>🥇 Gold Civic Hero</span>
                  {(userProfile?.streakCount || 0) >= 25 && <span className="text-[10px] text-yellow-600 font-extrabold uppercase ml-0.5">Unlocked</span>}
                </div>
              </div>
            </div>

            {/* Dashboard grid */}
            <div id="dashboard_grid" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Panel: Report Submission */}
              <div className="lg:col-span-5 lg:sticky lg:top-24">
                <ReportForm userId={user.uid} onReportSubmitted={triggerRefreshList} />
              </div>

              {/* Right Panel: Feed */}
              <div className="lg:col-span-7" key={refreshTrigger}>
                <ReportList currentUserId={user.uid} currentUser={user} />
              </div>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer id="app_footer" className="bg-white border-t border-slate-100 py-6 mt-16 text-center text-xs text-slate-400">
        <p>© 2026 Community Hero. Designed with a clean, responsive layout & secure Firebase infrastructure.</p>
      </footer>
    </div>
  );
}
