import { Router, type IRouter } from "express";
import { db, computationsTable, tokenBalancesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { ComputeMathBody } from "@workspace/api-zod";
import { computeExpression, SUPPORTED_OPERATIONS, type Operation } from "../lib/mathEngine";

const router: IRouter = Router();

router.get("/math/operations", (_req, res): void => {
  res.json({ operations: SUPPORTED_OPERATIONS });
});

router.post("/math/compute", async (req, res): Promise<void> => {
  const parsed = ComputeMathBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { expression, operation, variable, limitPoint } = parsed.data;

  let computeResult;
  try {
    computeResult = computeExpression(
      expression,
      operation as Operation | undefined,
      variable ?? "x",
      limitPoint ?? 0,
    );
  } catch (err) {
    req.log.warn({ expression, operation }, "Math computation failed");
    res.status(422).json({ error: (err as Error).message });
    return;
  }

  let historyId: number | undefined;
  try {
    const [saved] = await db
      .insert(computationsTable)
      .values({
        userId: req.isAuthenticated() ? req.user.id : null,
        expression: computeResult.expression,
        operation: computeResult.operation,
        result: computeResult.result,
        steps: JSON.stringify(computeResult.steps),
        isNumeric: computeResult.isNumeric,
        numericValue: computeResult.numericValue ?? undefined,
      })
      .returning({ id: computationsTable.id });
    historyId = saved.id;
  } catch (err) {
    req.log.error({ err }, "Failed to save computation to history");
  }

  res.json({ ...computeResult, historyId: historyId ?? null });

  // Deduct tokens for signed-in users (fixed cost per computation)
  if (req.isAuthenticated()) {
    try {
      await db
        .update(tokenBalancesTable)
        .set({
          balance: sql`GREATEST(0, ${tokenBalancesTable.balance} - 50)`,
          totalUsed: sql`${tokenBalancesTable.totalUsed} + 50`,
        })
        .where(eq(tokenBalancesTable.userId, req.user.id));
    } catch (err) {
      req.log.error({ err }, "Failed to deduct tokens for math compute");
    }
  }
});

export default router;
