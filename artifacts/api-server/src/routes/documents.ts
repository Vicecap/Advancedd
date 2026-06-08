import { Router, type Request, type Response } from "express";
import { redisRateLimit } from "../lib/rate-limiter";
import { logSecurityEvent } from "../lib/security";
import { requireTokens } from "../lib/tokens";

const router = Router();
const docLimit = redisRateLimit({ windowSecs: 60, max: 60, keyPrefix: "rl:documents", message: "Too many document requests." });
const downloadLimit = redisRateLimit({ windowSecs: 60, max: 10, keyPrefix: "rl:documents:download", message: "Too many downloads." });

function baseUrl(): string {
  return (process.env.DOCUMENTS_BASE_URL ?? "https://doc.totalsportss.online").replace(/\/$/, "");
}

function one(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] : (value ?? ""); }
function safeFilename(name: string | null | undefined): string {
  const cleaned = (name || "document.pdf").replace(/[\r\n\\/]/g, "_").replace(/[^\w .()-]/g, "_").slice(0, 120).trim();
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "document"}.pdf`;
}

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (!req.isAuthenticated?.() || !req.user?.isAdmin) {
    void logSecurityEvent(req, "documents_admin_denied", "high", req.user?.id, "Non-admin document write attempt", { blocked: true });
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

async function proxyJson(req: Request, res: Response, targetPath: string, init?: RequestInit): Promise<void> {
  const url = new URL(`${baseUrl()}${targetPath}`);
  for (const [k, v] of Object.entries(req.query)) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x).slice(0, 200)));
    else if (v !== undefined) url.searchParams.set(k, String(v).slice(0, 200));
  }
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(Number(process.env.DOCUMENTS_TIMEOUT_MS ?? 15000)) });
  const text = await response.text();
  res.status(response.status).type(response.headers.get("content-type") || "application/json").send(text);
}

router.get("/v1/documents", docLimit, (req, res) => proxyJson(req, res, "/api/v1/documents"));
router.get("/v1/documents/stats", docLimit, (req, res) => proxyJson(req, res, "/api/v1/documents/stats"));
router.get("/v1/documents/:id", docLimit, (req, res) => proxyJson(req, res, `/api/v1/documents/${encodeURIComponent(one(req.params.id))}`));
router.get("/v1/documents/:id/formats", docLimit, (req, res) => proxyJson(req, res, `/api/v1/documents/${encodeURIComponent(one(req.params.id))}/formats`));
router.get("/v1/documents/:id/preview", docLimit, requireTokens(1_000), (req, res) => proxyJson(req, res, `/api/v1/documents/${encodeURIComponent(one(req.params.id))}/preview`));
router.get("/v1/documents/:id/download", downloadLimit, requireTokens(2_000), async (req, res): Promise<void> => {
  const response = await fetch(`${baseUrl()}/api/v1/documents/${encodeURIComponent(one(req.params.id))}/download`, { signal: AbortSignal.timeout(Number(process.env.DOCUMENTS_TIMEOUT_MS ?? 30000)) });
  if (!response.ok || !response.body) { res.status(response.status).json({ error: "Document download failed" }); return; }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${safeFilename(response.headers.get("x-filename") || response.headers.get("content-disposition") || `document-${one(req.params.id)}.pdf`)}"`);
  const stream = (await import("stream")).Readable.fromWeb(response.body as import("stream/web").ReadableStream);
  stream.pipe(res);
});
router.post("/v1/documents", docLimit, requireAdmin, (req, res) => proxyJson(req, res, "/api/v1/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req.body) }));
router.put("/v1/documents/:id", docLimit, requireAdmin, (req, res) => proxyJson(req, res, `/api/v1/documents/${encodeURIComponent(one(req.params.id))}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req.body) }));
router.delete("/v1/documents/:id", docLimit, requireAdmin, (req, res) => proxyJson(req, res, `/api/v1/documents/${encodeURIComponent(one(req.params.id))}`, { method: "DELETE" }));

router.get("/v1/search", docLimit, (req, res) => proxyJson(req, res, "/api/v1/search"));
router.get("/v1/search/title", docLimit, (req, res) => proxyJson(req, res, "/api/v1/search/title"));
router.get("/v1/search/author", docLimit, (req, res) => proxyJson(req, res, "/api/v1/search/author"));
router.get("/v1/search/suggestions", docLimit, (req, res) => proxyJson(req, res, "/api/v1/search/suggestions"));
router.get("/v1/search/categories", docLimit, (req, res) => proxyJson(req, res, "/api/v1/search/categories"));
router.get("/v1/search/filters", docLimit, (req, res) => proxyJson(req, res, "/api/v1/search/filters"));

export default router;
