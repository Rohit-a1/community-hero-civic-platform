import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { UserCheck, UserX, ShieldAlert, CheckCircle2, RefreshCw, Calendar, Phone, Award } from "lucide-react";

interface PendingUser {
  userId: string;
  name: string;
  age?: string;
  photoUrl?: string;
  phoneNumber?: string;
  requestedRole: string;
  signupDate?: string;
  approvalStatus: string;
}

interface AdminApprovalPortalProps {
  currentUserId: string;
  onActionComplete: () => void;
  isSuperAdmin?: boolean;
  currentUserEmail?: string;
}

export default function AdminApprovalPortal({ 
  currentUserId, 
  onActionComplete,
  isSuperAdmin = false,
  currentUserEmail = ""
}: AdminApprovalPortalProps) {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Transfer state
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  const handleTransferAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail.trim()) return;
    
    const trimmedEmail = newAdminEmail.trim().toLowerCase();
    if (trimmedEmail === currentUserEmail.toLowerCase()) {
      setTransferError("You are already the Super Admin.");
      setTransferSuccess(null);
      return;
    }

    setTransferring(true);
    setTransferError(null);
    setTransferSuccess(null);

    try {
      const configRef = doc(db, "config", "admin");
      await setDoc(configRef, { superAdminEmail: trimmedEmail }, { merge: true });
      setTransferSuccess(`Super Admin access successfully transferred to ${trimmedEmail}!`);
      setNewAdminEmail("");
      onActionComplete();
    } catch (err: any) {
      console.error("Error transferring Super Admin access:", err);
      setTransferError(`Failed to transfer access: ${err.message || "Unknown error"}`);
    } finally {
      setTransferring(false);
    }
  };

  const fetchPendingUsers = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("approvalStatus", "==", "pending"));
      const querySnapshot = await getDocs(q);
      const list: PendingUser[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          userId: doc.id,
          name: data.name || "Anonymous User",
          age: data.age,
          photoUrl: data.photoUrl,
          phoneNumber: data.phoneNumber || "",
          requestedRole: data.requestedRole || "municipal",
          signupDate: data.signupDate,
          approvalStatus: data.approvalStatus || "pending"
        });
      });
      setPendingUsers(list);
    } catch (err: any) {
      console.error("Error fetching pending users:", err);
      setErrorMsg("Failed to load pending approvals. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const handleApprove = async (user: PendingUser) => {
    setActioningId(user.userId);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      // 1. Update users collection
      const userRef = doc(db, "users", user.userId);
      await updateDoc(userRef, {
        role: user.requestedRole,
        approvalStatus: "approved"
      });

      // 2. Add to approved_staff registry to ensure robust login access
      const contact = user.phoneNumber || user.userId;
      const docId = contact.replace(/[^a-zA-Z0-9]/g, "_");
      const staffRef = doc(db, "approved_staff", docId);
      await setDoc(staffRef, {
        contact: contact,
        role: user.requestedRole
      });

      setSuccessMsg(`Approved ${user.name} as ${user.requestedRole === "government" ? "Government" : "Municipal"} Staff!`);
      
      // Refresh local state and notify parent App
      await fetchPendingUsers();
      onActionComplete();
    } catch (err: any) {
      console.error("Error approving user:", err);
      setErrorMsg(`Failed to approve user: ${err.message || "Unknown error"}`);
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (user: PendingUser) => {
    setActioningId(user.userId);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      // Update users collection status to rejected, fallback role stays citizen
      const userRef = doc(db, "users", user.userId);
      await updateDoc(userRef, {
        role: "citizen",
        approvalStatus: "rejected"
      });

      setSuccessMsg(`Rejected access request for ${user.name}.`);
      
      // Refresh local state and notify parent App
      await fetchPendingUsers();
      onActionComplete();
    } catch (err: any) {
      console.error("Error rejecting user:", err);
      setErrorMsg(`Failed to reject user: ${err.message || "Unknown error"}`);
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div id="admin_approval_portal" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-5 mb-6">
        <div>
          <h2 className="font-sans text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            🔑 Staff Access Approvals
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Review and approve registration requests for Municipal Dispatchers and Government Analysts.
          </p>
        </div>
        <button
          onClick={fetchPendingUsers}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Requests
        </button>
      </div>

      {successMsg && (
        <div id="admin_success_alert" className="mb-6 p-4 bg-emerald-50 border-l-4 border-emerald-500 rounded-r-xl flex gap-3 text-emerald-800 text-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div id="admin_error_alert" className="mb-6 p-4 bg-rose-50 border-l-4 border-rose-500 rounded-r-xl flex gap-3 text-rose-800 text-sm">
          <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0" />
          <span className="font-semibold">{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mb-2" />
          <p className="text-xs font-semibold text-slate-600">Retrieving pending approvals...</p>
        </div>
      ) : pendingUsers.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
          <div className="h-12 w-12 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h3 className="font-sans text-sm font-bold text-slate-800">All caught up!</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            There are no pending staff access requests at this moment. New requests will appear here instantly.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <div className="col-span-4">Staff Candidate</div>
            <div className="col-span-2">Age</div>
            <div className="col-span-3">Requested Role</div>
            <div className="col-span-3 text-right">Actions</div>
          </div>

          <div className="divide-y divide-slate-100">
            {pendingUsers.map((user) => (
              <div
                key={user.userId}
                id={`pending_user_${user.userId}`}
                className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center py-4 px-2 hover:bg-slate-50/50 rounded-xl transition-all"
              >
                {/* Candidate Info */}
                <div className="col-span-4 flex items-center gap-3">
                  <img
                    src={user.photoUrl}
                    alt={user.name}
                    className="h-11 w-11 rounded-xl object-cover ring-2 ring-slate-100 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{user.name}</h4>
                    <div className="flex flex-col gap-1 mt-1">
                      {user.phoneNumber && (
                        <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
                          <Phone className="h-3 w-3 shrink-0" />
                          {user.phoneNumber}
                        </span>
                      )}
                      {user.signupDate && (
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Calendar className="h-3 w-3 shrink-0" />
                          Requested: {new Date(user.signupDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Age */}
                <div className="col-span-2 md:text-left text-xs font-semibold text-slate-700">
                  <span className="md:hidden text-slate-400 font-normal block mb-0.5">Age</span>
                  {user.age ? `${user.age} years` : "—"}
                </div>

                {/* Requested Role */}
                <div className="col-span-3">
                  <span className="md:hidden text-slate-400 font-normal block mb-1">Requested Role</span>
                  {user.requestedRole === "government" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-50 text-purple-700 border border-purple-100">
                      🏛️ Government Staff
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
                      👷 Municipal Staff
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="col-span-3 flex items-center justify-end gap-2 mt-2 md:mt-0">
                  <button
                    id={`btn_approve_${user.userId}`}
                    onClick={() => handleApprove(user)}
                    disabled={actioningId !== null}
                    className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-sm hover:shadow active:bg-emerald-700 transition cursor-pointer disabled:opacity-50"
                  >
                    {actioningId === user.userId ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <UserCheck className="h-3.5 w-3.5" />
                        Approve
                      </>
                    )}
                  </button>

                  <button
                    id={`btn_reject_${user.userId}`}
                    onClick={() => handleReject(user)}
                    disabled={actioningId !== null}
                    className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/50 hover:border-rose-200 rounded-xl transition cursor-pointer disabled:opacity-50"
                  >
                    {actioningId === user.userId ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <UserX className="h-3.5 w-3.5" />
                        Reject
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isSuperAdmin && (
        <div id="transfer_super_admin_section" className="mt-8 pt-6 border-t border-slate-100">
          <div className="bg-amber-50/50 rounded-2xl border border-amber-100 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-slate-950">
                  🛡️ Transfer Super Admin Access
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Permanently transfer Super Admin authority to another email address. After transfer, you will lose Super Admin status, and the new admin will gain full access upon their next login.
                </p>
              </div>
            </div>

            <form onSubmit={handleTransferAdmin} className="flex flex-col sm:flex-row gap-3 max-w-md">
              <input
                id="transfer_admin_email_input"
                type="email"
                required
                placeholder="Enter new Super Admin email address..."
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                className="flex-1 py-2 px-3 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-800"
              />
              <button
                id="btn_transfer_super_admin"
                type="submit"
                disabled={transferring || !newAdminEmail.trim()}
                className="py-2 px-4 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-bold text-xs rounded-lg transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1 shrink-0"
              >
                {transferring ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Transfer"
                )}
              </button>
            </form>

            {transferSuccess && (
              <p id="transfer_success_msg" className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {transferSuccess}
              </p>
            )}

            {transferError && (
              <p id="transfer_error_msg" className="text-xs font-semibold text-rose-600 flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                {transferError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
