import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgTable, timestamp, varchar, text } from "drizzle-orm/pg-core";

export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const usersTable = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  passwordHash: varchar("password_hash"),
  googleId: varchar("google_id").unique(),
  authProvider: varchar("auth_provider").notNull().default("email"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isPremium: boolean("is_premium").notNull().default(false),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerifyHash: varchar("verification_code"),
  emailVerifyHashExpiry: timestamp("verification_code_expiry", { withTimezone: true }),
  verificationResendCount: integer("verification_resend_count").notNull().default(0),
  verificationResendLastAt: timestamp("verification_resend_last_at", { withTimezone: true }),
  passwordResetHash: varchar("reset_code"),
  passwordResetHashExpiry: timestamp("reset_code_expiry", { withTimezone: true }),
  referralCode: varchar("referral_code").unique(),
  referredBy: varchar("referred_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const tokenBalancesTable = pgTable("token_balances", {
  userId: varchar("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  balance: bigint("balance", { mode: "number" }).notNull().default(60_000),
  totalUsed: bigint("total_used", { mode: "number" }).notNull().default(0),
  lastRefillAt: timestamp("last_refill_at", { withTimezone: true }).notNull().defaultNow(),
  xp: bigint("xp", { mode: "number" }).notNull().default(0),
  xpTotal: bigint("xp_total", { mode: "number" }).notNull().default(0),
});

export const userStreaksTable = pgTable("user_streaks", {
  userId: varchar("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  currentStreak: integer("current_streak").notNull().default(0),
  bestStreak: integer("best_streak").notNull().default(0),
  lastActiveDate: text("last_active_date"),
  claimedMilestones: jsonb("claimed_milestones").$type<number[]>().notNull().default(sql`'[]'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const anonymousTokensTable = pgTable("anonymous_tokens", {
  deviceId: varchar("device_id").primaryKey(),
  balance: bigint("balance", { mode: "number" }).notNull().default(20_000),
  lastRefillAt: timestamp("last_refill_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
export type TokenBalance = typeof tokenBalancesTable.$inferSelect;
export type UserStreak = typeof userStreaksTable.$inferSelect;
export type AnonymousToken = typeof anonymousTokensTable.$inferSelect;
