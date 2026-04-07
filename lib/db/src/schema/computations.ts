import { pgTable, serial, text, boolean, real, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const computationsTable = pgTable("computations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  expression: text("expression").notNull(),
  operation: text("operation").notNull(),
  result: text("result").notNull(),
  steps: text("steps").notNull(),
  isNumeric: boolean("is_numeric").notNull().default(false),
  numericValue: real("numeric_value"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertComputationSchema = createInsertSchema(computationsTable).omit({ id: true, createdAt: true });
export type InsertComputation = z.infer<typeof insertComputationSchema>;
export type Computation = typeof computationsTable.$inferSelect;
