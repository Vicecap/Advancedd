import { Router, type IRouter } from "express";
import { openrouter } from "@workspace/integrations-openrouter-ai";

import {
  db,
  computationsTable,
  tokenBalancesTable,
  studyResourcesTable,
  usersTable,
} from "@workspace/db";
import { eq, sql, or, ilike } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { getCachedAIResponse, setCachedAIResponse } from "../services/ai-cache.js";
import { redisRateLimit } from "../lib/rate-limiter.js";

const router: IRouter = Router();

/* ================================================================
   🌐 AI BACKEND ENDPOINTS
   Agent server  — primary (free, multi-provider, auto-fallback)
   OpenRouter    — last resort text fallback (2 cheap models)
   OpenRouter    — vision only (2 cheap models, images can't go elsewhere)
================================================================ */

const AGENT_BASE = "http://145.223.69.146:3016";

// Fixed token cost per AI request
const TOKENS_PER_REQUEST = 10_000;

// Two cheap OpenRouter text fallback models
const OR_TEXT_FALLBACK_PRIMARY   = "mistralai/mistral-7b-instruct"; // ~$0.06/1M tokens
const OR_TEXT_FALLBACK_SECONDARY = "qwen/qwen-2.5-7b-instruct";     // ~$0.07/1M tokens

// Vision-only OpenRouter models (agent cannot process images)
const OR_VISION_PRIMARY = "google/gemini-2.0-flash-001";
const OR_VISION_BACKUP  = "google/gemini-flash-1.5-8b";

/* ================================================================
   📚 BOOK SEARCH API BASE
================================================================ */

const BOOK_SEARCH_API = "http://80.241.208.95:3057/api/v1";

/* ================================================================
   🛡️ SERVER COMMAND FILTER
   Strips out anything that looks like shell commands, system calls,
   prompt injections, or attempts to manipulate the backend.
================================================================ */

