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
  paymentMethod: varchar("payment_method"),
  manualReference: varchar("manual_reference").unique(),
  userPaymentReference: varchar("user_payment_reference"),
  proofSubmittedAt: timestamp("proof_submitted_at", { withTimezone: true }),
  adminNote: varchar("admin_note", { length: 1000 }),
  approvedBy: varchar("approved_by"),
  provider: varchar("provider"),
  providerOrderId: varchar("provider_order_id").unique(),
  currency: varchar("currency", { length: 8 }),
  senderPhone: varchar("sender_phone", { length: 32 }),
  providerMetadata: jsonb("provider_metadata"),
  creditedAt: timestamp("credited_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
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
