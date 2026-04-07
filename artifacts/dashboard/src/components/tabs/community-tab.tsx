import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, Heart, CheckCircle, Pin, Lock, Plus, ArrowLeft,
  Search, Trash2, ThumbsUp, Award, RefreshCw, ChevronRight,
  Megaphone, HelpCircle, Lightbulb, Users, Send, X, BookOpen,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function api(p: string) { return `${BASE_URL}api${p}`; }

type Category = "all" | "question" | "discussion" | "tip" | "announcement";
type Sort = "latest" | "popular" | "unanswered";

interface Author { id: string; firstName: string | null; lastName: string | null; email: string | null; }
interface Post {
  id: number; userId: string; title: string; content: string; category: string;
  isPinned: boolean; isLocked: boolean; isSolved: boolean;
  likeCount: number; commentCount: number; createdAt: string; updatedAt: string;
  author: Author | null;
}
interface Comment {
  id: number; postId: number; userId: string; content: string;
  isMarkedAnswer: boolean; likeCount: number; createdAt: string;
  author: Author | null;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(date).toLocaleDateString();
}

function authorName(author: Author | null) {
  if (!author) return "Unknown";
  if (author.firstName) return `${author.firstName}${author.lastName ? ` ${author.lastName}` : ""}`;
  return author.email?.split("@")[0] ?? "User";
}

function authorInitial(author: Author | null) {
  return (authorName(author)[0] ?? "?").toUpperCase();
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  question:     { label: "Question",     icon: HelpCircle, color: "text-blue-400",   bg: "rgba(96,165,250,0.1)",   border: "rgba(96,165,250,0.3)" },
  discussion:   { label: "Discussion",   icon: Users,      color: "text-violet-400", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.3)" },
  tip:          { label: "Tip",          icon: Lightbulb,  color: "text-yellow-400", bg: "rgba(250,204,21,0.1)",  border: "rgba(250,204,21,0.3)" },
  announcement: { label: "Update",       icon: Megaphone,  color: "text-orange-400", bg: "rgba(251,146,60,0.1)",  border: "rgba(251,146,60,0.3)" },
};

/* ── Category Badge ───────────────────────────────────────────────────────── */
function CategoryBadge({ category }: { category: string }) {
  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.discussion;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <Icon className="w-2.5 h-2.5" />{cfg.label}
    </span>
  );
}

/* ── Avatar ───────────────────────────────────────────────────────────────── */
function Avatar({ author, size = "sm" }: { author: Author | null; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.7), rgba(167,139,250,0.7))", border: "1px solid rgba(167,139,250,0.3)" }}>
      {authorInitial(author)}
    </div>
  );
}

