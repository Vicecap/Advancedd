import { pgTable, serial, text, integer, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const ratingsTable = pgTable("ratings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  stars: integer("stars").notNull(),
  review: text("review"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Rating = typeof ratingsTable.$inferSelect;
