import React, { useState, useRef, useEffect } from "react";
import { X, Mail, Lock, User, Eye, EyeOff, AlertCircle, ShieldCheck, RotateCcw, KeyRound, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui-elements";
import { cn } from "@/lib/utils";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Mode = "login" | "register";
type Screen = "auth" | "verify" | "forgot" | "reset";

const RESEND_COOLDOWN = 300;
const MAX_RESENDS = 5;

export default function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [screen, setScreen] = useState<Screen>("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verify screen
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendAttemptsLeft, setResendAttemptsLeft] = useState(MAX_RESENDS);
  const [maxResendReached, setMaxResendReached] = useState(false);

  // Forgot/Reset password screen
  const [resetEmail, setResetEmail] = useState("");
  const [resetDevCode, setResetDevCode] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState(["", "", "", "", "", ""]);
  const resetCodeRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const reset = () => {
    setEmail(""); setPassword(""); setFirstName(""); setError(null); setShowPw(false);
    setVerifyEmail(null); setDevCode(null); setCode(["","","","","",""]);
    setResendCooldown(0); setResendAttemptsLeft(MAX_RESENDS); setMaxResendReached(false);
    setResetEmail(""); setResetDevCode(null); setResetCode(["","","","","",""]);
    setNewPassword(""); setShowNewPw(false); setResetSent(false); setResetSuccess(false);
    setScreen("auth");
  };
  const switchMode = (m: Mode) => { setMode(m); reset(); };

  useEffect(() => { if (!open) reset(); }, [open]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown(v => v - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendCooldown]);

  useEffect(() => {
    if (verifyEmail) setScreen("verify");
  }, [verifyEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const body = mode === "register" ? { email, password, firstName } : { email, password };
    try {
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(body),
      });
      const data = await res.json() as { user?: unknown; error?: string; needsVerification?: boolean; email?: string; devCode?: string };
      if (data.needsVerification) {
        setVerifyEmail(data.email ?? email.trim().toLowerCase());
        setResendCooldown(RESEND_COOLDOWN);
        setResendAttemptsLeft(MAX_RESENDS);
        if (data.devCode) { setDevCode(data.devCode); setCode(data.devCode.split("")); }
        setLoading(false); return;
      }
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (idx: number, val: string) => {
    const ch = val.replace(/\D/g, "").slice(-1);
    const next = [...code]; next[idx] = ch; setCode(next);
    if (ch && idx < 5) codeRefs.current[idx + 1]?.focus();
    if (!ch && idx > 0 && val === "") codeRefs.current[idx - 1]?.focus();
  };

  const handleCodeKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[idx] && idx > 0) codeRefs.current[idx - 1]?.focus();
    if (e.key === "ArrowLeft" && idx > 0) codeRefs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < 5) codeRefs.current[idx + 1]?.focus();
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length > 0) {
      const next = [...code];
      for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? "";
      setCode(next);
      codeRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  const handleVerify = async () => {
    const fullCode = code.join("");
    if (fullCode.length < 6) { setError("Please enter all 6 digits."); return; }
    setLoading(true); setError(null);
    try {
      const refCode = localStorage.getItem("pendingRefCode") ?? undefined;
      const res = await fetch("/api/auth/verify-email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ email: verifyEmail, code: fullCode, refCode }),
      });
      const data = await res.json() as { user?: unknown; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Verification failed.");
      if (refCode) localStorage.removeItem("pendingRefCode");
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
      setCode(["","","","","",""]);
      codeRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || maxResendReached) return;
    setResending(true); setError(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ email: verifyEmail }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; waitSeconds?: number; attemptsLeft?: number; maxReached?: boolean; devCode?: string };
      if (data.maxReached) {
        setMaxResendReached(true); setError("Maximum resend attempts reached. Please start over.");
      } else if (data.waitSeconds) {
        setResendCooldown(data.waitSeconds);
        setError(`Please wait ${Math.ceil(data.waitSeconds / 60)} minute(s) before requesting a new code.`);
      } else if (res.ok) {
        setResendCooldown(RESEND_COOLDOWN);
        if (typeof data.attemptsLeft === "number") setResendAttemptsLeft(data.attemptsLeft);
        if (data.devCode) { setDevCode(data.devCode); setCode(data.devCode.split("")); }
      } else {
        setError(data.error ?? "Failed to resend. Try again.");
      }
    } catch {}
    setResending(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) { setError("Enter your email address."); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; devCode?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to send reset code.");
      setResetSent(true);
      if (data.devCode) { setResetDevCode(data.devCode); setResetCode(data.devCode.split("")); }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetCodeChange = (idx: number, val: string) => {
    const ch = val.replace(/\D/g, "").slice(-1);
    const next = [...resetCode]; next[idx] = ch; setResetCode(next);
    if (ch && idx < 5) resetCodeRefs.current[idx + 1]?.focus();
    if (!ch && idx > 0 && val === "") resetCodeRefs.current[idx - 1]?.focus();
  };

  const handleResetCodeKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !resetCode[idx] && idx > 0) resetCodeRefs.current[idx - 1]?.focus();
    if (e.key === "ArrowLeft" && idx > 0) resetCodeRefs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < 5) resetCodeRefs.current[idx + 1]?.focus();
  };

  const handleResetCodePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length > 0) {
      const next = [...resetCode];
      for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? "";
      setResetCode(next);
      resetCodeRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  const handleResetPassword = async () => {
    const fullCode = resetCode.join("");
    if (fullCode.length < 6) { setError("Enter all 6 digits of your reset code."); return; }
    if (newPassword.length < 6) { setError("New password must be at least 6 characters."); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim(), code: fullCode, password: newPassword }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to reset password.");
      setResetSuccess(true);
    } catch (err) {
      setError((err as Error).message);
      setResetCode(["","","","","",""]);
      resetCodeRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const fmtCooldown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${s}s`;
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-md bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl p-8"
          >
            <button onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
              <X className="w-4 h-4" />
            </button>

            {/* ── Email Verify Screen ── */}
            {screen === "verify" && verifyEmail && (
              <div>
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3" style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}>
                    <ShieldCheck className="w-7 h-7 text-indigo-400" />
                  </div>
                  <h2 className="text-xl font-display font-bold text-white">Verify your email</h2>
                  {devCode ? (
                    <>
                      <p className="text-sm text-muted-foreground mt-1">Email is not configured on this server.</p>
                      <p className="text-xs text-muted-foreground">Your verification code is shown below — it has been pre-filled for you.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground mt-1">We sent a 6-digit code to</p>
                      <p className="text-sm font-semibold text-indigo-300 mt-0.5">{verifyEmail}</p>
                    </>
                  )}
                </div>

                {devCode && (
                  <div className="mb-4 px-4 py-3 rounded-xl text-center"
                    style={{ background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.35)" }}>
                    <p className="text-xs text-orange-300 font-semibold mb-1">Your verification code</p>
                    <p className="text-3xl font-mono font-bold tracking-widest text-orange-200">{devCode}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Configure EMAIL_HOST / EMAIL_USER / EMAIL_PASS to send codes by email</p>
                  </div>
                )}

                <div className="flex justify-center gap-2 mb-5" onPaste={handleCodePaste}>
                  {code.map((digit, i) => (
                    <input key={i} ref={el => { codeRefs.current[i] = el; }}
                      type="text" inputMode="numeric" maxLength={1} value={digit}
                      onChange={e => handleCodeChange(i, e.target.value)}
                      onKeyDown={e => handleCodeKeyDown(i, e)}
                      className="w-11 h-13 text-center text-xl font-bold rounded-xl border outline-none transition-all"
                      style={{ background: "rgba(255,255,255,0.05)", borderColor: digit ? "rgba(99,102,241,0.7)" : "rgba(255,255,255,0.12)", color: "white", fontSize: "22px", padding: "10px 0" }}
                    />
                  ))}
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-3">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
                  </div>
                )}

                <Button onClick={handleVerify} isLoading={loading} className="w-full mb-3">Verify &amp; sign in</Button>

                <div className="flex items-center justify-between">
                  <button onClick={() => { setVerifyEmail(null); setError(null); setCode(["","","","","",""]); setScreen("auth"); }}
                    className="text-xs text-muted-foreground hover:text-white transition-colors flex items-center gap-1">← Back</button>
                  <div className="flex flex-col items-end gap-0.5">
                    {!maxResendReached ? (
                      <button onClick={handleResend} disabled={resendCooldown > 0 || resending}
                        className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors flex items-center gap-1">
                        <RotateCcw className={`w-3 h-3 ${resending ? "animate-spin" : ""}`} />
                        {resendCooldown > 0 ? `Resend in ${fmtCooldown(resendCooldown)}` : "Resend code"}
                      </button>
                    ) : (
                      <span className="text-xs text-red-400">No resends left</span>
                    )}
                    {!maxResendReached && resendAttemptsLeft < MAX_RESENDS && (
                      <span className="text-[10px] text-muted-foreground/60">{resendAttemptsLeft} resend{resendAttemptsLeft !== 1 ? "s" : ""} left</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Forgot Password Screen ── */}
            {screen === "forgot" && !resetSuccess && (
              <div>
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3" style={{ background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.3)" }}>
                    <KeyRound className="w-7 h-7 text-orange-400" />
                  </div>
                  <h2 className="text-xl font-display font-bold text-white">Reset Password</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {resetSent ? "Enter the 6-digit code and your new password" : "Enter your email to receive a reset code"}
                  </p>
                </div>

                {!resetSent ? (
                  <form onSubmit={handleForgotPassword} className="space-y-3">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input type="email" placeholder="Your email address" required value={resetEmail}
                        onChange={e => setResetEmail(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground text-sm focus:outline-none focus:border-orange-500/50 transition-colors" />
                    </div>
                    {error && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
                      </div>
                    )}
                    <Button type="submit" isLoading={loading} className="w-full">Send Reset Code</Button>
                    <button type="button" onClick={() => { setScreen("auth"); setError(null); }}
                      className="w-full text-sm text-muted-foreground hover:text-white transition-colors py-1">← Back to sign in</button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    {resetDevCode && (
                      <div className="px-4 py-3 rounded-xl text-center"
                        style={{ background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.35)" }}>
                        <p className="text-xs text-orange-300 font-semibold mb-1">Your reset code</p>
                        <p className="text-3xl font-mono font-bold tracking-widest text-orange-200">{resetDevCode}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Configure email settings to send codes by email</p>
                      </div>
                    )}
                    <div className="flex justify-center gap-2" onPaste={handleResetCodePaste}>
                      {resetCode.map((digit, i) => (
                        <input key={i} ref={el => { resetCodeRefs.current[i] = el; }}
                          type="text" inputMode="numeric" maxLength={1} value={digit}
                          onChange={e => handleResetCodeChange(i, e.target.value)}
                          onKeyDown={e => handleResetCodeKeyDown(i, e)}
                          className="w-11 h-13 text-center text-xl font-bold rounded-xl border outline-none transition-all"
                          style={{ background: "rgba(255,255,255,0.05)", borderColor: digit ? "rgba(251,146,60,0.7)" : "rgba(255,255,255,0.12)", color: "white", fontSize: "22px", padding: "10px 0" }}
                        />
                      ))}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input type={showNewPw ? "text" : "password"} placeholder="New password (min 6 chars)" value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground text-sm focus:outline-none focus:border-orange-500/50 transition-colors" />
                      <button type="button" onClick={() => setShowNewPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors">
                        {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {error && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
                      </div>
                    )}
                    <Button onClick={handleResetPassword} isLoading={loading} className="w-full">Reset Password</Button>
                    <button onClick={() => { setResetSent(false); setError(null); }}
                      className="w-full text-sm text-muted-foreground hover:text-white transition-colors py-1">← Change email</button>
                  </div>
                )}
              </div>
            )}

            {/* ── Reset Success ── */}
            {screen === "forgot" && resetSuccess && (
              <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-2"
                  style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.35)" }}>
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h2 className="text-xl font-display font-bold text-white">Password Reset!</h2>
                <p className="text-sm text-muted-foreground">Your password has been successfully changed. Sign in with your new password.</p>
                <Button onClick={() => { setScreen("auth"); setMode("login"); reset(); }} className="w-full">Sign in now</Button>
              </div>
            )}

            {/* ── Main Auth Screen ── */}
            {screen === "auth" && (
              <>
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 mb-3">
                    <span className="text-2xl">🧮</span>
                  </div>
                  <h2 className="text-xl font-display font-bold text-white">
                    {mode === "login" ? "Welcome back" : "Create your account"}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {mode === "login"
                      ? "Sign in to access your progress and tokens"
                      : "Get 600K tokens/week and save all your sessions"}
                  </p>
                </div>

                <div className="flex rounded-xl bg-white/5 border border-white/10 p-1 mb-6">
                  {(["login", "register"] as Mode[]).map((m) => (
                    <button key={m} onClick={() => switchMode(m)}
                      className={cn("flex-1 py-1.5 rounded-lg text-sm font-medium transition-all",
                        mode === m ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-white"
                      )}>
                      {m === "login" ? "Sign in" : "Create account"}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  {mode === "register" && (
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input type="text" placeholder="First name (optional)" value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>
                  )}
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input type="email" placeholder="Email address" required value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input type={showPw ? "text" : "password"} placeholder="Password" required value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary/50 transition-colors"
                    />
                    <button type="button" onClick={() => setShowPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {mode === "login" && (
                    <div className="flex justify-end">
                      <button type="button" onClick={() => { setResetEmail(email); setScreen("forgot"); setError(null); }}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                        Forgot password?
                      </button>
                    </div>
                  )}

                  {error && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <Button type="submit" isLoading={loading} className="w-full">
                    {mode === "login" ? "Sign in" : "Create account"}
                  </Button>
                </form>

                <div className="flex items-center gap-3 mt-4">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <a href="/api/auth/google"
                  className="mt-3 flex items-center justify-center gap-2.5 w-full py-2.5 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-sm font-medium text-white">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </a>

                {mode === "register" && (
                  <p className="text-xs text-muted-foreground text-center mt-4">
                    By creating an account you get <span className="text-yellow-400">600K tokens/week</span> — use them for AI solving and study resources.
                  </p>
                )}
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
