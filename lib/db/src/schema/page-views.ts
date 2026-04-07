import { pgTable, serial, date, integer } from "drizzle-orm/pg-core";

export const pageViewsTable = pgTable("page_views", {
  id: serial("id").primaryKey(),
  day: date("day").notNull().unique(),
  count: integer("count").notNull().default(1),
});

export type PageView = typeof pageViewsTable.$inferSelect;
