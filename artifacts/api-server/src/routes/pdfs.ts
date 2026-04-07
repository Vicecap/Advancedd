import { Router } from "express";

const router = Router();
const PDF_API_BASE = "http://63.142.251.202:5080";

router.get("/study-pdfs", async (req, res) => {
  try {
    const { page = "1", limit = "20", class: cls, search } = req.query;
    let url = `${PDF_API_BASE}/api/pdfs?page=${page}&limit=${limit}`;
    if (cls && cls !== "all") url += `&class=${encodeURIComponent(String(cls))}`;
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
