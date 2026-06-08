import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Zap, CreditCard, CheckCircle, Package, Calculator,
  Clock, RefreshCw, Bitcoin, Copy, Check, AlertCircle,
  ExternalLink, LogIn, Smartphone, Building2, Send,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function api(p: string) { return `${BASE_URL}api${p}`; }

/* ── Types ── */
interface PkgInfo {
  id: string;
  tokens: number;
  cents: number;
  usd: string;
  label: string;
}

interface Purchase {
  id: number;
  package_id: string;
  tokens_amount: number;
  amount_usd_cents: number;
  paypal_order_id: string | null;
  paypal_transaction_id: string | null;
  paypal_payer_email: string | null;
  status: string;
  payment_method: string | null;
  manual_reference: string | null;
  created_at: string;
  completed_at: string | null;
}

interface PackagesResponse {
  packages: PkgInfo[];
  configured: boolean;
  clientId: string | null;
  isSandbox: boolean;
}

interface ManualPaymentConfig {
  ecocash: { enabled: boolean; number: string; instructions: string };
  ecocash_diaspora: { enabled: boolean; number: string; instructions: string };
  bank: { enabled: boolean; details: string; instructions: string };
}

type PayMethod = "paypal" | "card" | "bitcoin" | "ecocash" | "ecocash_diaspora" | "bank";

declare global {
  interface Window {
    paypal?: {
      CardFields?: (config: {
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }) => Promise<void>;
        onError?: (err: any) => void;
      }) => {
        isEligible: () => boolean;
        NumberField: () => { render: (selector: string) => Promise<void> };
        ExpiryField: () => { render: (selector: string) => Promise<void> };
        CVVField: () => { render: (selector: string) => Promise<void> };
        NameField?: () => { render: (selector: string) => Promise<void> };
        submit: () => Promise<void>;
      };
    };
  }
}

interface TokenShopProps {
  open: boolean;
  onClose: () => void;
  onPurchaseComplete?: (newBalance: number) => void;
}

let sdkLoadPromise: Promise<void> | null = null;