const SERVER_COMMAND_PATTERNS: RegExp[] = [
  // Shell commands
  /\b(rm\s+-rf|sudo|chmod|chown|wget|curl\s+-[a-z]|nc\s+|netcat|bash\s+-[a-z]|sh\s+-[a-z]|exec\s+|eval\s*\(|system\s*\(|popen\s*\()\b/gi,
  // Path traversal
  /\.\.[/\\]/g,
  // Common injection attempts
  /(\|\||&&|;\s*(?:rm|ls|cat|echo|wget|curl|python|node|bash|sh)\b)/gi,
  // Prompt injection keywords
  /\b(ignore previous instructions|disregard (all|your|the) (previous|prior|above)|you are now|new persona|act as (a|an) (?!tutor|teacher|assistant|coach))/gi,
  // System/env access attempts
  /\b(process\.env|__dirname|__filename|require\s*\(|import\s*\(|fs\.|child_process|exec\s*\()/gi,
  // SQL injection basics
  /('|")\s*(OR|AND)\s+('|"|\d)/gi,
  /;\s*(DROP|DELETE|INSERT|UPDATE|SELECT)\s+/gi,
];

function containsServerCommands(input: string): boolean {
  return SERVER_COMMAND_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(input);
  });
}

function sanitizePrompt(input: string): string {
  let sanitized = input.slice(0, 8000);
  for (const pattern of SERVER_COMMAND_PATTERNS) {
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, "[REMOVED]");
  }
  return sanitized.trim();
}

function filterPrompt(
  raw: string | undefined | null,
): { blocked: true } | { blocked: false; sanitized: string } {
  if (!raw || !raw.trim()) return { blocked: false, sanitized: "" };

  if (containsServerCommands(raw)) {
    console.warn("[SECURITY] Blocked prompt containing server commands. Preview:", raw.slice(0, 120));
    return { blocked: true };
  }

  return { blocked: false, sanitized: sanitizePrompt(raw) };
}

/* ================================================================
   🤖 UNIFIED AI CALLER

   Priority chain (per request):
   1. Agent /ai         — full agent (memory + tools + Groq/Cerebras/Qwen)
   2. Agent /chat       — direct model call (no tools)
   3. Agent /stream     — collected as text
   4. OpenRouter        — mistral-7b-instruct (cheap fallback #1)
   5. OpenRouter        — qwen-2.5-7b-instruct (cheap fallback #2)

   This function NEVER throws. It always returns a string.
================================================================ */

interface AICallOptions {
  prompt: string;
  systemPrompt?: string;
  userId?: string;
  preferredModel?: string;
  /** Skip agent entirely and go straight to OR fallback (rare) */
  forceOpenRouter?: boolean;
}

async function callAI(opts: AICallOptions): Promise<{
  reply: string;
  provider: string;
  usedFallback: boolean;
}> {
  const {
    prompt,
    systemPrompt,
    userId = "anonymous",
    preferredModel,
    forceOpenRouter = false,
  } = opts;

  const fullPrompt = systemPrompt
    ? `[SYSTEM]\n${systemPrompt}\n\n[USER]\n${prompt}`
    : prompt;

  // ── STEP 1: Agent /ai (full agent with tools + memory) ──────────
  if (!forceOpenRouter) {
    try {
      const res = await fetch(`${AGENT_BASE}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: fullPrompt, userId }),
        signal: AbortSignal.timeout(55000),
      });

      if (res.ok) {
        const data = await res.json() as { reply?: string; type?: string };
        if (data.reply && data.reply.length > 10) {
          return { reply: data.reply, provider: "agent", usedFallback: false };
        }
      }
    } catch (err) {
      console.warn("[AI] Agent /ai failed:", (err as Error).message);
    }

    // ── STEP 2: Agent /chat/completions (direct, no tools) ─────────
    try {
      const res = await fetch(`${AGENT_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: fullPrompt, model: preferredModel }),
        signal: AbortSignal.timeout(45000),
      });

      if (res.ok) {
        const data = await res.json() as { reply?: string; provider?: string };
        if (data.reply && data.reply.length > 10) {
          return {
            reply: data.reply,
            provider: data.provider ?? "agent-direct",
            usedFallback: false,
          };
        }
      }
    } catch (err) {
      console.warn("[AI] Agent /chat failed:", (err as Error).message);
    }

    // ── STEP 3: Agent /stream (collect streamed response as text) ───
    try {
      const res = await fetch(`${AGENT_BASE}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: fullPrompt, userId }),
        signal: AbortSignal.timeout(60000),
      });

      if (res.ok && res.body) {
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let collected = "";
        let buf       = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const token = line.slice(6).trim();
              if (token && token !== "[DONE]") collected += token + " ";
            }
          }
        }

        if (collected.trim().length > 10) {
          return {
            reply: collected.trim(),
            provider: "agent-stream",
            usedFallback: false,
          };
        }
      }
    } catch (err) {
      console.warn("[AI] Agent /stream failed:", (err as Error).message);
    }
  }

  // ── STEP 4: OpenRouter primary text fallback (mistral-7b) ─────────
  const orModels = [
    { model: OR_TEXT_FALLBACK_PRIMARY,   label: "openrouter-mistral-fallback" },
    { model: OR_TEXT_FALLBACK_SECONDARY, label: "openrouter-qwen-fallback"    },
  ];

  for (const { model, label } of orModels) {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const completion = await openrouter.chat.completions.create({
          model,
          messages: [
            ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
            { role: "user" as const, content: prompt },
          ],
          max_tokens: 4096,
        });

        const reply = completion.choices[0]?.message?.content ?? "";
        if (reply.length > 5) {
          return { reply, provider: label, usedFallback: true };
        }
      } catch (err) {
        console.warn(
          `[AI] ${label} attempt ${attempt}/${maxRetries} failed:`,
          (err as Error).message,
        );
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }
  }

  // ── ABSOLUTE LAST RESORT ─────────────────────────────────────────
  console.error("[AI] ALL providers failed — returning static fallback");
  return {
    reply: "I'm sorry, I'm having trouble connecting to AI services right now. Please try again in a moment.",
    provider: "static-fallback",
    usedFallback: true,
  };
}

/* ================================================================
   📡 STREAMING VERSION OF callAI
================================================================ */

async function streamAI(
  opts: AICallOptions,
  onToken: (token: string) => void,
): Promise<{ provider: string; usedFallback: boolean; fullText: string }> {
  const {
    prompt,
    systemPrompt,
    userId = "anonymous",
  } = opts;

  const fullPrompt = systemPrompt
    ? `[SYSTEM]\n${systemPrompt}\n\n[USER]\n${prompt}`
    : prompt;

  // ── STEP 1: Agent /stream (real SSE) ────────────────────────────
  try {
    const res = await fetch(`${AGENT_BASE}/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: fullPrompt, userId }),
      signal: AbortSignal.timeout(90000),
    });

    if (res.ok && res.body) {
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText  = "";
      let buf       = "";
      let gotTokens = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const token = line.slice(6).trim();
            if (token && token !== "[DONE]") {
              fullText += token + " ";
              onToken(token + " ");
              gotTokens = true;
            }
          }
        }
      }

      if (gotTokens && fullText.trim().length > 10) {
        return { provider: "agent-stream", usedFallback: false, fullText: fullText.trim() };
      }
    }
  } catch (err) {
    console.warn("[AI Stream] Agent /stream failed:", (err as Error).message);
  }

  // ── STEP 2: callAI (non-stream) then fake-stream word by word ───
  const result = await callAI(opts);
  const words  = result.reply.split(" ");

  for (const word of words) {
    onToken(word + " ");
    await new Promise(r => setTimeout(r, 18));
  }

  return {
    provider:    result.provider,
    usedFallback: result.usedFallback,
    fullText:    result.reply,
  };
}

