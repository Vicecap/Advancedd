import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/external-solve", async (req, res): Promise<void> => {
  const { source, operation, expression } = req.query as Record<string, string>;

  if (!expression?.trim()) {
    res.status(400).json({ error: "expression is required" });
    return;
  }

  try {
    if (source === "mathjs") {
      const url = `https://api.mathjs.org/v4/?expr=${encodeURIComponent(expression)}`;
      const response = await fetch(url);
      const text = await response.text();
      if (!response.ok) throw new Error(text || `api.mathjs.org returned ${response.status}`);
      res.json({ result: text.trim(), source: "mathjs", expression });
    } else {
      const op = operation?.trim() || "simplify";
      const url = `https://newton.now.sh/api/v2/${op}/${encodeURIComponent(expression)}`;
      const response = await fetch(url);
      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(errText || `Newton API returned ${response.status}`);
      }
      const data = await response.json() as { operation: string; expression: string; result: string };
      res.json({ result: data.result, operation: data.operation, source: "newton", expression: data.expression });
    }
  } catch (err) {
    req.log.warn({ err }, "External solve error");
    res.status(502).json({ error: (err as Error).message });
  }
});

router.get("/trivia-external", async (req, res): Promise<void> => {
  const { categories, difficulty, limit } = req.query as Record<string, string>;
  let url = `https://the-trivia-api.com/v2/questions?limit=${limit || "20"}`;
  if (categories) url += `&categories=${categories}`;
  if (difficulty && difficulty !== "any") url += `&difficulty=${difficulty}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`The Trivia API returned ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    req.log.warn({ err }, "Trivia external error");
    res.status(502).json({ error: (err as Error).message });
  }
});

const EXT_BASE = "http://63.142.251.202:5080";

interface ExtBook { title: string; pdf: string; author?: string; }

// ── routes ────────────────────────────────────────────────────────────────────

router.get("/external-books", async (_req, res): Promise<void> => {
  try {
    // fetch main books and books-small in parallel
    const [mainData, smallData] = await Promise.allSettled([
      fetch(`${EXT_BASE}/books`).then(r => r.json()) as Promise<ExtBook[]>,
      fetch(`${EXT_BASE}/books-small`).then(r => r.json()) as Promise<{ title: string; author: string; pdf: string }[]>,
    ]);

    const main: ExtBook[] = mainData.status === "fulfilled" && Array.isArray(mainData.value) ? mainData.value : [];
    const small: ExtBook[] = smallData.status === "fulfilled" && Array.isArray(smallData.value)
      ? smallData.value.filter(b => b.pdf).map(b => ({ title: b.title, pdf: b.pdf, author: b.author }))
      : [];

    // merge and deduplicate by lowercased title
    const seen = new Set<string>();
    const merged: ExtBook[] = [];
    for (const b of [...main, ...small]) {
      const key = b.title?.toLowerCase().trim();
      if (key && !seen.has(key)) { seen.add(key); merged.push(b); }
    }
    res.json(merged);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

router.get("/external-books-stream", async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = 2000;
  try {
    const r = await fetch(`${EXT_BASE}/books-page?page=${page}&limit=${limit}`);
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const json = await r.json() as { page: number; limit: number; data: { title: string; url: string }[] };
    const books: ExtBook[] = (json.data || []).map(b => ({ title: b.title, pdf: b.url }));
    res.json({ page: json.page, books, hasMore: books.length >= limit });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

router.get("/external-green-books", async (_req, res): Promise<void> => {
  try {
    const r = await fetch(`${EXT_BASE}/pdf-clean`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

router.get("/external-notes", async (_req, res): Promise<void> => {
  try {
    const r = await fetch(`${EXT_BASE}/notes-api`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

router.get("/external-syllabus", async (_req, res): Promise<void> => {
  try {
    const r = await fetch(`${EXT_BASE}/syllabus`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

router.get("/external-pdf", async (req, res): Promise<void> => {
  const { url } = req.query as Record<string, string>;
  if (!url?.trim()) {
    res.status(400).json({ error: "url is required" });
    return;
  }
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      res.status(502).json({ error: `Upstream returned ${upstream.status}` });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "public, max-age=3600");
    const { Readable } = await import("node:stream");
    if (upstream.body) {
      Readable.fromWeb(upstream.body as import("stream/web").ReadableStream).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
