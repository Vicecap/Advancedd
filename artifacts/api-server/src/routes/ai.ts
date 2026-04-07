import { Router, type IRouter } from "express";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import { db, computationsTable, tokenBalancesTable, studyResourcesTable, usersTable } from "@workspace/db";
import { eq, sql, or, ilike } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { getCachedAIResponse, setCachedAIResponse } from "../services/ai-cache.js";
import { redisRateLimit } from "../lib/rate-limiter.js";

const router: IRouter = Router();

const AVAILABLE_MODELS = [
  { id: "qwen/qwen3.5-9b",            label: "Qwen Fast (9B)",       sub: "Quick answers",    recommended: false },
  { id: "qwen/qwen3.5-27b",           label: "Qwen Balanced (27B)",  sub: "General use",      recommended: false },
  { id: "qwen/qwen3.5-122b-a10b",     label: "Qwen Powerful (122B)", sub: "Complex problems", recommended: true  },
  { id: "mistralai/mistral-small-2603", label: "Mistral Small",      sub: "Fast & precise",   recommended: false },
  { id: "openai/gpt-5.4-mini",        label: "GPT-5.4 Mini",         sub: "OpenAI model",     recommended: false },
];

async function deductTokens(userId: string, amount: number): Promise<void> {
  try {
    const [user] = await db.select({ isPremium: usersTable.isPremium }).from(usersTable).where(eq(usersTable.id, userId));
    if (user?.isPremium) return;
    await db
      .update(tokenBalancesTable)
      .set({
        balance: sql`GREATEST(0, ${tokenBalancesTable.balance} - ${amount})`,
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

router.get("/ais", (_req, res): void => {
  res.json({ models: AVAILABLE_MODELS });
});

const PERSONALITY_PROMPTS: Record<string, string> = {
  friendly: `You are a friendly, encouraging math tutor named ZimSolve. Use a warm, supportive tone with relatable real-world examples and gentle encouragement. Celebrate good thinking! When given a math problem, solve it step by step. Format your response with clear numbered steps. At the end, provide a "Final Answer:" line with just the result. Keep it approachable and motivating.`,
  strict: `You are a strict, rigorous mathematics teacher. Use formal academic language, show all working with full mathematical precision, and correct potential misconceptions directly. When given a math problem, solve it step by step with complete mathematical rigour. Format your response with clear numbered steps showing all intermediate working. At the end, provide a "Final Answer:" line with just the result.`,
  exam: `You are a ZIMSEC/Cambridge O-Level exam coach. Structure your solutions exactly as a mark scheme would expect: show all required working, use proper mathematical notation, and note where method marks (M) and accuracy marks (A) would be awarded. When given a math problem, solve it step by step in exam format. Format your response with clear numbered steps. At the end, provide a "Final Answer:" line with just the result.`,
};

router.get("/solve-stream", async (req, res): Promise<void> => {
  const { question, ai, topic, personality } = req.query as Record<string, string>;

  if (!question) {
    res.status(400).json({ error: "question is required" });
    return;
  }

  const modelId = ai || "qwen/qwen3.5-9b";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const userId = req.isAuthenticated() ? req.user.id : null;

  try {
    const systemPrompt = PERSONALITY_PROMPTS[personality] ??
      `You are a math tutor and problem solver. When given a math problem, solve it step by step. 
Format your response with clear numbered steps. At the end, provide a "Final Answer:" line with just the result.
Keep explanations clear and educational.`;

    const userPrompt = topic
      ? `${topic.toUpperCase()}: ${question}\n\nSolve this step by step.`
      : `Solve this step by step: ${question}`;

    const stream = await openrouter.chat.completions.create({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 8192,
    });

    let fullText = "";
    let buffer = "";
    const paragraphs: string[] = [];
    let totalTokens = 0;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content ?? "";
      fullText += content;
      buffer += content;

      if ((chunk as any).usage?.total_tokens) {
        totalTokens = (chunk as any).usage.total_tokens;
      }

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const para of parts) {
        if (para.trim()) {
          paragraphs.push(para.trim());
          send({ paragraph: para.trim() });
        }
      }
    }

    if (buffer.trim()) {
      paragraphs.push(buffer.trim());
      send({ paragraph: buffer.trim() });
    }

    const answerMatch = fullText.match(/Final Answer[:\s]+(.+?)(?:\n|$)/i);
    const answer = answerMatch ? answerMatch[1].trim() : fullText.split("\n").filter(Boolean).pop() ?? "";

    send({ answer, solution: answer, done: true });
    res.end();

    const estimatedTokens = totalTokens > 0 ? totalTokens : Math.max(100, Math.ceil(fullText.length / 4));
    const operationLabel = topic && topic !== "solve" ? topic : "solve";

    await saveToHistory(userId, question, operationLabel, answer, JSON.stringify(paragraphs));
    if (userId) await deductTokens(userId, estimatedTokens);

  } catch (err) {
    req.log.error({ err }, "AI solve-stream error");
    send({ error: (err as Error).message, done: true });
    res.end();
  }
});

const aiRateLimit = redisRateLimit({ windowSecs: 60, max: 20, keyPrefix: "rl:ai", message: "AI rate limit exceeded. Please wait a moment." });

router.post("/discuss", aiRateLimit, async (req, res): Promise<void> => {
  const { prompt, ai } = req.body as { prompt?: string; ai?: string };

  if (!prompt) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const modelId = ai || "qwen/qwen3.5-9b";
  const userId = req.isAuthenticated() ? req.user.id : null;

  const cachePromptKey = `discuss:${modelId}:${prompt}`;
  const cached = await getCachedAIResponse(modelId, cachePromptKey);
  if (cached) {
    res.json({ response: cached, cached: true });
    return;
  }

  try {
    const completion = await openrouter.chat.completions.create({
      model: modelId,
      messages: [
        {
          role: "system",
          content: "You are a knowledgeable study tutor and exam coach. When exam paper content is provided at the start of the message (marked [Exam Paper Content]), use the exact questions from that content to evaluate student answers accurately. Provide clear, detailed, and educational feedback with mark estimates and study tips.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 8192,
    });

    const response = completion.choices[0]?.message?.content ?? "No response generated.";
    const tokensUsed = completion.usage?.total_tokens ?? Math.max(100, Math.ceil(response.length / 4));

    res.json({ response });

    await setCachedAIResponse(modelId, cachePromptKey, response);
    if (userId) await deductTokens(userId, tokensUsed);
  } catch (err) {
    req.log.error({ err }, "AI discuss error");
    res.status(500).json({ error: (err as Error).message });
  }
});

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      cb(null, `ocr-${Date.now()}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

router.post("/homework", aiRateLimit, async (req, res): Promise<void> => {
  const { content, question, mode, ai, subject } = req.body as {
    content?: string;
    question?: string;
    mode?: string;
    ai?: string;
    subject?: string;
  };

  if (!content && !question) {
    res.status(400).json({ error: "content or question is required" });
    return;
  }

  const modelId = ai || "qwen/qwen3.5-27b";
  const userId = req.isAuthenticated() ? req.user.id : null;

  const cacheKey = `homework:${modelId}:${mode}:${subject}:${question}:${content?.slice(0, 200)}`;
  const cached = await getCachedAIResponse(modelId, cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { response: string; relevantResources: unknown[] };
      res.json({ ...parsed, cached: true });
      return;
    } catch {
      // fall through to live call
    }
  }

  let relevantResources: { title: string; subject: string; category: string; year: number | null }[] = [];
  try {
    const subjectKeyword = subject || "";
    const conditions = subjectKeyword
      ? [ilike(studyResourcesTable.subject, `%${subjectKeyword}%`), ilike(studyResourcesTable.title, `%${subjectKeyword}%`)]
      : [];

    const resources = await db
      .select({
        title: studyResourcesTable.title,
        subject: studyResourcesTable.subject,
        category: studyResourcesTable.category,
        year: studyResourcesTable.year,
      })
      .from(studyResourcesTable)
      .where(conditions.length > 0 ? or(...conditions) : undefined)
      .limit(6);

    relevantResources = resources;
  } catch (_err) {
    // non-fatal
  }

  const resourceContext = relevantResources.length > 0
    ? `\n\n[Available Study Resources in Library]\n${relevantResources.map(r => `- ${r.title} (${r.subject}, ${r.category}${r.year ? `, ${r.year}` : ""})`).join("\n")}\nUse these resources as references in your response where relevant.`
    : "";

  const modeInstructions: Record<string, string> = {
    help: "Help the student understand and work through this homework step by step. Explain concepts clearly and guide them to the answer rather than just giving it.",
    solve: "Solve this homework completely and show all working steps clearly so the student can learn the method.",
    review: "Review the student's submitted work. Check for correctness, identify mistakes, suggest improvements, and give constructive feedback.",
    research: "Research this topic thoroughly. Explain the key concepts, provide relevant examples, and reference any related past exam papers or textbooks that would help.",
  };

  const instruction = modeInstructions[mode ?? "help"] ?? modeInstructions.help;

  const systemPrompt = `You are an expert academic tutor specializing in secondary and high school subjects including mathematics, science, and humanities. ${instruction}${resourceContext}

Always structure your response clearly with:
1. A brief overview
2. Step-by-step working or explanation
3. Key points to remember
4. Any relevant study tips or resource recommendations`;

  const userContent = [
    content ? `[Homework Content]\n${content}` : "",
    question ? `[Student's Question / Instructions]\n${question}` : "",
  ].filter(Boolean).join("\n\n");

  try {
    const completion = await openrouter.chat.completions.create({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: 8192,
    });

    const response = completion.choices[0]?.message?.content ?? "No response generated.";
    const tokensUsed = completion.usage?.total_tokens ?? Math.max(200, Math.ceil(response.length / 4));

    await saveToHistory(
      userId,
      question || content?.slice(0, 200) || "Homework submission",
      "homework",
      response.slice(0, 500),
    );

    res.json({ response, relevantResources });

    await setCachedAIResponse(modelId, cacheKey, JSON.stringify({ response, relevantResources }));
    if (userId) await deductTokens(userId, tokensUsed);
  } catch (err) {
    req.log.error({ err }, "Homework AI error");
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/upload-image", upload.single("image"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No image file uploaded" });
    return;
  }

  const filePath = req.file.path;

  try {
    const imageBuffer = await fs.readFile(filePath);
    const mimeType = req.file.mimetype || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
    await fs.unlink(filePath).catch(() => {});

    const completion = await openrouter.chat.completions.create({
      model: "google/gemini-2.0-flash-001",
      messages: [
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
      ],
      max_tokens: 1024,
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    res.json({ text });
  } catch (err) {
    req.log.error({ err }, "OCR error");
    await fs.unlink(filePath).catch(() => {});
    res.status(500).json({ error: (err as Error).message });
  }
});

const FREE_AI_BASE = "http://63.142.251.202:4002";

router.post("/ai-book-search", aiRateLimit, async (req, res): Promise<void> => {
  const { query } = req.body as { query: string };
  if (!query?.trim()) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  const model = "qwen2.5:7b";
  const cacheKey = `book-search-free:${query.trim().toLowerCase()}`;
  const cached = await getCachedAIResponse(model, cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { keywords: string[]; query: string };
      res.json({ ...parsed, cached: true });
      return;
    } catch { /* fall through */ }
  }

  try {
    const freeRes = await fetch(`${FREE_AI_BASE}/discuss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are a library catalog search expert. When given any topic, subject, question, or concept the user wants to find books about, respond with ONLY a raw JSON array of strings.

The array must contain 20–30 items covering:
- Core keywords and synonyms for the topic
- Related sub-topics and adjacent fields
- Common title words for books on this subject
- Notable authors strongly associated with this topic
- Academic subject area terms used in library catalogs
- Beginner, intermediate, and advanced variants of the topic

Rules: Return ONLY a valid JSON array of strings. No markdown, no explanation, no code blocks. Just the raw JSON array.`,
          },
          { role: "user", content: query.trim() },
        ],
        max_tokens: 600,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!freeRes.ok) throw new Error(`Free AI error: ${freeRes.status}`);
    const data = await freeRes.json() as { choices?: Array<{ message?: { content?: string } }>; response?: string; message?: { content?: string } };
    // handle OpenAI-compatible, Ollama native, or direct message formats
    const raw = data.choices?.[0]?.message?.content?.trim()
      ?? data.message?.content?.trim()
      ?? (typeof data.response === "string" ? data.response.trim() : null)
      ?? "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    let keywords: string[] = [];
    if (match) {
      try { keywords = JSON.parse(match[0]); } catch { keywords = []; }
    }
    if (!keywords.length) {
      keywords = query.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
    }
    keywords = [...new Set(keywords.map((k: string) => k.toLowerCase().trim()).filter(Boolean))];

    const result = { keywords, query: query.trim() };
    res.json(result);
    await setCachedAIResponse(model, cacheKey, JSON.stringify(result));
  } catch (err) {
    req.log.warn({ err }, "AI book search error");
    // fallback: split query into keywords without AI
    const keywords = query.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
    res.json({ keywords, query: query.trim(), fallback: true });
  }
});