/* ================================================================
   💰 TOKEN + HISTORY HELPERS
================================================================ */

async function deductTokens(userId: string, _amount: number): Promise<void> {
  const amount = TOKENS_PER_REQUEST;
  try {
    const [user] = await db
      .select({ isPremium: usersTable.isPremium })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (user?.isPremium) return;

    await db
      .update(tokenBalancesTable)
      .set({
        balance:   sql`GREATEST(0, ${tokenBalancesTable.balance} - ${amount})`,
        totalUsed: sql`${tokenBalancesTable.totalUsed} + ${amount}`,
      })
      .where(eq(tokenBalancesTable.userId, userId));
  } catch (err) {
    console.error("Failed to deduct tokens", err);
  }
}

async function saveToHistory(
  userId: string | null,
  expression: string,
  operation: string,
  result: string,
  steps: string = "[]",
): Promise<void> {
  try {
    await db.insert(computationsTable).values({
      userId,
      expression,
      operation,
      result,
      steps,
      isNumeric: false,
    });
  } catch (err) {
    console.error("Failed to save to history", err);
  }
}

/* ================================================================
   📋 MODELS LIST
================================================================ */

const AVAILABLE_MODELS = [
  {
    id:          "auto",
    label:       "ZimSolve AI",
    sub:         "Powered by best available model",
    recommended: true,
    provider:    "auto",
  },
  {
    id:          "auto-fast",
    label:       "ZimSolve AI Fast",
    sub:         "Quick responses with lightweight model",
    recommended: false,
    provider:    "auto-fast",
  },
];

router.get("/ais", (_req, res): void => {
  res.json({ models: AVAILABLE_MODELS });
});

/* ================================================================
   🎭 PERSONALITY PROMPTS
================================================================ */

