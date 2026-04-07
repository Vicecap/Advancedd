import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Zap, CreditCard, CheckCircle, Package, Calculator,
  Clock, RefreshCw, Bitcoin, Copy, Check, AlertCircle, ExternalLink, LogIn,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function api(p: string) { return `${BASE_URL}api${p}`; }

interface PkgInfo {
  id: string; tokens: number; cents: number; usd: string; label: string;
}
interface Purchase {
  id: number; package_id: string; tokens_amount: number; amount_usd_cents: number;
  status: string; created_at: string; completed_at: string | null;
}

declare global {
  interface Window {
    paypal?: {
      Buttons: (config: {
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }) => Promise<void>;
        onError: (err: unknown) => void;
        onCancel: () => void;
        style?: Record<string, unknown>;
      }) => { render: (selector: string) => void; close?: () => void; };
    };
  }
}

interface TokenShopProps {
  open: boolean;
  onClose: () => void;
  onPurchaseComplete?: (newBalance: number) => void;
}

export default function TokenShop({ open, onClose, onPurchaseComplete }: TokenShopProps) {
  const { isAuthenticated } = useAuth();
  const [packages, setPackages] = useState<PkgInfo[]>([]);
  const [paypalConfigured, setPaypalConfigured] = useState(false);
  const [paypalSandbox, setPaypalSandbox] = useState(false);
  const [btcAddress, setBtcAddress] = useState<string | null>(null);
  const [btcConfigured, setBtcConfigured] = useState(false);
  const [btcPrices, setBtcPrices] = useState<Record<string, string>>({});
  const [btcUsd, setBtcUsd] = useState<number | null>(null);
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [customTokens, setCustomTokens] = useState("");
  const [customPrice, setCustomPrice] = useState<{ cents: number; usd: string } | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState<Purchase[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState<{ tokens: number; balance: number; method: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"shop" | "history">("shop");
  const [payMethod, setPayMethod] = useState<"paypal" | "bitcoin">("paypal");
  const [txHash, setTxHash] = useState("");
  const [copied, setCopied] = useState(false);
  const [btcVerifying, setBtcVerifying] = useState(false);

  const loadPackages = useCallback(async () => {
    try {
      const [pkgRes, btcAddrRes, btcPriceRes] = await Promise.all([
        fetch(api("/billing/packages")),
        fetch(api("/billing/bitcoin-address")),
        fetch(api("/billing/bitcoin-price")),
      ]);
      if (pkgRes.ok) {
        const d = await pkgRes.json() as { packages: PkgInfo[]; configured: boolean; isSandbox?: boolean };
        setPackages(d.packages);
        setPaypalConfigured(d.configured);
        setPaypalSandbox(!!d.isSandbox);
      }
      if (btcAddrRes.ok) {
        const d = await btcAddrRes.json() as { configured: boolean; address: string | null };
        setBtcConfigured(d.configured);
        setBtcAddress(d.address);
      }
      if (btcPriceRes.ok) {
        const d = await btcPriceRes.json() as { btcUsd: number; packages: Array<{ id: string; btc: string }> };
        setBtcUsd(d.btcUsd);
        const map: Record<string, string> = {};
        d.packages.forEach(p => { map[p.id] = p.btc; });
        setBtcPrices(map);
      }
    } catch {}
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(api("/billing/history"), { credentials: "include" });
      if (res.ok) {
        const d = await res.json() as { purchases: Purchase[] };
        setPurchaseHistory(d.purchases);
      }
    } catch {}
    setHistoryLoading(false);
  }, []);

  const handlePayPalRedirect = useCallback(async () => {
    if (!selectedPkg) return;
    setError(null);
    setRedirecting(true);
    const isCustom = selectedPkg === "custom";
    const tokenAmt = isCustom ? Number(customTokens) : packages.find(p => p.id === selectedPkg)?.tokens ?? 0;
    const body = isCustom ? { packageId: "custom", customTokens: tokenAmt } : { packageId: selectedPkg };
    try {
      const res = await fetch(api("/billing/create-order"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json() as { orderId?: string; approveUrl?: string; error?: string };
      if (!res.ok || !d.approveUrl) {
        setError(d.error ?? "Failed to create order. Please try again.");
        setRedirecting(false);
        return;
      }
      // Full page redirect to PayPal — no popup issues
      window.location.href = d.approveUrl;
    } catch (err) {
      setError((err as Error).message ?? "Network error. Please try again.");
      setRedirecting(false);
    }
  }, [selectedPkg, customTokens, packages]);

  useEffect(() => {
    if (open) { loadPackages(); loadHistory(); }
  }, [open, loadPackages, loadHistory]);


  useEffect(() => {
    if (selectedPkg !== "custom" || !customTokens) { setCustomPrice(null); return; }
    const t = parseInt(customTokens, 10);
    if (isNaN(t) || t < 1_000_000) { setCustomPrice(null); return; }
    const timer = setTimeout(async () => {
      setCalcLoading(true);
      try {
        const res = await fetch(api("/billing/calc-price"), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokens: t }),
        });
        if (res.ok) {
          const d = await res.json() as { cents: number; usd: string };
          setCustomPrice(d);
          if (btcUsd) {
            setBtcPrices(prev => ({ ...prev, custom: (d.cents / 100 / btcUsd).toFixed(8) }));
          }
        }
      } catch {}
      setCalcLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [customTokens, selectedPkg, btcUsd]);

  const handleBitcoinVerify = async () => {
    if (!selectedPkg || !txHash.trim()) return;
    setError(null);
    setBtcVerifying(true);
    try {
      const isCustom = selectedPkg === "custom";
      const body = isCustom
        ? { txHash: txHash.trim(), packageId: "custom", customTokens: parseInt(customTokens, 10) }
        : { txHash: txHash.trim(), packageId: selectedPkg };
      const res = await fetch(api("/billing/bitcoin-verify"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json() as { ok?: boolean; tokens?: number; newBalance?: number; error?: string };
      if (d.ok) {
        setSuccess({ tokens: d.tokens ?? 0, balance: d.newBalance ?? 0, method: "Bitcoin" });
        onPurchaseComplete?.(d.newBalance ?? 0);
        loadHistory();
      } else {
        setError(d.error ?? "Verification failed");
      }
    } catch { setError("Network error. Please try again."); }
    setBtcVerifying(false);
  };

  const copyAddress = () => {
    if (btcAddress) {
      navigator.clipboard.writeText(btcAddress).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const currentUsd = selectedPkg === "custom"
    ? customPrice ? `$${customPrice.usd}` : "—"
    : selectedPkg ? `$${packages.find(p => p.id === selectedPkg)?.usd ?? "—"}` : null;

  const currentBtc = selectedPkg ? btcPrices[selectedPkg] : null;

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-lg bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl" style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}>
                  <Zap className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-white text-lg">Buy AI Tokens</h2>
                  <p className="text-xs text-muted-foreground">Credited instantly to your account</p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* View tabs */}
            <div className="flex p-3 gap-2 border-b border-white/10 shrink-0">
              <button onClick={() => setActiveView("shop")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${activeView === "shop" ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-muted-foreground hover:text-white border border-transparent"}`}>
                <Package className="w-3.5 h-3.5" /> Buy Tokens
              </button>
              <button onClick={() => { setActiveView("history"); loadHistory(); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${activeView === "history" ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-muted-foreground hover:text-white border border-transparent"}`}>
                <Clock className="w-3.5 h-3.5" /> History
              </button>
            </div>

            <div className="overflow-y-auto flex-1 scrollbar-hide">
              {/* ── SUCCESS ── */}
              {success && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  className="p-8 text-center flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(16,185,129,0.2)", border: "2px solid rgba(16,185,129,0.4)" }}>
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Payment Verified!</h3>
                    <p className="text-muted-foreground mt-1 text-sm">via {success.method}</p>
                    <p className="text-white font-semibold mt-2">{(success.tokens / 1_000_000).toFixed(0)}M tokens added</p>
                    <p className="text-emerald-400 font-bold">New balance: {(success.balance / 1_000_000).toFixed(1)}M tokens</p>
                  </div>
                  <button onClick={() => { setSuccess(null); setSelectedPkg(null); setTxHash(""); onClose(); }}
                    className="px-6 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold text-sm hover:bg-emerald-500/30 transition-all">
                    Done
                  </button>
                </motion.div>
              )}

              {/* ── SHOP ── */}
              {!success && activeView === "shop" && (
                <div className="p-5 space-y-4">
                  {/* Package grid */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Choose a Package</p>
                    <div className="grid grid-cols-2 gap-2">
                      {packages.map(pkg => {
                        const isSelected = selectedPkg === pkg.id;
                        return (
                          <button key={pkg.id} onClick={() => { setSelectedPkg(pkg.id); setError(null); setSuccess(null); }}
                            className="relative p-3.5 rounded-xl text-left transition-all"
                            style={{
                              background: isSelected ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                              border: isSelected ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.08)",
                            }}>
                            {pkg.id === "10m" && (
                              <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/30 text-amber-300 border border-amber-500/30">POPULAR</span>
                            )}
                            <p className="text-lg font-black text-white">{(pkg.tokens / 1_000_000).toFixed(0)}M</p>
                            <p className="text-xs text-muted-foreground">tokens</p>
                            <p className="text-sm font-bold text-indigo-300 mt-1">${pkg.usd}</p>
                            {btcPrices[pkg.id] && (
                              <p className="text-[10px] text-orange-400/70 mt-0.5">₿ {btcPrices[pkg.id]}</p>
                            )}
                          </button>
                        );
                      })}
                      <button onClick={() => { setSelectedPkg("custom"); setError(null); }}
                        className="p-3.5 rounded-xl text-left transition-all col-span-2"
                        style={{
                          background: selectedPkg === "custom" ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                          border: selectedPkg === "custom" ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.08)",
                        }}>
                        <div className="flex items-center gap-2">
                          <Calculator className="w-4 h-4 text-indigo-400" />
                          <span className="font-semibold text-white text-sm">Custom Amount</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Enter any amount — price calculated automatically</p>
                      </button>
                    </div>
                  </div>

                  {/* Custom input */}
                  {selectedPkg === "custom" && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Token Amount (minimum 1M)</label>
                      <div className="relative">
                        <input type="number" min={1000000} step={1000000} placeholder="e.g. 20000000"
                          value={customTokens} onChange={e => setCustomTokens(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                        />
                        {calcLoading && <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
                      </div>
                      {customPrice && customTokens && (
                        <div className="flex items-center justify-between p-2.5 rounded-xl" style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
                          <span className="text-sm text-white">{(parseInt(customTokens) / 1_000_000).toFixed(1)}M tokens</span>
                          <div className="text-right">
                            <span className="text-lg font-black text-indigo-300">${customPrice.usd}</span>
                            {btcPrices.custom && <p className="text-[11px] text-orange-400">₿ {btcPrices.custom}</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Price summary */}
                  {selectedPkg && selectedPkg !== "custom" && currentUsd && (
                    <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
                      <span className="text-sm text-white">{packages.find(p => p.id === selectedPkg)?.label}</span>
                      <div className="text-right">
                        <span className="text-xl font-black text-indigo-300">{currentUsd}</span>
                        {currentBtc && <p className="text-[11px] text-orange-400">₿ {currentBtc}</p>}
                      </div>
                    </div>
                  )}

                  {/* Payment method toggle */}
                  {selectedPkg && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Payment Method</p>
                      <div className="flex gap-2">
                        <button onClick={() => { setPayMethod("paypal"); setError(null); }}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${payMethod === "paypal" ? "bg-blue-500/20 text-blue-300 border border-blue-500/40" : "bg-white/5 text-muted-foreground border border-white/10 hover:text-white"}`}>
                          <CreditCard className="w-4 h-4" /> PayPal
                        </button>
                        <button onClick={() => { setPayMethod("bitcoin"); setError(null); }}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${payMethod === "bitcoin" ? "bg-orange-500/20 text-orange-300 border border-orange-500/40" : "bg-white/5 text-muted-foreground border border-white/10 hover:text-white"}`}>
                          <Bitcoin className="w-4 h-4" /> Bitcoin
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* ── PayPal flow ── */}
                  {selectedPkg && payMethod === "paypal" && (
                    <>
                      {!isAuthenticated && (
                        <div className="p-5 rounded-xl border border-blue-500/30 bg-blue-500/5 text-center space-y-3">
                          <LogIn className="w-7 h-7 text-blue-400 mx-auto" />
                          <p className="text-sm font-semibold text-blue-300">Sign in required</p>
                          <p className="text-xs text-muted-foreground">You need to be signed in to purchase tokens. Your balance and history are saved to your account.</p>
                          <button
                            onClick={onClose}
                            className="mt-1 px-5 py-2 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-300 text-sm font-semibold hover:bg-blue-500/30 transition-all"
                          >
                            Sign In / Sign Up
                          </button>
                        </div>
                      )}
                      {isAuthenticated && !paypalConfigured && (
                        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center">
                          <CreditCard className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                          <p className="text-sm text-amber-300 font-semibold">PayPal not configured</p>
                          <p className="text-xs text-muted-foreground mt-1">Contact admin to enable PayPal payments.</p>
                        </div>
                      )}
                      {isAuthenticated && paypalConfigured && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-center gap-2">
                            <p className="text-xs text-center text-muted-foreground">You'll be taken to PayPal to complete your payment securely</p>
                            {paypalSandbox && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.35)" }}>
                                SANDBOX
                              </span>
                            )}
                          </div>
                          <button
                            onClick={handlePayPalRedirect}
                            disabled={redirecting || !selectedPkg}
                            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            style={{ background: "#0070ba", color: "#fff", border: "none" }}
                          >
                            {redirecting ? (
                              <><RefreshCw className="w-4 h-4 animate-spin" /> Redirecting to PayPal…</>
                            ) : (
                              <><CreditCard className="w-4 h-4" /> Pay with PayPal</>
                            )}
                          </button>
                          <p className="text-[11px] text-center text-muted-foreground/60">After paying you'll be returned here automatically</p>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Bitcoin flow ── */}
                  {selectedPkg && payMethod === "bitcoin" && (
                    <div className="space-y-3">
                      {!btcConfigured ? (
                        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center">
                          <Bitcoin className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                          <p className="text-sm text-amber-300 font-semibold">Bitcoin not configured</p>
                          <p className="text-xs text-muted-foreground mt-1">Admin needs to set a BITCOIN_ADDRESS to enable crypto payments.</p>
                        </div>
                      ) : (
                        <>
                          {/* BTC amount to send */}
                          {currentBtc && (
                            <div className="p-3 rounded-xl space-y-1" style={{ background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.25)" }}>
                              <p className="text-xs text-orange-400/80 font-semibold uppercase tracking-wider">Amount to Send</p>
                              <p className="text-2xl font-black text-orange-300">₿ {currentBtc}</p>
                              {btcUsd && <p className="text-xs text-muted-foreground">≈ {currentUsd} at ${btcUsd.toLocaleString()}/BTC</p>}
                              <p className="text-[10px] text-muted-foreground/60">Live rate — amount valid for ~15 minutes. We accept within 20% tolerance.</p>
                            </div>
                          )}

                          {/* Address */}
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Send To (Bitcoin Address)</p>
                            <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <code className="flex-1 text-xs text-orange-200 break-all font-mono">{btcAddress}</code>
                              <button onClick={copyAddress}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-white transition-colors shrink-0">
                                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Verify tx */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Your Transaction Hash (after sending)
                            </label>
                            <input
                              type="text"
                              placeholder="64-character hex transaction ID..."
                              value={txHash}
                              onChange={e => { setTxHash(e.target.value); setError(null); }}
                              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-orange-500/50 transition-colors placeholder:text-muted-foreground/40"
                            />
                            <button
                              onClick={handleBitcoinVerify}
                              disabled={!txHash.trim() || btcVerifying || txHash.trim().length !== 64}
                              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{ background: "rgba(251,146,60,0.2)", border: "1px solid rgba(251,146,60,0.4)", color: "#fdba74" }}
                            >
                              {btcVerifying ? <><RefreshCw className="w-4 h-4 animate-spin" /> Verifying on blockchain…</> : <><Bitcoin className="w-4 h-4" /> Verify & Credit Tokens</>}
                            </button>
                          </div>

                          <a
                            href="https://blockstream.info"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" /> Find your TX hash at blockstream.info
                          </a>
                        </>
                      )}
                    </div>
                  )}

                  <p className="text-[10px] text-center text-muted-foreground/50">
                    Tokens are credited instantly. Purchases are final. 1 token = 1 AI interaction.
                  </p>
                </div>
              )}

              {/* ── HISTORY ── */}
              {!success && activeView === "history" && (
                <div className="p-5 space-y-3">
                  {historyLoading && (
                    <div className="flex justify-center py-8">
                      <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!historyLoading && purchaseHistory.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No purchases yet.</p>
                      <p className="text-xs mt-1">Your token purchase history will appear here.</p>
                    </div>
                  )}
                  {!historyLoading && purchaseHistory.map(p => (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <div className={`p-2 rounded-lg ${p.status === "completed" ? "bg-emerald-500/15" : "bg-amber-500/15"}`}>
                        {p.status === "completed"
                          ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                          : <Clock className="w-4 h-4 text-amber-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-semibold">{(p.tokens_amount / 1_000_000).toFixed(0)}M tokens</p>
                        <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-white">${(p.amount_usd_cents / 100).toFixed(2)}</p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${p.status === "completed" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                          {p.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
