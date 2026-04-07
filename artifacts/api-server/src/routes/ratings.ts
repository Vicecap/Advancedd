import { Router, type IRouter } from "express";
import { db, ratingsTable, usersTable, sessionsTable, computationsTable, pageViewsTable, activityLog, tokenPurchasesTable, securityEventsTable } from "@workspace/db";
import { eq, desc, count, sql, and, gte, lt } from "drizzle-orm";

const router: IRouter = Router();

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

function isAdmin(user: { isAdmin?: boolean; email?: string | null } | undefined): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) return true;
  return false;
}

/* ── POST /ratings — submit or update a rating ── */
router.post("/ratings", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Must be signed in to rate" });
    return;
  }
  const { stars, review } = req.body as { stars?: number; review?: string };
  if (!stars || stars < 1 || stars > 5) {
    res.status(400).json({ error: "stars must be 1-5" });
    return;
  }
  await db
    .insert(ratingsTable)
    .values({ userId: req.user.id, stars, review: review?.trim() ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: ratingsTable.userId,
      set: { stars, review: review?.trim() ?? null, updatedAt: new Date() },
    });
  res.json({ ok: true });
});

/* ── GET /ratings/mine — get current user's rating ── */
router.get("/ratings/mine", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.json({ rating: null });
    return;
  }
  const [r] = await db.select().from(ratingsTable).where(eq(ratingsTable.userId, req.user.id));
  res.json({ rating: r ?? null });
});

/* ── GET /admin/stats — admin overview ── */
router.get("/admin/stats", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !isAdmin(req.user)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);

  const [{ totalUsers }] = await db
    .select({ totalUsers: count() })
    .from(usersTable);

  const [{ activeUsers }] = await db
    .select({ activeUsers: count() })
    .from(sessionsTable)
    .where(gte(sessionsTable.expire, now));

  const [{ recentUsers }] = await db
    .select({ recentUsers: count() })
    .from(usersTable)
    .where(gte(usersTable.createdAt, oneWeekAgo));

  const [{ totalRatings }] = await db
    .select({ totalRatings: count() })
    .from(ratingsTable);

  const [{ avgStars }] = await db
    .select({ avgStars: sql<number>`coalesce(avg(${ratingsTable.stars}), 0)` })
    .from(ratingsTable);

  const [{ totalComputations }] = await db
    .select({ totalComputations: count() })
    .from(computationsTable);

  res.json({
    totalUsers,
    activeUsers,
    recentSignups: recentUsers,
    currentlyOnline: activeUsers,
    totalRatings,
    avgStars: Number(Number(avgStars).toFixed(1)),
    totalComputations,
  });
});

/* ── GET /admin/ratings — all ratings ── */
router.get("/admin/ratings", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !isAdmin(req.user)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const ratings = await db
    .select({
      id: ratingsTable.id,
      stars: ratingsTable.stars,
      review: ratingsTable.review,
      createdAt: ratingsTable.createdAt,
      userId: ratingsTable.userId,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    })
    .from(ratingsTable)
    .leftJoin(usersTable, eq(ratingsTable.userId, usersTable.id))
    .orderBy(desc(ratingsTable.createdAt));

  res.json({ ratings });
});

/* ── POST /views/record — record a page view (public, rate-limited by design) ── */
router.post("/views/record", async (_req, res): Promise<void> => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await db.execute(
      sql`INSERT INTO page_views (day, count) VALUES (${today}, 1)
          ON CONFLICT (day) DO UPDATE SET count = page_views.count + 1`
    );
  } catch {}
  res.json({ ok: true });
});

/* ── GET /admin/analytics — time-bucketed analytics ── */
router.get("/admin/analytics", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !isAdmin(req.user)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const range = (req.query.range as string) ?? "7d";
  const now = new Date();

  const rangeMs: Record<string, number> = {
    "1d":  1 * 24 * 60 * 60 * 1000,
    "7d":  7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "60d": 60 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
    "180d":180 * 24 * 60 * 60 * 1000,
    "all": 0,
  };

  const ms = rangeMs[range] ?? rangeMs["7d"];
  const from = ms === 0 ? new Date(0) : new Date(now.getTime() - ms);

  // Determine bucket size
  const days = ms === 0 ? 9999 : ms / (24 * 60 * 60 * 1000);
  const bucketSql = days <= 1
    ? sql`date_trunc('hour', created_at)`
    : days <= 60
    ? sql`date_trunc('day', created_at)`
    : sql`date_trunc('week', created_at)`;

  const fromStr = from.toISOString().slice(0, 10);

  const [userRows, computationRows, viewRows] = await Promise.all([
    db.execute(
      sql`SELECT ${bucketSql} as bucket, count(*) as cnt FROM users WHERE created_at >= ${from} GROUP BY bucket ORDER BY bucket`
    ),
    db.execute(
      sql`SELECT ${bucketSql} as bucket, count(*) as cnt FROM computations WHERE created_at >= ${from} GROUP BY bucket ORDER BY bucket`
    ),
    db.execute(
      sql`SELECT day as bucket, count as cnt FROM page_views WHERE day >= ${fromStr} ORDER BY day`
    ).catch(() => ({ rows: [] })),
  ]);

  res.json({
    users: userRows.rows,
    computations: computationRows.rows,
    views: viewRows.rows,
    from: from.toISOString(),
    range,
  });
});

/* ── GET /admin/users — user list ── */
router.get("/admin/users", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !isAdmin(req.user)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      authProvider: usersTable.authProvider,
      isAdmin: usersTable.isAdmin,
      isPremium: usersTable.isPremium,
      emailVerified: usersTable.emailVerified,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt))
    .limit(200);

  res.json({ users });
});

