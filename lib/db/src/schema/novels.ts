import { pgTable, serial, varchar, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const novelsTable = pgTable("novels", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 512 }).notNull(),
  author: varchar("author", { length: 256 }).notNull().default("Unknown"),
  genre: varchar("genre", { length: 128 }).notNull().default("Fiction"),
  description: text("description"),
  rawUrl: varchar("raw_url", { length: 2048 }).notNull(),
  fileSizeKb: integer("file_size_kb"),
  featured: boolean("featured").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Novel = typeof novelsTable.$inferSelect;
export type InsertNovel = typeof novelsTable.$inferInsert;
