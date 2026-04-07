import { Router, type IRouter, type Request, type Response } from "express";
import { db, clientErrorLogsTable } from "@workspace/db";
import { desc, eq, count } from "drizzle-orm";

const router: IRouter = Router();

/* ── POST /errors/report — frontend reports an error ── */
router.post("/errors/report", async (req: Request, res: Response): Promise<void> => {
  const { message, stack, url, component } = req.body as {
    message?: string; stack?: string; url?: string; component?: string;
  };
  if (!message) { res.status(400).json({ error: "message required." }); return; }

  const userId = req.isAuthenticated() ? req.user!.id : null;
  const email = req.isAuthenticated() ? (req.user!.email ?? null) : null;

  await db.insert(clientErrorLogsTable).values({
    userId,
    email,
    message: String(message).slice(0, 2000),
    stack: stack ? String(stack).slice(0, 5000) : null,
    url: url ? String(url).slice(0, 1024) : null,
    component: component ? String(component).slice(0, 256) : null,
  });

  res.json({ ok: true });
});

/* ── GET /admin/errors — admin sees error logs ── */
router.get("/admin/errors", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated() || !req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required." }); return;
  }
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const logs = await db.select().from(clientErrorLogsTable)
    .orderBy(desc(clientErrorLogsTable.createdAt))
    .limit(limit);
  const [{ total }] = await db.select({ total: count() }).from(clientErrorLogsTable);
  res.json({ logs, total });
});

/* ── DELETE /admin/errors/:id — delete one error log ── */
router.delete("/admin/errors/:id", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated() || !req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required." }); return;
  }
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id." }); return; }
  await db.delete(clientErrorLogsTable).where(eq(clientErrorLogsTable.id, id));
  res.json({ ok: true });
});

/* ── DELETE /admin/errors — clear ALL error logs ── */
router.delete("/admin/errors", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated() || !req.user?.isAdmin) {
    res.status(403).json({ error: "Admin access required." }); return;
  }
  await db.delete(clientErrorLogsTable);
  res.json({ ok: true });
});

export default router;