/* ── New Post Modal ───────────────────────────────────────────────────────── */
function NewPostModal({ onClose, onCreated, isAdmin }: { onClose: () => void; onCreated: (post: Post) => void; isAdmin: boolean }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<"question" | "discussion" | "tip" | "announcement">("question");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch(api("/community/posts"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, category }),
      });
      const d = await res.json() as { ok?: boolean; post?: Post; error?: string };
      if (d.ok && d.post) { onCreated(d.post); onClose(); }
      else setError(d.error ?? "Failed to post");
    } catch { setError("Network error"); }
    setLoading(false);
  };

  const categories = isAdmin
    ? ["question", "discussion", "tip", "announcement"] as const
    : ["question", "discussion", "tip"] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        className="relative w-full max-w-lg bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h2 className="font-display font-bold text-white">New Post</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Category */}
          <div className="flex gap-2 flex-wrap">
            {categories.map(cat => {
              const cfg = CATEGORY_CONFIG[cat];
              const Icon = cfg.icon;
              return (
                <button key={cat} type="button" onClick={() => setCategory(cat)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${category === cat ? `${cfg.color}` : "text-muted-foreground border-white/10 hover:border-white/20"}`}
                  style={category === cat ? { background: cfg.bg, borderColor: cfg.border } : {}}>
                  <Icon className="w-3.5 h-3.5" />{cfg.label}
                </button>
              );
            })}
          </div>
          <input
            required maxLength={200} value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Post title (e.g. How do I solve quadratic equations?)"
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
          <textarea
            required maxLength={10000} value={content} onChange={e => setContent(e.target.value)}
            rows={6} placeholder="Share your question, explanation, or tip…"
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground text-sm focus:outline-none focus:border-indigo-500/50 transition-colors resize-none"
          />
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-xl">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-white border border-white/10 hover:border-white/20 transition-all">Cancel</button>
            <button type="submit" disabled={loading || !title.trim() || !content.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
              style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.8), rgba(139,92,246,0.8))", border: "1px solid rgba(167,139,250,0.3)" }}>
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {loading ? "Posting…" : "Post"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

/* ── Post Card (feed item) ────────────────────────────────────────────────── */
function PostCard({ post, onClick }: { post: Post; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.005 }}
      onClick={onClick}
      className="w-full text-left p-4 rounded-2xl transition-all"
      style={{ background: post.isPinned ? "rgba(251,146,60,0.05)" : "rgba(255,255,255,0.03)", border: `1px solid ${post.isPinned ? "rgba(251,146,60,0.2)" : "rgba(255,255,255,0.08)"}` }}
    >
      <div className="flex items-start gap-3">
        <Avatar author={post.author} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <CategoryBadge category={post.category} />
            {post.isPinned && <Pin className="w-3 h-3 text-orange-400" />}
            {post.isLocked && <Lock className="w-3 h-3 text-slate-400" />}
            {post.isSolved && <CheckCircle className="w-3 h-3 text-emerald-400" />}
          </div>
          <p className="text-sm font-semibold text-white leading-snug mb-1 line-clamp-2">{post.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{post.content}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-medium text-white/60">{authorName(post.author)}</span>
            <span>·</span>
            <span>{timeAgo(post.createdAt)}</span>
            <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{post.likeCount}</span>
            <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{post.commentCount}</span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
      </div>
    </motion.button>
  );
}

/* ── Post Detail ──────────────────────────────────────────────────────────── */
function PostDetail({
  postId, currentUserId, isAdmin: adminFlag, onBack,
}: { postId: number; currentUserId?: string; isAdmin: boolean; onBack: () => void }) {
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [userLikes, setUserLikes] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(api(`/community/posts/${postId}`), { credentials: "include" });
      if (res.ok) {
        const d = await res.json() as { post: Post; comments: Comment[]; userLikes: number[] };
        setPost(d.post); setComments(d.comments); setUserLikes(d.userLikes ?? []);
      }
    } catch {}
    setLoading(false);
  }, [postId]);

  useEffect(() => { load(); }, [load]);

  const handleLike = async () => {
    if (!post) return;
    const res = await fetch(api(`/community/posts/${post.id}/like`), { method: "POST", credentials: "include" });
    if (res.ok) {
      const d = await res.json() as { liked: boolean };
      setPost(prev => prev ? { ...prev, likeCount: prev.likeCount + (d.liked ? 1 : -1) } : prev);
      setUserLikes(prev => d.liked ? [...prev, post.id] : prev.filter(id => id !== post.id));
    }
  };

  const handleSolve = async () => {
    if (!post) return;
    const res = await fetch(api(`/community/posts/${post.id}/solve`), { method: "POST", credentials: "include" });
    if (res.ok) {
      const d = await res.json() as { solved: boolean };
      setPost(prev => prev ? { ...prev, isSolved: d.solved } : prev);
    }
  };

  const handlePin = async () => {
    if (!post) return;
    const res = await fetch(api(`/community/posts/${post.id}/pin`), { method: "PATCH", credentials: "include" });
    if (res.ok) {
      const d = await res.json() as { pinned: boolean };
      setPost(prev => prev ? { ...prev, isPinned: d.pinned } : prev);
    }
  };

  const handleLock = async () => {
    if (!post) return;
    const res = await fetch(api(`/community/posts/${post.id}/lock`), { method: "PATCH", credentials: "include" });
    if (res.ok) {
      const d = await res.json() as { locked: boolean };
      setPost(prev => prev ? { ...prev, isLocked: d.locked } : prev);
    }
  };

  const handleDelete = async () => {
    if (!post || !confirm("Delete this post?")) return;
    const res = await fetch(api(`/community/posts/${post.id}`), { method: "DELETE", credentials: "include" });
    if (res.ok) onBack();
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || submitting) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(api(`/community/posts/${postId}/comments`), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText }),
      });
      const d = await res.json() as { ok?: boolean; comment?: Comment; error?: string };
      if (d.ok && d.comment) {
        setComments(prev => [...prev, d.comment!]);
        setPost(prev => prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev);
        setCommentText("");
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      } else setError(d.error ?? "Failed to post comment");
    } catch { setError("Network error"); }
    setSubmitting(false);
  };

  const handleDeleteComment = async (id: number) => {
    if (!confirm("Delete this comment?")) return;
    const res = await fetch(api(`/community/comments/${id}`), { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setComments(prev => prev.filter(c => c.id !== id));
      setPost(prev => prev ? { ...prev, commentCount: Math.max(0, prev.commentCount - 1) } : prev);
    }
  };

  const handleMarkAnswer = async (id: number) => {
    const res = await fetch(api(`/community/comments/${id}/answer`), { method: "POST", credentials: "include" });
    if (res.ok) {
      const d = await res.json() as { marked: boolean };
      setComments(prev => prev.map(c => c.id === id ? { ...c, isMarkedAnswer: d.marked } : c));
      if (d.marked) setPost(prev => prev ? { ...prev, isSolved: true } : prev);
    }
  };

  const handleLikeComment = async (id: number) => {
    const res = await fetch(api(`/community/comments/${id}/like`), { method: "POST", credentials: "include" });
    if (res.ok) {
      const d = await res.json() as { liked: boolean };
      setComments(prev => prev.map(c => c.id === id ? { ...c, likeCount: c.likeCount + (d.liked ? 1 : -1) } : c));
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
  if (!post) return (
    <div className="text-center py-20 text-muted-foreground">
      <p>Post not found.</p>
      <button onClick={onBack} className="mt-3 text-indigo-400 hover:text-indigo-300 text-sm">Go back</button>
    </div>
  );

  const isOwner = currentUserId === post.userId;
  const isLiked = userLikes.includes(post.id);

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      className="space-y-4">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Community
      </button>

      {/* Post */}
      <div className="rounded-2xl p-5 space-y-4"
        style={{ background: post.isPinned ? "rgba(251,146,60,0.04)" : "rgba(255,255,255,0.03)", border: `1px solid ${post.isPinned ? "rgba(251,146,60,0.2)" : "rgba(255,255,255,0.08)"}` }}>
        {/* Post header */}
        <div className="flex items-start gap-3">
          <Avatar author={post.author} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-semibold text-white">{authorName(post.author)}</span>
              <span className="text-xs text-muted-foreground">{timeAgo(post.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <CategoryBadge category={post.category} />
              {post.isPinned && <span className="flex items-center gap-1 text-[10px] font-semibold text-orange-400"><Pin className="w-2.5 h-2.5" />Pinned</span>}
              {post.isLocked && <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400"><Lock className="w-2.5 h-2.5" />Locked</span>}
              {post.isSolved && <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400"><CheckCircle className="w-2.5 h-2.5" />Solved</span>}
            </div>
          </div>
        </div>

        <h1 className="text-lg font-display font-bold text-white leading-snug">{post.title}</h1>
        <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{post.content}</p>

        {/* Post actions */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-white/8">
          {currentUserId && (
            <button onClick={handleLike}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${isLiked ? "text-indigo-300 border-indigo-500/30 bg-indigo-500/10" : "text-muted-foreground border-white/10 hover:border-white/20 hover:text-white"}`}>
              <ThumbsUp className="w-3.5 h-3.5" /> {post.likeCount} {post.likeCount === 1 ? "Like" : "Likes"}
            </button>
          )}
          {(isOwner || adminFlag) && post.category === "question" && (
            <button onClick={handleSolve}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${post.isSolved ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" : "text-muted-foreground border-white/10 hover:border-white/20 hover:text-white"}`}>
              <CheckCircle className="w-3.5 h-3.5" />{post.isSolved ? "Mark Unsolved" : "Mark Solved"}
            </button>
          )}
          {adminFlag && (
            <>
              <button onClick={handlePin}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${post.isPinned ? "text-orange-300 border-orange-500/30 bg-orange-500/10" : "text-muted-foreground border-white/10 hover:border-white/20"}`}>
                <Pin className="w-3.5 h-3.5" />{post.isPinned ? "Unpin" : "Pin"}
              </button>
              <button onClick={handleLock}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${post.isLocked ? "text-slate-300 border-slate-500/30 bg-slate-500/10" : "text-muted-foreground border-white/10 hover:border-white/20"}`}>
                <Lock className="w-3.5 h-3.5" />{post.isLocked ? "Unlock" : "Lock"}
              </button>
            </>
          )}
          {(isOwner || adminFlag) && (
            <button onClick={handleDelete} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-muted-foreground border border-white/10 hover:border-red-500/30 hover:text-red-400 transition-all ml-auto">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Comments */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-400" />
          {post.commentCount} {post.commentCount === 1 ? "Reply" : "Replies"}
        </h3>

        {comments.length === 0 && !post.isLocked && (
          <p className="text-sm text-muted-foreground text-center py-4">No replies yet. Be the first to help!</p>
        )}

        {comments.map(comment => {
          const isAnswered = comment.isMarkedAnswer;
          const canMarkAnswer = (isOwner || adminFlag) && post.category === "question";
          return (
            <motion.div key={comment.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl"
              style={{
                background: isAnswered ? "rgba(52,211,153,0.05)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${isAnswered ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.07)"}`,
              }}>
              <div className="flex gap-3">
                <Avatar author={comment.author} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-xs font-semibold text-white">{authorName(comment.author)}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(comment.createdAt)}</span>
                    {isAnswered && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                        <Award className="w-2.5 h-2.5" /> Best Answer
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{comment.content}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {currentUserId && (
                      <button onClick={() => handleLikeComment(comment.id)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-indigo-300 transition-colors">
                        <Heart className="w-3.5 h-3.5" />{comment.likeCount}
                      </button>
                    )}
                    {canMarkAnswer && (
                      <button onClick={() => handleMarkAnswer(comment.id)}
                        className={`flex items-center gap-1 text-xs transition-colors ${isAnswered ? "text-emerald-400 hover:text-emerald-300" : "text-muted-foreground hover:text-emerald-400"}`}>
                        <Award className="w-3.5 h-3.5" />{isAnswered ? "Unmark" : "Mark Answer"}
                      </button>
                    )}
                    {(currentUserId === comment.userId || adminFlag) && (
                      <button onClick={() => handleDeleteComment(comment.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 transition-colors ml-auto">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Comment form */}
      {currentUserId && !post.isLocked && (
        <form onSubmit={handleComment} className="space-y-2">
          <textarea
            value={commentText} onChange={e => setCommentText(e.target.value)}
            rows={3} placeholder="Write a helpful reply…"
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground text-sm focus:outline-none focus:border-indigo-500/50 transition-colors resize-none"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={submitting || !commentText.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
              style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.8), rgba(139,92,246,0.8))", border: "1px solid rgba(167,139,250,0.3)" }}>
              {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {submitting ? "Posting…" : "Post Reply"}
            </button>
          </div>
        </form>
      )}
      {post.isLocked && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-sm text-slate-400" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Lock className="w-4 h-4 shrink-0" /> This post is locked. No further replies allowed.
        </div>
      )}
      {!currentUserId && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-sm text-muted-foreground" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <MessageSquare className="w-4 h-4 shrink-0" /> Sign in to join the conversation.
        </div>
      )}
    </motion.div>
  );
}

/* ── Main Community Tab ───────────────────────────────────────────────────── */
export default function CommunityTab() {
  const { user, isAuthenticated } = useAuth();
  const [category, setCategory] = useState<Category>("all");
  const [sort, setSort] = useState<Sort>("latest");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [showNewPost, setShowNewPost] = useState(false);

  const isAdmin = !!(user?.email && (user.email.toLowerCase().includes("admin")));
  const currentUserId = user?.id;

  const loadPosts = useCallback(async (pg = 1, reset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort, page: String(pg) });
      if (category !== "all") params.set("category", category);
      if (search) params.set("search", search);
      const res = await fetch(api(`/community/posts?${params}`));
      if (res.ok) {
        const d = await res.json() as { posts: Post[]; total: number; page: number };
        setPosts(prev => reset ? d.posts : pg === 1 ? d.posts : [...prev, ...d.posts]);
        setTotal(d.total);
        setPage(pg);
      }
    } catch {}
    setLoading(false);
  }, [category, sort, search]);

  useEffect(() => { loadPosts(1, true); }, [category, sort, search]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setSearch(searchInput.trim()); };

  const CATEGORIES: { id: Category; label: string; icon: React.ElementType }[] = [
    { id: "all",          label: "All",          icon: BookOpen    },
    { id: "question",     label: "Questions",    icon: HelpCircle  },
    { id: "discussion",   label: "Discussions",  icon: Users       },
    { id: "tip",          label: "Tips",         icon: Lightbulb   },
    { id: "announcement", label: "Updates",      icon: Megaphone   },
  ];

  const SORTS: { id: Sort; label: string }[] = [
    { id: "latest",     label: "Latest"     },
    { id: "popular",    label: "Popular"    },
    { id: "unanswered", label: "Unanswered" },
  ];

  if (selectedPostId !== null) {
    return (
      <PostDetail
        postId={selectedPostId}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onBack={() => { setSelectedPostId(null); loadPosts(1, true); }}
      />
    );
  }

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 max-w-3xl mx-auto">
        {/* Header */}
        <div className="rounded-2xl p-5 flex items-center justify-between"
          style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.06))", border: "1px solid rgba(99,102,241,0.25)" }}>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl" style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.35)" }}>
              <Users className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-display font-black text-white">Community</h2>
              <p className="text-sm text-muted-foreground">Ask questions, share tips &amp; help each other</p>
            </div>
          </div>
          {isAuthenticated && (
            <button onClick={() => setShowNewPost(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.7), rgba(139,92,246,0.7))", border: "1px solid rgba(167,139,250,0.3)" }}>
              <Plus className="w-4 h-4" /> New Post
            </button>
          )}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={searchInput} onChange={e => setSearchInput(e.target.value)}
              placeholder="Search posts…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
          </div>
          <button type="submit" className="px-4 py-2 rounded-xl text-sm font-medium text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/10 transition-all">Search</button>
          {search && <button type="button" onClick={() => { setSearch(""); setSearchInput(""); }} className="px-3 py-2 rounded-xl text-sm text-muted-foreground border border-white/10 hover:border-white/20 hover:text-white transition-all"><X className="w-4 h-4" /></button>}
        </form>

        {/* Category tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => { setCategory(id); setPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${category === id ? "text-indigo-200 border-indigo-500/40 bg-indigo-500/15" : "text-muted-foreground border-white/10 hover:border-white/20 hover:text-white bg-white/3"}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
          <div className="flex-1" />
          {SORTS.map(({ id, label }) => (
            <button key={id} onClick={() => setSort(id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${sort === id ? "text-violet-200 border-violet-500/40 bg-violet-500/12" : "text-muted-foreground border-white/10 hover:border-white/20 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Posts list */}
        {loading && posts.length === 0 && (
          <div className="flex justify-center py-16"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        )}

        {!loading && posts.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium text-white/60">{search ? "No posts matching your search." : "No posts yet."}</p>
            <p className="text-sm mt-1">{isAuthenticated ? "Be the first to post something!" : "Sign in to start the conversation."}</p>
          </div>
        )}

        <div className="space-y-2">
          <AnimatePresence>
            {posts.map(post => (
              <motion.div key={post.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <PostCard post={post} onClick={() => setSelectedPostId(post.id)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Load more */}
        {posts.length < total && (
          <div className="flex justify-center pt-2">
            <button onClick={() => loadPosts(page + 1)} disabled={loading}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm text-muted-foreground border border-white/10 hover:border-white/20 hover:text-white transition-all disabled:opacity-50">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              Load more ({total - posts.length} remaining)
            </button>
          </div>
        )}

        {!isAuthenticated && (
          <div className="p-4 rounded-2xl text-center" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)" }}>
            <p className="text-sm text-muted-foreground">
              <span className="text-indigo-300 font-semibold">Sign in</span> to post questions, share tips, and help fellow students.
            </p>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showNewPost && (
          <NewPostModal
            isAdmin={isAdmin}
            onClose={() => setShowNewPost(false)}
            onCreated={(post) => setPosts(prev => [post, ...prev])}
          />
        )}
      </AnimatePresence>
    </>
  );
}
