import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Settings, Palette, RotateCcw, Check, Zap, Volume2, VolumeX, LayoutGrid,
  Type, Layers, CreditCard, LifeBuoy, Crown, Loader2, Send, ChevronRight,
  Clock, BadgeCheck, AlertCircle, Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useLayoutContext } from "@/components/layout";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function api(p: string) { return `${BASE_URL}api${p}`; }

// ── Types ────────────────────────────────────────────────────────────────────

export interface AppTheme {
  accent: string; accentRgb: string; bgBase: string; bgPanel: string;
  fontMono: string; radius: string; glowOpacity: string;
  sidebarStyle: "glass" | "solid" | "minimal";
  fontSize: "sm" | "base" | "lg";
  animSpeed: "none" | "subtle" | "normal" | "dynamic";
  density: "compact" | "normal" | "comfortable";
  soundFx: boolean; colorMode: "dark" | "light";
}

const DEFAULT_THEME: AppTheme = {
  accent: "#6366f1", accentRgb: "99,102,241", bgBase: "#07091208",
  bgPanel: "rgba(255,255,255,0.03)", fontMono: "JetBrains Mono",
  radius: "16px", glowOpacity: "0.2", sidebarStyle: "glass",
  fontSize: "base", animSpeed: "normal", density: "normal",
  soundFx: true, colorMode: "dark",
};

const STORAGE_KEY = "app_theme_v1";

export function loadTheme(): AppTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_THEME, ...JSON.parse(raw) as Partial<AppTheme> };
  } catch {}
  return DEFAULT_THEME;
}

export function saveTheme(t: AppTheme) { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); }

export function applyTheme(t: AppTheme) {
  const root = document.documentElement;
  root.style.setProperty("--accent", t.accent);
  root.style.setProperty("--accent-rgb", t.accentRgb);
  root.style.setProperty("--radius-card", t.radius);
  root.style.setProperty("--glow-opacity", t.glowOpacity);
  document.body.style.setProperty("--font-mono", t.fontMono);
  const fontSizeMap = { sm: "13px", base: "14px", lg: "16px" };
  root.style.setProperty("--ui-font-size", fontSizeMap[t.fontSize ?? "base"]);
  root.style.fontSize = fontSizeMap[t.fontSize ?? "base"];
  const animMap = { none: "0s", subtle: "0.1s", normal: "0.2s", dynamic: "0.4s" };
  root.style.setProperty("--anim-duration", animMap[t.animSpeed ?? "normal"]);
  const densityPadMap = { compact: "8px", normal: "16px", comfortable: "24px" };
  root.style.setProperty("--density-pad", densityPadMap[t.density ?? "normal"]);
  if (t.colorMode === "light") {
    document.documentElement.classList.add("light-mode");
    document.body.style.backgroundColor = "#f0f2f8";
    document.body.style.backgroundImage = [
      `radial-gradient(ellipse 100% 60% at 0% 0%, rgba(${t.accentRgb}, 0.08) 0%, transparent 55%)`,
      `radial-gradient(ellipse 70% 50% at 100% 100%, rgba(${t.accentRgb}, 0.06) 0%, transparent 55%)`,
      `radial-gradient(ellipse 50% 40% at 60% 30%, rgba(16, 185, 129, 0.03) 0%, transparent 60%)`,
    ].join(",");
  } else {
    document.documentElement.classList.remove("light-mode");
    document.body.style.backgroundColor = t.bgBase;
    document.body.style.backgroundImage = [
      `radial-gradient(ellipse 100% 60% at 0% 0%, rgba(${t.accentRgb}, 0.14) 0%, transparent 55%)`,
      `radial-gradient(ellipse 70% 50% at 100% 100%, rgba(${t.accentRgb}, ${t.glowOpacity}) 0%, transparent 55%)`,
      `radial-gradient(ellipse 50% 40% at 60% 30%, rgba(16, 185, 129, 0.04) 0%, transparent 60%)`,
    ].join(",");
  }
  let el = document.getElementById("__dynamic-theme") as HTMLStyleElement | null;
  if (!el) { el = document.createElement("style"); el.id = "__dynamic-theme"; document.head.appendChild(el); }
  el.textContent = `
    .nav-active { background: linear-gradient(135deg,rgba(${t.accentRgb},0.22) 0%,rgba(${t.accentRgb},0.13) 100%) !important; border: 1px solid rgba(${t.accentRgb},0.32) !important; box-shadow: 0 0 18px rgba(${t.accentRgb},0.18),inset 0 1px 0 rgba(255,255,255,0.07) !important; }
    .glow-btn:hover { box-shadow: 0 0 20px rgba(${t.accentRgb},0.35),0 0 40px rgba(${t.accentRgb},0.12) !important; }
    ::-webkit-scrollbar-thumb { background: rgba(${t.accentRgb},0.22) !important; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(${t.accentRgb},0.45) !important; }
  `;
}

