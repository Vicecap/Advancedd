# AI Math Solver Dashboard — ZIMSEC/Cambridge O-Level

## Overview

Full-stack AI Math Solver built as a pnpm monorepo for ZIMSEC and Cambridge O-Level students in Zimbabwe. Node.js/Express API backend (port 8080) + React+Vite frontend dashboard (port 23183) with 20+ tabs. Features Google OAuth, per-user AI token management (600K/week cap), computation history, 400+ ZIMSEC study resources, 20,000+ external PDF study materials, 8 puzzle games, Newton Mathematics API integration, AI tutoring powered by OpenRouter (Qwen, GPT, Mistral, Gemini) + free local models via proxy at `http://63.142.251.202:4002`, and a PayPal billing system for extra token purchases.

**Token system**: 600K tokens/week. 10K per AI request, 1K per PDF open. Streak milestones award bonus tokens. Free tier available via `/api/free-ai/*` proxy — no deduction.

**Free AI proxy** (`artifacts/api-server/src/routes/free-ai.ts`): Proxies `/ais`, `/discuss`, `/solve`, `/solve-stream`, `/ai-stream`, `/upload-image` from `http://63.142.251.202:4002`. No tokens charged. Handles both string and object model lists from upstream. Real free models: `llama3.2:3b`, `qwen2.5:latest`, `qwen2.5:7b`.

**Unauthenticated model restriction**: Unauthenticated users only see `qwen/qwen3.5-9b` as premium model across ALL AI tabs (solver-tab, chat-tab, homework-tab, external-solver-tab). Free models (Qwen 2.5, Llama 3.2) are always available to everyone.

**Premium AI locked when 600K depleted**: Authenticated users with 0 tokens cannot use premium AI models in any tab — premium options are disabled/hidden; only free models remain accessible. TokenDepletedModal is shown; users must purchase tokens to continue.

**Guest token tracking**: 100K tokens/week for unauthenticated users. Device UUID stored in `localStorage` as `device_id`. Synced server-side in `anonymous_tokens` DB table (keyed by `device_id`). When depleted, a "Sign up to continue" popup appears automatically.

**PDF lock for unauthenticated users**: All PDF viewers (resources-tab, study-hall-tab, notes-tab, novels-tab, syllabus-tab, moodle-tab) dispatch a `open-auth-modal` custom event with `{ reason: "pdf" }` when !isAuthenticated. Layout.tsx listens for this event and shows the GuestSignUpPopup with the "Sign in to read PDFs" message.

**GuestSignUpPopup**: New component at `artifacts/dashboard/src/components/guest-signup-popup.tsx`. Shows for 3 reasons: `tokens` (guest tokens depleted), `pdf` (PDF access blocked), `feature` (general feature access). Layout.tsx handles it globally via event listener + guestDepleted watcher.

**Password reset**: Full forgot/reset password flow implemented. Backend routes: `POST /api/auth/forgot-password` (generates reset code, stores in `resetCode`/`resetCodeExpiry` on users table), `POST /api/auth/reset-password` (validates code, hashes new password). DB schema has `reset_code` and `reset_code_expiry` columns. Auth modal has "Forgot password?" link on login screen.

**Free AI in components**: All AI model selectors (solver-tab, homework-tab, chat-tab, external-solver-tab, profile-panel history "Ask AI") include grouped Free/Premium sections. Free model streams routed to `/api/free-ai/solve-stream` or `/api/free-ai/discuss` endpoints.

**Share button**: AI result card in solver-tab has a Share button (uses Web Share API or clipboard fallback).

**Admin community tab**: Admin dashboard has a "Community" tab for posting announcements (auto-pinned), pin/unpin posts, and deleting posts via community API.

---

## Auth System Note

The app uses a **custom session system** (NOT Passport.js). Auth middleware is in `artifacts/api-server/src/middlewares/authMiddleware.ts`. It reads a session cookie, looks up the session in the `sessions` DB table, and sets `req.user`. The custom middleware also defines `req.isAuthenticated()` as `return this.user != null`. Community routes and all other protected routes must use `req.isAuthenticated()` and `req.user.id` (NOT `req.session.userId` — that property does not exist).

---

## Critical Do-Not-Touch Items

- `artifacts/api-server/src/routes/external.ts` and `artifacts/api-server/src/seed.ts` — never modify
- `EXT_BASE = "http://63.142.251.202:5080"` — external API base, hardcoded in external.ts
- `AI_INTEGRATIONS_OPENROUTER_BASE_URL`, `AI_INTEGRATIONS_OPENROUTER_API_KEY` — managed by Replit integrations, never touch
- `ADMIN_INIT_TOKEN = "zimsolve-admin-2026"` — used for initial admin account setup

