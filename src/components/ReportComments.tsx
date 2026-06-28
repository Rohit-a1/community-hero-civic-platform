import React, { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { MessageSquare, Send, Clock, User, AlertCircle } from "lucide-react";

interface Comment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: any;
}

interface ReportCommentsProps {
  reportId: string;
  currentUser: any; // Firebase User object or sandbox user
}

export default function ReportComments({ reportId, currentUser }: ReportCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      const commentsRef = collection(db, "reports", reportId, "comments");
      const q = query(commentsRef, orderBy("timestamp", "asc"));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list: Comment[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            list.push({
              id: doc.id,
              userId: data.userId || "",
              userName: data.userName || "Anonymous Citizen",
              text: data.text || "",
              timestamp: data.timestamp ? (typeof data.timestamp.toDate === "function" ? data.timestamp.toDate() : new Date(data.timestamp)) : new Date(),
            });
          });
          setComments(list);
          setLoading(false);
        },
        (err) => {
          console.error("Error streaming comments for report:", reportId, err);
          setError("Could not load comments.");
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error("Failed to initialize comments query:", err);
      setError("Failed to fetch comments.");
      setLoading(false);
    }
  }, [reportId]);

  const getCommenterName = (user: any) => {
    if (!user) return "Anonymous Citizen";
    if (user.displayName) return user.displayName;
    if (user.email) {
      return user.email.split("@")[0];
    }
    if (user.uid) {
      return `Citizen #${user.uid.slice(0, 5)}`;
    }
    return "Anonymous Citizen";
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setError("Please sign in to add a comment.");
      return;
    }
    if (!newComment.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const commenterName = getCommenterName(currentUser);
      const commentsRef = collection(db, "reports", reportId, "comments");

      await addDoc(commentsRef, {
        userId: currentUser.uid,
        userName: commenterName,
        text: newComment.trim(),
        timestamp: serverTimestamp(),
      });

      setNewComment("");
    } catch (err: any) {
      console.error("Error posting comment:", err);
      setError("Failed to post comment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatCommentTime = (date: Date) => {
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

  return (
    <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
      {/* Title */}
      <div className="flex items-center gap-1.5 text-slate-700">
        <MessageSquare className="h-4 w-4 text-blue-500" />
        <span className="text-xs font-bold uppercase tracking-wider">
          Comments ({comments.length})
        </span>
      </div>

      {/* Error Info */}
      {error && (
        <div className="p-2.5 bg-rose-50 text-rose-700 text-xs rounded-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Comments List */}
      {loading ? (
        <p className="text-[11px] text-slate-400 italic">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-[11px] text-slate-400 italic">No comments yet. Start the conversation!</p>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-3 pr-1 divide-y divide-slate-50">
          {comments.map((comment, index) => (
            <div key={comment.id} className={`text-xs ${index > 0 ? 'pt-2.5' : ''}`}>
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span className="text-slate-700 font-semibold flex items-center gap-1">
                  <User className="h-3 w-3 text-slate-400" />
                  {comment.userName}
                </span>
                <span className="flex items-center gap-1 text-[10px]">
                  <Clock className="h-3 w-3" />
                  {formatCommentTime(comment.timestamp)}
                </span>
              </div>
              <p className="text-slate-600 mt-1 pl-4 leading-relaxed font-normal whitespace-pre-wrap">
                {comment.text}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Add Comment Form */}
      {currentUser ? (
        <form onSubmit={handleAddComment} className="flex gap-2">
          <input
            type="text"
            placeholder="Write a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            disabled={submitting}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs text-slate-800 transition placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={submitting || !newComment.trim()}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      ) : (
        <p className="text-[10px] text-slate-400 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
          🔒 You must be signed in to add a comment.
        </p>
      )}
    </div>
  );
}
