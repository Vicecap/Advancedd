import { Queue, Worker, type Job } from "bullmq";
import { getRedis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { emitToUser } from "./ws.js";

const CONCURRENCY = parseInt(process.env["QUEUE_CONCURRENCY"] ?? "3", 10);

export interface AIJobData {
  userId: string | null;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  cacheKey?: string;
}

export interface OCRJobData {
  userId: string | null;
  filePath: string;
  mimeType: string;
}

export interface JobResult {
  response?: string;
  text?: string;
  tokensUsed?: number;
  error?: string;
}

let aiQueue: Queue<AIJobData, JobResult> | null = null;
let ocrQueue: Queue<OCRJobData, JobResult> | null = null;

export function getAIQueue(): Queue<AIJobData, JobResult> | null {
  return aiQueue;
}

export function getOCRQueue(): Queue<OCRJobData, JobResult> | null {
  return ocrQueue;
}

export function setupQueues(): void {
  const redis = getRedis();
  if (!redis) {
    logger.info("Redis unavailable — BullMQ background queues disabled");
    return;
  }

  const opts = redis.options;
  const connection = {
    host: (opts.host as string | undefined) ?? "127.0.0.1",
    port: (opts.port as number | undefined) ?? 6379,
    password: opts.password as string | undefined,
    db: opts.db as number | undefined,
    tls: opts.tls as object | undefined,
  };

  aiQueue = new Queue<AIJobData, JobResult>("ai-jobs", {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 500,
      removeOnFail: 200,
    },
  });

  ocrQueue = new Queue<OCRJobData, JobResult>("ocr-jobs", {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 200,
      removeOnFail: 100,
    },
  });

  const aiWorker = new Worker<AIJobData, JobResult>(
    "ai-jobs",
    async (job: Job<AIJobData, JobResult>): Promise<JobResult> => {
      const { userId, model, systemPrompt, userPrompt } = job.data;

      const { openrouter } = await import("@workspace/integrations-openrouter-ai");
      const completion = await openrouter.chat.completions.create({
        model,
        messages: ([
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ] as any),
        max_tokens: 8192,
      });

      const response = completion.choices[0]?.message?.content ?? "";
      const tokensUsed = completion.usage?.total_tokens ?? 0;

      if (userId) {
        emitToUser(userId, {
          type: "AI_JOB_DONE",
          jobId: job.id,
          response,
          tokensUsed,
        });
      }

      return { response, tokensUsed };
    },
    { connection, concurrency: CONCURRENCY },
  );

  const ocrWorker = new Worker<OCRJobData, JobResult>(
    "ocr-jobs",
    async (job: Job<OCRJobData, JobResult>): Promise<JobResult> => {
      const { userId, filePath, mimeType } = job.data;

      const { openrouter } = await import("@workspace/integrations-openrouter-ai");
      const fs = await import("node:fs/promises");
      const imageBuffer = await fs.readFile(filePath);
      const dataUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
      await fs.unlink(filePath).catch(() => {});

      const completion = await openrouter.chat.completions.create({
        model: "google/gemini-2.0-flash-001",
        messages: ([
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
        ] as any),
        max_tokens: 1024,
      });

      const text = completion.choices[0]?.message?.content?.trim() ?? "";

      if (userId) {
        emitToUser(userId, {
          type: "OCR_COMPLETE",
          jobId: job.id,
          text,
        });
      }

      return { text };
    },
    { connection, concurrency: CONCURRENCY },
  );

  aiWorker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "AI job failed");
  });

  ocrWorker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "OCR job failed");
  });

  logger.info({ concurrency: CONCURRENCY }, "BullMQ queues and workers initialized");
}
