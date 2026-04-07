import { pgTable, serial, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const clientErrorLogsTable = pgTable("client_error_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  email: varchar("email"),
  message: text("message").notNull(),
  stack: text("stack"),
  url: varchar("url", { length: 1024 }),
  component: varchar("component", { length: 256 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ClientErrorLog = typeof clientErrorLogsTable.$inferSelect;