const PERSONALITY_PROMPTS: Record<string, string> = {
  friendly: `You are a friendly, encouraging math tutor named ZimSolve. Use a warm, supportive tone with relatable real-world examples and gentle encouragement. Celebrate good thinking! When given a math problem, solve it step by step. Format your response with clear numbered steps. At the end, provide a "Final Answer:" line with just the result. Keep it approachable and motivating.`,
  strict:   `You are a strict, rigorous mathematics teacher. Use formal academic language, show all working with full mathematical precision, and correct potential misconceptions directly. When given a math problem, solve it step by step with complete mathematical rigour. Format your response with clear numbered steps showing all intermediate working. At the end, provide a "Final Answer:" line with just the result.`,
  exam:     `You are a ZIMSEC/Cambridge O-Level exam coach. Structure your solutions exactly as a mark scheme would expect: show all required working, use proper mathematical notation, and note where method marks (M) and accuracy marks (A) would be awarded. When given a math problem, solve it step by step in exam format. Format your response with clear numbered steps. At the end, provide a "Final Answer:" line with just the result.`,
};

const DEFAULT_SYSTEM = `You are a math tutor and problem solver. When given a math problem, solve it step by step.
Format your response with clear numbered steps. At the end, provide a "Final Answer:" line with just the result. Keep explanations clear and educational.`;

/* ================================================================
   🛡️ RATE LIMITERS
================================================================ */

const aiRateLimit = redisRateLimit({
  windowSecs: 60,
  max:        20,
  keyPrefix:  "rl:ai",
  message:    "AI rate limit exceeded. Please wait a moment.",
});

// Tighter limit for solve-stream (SSE connections are expensive)
const solveStreamRateLimit = redisRateLimit({
  windowSecs: 60,
  max:        10,
  keyPrefix:  "rl:solve-stream",
  message:    "Too many solve requests. Please wait a moment.",
});

// Vision endpoints consume more credits
const visionRateLimit = redisRateLimit({
  windowSecs: 60,
  max:        10,
  keyPrefix:  "rl:vision",
  message:    "Vision rate limit exceeded. Please wait a moment.",
});

// Book search — cheap but we still protect it
const bookSearchRateLimit = redisRateLimit({
  windowSecs: 60,
  max:        30,
  keyPrefix:  "rl:book-search",
  message:    "Book search rate limit exceeded. Please wait a moment.",
});

// Open-assist streaming
const openAssistRateLimit = redisRateLimit({
  windowSecs: 60,
  max:        15,
  keyPrefix:  "rl:open-assist",
  message:    "Too many assistant requests. Please wait a moment.",
});

/* ================================================================
   🔢 SOLVE STREAM
================================================================ */

