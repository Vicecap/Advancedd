import { Router, type IRouter, type Request, type Response } from "express";
import { db, pool, supportTicketsTable, usersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { sendSupportTicketNotification, sendSupportTicketReply } from "../lib/email";

const router: IRouter = Router();

const VALID_CATS = new Set(["billing", "technical", "general"]);
const VALID_PRIOS = new Set(["low", "medium", "high", "urgent"]);
const VALID_DIRS = new Set(["billing", "technical", "support"]);
const VALID_STATUSES = new Set(["open", "in_progress", "resolved", "closed"]);

/* ── POST /api/support/tickets — create a new ticket ── */
router.post("/support/tickets", async (req: Request, res: Response): Promise<void> => {
  const { subject, message, category, priority, directedTo, name, email: bodyEmail } = req.body as {
    subject?: string; message?: string; category?: string; priority?: string;
    directedTo?: string; name?: string; email?: string;
  };

  if (!subject?.trim() || !message?.trim()) {
    res.status(400).json({ error: "Subject and message are required." }); return;
  }

  const cat = VALID_CATS.has(category ?? "") ? (category as string) : "general";
  const prio = VALID_PRIOS.has(priority ?? "") ? (priority as string) : "medium";
  const dir = VALID_DIRS.has(directedTo ?? "") ? (directedTo as string) : "support";

  let ticketEmail = bodyEmail?.trim().toLowerCase() ?? "";
  let ticketName: string | null = name?.trim() ?? null;
  let userId: string | null = null;

  if (req.isAuthenticated()) {
    userId = req.user.id;
    const [u] = await db.select({ email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable).where(eq(usersTable.id, userId));
    if (u) {
      ticketEmail = u.email ?? ticketEmail;
      ticketName = ticketName || [u.firstName, u.lastName].filter(Boolean).join(" ") || null;
    }
  }

  if (!ticketEmail) { res.status(400).json({ error: "Email is required for guest submissions." }); return; }

  const [ticket] = await db.insert(supportTicketsTable).values({
    userId,
    email: ticketEmail,
    name: ticketName,
    subject: subject.trim(),
    message: message.trim(),
    category: cat,
    priority: prio,
    directedTo: dir,
  }).returning();

  sendSupportTicketNotification({ ...ticket }).catch(() => {});

  res.status(201).json({ ok: true, id: ticket.id });
});

/* ── GET /api/support/tickets — get authenticated user's own tickets ── */
router.get("/support/tickets", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Sign in required." }); return; }
  const tickets = await db.select().from(supportTicketsTable)
    .where(eq(supportTicketsTable.userId, req.user.id))
    .orderBy(desc(supportTicketsTable.createdAt))
    .limit(50);
  res.json({ tickets });
});

/* ── GET /api/admin/support — admin: all tickets ── */
router.get("/admin/support", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated() || !req.user.isAdmin) { res.status(403).json({ error: "Forbidden." }); return; }
  const { status, category } = req.query as { status?: string; category?: string };

  const conditions = [];
  if (status && VALID_STATUSES.has(status)) conditions.push(eq(supportTicketsTable.status, status));
  if (category && VALID_CATS.has(category)) conditions.push(eq(supportTicketsTable.category, category));

  const tickets = await db.select().from(supportTicketsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(supportTicketsTable.createdAt))
    .limit(200);

  res.json({ tickets });
});

/* ── PUT /api/admin/support/:id — admin: update ticket ── */
router.put("/admin/support/:id", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated() || !req.user.isAdmin) { res.status(403).json({ error: "Forbidden." }); return; }
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id." }); return; }

  const { status, adminResponse } = req.body as { status?: string; adminResponse?: string };

  const respondedByName = [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || req.user.email || "Admin";

  const patch: Partial<typeof supportTicketsTable.$inferInsert> = { updatedAt: new Date() };
  if (status && VALID_STATUSES.has(status)) patch.status = status;
  if (adminResponse !== undefined) {
    patch.adminResponse = adminResponse.trim() || null;
    if (adminResponse.trim()) patch.respondedBy = respondedByName;
  }

  const [updated] = await db.update(supportTicketsTable).set(patch)
    .where(eq(supportTicketsTable.id, id)).returning();

  if (!updated) { res.status(404).json({ error: "Ticket not found." }); return; }

  if (adminResponse?.trim() && updated.email) {
    sendSupportTicketReply(updated.email, {
      id: updated.id,
      subject: updated.subject,
      adminResponse: adminResponse.trim(),
      respondedBy: updated.respondedBy ?? "Zimsolve Support",
    }).catch(() => {});
  }

  res.json({ ok: true, ticket: updated });
});

/* ── GET /api/admin/premium-users — users with completed token purchases ── */
router.get("/admin/premium-users", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated() || !req.user.isAdmin) { res.status(403).json({ error: "Forbidden." }); return; }

  const result = await pool.query(`
    SELECT
      u.id, u.email, u.first_name, u.last_name, u.created_at, u.is_premium,
      COUNT(tp.id)::int AS total_purchases,
      COALESCE(SUM(tp.amount_usd_cents) FILTER (WHERE tp.status='completed'), 0)::int AS total_spent_cents,
      COALESCE(SUM(tp.tokens_amount) FILTER (WHERE tp.status='completed'), 0)::bigint AS total_tokens,
      MAX(tp.completed_at) AS last_purchase,
      STRING_AGG(DISTINCT tp.package_id, ', ') AS package_ids,
      tb.balance AS current_balance
    FROM users u
    INNER JOIN token_purchases tp ON tp.user_id = u.id AND tp.status = 'completed'
    LEFT JOIN token_balances tb ON tb.user_id = u.id
    GROUP BY u.id, u.email, u.first_name, u.last_name, u.created_at, u.is_premium, tb.balance
    ORDER BY total_spent_cents DESC
    LIMIT 100
  `);

  res.json({ users: result.rows });
});

export default router;
