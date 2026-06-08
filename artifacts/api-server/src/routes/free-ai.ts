import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";

const FREE_AI_BASE = "http://80.241.208.95:4002";
const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const FALLBACK_MODELS = [
  { id: "free-fast",     label: "Free Fast",     sub: "Quick answers · Free",   recommended: false, free: true },
  { id: "free-balanced", label: "Free Balanced",  sub: "General use · Free",     recommended: true,  free: true },
];

router.get("/free-ai/ais", async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await fetch(`${FREE_AI_BASE}/ais`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error("upstream error");
    const data = await r.json() as { models?: unknown[] } | unknown[] | Record<string, unknown>;

    let rawModels: unknown[] = [];
    if (Array.isArray(data)) {
      rawModels = data;
    } else if (data && typeof data === "object" && "models" in data && Array.isArray((data as { models: unknown[] }).models)) {
      rawModels = (data as { models: unknown[] }).models;
    }

    const models = rawModels.length > 0
      ? rawModels.map((m, i) => {
          if (typeof m === "string") {
            return { id: m, label: m, sub: "Free model", recommended: false, free: true };
          }
          const mo = m as Record<string, unknown>;
          const id = String(mo.id ?? mo.name ?? mo.model ?? `free-${i}`);
          const label = String(mo.label ?? mo.name ?? mo.display_name ?? id);
          const sub = typeof mo.sub === "string" ? mo.sub : (typeof mo.description === "string" ? mo.description : "Free model");
          return { id, label, sub: sub + " · Free", recommended: !!mo.recommended, free: true };
        })
      : FALLBACK_MODELS;
    res.json({ models });
  } catch {
    res.json({ models: FALLBACK_MODELS });
  }
});

router.post("/free-ai/discuss", async (req: Request, res: Response): Promise<void> => {
  try {
    const r = await fetch(`${FREE_AI_BASE}/discuss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) {
      res.status(r.status).json({ error: "Free AI service error" });
      return;
    }
    const data = await r.json() as unknown;
    res.json(data);
  } catch {
    res.status(502).json({ error: "Free AI service unavailable" });
  }
});

router.post("/free-ai/solve", async (req: Request, res: Response): Promise<void> => {
  try {
    const r = await fetch(`${FREE_AI_BASE}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) {
      res.status(r.status).json({ error: "Free AI service error" });
      return;
    }
    const data = await r.json() as unknown;
    res.json(data);
  } catch {
    res.status(502).json({ error: "Free AI service unavailable" });
  }
});

router.get("/free-ai/solve-stream", async (req: Request, res: Response): Promise<void> => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const params = new URLSearchParams(req.query as Record<string, string>);
    const r = await fetch(`${FREE_AI_BASE}/solve-stream?${params.toString()}`, {
      signal: AbortSignal.timeout(90000),
    });
    if (!r.ok || !r.body) {
      res.write(`data: ${JSON.stringify({ error: "Free AI service unavailable" })}\n\n`);
      res.end();
      return;
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } catch {
    res.write(`data: ${JSON.stringify({ error: "Free AI stream failed" })}\n\n`);
  }
  res.end();
});

router.post("/free-ai/ai-stream", async (req: Request, res: Response): Promise<void> => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const r = await fetch(`${FREE_AI_BASE}/ai-stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(90000),
    });
    if (!r.ok || !r.body) {
      res.write(`data: ${JSON.stringify({ error: "Free AI service unavailable" })}\n\n`);
      res.end();
      return;
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } catch {
    res.write(`data: ${JSON.stringify({ error: "Free AI stream failed" })}\n\n`);
  }
  res.end();
});

router.post("/free-ai/upload-image", upload.single("image"), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No image provided" });
    return;
  }
  try {
    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    formData.append("image", blob, req.file.originalname ?? "image.jpg");
    const r = await fetch(`${FREE_AI_BASE}/upload-image`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) {
      res.status(r.status).json({ error: "Free AI OCR error" });
      return;
    }
    const data = await r.json() as unknown;
    res.json(data);
  } catch {
    res.status(502).json({ error: "Free AI OCR service unavailable" });
  }
});

export default router;