// ── Colour palettes ──────────────────────────────────────────────────────────
const ACCENT_PRESETS = [
  { label: "Indigo",  color: "#6366f1", rgb: "99,102,241"  },
  { label: "Violet",  color: "#8b5cf6", rgb: "139,92,246"  },
  { label: "Blue",    color: "#3b82f6", rgb: "59,130,246"  },
  { label: "Cyan",    color: "#06b6d4", rgb: "6,182,212"   },
  { label: "Emerald", color: "#10b981", rgb: "16,185,129"  },
  { label: "Teal",    color: "#14b8a6", rgb: "20,184,166"  },
  { label: "Pink",    color: "#ec4899", rgb: "236,72,153"  },
  { label: "Rose",    color: "#f43f5e", rgb: "244,63,94"   },
  { label: "Orange",  color: "#f97316", rgb: "249,115,22"  },
  { label: "Amber",   color: "#f59e0b", rgb: "245,158,11"  },
  { label: "Lime",    color: "#84cc16", rgb: "132,204,22"  },
  { label: "Gold",    color: "#eab308", rgb: "234,179,8"   },
];
const BG_PRESETS = [
  { label: "Deep Space",  value: "#07091208" },
  { label: "Dark Navy",   value: "#080c1a"   },
  { label: "Dark Slate",  value: "#0d1117"   },
  { label: "Midnight",    value: "#0a0a0f"   },
  { label: "Charcoal",    value: "#111318"   },
  { label: "Dark Forest", value: "#0a110e"   },
];
const RADIUS_PRESETS = [
  { label: "Sharp",    value: "4px"  },
  { label: "Rounded",  value: "10px" },
  { label: "Smooth",   value: "16px" },
  { label: "Pill",     value: "24px" },
];
const FONT_PRESETS = [
  { label: "JetBrains Mono", value: "JetBrains Mono" },
  { label: "Fira Code",      value: "Fira Code"      },
  { label: "Courier New",    value: "Courier New"     },
  { label: "Consolas",       value: "Consolas"        },
  { label: "Menlo",          value: "Menlo"           },
];

// ── Sub-components ───────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">{children}</p>;
}
function SwatchGrid({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}
function Swatch({ color, selected, onClick, label }: { color: string; selected: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} title={label}
      className={cn("w-8 h-8 rounded-lg transition-all hover:scale-110", selected && "ring-2 ring-offset-2 ring-offset-black ring-white scale-110")}
      style={{ background: color }}>
      {selected && <Check className="w-4 h-4 text-white mx-auto" />}
    </button>
  );
}

type SettingsSection = "themes" | "billing" | "support" | "customer";