---

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **API**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (`lib/db`)
- **Auth**: Google OAuth (Passport.js), session-based with `express-session`
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **Build**: esbuild (ESM bundle for API), Vite (frontend)
- **Math engine**: mathjs (symbolic + numeric computation)
- **AI**: OpenRouter via Replit AI Integration — `qwen/qwen3.5-9b`, `qwen/qwen3.5-27b`, `qwen/qwen3.5-122b-a10b`, `mistralai/mistral-small-2603`, `openai/gpt-5.4-mini`
- **OCR**: tesseract.js
- **Frontend UI**: React + Vite + Tailwind CSS + framer-motion + recharts
- **Rate limiting**: express-rate-limit (60 req/min per IP) + optional Redis sliding window (20 req/min AI endpoints)
- **Redis**: ioredis with graceful no-op fallback (disabled if REDIS_URL not set)
- **WebSocket**: ws on port 8080 (shared with HTTP), userId→socket mapping, 30s ping heartbeat

---

## Monorepo Structure

```
artifacts/
├── api-server/          # Express API (port 8080)
│   └── src/
│       ├── index.ts     # Entry — http.createServer(app), graceful shutdown
│       ├── routes/
│       │   ├── auth.ts       # Google OAuth, /api/auth/*
│       │   ├── ai.ts         # /api/solve-stream (SSE), /api/discuss, /api/homework
│       │   ├── activity.ts   # /api/activity (POST log + GET history), /api/xp/earn
│       │   ├── quiz.ts       # /api/quiz/* quiz generation + AI explain
│       │   ├── ratings.ts    # /api/ratings, /api/admin/* (stats, users, errors, activity, token-stats)
│       │   ├── external.ts   # DO NOT TOUCH — external API proxy routes
│       │   ├── pdfs.ts       # /api/study-pdfs proxy to external PDF API
│       │   ├── errors.ts     # /api/errors (frontend error logging)
│       │   └── ...
│       ├── lib/
│       │   ├── redis.ts      # ioredis singleton with fallback
│       │   └── rate-limiter.ts
│       └── services/
│           ├── ai-cache.ts   # SHA-256 keyed AI response cache (1h TTL, Redis)
│           ├── ws.ts         # WebSocket server
│           └── queue.ts      # BullMQ ai-jobs / ocr-jobs queues
└── dashboard/           # React+Vite frontend (port 23183, previewPath: /)
    └── src/
        ├── components/
        │   ├── tabs/         # One file per tab
        │   ├── pdf-reader.tsx        # Reusable PDF viewer
        │   ├── resource-search.tsx   # Unified AI search across external sources
        │   └── ui-elements.tsx       # Card, Button, Input, etc.
        └── hooks/
            ├── use-auth.ts           # Auth context
            └── use-solve-stream.ts   # SSE streaming hook
lib/
├── db/                  # Drizzle ORM schema + PostgreSQL client
├── api-spec/            # OpenAPI spec + Orval codegen
├── api-client-react/    # Generated React Query hooks
├── api-zod/             # Generated Zod schemas
└── integrations-openrouter-ai/  # OpenRouter AI client + batch utils
```

---

## Database Tables (Drizzle ORM)

- `users` — id, email, firstName, lastName, authProvider, isAdmin, isPremium, emailVerified, createdAt
- `sessions` — session store (express-session)
- `computations` — id, userId, expression, result, operation, createdAt
- `ratingsTable` — id, userId, stars, review, createdAt
- `pageViewsTable` — id, userId/sessionId, path, createdAt
- `activityLog` — id, userId, type, description, xpEarned, tokensUsed, createdAt
- `tokenBalancesTable` — userId, balance, weeklyReset
- `study_resources` — id, title, board, category, subject, year, objectPath, fileName, fileSize, mimeType, description, uploadedBy, createdAt
- `errorLogs` — id, userId, message, stack, url, component, createdAt
- `token_purchases` — id, userId, packageId, tokensAmount, amountUsdCents, status, paypalOrderId, paypalTransactionId, paypalPayerEmail, createdAt, completedAt
- `security_events` — id, type, severity, userId, ipAddress, userAgent, email, description, isBlocked, createdAt
- `community_posts` — id, userId, title, content, category, isPinned, isLocked, isSolved, likeCount, commentCount, createdAt, updatedAt
- `community_comments` — id, postId, userId, content, isMarkedAnswer, likeCount, createdAt
- `community_likes` — id, userId, targetType, targetId, createdAt (unique constraint prevents double-liking)

