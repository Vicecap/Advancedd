import React, { useEffect, useState, useCallback } from "react";
import {
  Users, Activity, Star, BarChart3, RefreshCw, Loader2,
  ShieldAlert, TrendingUp, Brain, CheckCircle,
  ShieldCheck, ShieldOff, UserPlus, Mail, X, Copy, Check,
  AlertTriangle, Trash2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight,
  LineChart, Zap, Award, CreditCard, Lock, BadgeAlert, DollarSign,
  MessageSquare, Pin, PinOff, Send, Globe, Crown, LifeBuoy, ChevronUp,
  Clock, BadgeCheck, HandCoins, ClipboardCheck, ClipboardX, Timer,
  Banknote, Gift, SlidersHorizontal,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { useAuth } from "@/hooks/use-auth";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function api(p: string) { return `${BASE_URL}api${p}`; }

// ── Types ──────────────────────────────────────────────────────────────────

interface Stats {
  totalUsers: number; activeUsers: number; recentSignups: number;
  currentlyOnline: number; totalRatings: number; avgStars: number; totalComputations: number;
}
interface Rating {
  id: number; stars: number; review: string | null; createdAt: string;
  email: string | null; firstName: string | null; lastName: string | null;
}
interface AdminUser {
  id: string; email: string | null; firstName: string | null; lastName: string | null;
  authProvider: string; isAdmin: boolean; isPremium: boolean; emailVerified: boolean; createdAt: string;
}
interface ErrorLog {
  id: number; userId: string | null; email: string | null;
  message: string; stack: string | null; url: string | null;
  component: string | null; createdAt: string;
}

// Manual billing types
interface ManualPayment {
  id: number;
  userId: number;
  email: string | null;
  username: string | null;
  tokensAmount: number;
  amountUsdCents: number;
  paymentMethod: string;
  manualReference: string;
  userPaymentReference: string | null;
  status: string;
  createdAt: string;
  proofSubmittedAt: string | null;
  adminNote: string | null;
}

interface ManualBillingStats {
  pending: number;
  stale: number;
  completed: number;
  expired: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function cn(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

function timeAgo(str: string) {
  const diff = Date.now() - new Date(str).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatCard({ icon: Icon, label, value, color, sub }: {
  icon: React.ElementType; label: string; value: string | number; color: string; sub?: string;
}) {
  return (
    <div className="p-4 rounded-2xl flex items-center gap-4"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
      <div className="p-3 rounded-xl shrink-0"
        style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-display font-bold text-white">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= n ? "text-yellow-400 fill-yellow-400" : "text-white/20"}`} />
      ))}
    </span>
  );
}

function ErrorLogItem({ log, onDelete }: { log: ErrorLog; onDelete: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
      <div className="flex items-start gap-3 p-3 cursor-pointer" onClick={() => setExpanded(v => !v)}>
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-mono truncate">{log.message}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {log.email && <span className="text-[11px] text-indigo-300">{log.email}</span>}
            {log.url && <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">{log.url}</span>}
            <span className="text-[11px] text-muted-foreground">{timeAgo(log.createdAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={e => { e.stopPropagation(); onDelete(log.id); }}
            className="p-1 rounded text-muted-foreground hover:text-red-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {expanded
            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>
      {expanded && (log.stack || log.component) && (
        <div className="px-3 pb-3 pt-0 border-t border-red-500/10">
          {log.component && <p className="text-[11px] text-orange-300 mb-1">Component: {log.component}</p>}
          {log.stack && (
            <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto leading-relaxed">
              {log.stack}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function CreateAdminModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(api("/admin/create-admin"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), firstName: firstName.trim() || undefined }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; email?: string; tempPassword?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setResult({ email: data.email!, tempPassword: data.tempPassword! });
    } catch (err) { setError((err as Error).message); }
    setLoading(false);
  };

  const copyCredentials = () => {
    if (!result) return;
    navigator.clipboard.writeText(`Email: ${result.email}\nPassword: ${result.tempPassword}`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ background: "#0d0f1c", border: "1px solid rgba(239,68,68,0.3)" }}>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-white text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-red-400" /> Create Admin Account
          </h3>
          <button onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-400 font-semibold flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" /> Admin account created!
            </p>
            <p className="text-xs text-muted-foreground">Save these credentials now:</p>
            <div className="rounded-xl p-3 space-y-1.5 font-mono text-sm"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <p className="text-white"><span className="text-muted-foreground">Email:</span> {result.email}</p>
              <p className="text-red-300"><span className="text-muted-foreground">Password:</span> {result.tempPassword}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={copyCredentials}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm border transition-all"
                style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.15)", color: copied ? "#34d399" : "#e5e7eb" }}>
                {copied ? <><Check className="w-3.5 h-3.5" />Copied!</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
              </button>
              <button onClick={() => { onCreated(); onClose(); }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white border border-red-500/30 hover:border-red-400/50 transition-all"
                style={{ background: "rgba(239,68,68,0.15)" }}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="email" placeholder="Admin email" required value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-red-400/50 transition-colors placeholder:text-muted-foreground" />
            </div>
            <div className="relative">
              <input type="text" placeholder="First name (optional)" value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-red-400/50 transition-colors placeholder:text-muted-foreground" />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-60 transition-all"
              style={{ background: "rgba(239,68,68,0.25)", border: "1px solid rgba(239,68,68,0.4)" }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserPlus className="w-4 h-4" />Create Admin</>}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}

// ── Grant Tokens Modal ─────────────────────────────────────────────────────

function GrantTokensModal({ onClose, onGranted }: { onClose: () => void; onGranted: () => void }) {
  const [userId, setUserId] = useState("");
  const [tokens, setTokens] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ tokensGranted: number; newBalance: number } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tokenNum = parseInt(tokens);
    if (!userId.trim() || isNaN(tokenNum) || tokenNum < 1) {
      setError("Valid user ID and token amount required"); return;
    }
    setLoading(true); setError(null);
    try {
      const res = await fetch(api("/admin/billing/grant-tokens"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: parseInt(userId), tokens: tokenNum, reason: reason.trim() || undefined }),
      });
      const data = await res.json() as { ok?: boolean; tokensGranted?: number; newBalance?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSuccess({ tokensGranted: data.tokensGranted!, newBalance: data.newBalance! });
    } catch (err) { setError((err as Error).message); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ background: "#0d0f1c", border: "1px solid rgba(52,211,153,0.3)" }}>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-white text-base flex items-center gap-2">
            <Gift className="w-4 h-4 text-emerald-400" /> Grant Tokens
          </h3>
          <button onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        {success ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-400 font-semibold flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" /> Tokens granted successfully!
            </p>
            <div className="rounded-xl p-3 space-y-1.5 text-sm"
              style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)" }}>
              <p className="text-white">
                <span className="text-muted-foreground">Granted:</span>{" "}
                <span className="font-bold text-emerald-400">{success.tokensGranted.toLocaleString()}</span> tokens
              </p>
              <p className="text-white">
                <span className="text-muted-foreground">New Balance:</span>{" "}
                <span className="font-bold text-blue-400">{success.newBalance.toLocaleString()}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setSuccess(null); setUserId(""); setTokens(""); setReason(""); }}
                className="flex-1 py-2 rounded-xl text-sm border border-white/10 text-muted-foreground hover:text-white transition-all">
                Grant Again
              </button>
              <button onClick={() => { onGranted(); onClose(); }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white border border-emerald-500/30 transition-all"
                style={{ background: "rgba(52,211,153,0.15)" }}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">User ID</label>
              <input type="number" placeholder="e.g. 42" required value={userId}
                onChange={e => setUserId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-emerald-400/50 transition-colors placeholder:text-muted-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tokens to Grant</label>
              <input type="number" placeholder="e.g. 5000000" required value={tokens}
                onChange={e => setTokens(e.target.value)} min={1}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-emerald-400/50 transition-colors placeholder:text-muted-foreground" />
              {tokens && !isNaN(parseInt(tokens)) && (
                <p className="text-[11px] text-emerald-400 mt-1">{(parseInt(tokens) / 1_000_000).toFixed(2)}M tokens</p>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Reason (optional)</label>
              <input type="text" placeholder="e.g. Manual payment via bank" value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-emerald-400/50 transition-colors placeholder:text-muted-foreground" />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-60 transition-all"
              style={{ background: "rgba(52,211,153,0.2)", border: "1px solid rgba(52,211,153,0.4)" }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Gift className="w-4 h-4" />Grant Tokens</>}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}

// ── Payment method badge ───────────────────────────────────────────────────

function MethodBadge({ method }: { method: string }) {
  const cfg: Record<string, { label: string; color: string }> = {
    ecocash:          { label: "EcoCash",         color: "#34d399" },
    ecocash_diaspora: { label: "EcoCash Diaspora", color: "#60a5fa" },
    bank:             { label: "Bank Transfer",    color: "#a78bfa" },
    manual:           { label: "Manual",           color: "#fbbf24" },
  };
  const c = cfg[method] ?? { label: method, color: "#9ca3af" };
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: `${c.color}20`, color: c.color, border: `1px solid ${c.color}40` }}>
      {c.label}
    </span>
  );
}

// ── Manual Billing Panel ───────────────────────────────────────────────────

function ManualBillingPanel({ onRefreshBilling }: { onRefreshBilling: () => void }) {
  const [manualStats, setManualStats] = useState<ManualBillingStats | null>(null);
  const [payments, setPayments] = useState<ManualPayment[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending_manual");
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;

  // Approve / reject state
  const [actionId, setActionId] = useState<number | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actioning, setActioning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Clean-stale
  const [cleanDays, setCleanDays] = useState(7);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<string | null>(null);

  // Grant tokens modal
  const [showGrant, setShowGrant] = useState(false);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch(api("/admin/billing/manual-payments"), { credentials: "include" });
      // We get stats from dedicated endpoint
      const statsRes = await fetch(api("/admin/billing/stats"), { credentials: "include" });
      if (statsRes.ok) {
        const d = await statsRes.json() as ManualBillingStats;
        setManualStats(d);
      }
    } catch {}
    setStatsLoading(false);
  }, []);

  const loadPayments = useCallback(async (s: string, p: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        api(`/admin/billing/manual-payments?status=${s}&page=${p}&limit=${LIMIT}`),
        { credentials: "include" }
      );
      if (res.ok) {
        const d = await res.json() as { payments: ManualPayment[]; pagination: { total: number } };
        setPayments(d.payments ?? []);
        setTotal(d.pagination?.total ?? 0);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStats();
    loadPayments(statusFilter, page);
  }, [loadStats, loadPayments, statusFilter, page]);

  const handleApprove = async () => {
    if (!actionId) return;
    setActioning(true); setActionError(null);
    try {
      const res = await fetch(api(`/admin/billing/manual-payments/${actionId}/approve`), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNote: actionNote.trim() || undefined }),
      });
      const d = await res.json() as { ok?: boolean; error?: string; tokensCredited?: number; newBalance?: number };
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setPayments(prev => prev.filter(p => p.id !== actionId));
      setTotal(t => t - 1);
      setActionId(null); setActionType(null); setActionNote("");
      loadStats();
      onRefreshBilling();
    } catch (err) { setActionError((err as Error).message); }
    setActioning(false);
  };

  const handleReject = async () => {
    if (!actionId) return;
    setActioning(true); setActionError(null);
    try {
      const res = await fetch(api(`/admin/billing/manual-payments/${actionId}/reject`), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: actionNote.trim() || undefined }),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setPayments(prev => prev.filter(p => p.id !== actionId));
      setTotal(t => t - 1);
      setActionId(null); setActionType(null); setActionNote("");
      loadStats();
    } catch (err) { setActionError((err as Error).message); }
    setActioning(false);
  };

  const handleCleanStale = async () => {
    if (!confirm(`Expire all pending manual payments older than ${cleanDays} days?`)) return;
    setCleaning(true); setCleanResult(null);
    try {
      const res = await fetch(api("/admin/billing/manual-payments/clean-stale"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: cleanDays }),
      });
      const d = await res.json() as { ok?: boolean; expired?: number; message?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setCleanResult(d.message ?? `Expired ${d.expired} payment(s)`);
      loadStats();
      loadPayments(statusFilter, 1);
    } catch (err) { setCleanResult(`Error: ${(err as Error).message}`); }
    setCleaning(false);
  };

  const statusFilters = [
    { id: "pending_manual", label: "Pending",   color: "#fbbf24" },
    { id: "completed",      label: "Approved",  color: "#34d399" },
    { id: "rejected",       label: "Rejected",  color: "#f87171" },
    { id: "expired",        label: "Expired",   color: "#9ca3af" },
  ];

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Clock}         label="Pending Review" value={statsLoading ? "…" : (manualStats?.pending ?? 0)}   color="#fbbf24" />
        <StatCard icon={AlertTriangle} label="Stale (>7d)"    value={statsLoading ? "…" : (manualStats?.stale ?? 0)}     color="#f87171" sub="auto-expire candidates" />
        <StatCard icon={CheckCircle}   label="Approved"       value={statsLoading ? "…" : (manualStats?.completed ?? 0)} color="#34d399" />
        <StatCard icon={Timer}         label="Expired"        value={statsLoading ? "…" : (manualStats?.expired ?? 0)}   color="#9ca3af" />
      </div>

      {/* Actions row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Grant tokens button */}
        <button onClick={() => setShowGrant(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-emerald-300 border border-emerald-500/30 hover:border-emerald-400/50 transition-all"
          style={{ background: "rgba(52,211,153,0.1)" }}>
          <Gift className="w-3.5 h-3.5" /> Grant Tokens
        </button>

        {/* Clean-stale control */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">Expire stale older than</span>
          <select value={cleanDays} onChange={e => setCleanDays(parseInt(e.target.value))}
            className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white cursor-pointer">
            {[1,3,7,14,30].map(d => <option key={d} value={d}>{d}d</option>)}
          </select>
          <button onClick={handleCleanStale} disabled={cleaning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-orange-300 border border-orange-500/30 hover:border-orange-400/50 transition-all disabled:opacity-50"
            style={{ background: "rgba(249,115,22,0.1)" }}>
            {cleaning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Timer className="w-3.5 h-3.5" />}
            Clean Stale
          </button>
        </div>
      </div>

      {/* Clean result */}
      {cleanResult && (
        <div className={`text-xs px-4 py-2 rounded-xl border ${cleanResult.startsWith("Error") ? "text-red-400 border-red-500/30 bg-red-500/5" : "text-emerald-400 border-emerald-500/30 bg-emerald-500/5"}`}>
          {cleanResult}
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {statusFilters.map(sf => (
          <button key={sf.id} onClick={() => { setStatusFilter(sf.id); setPage(1); }}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
            style={{
              background: statusFilter === sf.id ? `${sf.color}20` : "rgba(255,255,255,0.03)",
              borderColor: statusFilter === sf.id ? `${sf.color}50` : "rgba(255,255,255,0.1)",
              color: statusFilter === sf.id ? sf.color : "#6b7280",
            }}>
            {sf.label}
            {sf.id === "pending_manual" && manualStats && manualStats.pending > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: `${sf.color}30`, color: sf.color }}>
                {manualStats.pending}
              </span>
            )}
          </button>
        ))}
        <button onClick={() => { loadStats(); loadPayments(statusFilter, page); }}
          className="ml-auto p-1.5 rounded-xl border border-white/10 text-muted-foreground hover:text-white transition-all">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Payments list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Banknote className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No {statusFilter.replace("_", " ")} payments.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payments.map(p => {
            const isActioning = actionId === p.id;
            const hasProof = !!p.userPaymentReference;
            return (
              <div key={p.id} className="rounded-2xl p-4 space-y-3"
                style={{
                  background: hasProof ? "rgba(52,211,153,0.04)" : "rgba(255,255,255,0.03)",
                  border: hasProof ? "1px solid rgba(52,211,153,0.2)" : "1px solid rgba(255,255,255,0.08)",
                }}>
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold text-sm">#{p.id}</span>
                      <MethodBadge method={p.paymentMethod} />
                      {hasProof && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          PROOF SUBMITTED
                        </span>
                      )}
                      {p.status === "pending_manual" && !hasProof && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          AWAITING PROOF
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.email ?? p.username ?? `User #${p.userId}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-white font-bold text-sm">${(p.amountUsdCents / 100).toFixed(2)}</p>
                    <p className="text-xs text-violet-400">{(p.tokensAmount / 1_000_000).toFixed(1)}M tokens</p>
                  </div>
                </div>

                {/* Reference info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg px-3 py-2"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-muted-foreground mb-0.5">Our Reference</p>
                    <p className="text-white font-mono font-bold">{p.manualReference}</p>
                  </div>
                  {p.userPaymentReference && (
                    <div className="rounded-lg px-3 py-2"
                      style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)" }}>
                      <p className="text-muted-foreground mb-0.5">User's Payment Ref</p>
                      <p className="text-emerald-300 font-mono font-bold">{p.userPaymentReference}</p>
                    </div>
                  )}
                </div>

                {/* Timestamps */}
                <div className="flex gap-4 text-[11px] text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Created {timeAgo(p.createdAt)}
                  </span>
                  {p.proofSubmittedAt && (
                    <span className="flex items-center gap-1 text-emerald-400/70">
                      <CheckCircle className="w-3 h-3" /> Proof {timeAgo(p.proofSubmittedAt)}
                    </span>
                  )}
                </div>

                {/* Admin note (if already actioned) */}
                {p.adminNote && (
                  <div className="text-xs rounded-lg px-3 py-2 text-amber-300/80"
                    style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)" }}>
                    <span className="font-semibold">Note:</span> {p.adminNote}
                  </div>
                )}

                {/* Action buttons — only for pending_manual */}
                {p.status === "pending_manual" && (
                  <div className="space-y-2">
                    {!isActioning ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setActionId(p.id); setActionType("approve"); setActionNote(""); setActionError(null); }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-emerald-300 border border-emerald-500/30 hover:border-emerald-400/60 transition-all"
                          style={{ background: "rgba(52,211,153,0.12)" }}>
                          <ClipboardCheck className="w-3.5 h-3.5" /> Approve & Credit
                        </button>
                        <button
                          onClick={() => { setActionId(p.id); setActionType("reject"); setActionNote(""); setActionError(null); }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-red-300 border border-red-500/30 hover:border-red-400/60 transition-all"
                          style={{ background: "rgba(239,68,68,0.1)" }}>
                          <ClipboardX className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 p-3 rounded-xl"
                        style={{
                          background: actionType === "approve" ? "rgba(52,211,153,0.06)" : "rgba(239,68,68,0.06)",
                          border: actionType === "approve" ? "1px solid rgba(52,211,153,0.2)" : "1px solid rgba(239,68,68,0.2)",
                        }}>
                        <p className="text-xs font-semibold"
                          style={{ color: actionType === "approve" ? "#34d399" : "#f87171" }}>
                          {actionType === "approve" ? "✓ Approve & credit tokens" : "✗ Reject payment"}
                        </p>
                        <input
                          type="text"
                          placeholder={actionType === "approve" ? "Admin note (optional)" : "Rejection reason (optional)"}
                          value={actionNote}
                          onChange={e => setActionNote(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-xs focus:outline-none focus:border-white/30 transition-colors placeholder:text-muted-foreground"
                        />
                        {actionError && <p className="text-red-400 text-[11px]">{actionError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={actionType === "approve" ? handleApprove : handleReject}
                            disabled={actioning}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white transition-all disabled:opacity-50"
                            style={{
                              background: actionType === "approve" ? "rgba(52,211,153,0.3)" : "rgba(239,68,68,0.3)",
                              border: actionType === "approve" ? "1px solid rgba(52,211,153,0.5)" : "1px solid rgba(239,68,68,0.5)",
                            }}>
                            {actioning
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : actionType === "approve" ? "Confirm Approve" : "Confirm Reject"}
                          </button>
                          <button
                            onClick={() => { setActionId(null); setActionType(null); setActionNote(""); setActionError(null); }}
                            className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-muted-foreground hover:text-white transition-all">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-muted-foreground hover:text-white disabled:opacity-40 transition-all">
                  ← Prev
                </button>
                <button onClick={() => setPage(p => p + 1)} disabled={page * LIMIT >= total}
                  className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-muted-foreground hover:text-white disabled:opacity-40 transition-all">
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Grant Tokens Modal */}
      <AnimatePresence>
        {showGrant && (
          <GrantTokensModal
            onClose={() => setShowGrant(false)}
            onGranted={() => { loadStats(); onRefreshBilling(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Analytics ─────────────────────────────────────────────────────────────

const RANGES = [
  { id: "1d",   label: "Today"    },
  { id: "7d",   label: "7 Days"   },
  { id: "30d",  label: "30 Days"  },
  { id: "60d",  label: "2 Months" },
  { id: "90d",  label: "3 Months" },
  { id: "180d", label: "6 Months" },
  { id: "all",  label: "All Time" },
];

interface AnalyticsRow { bucket: string; cnt: string }
interface AnalyticsData {
  users: AnalyticsRow[];
  computations: AnalyticsRow[];
  views: AnalyticsRow[];
  from: string;
  range: string;
}

function fmt_bucket(raw: string, range: string) {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw.slice(0, 10);
  if (range === "1d") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function merge_analytics(
  users: AnalyticsRow[],
  computations: AnalyticsRow[],
  views: AnalyticsRow[],
  range: string,
) {
  const map: Record<string, { label: string; users: number; computations: number; views: number }> = {};
  const ensure = (k: string) => {
    if (!map[k]) map[k] = { label: fmt_bucket(k, range), users: 0, computations: 0, views: 0 };
  };
  users.forEach(r => { ensure(r.bucket); map[r.bucket].users += Number(r.cnt); });
  computations.forEach(r => { ensure(r.bucket); map[r.bucket].computations += Number(r.cnt); });
  views.forEach(r => { ensure(r.bucket); map[r.bucket].views += Number(r.cnt); });
  return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([, v]) => v);
}

function AnalyticsPanel() {
  const [range, setRange] = useState("7d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (r: string) => {
    setLoading(true);
    try {
      const res = await fetch(api(`/admin/analytics?range=${r}`), { credentials: "include" });
      if (res.ok) setData(await res.json() as AnalyticsData);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  const chartData = data ? merge_analytics(data.users, data.computations, data.views ?? [], range) : [];
  const totalUsers = chartData.reduce((s, r) => s + r.users, 0);
  const totalComps = chartData.reduce((s, r) => s + r.computations, 0);
  const totalViews = chartData.reduce((s, r) => s + r.views, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {RANGES.map(r => (
          <button key={r.id} onClick={() => setRange(r.id)}
            className={cn("px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
              range === r.id
                ? "text-white border-indigo-500/50"
                : "text-muted-foreground border-white/10 hover:border-white/20 hover:text-white")}
            style={{ background: range === r.id ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.03)" }}>
            {r.label}
          </button>
        ))}
        <button onClick={() => load(range)}
          className="ml-auto p-1.5 rounded-xl border border-white/10 text-muted-foreground hover:text-white transition-all">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl flex items-center gap-3"
          style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" }}>
          <Users className="w-5 h-5 text-blue-400 shrink-0" />
          <div>
            <p className="text-xl font-display font-bold text-white">{totalUsers}</p>
            <p className="text-xs text-muted-foreground">New Sign-ups</p>
          </div>
        </div>
        <div className="p-4 rounded-2xl flex items-center gap-3"
          style={{ background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.2)" }}>
          <Brain className="w-5 h-5 text-orange-400 shrink-0" />
          <div>
            <p className="text-xl font-display font-bold text-white">{totalComps.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Computations</p>
          </div>
        </div>
        <div className="p-4 rounded-2xl flex items-center gap-3"
          style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)" }}>
          <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-xl font-display font-bold text-white">{totalViews.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Page Views</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No data for this period yet.</div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-xs font-semibold text-muted-foreground mb-4">App Views / Visits</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
                <defs>
                  <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#0d0f1c", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", fontSize: 12 }} itemStyle={{ color: "#e5e7eb" }} labelStyle={{ color: "#9ca3af" }} />
                <Area type="monotone" dataKey="views" name="Page Views" stroke="#34d399" fill="url(#viewsGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="p-4 rounded-2xl"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-xs font-semibold text-muted-foreground mb-4">User Sign-ups & Computations</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
                <defs>
                  <linearGradient id="usersGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="compsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fb923c" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#fb923c" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#0d0f1c", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", fontSize: 12 }} itemStyle={{ color: "#e5e7eb" }} labelStyle={{ color: "#9ca3af" }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
                <Area type="monotone" dataKey="users" name="Sign-ups" stroke="#60a5fa" fill="url(#usersGrad)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="computations" name="Computations" stroke="#fb923c" fill="url(#compsGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab type ───────────────────────────────────────────────────────────────

type AdminTabId =
  | "overview" | "analytics" | "ratings" | "users" | "admins"
  | "errors" | "activity" | "billing" | "manual_billing"
  | "security" | "community" | "premium" | "support";

// ══════════════════════════════════════════════════════════════════════════
// Main AdminTab
// ══════════════════════════════════════════════════════════════════════════

export default function AdminTab() {
  const { user, isAuthenticated } = useAuth();

  const [stats, setStats] = useState<Stats | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AdminTabId>("overview");
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);

  // ── Activity / XP ──────────────────────────────────────────────────────
  interface ActivityEntry {
    id: number; type: string; description: string;
    xpEarned: number; tokensUsed: number; createdAt: string;
    email: string | null; firstName: string | null; lastName: string | null;
  }
  interface TokenStats {
    byType: { type: string; count: number; total_xp: number }[];
    topUsers: { email: string | null; first_name: string | null; last_name: string | null; activity_count: number; total_xp: number; total_tokens: number }[];
    daily: { day: string; count: number; xp: number }[];
    totals: { total_activities: string | number; total_xp: string | number; total_tokens: string | number };
    games: { description: string; play_count: number }[];
  }
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);

  // ── Community ──────────────────────────────────────────────────────────
  interface CommunityPost {
    id: number; title: string; content: string; category: string;
    isPinned: boolean; isLocked: boolean; likeCount: number; viewCount: number;
    createdAt: string; email: string | null; firstName: string | null;
  }
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState({ title: "", content: "" });
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // ── Billing (PayPal / aggregate) ───────────────────────────────────────
  interface BillingTotals {
    total_purchases: number; completed_count: number; pending_count: number;
    total_revenue_cents: number; total_tokens_sold: number;
  }
  interface BillingPurchase {
    id: number; user_id: string; package_id: string; tokens_amount: number;
    amount_usd_cents: number; status: string; paypal_order_id: string | null;
    paypal_transaction_id: string | null; paypal_payer_email: string | null;
    created_at: string; completed_at: string | null;
    email: string | null; first_name: string | null; last_name: string | null;
  }
  interface BillingByPkg { package_id: string; count: number; revenue_cents: number; tokens_sold: number; }
  interface BillingStats {
    totals: BillingTotals;
    recent: BillingPurchase[];
    byPackage: BillingByPkg[];
    daily: { day: string; count: number; revenue_cents: number }[];
    topBuyers: { email: string | null; first_name: string | null; total_spent_cents: number; purchase_count: number }[];
  }
  const [billingStats, setBillingStats] = useState<BillingStats | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  // ── Premium Users ──────────────────────────────────────────────────────
  interface PremiumUser {
    id: string; email: string | null; first_name: string | null; last_name: string | null;
    created_at: string; is_premium: boolean; total_purchases: number;
    total_spent_cents: number; total_tokens: number; last_purchase: string | null;
    package_ids: string | null; current_balance: number | null;
  }
  const [premiumUsers, setPremiumUsers] = useState<PremiumUser[]>([]);
  const [premiumLoading, setPremiumLoading] = useState(false);

  // ── Support ────────────────────────────────────────────────────────────
  interface SupportTicket {
    id: number; user_id: string | null; email: string; name: string | null;
    subject: string; message: string; category: string; priority: string;
    directed_to: string; status: string; admin_response: string | null;
    responded_by: string | null; created_at: string; updated_at: string;
  }
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportFilter, setSupportFilter] = useState<string>("all");
  const [supportResponse, setSupportResponse] = useState<{ id: number; text: string } | null>(null);
  const [supportResponding, setSupportResponding] = useState(false);

  // ── Security ───────────────────────────────────────────────────────────
  interface SecurityEvt {
    id: number; type: string; severity: string; user_id: string | null;
    ip_address: string | null; user_agent: string | null; email: string | null;
    description: string | null; created_at: string; is_blocked: boolean;
    user_email: string | null; first_name: string | null; last_name: string | null;
  }
  interface SecuritySummary { type: string; severity: string; count: number; }
  const [securityEvents, setSecurityEvents] = useState<SecurityEvt[]>([]);
  const [securitySummary, setSecuritySummary] = useState<SecuritySummary[]>([]);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [blockingId, setBlockingId] = useState<number | null>(null);

  // ── Error logs ─────────────────────────────────────────────────────────
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [errorLogsTotal, setErrorLogsTotal] = useState(0);
  const [errorLogsLoading, setErrorLogsLoading] = useState(false);
  const [errorLoggingEnabled, setErrorLoggingEnabled] = useState(() =>
    localStorage.getItem("admin_error_logging") !== "false"
  );

  const toggleErrorLogging = () => {
    const next = !errorLoggingEnabled;
    setErrorLoggingEnabled(next);
    localStorage.setItem("admin_error_logging", String(next));
    window.dispatchEvent(new CustomEvent("error-logging-toggle", { detail: { enabled: next } }));
  };

  // ── Data loaders ───────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [sRes, rRes, uRes] = await Promise.all([
        fetch(api("/admin/stats"),   { credentials: "include" }),
        fetch(api("/admin/ratings"), { credentials: "include" }),
        fetch(api("/admin/users"),   { credentials: "include" }),
      ]);
      if (sRes.status === 403) { setError("Access denied — admin only"); setLoading(false); return; }
      const [s, r, u] = await Promise.all([sRes.json(), rRes.json(), uRes.json()]);
      setStats(s); setRatings(r.ratings ?? []); setUsers(u.users ?? []);
    } catch { setError("Failed to load admin data"); }
    setLoading(false);
  }, []);

  const loadErrorLogs = useCallback(async () => {
    setErrorLogsLoading(true);
    try {
      const res = await fetch(api("/admin/errors?limit=100"), { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as { logs: ErrorLog[]; total: number };
        setErrorLogs(data.logs); setErrorLogsTotal(data.total);
      }
    } catch {}
    setErrorLogsLoading(false);
  }, []);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const [aRes, tRes] = await Promise.all([
        fetch(api("/admin/activity?limit=100"),  { credentials: "include" }),
        fetch(api("/admin/token-stats"),          { credentials: "include" }),
      ]);
      if (aRes.ok) { const d = await aRes.json(); setActivityEntries(d.activities ?? []); }
      if (tRes.ok) { const d = await tRes.json(); setTokenStats(d); }
    } catch {}
    setActivityLoading(false);
  }, []);

  const loadBilling = useCallback(async () => {
    setBillingLoading(true);
    try {
      const res = await fetch(api("/admin/billing-stats"), { credentials: "include" });
      if (res.ok) { const d = await res.json(); setBillingStats(d); }
    } catch {}
    setBillingLoading(false);
  }, []);

  const loadPremiumUsers = useCallback(async () => {
    setPremiumLoading(true);
    try {
      const res = await fetch(api("/admin/premium-users"), { credentials: "include" });
      if (res.ok) { const d = await res.json() as { users: PremiumUser[] }; setPremiumUsers(d.users ?? []); }
    } catch {}
    setPremiumLoading(false);
  }, []);

  const loadCommunity = useCallback(async () => {
    setCommunityLoading(true);
    try {
      const res = await fetch(api("/community/posts?sort=new&limit=50"), { credentials: "include" });
      if (res.ok) { const d = await res.json(); setCommunityPosts(d.posts ?? []); }
    } catch {}
    setCommunityLoading(false);
  }, []);

  const loadSupport = useCallback(async (statusFilter?: string) => {
    setSupportLoading(true);
    try {
      const qs = statusFilter && statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(api(`/admin/support${qs}`), { credentials: "include" });
      if (res.ok) { const d = await res.json() as { tickets: SupportTicket[] }; setSupportTickets(d.tickets ?? []); }
    } catch {}
    setSupportLoading(false);
  }, []);

  const loadSecurity = useCallback(async () => {
    setSecurityLoading(true);
    try {
      const res = await fetch(api("/admin/security-events"), { credentials: "include" });
      if (res.ok) { const d = await res.json(); setSecurityEvents(d.events ?? []); setSecuritySummary(d.summary ?? []); }
    } catch {}
    setSecurityLoading(false);
  }, []);

  // ── Effects ────────────────────────────────────────────────────────────

  useEffect(() => { if (isAuthenticated) loadData(); }, [isAuthenticated, loadData]);
  useEffect(() => { if (tab === "errors"          && isAuthenticated) loadErrorLogs(); }, [tab, isAuthenticated, loadErrorLogs]);
  useEffect(() => { if (tab === "activity"        && isAuthenticated) loadActivity();  }, [tab, isAuthenticated, loadActivity]);
  useEffect(() => { if (tab === "billing"         && isAuthenticated) loadBilling();   }, [tab, isAuthenticated, loadBilling]);
  useEffect(() => { if (tab === "security"        && isAuthenticated) loadSecurity();  }, [tab, isAuthenticated, loadSecurity]);
  useEffect(() => { if (tab === "community"       && isAuthenticated) loadCommunity(); }, [tab, isAuthenticated, loadCommunity]);
  useEffect(() => { if (tab === "premium"         && isAuthenticated) loadPremiumUsers(); }, [tab, isAuthenticated, loadPremiumUsers]);
  useEffect(() => {
    if (tab === "support" && isAuthenticated)
      loadSupport(supportFilter === "all" ? undefined : supportFilter);
  }, [tab, isAuthenticated, loadSupport, supportFilter]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleDeleteError = async (id: number) => {
    await fetch(api(`/admin/errors/${id}`), { method: "DELETE", credentials: "include" });
    setErrorLogs(prev => prev.filter(e => e.id !== id));
    setErrorLogsTotal(prev => prev - 1);
  };

  const handleClearAllErrors = async () => {
    if (!confirm("Clear all error logs? This cannot be undone.")) return;
    await fetch(api("/admin/errors"), { method: "DELETE", credentials: "include" });
    setErrorLogs([]); setErrorLogsTotal(0);
  };

  const handlePromote = async (userId: string) => {
    setPromoting(userId);
    await fetch(api("/admin/promote"), {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, isAdmin: true } : u));
    setPromoting(null);
  };

  const handleDemote = async (userId: string) => {
    if (!confirm("Remove admin access from this user?")) return;
    setPromoting(userId);
    await fetch(api("/admin/demote"), {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, isAdmin: false } : u));
    setPromoting(null);
  };

  const [resettingTokens, setResettingTokens] = useState<string | null>(null);
  const handleResetTokens = async (u: AdminUser) => {
    if (!confirm(`Reset ${u.firstName ?? u.email}'s token balance to 600K?`)) return;
    setResettingTokens(u.id);
    const res = await fetch(api("/admin/users/reset-tokens"), {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id }),
    });
    const data = await res.json() as { ok?: boolean; newBalance?: number; error?: string };
    if (data.ok) alert(`Tokens reset to ${(data.newBalance ?? 600000).toLocaleString()}.`);
    else alert(`Error: ${data.error ?? "Unknown error"}`);
    setResettingTokens(null);
  };

  const [togglingPremium, setTogglingPremium] = useState<string | null>(null);
  const handleTogglePremium = async (u: AdminUser) => {
    setTogglingPremium(u.id);
    const next = !u.isPremium;
    await fetch(api(`/admin/users/${u.id}/premium`), {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ premium: next }),
    });
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isPremium: next } : x));
    setTogglingPremium(null);
  };

  const handleBlock = async (id: number) => {
    setBlockingId(id);
    try {
      await fetch(api(`/admin/security-events/${id}/block`), { method: "POST", credentials: "include" });
      setSecurityEvents(prev => prev.map(e => e.id === id ? { ...e, is_blocked: true } : e));
    } catch {}
    setBlockingId(null);
  };

  const handlePostAnnouncement = async () => {
    if (!newAnnouncement.title.trim() || !newAnnouncement.content.trim()) return;
    setPostingAnnouncement(true); setPostError(null);
    try {
      const res = await fetch(api("/community/posts"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newAnnouncement.title.trim(), content: newAnnouncement.content.trim(), category: "announcement" }),
      });
      const d = await res.json() as { post?: CommunityPost; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setNewAnnouncement({ title: "", content: "" });
      await loadCommunity();
    } catch (err) { setPostError((err as Error).message); }
    setPostingAnnouncement(false);
  };

  const handleTogglePin = async (id: number) => {
    try {
      const res = await fetch(api(`/community/posts/${id}/pin`), { method: "PATCH", credentials: "include" });
      if (res.ok) {
        const d = await res.json() as { pinned: boolean };
        setCommunityPosts(prev => prev.map(p => p.id === id ? { ...p, isPinned: d.pinned } : p));
      }
    } catch {}
  };

  const handleDeletePost = async (id: number) => {
    if (!confirm("Delete this post?")) return;
    try {
      await fetch(api(`/community/posts/${id}`), { method: "DELETE", credentials: "include" });
      setCommunityPosts(prev => prev.filter(p => p.id !== id));
    } catch {}
  };

  const handleSupportReply = async () => {
    if (!supportResponse || !supportResponse.text.trim()) return;
    setSupportResponding(true);
    try {
      const res = await fetch(api(`/admin/support/${supportResponse.id}`), {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress", adminResponse: supportResponse.text.trim() }),
      });
      if (res.ok) {
        const d = await res.json() as { ticket: SupportTicket };
        setSupportTickets(prev => prev.map(t => t.id === supportResponse.id ? d.ticket : t));
        setSupportResponse(null);
      }
    } catch {}
    setSupportResponding(false);
  };

  const handleSupportStatus = async (id: number, status: string) => {
    try {
      const res = await fetch(api(`/admin/support/${id}`), {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const d = await res.json() as { ticket: SupportTicket };
        setSupportTickets(prev => prev.map(t => t.id === id ? d.ticket : t));
      }
    } catch {}
  };

  // ── Guard ──────────────────────────────────────────────────────────────

  if (!isAuthenticated) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <ShieldAlert className="w-12 h-12 text-red-400" />
      <p className="text-muted-foreground text-sm">Sign in to access the admin panel.</p>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-sm">Loading admin data…</span>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <ShieldAlert className="w-12 h-12 text-red-400" />
      <p className="text-red-400 font-semibold">{error}</p>
      <button onClick={loadData}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-white border border-white/10 hover:border-white/20 transition-all">
        <RefreshCw className="w-4 h-4" /> Retry
      </button>
    </div>
  );

  // ── Tab definitions ────────────────────────────────────────────────────

  const openTickets = supportTickets.filter(t => t.status === "open").length;

  const TABS: { id: AdminTabId; label: string; icon: React.ElementType; badge?: number | string }[] = [
    { id: "overview",       label: "Overview",                                        icon: BarChart3      },
    { id: "analytics",      label: "Analytics",                                       icon: LineChart      },
    { id: "ratings",        label: `Ratings (${ratings.length})`,                     icon: Star           },
    { id: "users",          label: `Users (${users.length})`,                         icon: Users          },
    { id: "admins",         label: `Admins (${users.filter(u => u.isAdmin).length})`, icon: ShieldAlert    },
    { id: "community",      label: `Community (${communityPosts.length || 0})`,       icon: MessageSquare  },
    { id: "errors",         label: errorLogsTotal > 0 ? `Errors (${errorLogsTotal})` : "Errors", icon: AlertTriangle },
    { id: "activity",       label: `Activity (${activityEntries.length || 0})`,       icon: Zap            },
    { id: "billing",        label: "Billing",                                         icon: CreditCard     },
    { id: "manual_billing", label: "Manual Billing",                                  icon: HandCoins      },
    { id: "security",       label: `Security${securityEvents.length > 0 ? ` (${securityEvents.length})` : ""}`, icon: Lock },
    { id: "premium",        label: `Premium (${premiumUsers.length})`,                icon: Crown          },
    { id: "support",        label: `Support${openTickets > 0 ? ` (${openTickets})` : ""}`, icon: LifeBuoy },
  ];

  const adminUsers = users.filter(u => u.isAdmin);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="space-y-5 max-w-4xl mx-auto">

        {/* Header */}
        <div className="rounded-2xl p-5 flex items-center justify-between"
          style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(220,38,38,0.06))", border: "1px solid rgba(239,68,68,0.25)" }}>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl"
              style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.35)" }}>
              <ShieldAlert className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-display font-black text-white">Admin Dashboard</h2>
              <p className="text-sm text-muted-foreground">Platform overview — {user?.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowCreateAdmin(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-300 border border-red-500/30 hover:border-red-400/50 transition-all"
              style={{ background: "rgba(239,68,68,0.1)" }}>
              <UserPlus className="w-3.5 h-3.5" /> New Admin
            </button>
            <button onClick={loadData}
              className="p-2 rounded-xl border border-white/10 hover:border-white/20 text-muted-foreground hover:text-white transition-all" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all border",
                tab === id
                  ? "text-white border-red-500/50"
                  : "text-muted-foreground border-white/10 hover:border-white/20 hover:text-white",
              )}
              style={tab === id ? { background: "rgba(239,68,68,0.15)" } : { background: "rgba(255,255,255,0.03)" }}>
              <Icon className={cn(
                "w-4 h-4",
                id === "errors" && errorLogsTotal > 0 && "text-orange-400",
                id === "manual_billing" && "text-amber-400",
              )} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === "overview" && stats && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard icon={Users}       label="Total Users"       value={stats.totalUsers}                        color="#60a5fa" />
              <StatCard icon={Activity}    label="Currently Online"  value={stats.currentlyOnline}                   color="#34d399" sub="active sessions" />
              <StatCard icon={TrendingUp}  label="New This Week"     value={stats.recentSignups}                     color="#a78bfa" sub="signups" />
              <StatCard icon={Star}        label="Avg Rating"        value={`${stats.avgStars} ★`}                   color="#fbbf24" sub={`${stats.totalRatings} reviews`} />
              <StatCard icon={Brain}       label="Computations"      value={stats.totalComputations.toLocaleString()} color="#fb923c" sub="total solved" />
              <StatCard icon={CheckCircle} label="Active Sessions"   value={stats.activeUsers}                       color="#6ee7b7" sub="logged in" />
            </div>
            {ratings.length > 0 && (
              <div className="p-4 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400" /> Rating Distribution
                </h3>
                {[5,4,3,2,1].map(star => {
                  const cnt = ratings.filter(r => r.stars === star).length;
                  const pct = ratings.length > 0 ? (cnt / ratings.length) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-muted-foreground w-4">{star}★</span>
                      <div className="flex-1 h-2 rounded-full bg-white/8 overflow-hidden">
                        <div className="h-full rounded-full bg-yellow-400/70 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-6">{cnt}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Analytics ── */}
        {tab === "analytics" && <AnalyticsPanel />}

        {/* ── Ratings ── */}
        {tab === "ratings" && (
          <div className="space-y-2">
            {ratings.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">No ratings yet.</p>}
            {ratings.map(r => (
              <div key={r.id} className="p-4 rounded-xl flex gap-3"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
                  style={{ background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.3)" }}>
                  {r.firstName?.[0] ?? r.email?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">
                      {r.firstName && r.lastName ? `${r.firstName} ${r.lastName}` : (r.email ?? "Anonymous")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(r.createdAt)}</span>
                  </div>
                  <Stars n={r.stars} />
                  {r.review && <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">{r.review}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Users ── */}
        {tab === "users" && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">User</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Status</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Joined</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden md:table-cell">Tokens</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Premium</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Admin</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined }}>
                    <td className="px-4 py-2.5">
                      <p className="text-white font-medium truncate max-w-[180px]">
                        {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : (u.email ?? "—")}
                      </p>
                      {u.firstName && <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{u.email}</p>}
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs px-2 py-0.5 rounded-full text-muted-foreground"
                          style={{ background: "rgba(255,255,255,0.08)" }}>{u.authProvider}</span>
                        {u.emailVerified && <span className="text-xs text-emerald-400">✓</span>}
                        {u.isAdmin && <ShieldAlert className="w-3 h-3 text-red-400" />}
                        {u.isPremium && (
                          <span className="text-[10px] font-bold text-yellow-300 px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(251,191,36,0.15)" }}>PRO</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{timeAgo(u.createdAt)}</td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      {resettingTokens === u.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <button onClick={() => handleResetTokens(u)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-orange-400 border border-orange-500/20 hover:border-orange-400/40 transition-all"
                          style={{ background: "rgba(249,115,22,0.06)" }}>
                          ↺ Reset
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {togglingPremium === u.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      ) : u.isPremium ? (
                        <button onClick={() => handleTogglePremium(u)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-yellow-300 border border-yellow-500/30 hover:border-yellow-400/50 transition-all"
                          style={{ background: "rgba(251,191,36,0.12)" }}>
                          <ToggleRight className="w-3.5 h-3.5" /> Premium
                        </button>
                      ) : (
                        <button onClick={() => handleTogglePremium(u)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-muted-foreground border border-white/10 hover:border-yellow-500/30 hover:text-yellow-300 transition-all"
                          style={{ background: "rgba(255,255,255,0.04)" }}>
                          <ToggleLeft className="w-3.5 h-3.5" /> Free
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {u.id === user?.id ? (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      ) : promoting === u.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      ) : u.isAdmin ? (
                        <button onClick={() => handleDemote(u.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-red-400 border border-red-500/20 hover:border-red-400/40 transition-all"
                          style={{ background: "rgba(239,68,68,0.06)" }}>
                          <ShieldOff className="w-3 h-3" /> Remove
                        </button>
                      ) : (
                        <button onClick={() => handlePromote(u.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-emerald-400 border border-emerald-500/20 hover:border-emerald-400/40 transition-all"
                          style={{ background: "rgba(52,211,153,0.06)" }}>
                          <ShieldCheck className="w-3 h-3" /> Make Admin
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">No users yet.</p>}
          </div>
        )}

        {/* ── Admins ── */}
        {tab === "admins" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Manage who has admin access to this dashboard.</p>
              <button onClick={() => setShowCreateAdmin(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-300 border border-red-500/30 hover:border-red-400/50 transition-all"
                style={{ background: "rgba(239,68,68,0.1)" }}>
                <UserPlus className="w-3.5 h-3.5" /> Add Admin
              </button>
            </div>
            {adminUsers.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No admins yet.</p>
            ) : adminUsers.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-4 rounded-xl"
                style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-red-200"
                  style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  {u.firstName?.[0] ?? u.email?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {u.firstName ? `${u.firstName}${u.lastName ? ` ${u.lastName}` : ""}` : u.email}
                  </p>
                  {u.firstName && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                </div>
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                {u.id !== user?.id && (
                  <button onClick={() => handleDemote(u.id)} disabled={promoting === u.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-red-400 border border-red-500/20 hover:border-red-400/40 transition-all disabled:opacity-50"
                    style={{ background: "rgba(239,68,68,0.08)" }}>
                    {promoting === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><ShieldOff className="w-3 h-3" />Remove</>}
                  </button>
                )}
                {u.id === user?.id && <span className="text-[10px] text-muted-foreground">(you)</span>}
              </div>
            ))}
          </div>
        )}

        {/* ── Community ── */}
        {tab === "community" && (
          <div className="space-y-5">
            <div className="rounded-2xl p-5 space-y-3"
              style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}>
              <p className="text-sm font-semibold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-400" /> Post an Announcement
              </p>
              <input type="text" placeholder="Title" value={newAnnouncement.title}
                onChange={e => setNewAnnouncement(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl text-sm bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/50 transition-colors" />
              <textarea placeholder="Write your announcement..." value={newAnnouncement.content} rows={3}
                onChange={e => setNewAnnouncement(prev => ({ ...prev, content: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl text-sm bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/50 transition-colors resize-none" />
              {postError && <p className="text-red-400 text-xs">{postError}</p>}
              <button onClick={handlePostAnnouncement}
                disabled={postingAnnouncement || !newAnnouncement.title.trim() || !newAnnouncement.content.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 transition-all"
                style={{ background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.4)", color: "#a5b4fc" }}>
                {postingAnnouncement ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {postingAnnouncement ? "Posting…" : "Post Announcement"}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{communityPosts.length} post{communityPosts.length !== 1 ? "s" : ""}</p>
              <button onClick={loadCommunity}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-white border border-white/10 hover:border-white/20 transition-all">
                <RefreshCw className={cn("w-3 h-3", communityLoading && "animate-spin")} /> Refresh
              </button>
            </div>

            {communityLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : communityPosts.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No posts yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {communityPosts.map(post => (
                  <div key={post.id} className="rounded-xl p-4 space-y-2"
                    style={{
                      background: post.isPinned ? "rgba(99,102,241,0.07)" : "rgba(255,255,255,0.03)",
                      border: post.isPinned ? "1px solid rgba(99,102,241,0.25)" : "1px solid rgba(255,255,255,0.07)",
                    }}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          {post.isPinned && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>PINNED</span>
                          )}
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">{post.category}</span>
                        </div>
                        <p className="text-sm font-semibold text-white truncate">{post.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{post.content}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground/60">
                          <span className="flex items-center gap-1"><Globe className="w-2.5 h-2.5" />{post.firstName ?? post.email ?? "Unknown"}</span>
                          <span>❤ {post.likeCount}</span>
                          <span>👁 {post.viewCount}</span>
                          <span>{timeAgo(post.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => handleTogglePin(post.id)} title={post.isPinned ? "Unpin" : "Pin to top"}
                          className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
                          style={{ color: post.isPinned ? "#a5b4fc" : "#64748b" }}>
                          {post.isPinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => handleDeletePost(post.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Errors ── */}
        {tab === "errors" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-2xl"
              style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <div>
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-400" /> User Error Logging
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {errorLoggingEnabled ? "Collecting errors from all users" : "Logging is paused"}
                </p>
              </div>
              <button onClick={toggleErrorLogging}
                className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border",
                  errorLoggingEnabled ? "text-emerald-300 border-emerald-500/40" : "text-muted-foreground border-white/10")}
                style={{ background: errorLoggingEnabled ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.04)" }}>
                {errorLoggingEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                {errorLoggingEnabled ? "ON" : "OFF"}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{errorLogsTotal} error{errorLogsTotal !== 1 ? "s" : ""} logged</p>
              <div className="flex gap-2">
                <button onClick={loadErrorLogs}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-white border border-white/10 hover:border-white/20 transition-all">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
                {errorLogs.length > 0 && (
                  <button onClick={handleClearAllErrors}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 border border-red-500/20 hover:border-red-400/40 transition-all"
                    style={{ background: "rgba(239,68,68,0.06)" }}>
                    <Trash2 className="w-3 h-3" /> Clear All
                  </button>
                )}
              </div>
            </div>
            {errorLogsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : errorLogs.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-10 h-10 text-emerald-400/40 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No errors logged</p>
              </div>
            ) : (
              <div className="space-y-2">
                {errorLogs.map(log => <ErrorLogItem key={log.id} log={log} onDelete={handleDeleteError} />)}
              </div>
            )}
          </div>
        )}

        {/* ── Activity ── */}
        {tab === "activity" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" /> Activity & XP Log
              </h3>
              <button onClick={loadActivity}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-white border border-white/10 hover:border-white/20 transition-all">
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>

            {activityLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                {tokenStats && (
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard icon={Activity} label="Total Activities" value={Number(tokenStats.totals?.total_activities ?? 0)} color="#a78bfa" />
                    <StatCard icon={Award}    label="Total XP Awarded" value={Number(tokenStats.totals?.total_xp ?? 0)}         color="#fbbf24" />
                    <StatCard icon={Zap}      label="AI Tokens Used"   value={Number(tokenStats.totals?.total_tokens ?? 0)}     color="#34d399" />
                  </div>
                )}
                {tokenStats?.byType && tokenStats.byType.length > 0 && (
                  <div className="rounded-2xl p-4 space-y-2"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Activity Breakdown by Type</p>
                    {tokenStats.byType.map(row => (
                      <div key={row.type} className="flex items-center justify-between text-sm py-1.5 border-b border-white/5 last:border-0">
                        <span className="text-white/80 font-mono text-xs bg-white/5 px-2 py-0.5 rounded">{row.type}</span>
                        <div className="flex gap-4 text-muted-foreground text-xs">
                          <span>{Number(row.count).toLocaleString()} actions</span>
                          <span className="text-yellow-400 font-semibold">+{Number(row.total_xp).toLocaleString()} XP</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {tokenStats?.topUsers && tokenStats.topUsers.length > 0 && (
                  <div className="rounded-2xl p-4 space-y-2"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Top Users by XP</p>
                    {tokenStats.topUsers.slice(0, 10).map((u, i) => (
                      <div key={u.email ?? i} className="flex items-center justify-between text-sm py-1.5 border-b border-white/5 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs w-5 text-center text-muted-foreground/50 font-bold">#{i+1}</span>
                          <span className="text-white/80 text-xs">{u.first_name ? `${u.first_name} ${u.last_name ?? ""}`.trim() : (u.email ?? "Anonymous")}</span>
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>{Number(u.activity_count).toLocaleString()} actions</span>
                          <span className="text-yellow-400 font-semibold">+{Number(u.total_xp).toLocaleString()} XP</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {tokenStats?.games && tokenStats.games.length > 0 && (
                  <div className="rounded-2xl p-4 space-y-2"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">🎮 Most Played Games</p>
                    {tokenStats.games.map((g, i) => (
                      <div key={g.description} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="w-5 text-center font-bold text-muted-foreground/50">#{i+1}</span>
                          <span className="text-white/80">{g.description}</span>
                        </div>
                        <span className="text-violet-400 font-semibold">{Number(g.play_count).toLocaleString()} plays</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="rounded-2xl p-4 space-y-2"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Recent Activity Feed</p>
                  {activityEntries.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-6">No activity recorded yet</p>
                  ) : (
                    <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                      {activityEntries.map(entry => (
                        <div key={entry.id} className="flex items-start gap-3 text-xs py-1.5 border-b border-white/5 last:border-0">
                          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-white/70 truncate">{entry.description}</span>
                              {entry.xpEarned > 0 && <span className="text-yellow-400 shrink-0">+{entry.xpEarned} XP</span>}
                            </div>
                            <div className="text-muted-foreground/50 mt-0.5 flex gap-2">
                              <span>{entry.email ?? "Guest"}</span>
                              <span>·</span>
                              <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Billing (aggregate/PayPal) ── */}
        {tab === "billing" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" /> Token Purchase Revenue
              </h3>
              <button onClick={loadBilling}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-white border border-white/10 hover:border-white/20 transition-all">
                <RefreshCw className={cn("w-3.5 h-3.5", billingLoading && "animate-spin")} /> Refresh
              </button>
            </div>

            {billingLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}

            {!billingLoading && billingStats && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <StatCard icon={DollarSign}  label="Total Revenue" value={`$${((billingStats.totals?.total_revenue_cents ?? 0) / 100).toFixed(2)}`} color="#34d399" />
                  <StatCard icon={CheckCircle} label="Completed"     value={Number(billingStats.totals?.completed_count ?? 0)}                         color="#60a5fa" sub="purchases" />
                  <StatCard icon={CreditCard}  label="Tokens Sold"   value={`${((Number(billingStats.totals?.total_tokens_sold ?? 0)) / 1_000_000).toFixed(1)}M`} color="#a78bfa" />
                </div>

                {(billingStats.byPackage ?? []).length > 0 && (
                  <div className="p-4 rounded-2xl"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <h4 className="text-sm font-semibold text-white mb-3">Sales by Package</h4>
                    <div className="space-y-2">
                      {billingStats.byPackage.map(pkg => (
                        <div key={pkg.package_id} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground font-mono">{pkg.package_id}</span>
                          <span className="text-white font-semibold">${(Number(pkg.revenue_cents) / 100).toFixed(2)}</span>
                          <span className="text-muted-foreground">{pkg.count} sales</span>
                          <span className="text-emerald-400">{(Number(pkg.tokens_sold) / 1_000_000).toFixed(1)}M tokens</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(billingStats.topBuyers ?? []).length > 0 && (
                  <div className="p-4 rounded-2xl"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <h4 className="text-sm font-semibold text-white mb-3">Top Buyers</h4>
                    <div className="space-y-2">
                      {billingStats.topBuyers.slice(0, 10).map((b, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-white truncate max-w-[200px]">{b.first_name || b.email || "Unknown"}</span>
                          <span className="text-emerald-400 font-semibold">${(Number(b.total_spent_cents) / 100).toFixed(2)}</span>
                          <span className="text-muted-foreground">{b.purchase_count} purchase{Number(b.purchase_count) !== 1 ? "s" : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-4 rounded-2xl"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <h4 className="text-sm font-semibold text-white mb-3">Recent Transactions</h4>
                  {(billingStats.recent ?? []).length === 0 && (
                    <p className="text-muted-foreground text-sm text-center py-4">No purchases yet.</p>
                  )}
                  <div className="space-y-2">
                    {(billingStats.recent ?? []).map(p => (
                      <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl text-xs"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <span className={cn("px-2 py-0.5 rounded-full font-semibold text-[10px]",
                          p.status === "completed" ? "bg-emerald-500/20 text-emerald-300"
                            : p.status === "pending" ? "bg-amber-500/20 text-amber-300"
                            : "bg-red-500/20 text-red-300")}>
                          {p.status}
                        </span>
                        <span className="text-white font-semibold">${(p.amount_usd_cents / 100).toFixed(2)}</span>
                        <span className="text-muted-foreground">{(p.tokens_amount / 1_000_000).toFixed(0)}M tokens</span>
                        <span className="text-muted-foreground flex-1 truncate">{p.email ?? "Unknown"}</span>
                        <span className="text-muted-foreground shrink-0">{new Date(p.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {!billingLoading && !billingStats && (
              <div className="text-center py-12 text-muted-foreground">
                <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No billing data yet.</p>
                <p className="text-xs mt-1">Configure PayPal to start accepting payments.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Manual Billing ── */}
        {tab === "manual_billing" && (
          <ManualBillingPanel onRefreshBilling={loadBilling} />
        )}

        {/* ── Security ── */}
        {tab === "security" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-red-400" /> Security Events
              </h3>
              <button onClick={loadSecurity}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-white border border-white/10 hover:border-white/20 transition-all">
                <RefreshCw className={cn("w-3.5 h-3.5", securityLoading && "animate-spin")} /> Refresh
              </button>
            </div>

            {securityLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}

            {!securityLoading && (
              <>
                {securitySummary.length > 0 && (
                  <div className="p-4 rounded-2xl"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <h4 className="text-sm font-semibold text-white mb-3">Last 7 Days — Event Summary</h4>
                    <div className="space-y-2">
                      {securitySummary.map((s, i) => {
                        const sevColor = s.severity === "critical" ? "text-red-400"
                          : s.severity === "high" ? "text-orange-400"
                          : s.severity === "medium" ? "text-amber-400" : "text-slate-400";
                        return (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-white font-mono">{s.type.replace(/_/g, " ")}</span>
                            <span className={cn("font-semibold", sevColor)}>{s.severity}</span>
                            <span className="text-muted-foreground">{s.count} events</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {securityEvents.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Lock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No security events logged yet.</p>
                    </div>
                  )}
                  {securityEvents.map(evt => {
                    const sevBorder = evt.severity === "critical" ? "border-red-500/40 bg-red-500/5"
                      : evt.severity === "high" ? "border-orange-500/30 bg-orange-500/5"
                      : evt.severity === "medium" ? "border-amber-500/20 bg-amber-500/5"
                      : "border-white/8 bg-white/2";
                    const sevText = evt.severity === "critical" ? "text-red-400"
                      : evt.severity === "high" ? "text-orange-400"
                      : evt.severity === "medium" ? "text-amber-400" : "text-slate-400";
                    return (
                      <div key={evt.id} className={cn("p-3 rounded-xl border text-xs", sevBorder)}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <BadgeAlert className={cn("w-3.5 h-3.5 shrink-0", sevText)} />
                              <span className="font-mono text-white">{evt.type.replace(/_/g, " ")}</span>
                              <span className={cn("font-semibold", sevText)}>[{evt.severity}]</span>
                              {evt.is_blocked && (
                                <span className="px-1.5 py-0.5 rounded bg-red-500/30 text-red-300 text-[10px] font-semibold">BLOCKED</span>
                              )}
                            </div>
                            {evt.description && <p className="text-muted-foreground mb-1">{evt.description}</p>}
                            <div className="flex gap-3 text-muted-foreground/70 flex-wrap">
                              {evt.ip_address && <span>IP: {evt.ip_address}</span>}
                              {(evt.user_email || evt.email) && <span>Email: {evt.user_email ?? evt.email}</span>}
                              <span>{new Date(evt.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                          {!evt.is_blocked && (
                            <button onClick={() => handleBlock(evt.id)} disabled={blockingId === evt.id}
                              className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold text-red-300 border border-red-500/30 hover:border-red-400/50 transition-all disabled:opacity-50"
                              style={{ background: "rgba(239,68,68,0.1)" }}>
                              {blockingId === evt.id ? "..." : "Flag"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Premium ── */}
        {tab === "premium" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Crown className="w-4 h-4 text-yellow-400" /> Token Buyers
                <span className="text-xs text-muted-foreground font-normal">— users who have made at least one purchase</span>
              </h3>
              <button onClick={loadPremiumUsers}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-white border border-white/10 hover:border-white/20 transition-all">
                <RefreshCw className={cn("w-3.5 h-3.5", premiumLoading && "animate-spin")} /> Refresh
              </button>
            </div>
            {premiumLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
            {!premiumLoading && premiumUsers.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Crown className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No token purchases yet.</p>
              </div>
            )}
            {!premiumLoading && premiumUsers.length > 0 && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <StatCard icon={Crown}      label="Total Buyers" value={premiumUsers.length} color="#fbbf24" />
                  <StatCard icon={DollarSign} label="Total Spent"  value={`$${(premiumUsers.reduce((s,u) => s + Number(u.total_spent_cents), 0) / 100).toFixed(2)}`} color="#34d399" />
                  <StatCard icon={Zap}        label="Tokens Sold"  value={`${(premiumUsers.reduce((s,u) => s + Number(u.total_tokens), 0) / 1_000_000).toFixed(1)}M`} color="#a78bfa" />
                </div>
                <div className="rounded-2xl overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/8">
                        {["User","Spent","Tokens","Balance","Last Purchase","Pkgs"].map(h => (
                          <th key={h} className={cn("text-muted-foreground font-semibold px-4 py-3",
                            ["Tokens","Balance"].includes(h) ? "text-right hidden sm:table-cell" : "text-right",
                            h === "Balance" ? "hidden md:table-cell" : "",
                            h === "Last Purchase" ? "hidden lg:table-cell" : "",
                            h === "User" ? "text-left" : "",
                          )}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {premiumUsers.map((u, i) => (
                        <tr key={u.id} className={cn("border-b border-white/5 hover:bg-white/3 transition-all", i % 2 !== 0 && "bg-white/1")}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-black shrink-0"
                                style={{ background: `hsl(${(u.id.charCodeAt(0) * 137) % 360}, 60%, 55%)` }}>
                                {(u.first_name?.[0] ?? u.email?.[0] ?? "?").toUpperCase()}
                              </div>
                              <div>
                                <p className="text-white font-medium">{u.first_name ?? u.email ?? "Unknown"}</p>
                                <p className="text-muted-foreground/70 text-[10px]">{u.email ?? u.id.slice(0, 8)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-emerald-400 font-bold">${(Number(u.total_spent_cents) / 100).toFixed(2)}</span>
                            <p className="text-muted-foreground/60 text-[10px]">{u.total_purchases} purchase{u.total_purchases !== 1 ? "s" : ""}</p>
                          </td>
                          <td className="px-4 py-3 text-right hidden sm:table-cell">
                            <span className="text-violet-400 font-semibold">{(Number(u.total_tokens) / 1_000_000).toFixed(1)}M</span>
                          </td>
                          <td className="px-4 py-3 text-right hidden md:table-cell">
                            <span className="text-blue-300">{u.current_balance != null ? `${(Number(u.current_balance) / 1_000_000).toFixed(2)}M` : "—"}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">
                            {u.last_purchase ? new Date(u.last_purchase).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-muted-foreground/70 text-[10px] font-mono">{u.package_ids ?? "—"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Support ── */}
        {tab === "support" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <LifeBuoy className="w-4 h-4 text-blue-400" /> Support Tickets
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                {["all","open","in_progress","resolved","closed"].map(s => (
                  <button key={s}
                    onClick={() => { setSupportFilter(s); loadSupport(s === "all" ? undefined : s); }}
                    className={cn("px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all",
                      supportFilter === s ? "text-white border-blue-500/50 bg-blue-500/15" : "text-muted-foreground border-white/10 hover:text-white")}>
                    {s.replace("_", " ")}
                  </button>
                ))}
                <button onClick={() => loadSupport(supportFilter === "all" ? undefined : supportFilter)}
                  className="p-1.5 rounded-lg border border-white/10 hover:border-white/20 text-muted-foreground hover:text-white transition-all">
                  <RefreshCw className={cn("w-3.5 h-3.5", supportLoading && "animate-spin")} />
                </button>
              </div>
            </div>

            {supportLoading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
            {!supportLoading && supportTickets.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <LifeBuoy className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No support tickets yet.</p>
              </div>
            )}
            <div className="space-y-3">
              {supportTickets.map(ticket => {
                const prioStyle = {
                  urgent: "border-red-500/40 bg-red-500/5",
                  high:   "border-orange-500/40 bg-orange-500/5",
                  medium: "border-amber-500/20 bg-amber-500/5",
                  low:    "border-white/10 bg-white/2",
                }[ticket.priority] ?? "border-white/10 bg-white/2";
                const prioText = {
                  urgent: "text-red-400", high: "text-orange-400",
                  medium: "text-amber-400", low: "text-slate-400",
                }[ticket.priority] ?? "text-slate-400";
                const statusBadge = {
                  open:        "bg-blue-500/20 text-blue-300",
                  in_progress: "bg-amber-500/20 text-amber-300",
                  resolved:    "bg-emerald-500/20 text-emerald-300",
                  closed:      "bg-white/10 text-muted-foreground",
                }[ticket.status] ?? "bg-white/10 text-muted-foreground";
                const isReplying = supportResponse?.id === ticket.id;
                return (
                  <div key={ticket.id} className={cn("rounded-2xl border p-4 space-y-3", prioStyle)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-white font-semibold text-sm">#{ticket.id} — {ticket.subject}</span>
                          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", prioText)}
                            style={{ background: "rgba(255,255,255,0.06)" }}>
                            {ticket.priority.toUpperCase()}
                          </span>
                          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", statusBadge)}>
                            {ticket.status.replace("_", " ")}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60 px-1.5 py-0.5 rounded-full border border-white/8">{ticket.category}</span>
                          <span className="text-[10px] text-muted-foreground/60">→ {ticket.directed_to}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="font-medium text-white/70">{ticket.name ?? ticket.email}</span>
                          <span>{ticket.email}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(ticket.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {ticket.status !== "resolved" && ticket.status !== "closed" && (
                          <button onClick={() => handleSupportStatus(ticket.id, "resolved")}
                            className="p-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-all"
                            title="Mark Resolved">
                            <BadgeCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setSupportResponse(isReplying ? null : { id: ticket.id, text: ticket.admin_response ?? "" })}
                          className={cn("p-1.5 rounded-lg border transition-all",
                            isReplying ? "border-blue-500/50 bg-blue-500/15 text-blue-300" : "border-white/10 text-muted-foreground hover:text-white")}
                          title="Reply">
                          <Send className="w-3.5 h-3.5" />
                        </button>
                        <select value={ticket.status}
                          onChange={e => handleSupportStatus(ticket.id, e.target.value)}
                          className="text-[11px] bg-black/40 border border-white/10 rounded-lg px-1.5 py-1 text-muted-foreground cursor-pointer">
                          {["open","in_progress","resolved","closed"].map(s =>
                            <option key={s} value={s}>{s.replace("_", " ")}</option>
                          )}
                        </select>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground bg-black/20 rounded-xl p-3 leading-relaxed whitespace-pre-wrap">
                      {ticket.message}
                    </div>
                    {ticket.admin_response && (
                      <div className="text-xs bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                        <p className="text-emerald-400 font-semibold mb-1">
                          Response {ticket.responded_by ? `· ${ticket.responded_by}` : ""}
                        </p>
                        <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{ticket.admin_response}</p>
                      </div>
                    )}
                    {isReplying && (
                      <div className="space-y-2">
                        <textarea value={supportResponse!.text}
                          onChange={e => setSupportResponse({ id: ticket.id, text: e.target.value })}
                          className="w-full bg-black/40 border border-blue-500/30 rounded-xl p-3 text-sm text-white resize-none focus:outline-none focus:border-blue-500/60 placeholder-muted-foreground"
                          rows={3} placeholder="Type your response to the user..." />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setSupportResponse(null)}
                            className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-muted-foreground hover:text-white transition-all">
                            Cancel
                          </button>
                          <button onClick={handleSupportReply}
                            disabled={supportResponding || !supportResponse!.text.trim()}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50"
                            style={{ background: "rgba(59,130,246,0.3)", border: "1px solid rgba(59,130,246,0.5)" }}>
                            {supportResponding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            Send & Notify User
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </motion.div>

      <AnimatePresence>
        {showCreateAdmin && (
          <CreateAdminModal onClose={() => setShowCreateAdmin(false)} onCreated={loadData} />
        )}
      </AnimatePresence>
    </>
  );
}
