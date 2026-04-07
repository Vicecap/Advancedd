import React, { useState, useEffect } from "react";
import { ShieldAlert, Lock, Mail, User, Eye, EyeOff, CheckCircle, AlertCircle, Loader2, X, LogIn } from "lucide-react";
import { motion } from "framer-motion";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function api(p: string) { return `${BASE_URL}api${p}`; }

interface AdminSetupModalProps {
  setupToken: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AdminSetupModal({ setupToken, onClose, onSuccess }: AdminSetupModalProps) {
  const [status, setStatus] = useState<"checking" | "available" | "login" | "error">("checking");

  // Setup form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [firstName, setFirstName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(api("/admin/setup/status"))
      .then(r => r.json())
      .then((data: { hasAdmin: boolean }) => {
        setStatus(data.hasAdmin ? "login" : "available");
      })
      .catch(() => setStatus("error"));
  }, []);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPw) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(api("/admin/setup"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, firstName, setupToken }),
      });
      const data = await res.json() as { user?: unknown; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Setup failed.");
      setDone(true);
      setTimeout(onSuccess, 2000);
    } catch (err) { setError((err as Error).message); }
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch(api("/auth/login"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json() as { user?: { isAdmin?: boolean }; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Login failed.");
      if (!data.user?.isAdmin) throw new Error("This account does not have admin access.");
      setDone(true);
      setTimeout(onSuccess, 1500);
    } catch (err) { setError((err as Error).message); }
    setLoading(false);
  };

  const inputCls = "w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground text-sm focus:outline-none focus:border-red-400/50 transition-colors";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-md rounded-2xl p-8 z-10"
        style={{ background: "#0d0f1c", border: "2px solid rgba(239,68,68,0.4)", boxShadow: "0 0 60px rgba(239,68,68,0.15)" }}
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)" }}>
            <ShieldAlert className="w-7 h-7 text-red-400" />
          </div>
          <h2 className="text-xl font-display font-black text-white">
            {status === "login" ? "Admin Login" : "Admin Setup"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {status === "login" ? "Sign in to your administrator account" : "Create the first administrator account"}
          </p>
        </div>

        {status === "checking" && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {status === "error" && (
          <div className="text-center py-6">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-red-400 font-semibold">Could not check setup status</p>
            <p className="text-xs text-muted-foreground mt-1">Please ensure the server is running.</p>
          </div>
        )}

        {status === "login" && !done && (
          <form onSubmit={handleLogin} className="space-y-3">
            <div className="p-3 rounded-xl text-xs mb-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}>
              An admin account already exists. Sign in to access the admin dashboard.
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="email" placeholder="Admin email" required value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type={showPw ? "text" : "password"} placeholder="Password" required value={password} onChange={e => setPassword(e.target.value)} className={`${inputCls} pr-10`} />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-base font-bold text-white disabled:opacity-60 transition-all"
              style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.4), rgba(220,38,38,0.3))", border: "1px solid rgba(239,68,68,0.5)" }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><LogIn className="w-4 h-4" />Sign In as Admin</>}
            </button>
          </form>
        )}

        {status === "available" && !done && (
          <form onSubmit={handleSetup} className="space-y-3">
            <div className="p-3 rounded-xl text-xs mb-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}>
              This URL can only be used once for setup. After that, it shows the admin login form.
            </div>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="text" placeholder="Your name (optional)" value={firstName} onChange={e => setFirstName(e.target.value)} className={inputCls} />
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="email" placeholder="Admin email" required value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type={showPw ? "text" : "password"} placeholder="Password (min 8 chars)" required value={password} onChange={e => setPassword(e.target.value)} className={`${inputCls} pr-10`} />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type={showPw ? "text" : "password"} placeholder="Confirm password" required value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className={inputCls} />
            </div>
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-base font-bold text-white disabled:opacity-60 transition-all"
              style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.4), rgba(220,38,38,0.3))", border: "1px solid rgba(239,68,68,0.5)" }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ShieldAlert className="w-4 h-4" />Create Admin Account</>}
            </button>
          </form>
        )}

        {done && (
          <div className="text-center py-4">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-emerald-400 font-bold text-lg">
              {status === "login" ? "Signed in!" : "Admin account created!"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Redirecting to admin dashboard…</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
