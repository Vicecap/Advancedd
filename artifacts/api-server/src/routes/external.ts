import { Router, type IRouter } from "express";
import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib";
import { Readable } from "node:stream";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";

const execAsync = promisify(exec);
const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Detect format from url path or mime type */
function detectFormat(url: string, contentType: string): string {
  const mime = contentType.toLowerCase();
  if (mime.includes("application/pdf"))               return "pdf";
  if (mime.includes("application/epub"))              return "epub";
  if (mime.includes("text/html"))                     return "html";
  if (mime.includes("text/plain"))                    return "txt";
  if (
    mime.includes("application/vnd.openxmlformats") ||
    mime.includes("application/msword")
  )                                                   return "docx";
  if (mime.includes("application/x-mobipocket"))      return "mobi";
  if (mime.includes("application/x-fictionbook"))     return "fb2";

  // Fall back to extension in URL
  const ext = path.extname(new URL(url).pathname).toLowerCase().replace(".", "");
  if (["pdf","epub","txt","html","htm","docx","doc","mobi","fb2","rtf","odt"].includes(ext)) {
    return ext === "htm" ? "html" : ext;
  }

  return "unknown";
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-format converters → Buffer (PDF bytes)
// ─────────────────────────────────────────────────────────────────────────────

/** Wrap plain text into a PDF using pdf-lib */
async function textToPdf(text: string): Promise<Buffer> {
  const pdfDoc  = await PDFDocument.create();
  const font    = await pdfDoc.embedFont(StandardFonts.Courier);
  const fontSize        = 11;
  const lineHeight      = fontSize + 4;
  const marginX         = 50;
  const marginY         = 50;
  const [pageW, pageH]  = PageSizes.A4;
  const maxWidth        = pageW - marginX * 2;
  const linesPerPage    = Math.floor((pageH - marginY * 2) / lineHeight);

  // Word-wrap each source line
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  const wrapped: string[] = [];
  for (const raw of rawLines) {
    if (raw.trim() === "") { wrapped.push(""); continue; }

    let current = "";
    for (const word of raw.split(" ")) {
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, fontSize) > maxWidth) {
        if (current) wrapped.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) wrapped.push(current);
  }

  // Paginate
  for (let i = 0; i < wrapped.length; i += linesPerPage) {
    const page  = pdfDoc.addPage([pageW, pageH]);
    const chunk = wrapped.slice(i, i + linesPerPage);
    chunk.forEach((line, idx) => {
      page.drawText(line, {
        x:    marginX,
        y:    pageH - marginY - idx * lineHeight,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
    });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

/** Strip HTML tags and delegate to textToPdf */
async function htmlToPdf(html: string): Promise<Buffer> {
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return textToPdf(text);
}

/** Extract text from EPUB (zip-based) and delegate to textToPdf */
async function epubToPdf(buffer: Buffer): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const zip   = await JSZip.loadAsync(buffer);

  const htmlFiles = Object.keys(zip.files)
    .filter(f => /\.(html|xhtml|htm)$/i.test(f))
    .sort();

  if (htmlFiles.length === 0) {
    return textToPdf("[EPUB contained no readable text content]");
  }

  const parts: string[] = [];
  for (const file of htmlFiles) {
    const content = await zip.files[file].async("string");
    const text = content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ");

    parts.push(text.trim());
  }

  return textToPdf(parts.join("\n\n───\n\n"));
}

/** Extract text from DOCX (Office Open XML) */
async function docxToPdf(buffer: Buffer): Promise<Buffer> {
  const mammoth = await import("mammoth");
  const result  = await mammoth.extractRawText({ buffer });
  return textToPdf(result.value);
}

/**
 * Try to use Calibre (ebook-convert) for formats we can't handle natively.
 * Returns null if Calibre is not available.
 */
async function calibreConvert(
  buffer: Buffer,
  fromExt: string
): Promise<Buffer | null> {
  try {
    const tmpDir  = await fs.mkdtemp(path.join(os.tmpdir(), "docconv-"));
    const inFile  = path.join(tmpDir, `input.${fromExt}`);
    const outFile = path.join(tmpDir, "output.pdf");
    await fs.writeFile(inFile, buffer);
    await execAsync(`ebook-convert "${inFile}" "${outFile}"`, { timeout: 60_000 });
    const pdf = await fs.readFile(outFile);
    await fs.rm(tmpDir, { recursive: true, force: true });
    return pdf;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Master converter
// ─────────────────────────────────────────────────────────────────────────────

async function convertToPdf(
  buffer: Buffer,
  format: string,
  contentType: string
): Promise<Buffer> {
  switch (format) {
    case "pdf":
      return buffer;
    case "txt":
      return textToPdf(buffer.toString("utf8"));
    case "html":
    case "htm":
      return htmlToPdf(buffer.toString("utf8"));
    case "epub":
      return epubToPdf(buffer);
    case "docx":
    case "doc":
      return docxToPdf(buffer);
    case "mobi":
    case "fb2":
    case "rtf":
    case "odt":
    case "azw":
    case "azw3":
    case "lit": {
      const calibreResult = await calibreConvert(buffer, format);
      if (calibreResult) return calibreResult;
      const raw = buffer.toString("utf8").replace(/<[^>]+>/g, " ");
      return textToPdf(`[${format.toUpperCase()} - best-effort text extract]\n\n${raw}`);
    }
    default: {
      const text = buffer.toString("utf8");
      return textToPdf(
        `[Unknown format: ${format} | ${contentType}]\n\n${text}`
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

const EXT_BASE = "http://80.241.208.95:3057";

router.get("/external-solve", async (req, res): Promise<void> => {
  const { source, operation, expression } = req.query as Record<string, string>;

  if (!expression?.trim()) {
    res.status(400).json({ error: "expression is required" });
    return;
  }

  try {
    if (source === "mathjs") {
      const url      = `https://api.mathjs.org/v4/?expr=${encodeURIComponent(expression)}`;
      const response = await fetch(url);
      const text     = await response.text();
      if (!response.ok) throw new Error(text || `api.mathjs.org returned ${response.status}`);
      res.json({ result: text.trim(), source: "mathjs", expression });
    } else {
      const op       = operation?.trim() || "simplify";
      const url      = `https://newton.now.sh/api/v2/${op}/${encodeURIComponent(expression)}`;
      const response = await fetch(url);
      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(errText || `Newton API returned ${response.status}`);
      }
      const data = await response.json() as {
        operation: string;
        expression: string;
        result: string;
      };
      res.json({
        result:     data.result,
        operation:  data.operation,
        source:     "newton",
        expression: data.expression,
      });
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

interface ExtBook {
  title:   string;
  pdf:     string;
  author?: string;
}

router.get("/external-books", async (_req, res): Promise<void> => {
  try {
    const [mainData, smallData] = await Promise.allSettled([
      fetch(`${EXT_BASE}/api/v1/documents?limit=100`).then(r => r.json()) as Promise<{ data: ExtBook[] }>,
      fetch(`${EXT_BASE}/api/v1/documents?limit=100&type=small`).then(r => r.json()) as Promise<{ data: ExtBook[] }>,
    ]);

    const main: ExtBook[] =
      mainData.status === "fulfilled" && Array.isArray(mainData.value?.data)
        ? mainData.value.data.map((b: any) => ({
            title:  b.title,
            pdf:    b.formats?.pdf ?? b.pdf ?? "",
            author: b.author,
          }))
        : [];

    const small: ExtBook[] =
      smallData.status === "fulfilled" && Array.isArray(smallData.value?.data)
        ? smallData.value.data
            .filter((b: any) => b.formats?.pdf ?? b.pdf)
            .map((b: any) => ({
              title:  b.title,
              pdf:    b.formats?.pdf ?? b.pdf,
              author: b.author,
            }))
        : [];

    const seen   = new Set<string>();
    const merged: ExtBook[] = [];
    for (const b of [...main, ...small]) {
      const key = b.title?.toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(b);
      }
    }

    res.json(merged);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

router.get("/external-books-stream", async (req, res): Promise<void> => {
  const page  = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = 100;

  try {
    const r = await fetch(`${EXT_BASE}/api/v1/documents?page=${page}&limit=${limit}`);
    if (!r.ok) throw new Error(`upstream ${r.status}`);

    const json = await r.json() as {
      pagination: { page: number; limit: number; has_next: boolean };
      data: { title: string; formats?: { pdf?: string }; pdf?: string }[];
    };

    const books: ExtBook[] = (json.data || []).map(b => ({
      title: b.title,
      pdf:   b.formats?.pdf ?? b.pdf ?? "",
    }));

    res.json({ page: json.pagination?.page, books, hasMore: json.pagination?.has_next ?? books.length >= limit });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

router.get("/external-green-books", async (_req, res): Promise<void> => {
  try {
    const r    = await fetch(`${EXT_BASE}/api/v1/documents?type=green_book`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

router.get("/external-notes", async (_req, res): Promise<void> => {
  try {
    const r    = await fetch(`${EXT_BASE}/api/v1/documents?type=notes`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

router.get("/external-syllabus", async (_req, res): Promise<void> => {
  try {
    const r    = await fetch(`${EXT_BASE}/api/v1/documents?type=past_paper`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// /external-pdf  — converts ANY format to PDF on the fly
// ─────────────────────────────────────────────────────────────────────────────

router.get("/external-pdf", async (req, res): Promise<void> => {
  const { url } = req.query as Record<string, string>;
  if (!url?.trim()) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; DocProxy/1.0; +https://ai.vicecap.site)",
        Accept:
          "application/pdf,application/epub+zip,text/html,text/plain,*/*;q=0.8",
      },
    });

    if (!upstream.ok) {
      res.status(502).json({ error: `Upstream returned ${upstream.status}` });
      return;
    }

    const arrayBuf    = await upstream.arrayBuffer();
    const rawBuffer   = Buffer.from(arrayBuf);
    const contentType = upstream.headers.get("content-type") ?? "";

    const format    = detectFormat(url, contentType);
    const pdfBuffer = await convertToPdf(rawBuffer, format, contentType);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=\"document.pdf\"");
    res.setHeader("Content-Length", pdfBuffer.length.toString());
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader(
      "X-Original-Format",
      format === "unknown" ? contentType || "unknown" : format
    );

    res.end(pdfBuffer);
  } catch (err) {
    req.log.warn({ err }, "external-pdf conversion error");
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
