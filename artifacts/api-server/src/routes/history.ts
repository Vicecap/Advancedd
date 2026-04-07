import { Router, type IRouter } from "express";
import { db, computationsTable } from "@workspace/db";
import { desc, eq, and, count, isNull } from "drizzle-orm";
import { ListHistoryQueryParams, GetHistoryEntryParams, DeleteHistoryEntryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/history", async (req, res): Promise<void> => {
  const parsed = ListHistoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit = 20, operation } = parsed.data;
  const userId = req.isAuthenticated() ? req.user.id : null;

  const userFilter = userId
    ? eq(computationsTable.userId, userId)
    : isNull(computationsTable.userId);

  const opFilter = operation ? eq(computationsTable.operation, operation) : undefined;
  const where = opFilter ? and(userFilter, opFilter) : userFilter;

  const entries = await db
    .select()
    .from(computationsTable)
    .where(where)
    .orderBy(desc(computationsTable.createdAt))
    .limit(limit);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(computationsTable)
    .where(userFilter);

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.json({ entries, total });
});

router.delete("/history", async (req, res): Promise<void> => {
  if (req.isAuthenticated()) {
    await db
      .delete(computationsTable)
      .where(eq(computationsTable.userId, req.user.id));
  } else {
    await db
      .delete(computationsTable)
      .where(isNull(computationsTable.userId));
  }
  res.sendStatus(204);
});

router.get("/history/:id", async (req, res): Promise<void> => {
  const parsed = GetHistoryEntryParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [entry] = await db
    .select()
    .from(computationsTable)
    .where(eq(computationsTable.id, parsed.data.id));

  if (!entry) {
    res.status(404).json({ error: "History entry not found" });
    return;
  }

  const userId = req.isAuthenticated() ? req.user.id : null;
  if (entry.userId !== userId) {
    res.status(404).json({ error: "History entry not found" });
    return;
  }

  res.json(entry);
});

router.delete("/history/:id", async (req, res): Promise<void> => {
  const parsed = DeleteHistoryEntryParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.isAuthenticated() ? req.user.id : null;
  const [deleted] = await db
    .delete(computationsTable)
    .where(and(
      eq(computationsTable.id, parsed.data.id),
      userId ? eq(computationsTable.userId, userId) : isNull(computationsTable.userId),
    ))
    .returning({ id: computationsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "History entry not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
