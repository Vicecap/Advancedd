import { Router } from "express";
const router = Router();

const PDF_API_BASE = (process.env.DOCUMENTS_BASE_URL ?? "https://doc.totalsportss.online").replace(/\/$/, "");

router.get("/study-pdfs", async (req, res) => {
  try {
    const { page = "1", limit = "1000", class: cls, search } = req.query;

    let url = `${PDF_API_BASE}/api/v1/documents?type=textbook&page=${page}&limit=${limit}`;
    if (cls && cls !== "all") url += `&grade=${encodeURIComponent(String(cls))}`;
    if (search) url += `&search=${encodeURIComponent(String(search))}`;

    const upstream = await fetch(url);
    if (!upstream.ok) {
      res.status(502).json({ error: "Upstream PDF API error", status: upstream.status });
      return;
    }

    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    console.error("[pdfs proxy]", err);
    res.status(500).json({ error: "Failed to reach PDF API" });
  }
});

export default router;