router.get("/solve-stream", solveStreamRateLimit, async (req, res): Promise<void> => {
  const { question, topic, personality } = req.query as Record<string, string>;

  if (!question) {
    res.status(400).json({ error: "question is required" });
    return;
  }

  const filtered = filterPrompt(question);
  if (filtered.blocked) {
    res.status(400).json({ error: "Your message contains disallowed content." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const userId       = req.isAuthenticated() ? req.user.id : "anonymous";
  const systemPrompt = PERSONALITY_PROMPTS[personality] ?? DEFAULT_SYSTEM;
  const safeQuestion = filtered.sanitized;

  const userPrompt = topic
    ? `${topic.toUpperCase()}: ${safeQuestion}\n\nSolve this step by step.`
    : `Solve this step by step: ${safeQuestion}`;

  try {
    const paragraphs: string[] = [];
    let buffer = "";

    const { fullText, provider } = await streamAI(
      { prompt: userPrompt, systemPrompt, userId },
      (token) => {
        buffer += token;
        if (buffer.includes("\n\n")) {
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const para of parts) {
            if (para.trim()) {
              paragraphs.push(para.trim());
              send({ paragraph: para.trim() });
            }
          }
        }
      },
    );

    if (buffer.trim()) {
      paragraphs.push(buffer.trim());
      send({ paragraph: buffer.trim() });
    }

    const answerMatch = fullText.match(/Final Answer[:\s]+(.+?)(?:\n|$)/i);
    const answer      = answerMatch
      ? answerMatch[1].trim()
      : fullText.split("\n").filter(Boolean).pop() ?? "";

    send({ answer, solution: answer, done: true, provider });
    res.end();

    const operationLabel = topic && topic !== "solve" ? topic : "solve";

    await saveToHistory(
      req.isAuthenticated() ? req.user.id : null,
      safeQuestion,
      operationLabel,
      answer,
      JSON.stringify(paragraphs),
    );

    if (req.isAuthenticated()) {
      await deductTokens(req.user.id, TOKENS_PER_REQUEST);
    }
  } catch (err) {
    req.log.error({ err }, "solve-stream unexpected error");
    send({ error: "Unexpected error. Please try again.", done: true });
    res.end();
  }
});

/* ================================================================
   💬 DISCUSS
================================================================ */

router.post("/discuss", aiRateLimit, async (req, res): Promise<void> => {
  const { prompt } = req.body as { prompt?: string; ai?: string };

  if (!prompt) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const filtered = filterPrompt(prompt);
  if (filtered.blocked) {
    res.status(400).json({ error: "Your message contains disallowed content." });
    return;
  }

  const userId    = req.isAuthenticated() ? req.user.id : "anonymous";
  const safePrompt = filtered.sanitized;

  const cacheKey = `discuss:auto:${safePrompt}`;
  const cached   = await getCachedAIResponse("auto", cacheKey);
  if (cached) {
    res.json({ response: cached, cached: true });
    return;
  }

  const systemPrompt = "You are a knowledgeable study tutor and exam coach. When exam paper content is provided at the start of the message (marked [Exam Paper Content]), use the exact questions from that content to evaluate student answers accurately. Provide clear, detailed, and educational feedback with mark estimates and study tips.";

  const { reply, provider } = await callAI({ prompt: safePrompt, systemPrompt, userId });

  res.json({ response: reply, provider });

  await setCachedAIResponse("auto", cacheKey, reply);

  if (req.isAuthenticated()) await deductTokens(req.user.id, TOKENS_PER_REQUEST);
});

/* ================================================================
   🖼 UPLOAD IMAGE / OCR
   Vision — OpenRouter only (agent can't process images)
================================================================ */

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename:    (_req, file, cb) => {
      cb(null, `ocr-${Date.now()}${path.extname(file.originalname)}`);
    },
  }),
  limits:     { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

async function callVisionModel(
  messages: Parameters<typeof openrouter.chat.completions.create>[0]["messages"],
  maxTokens: number = 1024,
): Promise<string> {
  try {
    const completion = await openrouter.chat.completions.create({
      model:      OR_VISION_PRIMARY,
      messages,
      max_tokens: maxTokens,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (text.length > 5) return text;
  } catch (err) {
    console.warn("[Vision] Primary model failed:", (err as Error).message);
  }

  try {
    const completion = await openrouter.chat.completions.create({
      model:      OR_VISION_BACKUP,
      messages,
      max_tokens: maxTokens,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (text.length > 5) return text;
  } catch (err) {
    console.warn("[Vision] Backup model failed:", (err as Error).message);
  }

  return "Could not extract content from the image. Please try again or type your question manually.";
}

router.post("/upload-image", visionRateLimit, upload.single("image"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No image file uploaded" });
    return;
  }

  const filePath = req.file.path;

  try {
    const imageBuffer = await fs.readFile(filePath);
    const mimeType    = req.file.mimetype || "image/jpeg";
    const dataUrl     = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
    await fs.unlink(filePath).catch(() => {});

    const text = await callVisionModel([
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          {
            type: "text",
            text: "Extract all text, mathematical expressions, equations, numbers, and any written content visible in this image. Write fractions as a/b, mixed numbers as 'a b/c' (e.g. 2 1/3), and equations exactly as shown. If the image shows a graph, chart, or diagram, briefly describe what it shows. Return ONLY the extracted content — no commentary, no introduction.",
          },
        ] as Parameters<typeof openrouter.chat.completions.create>[0]["messages"][0]["content"],
      },
    ]);

    res.json({ text });

    if (req.isAuthenticated()) {
      await deductTokens(req.user.id, TOKENS_PER_REQUEST);
    }
  } catch (err) {
    req.log.error({ err }, "OCR error");
    await fs.unlink(filePath).catch(() => {});
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ================================================================
   📚 HOMEWORK
================================================================ */

router.post("/homework", aiRateLimit, async (req, res): Promise<void> => {
  const { content, question, mode, subject } = req.body as {
    content?:  string;
    question?: string;
    mode?:     string;
    subject?:  string;
  };

  if (!content && !question) {
    res.status(400).json({ error: "content or question is required" });
    return;
  }

  const filteredQ = filterPrompt(question);
  const filteredC = filterPrompt(content);

  if (filteredQ.blocked || filteredC.blocked) {
    res.status(400).json({ error: "Your message contains disallowed content." });
    return;
  }

  const userId       = req.isAuthenticated() ? req.user.id : "anonymous";
  const safeQuestion = filteredQ.sanitized;
  const safeContent  = filteredC.sanitized;

  const cacheKey = `homework:auto:${mode}:${subject}:${safeQuestion}:${safeContent.slice(0, 200)}`;
  const cached   = await getCachedAIResponse("auto", cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { response: string; relevantResources: unknown[] };
      res.json({ ...parsed, cached: true });
      return;
    } catch { /* fall through */ }
  }

  let relevantResources: {
    title:    string;
    subject:  string;
    category: string;
    year:     number | null;
  }[] = [];

  try {
    const conditions = subject
      ? [
          ilike(studyResourcesTable.subject, `%${subject}%`),
          ilike(studyResourcesTable.title,   `%${subject}%`),
        ]
      : [];

    relevantResources = await db
      .select({
        title:    studyResourcesTable.title,
        subject:  studyResourcesTable.subject,
        category: studyResourcesTable.category,
        year:     studyResourcesTable.year,
      })
      .from(studyResourcesTable)
      .where(conditions.length > 0 ? or(...conditions) : undefined)
      .limit(6);
  } catch { /* non-fatal */ }

  const resourceContext = relevantResources.length > 0
    ? `\n\n[Available Study Resources]\n${relevantResources
        .map(r => `- ${r.title} (${r.subject}, ${r.category}${r.year ? `, ${r.year}` : ""})`)
        .join("\n")}\nReference these where relevant.`
    : "";

  const modeInstructions: Record<string, string> = {
    help:     "Help the student understand and work through this homework step by step. Guide them rather than just giving answers.",
    solve:    "Solve this homework completely showing all working steps clearly.",
    review:   "Review the student's submitted work. Check correctness, identify mistakes, and give constructive feedback.",
    research: "Research this topic thoroughly. Explain key concepts, provide examples, and reference related resources.",
  };

  const systemPrompt = `You are an expert academic tutor specializing in secondary and high school subjects. ${modeInstructions[mode ?? "help"] ?? modeInstructions.help}${resourceContext}

Structure your response with:
1. A brief overview
2. Step-by-step working or explanation
3. Key points to remember
4. Study tips or resource recommendations`;

  const userContent = [
    safeContent  ? `[Homework Content]\n${safeContent}`   : "",
    safeQuestion ? `[Student's Question]\n${safeQuestion}` : "",
  ].filter(Boolean).join("\n\n");

  const { reply, provider } = await callAI({
    prompt: userContent,
    systemPrompt,
    userId,
  });

  await saveToHistory(
    req.isAuthenticated() ? req.user.id : null,
    safeQuestion || safeContent.slice(0, 200) || "Homework submission",
    "homework",
    reply.slice(0, 500),
  );

  res.json({ response: reply, relevantResources, provider });

  await setCachedAIResponse("auto", cacheKey, JSON.stringify({ response: reply, relevantResources }));

  if (req.isAuthenticated()) await deductTokens(req.user.id, TOKENS_PER_REQUEST);
});

/* ================================================================
   📖 BOOK SEARCH
   Uses the /api/v1/search endpoints directly — no AI keyword
   generation. Falls back to a simple word-split if the API is
   unreachable so the caller always gets a usable keyword list.
================================================================ */

/**
 * Hits GET /api/v1/search/suggestions?q=<prefix> and returns the
 * suggestion strings.  Throws on non-OK so the caller can fall back.
 */
async function fetchSuggestions(q: string): Promise<string[]> {
  const url = `${BOOK_SEARCH_API}/search/suggestions?q=${encodeURIComponent(q)}`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`suggestions ${res.status}`);

  // The API may return { suggestions: string[] } or string[] directly
  const data = await res.json() as string[] | { suggestions?: string[] };
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.suggestions)) return data.suggestions;
  return [];
}

/**
 * Hits GET /api/v1/search?q=<query>&limit=<n> and returns the
 * result titles / authors as additional keyword seeds.
 */
async function fetchSearchKeywords(q: string, limit = 20): Promise<string[]> {
  const url = `${BOOK_SEARCH_API}/search?q=${encodeURIComponent(q)}&limit=${limit}`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`search ${res.status}`);

  const data = await res.json() as {
    data?: Array<{ title?: string; author?: string; subject?: string; tags?: string[] }>;
    results?: Array<{ title?: string; author?: string; subject?: string; tags?: string[] }>;
  };

  const rows = data.data ?? data.results ?? [];
  const keywords: string[] = [];

  for (const row of rows) {
    if (row.title)   keywords.push(row.title.toLowerCase());
    if (row.author)  keywords.push(row.author.toLowerCase());
    if (row.subject) keywords.push(row.subject.toLowerCase());
    if (Array.isArray(row.tags)) {
      for (const t of row.tags) keywords.push(String(t).toLowerCase());
    }
  }

  return keywords;
}