---

## API Endpoints

### Auth
- `GET /api/auth/google` — initiate Google OAuth
- `GET /api/auth/google/callback` — OAuth callback
- `GET /api/auth/user` — current user (reads isPremium fresh from DB)
- `POST /api/auth/logout` — logout
- `POST /api/admin/setup` — initial admin account setup (requires `ADMIN_INIT_TOKEN`)

### Math & Computation
- `GET /api/health`
- `POST /api/math/compute` — mathjs expression evaluation
- `GET /api/history` — user computation history
- `DELETE /api/history/:id`
- `DELETE /api/history`

### AI
- `POST /api/solve-stream` — SSE streamed AI solving; query params: `personality` (friendly|strict|exam), `model`
- `POST /api/discuss` — non-streaming AI chat; body: `{ messages, model }`
- `POST /api/homework` — AI homework help (multipart: image + question)
- `POST /api/graph-ai-solve` — canvas image → AI analysis
- `GET /api/ais` — list available models

### OCR
- `POST /api/upload-image` — tesseract.js OCR; multipart `image` field

### Activity & XP
- `POST /api/activity` — log activity; body: `{ type, description, xpEarned?, tokensUsed? }`
- `GET /api/activity` — get recent activity log (current user)

### Community
- `GET /api/community/posts` — paginated post feed; query: `category`, `sort` (latest|popular|unanswered), `page`, `search`
- `POST /api/community/posts` — create post (auth required); body: `{ title, content, category }`
- `GET /api/community/posts/:id` — single post with comments + user likes
- `DELETE /api/community/posts/:id` — delete (own post or admin)
- `POST /api/community/posts/:id/like` — toggle like on a post (auth required)
- `POST /api/community/posts/:id/solve` — toggle solved status (post owner or admin)
- `PATCH /api/community/posts/:id/pin` — pin/unpin (admin only)
- `PATCH /api/community/posts/:id/lock` — lock/unlock (admin only)
- `POST /api/community/posts/:id/comments` — add comment (auth required)
- `DELETE /api/community/comments/:id` — delete comment (own or admin)
- `POST /api/community/comments/:id/like` — toggle like on comment (auth required)
- `POST /api/community/comments/:id/answer` — mark/unmark as best answer (post owner or admin)

### Billing (PayPal)
- `GET /api/billing/packages` — list token packages + PayPal client ID + configured status
- `POST /api/billing/calc-price` — calculate custom token price; body: `{ tokens }`
- `POST /api/billing/create-order` — create PayPal order; body: `{ packageId, customTokens? }`
- `POST /api/billing/capture-order` — capture approved order; body: `{ orderId }`
- `GET /api/billing/history` — current user's purchase history
- `GET /api/admin/billing-stats` — admin: revenue totals, by-package, top buyers, recent purchases
- `GET /api/admin/security-events` — admin: security event log + summary
- `POST /api/admin/security-events/:id/block` — admin: flag a security event as blocked
- `POST /api/xp/earn` — award XP; body: `{ amount, source }` (caps at 10,000)

### Quiz
- `POST /api/quiz/generate` — AI MCQ generation
- `POST /api/quiz/explain` — explain quiz answer

### Ratings
- `POST /api/ratings`
- `GET /api/ratings`

### Admin (all require `isAdmin`)
- `GET /api/admin/stats` — user/rating/computation totals
- `GET /api/admin/analytics?range=` — time-series chart data (date_trunc SQL)
- `GET /api/admin/ratings`
- `GET /api/admin/users`
- `PUT /api/admin/users/:id/admin` — toggle admin
- `PUT /api/admin/users/:id/premium` — toggle premium
- `GET /api/admin/errors?limit=` — frontend error logs
- `DELETE /api/admin/errors/:id`
- `DELETE /api/admin/errors`
- `GET /api/admin/activity?limit=` — recent activity log with user info (join users table)
- `GET /api/admin/token-stats` — aggregate stats: by-type, top users by XP, 14-day daily trend, overall totals, most-played games

### External API Proxy (DO NOT TOUCH `external.ts`)
- `GET /api/external-books` → PDFDrive books
- `GET /api/external-green-books` → ecolebooks
- `GET /api/external-notes` → local notes server
- `GET /api/external-syllabus` → 67 ZIMSEC/Cambridge syllabi
- `GET /api/external-pdf?url=` → universal PDF proxy
- `GET /api/study-pdfs` → proxy to `http://63.142.251.202:5080/api/pdfs` (20,000+ study materials)

