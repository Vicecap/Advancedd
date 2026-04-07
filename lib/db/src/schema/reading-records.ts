import { pgTable, serial, varchar, integer, boolean, timestamp, text } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const userReadingRecordsTable = pgTable("user_reading_records", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  resourceType: varchar("resource_type", { length: 32 }).notNull(),
  resourceId: integer("resource_id").notNull(),
  title: text("title").notNull(),
  author: varchar("author", { length: 256 }),
  subject: varchar("subject", { length: 128 }),
  finished: boolean("finished").notNull().default(false),
  xpAwarded: integer("xp_awarded").notNull().default(0),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export type UserReadingRecord = typeof userReadingRecordsTable.$inferSelect;
export type InsertUserReadingRecord = typeof userReadingRecordsTable.$inferInsert;