// ── Settings Tab ─────────────────────────────────────────────────────────────
export default function SettingsTab({ onOpenShop: _onOpenShopProp }: { onOpenShop?: () => void }) {
  const { user, isAuthenticated } = useAuth();
  const { openShop: ctxOpenShop } = useLayoutContext();
  const onOpenShop = _onOpenShopProp ?? ctxOpenShop;
  const [section, setSection] = useState<SettingsSection>("themes");

  // ── Theme state ──────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<AppTheme>(loadTheme);
  const [saved, setSaved] = useState(false);
  useEffect(() => { applyTheme(theme); }, [theme]);
  const update = (patch: Partial<AppTheme>) => { setTheme(prev => ({ ...prev, ...patch })); setSaved(false); };
  const handleSave = () => { saveTheme(theme); applyTheme(theme); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const handleReset = () => { setTheme(DEFAULT_THEME); saveTheme(DEFAULT_THEME); applyTheme(DEFAULT_THEME); };
  const accentPreset = ACCENT_PRESETS.find(p => p.color === theme.accent);

  // ── Billing state ────────────────────────────────────────────────────────
  interface BillingHistoryItem { id: number; package_id: string; tokens_amount: number; amount_usd_cents: number; status: string; created_at: string; completed_at: string | null; }
  const [billingHistory, setBillingHistory] = useState<BillingHistoryItem[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);

  const loadBilling = useCallback(async () => {
    if (!isAuthenticated) return;
    setBillingLoading(true);
    try {
      const [histRes, balRes] = await Promise.all([
        fetch(api("/billing/history"), { credentials: "include" }),
        fetch(api("/tokens/balance"), { credentials: "include" }),
      ]);
      if (histRes.ok) { const d = await histRes.json() as { purchases: BillingHistoryItem[] }; setBillingHistory(d.purchases ?? []); }
      if (balRes.ok) { const d = await balRes.json() as { balance?: number }; setTokenBalance(d.balance ?? null); }
    } catch {}
    setBillingLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { if (section === "billing" && isAuthenticated) loadBilling(); }, [section, isAuthenticated, loadBilling]);

  const hasEverPurchased = billingHistory.some(b => b.status === "completed");
  const totalSpent = billingHistory.filter(b => b.status === "completed").reduce((s, b) => s + b.amount_usd_cents, 0);
  const totalTokensBought = billingHistory.filter(b => b.status === "completed").reduce((s, b) => s + b.tokens_amount, 0);

  // ── Support state ────────────────────────────────────────────────────────
  interface SupportTicketItem { id: number; subject: string; category: string; priority: string; status: string; created_at: string; admin_response: string | null; }
  const [myTickets, setMyTickets] = useState<SupportTicketItem[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [form, setForm] = useState({ subject: "", message: "", category: "general", priority: "medium", directedTo: "support", name: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showForm, setShowForm] = useState(true);

  const loadMyTickets = useCallback(async () => {
    if (!isAuthenticated) return;
    setTicketsLoading(true);
    try {
      const res = await fetch(api("/support/tickets"), { credentials: "include" });
      if (res.ok) { const d = await res.json() as { tickets: SupportTicketItem[] }; setMyTickets(d.tickets ?? []); }
    } catch {}
    setTicketsLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { if (section === "support") loadMyTickets(); }, [section, loadMyTickets]);

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return;
    if (!isAuthenticated && !form.email.trim()) { setSubmitMsg({ ok: false, text: "Email is required to submit a ticket." }); return; }
    setSubmitting(true); setSubmitMsg(null);
    try {
      const res = await fetch(api("/support/tickets"), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form }),
      });
      const d = await res.json() as { ok?: boolean; error?: string; id?: number };
      if (!res.ok) throw new Error(d.error ?? "Submission failed.");
      setSubmitMsg({ ok: true, text: `Ticket #${d.id} submitted. We'll get back to you soon.` });
      setForm({ subject: "", message: "", category: "general", priority: "medium", directedTo: "support", name: "", email: "" });
      setShowForm(false);
      setTimeout(() => setShowForm(true), 1000);
      loadMyTickets();
    } catch (err) { setSubmitMsg({ ok: false, text: (err as Error).message }); }
    setSubmitting(false);
  };

  // ── Section tab definitions ──────────────────────────────────────────────
  const sectionTabs: { id: SettingsSection; label: string; icon: React.ElementType; authRequired: boolean }[] = [
    { id: "themes",   label: "Themes",            icon: Palette,    authRequired: false },
    { id: "billing",  label: "Billing",            icon: CreditCard, authRequired: true  },
    { id: "support",  label: "Support",            icon: LifeBuoy,   authRequired: false },
    { id: "customer", label: "Customer Dashboard", icon: Crown,      authRequired: true  },
  ];

  const statusColor = { open: "text-blue-400", in_progress: "text-amber-400", resolved: "text-emerald-400", closed: "text-slate-400" } as Record<string, string>;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="rounded-2xl p-5 flex items-center justify-between" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.06))", border: "1px solid rgba(99,102,241,0.25)" }}>
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl" style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.35)" }}>
            <Settings className="w-6 h-6 text-indigo-300" />
          </div>
          <div>
            <h2 className="text-xl font-display font-black text-white">Settings</h2>
            <p className="text-sm text-muted-foreground">Customise your experience</p>
          </div>
        </div>
        {section === "themes" && (
          <div className="flex gap-2">
            <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs border border-white/10 text-muted-foreground hover:text-white transition-all">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
            <button onClick={handleSave} className={cn("flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all", saved ? "text-emerald-300 border-emerald-500/40" : "text-indigo-200 border-indigo-500/40")} style={{ background: saved ? "rgba(52,211,153,0.12)" : "rgba(99,102,241,0.2)", border: `1px solid ${saved ? "rgba(52,211,153,0.4)" : "rgba(99,102,241,0.4)"}` }}>
              {saved ? <><Check className="w-3.5 h-3.5" /> Saved!</> : "Save Changes"}
            </button>
          </div>
        )}
      </div>

      {/* Section Nav */}
      <div className="flex gap-2 flex-wrap">
        {sectionTabs.map(({ id, label, icon: Icon, authRequired }) => {
          const locked = authRequired && !isAuthenticated;
          return (
            <button key={id} onClick={() => !locked && setSection(id)}
              className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all border",
                section === id ? "text-white border-indigo-500/50" : "text-muted-foreground border-white/10 hover:border-white/20 hover:text-white",
                locked && "opacity-40 cursor-not-allowed")}
              style={section === id ? { background: "rgba(99,102,241,0.15)" } : { background: "rgba(255,255,255,0.03)" }}
              title={locked ? "Sign in to access" : undefined}>
              <Icon className="w-4 h-4" />{label}
              {locked && <span className="text-[9px] opacity-60">🔒</span>}
            </button>
          );
        })}
      </div>

      {/* ══ THEMES ══ */}
      {section === "themes" && (
        <div className="space-y-6">
          {/* Live Preview Bar */}
          <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: `${theme.accent}15`, border: `1px solid ${theme.accent}40`, borderRadius: theme.radius }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-black" style={{ background: theme.accent }}>A</div>
            <div><p className="text-sm font-semibold text-white">Live Preview</p><p className="text-xs text-muted-foreground">Changes apply immediately as you select</p></div>
            <div className="ml-auto flex gap-1.5">
              {["#fff3","#fff2","#fff1"].map((c,i) => (<div key={i} className="w-6 h-6 rounded-md" style={{ background: c, borderRadius: `calc(${theme.radius} / 2)` }} />))}
            </div>
          </div>

          {/* Accent Colour */}
          <div className="p-5 rounded-2xl space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2"><Palette className="w-4 h-4 text-indigo-400" /><SectionTitle>Accent Colour</SectionTitle></div>
            <SwatchGrid>{ACCENT_PRESETS.map(p => (<Swatch key={p.color} color={p.color} label={p.label} selected={theme.accent === p.color} onClick={() => update({ accent: p.color, accentRgb: p.rgb })} />))}</SwatchGrid>
            <div className="flex items-center gap-3 mt-2">
              <label className="text-xs text-muted-foreground">Custom:</label>
              <div className="flex items-center gap-2">
                <input type="color" value={theme.accent} onChange={e => { const hex = e.target.value; const r = parseInt(hex.slice(1,3),16); const g = parseInt(hex.slice(3,5),16); const b = parseInt(hex.slice(5,7),16); update({ accent: hex, accentRgb: `${r},${g},${b}` }); }} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 outline-none" />
                <span className="text-xs font-mono text-muted-foreground">{theme.accent}</span>
              </div>
            </div>
            {accentPreset && <p className="text-xs text-muted-foreground">Selected: <span style={{ color: theme.accent }} className="font-semibold">{accentPreset.label}</span></p>}
          </div>

          {/* Background */}
          <div className="p-5 rounded-2xl space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <SectionTitle>Background Style</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {BG_PRESETS.map(p => (<button key={p.value} onClick={() => update({ bgBase: p.value })} className={cn("p-3 rounded-xl text-xs font-semibold text-left transition-all", theme.bgBase === p.value ? "border-2 text-white" : "border text-muted-foreground hover:text-white")} style={{ background: p.value, borderColor: theme.bgBase === p.value ? theme.accent : "rgba(255,255,255,0.1)" }}><div className="w-full h-3 rounded mb-2" style={{ background: p.value === "#07091208" ? "#1a1d2e" : p.value }} />{p.label}{theme.bgBase === p.value && <Check className="w-3 h-3 inline ml-1 text-emerald-300" />}</button>))}
            </div>
          </div>

          {/* Color Mode */}
          <div className="p-5 rounded-2xl space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <SectionTitle>Color Mode</SectionTitle>
            <div className="flex gap-2">
              {([["dark","🌙 Dark","Classic dark theme"],["light","☀️ Light","Light theme"]] as [AppTheme["colorMode"],string,string][]).map(([val,label,desc]) => (
                <button key={val} onClick={() => update({ colorMode: val })} className={cn("flex-1 p-3 rounded-xl text-left border transition-all", theme.colorMode === val ? "text-white" : "text-muted-foreground hover:text-white")} style={{ borderColor: theme.colorMode === val ? theme.accent : "rgba(255,255,255,0.1)", background: theme.colorMode === val ? `${theme.accent}20` : "rgba(255,255,255,0.03)" }}>
                  <p className="text-sm font-bold">{label}</p><p className="text-[10px] mt-0.5 opacity-60">{desc}</p>
                  {theme.colorMode === val && <Check className="w-3 h-3 text-emerald-400 mt-1" />}
                </button>
              ))}
            </div>
          </div>

          {/* Border Radius */}
          <div className="p-5 rounded-2xl space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <SectionTitle>Card Corner Style</SectionTitle>
            <div className="flex gap-2 flex-wrap">{RADIUS_PRESETS.map(p => (<button key={p.value} onClick={() => update({ radius: p.value })} className={cn("px-4 py-2 text-xs font-semibold transition-all border", theme.radius === p.value ? "text-white" : "text-muted-foreground hover:text-white")} style={{ borderRadius: p.value, borderColor: theme.radius === p.value ? theme.accent : "rgba(255,255,255,0.12)", background: theme.radius === p.value ? `${theme.accent}20` : "rgba(255,255,255,0.04)" }}>{p.label}</button>))}</div>
            <div className="flex gap-2">
              <div className="w-16 h-12 bg-white/8 border border-white/15 flex items-center justify-center text-[10px] text-muted-foreground" style={{ borderRadius: theme.radius }}>Card</div>
              <div className="w-20 h-12 border flex items-center justify-center text-[10px] text-muted-foreground" style={{ borderRadius: theme.radius, background: `${theme.accent}15`, borderColor: `${theme.accent}40` }}>Active</div>
            </div>
          </div>

          {/* Glow Intensity */}
          <div className="p-5 rounded-2xl space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <SectionTitle>Glow Intensity</SectionTitle>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-8">None</span>
              <input type="range" min="0" max="0.5" step="0.05" value={theme.glowOpacity} onChange={e => update({ glowOpacity: e.target.value })} className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer" style={{ accentColor: theme.accent }} />
              <span className="text-xs text-muted-foreground w-8">High</span>
            </div>
            <div className="flex gap-2">{["Low","Medium","High"].map((l, i) => { const val = String([0.1, 0.25, 0.45][i]); return (<button key={l} onClick={() => update({ glowOpacity: val })} className={cn("px-3 py-1.5 rounded-lg text-xs border transition-all", theme.glowOpacity === val ? "text-white border-indigo-500/50" : "text-muted-foreground border-white/10")} style={{ background: theme.glowOpacity === val ? `${theme.accent}20` : "rgba(255,255,255,0.03)" }}>{l}</button>); })}</div>
          </div>

          {/* Monospace Font */}
          <div className="p-5 rounded-2xl space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <SectionTitle>Code & Math Font</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{FONT_PRESETS.map(f => (<button key={f.value} onClick={() => update({ fontMono: f.value })} className={cn("p-3 rounded-xl text-left border transition-all", theme.fontMono === f.value ? "border-indigo-500/50 text-white" : "border-white/8 text-muted-foreground hover:text-white")} style={{ background: theme.fontMono === f.value ? `${theme.accent}12` : "rgba(255,255,255,0.03)" }}><p className="text-xs font-semibold">{f.label}</p><p className="text-[11px] mt-1" style={{ fontFamily: f.value }}>x² + 2x + 1 = 0 · ∫sin(θ)dθ</p></button>))}</div>
          </div>

          {/* Sidebar Style */}
          <div className="p-5 rounded-2xl space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-400" /><SectionTitle>Sidebar Style</SectionTitle></div>
            <div className="grid grid-cols-3 gap-2">{([ ["glass","Glass","Frosted glass blur effect"],["solid","Solid","Solid dark background"],["minimal","Minimal","Transparent minimal look"]] as [AppTheme["sidebarStyle"],string,string][]).map(([val,label,desc]) => (<button key={val} onClick={() => update({ sidebarStyle: val })} className={cn("p-3 rounded-xl text-left border transition-all", theme.sidebarStyle === val ? "border-indigo-500/50 text-white" : "border-white/8 text-muted-foreground hover:text-white")} style={{ background: theme.sidebarStyle === val ? `${theme.accent}18` : "rgba(255,255,255,0.03)" }}><p className="text-xs font-bold">{label}</p><p className="text-[10px] mt-0.5 opacity-70 leading-snug">{desc}</p>{theme.sidebarStyle === val && <Check className="w-3 h-3 text-emerald-400 mt-1" />}</button>))}</div>
          </div>

          {/* Font Size */}
          <div className="p-5 rounded-2xl space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2"><Type className="w-4 h-4 text-indigo-400" /><SectionTitle>UI Text Size</SectionTitle></div>
            <div className="flex gap-2">{([ ["sm","Small","text-[11px]"],["base","Normal","text-sm"],["lg","Large","text-base"]] as [AppTheme["fontSize"],string,string][]).map(([val,label,cls]) => (<button key={val} onClick={() => update({ fontSize: val })} className={cn("flex-1 py-3 rounded-xl border transition-all font-semibold", theme.fontSize === val ? "text-white" : "text-muted-foreground hover:text-white", cls)} style={{ borderColor: theme.fontSize === val ? theme.accent : "rgba(255,255,255,0.1)", background: theme.fontSize === val ? `${theme.accent}20` : "rgba(255,255,255,0.03)" }}>{label}{theme.fontSize === val && <Check className="w-3 h-3 inline ml-1 text-emerald-400" />}</button>))}</div>
            <p className="text-xs text-muted-foreground">Adjusts text size across the whole dashboard</p>
          </div>

          {/* Animation Speed */}
          <div className="p-5 rounded-2xl space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-400" /><SectionTitle>Animation Speed</SectionTitle></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{([ ["none","Off","No motion"],["subtle","Subtle","Very quick"],["normal","Normal","Balanced"],["dynamic","Dynamic","Expressive"]] as [AppTheme["animSpeed"],string,string][]).map(([val,label,desc]) => (<button key={val} onClick={() => update({ animSpeed: val })} className={cn("p-3 rounded-xl text-left border transition-all", theme.animSpeed === val ? "text-white" : "text-muted-foreground hover:text-white")} style={{ borderColor: theme.animSpeed === val ? theme.accent : "rgba(255,255,255,0.1)", background: theme.animSpeed === val ? `${theme.accent}18` : "rgba(255,255,255,0.03)" }}><p className="text-xs font-bold">{label}</p><p className="text-[10px] mt-0.5 opacity-60">{desc}</p></button>))}</div>
          </div>

          {/* Layout Density */}
          <div className="p-5 rounded-2xl space-y-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2"><LayoutGrid className="w-4 h-4 text-teal-400" /><SectionTitle>Layout Density</SectionTitle></div>
            <div className="flex gap-2">{([ ["compact","Compact","Tighter spacing"],["normal","Normal","Balanced"],["comfortable","Comfortable","Generous spacing"]] as [AppTheme["density"],string,string][]).map(([val,label,desc]) => (<button key={val} onClick={() => update({ density: val })} className={cn("flex-1 p-3 rounded-xl text-left border transition-all", theme.density === val ? "text-white" : "text-muted-foreground hover:text-white")} style={{ borderColor: theme.density === val ? theme.accent : "rgba(255,255,255,0.1)", background: theme.density === val ? `${theme.accent}18` : "rgba(255,255,255,0.03)" }}><p className="text-xs font-bold">{label}</p><p className="text-[10px] mt-0.5 opacity-60">{desc}</p>{theme.density === val && <Check className="w-3 h-3 text-emerald-400 mt-1" />}</button>))}</div>
          </div>

          {/* Sound Effects */}
          <div className="p-5 rounded-2xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">{theme.soundFx ? <Volume2 className="w-4 h-4 text-indigo-400" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}<SectionTitle>Sound Effects</SectionTitle></div>
              <button onClick={() => update({ soundFx: !theme.soundFx })} className="relative w-12 h-6 rounded-full transition-all duration-200" style={{ background: theme.soundFx ? theme.accent : "rgba(255,255,255,0.12)" }}>
                <div className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200", theme.soundFx ? "left-6" : "left-0.5")} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Play sounds on game correct answers, achievements and alerts</p>
          </div>

          {/* Save button */}
          <div className="flex gap-3 justify-end pb-4">
            <button onClick={handleReset} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm border border-white/10 text-muted-foreground hover:text-white transition-all"><RotateCcw className="w-3.5 h-3.5" /> Reset to Defaults</button>
            <button onClick={handleSave} className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all" style={{ background: saved ? "rgba(52,211,153,0.3)" : `${theme.accent}40`, border: `1px solid ${saved ? "rgba(52,211,153,0.5)" : `${theme.accent}60`}` }}>
              {saved ? <><Check className="w-4 h-4" /> Saved!</> : "Save Settings"}
            </button>
          </div>
        </div>
      )}

      {/* ══ BILLING ══ */}
      {section === "billing" && (
        <div className="space-y-5">
          {!isAuthenticated ? (
            <div className="text-center py-16 text-muted-foreground">
              <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Sign in to view your billing history.</p>
            </div>
          ) : billingLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* Balance + action */}
              <div className="p-5 rounded-2xl" style={{ background: "linear-gradient(135deg, rgba(52,211,153,0.10), rgba(16,185,129,0.05))", border: "1px solid rgba(52,211,153,0.25)" }}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-semibold">Current Token Balance</p>
                    <p className="text-3xl font-display font-black text-emerald-300">{tokenBalance != null ? tokenBalance >= 1_000_000 ? `${(tokenBalance / 1_000_000).toFixed(2)}M` : `${(tokenBalance / 1_000).toFixed(0)}K` : "—"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Resets weekly to 60K (purchased tokens carry over)</p>
                  </div>
                  <button onClick={onOpenShop} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all" style={{ background: "rgba(52,211,153,0.25)", border: "1px solid rgba(52,211,153,0.4)" }}>
                    <Coins className="w-4 h-4" /> Buy More Tokens
                  </button>
                </div>
              </div>

              {/* Purchase summary */}
              {billingHistory.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 rounded-2xl text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-xl font-bold text-emerald-400">${(totalSpent / 100).toFixed(2)}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Total Spent</p>
                  </div>
                  <div className="p-4 rounded-2xl text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-xl font-bold text-violet-400">{(totalTokensBought / 1_000_000).toFixed(1)}M</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Tokens Purchased</p>
                  </div>
                  <div className="p-4 rounded-2xl text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-xl font-bold text-blue-400">{billingHistory.filter(b => b.status === "completed").length}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Purchases</p>
                  </div>
                </div>
              )}

              {/* Purchase history */}
              <div className="p-4 rounded-2xl space-y-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-blue-400" /> Purchase History</h3>
                {billingHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No purchases yet.</p>
                    <button onClick={onOpenShop} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold mx-auto" style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)", color: "#6ee7b7" }}>
                      <Coins className="w-3.5 h-3.5" /> Explore Token Packages
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {billingHistory.map(p => {
                      const statusStyle = p.status === "completed" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : p.status === "pending" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-red-400 bg-red-500/10 border-red-500/20";
                      return (
                        <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-white/8 hover:border-white/12 transition-all" style={{ background: "rgba(255,255,255,0.02)" }}>
                          <div>
                            <p className="text-sm text-white font-medium">{p.package_id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</p>
                            <p className="text-[11px] text-muted-foreground">{(p.tokens_amount / 1_000_000).toFixed(0)}M tokens · {new Date(p.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-white">${(p.amount_usd_cents / 100).toFixed(2)}</p>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusStyle}`}>{p.status}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ SUPPORT ══ */}
      {section === "support" && (
        <div className="space-y-5">
          <div className="p-5 rounded-2xl" style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.10), rgba(37,99,235,0.05))", border: "1px solid rgba(59,130,246,0.25)" }}>
            <div className="flex items-center gap-3 mb-2">
              <LifeBuoy className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold text-white">Contact Support</h3>
            </div>
            <p className="text-xs text-muted-foreground">Our team typically responds within 24 hours. For billing issues, please include your email and transaction details.</p>
          </div>

          {/* Ticket form */}
          {showForm && (
            <form onSubmit={handleSubmitTicket} className="space-y-4 p-5 rounded-2xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <h3 className="text-sm font-semibold text-white">New Support Ticket</h3>

              {/* Guest fields */}
              {!isAuthenticated && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 placeholder-muted-foreground" placeholder="Your name" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Email *</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 placeholder-muted-foreground" placeholder="your@email.com" required />
                  </div>
                </div>
              )}

              {/* Subject */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Subject *</label>
                <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 placeholder-muted-foreground" placeholder="Brief description of your issue" required />
              </div>

              {/* Category / Directed To / Priority row */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 cursor-pointer">
                    <option value="general">General</option>
                    <option value="billing">Billing</option>
                    <option value="technical">Technical</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Directed To</label>
                  <select value={form.directedTo} onChange={e => setForm(f => ({ ...f, directedTo: e.target.value }))} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 cursor-pointer">
                    <option value="support">Support</option>
                    <option value="billing">Billing</option>
                    <option value="technical">Technical</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 cursor-pointer">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Message *</label>
                <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={5} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 placeholder-muted-foreground resize-none" placeholder="Describe your issue in detail. For billing, include your transaction ID or PayPal email." required />
              </div>

              {submitMsg && (
                <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${submitMsg.ok ? "text-emerald-300 bg-emerald-500/10 border border-emerald-500/25" : "text-red-300 bg-red-500/10 border border-red-500/25"}`}>
                  {submitMsg.ok ? <BadgeCheck className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  {submitMsg.text}
                </div>
              )}

              <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50" style={{ background: "rgba(59,130,246,0.3)", border: "1px solid rgba(59,130,246,0.5)" }}>
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : <><Send className="w-4 h-4" /> Submit Ticket</>}
              </button>
            </form>
          )}

          {/* My tickets */}
          {isAuthenticated && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">My Tickets</h3>
                <button onClick={loadMyTickets} className="text-xs text-muted-foreground hover:text-white transition-all flex items-center gap-1">
                  <Loader2 className={cn("w-3 h-3", ticketsLoading && "animate-spin")} /> Refresh
                </button>
              </div>
              {ticketsLoading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
              {!ticketsLoading && myTickets.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No tickets submitted yet.</p>
              )}
              {myTickets.map(t => (
                <div key={t.id} className="p-4 rounded-2xl border border-white/8 space-y-2" style={{ background: "rgba(255,255,255,0.02)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-white font-medium">#{t.id} — {t.subject}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[10px] font-semibold ${statusColor[t.status] ?? "text-muted-foreground"}`}>{t.status.replace("_"," ")}</span>
                        <span className="text-[10px] text-muted-foreground">{t.category} · {t.priority}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {t.status === "resolved" && <BadgeCheck className="w-4 h-4 text-emerald-400 shrink-0" />}
                  </div>
                  {t.admin_response && (
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 text-xs">
                      <p className="text-emerald-400 font-semibold mb-1">Support Response</p>
                      <p className="text-muted-foreground leading-relaxed">{t.admin_response}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ CUSTOMER DASHBOARD ══ */}
      {section === "customer" && (
        <div className="space-y-5">
          {!isAuthenticated ? (
            <div className="text-center py-16 text-muted-foreground">
              <Crown className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Sign in to access the Customer Dashboard.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-5 rounded-2xl" style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(245,158,11,0.06))", border: "1px solid rgba(251,191,36,0.3)" }}>
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl" style={{ background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.35)" }}>
                    <Crown className="w-6 h-6 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-white">Customer Dashboard</h3>
                    <p className="text-xs text-muted-foreground">Advanced tools & benefits for token buyers</p>
                  </div>
                  {user && <div className="ml-auto px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>CUSTOMER</div>}
                </div>
              </div>

              {/* Account info */}
              <div className="p-5 rounded-2xl space-y-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <h3 className="text-sm font-semibold text-white">Account Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-muted-foreground">Name</span>
                    <span className="text-white font-medium">{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-muted-foreground">Email</span>
                    <span className="text-white font-medium">{user?.email ?? "—"}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-muted-foreground">Account type</span>
                    <span className="text-white font-medium">{user?.isPremium ? "Premium" : "Standard"}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">Auth provider</span>
                    <span className="text-white font-medium capitalize">{user?.authProvider ?? "email"}</span>
                  </div>
                </div>
              </div>

              {/* Benefits */}
              <div className="p-5 rounded-2xl space-y-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <h3 className="text-sm font-semibold text-white">Your Benefits</h3>
                {[
                  { icon: "🏆", label: "Priority support", desc: "Ticket responses are prioritised for customers who have purchased tokens" },
                  { icon: "♾️", label: "Tokens carry over",    desc: "Your purchased tokens never expire — they survive the weekly reset" },
                  { icon: "🎓", label: "Unlimited study PDFs", desc: "Your token balance unlocks any PDF resource in the library" },
                  { icon: "🤖", label: "Premium AI models",    desc: "Access to Qwen 122B, Mistral Small, GPT-5.4 Mini and more" },
                ].map((b, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-white/8" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <span className="text-xl shrink-0 mt-0.5">{b.icon}</span>
                    <div>
                      <p className="text-sm text-white font-semibold">{b.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{b.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick actions */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setSection("billing")} className="flex items-center gap-3 p-4 rounded-2xl border border-white/8 hover:border-white/15 transition-all text-left" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <CreditCard className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div><p className="text-sm font-semibold text-white">Purchase History</p><p className="text-[11px] text-muted-foreground">View all transactions</p></div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                </button>
                <button onClick={() => setSection("support")} className="flex items-center gap-3 p-4 rounded-2xl border border-white/8 hover:border-white/15 transition-all text-left" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <LifeBuoy className="w-5 h-5 text-blue-400 shrink-0" />
                  <div><p className="text-sm font-semibold text-white">Priority Support</p><p className="text-[11px] text-muted-foreground">Get help fast</p></div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}