---

## Frontend Dashboard Tabs

### 1. AI Solver (`solver`)
- SSE streaming AI problem solving via `use-solve-stream.ts`
- Model selector, topic selector, personality mode (Friendly Tutor / Strict Teacher / Exam Coach)
- Step-by-step guided mode (reveal one step at a time with "Explain This Step")
- "Explain Like I'm 10" button — simplified re-explanation in collapsible amber panel
- Visual step cards: gradient left-border stripe, numbered circle badge, dark code block, spring stagger animation
- Logs activity: 15 XP per solve

### 2. External Solver (`external`)
- Newton Math API (free, no AI key needed)
- Visual step cards matching AI solver design
- Logs activity: 10 XP per computation
- `logActivity()` declared in `external-solver-tab.tsx` at module level

### 3. Study Hall & Exam Centre (`openedx`)
- External PDF library: 20,000+ documents from `http://63.142.251.202:5080/api/pdfs` (proxied via `/api/study-pdfs`)
- Class filters: All / Baby / Primary / Top; full-text search; 20-per-page grid with Load More
- 4 exam types: Quick (custom), Daily Challenge, Weekly Challenge, Monthly Exam
- Difficulty levels: Beginner/Intermediate/Advanced/Expert (5/10/15/20 questions)
- Date-seeded deterministic topic selection (all students get same exam each day/week/month)
- AI exam generation via `/api/discuss` with qwen3.5 → JSON array MCQs `{q, opts, ans, exp}`
- Timed exam with countdown, question navigator grid, auto-submit on timeout
- Grading: A+/A/B/C/D/F; pass/fail (≥50%); XP awards on pass
- Results: collapsible per-question review with correct answer + AI explanation
- History: last 50 attempts in localStorage with aggregate stats
- Opens PDFs in PdfReader component (same as Novels)

### 4. Book Library / Novels (`novels`)
- 180+ novels/classics from ecolebooks + PDFDrive
- Genre filters, full-text search, 24-per-page Show More pagination
- In-app PdfReader with page memory, reading list, bookmarks
- "Ask AI" sidebar for book Q&A

### 5. Notes & Green Books (`moodle`)
- Notes (ecolebooks) + Green Books (Cambridge green books)
- Collapsible category accordion when viewing "All"
- PdfReader with page memory + Resume banner
- AI-generated study guide fallback for inaccessible books

### 6. Syllabus Browser (`syllabus`)
- 67 ZIMSEC/Cambridge O-Level syllabi grouped by subject
- Groups: Mathematics, Physics, Chemistry, Biology, CS, Geography, History, Accounting, Business, General
- Opens PDFs in PdfReader

### 7. Study Resources / Guide (`guide`)
- 400+ self-hosted ZIMSEC/Cambridge past papers, textbooks, green books
- Object storage (GCS bucket) with presigned URL upload flow
- PDF viewer + download; resource upload modal with metadata form
- `useResourceUpload` hook: 4-stage flow (request URL → upload → save → done)

### 8. Calculator (`calculator`)
- Scientific calculator with mathjs engine
- Custom keyboard with all operations; history panel

### 9. Image OCR (`ocr`)
- Drag-and-drop or camera capture (getUserMedia + fallback)
- tesseract.js text extraction → Newton API popup for math; "Ask Qwen 122B" for non-math
- Logs activity: 10 XP per OCR

### 10. Graph Plotter (`graph`)
- Function graphing with recharts
- Drawing canvas mode: pencil/pen/eraser, color picker, stroke width
- Mathematical gadgets: ruler, protractor, set square, compass (draggable/rotatable)
- "Solve with AI" panel using canvas screenshot → `/api/graph-ai-solve`

### 11. AI Chat (`chat`)
- Conversational AI tutor with message history
- Previous solution banner: preview/collapse + "Load into chat"
- Ctrl+Enter to send

### 12. Quiz Mode (`quiz`)
- Adaptive quiz: topic selection, difficulty, AI-generated MCQs
- Per-question AI explanation; score tracking; XP awards

### 13. Homework Help (`homework`)
- Camera capture (live stream) + file upload zone
- AI step-by-step solution with image context
- Logs activity: 15–20 XP depending on mode

