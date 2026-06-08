import React, { useState, useEffect, useRef, createContext, useContext } from "react";
import {
  Brain, Camera, LineChart, Calculator,
  MessageSquare, GraduationCap, BookOpen, Globe,
  Coins, User, ChevronRight, Clock, LogIn, Library,
  FileText, AlertTriangle, Sparkles, BarChart3, BookMarked,
  Zap, ShieldAlert, Puzzle, Settings, Cpu, TrendingUp, Sun, Moon, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useGuestTokens } from "@/hooks/use-guest-tokens";
import AuthModal from "@/components/auth-modal";
import ProfilePanel from "@/components/profile-panel";
import TokenShop from "@/components/token-shop";
import TokenDepletedModal from "@/components/token-depleted-modal";
import GuestSignUpPopup from "@/components/guest-signup-popup";
import { loadTheme, saveTheme, applyTheme } from "@/components/tabs/settings-tab";

export const LayoutContext = createContext<{ openShop: () => void }>({ openShop: () => {} });
export function useLayoutContext() { return useContext(LayoutContext); }

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const navItems = [
  { id: "external",   label: "Solver Hub",    full: "Mathematics Solver Hub",   icon: Globe,         color: "text-cyan-400",   glow: "rgba(34,211,238,0.2)" },
  { id: "solver",     label: "AI Solver",     full: "Mathematics Solver Hub 2", icon: Brain,         color: "text-violet-400", glow: "rgba(167,139,250,0.2)" },
  { id: "ocr",        label: "Image OCR",     full: "Image OCR",                icon: Camera,        color: "text-pink-400",   glow: "rgba(244,114,182,0.2)" },
  { id: "graph",      label: "Graph",         full: "Graph Plotter",            icon: LineChart,     color: "text-emerald-400",glow: "rgba(52,211,153,0.2)" },
  { id: "calculator", label: "Calculator",    full: "Calculator",               icon: Calculator,    color: "text-orange-400", glow: "rgba(251,146,60,0.2)" },
  { id: "chat",       label: "AI Chat",       full: "AI Chat",                  icon: MessageSquare, color: "text-blue-400",   glow: "rgba(96,165,250,0.2)" },
  { id: "quiz",       label: "Quiz",          full: "Quiz Mode",                icon: GraduationCap, color: "text-yellow-400", glow: "rgba(250,204,21,0.2)" },
  { id: "resources",  label: "Library",       full: "Study Library",            icon: Library,       color: "text-indigo-400", glow: "rgba(129,140,248,0.2)" },
  { id: "homework",   label: "Homework",      full: "Homework Help",            icon: FileText,      color: "text-rose-400",   glow: "rgba(251,113,133,0.2)" },
  { id: "novels",     label: "Novels",        full: "Novel Library",            icon: BookMarked,    color: "text-amber-400",  glow: "rgba(251,191,36,0.2)"  },
  { id: "notes",      label: "Notes",         full: "Notes & Green Books",      icon: FileText,      color: "text-emerald-400",glow: "rgba(16,185,129,0.2)" },
  { id: "syllabus",   label: "Syllabus",      full: "Syllabus",                 icon: GraduationCap, color: "text-pink-400",   glow: "rgba(244,114,182,0.2)" },
  { id: "guide",      label: "Guide",         full: "User Guide",               icon: BookOpen,      color: "text-teal-400",   glow: "rgba(45,212,191,0.2)" },
  { id: "progress",   label: "My Progress",   full: "My Progress Dashboard",     icon: TrendingUp,    color: "text-emerald-400",glow: "rgba(52,211,153,0.2)" },
  { id: "puzzles",    label: "Puzzles",       full: "Word Puzzle Games",         icon: Puzzle,        color: "text-fuchsia-400",glow: "rgba(232,121,249,0.2)" },
  { id: "sagemath",   label: "SageMath",      full: "SageMath Explorer",         icon: Cpu,           color: "text-emerald-400",glow: "rgba(52,211,153,0.2)" },
  { id: "moodle",     label: "Moodle",        full: "Moodle Learning Centre",    icon: GraduationCap, color: "text-rose-400",   glow: "rgba(251,113,133,0.2)" },
  { id: "openedx",    label: "Study Hall",    full: "Study Hall & Exam Centre",  icon: GraduationCap, color: "text-amber-400",  glow: "rgba(251,191,36,0.2)"  },
  { id: "community",  label: "Community",     full: "Community Forum",           icon: Users,         color: "text-indigo-400", glow: "rgba(99,102,241,0.2)"  },
  { id: "settings",   label: "Settings",      full: "Settings",                  icon: Settings,      color: "text-slate-400",  glow: "rgba(148,163,184,0.2)" },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function TokenBar({ balance }: { balance: number }) {
  const max = 60_000;
  const pct = Math.min(100, (balance / max) * 100);
  const color = pct > 50 ? "#6ee7b7" : pct > 20 ? "#fbbf24" : "#f87171";
  return (
    <div className="w-full h-1 rounded-full bg-white/8 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }}
      />
    </div>
  );
}

export default function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const { user, isLoading, isAuthenticated, tokens, logout, refreshUser, refreshTokens } = useAuth();
  const { balance: guestBalance, depleted: guestDepleted, pct: guestPct, resetAt: guestResetAt } = useGuestTokens(!isAuthenticated);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [depletedModalOpen, setDepletedModalOpen] = useState(false);
  const [guestSignupOpen, setGuestSignupOpen] = useState(false);
  const [guestSignupReason, setGuestSignupReason] = useState<"tokens" | "pdf" | "feature">("tokens");
  const [colorMode, setColorMode] = useState<"dark" | "light">(() => loadTheme().colorMode ?? "dark");
  const prevBalance = useRef<number | null>(null);
  const depletedShownThisSession = useRef(false);

  const toggleColorMode = () => {
    const t = loadTheme();
    const next = t.colorMode === "light" ? "dark" : "light";
    const updated = { ...t, colorMode: next as "dark" | "light" };
    saveTheme(updated);
    applyTheme(updated);
    setColorMode(next);
  };

  useEffect(() => {
    applyTheme(loadTheme());
    const base = import.meta.env.BASE_URL ?? "/";
    fetch(`${base}api/views/record`, { method: "POST" }).catch(() => {});
    const handleOpenAuth = (e: Event) => {
      const reason = (e as CustomEvent).detail?.reason as "tokens" | "pdf" | "feature" | undefined;
      setGuestSignupReason(reason ?? "feature");
      setGuestSignupOpen(true);
    };
    window.addEventListener("open-auth-modal", handleOpenAuth);
    return () => window.removeEventListener("open-auth-modal", handleOpenAuth);
  }, []);

  const handleAuthSuccess = async () => {
    setAuthOpen(false);
    await refreshUser();
    await refreshTokens();
  };

  // Detect return from PayPal redirect flow
  const [paypalNotif, setPaypalNotif] = useState<{ type: "success" | "error" | "cancelled"; tokens?: number; reason?: string } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("paypal_success")) {
      const tokens = parseInt(params.get("tokens") ?? "0", 10);
      setPaypalNotif({ type: "success", tokens: isNaN(tokens) ? 0 : tokens });
      refreshTokens();
    } else if (params.has("paypal_error")) {
      setPaypalNotif({ type: "error", reason: params.get("reason") ?? undefined });
    } else if (params.has("paypal_cancelled")) {
      setPaypalNotif({ type: "cancelled" });
    }
    // Clean up URL params
    if (params.has("paypal_success") || params.has("paypal_error") || params.has("paypal_cancelled")) {
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !tokens) return;
    const prev = prevBalance.current;
    const curr = tokens.balance;
    if (prev !== null && prev > 0 && curr <= 0 && !depletedShownThisSession.current) {
      depletedShownThisSession.current = true;
      setDepletedModalOpen(true);
    }
    if (prev === null && curr <= 0 && !depletedShownThisSession.current) {
      depletedShownThisSession.current = true;
      setDepletedModalOpen(true);
    }
    prevBalance.current = curr;
  }, [tokens?.balance, isAuthenticated]);

  const prevGuestDepleted = useRef(false);
  useEffect(() => {
    if (!isAuthenticated && guestDepleted && !prevGuestDepleted.current) {
      prevGuestDepleted.current = true;
      setGuestSignupReason("tokens");
      setGuestSignupOpen(true);
    }
    if (!guestDepleted) prevGuestDepleted.current = false;
  }, [guestDepleted, isAuthenticated]);

  const isDepleted = isAuthenticated && !!tokens && tokens.balance <= 0;
  const openShop = () => { setShopOpen(true); setDepletedModalOpen(false); };

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
    : (user?.email ?? "Account");

  const activeItem = navItems.find(n => n.id === activeTab) ?? (activeTab === "admin" ? { id: "admin", label: "Admin", full: "Admin Dashboard", icon: ShieldAlert, color: "text-red-400", glow: "rgba(239,68,68,0.2)" } : undefined);
  const ADMIN_EMAILS_FRONTEND = (import.meta.env.VITE_ADMIN_EMAILS ?? "").split(",").map((e: string) => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = user?.email && (ADMIN_EMAILS_FRONTEND.includes(user.email.toLowerCase()) || user.email.toLowerCase().includes("admin"));

  return (
    <LayoutContext.Provider value={{ openShop }}>
    <div className="h-screen bg-background text-foreground flex flex-col md:flex-row overflow-hidden">

      {/* ── PayPal return notification banner ── */}
      {paypalNotif && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold max-w-sm w-[92vw] border transition-all`}
          style={paypalNotif.type === "success"
            ? { background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)", color: "#6ee7b7" }
            : paypalNotif.type === "cancelled"
            ? { background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", color: "#fbbf24" }
            : { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#fca5a5" }
          }
        >
          <span className="text-lg">
            {paypalNotif.type === "success" ? "✅" : paypalNotif.type === "cancelled" ? "↩️" : "❌"}
          </span>
          <span className="flex-1">
            {paypalNotif.type === "success"
              ? `Payment successful! ${paypalNotif.tokens ? `${(paypalNotif.tokens / 1_000_000).toFixed(0)}M tokens` : "Tokens"} credited to your account.`
              : paypalNotif.type === "cancelled"
              ? "Payment cancelled — you were not charged."
              : `Payment failed (${paypalNotif.reason ?? "unknown error"}). Please try again or contact support.`
            }
          </span>
          <button onClick={() => setPaypalNotif(null)} className="opacity-60 hover:opacity-100 transition-opacity text-lg leading-none">×</button>
        </div>
      )}

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="glass-panel hidden md:flex w-72 min-h-screen flex-shrink-0 z-20 flex-col">

        {/* Brand */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="relative">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
                style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.25))", border: "1px solid rgba(99,102,241,0.4)" }}
              >
                🧮
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#07091208] flex items-center justify-center">
                <Sparkles className="w-2 h-2 text-emerald-900" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-black text-[15px] tracking-tight leading-tight" style={{ background: "linear-gradient(135deg, #e0e7ff 0%, #c4b5fd 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                AI Math Solver
              </h1>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400/80 font-semibold tracking-widest uppercase">Live</span>
              </div>
            </div>
            <button
              onClick={toggleColorMode}
              title={colorMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all hover:scale-105"
              style={{ background: colorMode === "light" ? "rgba(251,191,36,0.18)" : "rgba(148,163,184,0.12)", border: colorMode === "light" ? "1px solid rgba(251,191,36,0.4)" : "1px solid rgba(148,163,184,0.2)" }}
            >
              {colorMode === "light"
                ? <Sun className="w-4 h-4 text-yellow-400" />
                : <Moon className="w-4 h-4 text-slate-400" />}
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="mx-4 mb-4 rounded-xl px-3 py-2.5 flex items-center gap-3" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
          <BarChart3 className="w-4 h-4 text-indigo-400 shrink-0" />
          <div className="text-[11px] text-muted-foreground leading-tight">
            <span className="text-white font-semibold">600K</span> weekly AI tokens &middot; <span className="text-white font-semibold">11</span> tools
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto scrollbar-hide">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium transition-all duration-200 text-[13px] text-left group",
                  isActive
                    ? "nav-active text-white"
                    : "text-muted-foreground hover:text-white hover:bg-white/5 border border-transparent"
                )}
              >
                <div className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200",
                  isActive ? "bg-white/10" : "bg-white/5 group-hover:bg-white/8"
                )}>
                  <Icon className={cn("w-3.5 h-3.5 transition-colors", isActive ? item.color : "text-muted-foreground group-hover:text-white")} />
                </div>
                <span className="truncate">{item.full}</span>
                {isActive && <div className={cn("ml-auto w-1.5 h-1.5 rounded-full shrink-0", item.color.replace("text-", "bg-"))} />}
              </button>
            );
          })}
          {isAdmin && (
            <button
              key="admin"
              onClick={() => setActiveTab("admin")}
              className={cn(
                "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium transition-all duration-200 text-[13px] text-left group mt-1 border",
                activeTab === "admin"
                  ? "nav-active text-white border-red-500/20"
                  : "text-muted-foreground hover:text-white hover:bg-white/5 border-transparent"
              )}
            >
              <div className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200",
                activeTab === "admin" ? "bg-white/10" : "bg-white/5 group-hover:bg-white/8"
              )}>
                <ShieldAlert className={cn("w-3.5 h-3.5 transition-colors", activeTab === "admin" ? "text-red-400" : "text-muted-foreground group-hover:text-white")} />
              </div>
              <span className="truncate">Admin Dashboard</span>
              {activeTab === "admin" && <div className="ml-auto w-1.5 h-1.5 rounded-full shrink-0 bg-red-400" />}
            </button>
          )}
        </nav>

        {/* User section */}
        <div className="px-3 pb-5 pt-4 border-t border-white/5">
          {isLoading ? (
            <div className="animate-pulse h-20 rounded-xl bg-white/5" />
          ) : isAuthenticated && user ? (
            <div className="space-y-2">
              <button
                onClick={() => setProfileOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/6 border border-transparent hover:border-white/8 transition-all group cursor-pointer text-left"
              >
                {user.profileImageUrl ? (
                  <img src={user.profileImageUrl} alt="avatar" className="w-8 h-8 rounded-full border border-white/20 object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.3))", border: "1px solid rgba(99,102,241,0.4)" }}>
                    <User className="w-3.5 h-3.5 text-indigo-200" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-white truncate">{displayName}</p>
                  <p className="text-[11px] text-emerald-400/70 font-medium">Progress saved ✓</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-white transition-colors shrink-0" />
              </button>

              {tokens && (
                <div className="px-3 py-2.5 rounded-xl space-y-1.5" style={{ background: isDepleted ? "rgba(239,68,68,0.08)" : "rgba(234,179,8,0.08)", border: `1px solid ${isDepleted ? "rgba(239,68,68,0.3)" : "rgba(234,179,8,0.2)"}` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Coins className={`w-3.5 h-3.5 shrink-0 ${isDepleted ? "text-red-400" : "text-yellow-400"}`} />
                      <span className={`text-[12px] font-bold ${isDepleted ? "text-red-300" : "text-yellow-300"}`}>{fmt(tokens.balance)}</span>
                      <span className="text-[11px] text-muted-foreground">tokens</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/70">resets weekly</span>
                  </div>
                  <TokenBar balance={tokens.balance} />
                  {isDepleted && (
                    <button onClick={openShop}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-bold transition-all hover:brightness-110"
                      style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.25))", border: "1px solid rgba(99,102,241,0.4)", color: "#c4b5fd" }}>
                      <Zap className="w-3 h-3" /> Upgrade — Buy Tokens
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={() => setProfileOpen(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-white/8"
              >
                <Clock className="w-3.5 h-3.5" />
                History &amp; Sessions
              </button>
            </div>
          ) : (
            <div className="space-y-3 px-1">
              {/* Guest token balance */}
              <div className="px-3 py-2.5 rounded-xl space-y-1.5" style={{ background: guestDepleted ? "rgba(239,68,68,0.08)" : "rgba(139,92,246,0.08)", border: `1px solid ${guestDepleted ? "rgba(239,68,68,0.25)" : "rgba(139,92,246,0.2)"}` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap className={`w-3.5 h-3.5 shrink-0 ${guestDepleted ? "text-red-400" : "text-violet-400"}`} />
                    <span className={`text-[12px] font-bold ${guestDepleted ? "text-red-300" : "text-violet-300"}`}>{fmt(guestBalance)}</span>
                    <span className="text-[11px] text-muted-foreground">guest tokens</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/70">100K/week</span>
                </div>
                <div className="w-full h-1 rounded-full bg-white/8 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${guestPct}%`, background: guestDepleted ? "#f87171" : "linear-gradient(90deg, rgba(139,92,246,0.7), rgba(167,139,250,1))" }} />
                </div>
                {guestDepleted && (
                  <p className="text-[10px] text-red-400">Tokens depleted — sign in for 60K/week!</p>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Sign in for <span className="text-yellow-400 font-bold">600K tokens/week</span>, save history &amp; unlock all features.
              </p>
              <button
                onClick={() => setAuthOpen(true)}
                className="glow-btn w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all"
                style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.2))", border: "1px solid rgba(99,102,241,0.4)", color: "#c4b5fd" }}
              >
                <LogIn className="w-4 h-4" />
                Sign in / Sign up
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── MOBILE HEADER + TAB BAR ── */}
      <div className="md:hidden flex flex-col shrink-0 z-20 sticky top-0" style={{ background: "rgba(7,9,18,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.25))", border: "1px solid rgba(99,102,241,0.4)" }}>
              🧮
            </div>
            <div>
              <h1 className="font-display font-black text-[13px] leading-tight" style={{ background: "linear-gradient(135deg, #e0e7ff, #c4b5fd)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                AI Math Solver
              </h1>
              {activeItem && (
                <p className={cn("text-[10px] font-semibold tracking-wide", activeItem.color)}>{activeItem.full}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleColorMode}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
              style={{ background: colorMode === "light" ? "rgba(251,191,36,0.15)" : "rgba(148,163,184,0.1)", border: colorMode === "light" ? "1px solid rgba(251,191,36,0.3)" : "1px solid rgba(148,163,184,0.15)" }}
            >
              {colorMode === "light" ? <Sun className="w-3.5 h-3.5 text-yellow-400" /> : <Moon className="w-3.5 h-3.5 text-slate-400" />}
            </button>
            {tokens && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.2)" }}>
                <Coins className="w-3 h-3 text-yellow-400" />
                <span className="text-[11px] font-bold text-yellow-300">{fmt(tokens.balance)}</span>
              </div>
            )}
            {isLoading ? (
              <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
            ) : isAuthenticated && user ? (
              <button onClick={() => setProfileOpen(true)} className="flex items-center justify-center w-8 h-8 rounded-full" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.3))", border: "1px solid rgba(99,102,241,0.4)" }}>
                {user.profileImageUrl
                  ? <img src={user.profileImageUrl} alt="avatar" className="w-8 h-8 rounded-full object-cover" />
                  : <User className="w-3.5 h-3.5 text-indigo-200" />
                }
              </button>
            ) : (
              <button onClick={() => setAuthOpen(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all" style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.35)", color: "#a5b4fc" }}>
                <LogIn className="w-3 h-3" />
                Sign in
              </button>
            )}
          </div>
        </div>

        {/* Tab scroll */}
        <div className="flex gap-1.5 overflow-x-auto px-3 pb-2.5 pt-1 scrollbar-hide">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all duration-200 shrink-0",
                  isActive
                    ? "text-white nav-active"
                    : "text-muted-foreground bg-white/4 border border-transparent hover:border-white/8 hover:text-white"
                )}
              >
                <Icon className={cn("w-3 h-3 shrink-0", isActive ? item.color : "")} />
                {item.label}
              </button>
            );
          })}
          {isAdmin && (
            <button
              onClick={() => setActiveTab("admin")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all duration-200 shrink-0",
                activeTab === "admin"
                  ? "text-white nav-active"
                  : "text-muted-foreground bg-white/4 border border-transparent hover:border-white/8 hover:text-white"
              )}
            >
              <ShieldAlert className={cn("w-3 h-3 shrink-0", activeTab === "admin" ? "text-red-400" : "")} />
              Admin
            </button>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 overflow-y-auto z-10 relative flex flex-col min-h-0">
        <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col min-h-0 p-4 md:p-6 lg:p-8 relative">
          {children}
        </div>

        {/* Footer — desktop only */}
        <footer className="hidden md:block shrink-0 px-6 pb-4 pt-1 space-y-2">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start gap-2 rounded-xl px-4 py-2.5" style={{ background: "rgba(13,17,38,0.8)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <AlertTriangle className="w-3 h-3 text-amber-400/50 shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
                All mathematics problems are solved using Python libraries (SymPy, NumPy, SciPy) and the Newton Mathematics API. AI is used only to explain results and may not always be 100% accurate. Always verify important answers independently.
              </p>
            </div>
          </div>
          <div className="max-w-4xl mx-auto flex items-center justify-center gap-4 flex-wrap">
            {[
              { href: "/about",   label: "About Us"   },
              { href: "/privacy", label: "Privacy"    },
              { href: "/terms",   label: "Terms"      },
              { href: "/contact", label: "Contact"    },
            ].map(({ href, label }) => (
              <a key={href} href={href}
                className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors">
                {label}
              </a>
            ))}
            <span className="text-[10px] text-muted-foreground/25">·</span>
            {/* Social media */}
            {[
              { href: "https://wa.me/263123456789", title: "WhatsApp", svg: (<svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.554 4.118 1.528 5.847L0 24l6.305-1.505A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.683-.491-5.23-1.348l-.374-.22-3.742.893.95-3.657-.242-.384A9.927 9.927 0 0 1 2 12c0-5.514 4.486-10 10-10s10 4.486 10 10-4.486 10-10 10z"/></svg>) },
              { href: "https://facebook.com/zimsolve", title: "Facebook", svg: (<svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.791-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>) },
              { href: "https://twitter.com/zimsolve", title: "X / Twitter", svg: (<svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.843L1.254 2.25H8.08l4.213 5.567 5.951-5.567zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>) },
              { href: "https://instagram.com/zimsolve", title: "Instagram", svg: (<svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>) },
            ].map(({ href, title, svg }) => (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer" title={title}
                className="text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors">
                {svg}
              </a>
            ))}
            <span className="text-[10px] text-muted-foreground/25">© {new Date().getFullYear()} ZimSolve</span>
          </div>
        </footer>
      </main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={handleAuthSuccess} />

      {isAuthenticated && user && (
        <ProfilePanel
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          user={user}
          tokens={tokens}
          onLogout={logout}
          onOpenShop={openShop}
        />
      )}

      <TokenShop
        open={shopOpen}
        onClose={() => setShopOpen(false)}
        onPurchaseComplete={async (newBalance) => {
          await refreshTokens();
          if (newBalance > 0) depletedShownThisSession.current = false;
        }}
      />

      {isAuthenticated && (
        <TokenDepletedModal
          open={depletedModalOpen}
          nextRefillAt={tokens?.nextRefillAt ?? null}
          onBuyTokens={openShop}
          onDismiss={() => setDepletedModalOpen(false)}
        />
      )}

      {!isAuthenticated && (
        <GuestSignUpPopup
          open={guestSignupOpen}
          onClose={() => setGuestSignupOpen(false)}
          onOpenAuth={() => setAuthOpen(true)}
          reason={guestSignupReason}
        />
      )}
    </div>
    </LayoutContext.Provider>
  );
}
