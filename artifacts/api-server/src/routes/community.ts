import { Router, type Request, type Response } from "express";
import { db, communityPostsTable, communityCommentsTable, communityLikesTable, usersTable } from "@workspace/db";
import { eq, and, desc, asc, ilike, or, sql, count, inArray } from "drizzle-orm";

const router = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || !req.user?.id) {
    res.status(401).json({ error: "Sign in to participate in the community." });
    return false;
  }
  return true;
}

function isAdmin(req: Request): boolean {
  if (!req.isAuthenticated() || !req.user) return false;
  return req.user.isAdmin === true;
}

const VALID_CATEGORIES = ["question", "discussion", "announcement", "tip"];
const VALID_SORTS = ["latest", "popular", "unanswered"];
const PAGE_SIZE = 20;

async function enrichPosts(posts: typeof communityPostsTable.$inferSelect[]) {
  if (posts.length === 0) return [];
  const userIds = [...new Set(posts.map(p => p.userId))];
  const users = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  return posts.map(p => ({ ...p, author: userMap[p.userId] ?? null }));
}

async function enrichComments(comments: typeof communityCommentsTable.$inferSelect[]) {
  if (comments.length === 0) return [];
  const userIds = [...new Set(comments.map(c => c.userId))];
  const users = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  return comments.map(c => ({ ...c, author: userMap[c.userId] ?? null }));
}

/* ── GET /community/posts ────────────────────────────────────────────────── */
router.get("/community/posts", async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, sort = "latest", page = "1", search } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const offset = (pageNum - 1) * PAGE_SIZE;

    let query = db.select().from(communityPostsTable);

    const conditions = [];
    if (category && category !== "all" && VALID_CATEGORIES.includes(category)) {
      conditions.push(eq(communityPostsTable.category, category));
    }
    if (sort === "unanswered") {
      conditions.push(eq(communityPostsTable.isSolved, false));
      conditions.push(eq(communityPostsTable.commentCount, 0));
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(or(ilike(communityPostsTable.title, term), ilike(communityPostsTable.content, term))!);
    }
    if (conditions.length) {
      query = query.where(and(...conditions)) as typeof query;
    }

    if (sort === "popular") {
      query = query.orderBy(desc(communityPostsTable.isPinned), desc(communityPostsTable.likeCount), desc(communityPostsTable.createdAt)) as typeof query;
    } else {
      query = query.orderBy(desc(communityPostsTable.isPinned), desc(communityPostsTable.createdAt)) as typeof query;
    }

    const posts = await (query as unknown as ReturnType<typeof db.select>).limit(PAGE_SIZE).offset(offset);
    const enriched = await enrichPosts(posts as typeof communityPostsTable.$inferSelect[]);
    const [{ total }] = await db.select({ total: count() }).from(communityPostsTable);

    res.json({ posts: enriched, total, page: pageNum, pageSize: PAGE_SIZE });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

/* ── POST /community/posts ───────────────────────────────────────────────── */
router.post("/community/posts", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const { title, content, category = "question" } = req.body as { title: string; content: string; category?: string };
    if (!title?.trim() || !content?.trim()) { res.status(400).json({ error: "Title and content are required." }); return; }
    if (title.trim().length > 200) { res.status(400).json({ error: "Title must be 200 characters or less." }); return; }
    if (content.trim().length > 10000) { res.status(400).json({ error: "Content must be 10,000 characters or less." }); return; }

    const cat = VALID_CATEGORIES.includes(category) ? category : "question";
    if (cat === "announcement" && !isAdmin(req)) { res.status(403).json({ error: "Only admins can post announcements." }); return; }

    const [post] = await db.insert(communityPostsTable).values({
      userId: req.user!.id,
      title: title.trim(),
      content: content.trim(),
      category: cat,
      isPinned: cat === "announcement",
    }).returning();

    res.json({ ok: true, post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create post" });
  }
});

