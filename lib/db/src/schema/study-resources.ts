import { pgTable, serial, varchar, integer, timestamp, text } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const studyResourcesTable = pgTable("study_resources", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  board: varchar("board", { length: 20 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  subject: varchar("subject", { length: 100 }).notNull(),
  year: integer("year"),
  level: varchar("level", { length: 20 }).default("o-level"),
  objectPath: varchar("object_path", { length: 500 }),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  description: text("description"),
  externalUrl: varchar("external_url", { length: 2048 }),
  uploadedBy: varchar("uploaded_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type StudyResource = typeof studyResourcesTable.$inferSelect;
export type InsertStudyResource = typeof studyResourcesTable.$inferInsert;
