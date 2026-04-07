import { pgTable, serial, text, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const supportTicketsTable = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  email: varchar("email", { length: 255 }).notNull(),
  name: varchar("name", { length: 128 }),
  subject: varchar("subject", { length: 255 }).notNull(),
  message: text("message").notNull(),
  category: varchar("category", { length: 32 }).notNull().default("general"),
  priority: varchar("priority", { length: 16 }).notNull().default("medium"),
  directedTo: varchar("directed_to", { length: 32 }).notNull().default("support"),
  status: varchar("status", { length: 32 }).notNull().default("open"),
  adminResponse: text("admin_response"),
  respondedBy: varchar("responded_by", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("support_tickets_user_idx").on(t.userId),
  index("support_tickets_status_idx").on(t.status),
  index("support_tickets_created_idx").on(t.createdAt),
]);

export type SupportTicket = typeof supportTicketsTable.$inferSelect;