/* ── GET /community/posts/:id ────────────────────────────────────────────── */
router.get("/community/posts/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const [post] = await db.select().from(communityPostsTable).where(eq(communityPostsTable.id, id));
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }

    const comments = await db.select().from(communityCommentsTable)
      .where(eq(communityCommentsTable.postId, id))
      .orderBy(desc(communityCommentsTable.isMarkedAnswer), asc(communityCommentsTable.createdAt));

    const [enrichedPost] = await enrichPosts([post]);
    const enrichedComments = await enrichComments(comments);

    let userLikes: number[] = [];
    if (req.isAuthenticated() && req.user?.id) {
      const likes = await db.select().from(communityLikesTable)
        .where(and(eq(communityLikesTable.userId, req.user.id), eq(communityLikesTable.targetType, "post")));
      userLikes = likes.map(l => l.targetId);
    }

    res.json({ post: enrichedPost, comments: enrichedComments, userLikes });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch post" });
  }
});

/* ── DELETE /community/posts/:id ─────────────────────────────────────────── */
router.delete("/community/posts/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const [post] = await db.select().from(communityPostsTable).where(eq(communityPostsTable.id, id));
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    if (post.userId !== req.user!.id && !isAdmin(req)) { res.status(403).json({ error: "Not authorized" }); return; }
    await db.delete(communityPostsTable).where(eq(communityPostsTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete post" });
  }
});

/* ── POST /community/posts/:id/like ──────────────────────────────────────── */
router.post("/community/posts/:id/like", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const userId = req.user!.id;

    const [existing] = await db.select().from(communityLikesTable)
      .where(and(eq(communityLikesTable.userId, userId), eq(communityLikesTable.targetType, "post"), eq(communityLikesTable.targetId, id)));

    if (existing) {
      await db.delete(communityLikesTable).where(eq(communityLikesTable.id, existing.id));
      await db.update(communityPostsTable).set({ likeCount: sql`${communityPostsTable.likeCount} - 1` }).where(eq(communityPostsTable.id, id));
      res.json({ liked: false });
    } else {
      await db.insert(communityLikesTable).values({ userId, targetType: "post", targetId: id });
      await db.update(communityPostsTable).set({ likeCount: sql`${communityPostsTable.likeCount} + 1` }).where(eq(communityPostsTable.id, id));
      res.json({ liked: true });
    }
  } catch {
    res.status(500).json({ error: "Failed to toggle like" });
  }
});

/* ── POST /community/posts/:id/solve ─────────────────────────────────────── */
router.post("/community/posts/:id/solve", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const [post] = await db.select().from(communityPostsTable).where(eq(communityPostsTable.id, id));
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    if (post.userId !== req.user!.id && !isAdmin(req)) { res.status(403).json({ error: "Not authorized" }); return; }
    const newVal = !post.isSolved;
    await db.update(communityPostsTable).set({ isSolved: newVal }).where(eq(communityPostsTable.id, id));
    res.json({ solved: newVal });
  } catch {
    res.status(500).json({ error: "Failed to toggle solved" });
  }
});

/* ── PATCH /community/posts/:id/pin ──────────────────────────────────────── */
router.patch("/community/posts/:id/pin", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    const id = parseInt(req.params.id, 10);
    const [post] = await db.select().from(communityPostsTable).where(eq(communityPostsTable.id, id));
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    const newVal = !post.isPinned;
    await db.update(communityPostsTable).set({ isPinned: newVal }).where(eq(communityPostsTable.id, id));
    res.json({ pinned: newVal });
  } catch {
    res.status(500).json({ error: "Failed to toggle pin" });
  }
});

/* ── PATCH /community/posts/:id/lock ─────────────────────────────────────── */
router.patch("/community/posts/:id/lock", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  try {
    const id = parseInt(req.params.id, 10);
    const [post] = await db.select().from(communityPostsTable).where(eq(communityPostsTable.id, id));
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    const newVal = !post.isLocked;
    await db.update(communityPostsTable).set({ isLocked: newVal }).where(eq(communityPostsTable.id, id));
    res.json({ locked: newVal });
  } catch {
    res.status(500).json({ error: "Failed to toggle lock" });
  }
});

