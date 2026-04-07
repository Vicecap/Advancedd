import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { db, studyResourcesTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { Readable } from "stream";

const router: IRouter = Router();
const storage = new ObjectStorageService();

const RequestUploadUrlBody = z.object({
  name: z.string().min(1),
  size: z.number().positive(),
  contentType: z.string().min(1),
});

const CreateResourceBody = z.object({
  title: z.string().min(1).max(255),
  board: z.enum(["zimsec", "cambridge"]),
  category: z.enum(["past_papers", "green_books", "textbooks"]),
  subject: z.string().min(1).max(100),
  year: z.number().int().min(1990).max(2100).optional(),
  level: z.string().default("o-level"),
  objectPath: z.string().optional(),
  externalUrl: z.string().url().optional(),
  fileName: z.string().min(1),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  description: z.string().optional(),
});

const ListResourcesQuery = z.object({
  board: z.enum(["zimsec", "cambridge"]).optional(),
  category: z.enum(["past_papers", "green_books", "textbooks"]).optional(),
  subject: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

router.post("/resources/upload-url", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign in to upload resources" });
    return;
  }

  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing required fields: name, size, contentType" });
    return;
  }

  try {
    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath });
  } catch (err) {
    req.log.error({ err }, "Failed to generate upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.post("/resources", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign in to add resources" });
    return;
  }

  const parsed = CreateResourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map(i => i.message).join(", ") });
    return;
  }

  const [resource] = await db
    .insert(studyResourcesTable)
    .values({
      ...parsed.data,
      uploadedBy: req.user.id,
    })
    .returning();

  res.status(201).json({ resource });
});

router.get("/resources", async (req: Request, res: Response): Promise<void> => {
  const parsed = ListResourcesQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const { board, category, subject, limit, offset } = parsed.data;
  const conditions = [];
  if (board) conditions.push(eq(studyResourcesTable.board, board));
  if (category) conditions.push(eq(studyResourcesTable.category, category));
  if (subject) conditions.push(eq(studyResourcesTable.subject, subject));

  const where = conditions.length ? and(...conditions) : undefined;

  const [resources, [{ total }]] = await Promise.all([
    db
      .select()
      .from(studyResourcesTable)
      .where(where)
      .orderBy(desc(studyResourcesTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(studyResourcesTable)
      .where(where),
  ]);

  res.setHeader("Cache-Control", "no-store, no-cache");
  res.json({ resources, total, limit, offset, hasMore: offset + resources.length < total });
});

router.get("/resources/:id/download", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid resource ID" });
    return;
  }

  const [resource] = await db
    .select()
    .from(studyResourcesTable)
    .where(eq(studyResourcesTable.id, id));

  if (!resource) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }

  // External URL — proxy through to avoid CORS issues and keep UX consistent
  if (resource.externalUrl) {
    try {
      const upstream = await fetch(resource.externalUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AIMathSolver/1.0)" },
      });
      if (!upstream.ok) {
        res.status(502).json({ error: "External source returned an error" });
        return;
      }
      res.setHeader("Content-Type", resource.mimeType ?? upstream.headers.get("content-type") ?? "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${resource.fileName}"`);
      const cl = upstream.headers.get("content-length");
      if (cl) res.setHeader("Content-Length", cl);
      const body = upstream.body;
      if (!body) { res.status(500).json({ error: "Empty file" }); return; }
      const readable = Readable.fromWeb(body as import("stream/web").ReadableStream);
      readable.pipe(res);
    } catch (err) {
      req.log.error({ err }, "Failed to proxy external resource");
      res.status(502).json({ error: "Failed to fetch from external source" });
    }
    return;
  }

  // Self-hosted in object storage
  if (!resource.objectPath) {
    res.status(404).json({ error: "No file available for this resource" });
    return;
  }

  try {
    const file = await storage.getObjectEntityFile(resource.objectPath);
    const response = await storage.downloadObject(file, 86400);

    res.setHeader("Content-Type", resource.mimeType ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${resource.fileName}"`);

    const headers = Object.fromEntries(response.headers.entries());
    if (headers["content-length"]) res.setHeader("Content-Length", headers["content-length"]);

    const body = response.body;
    if (!body) { res.status(500).json({ error: "Empty file" }); return; }
    const readable = Readable.fromWeb(body as import("stream/web").ReadableStream);
    readable.pipe(res);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found in storage" });
    } else {
      req.log.error({ err }, "Failed to serve resource file");
      res.status(500).json({ error: "Failed to download file" });
    }
  }
});

router.delete("/resources/:id", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign in to delete resources" });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid resource ID" });
    return;
  }

  const [deleted] = await db
    .delete(studyResourcesTable)
    .where(
      and(
        eq(studyResourcesTable.id, id),
        eq(studyResourcesTable.uploadedBy, req.user.id),
      ),
    )
    .returning({ id: studyResourcesTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Resource not found or not yours to delete" });
    return;
  }

  res.sendStatus(204);
});

export default router;