/**
 * Hits GET /api/v1/search/filters and pulls every available filter
 * value that relates to the query (subject, category, exam_board …).
 * This gives the frontend richer faceting data without any AI call.
 */
async function fetchRelatedFilters(q: string): Promise<string[]> {
  const url = `${BOOK_SEARCH_API}/search/filters`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];

  const data = await res.json() as {
    subjects?:     string[];
    categories?:   string[];
    exam_boards?:  string[];
    languages?:    string[];
    grades?:       string[];
  };

  const lower = q.toLowerCase();
  const pool: string[] = [
    ...(data.subjects    ?? []),
    ...(data.categories  ?? []),
    ...(data.exam_boards ?? []),
    ...(data.grades      ?? []),
  ];

  // Keep filters that share a word with the query
  const queryWords = lower.split(/\s+/).filter(Boolean);
  return pool
    .map(s => s.toLowerCase())
    .filter(s => queryWords.some(w => s.includes(w)));
}

router.post("/ai-book-search", bookSearchRateLimit, async (req, res): Promise<void> => {
  const { query } = req.body as { query: string };

  if (!query?.trim()) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  const filtered = filterPrompt(query);
  if (filtered.blocked) {
    res.status(400).json({ error: "Your message contains disallowed content." });
    return;
  }

  const safeQuery = filtered.sanitized;
  const cacheKey  = `book-search-v2:${safeQuery.toLowerCase()}`;

  // ── Cache hit ────────────────────────────────────────────────────
  const cached = await getCachedAIResponse("search", cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { keywords: string[]; query: string };
      res.json({ ...parsed, cached: true });
      return;
    } catch { /* fall through */ }
  }

  // ── Hit search endpoints in parallel ────────────────────────────
  try {
    const [suggestions, searchKws, filterKws] = await Promise.allSettled([
      fetchSuggestions(safeQuery),
      fetchSearchKeywords(safeQuery, 20),
      fetchRelatedFilters(safeQuery),
    ]);

    const raw: string[] = [
      // Always include the original query words
      ...safeQuery.toLowerCase().split(/[\s,]+/).filter(Boolean),

      ...(suggestions.status === "fulfilled" ? suggestions.value : []),
      ...(searchKws.status   === "fulfilled" ? searchKws.value   : []),
      ...(filterKws.status   === "fulfilled" ? filterKws.value   : []),
    ];

    // Deduplicate, trim, cap at 40
    const keywords = [...new Set(raw.map(k => k.toLowerCase().trim()).filter(Boolean))].slice(0, 40);

    const result = { keywords, query: safeQuery };
    res.json(result);

    // Cache for 10 minutes
    await setCachedAIResponse("search", cacheKey, JSON.stringify(result));

  } catch (err) {
    req.log.warn({ err }, "Book search API error — using simple fallback");
    // Graceful degradation: split the query into words
    const keywords = safeQuery.toLowerCase().split(/[\s,]+/).filter(Boolean);
    res.json({ keywords, query: safeQuery, fallback: true });
  }
});