/* ── POST /community/posts/:id/comments ──────────────────────────────────── */
router.post("/community/posts/:id/comments", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const postId = parseInt(req.params.id, 10);
    const { content } = req.body as { content: string };
    if (!content?.trim()) { res.status(400).json({ error: "Comment cannot be empty." }); return; }
    if (content.trim().length > 5000) { res.status(400).json({ error: "Comment must be 5,000 characters or less." }); return; }

    const [post] = await db.select().from(communityPostsTable).where(eq(communityPostsTable.id, postId));
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    if (post.isLocked && !isAdmin(req)) { res.status(403).json({ error: "This post is locked." }); return; }

    const [comment] = await db.insert(communityCommentsTable).values({
      postId, userId: req.user!.id, content: content.trim(),
    }).returning();

    await db.update(communityPostsTable)
      .set({ commentCount: sql`${communityPostsTable.commentCount} + 1`, updatedAt: new Date() })
      .where(eq(communityPostsTable.id, postId));

    const [enriched] = await enrichComments([comment]);
    res.json({ ok: true, comment: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to post comment" });
  }
});

/* ── DELETE /community/comments/:id ──────────────────────────────────────── */
router.delete("/community/comments/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const [comment] = await db.select().from(communityCommentsTable).where(eq(communityCommentsTable.id, id));
    if (!comment) { res.status(404).json({ error: "Comment not found" }); return; }
    if (comment.userId !== req.user!.id && !isAdmin(req)) { res.status(403).json({ error: "Not authorized" }); return; }

    await db.delete(communityCommentsTable).where(eq(communityCommentsTable.id, id));
    await db.update(communityPostsTable)
      .set({ commentCount: sql`GREATEST(${communityPostsTable.commentCount} - 1, 0)` })
      .where(eq(communityPostsTable.id, comment.postId));

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete comment" });
  }
});

/* ── POST /community/comments/:id/like ───────────────────────────────────── */
router.post("/community/comments/:id/like", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const userId = req.user!.id;

    const [existing] = await db.select().from(communityLikesTable)
      .where(and(eq(communityLikesTable.userId, userId), eq(communityLikesTable.targetType, "comment"), eq(communityLikesTable.targetId, id)));

    if (existing) {
      await db.delete(communityLikesTable).where(eq(communityLikesTable.id, existing.id));
      await db.update(communityCommentsTable).set({ likeCount: sql`${communityCommentsTable.likeCount} - 1` }).where(eq(communityCommentsTable.id, id));
      res.json({ liked: false });
    } else {
      await db.insert(communityLikesTable).values({ userId, targetType: "comment", targetId: id });
      await db.update(communityCommentsTable).set({ likeCount: sql`${communityCommentsTable.likeCount} + 1` }).where(eq(communityCommentsTable.id, id));
      res.json({ liked: true });
    }
  } catch {
    res.status(500).json({ error: "Failed to toggle like" });
  }
});

/* ── POST /community/comments/:id/answer ─────────────────────────────────── */
router.post("/community/comments/:id/answer", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    const [comment] = await db.select().from(communityCommentsTable).where(eq(communityCommentsTable.id, id));
    if (!comment) { res.status(404).json({ error: "Comment not found" }); return; }

    const [post] = await db.select().from(communityPostsTable).where(eq(communityPostsTable.id, comment.postId));
    if (post.userId !== req.user!.id && !isAdmin(req)) { res.status(403).json({ error: "Only the post author can mark answers." }); return; }

    const newVal = !comment.isMarkedAnswer;
    await db.update(communityCommentsTable).set({ isMarkedAnswer: newVal }).where(eq(communityCommentsTable.id, id));
    if (newVal) {
      await db.update(communityPostsTable).set({ isSolved: true }).where(eq(communityPostsTable.id, comment.postId));
    }
    res.json({ marked: newVal });
  } catch {
    res.status(500).json({ error: "Failed to mark answer" });
  }
});

export default router;
