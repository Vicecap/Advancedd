import { pgTable, serial, varchar, text, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const activityLog = pgTable("activity_log", {
  id:           serial("id").primaryKey(),
  userId:       varchar("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  type:         varchar("type", { length: 50 }).notNull(),
  description:  text("description").notNull(),
  xpEarned:     integer("xp_earned").default(0).notNull(),
  tokensUsed:   integer("tokens_used").default(0).notNull(),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
});

export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type InsertActivityLog = typeof activityLog.$inferInsert;
