import { pgTable, serial, varchar, integer, text, timestamp, boolean, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const quizPlayers = pgTable("quiz_players", {
  id: varchar("id").primaryKey(),
  displayName: varchar("display_name", { length: 50 }).notNull().default("Anonymous"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quizSessions = pgTable("quiz_sessions", {
  id: serial("id").primaryKey(),
  playerId: varchar("player_id").notNull().references(() => quizPlayers.id, { onDelete: "cascade" }),
  topic: varchar("topic", { length: 120 }).notNull().default("Mixed"),
  source: varchar("source", { length: 30 }).notNull().default("opentdb"),
  difficulty: varchar("difficulty", { length: 20 }).notNull().default("any"),
  totalQuestions: integer("total_questions").notNull(),
  correct: integer("correct").notNull(),
  scorePct: numeric("score_pct", { precision: 5, scale: 2 }).notNull(),
  passed: boolean("passed").notNull(),
  xpEarned: integer("xp_earned").notNull().default(0),
  isDailyChallenge: boolean("is_daily_challenge").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quizDailyChallenges = pgTable("quiz_daily_challenges", {
  id: serial("id").primaryKey(),
  challengeDate: date("challenge_date").notNull().unique(),
  topic: varchar("topic", { length: 120 }).notNull(),
  categoryId: varchar("category_id", { length: 50 }).notNull().default(""),
  source: varchar("source", { length: 30 }).notNull().default("opentdb"),
  difficulty: varchar("difficulty", { length: 20 }).notNull().default("medium"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuizPlayerSchema = createInsertSchema(quizPlayers);
export const insertQuizSessionSchema = createInsertSchema(quizSessions).omit({ id: true, completedAt: true });

export type QuizPlayer = typeof quizPlayers.$inferSelect;
export type InsertQuizPlayer = typeof quizPlayers.$inferInsert;
export type QuizSession = typeof quizSessions.$inferSelect;
export type InsertQuizSession = z.infer<typeof insertQuizSessionSchema>;
export type QuizDailyChallenge = typeof quizDailyChallenges.$inferSelect;
