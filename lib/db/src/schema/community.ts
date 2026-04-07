import { pgTable, serial, text, boolean, integer, varchar, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const communityPostsTable = pgTable("community_posts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull().default("question"),
  isPinned: boolean("is_pinned").notNull().default(false),
  isLocked: boolean("is_locked").notNull().default(false),
  isSolved: boolean("is_solved").notNull().default(false),
  likeCount: integer("like_count").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("community_posts_user_idx").on(t.userId),
  index("community_posts_category_idx").on(t.category),
  index("community_posts_created_idx").on(t.createdAt),
]);

export const communityCommentsTable = pgTable("community_comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => communityPostsTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 255 }).notNull(),
  content: text("content").notNull(),
  isMarkedAnswer: boolean("is_marked_answer").notNull().default(false),
  likeCount: integer("like_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("community_comments_post_idx").on(t.postId),
  index("community_comments_user_idx").on(t.userId),
]);

export const communityLikesTable = pgTable("community_likes", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  unique("community_likes_unique").on(t.userId, t.targetType, t.targetId),
]);

export const insertCommunityPostSchema = createInsertSchema(communityPostsTable).omit({ id: true, likeCount: true, commentCount: true, createdAt: true, updatedAt: true });
export const insertCommunityCommentSchema = createInsertSchema(communityCommentsTable).omit({ id: true, likeCount: true, createdAt: true });
export type CommunityPost = typeof communityPostsTable.$inferSelect;
export type CommunityComment = typeof communityCommentsTable.$inferSelect;
export type CommunityLike = typeof communityLikesTable.$inferSelect;