/* ================================================================
   📊 GRAPH AI SOLVE
   Vision — OpenRouter only (images can't go to agent)
================================================================ */

router.post("/graph-ai-solve", visionRateLimit, async (req, res): Promise<void> => {
  const { imageDataUrl, prompt } = req.body as {
    imageDataUrl?: string;
    prompt?:       string;
  };

  if (!imageDataUrl) {
    res.status(400).json({ error: "imageDataUrl is required" });
    return;
  }

  const filtered = filterPrompt(prompt ?? "");
  if (filtered.blocked) {
    res.status(400).json({ error: "Your message contains disallowed content." });
    return;
  }

  const userId     = req.isAuthenticated() ? req.user.id : null;
  const safePrompt = filtered.sanitized;

  const systemPrompt = `You are a mathematics and science AI tutor specialising in ZIMSEC and Cambridge O-Level curriculum. Analyse the image carefully and provide a clear, structured, educational solution with full step-by-step working. If the image contains a graph or chart, describe what you see and explain its key features.`;

  const userText = safePrompt
    ? `${safePrompt}\n\nPlease analyse and solve what is shown in the image.`
    : "Please identify the question, graph, or diagram in this image and provide a complete step-by-step solution or analysis.";

  const response = await callVisionModel([
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageDataUrl } },
        { type: "text", text: userText },
      ] as Parameters<typeof openrouter.chat.completions.create>[0]["messages"][0]["content"],
    },
  ], 3000);

  res.json({ response, model: OR_VISION_PRIMARY });

  if (userId) {
    await deductTokens(userId, TOKENS_PER_REQUEST);
  }
});