const VISION_MODELS = [
  "google/gemini-2.0-flash-001",
  "google/gemini-flash-1.5-8b",
  "meta-llama/llama-3.2-11b-vision-instruct",
  "openai/gpt-4o-mini",
];

router.post("/graph-ai-solve", async (req, res): Promise<void> => {
  const { imageDataUrl, prompt, model: modelId } = req.body as {
    imageDataUrl?: string;
    prompt?: string;
    model?: string;
  };

  if (!imageDataUrl) {
    res.status(400).json({ error: "imageDataUrl is required" });
    return;
  }

  const userId = req.isAuthenticated() ? req.user.id : null;

  const chosenModel = VISION_MODELS.includes(modelId ?? "") ? (modelId as string) : "google/gemini-2.0-flash-001";

  try {
    const systemPrompt = `You are a mathematics and science AI tutor specialising in ZIMSEC and Cambridge O-Level curriculum. You will receive an image that may contain a hand-drawn math question, a scanned exam problem, a graph, a pie chart, a bar chart, a geometry diagram, or mixed-fraction arithmetic. Look at the image carefully and provide a clear, structured, educational solution with full step-by-step working. If the image contains a graph or chart, describe what you see and explain its key features.`;

    const userText = prompt?.trim()
      ? `${prompt.trim()}\n\nPlease analyse and solve what is shown in the image.`
      : "Please identify the question, graph, or diagram in this image and provide a complete step-by-step solution or analysis.";

    const completion = await openrouter.chat.completions.create({
      model: chosenModel,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageDataUrl } },
            { type: "text", text: userText },
          ] as Parameters<typeof openrouter.chat.completions.create>[0]["messages"][0]["content"],
        },
      ],
      max_tokens: 3000,
    });

    const response = completion.choices[0]?.message?.content ?? "No response generated.";
    const tokensUsed = completion.usage?.total_tokens ?? Math.max(150, Math.ceil(response.length / 4));

    res.json({ response, model: chosenModel });

    if (userId) await deductTokens(userId, tokensUsed);
  } catch (err) {
    req.log.error({ err }, "Graph AI solve error");
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/open-assist", async (req, res): Promise<void> => {
  const { system, message, model } = req.body as { system?: string; message?: string; model?: string };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const userId = req.isAuthenticated() ? req.user?.id : null;
  const modelId = model || "qwen/qwen3.5-122b-a10b";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const systemPrompt = system?.trim()
    || "You are a helpful AI tutor for ZIMSEC and Cambridge O-Level students. Be clear, educational, and thorough.";

  try {
    const stream = await openrouter.chat.completions.create({
      model: modelId,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: message.trim() },
      ],
      max_tokens: 2500,
    });

    let fullText = "";
    let tokenCount = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullText += delta;
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        if (typeof res.flush === "function") res.flush();
      }
      if (chunk.usage) tokenCount = chunk.usage.total_tokens ?? 0;
    }

    if (!tokenCount) tokenCount = Math.max(50, Math.ceil(fullText.length / 4));
    res.write(`data: ${JSON.stringify({ done: true, tokens: tokenCount })}\n\n`);
    res.end();

    if (userId) await deductTokens(userId, tokenCount);
  } catch (err) {
    req.log.error({ err }, "open-assist error");
    res.write(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
    res.end();
  }
});

export default router;