### 14. Progress (`progress`)
- 7-level XP system: Beginner (0) → Master (25,000+)
- Daily streak tracking (localStorage), today's activity summary
- Weak/strong topic analysis from computation history
- 12 earnable badges: First Steps, Algebra Explorer/Master, Consistent Learner, Week Warrior, Problem Solver, Century Club, Quiz Starter, Quiz Champion, Calculus Fan, XP Hunter, Scholar
- Badge unlock conditions based on computation/quiz stats

### 15. Math Puzzle Games (`puzzles`)
8 games in a hub layout:
1. **Word Search** — 9×9/12×12/15×15 grid; Math or General Education word bank; Easy/Medium/Hard difficulty; full touch (finger drag) + mouse support; `data-row`/`data-col` attributes + `document.elementFromPoint` for mobile selection
2. **Fill the Blanks** — fill missing letters in math vocabulary words with hint
3. **Anagram Solver** — unscramble shuffled math terms
4. **Math Trivia** — 10-question shuffled MCQ quiz on math concepts
5. **Spelling Bee** — honeycomb letter tiles, build words from centre letter
6. **Number Sequence** — find the next number in arithmetic/geometric sequences
7. **Math Flash Cards** — rapid-fire mental arithmetic with countdown
8. **Math Crossword** — fill crossword using math clues
- All games log to `/api/activity` with `type: "game_played"`, 5 XP each
- Word search logs difficulty + word bank (e.g., "Word Search — Hard · General")

### 16. Admin Dashboard (`admin`)
- Protected: only users where `isAdmin = true` or email in `ADMIN_EMAILS` env
- **Overview tab**: stat cards (users, ratings, computations, online)
- **Analytics tab**: Recharts AreaChart for signups + computations; time-range selector
- **Ratings tab**: all user ratings with stars + review text
- **Users tab**: full user table; toggle admin/premium; search/filter
- **Admins tab**: current admin accounts + New Admin button (sends email invite)
- **Errors tab**: frontend error log with stack traces; enable/disable logging toggle; delete individual or clear all
- **Activity tab**: total activities, total XP, AI tokens; by-type breakdown; top-10 users by XP; Most Played Games leaderboard (trending); scrollable activity feed

### 17. SageMath / Wolfram (`sagemath`)
- Embedded SageMath cell server
- Advanced symbolic computation

### 18. Settings (`settings`)
- 12 accent colour presets + custom colour picker
- 6 background presets; 4 border-radius presets; glow intensity slider
- 5 monospace font options
- Dark/Light mode toggle (Moon/Sun icon in sidebar header + mobile top bar)
- Theme saved to `app_theme_v1` localStorage key; applies `.light-mode` class on `<html>`

---

## Key Components

### `pdf-reader.tsx`
- Props: `url`, `title`, `subtitle?`, `accentColor?`, `onClose` (required)
- 90% container width via ResizeObserver; page memory in localStorage (`pdf-pos-{encodedUrl}`)
- Resume banner on re-open; Reading list slide-in panel
- 2-finger pinch-to-zoom; **single-finger horizontal swipe** (≥60px, <600ms) to navigate pages
- Save to Reading List prompt on last page; keyboard arrow navigation

### `resource-search.tsx`
- Unified AI search across 5 external sources in parallel
- Groups results by source; "Ask AI" button → `/api/discuss` with qwen3.5-9b

### Activity Logging Pattern (frontend)
```ts
function logActivity(type, description, xpEarned, tokensUsed = 0) {
  fetch(api("/activity"), {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, description, xpEarned, tokensUsed })
  }).catch(() => {});
}
```
Used in: `solver-tab.tsx`, `external-solver-tab.tsx`, `homework-tab.tsx`, `ocr-tab.tsx`, `puzzles-tab.tsx`

---

## Workflow Setup

- **"Start application"** — runs both services: `PORT=8080 pnpm --filter @workspace/api-server run dev & PORT=23183 BASE_PATH=/ pnpm --filter @workspace/dashboard run dev`
- Only restart **"Start application"** workflow (the standalone artifact workflows will get EADDRINUSE since ports are already bound by Start application)
- API server on port 8080; dashboard on port 23183

---

## Key Notes

- `tesseract.js` is in `onlyBuiltDependencies` in `pnpm-workspace.yaml`
- Multer uses `os.tmpdir()` for OCR uploads
- `trust proxy: 1` set on Express for Replit's proxy (rate limiting)
- OpenAPI spec covers math + history only; AI/SSE/OCR called directly
- `pnpm run typecheck` for typechecking; `pnpm run build` for full build
- Pre-existing TS errors in graph-tab, moodle-tab, novels-tab (non-blocking in Vite dev mode)