/* ================================================================
   🤝 OPEN ASSIST — STREAMING
================================================================ */

router.post("/open-assist", openAssistRateLimit, async (req, res): Promise<void> => {
  const { system, message } = req.body as {
    system?:  string;
    message?: string;
    model?:   string;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const filteredMsg = filterPrompt(message);
  const filteredSys = filterPrompt(system ?? "");

  if (filteredMsg.blocked || filteredSys.blocked) {
    res.status(400).json({ error: "Your message contains disallowed content." });
    return;
  }

  const userId       = req.isAuthenticated() ? req.user?.id : "anonymous";
  const safeMsg      = filteredMsg.sanitized;
  const systemPrompt = filteredSys.sanitized ||
    "You are a helpful AI tutor for ZIMSEC and Cambridge O-Level students. Be clear, educational, and thorough.";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    const { fullText, provider } = await streamAI(
      { prompt: safeMsg, systemPrompt, userId: userId ?? "anonymous" },
      (token) => {
        res.write(`data: ${JSON.stringify({ delta: token })}\n\n`);
        if (typeof (res as any).flush === "function") (res as any).flush();
      },
    );

    const totalTokens = TOKENS_PER_REQUEST;
    res.write(`data: ${JSON.stringify({ done: true, tokens: totalTokens, provider })}\n\n`);
    res.end();

    if (req.isAuthenticated() && req.user?.id) {
      await deductTokens(req.user.id, TOKENS_PER_REQUEST);
    }
  } catch (err) {
    req.log.error({ err }, "open-assist unexpected error");
    res.write(`data: ${JSON.stringify({ error: "Something went wrong. Please try again.", done: true })}\n\n`);
    res.end();
  }
});

export default router;
