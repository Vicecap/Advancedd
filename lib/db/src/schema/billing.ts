import { bigint, boolean, integer, jsonb, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const tokenPurchasesTable = pgTable("token_purchases", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  packageId: varchar("package_id").notNull(),
  tokensAmount: bigint("tokens_amount", { mode: "number" }).notNull(),
  amountUsdCents: integer("amount_usd_cents").notNull(),
  paypalOrderId: varchar("paypal_order_id").unique(),
  paypalTransactionId: varchar("paypal_transaction_id"),
  paypalPayerEmail: varchar("paypal_payer_email"),
  status: varchar("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const securityEventsTable = pgTable("security_events", {
  id: serial("id").primaryKey(),
  type: varchar("type").notNull(),
  severity: varchar("severity").notNull().default("medium"),
  userId: varchar("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent", { length: 512 }),
  email: varchar("email"),
  description: varchar("description", { length: 1000 }),
  metadata: jsonb("metadata"),
  isBlocked: boolean("is_blocked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TokenPurchase = typeof tokenPurchasesTable.$inferSelect;
export type SecurityEvent = typeof securityEventsTable.$inferSelect;