function loadPayPalSDK(clientId: string, clientToken: string, sandbox: boolean): Promise<void> {
  const existingScript = document.getElementById("paypal-js-sdk") as HTMLScriptElement | null;
  if (existingScript && window.paypal?.CardFields) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;
  if (existingScript) { existingScript.remove(); sdkLoadPromise = null; }

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "paypal-js-sdk";
    const base = sandbox
      ? "https://www.sandbox.paypal.com/sdk/js"
      : "https://www.paypal.com/sdk/js";
    const params = new URLSearchParams({
      "client-id": clientId,
      components: "card-fields",
      currency: "USD",
      intent: "capture",
      "enable-funding": "card",
      "disable-funding": "paylater,venmo,credit",
    });
    script.src = `${base}?${params.toString()}`;
    script.setAttribute("data-client-token", clientToken);
    script.crossOrigin = "anonymous";
    script.onload = () => { console.log("PayPal JS SDK v5 loaded ✓"); resolve(); };
    script.onerror = (e) => {
      sdkLoadPromise = null;
      reject(new Error("PayPal SDK script failed to load"));
    };
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

/* ── Manual payment step type ── */
type ManualStep = "select" | "reference" | "confirm";

export default function TokenShop({ open, onClose, onPurchaseComplete }: TokenShopProps) {
  const { isAuthenticated } = useAuth();

  /* ── Config ── */
  const [packages, setPackages] = useState<PkgInfo[]>([]);
  const [paypalConfigured, setPaypalConfigured] = useState(false);
  const [paypalSandbox, setPaypalSandbox] = useState(false);
  const [paypalClientId, setPaypalClientId] = useState<string | null>(null);
  const [btcAddress, setBtcAddress] = useState<string | null>(null);
  const [btcConfigured, setBtcConfigured] = useState(false);
  const [btcPrices, setBtcPrices] = useState<Record<string, string>>({});
  const [btcUsd, setBtcUsd] = useState<number | null>(null);
  const [manualConfig, setManualConfig] = useState<ManualPaymentConfig | null>(null);

  /* ── Selection ── */
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [customTokens, setCustomTokens] = useState("");
  const [customPrice, setCustomPrice] = useState<{ cents: number; usd: string } | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  /* ── UI ── */
  const [activeView, setActiveView] = useState<"shop" | "history">("shop");
  const [payMethod, setPayMethod] = useState<PayMethod>("paypal");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    tokens: number; balance: number; method: string; isPending?: boolean;
  } | null>(null);

  /* ── History ── */
  const [purchaseHistory, setPurchaseHistory] = useState<Purchase[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  /* ── Bitcoin ── */
  const [txHash, setTxHash] = useState("");
  const [copied, setCopied] = useState(false);
  const [btcVerifying, setBtcVerifying] = useState(false);

  /* ── Manual payment state ── */
  const [manualStep, setManualStep] = useState<ManualStep>("select");
  const [manualReference, setManualReference] = useState<string>("");
  const [manualPurchaseId, setManualPurchaseId] = useState<number | null>(null);
  const [userPaymentRef, setUserPaymentRef] = useState<string>("");
  const [refCopied, setRefCopied] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);

  /* ── Card SDK state ── */
  const [sdkInitializing, setSdkInitializing] = useState(false);
  const [cardSessionReady, setCardSessionReady] = useState(false);
  const [cardFields, setCardFields] = useState<ReturnType<NonNullable<Window["paypal"]>["CardFields"]> | null>(null);
  const cardFieldsRef = useRef<typeof cardFields>(null);
  cardFieldsRef.current = cardFields;

  /* ─────────────────────────────────────────────────────────────────────
     Load packages + config on open
  ───────────────────────────────────────────────────────────────────────── */
  const loadPackages = useCallback(async () => {
    try {
      const [pkgRes, btcAddrRes, btcPriceRes, manualRes] = await Promise.allSettled([
        fetch(api("/billing/packages")),
        fetch(api("/billing/bitcoin-address")),
        fetch(api("/billing/bitcoin-price")),
        fetch(api("/billing/manual-payment-config")),
      ]);

      if (pkgRes.status === "fulfilled" && pkgRes.value.ok) {
        const d = await pkgRes.value.json() as PackagesResponse;
        setPackages(d.packages);
        setPaypalConfigured(d.configured);
        setPaypalSandbox(!!d.isSandbox);
        setPaypalClientId(d.clientId ?? null);
      }
      if (btcAddrRes.status === "fulfilled" && btcAddrRes.value.ok) {
        const d = await btcAddrRes.value.json() as { configured: boolean; address: string | null };
        setBtcConfigured(d.configured);
        setBtcAddress(d.address);
      }
      if (btcPriceRes.status === "fulfilled" && btcPriceRes.value.ok) {
        const d = await btcPriceRes.value.json() as {
          btcUsd: number;
          packages: Array<{ id: string; btc: string }>;
        };
        setBtcUsd(d.btcUsd);
        const map: Record<string, string> = {};
        d.packages.forEach(p => { map[p.id] = p.btc; });
        setBtcPrices(map);
      }
      if (manualRes.status === "fulfilled" && manualRes.value.ok) {
        const d = await manualRes.value.json() as ManualPaymentConfig;
        setManualConfig(d);
      }
    } catch (err) {
      console.error("loadPackages:", err);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(api("/billing/history"), { credentials: "include" });
      if (res.ok) {
        const d = await res.json() as { purchases: Purchase[] };
        setPurchaseHistory(d.purchases);
      }
    } catch (err) {
      console.error("loadHistory:", err);
    }
    setHistoryLoading(false);
  }, []);

  /* ── Custom price debounce ── */
  useEffect(() => {
    if (selectedPkg !== "custom" || !customTokens) { setCustomPrice(null); return; }
    const t = parseInt(customTokens, 10);
    if (isNaN(t) || t < 1_000_000) { setCustomPrice(null); return; }

    const timer = setTimeout(async () => {
      setCalcLoading(true);
      try {
        const res = await fetch(api("/billing/calc-price"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokens: t }),
        });
        if (res.ok) {
          const d = await res.json() as { cents: number; usd: string };
          setCustomPrice(d);
          if (btcUsd) {
            setBtcPrices(prev => ({ ...prev, custom: (d.cents / 100 / btcUsd).toFixed(8) }));
          }
        }
      } catch (e) { console.error("calc-price:", e); }
      setCalcLoading(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [customTokens, selectedPkg, btcUsd]);

  /* ── Initialize PayPal CardFields ── */
  useEffect(() => {
    if (payMethod !== "card") return;
    if (!selectedPkg || !isAuthenticated || !paypalConfigured || !paypalClientId) return;

    let cancelled = false;

    async function initCardFields() {
      setSdkInitializing(true);
      setCardSessionReady(false);
      setCardFields(null);
      setError(null);

      try {
        const tokenRes = await fetch(api("/billing/paypal-client-token"), { credentials: "include" });
        if (!tokenRes.ok) throw new Error(`Client token request failed: ${tokenRes.status}`);
        const tokenJson = await tokenRes.json() as { clientToken?: string; error?: string };
        if (!tokenJson.clientToken) throw new Error(tokenJson.error ?? "No clientToken in response");

        if (cancelled) return;
        await loadPayPalSDK(paypalClientId!, tokenJson.clientToken, paypalSandbox);
        if (cancelled) return;

        if (!window.paypal?.CardFields) throw new Error("window.paypal.CardFields not found");

        const cf = window.paypal.CardFields({
          createOrder: async () => {
            const result = await createPayPalOrder();
            return result.orderId;
          },
          onApprove: async (data: { orderID: string }) => {
            await captureOrder(data.orderID, "Card");
            setProcessing(false);
          },
          onError: (err: any) => {
            const msg = typeof err === "string" ? err : (err?.message ?? JSON.stringify(err));
            setError(msg || "Card payment failed");
            setProcessing(false);
          },
        });

        if (!cf.isEligible()) throw new Error("PayPal card fields not eligible in this region");
        if (cancelled) return;
        setCardFields(cf);
        setCardSessionReady(true);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Failed to initialize card payment");
      } finally {
        if (!cancelled) setSdkInitializing(false);
      }
    }

    initCardFields();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPkg, payMethod, paypalConfigured, paypalClientId, isAuthenticated, paypalSandbox]);

  /* ── Mount card field iframes ── */
  useEffect(() => {
    if (!cardFields || !cardSessionReady || payMethod !== "card") return;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      try {
        const renders: Promise<void>[] = [
          cardFields.NumberField().render("#card-number-field"),
          cardFields.ExpiryField().render("#card-expiry-field"),
          cardFields.CVVField().render("#card-cvv-field"),
        ];
        if (typeof cardFields.NameField === "function") {
          renders.push(cardFields.NameField!().render("#card-name-field"));
        }
        await Promise.all(renders);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Failed to render card fields");
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [cardFields, cardSessionReady, payMethod]);

  /* ── API helpers ── */
  const createPayPalOrder = async () => {
    const isCustom = selectedPkg === "custom";
    const body = isCustom
      ? { packageId: "custom", customTokens: Number(customTokens) }
      : { packageId: selectedPkg };

    const res = await fetch(api("/billing/create-order"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json() as {
      orderId?: string; approveUrl?: string | null;
      tokens?: number; cents?: number; usd?: string; error?: string;
    };
    if (!res.ok || !data.orderId) throw new Error(data.error ?? `Order creation failed (${res.status})`);
    return data as { orderId: string; approveUrl: string | null; tokens: number; cents: number; usd: string };
  };

  const captureOrder = async (orderId: string, method: string) => {
    try {
      const res = await fetch(api("/billing/capture-order"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const d = await res.json() as {
        ok?: boolean; tokens?: number; newBalance?: number; alreadyCaptured?: boolean; error?: string;
      };
      if (d.ok) {
        setSuccess({ tokens: d.tokens ?? 0, balance: d.newBalance ?? 0, method });
        onPurchaseComplete?.(d.newBalance ?? 0);
        loadHistory();
      } else {
        setError(d.error ?? "Payment capture failed. Please contact support.");
      }
    } catch (err: any) {
      setError("Network error during capture. Please contact support.");
    }
  };

  /* ── PayPal redirect ── */
  const handlePayPalCheckout = useCallback(async () => {
    if (!selectedPkg) return;
    setError(null);
    setProcessing(true);
    try {
      const data = await createPayPalOrder();
      if (data.approveUrl) { window.location.href = data.approveUrl; return; }
      throw new Error("No PayPal approval URL returned");
    } catch (err: any) {
      setError(err?.message ?? "Failed to start PayPal checkout");
      setProcessing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPkg, customTokens]);

  /* ── Card submit ── */
  const handleCardSubmit = async () => {
    const cf = cardFieldsRef.current;
    if (!cf) return;
    setError(null);
    setProcessing(true);
    try {
      await cf.submit();
    } catch (err: any) {
      setError(err?.message ?? "Card payment failed");
      setProcessing(false);
    }
  };

  /* ── Bitcoin verify ── */
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
        method: "POST",
        credentials: "include",
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
    } catch (err: any) {
      setError("Network error. Please try again.");
    }
    setBtcVerifying(false);
  };

  /* ── Manual payment: Step 1 — Create reference ── */
  const handleManualCreateReference = async () => {
    if (!selectedPkg || !isAuthenticated) return;
    setError(null);
    setProcessing(true);
    try {
      const isCustom = selectedPkg === "custom";
      const body = isCustom
        ? { paymentMethod: payMethod, packageId: "custom", customTokens: parseInt(customTokens, 10) }
        : { paymentMethod: payMethod, packageId: selectedPkg };

      const res = await fetch(api("/billing/manual-payment/create"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json() as {
        ok?: boolean;
        reference?: string;
        purchaseId?: number;
        error?: string;
      };
      if (d.ok && d.reference && d.purchaseId) {
        setManualReference(d.reference);
        setManualPurchaseId(d.purchaseId);
        setManualStep("reference");
      } else {
        setError(d.error ?? "Failed to create payment reference");
      }
    } catch (err: any) {
      setError("Network error. Please try again.");
    }
    setProcessing(false);
  };

  /* ── Manual payment: Step 2 — Submit proof ── */
  const handleManualSubmitProof = async () => {
    if (!manualPurchaseId) return;
    setError(null);
    setManualSubmitting(true);
    try {
      const res = await fetch(api("/billing/manual-payment/submit-proof"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId: manualPurchaseId,
          userReference: userPaymentRef.trim(),
        }),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (d.ok) {
        setManualStep("confirm");
      } else {
        setError(d.error ?? "Failed to submit payment proof");
      }
    } catch (err: any) {
      setError("Network error. Please try again.");
    }
    setManualSubmitting(false);
  };

  const copyRef = () => {
    navigator.clipboard.writeText(manualReference).then(() => {
      setRefCopied(true);
      setTimeout(() => setRefCopied(false), 2000);
    });
  };

  const copyAddress = () => {
    if (!btcAddress) return;
    navigator.clipboard.writeText(btcAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const resetManualFlow = () => {
    setManualStep("select");
    setManualReference("");
    setManualPurchaseId(null);
    setUserPaymentRef("");
    setRefCopied(false);
  };

  /* ── Handle PayPal redirect return ── */
  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("paypal_success") === "1") {
      const tokens = parseInt(params.get("tokens") ?? "0", 10);
      setSuccess({ tokens, balance: 0, method: "PayPal" });
      window.history.replaceState({}, "", window.location.pathname);
      loadHistory();
    } else if (params.get("paypal_error") === "1") {
      const reason = params.get("reason") ?? "unknown";
      const messages: Record<string, string> = {
        no_order: "No order found. Please try again.",
        session_expired: "Your session expired. Please sign in and try again.",
        not_found: "Order not found. Please contact support.",
        mismatch: "Order account mismatch. Please contact support.",
        capture_failed: "Payment capture failed. Please contact support.",
        server_error: "Server error. Please contact support.",
      };
      setError(messages[reason] ?? "PayPal payment failed. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("paypal_cancelled") === "1") {
      setError("PayPal payment was cancelled.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) loadPackages();
  }, [open, loadPackages]);

  /* ── Reset manual flow when method changes ── */
  useEffect(() => {
    resetManualFlow();
  }, [payMethod, selectedPkg]);

  /* ── Derived ── */
  const currentUsd = selectedPkg === "custom"
    ? (customPrice ? `$${customPrice.usd}` : "—")
    : selectedPkg
      ? `$${packages.find(p => p.id === selectedPkg)?.usd ?? "—"}`
      : null;

  const currentBtc = selectedPkg ? btcPrices[selectedPkg] : null;

  const canCheckout =
    !!selectedPkg &&
    (selectedPkg !== "custom" || (customPrice !== null && !calcLoading));

  const isManualMethod = (m: PayMethod) => ["ecocash", "ecocash_diaspora", "bank"].includes(m);

  const getManualMethodLabel = (m: PayMethod) => {
    if (m === "ecocash") return "EcoCash";
    if (m === "ecocash_diaspora") return "EcoCash Diaspora";
    if (m === "bank") return "Bank Transfer";
    return "";
  };

  const getManualMethodIcon = (m: PayMethod) => {
    if (m === "ecocash") return <Smartphone className="w-4 h-4" />;
    if (m === "ecocash_diaspora") return <Send className="w-4 h-4" />;
    if (m === "bank") return <Building2 className="w-4 h-4" />;
    return null;
  };

  const getManualMethodColor = (m: PayMethod) => {
    if (m === "ecocash") return { active: "bg-green-500/20 text-green-300 border-green-500/40", ring: "rgba(34,197,94,0.4)" };
    if (m === "ecocash_diaspora") return { active: "bg-teal-500/20 text-teal-300 border-teal-500/40", ring: "rgba(20,184,166,0.4)" };
    if (m === "bank") return { active: "bg-sky-500/20 text-sky-300 border-sky-500/40", ring: "rgba(14,165,233,0.4)" };
    return { active: "", ring: "" };
  };

  const getCurrentManualConfig = () => {
    if (!manualConfig) return null;
    if (payMethod === "ecocash") return manualConfig.ecocash;
    if (payMethod === "ecocash_diaspora") return manualConfig.ecocash_diaspora;
    if (payMethod === "bank") return manualConfig.bank;
    return null;
  };

  if (!open) return null;

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════ */
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-lg bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
          >
            {/* ── Header ── */}
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

            {/* ── Tabs ── */}
            <div className="flex p-3 gap-2 border-b border-white/10 shrink-0">
              <button
                onClick={() => setActiveView("shop")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${activeView === "shop" ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-muted-foreground hover:text-white border border-transparent"}`}
              >
                <Package className="w-3.5 h-3.5" /> Buy Tokens
              </button>
              <button
                onClick={() => { setActiveView("history"); loadHistory(); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${activeView === "history" ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-muted-foreground hover:text-white border border-transparent"}`}
              >
                <Clock className="w-3.5 h-3.5" /> History
              </button>
            </div>

            {/* ── Body ── */}
            <div className="overflow-y-auto flex-1 scrollbar-hide">

              {/* SUCCESS */}
              {success && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-8 text-center flex flex-col items-center gap-4"
                >
                  <div className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{
                      background: success.isPending ? "rgba(251,191,36,0.2)" : "rgba(16,185,129,0.2)",
                      border: `2px solid ${success.isPending ? "rgba(251,191,36,0.4)" : "rgba(16,185,129,0.4)"}`,
                    }}>
                    {success.isPending
                      ? <Clock className="w-8 h-8 text-amber-400" />
                      : <CheckCircle className="w-8 h-8 text-emerald-400" />
                    }
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {success.isPending ? "Payment Submitted!" : "Payment Verified!"}
                    </h3>
                    <p className="text-muted-foreground mt-1 text-sm">via {success.method}</p>
                    {success.isPending && (
                      <p className="text-amber-300 text-sm mt-2 max-w-xs">
                        Your payment is pending admin approval. Tokens will be credited once verified.
                      </p>
                    )}
                    {!success.isPending && success.tokens > 0 && (
                      <p className="text-white font-semibold mt-2">
                        {(success.tokens / 1_000_000).toFixed(0)}M tokens added
                      </p>
                    )}
                    {!success.isPending && success.balance > 0 && (
                      <p className="text-emerald-400 font-bold">
                        New balance: {(success.balance / 1_000_000).toFixed(1)}M tokens
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => { setSuccess(null); setSelectedPkg(null); setTxHash(""); resetManualFlow(); onClose(); }}
                    className="px-6 py-2 rounded-xl font-semibold text-sm hover:opacity-80 transition-all"
                    style={{
                      background: success.isPending ? "rgba(251,191,36,0.2)" : "rgba(16,185,129,0.2)",
                      color: success.isPending ? "#fcd34d" : "#6ee7b7",
                      border: `1px solid ${success.isPending ? "rgba(251,191,36,0.3)" : "rgba(16,185,129,0.3)"}`,
                    }}
                  >
                    Done
                  </button>
                </motion.div>
              )}

              {/* SHOP */}
              {!success && activeView === "shop" && (
                <div className="p-5 space-y-4">

                  {/* ── Package grid ── */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Choose a Package</p>
                    <div className="grid grid-cols-2 gap-2">
                      {packages.map(pkg => {
                        const isSel = selectedPkg === pkg.id;
                        return (
                          <button
                            key={pkg.id}
                            onClick={() => { setSelectedPkg(pkg.id); setError(null); setSuccess(null); setCardFields(null); setCardSessionReady(false); resetManualFlow(); }}
                            className="relative p-3.5 rounded-xl text-left transition-all"
                            style={{
                              background: isSel ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                              border: isSel ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.08)",
                            }}
                          >
                            {pkg.id === "10m" && (
                              <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/30 text-amber-300 border border-amber-500/30">
                                POPULAR
                              </span>
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

                      {/* Custom amount */}
                      <button
                        onClick={() => { setSelectedPkg("custom"); setError(null); setCardFields(null); setCardSessionReady(false); resetManualFlow(); }}
                        className="p-3.5 rounded-xl text-left transition-all col-span-2"
                        style={{
                          background: selectedPkg === "custom" ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                          border: selectedPkg === "custom" ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <Calculator className="w-4 h-4 text-indigo-400" />
                          <span className="font-semibold text-white text-sm">Custom Amount</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Enter any amount — price calculated automatically</p>
                      </button>
                    </div>
                  </div>

                  {/* ── Custom token input ── */}
                  {selectedPkg === "custom" && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Token Amount (minimum 1M)
                      </label>
                      <div className="relative">
                        <input
                          type="number" min={1_000_000} step={1_000_000}
                          placeholder="e.g. 20000000" value={customTokens}
                          onChange={e => { setCustomTokens(e.target.value); setCustomPrice(null); }}
                          className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                        />
                        {calcLoading && <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
                      </div>
                      {customTokens && !calcLoading && !customPrice && parseInt(customTokens) >= 1_000_000 && (
                        <p className="text-xs text-muted-foreground/60 animate-pulse">Calculating price…</p>
                      )}
                      {customTokens && parseInt(customTokens) > 0 && parseInt(customTokens) < 1_000_000 && (
                        <p className="text-xs text-red-400">Minimum is 1,000,000 tokens (1M)</p>
                      )}
                      {customPrice && customTokens && (
                        <div className="flex items-center justify-between p-2.5 rounded-xl"
                          style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
                          <span className="text-sm text-white">{(parseInt(customTokens) / 1_000_000).toFixed(1)}M tokens</span>
                          <div className="text-right">
                            <span className="text-lg font-black text-indigo-300">${customPrice.usd}</span>
                            {btcPrices.custom && <p className="text-[11px] text-orange-400">₿ {btcPrices.custom}</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Price summary (preset) ── */}
                  {selectedPkg && selectedPkg !== "custom" && currentUsd && (
                    <div className="flex items-center justify-between p-3 rounded-xl"
                      style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
                      <span className="text-sm text-white">{packages.find(p => p.id === selectedPkg)?.label}</span>
                      <div className="text-right">
                        <span className="text-xl font-black text-indigo-300">{currentUsd}</span>
                        {currentBtc && <p className="text-[11px] text-orange-400">₿ {currentBtc}</p>}
                      </div>
                    </div>
                  )}

                  {/* ── Payment method selector ── */}
                  {selectedPkg && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Payment Method</p>

                      {/* Row 1: PayPal, Card, Bitcoin */}
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        {/* PayPal */}
                        <button
                          onClick={() => { setPayMethod("paypal"); setError(null); setCardFields(null); setCardSessionReady(false); }}
                          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${payMethod === "paypal" ? "bg-blue-500/20 text-blue-300 border border-blue-500/40" : "bg-white/5 text-muted-foreground border border-white/10 hover:text-white"}`}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z" />
                          </svg>
                          PayPal
                        </button>

                        {/* Card */}
                        <button
                          onClick={() => { setPayMethod("card"); setError(null); }}
                          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${payMethod === "card" ? "bg-violet-500/20 text-violet-300 border border-violet-500/40" : "bg-white/5 text-muted-foreground border border-white/10 hover:text-white"}`}
                        >
                          <CreditCard className="w-4 h-4" /> Card
                        </button>

                        {/* Bitcoin */}
                        <button
                          onClick={() => { setPayMethod("bitcoin"); setError(null); setCardFields(null); setCardSessionReady(false); }}
                          className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${payMethod === "bitcoin" ? "bg-orange-500/20 text-orange-300 border border-orange-500/40" : "bg-white/5 text-muted-foreground border border-white/10 hover:text-white"}`}
                        >
                          <Bitcoin className="w-4 h-4" /> Bitcoin
                        </button>
                      </div>

                      {/* Row 2: Manual methods */}
                      <div className="grid grid-cols-3 gap-2">
                        {/* EcoCash */}
                        {(!manualConfig || manualConfig.ecocash.enabled) && (
                          <button
                            onClick={() => { setPayMethod("ecocash"); setError(null); setCardFields(null); setCardSessionReady(false); }}
                            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${payMethod === "ecocash" ? "bg-green-500/20 text-green-300 border border-green-500/40" : "bg-white/5 text-muted-foreground border border-white/10 hover:text-white"}`}
                          >
                            <Smartphone className="w-4 h-4" />
                            <span className="text-xs">EcoCash</span>
                          </button>
                        )}

                        {/* EcoCash Diaspora */}
                        {(!manualConfig || manualConfig.ecocash_diaspora.enabled) && (
                          <button
                            onClick={() => { setPayMethod("ecocash_diaspora"); setError(null); setCardFields(null); setCardSessionReady(false); }}
                            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${payMethod === "ecocash_diaspora" ? "bg-teal-500/20 text-teal-300 border border-teal-500/40" : "bg-white/5 text-muted-foreground border border-white/10 hover:text-white"}`}
                          >
                            <Send className="w-4 h-4" />
                            <span>Diaspora</span>
                          </button>
                        )}

                        {/* Bank Transfer */}
                        {(!manualConfig || manualConfig.bank.enabled) && (
                          <button
                            onClick={() => { setPayMethod("bank"); setError(null); setCardFields(null); setCardSessionReady(false); }}
                            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${payMethod === "bank" ? "bg-sky-500/20 text-sky-300 border border-sky-500/40" : "bg-white/5 text-muted-foreground border border-white/10 hover:text-white"}`}
                          >
                            <Building2 className="w-4 h-4" />
                            <span>Bank</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Error banner ── */}
                  {error && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* ══ PAYPAL FLOW ══ */}
                  {selectedPkg && payMethod === "paypal" && (
                    <>
                      {!isAuthenticated ? (
                        <div className="p-5 rounded-xl border border-blue-500/30 bg-blue-500/5 text-center space-y-3">
                          <LogIn className="w-7 h-7 text-blue-400 mx-auto" />
                          <p className="text-sm font-semibold text-blue-300">Sign in required</p>
                          <button onClick={onClose} className="px-5 py-2 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-300 text-sm font-semibold hover:bg-blue-500/30 transition-all">
                            Sign In / Sign Up
                          </button>
                        </div>
                      ) : !paypalConfigured ? (
                        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center">
                          <CreditCard className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                          <p className="text-sm text-amber-300 font-semibold">PayPal not configured</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-center gap-2">
                            <p className="text-xs text-center text-muted-foreground">
                              You'll be redirected to PayPal to complete payment securely
                            </p>
                            {paypalSandbox && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                                style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.35)" }}>
                                SANDBOX
                              </span>
                            )}
                          </div>
                          <button
                            onClick={handlePayPalCheckout}
                            disabled={processing || !canCheckout}
                            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            style={{ background: "#003087", color: "#fff" }}
                          >
                            {processing
                              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Redirecting…</>
                              : <><svg className="w-5 h-5" viewBox="0 0 24 24" fill="white"><path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z" /></svg> Pay {currentUsd} with PayPal</>
                            }
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {/* ══ CARD FLOW ══ */}
                  {selectedPkg && payMethod === "card" && (
                    <>
                      {!isAuthenticated ? (
                        <div className="p-5 rounded-xl border border-violet-500/30 bg-violet-500/5 text-center space-y-3">
                          <LogIn className="w-7 h-7 text-violet-400 mx-auto" />
                          <p className="text-sm font-semibold text-violet-300">Sign in required</p>
                          <button onClick={onClose} className="px-5 py-2 rounded-lg bg-violet-500/20 border border-violet-500/40 text-violet-300 text-sm font-semibold hover:bg-violet-500/30 transition-all">
                            Sign In / Sign Up
                          </button>
                        </div>
                      ) : !paypalConfigured ? (
                        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center">
                          <CreditCard className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                          <p className="text-sm text-amber-300 font-semibold">Card payments not configured</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground text-center">
                            Enter your card details — processed securely by PayPal
                          </p>
                          {sdkInitializing && (
                            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Initializing secure payment…</span>
                            </div>
                          )}
                          {!sdkInitializing && (
                            <div className="space-y-2 rounded-xl p-3"
                              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", opacity: cardSessionReady ? 1 : 0.4, transition: "opacity 0.3s" }}>
                              <div>
                                <p className="text-[10px] text-muted-foreground/70 mb-1 uppercase tracking-wider">Name on Card</p>
                                <div id="card-name-field" style={{ height: "40px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground/70 mb-1 uppercase tracking-wider">Card Number</p>
                                <div id="card-number-field" style={{ height: "40px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-[10px] text-muted-foreground/70 mb-1 uppercase tracking-wider">Expiry</p>
                                  <div id="card-expiry-field" style={{ height: "40px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
                                </div>
                                <div>
                                  <p className="text-[10px] text-muted-foreground/70 mb-1 uppercase tracking-wider">CVV</p>
                                  <div id="card-cvv-field" style={{ height: "40px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
                                </div>
                              </div>
                            </div>
                          )}
                          {cardSessionReady && (
                            <button
                              onClick={handleCardSubmit}
                              disabled={processing || !canCheckout}
                              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                              style={{ background: "rgba(139,92,246,0.25)", border: "1px solid rgba(139,92,246,0.5)", color: "#c4b5fd" }}
                            >
                              {processing
                                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Processing…</>
                                : <><CreditCard className="w-4 h-4" /> Pay {currentUsd} with Card</>
                              }
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* ══ BITCOIN FLOW ══ */}
                  {selectedPkg && payMethod === "bitcoin" && (
                    <div className="space-y-3">
                      {!btcConfigured ? (
                        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center">
                          <Bitcoin className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                          <p className="text-sm text-amber-300 font-semibold">Bitcoin not configured</p>
                          <p className="text-xs text-muted-foreground mt-1">Admin needs to set a BITCOIN_ADDRESS.</p>
                        </div>
                      ) : (
                        <>
                          {currentBtc && (
                            <div className="p-3 rounded-xl space-y-1"
                              style={{ background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.25)" }}>
                              <p className="text-xs text-orange-400/80 font-semibold uppercase tracking-wider">Amount to Send</p>
                              <p className="text-2xl font-black text-orange-300">₿ {currentBtc}</p>
                              {btcUsd && <p className="text-xs text-muted-foreground">≈ {currentUsd} at ${btcUsd.toLocaleString()}/BTC</p>}
                              <p className="text-[10px] text-muted-foreground/60">Live rate — valid ~15 min. We accept within 20% tolerance.</p>
                            </div>
                          )}
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Send To (Bitcoin Address)</p>
                            <div className="flex items-center gap-2 p-3 rounded-xl"
                              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                              <code className="flex-1 text-xs text-orange-200 break-all font-mono">{btcAddress}</code>
                              <button onClick={copyAddress} className="p-1.5 rounded-lg text-muted-foreground hover:text-white transition-colors shrink-0">
                                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Your Transaction Hash (after sending)
                            </label>
                            <input
                              type="text" placeholder="64-character hex transaction ID…"
                              value={txHash} onChange={e => { setTxHash(e.target.value); setError(null); }}
                              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-orange-500/50 transition-colors placeholder:text-muted-foreground/40"
                            />
                            <button
                              onClick={handleBitcoinVerify}
                              disabled={!txHash.trim() || btcVerifying || (!txHash.startsWith("test") && txHash.trim().length !== 64)}
                              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{ background: "rgba(251,146,60,0.2)", border: "1px solid rgba(251,146,60,0.4)", color: "#fdba74" }}
                            >
                              {btcVerifying
                                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Verifying on blockchain…</>
                                : <><Bitcoin className="w-4 h-4" /> Verify &amp; Credit Tokens</>
                              }
                            </button>
                          </div>
                          <a href="https://blockstream.info" target="_blank" rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                            <ExternalLink className="w-3 h-3" /> Find your TX hash at blockstream.info
                          </a>
                        </>
                      )}
                    </div>
                  )}

                  {/* ══ MANUAL PAYMENT FLOWS (EcoCash / EcoCash Diaspora / Bank) ══ */}
                  {selectedPkg && isManualMethod(payMethod) && (
                    <ManualPaymentFlow
                      payMethod={payMethod}
                      step={manualStep}
                      config={getCurrentManualConfig()}
                      reference={manualReference}
                      refCopied={refCopied}
                      userPaymentRef={userPaymentRef}
                      processing={processing}
                      submitting={manualSubmitting}
                      canCheckout={canCheckout}
                      currentUsd={currentUsd}
                      isAuthenticated={isAuthenticated}
                      onClose={onClose}
                      onCopyRef={copyRef}
                      onSetUserRef={(v) => { setUserPaymentRef(v); setError(null); }}
                      onCreateReference={handleManualCreateReference}
                      onSubmitProof={handleManualSubmitProof}
                      onBack={resetManualFlow}
                      getLabel={getManualMethodLabel}
                      getIcon={getManualMethodIcon}
                    />
                  )}

                  <p className="text-[10px] text-center text-muted-foreground/50">
                    Tokens are credited to your account. Purchases are final. 1 token = 1 AI interaction.
                  </p>
                </div>
              )}

              {/* HISTORY */}
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
                      <div className={`p-2 rounded-lg ${p.status === "completed" ? "bg-emerald-500/15" : p.status === "pending_manual" ? "bg-amber-500/15" : "bg-slate-500/15"}`}>
                        {p.status === "completed"
                          ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                          : p.status === "pending_manual"
                            ? <Clock className="w-4 h-4 text-amber-400" />
                            : <Clock className="w-4 h-4 text-slate-400" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-semibold">{(p.tokens_amount / 1_000_000).toFixed(0)}M tokens</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(p.created_at).toLocaleDateString()}
                          {p.payment_method && ` · ${p.payment_method}`}
                        </p>
                        {p.manual_reference && (
                          <p className="text-[10px] text-muted-foreground/60 font-mono">Ref: {p.manual_reference}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-white">${(p.amount_usd_cents / 100).toFixed(2)}</p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          p.status === "completed" ? "bg-emerald-500/20 text-emerald-300"
                            : p.status === "pending_manual" ? "bg-amber-500/20 text-amber-300"
                              : "bg-slate-500/20 text-slate-300"
                        }`}>
                          {p.status === "pending_manual" ? "pending" : p.status}
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

/* ══════════════════════════════════════════════════════════════════════
   ManualPaymentFlow sub-component
══════════════════════════════════════════════════════════════════════ */
interface ManualPaymentFlowProps {
  payMethod: PayMethod;
  step: ManualStep;
  config: { enabled: boolean; number?: string; details?: string; instructions: string } | null;
  reference: string;
  refCopied: boolean;
  userPaymentRef: string;
  processing: boolean;
  submitting: boolean;
  canCheckout: boolean;
  currentUsd: string | null;
  isAuthenticated: boolean;
  onClose: () => void;
  onCopyRef: () => void;
  onSetUserRef: (v: string) => void;
  onCreateReference: () => void;
  onSubmitProof: () => void;
  onBack: () => void;
  getLabel: (m: PayMethod) => string;
  getIcon: (m: PayMethod) => React.ReactNode;
}

function ManualPaymentFlow({
  payMethod, step, config, reference, refCopied, userPaymentRef,
  processing, submitting, canCheckout, currentUsd, isAuthenticated,
  onClose, onCopyRef, onSetUserRef, onCreateReference, onSubmitProof, onBack,
  getLabel, getIcon,
}: ManualPaymentFlowProps) {

  const label = getLabel(payMethod);
  const icon = getIcon(payMethod);

  const colors = {
    ecocash: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)", text: "text-green-300", btnBg: "rgba(34,197,94,0.2)", btnBorder: "rgba(34,197,94,0.4)", iconBg: "rgba(34,197,94,0.15)" },
    ecocash_diaspora: { bg: "rgba(20,184,166,0.08)", border: "rgba(20,184,166,0.25)", text: "text-teal-300", btnBg: "rgba(20,184,166,0.2)", btnBorder: "rgba(20,184,166,0.4)", iconBg: "rgba(20,184,166,0.15)" },
    bank: { bg: "rgba(14,165,233,0.08)", border: "rgba(14,165,233,0.25)", text: "text-sky-300", btnBg: "rgba(14,165,233,0.2)", btnBorder: "rgba(14,165,233,0.4)", iconBg: "rgba(14,165,233,0.15)" },
  }[payMethod as "ecocash" | "ecocash_diaspora" | "bank"] ?? {
    bg: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.25)", text: "text-indigo-300", btnBg: "rgba(99,102,241,0.2)", btnBorder: "rgba(99,102,241,0.4)", iconBg: "rgba(99,102,241,0.15)",
  };

  if (!isAuthenticated) {
    return (
      <div className="p-5 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center space-y-3">
        <LogIn className="w-7 h-7 text-amber-400 mx-auto" />
        <p className="text-sm font-semibold text-amber-300">Sign in required</p>
        <button onClick={onClose} className="px-5 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-sm font-semibold hover:bg-amber-500/30 transition-all">
          Sign In / Sign Up
        </button>
      </div>
    );
  }

  if (!config || !config.enabled) {
    return (
      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center">
        <AlertCircle className="w-6 h-6 text-amber-400 mx-auto mb-2" />
        <p className="text-sm text-amber-300 font-semibold">{label} not configured</p>
        <p className="text-xs text-muted-foreground mt-1">Admin needs to enable this payment method.</p>
      </div>
    );
  }

  /* ── Step 1: Show payment details + get reference ── */
  if (step === "select") {
    return (
      <div className="space-y-3">
        {/* Payment details card */}
        <div className="p-4 rounded-xl space-y-3" style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg" style={{ background: colors.iconBg }}>
              <span className={colors.text}>{icon}</span>
            </div>
            <div>
              <p className={`text-sm font-bold ${colors.text}`}>{label}</p>
              <p className="text-xs text-muted-foreground">Manual payment — requires admin approval</p>
            </div>
          </div>

          {/* Number / account details */}
          {(config.number || config.details) && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-semibold">
                {payMethod === "bank" ? "Bank Details" : "Send To"}
              </p>
              <div className="p-2.5 rounded-lg bg-black/20">
                <p className={`text-sm font-mono font-bold ${colors.text}`}>
                  {config.number ?? config.details}
                </p>
              </div>
            </div>
          )}

          {/* Amount */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Amount to pay:</span>
            <span className="text-lg font-black text-white">{currentUsd}</span>
          </div>

          {/* Instructions */}
          {config.instructions && (
            <div className="p-2.5 rounded-lg bg-black/20">
              <p className="text-xs text-muted-foreground whitespace-pre-line">{config.instructions}</p>
            </div>
          )}
        </div>

        <button
          onClick={onCreateReference}
          disabled={processing || !canCheckout}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: colors.btnBg, border: `1px solid ${colors.btnBorder}`, color: "white" }}
        >
          {processing
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating reference…</>
            : <><span>{icon}</span> Get Payment Reference</>
          }
        </button>
      </div>
    );
  }

  /* ── Step 2: Show reference, user submits proof ── */
  if (step === "reference") {
    return (
      <div className="space-y-3">
        {/* Reference box */}
        <div className="p-4 rounded-xl space-y-3" style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Your Payment Reference</p>
            <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-black/30">
              <code className={`text-xl font-black font-mono tracking-widest ${colors.text}`}>{reference}</code>
              <button onClick={onCopyRef} className="p-1.5 rounded-lg text-muted-foreground hover:text-white transition-colors">
                {refCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p className="font-semibold text-white text-sm">Instructions:</p>
            <ol className="space-y-1.5 list-decimal list-inside">
              <li>Send <span className="text-white font-bold">{currentUsd}</span> to the {label} number above</li>
              <li>Use reference <span className={`font-bold font-mono ${colors.text}`}>{reference}</span> in your payment description/narration</li>
              <li>Copy your payment confirmation reference/receipt number</li>
              <li>Paste it below and click "I Have Paid"</li>
            </ol>
          </div>
        </div>

        {/* User submits their payment reference */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Your Payment Confirmation / Receipt Number
          </label>
          <input
            type="text"
            placeholder="e.g. ECO123456789 or bank receipt number…"
            value={userPaymentRef}
            onChange={e => onSetUserRef(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-colors placeholder:text-muted-foreground/40"
          />
        </div>

        <button
          onClick={onSubmitProof}
          disabled={!userPaymentRef.trim() || submitting}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: colors.btnBg, border: `1px solid ${colors.btnBorder}`, color: "white" }}
        >
          {submitting
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting…</>
            : <><CheckCircle className="w-4 h-4" /> I Have Paid</>
          }
        </button>

        <button onClick={onBack} className="w-full text-xs text-muted-foreground hover:text-white transition-colors py-1">
          ← Go back
        </button>
      </div>
    );
  }

  /* ── Step 3: Confirmation ── */
  if (step === "confirm") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="p-6 rounded-xl text-center space-y-4"
        style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}
      >
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
          style={{ background: "rgba(251,191,36,0.2)", border: "2px solid rgba(251,191,36,0.4)" }}>
          <Clock className="w-7 h-7 text-amber-400" />
        </div>
        <div>
          <p className="text-lg font-bold text-white">Payment Submitted!</p>
          <p className="text-sm text-amber-300 mt-1">Reference: <span className="font-mono font-bold">{reference}</span></p>
          <p className="text-xs text-muted-foreground mt-2 max-w-xs mx-auto">
            Your payment is being reviewed by our team. Tokens will be credited to your account once verified, usually within 1–24 hours.
          </p>
        </div>
        <button onClick={onBack}
          className="px-5 py-2 rounded-xl text-xs font-semibold text-amber-300 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-all">
          Submit Another Payment
        </button>
      </motion.div>
    );
  }

  return null;
}