/* ── GET /admin/activity — recent activity log (admin only) ── */
router.get("/admin/activity", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !isAdmin(req.user)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const limit = Math.min(200, Number(req.query.limit) || 100);
  const rows = await db
    .select({
      id: activityLog.id,
      type: activityLog.type,
      description: activityLog.description,
      xpEarned: activityLog.xpEarned,
      tokensUsed: activityLog.tokensUsed,
      createdAt: activityLog.createdAt,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    })
    .from(activityLog)
    .leftJoin(usersTable, eq(activityLog.userId, usersTable.id))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
  res.json({ activities: rows });
});

/* ── GET /admin/token-stats — aggregate token usage stats (admin only) ── */
router.get("/admin/token-stats", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !isAdmin(req.user)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  // Total XP and activity counts by type
  const byType = await db.execute(
    sql`SELECT type, COUNT(*) as count, COALESCE(SUM(xp_earned), 0) as total_xp
        FROM activity_log GROUP BY type ORDER BY count DESC`
  );

  // Top users by XP earned from activities
  const topUsers = await db.execute(
    sql`SELECT u.email, u.first_name, u.last_name,
               COUNT(a.id) as activity_count,
               COALESCE(SUM(a.xp_earned), 0) as total_xp,
               COALESCE(SUM(a.tokens_used), 0) as total_tokens
        FROM activity_log a
        LEFT JOIN users u ON u.id = a.user_id
        GROUP BY u.email, u.first_name, u.last_name
        ORDER BY total_xp DESC LIMIT 20`
  );

  // Daily activity for last 14 days
  const daily = await db.execute(
    sql`SELECT DATE(created_at) as day, COUNT(*) as count,
               COALESCE(SUM(xp_earned), 0) as xp
        FROM activity_log
        WHERE created_at >= NOW() - INTERVAL '14 days'
        GROUP BY day ORDER BY day DESC`
  );

  // Overall totals
  const [totals] = await db.execute(
    sql`SELECT COUNT(*) as total_activities,
               COALESCE(SUM(xp_earned), 0) as total_xp,
               COALESCE(SUM(tokens_used), 0) as total_tokens
        FROM activity_log`
  );

  // Most played games (from activity_log where type = 'game_played')
  const games = await db.execute(
    sql`SELECT description, COUNT(*) as play_count
        FROM activity_log
        WHERE type = 'game_played'
        GROUP BY description
        ORDER BY play_count DESC
        LIMIT 20`
  );

  res.json({ byType: byType.rows, topUsers: topUsers.rows, daily: daily.rows, totals, games: games.rows });
});

/* ── GET /admin/billing-stats — purchase revenue + stats ─────────────────── */
router.get("/admin/billing-stats", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !isAdmin(req.user)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [totals] = await db.execute(
    sql`SELECT COUNT(*) as total_purchases,
               COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
               COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
               COALESCE(SUM(amount_usd_cents) FILTER (WHERE status = 'completed'), 0) as total_revenue_cents,
               COALESCE(SUM(tokens_amount) FILTER (WHERE status = 'completed'), 0) as total_tokens_sold
        FROM token_purchases`
  );

  const recent = await db.execute(
    sql`SELECT tp.*, u.email, u.first_name, u.last_name
        FROM token_purchases tp
        LEFT JOIN users u ON u.id = tp.user_id
        ORDER BY tp.created_at DESC LIMIT 50`
  );

  const byPackage = await db.execute(
    sql`SELECT package_id, COUNT(*) as count,
               COALESCE(SUM(amount_usd_cents), 0) as revenue_cents,
               COALESCE(SUM(tokens_amount), 0) as tokens_sold
        FROM token_purchases
        WHERE status = 'completed'
        GROUP BY package_id ORDER BY revenue_cents DESC`
  );

  const daily = await db.execute(
    sql`SELECT DATE(created_at) as day,
               COUNT(*) as count,
               COALESCE(SUM(amount_usd_cents) FILTER (WHERE status = 'completed'), 0) as revenue_cents
        FROM token_purchases
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day DESC`
  );

  const topBuyers = await db.execute(
    sql`SELECT u.email, u.first_name, u.last_name,
               COUNT(tp.id) as purchase_count,
               COALESCE(SUM(tp.amount_usd_cents), 0) as total_spent_cents,
               COALESCE(SUM(tp.tokens_amount), 0) as total_tokens
        FROM token_purchases tp
        LEFT JOIN users u ON u.id = tp.user_id
        WHERE tp.status = 'completed'
        GROUP BY u.email, u.first_name, u.last_name
        ORDER BY total_spent_cents DESC LIMIT 20`
  );

  res.json({
    totals: totals.rows[0],
    recent: recent.rows,
    byPackage: byPackage.rows,
    daily: daily.rows,
    topBuyers: topBuyers.rows,
  });
});

/* ── GET /admin/security-events — security event log ─────────────────────── */
router.get("/admin/security-events", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !isAdmin(req.user)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const events = await db.execute(
    sql`SELECT se.*, u.email as user_email, u.first_name, u.last_name
        FROM security_events se
        LEFT JOIN users u ON u.id = se.user_id
        ORDER BY se.created_at DESC LIMIT 200`
  );

  const summary = await db.execute(
    sql`SELECT type, severity, COUNT(*) as count
        FROM security_events
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY type, severity ORDER BY count DESC`
  );

  res.json({ events: events.rows, summary: summary.rows });
});

/* ── POST /admin/security-events/:id/block — mark event as blocked ──────── */
router.post("/admin/security-events/:id/block", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !isAdmin(req.user)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.update(securityEventsTable).set({ isBlocked: true }).where(eq(securityEventsTable.id, id));
  res.json({ ok: true });
});

export default router;
