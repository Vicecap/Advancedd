import { db, studyResourcesTable } from "@workspace/db";
import { count, like, sql } from "drizzle-orm";
import { logger } from "./lib/logger";

const NEW_API_URL = "http://63.142.251.202:5080/all";

const OLD_URL_PATTERN = "sea-proxy.windystorage.com";

type NewApiPaper = {
  title: string;
  pdf: string;
  subject: string;
  level: string;
  source: string;
};

type SeedRow = {
  title: string;
  board: "zimsec" | "cambridge";
  category: "past_papers" | "green_books" | "textbooks";
  subject: string;
  level: string;
  fileName: string;
  mimeType: string;
  description: string | null;
  externalUrl: string;
};

const SUBJECT_MAP: Record<string, string> = {
  "math": "Mathematics",
  "maths": "Mathematics",
  "physics": "Physics",
  "chemistry": "Chemistry",
  "biology": "Biology",
  "science": "Combined Science",
  "computer": "Computer Science",
  "english": "English Language",
  "history": "History",
  "geography": "Geography",
  "commerce": "Commerce",
  "accounts": "Accounts",
  "economics": "Economics",
  "agriculture": "Agriculture",
  "heritage": "Heritage Studies",
  "religious": "Religious Studies",
  "ndebele": "Ndebele",
  "shona": "Shona",
  "general": "General",
};

function normalizeSubject(raw: string | undefined): string {
  if (!raw || raw === "undefined") return "General";
  const lower = raw.toLowerCase().trim();
  return SUBJECT_MAP[lower] ?? raw.trim().replace(/\b\w/g, c => c.toUpperCase());
}

function normalizeLevel(raw: string | undefined): string {
  if (!raw || raw === "undefined") return "o-level";
  const l = raw.toLowerCase().trim();
  if (l === "o level" || l === "o-level") return "o-level";
  if (l === "a level" || l === "a-level") return "a-level";
  if (l.startsWith("form")) return "o-level";
  if (l === "zjc") return "o-level";
  return "o-level";
}

function guessCategory(title: string, level: string): "past_papers" | "green_books" | "textbooks" {
  const t = title.toLowerCase();
  if (t.includes("note") || t.includes("textbook") || t.includes("book") ||
      t.includes("sample") || t.includes("guide") || t.includes("pack") ||
      t.includes("revision") || t.includes("study") || t.includes("grammar") ||
      t.includes("companion") || t.includes("focus") || t.includes("form ")) {
    return "textbooks";
  }
  if (t.includes("marking") || t.includes("answer") || t.includes("scheme") ||
      t.includes("green book") || t.includes("greenbook")) {
    return "green_books";
  }
  return "past_papers";
}

function fileNameFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/");
    const last = parts[parts.length - 1];
    return decodeURIComponent(last) || "paper.pdf";
  } catch {
    return "paper.pdf";
  }
}

async function fetchNewPapers(): Promise<SeedRow[]> {
  const res = await fetch(NEW_API_URL, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Failed to fetch papers API: ${res.status}`);

  const papers = await res.json() as NewApiPaper[];

  return papers
    .filter(p => p.pdf && p.pdf.startsWith("http"))
    .map((p): SeedRow => {
      const subject = normalizeSubject(p.subject);
      const level = normalizeLevel(p.level);
      const category = guessCategory(p.title, level);
      const source = (p.source && p.source !== "undefined") ? p.source : "zimsec";
      const description = `${source} · ${p.level ?? ""}`.replace(/· $/, "").trim() || null;

      return {
        title: p.title.trim().slice(0, 255),
        board: "zimsec",
        category,
        subject,
        level,
        fileName: fileNameFromUrl(p.pdf),
        mimeType: "application/pdf",
        description,
        externalUrl: p.pdf,
      };
    });
}

async function hasOldData(): Promise<boolean> {
  try {
    const [result] = await db
      .select({ n: count() })
      .from(studyResourcesTable)
      .where(like(studyResourcesTable.externalUrl, `%${OLD_URL_PATTERN}%`));
    return (result?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

async function clearAllResources(): Promise<void> {
  await db.execute(sql`DELETE FROM study_resources`);
}

export async function seedStudyResources(): Promise<void> {
  // Check if we have stale data from the old dead-link source
  const stale = await hasOldData();
  if (stale) {
    logger.info("Found old dead-link data — clearing and re-seeding from new API...");
    try {
      await clearAllResources();
      logger.info("Cleared old study resources");
    } catch (err) {
      logger.error({ err }, "Failed to clear old study resources");
      return;
    }
  } else {
    const [{ value }] = await db.select({ value: count() }).from(studyResourcesTable);
    if (value > 0) {
      logger.info({ count: value }, "study_resources already seeded, skipping");
      return;
    }
  }

  logger.info("Seeding study resources from new API...");

  let rows: SeedRow[];
  try {
    rows = await fetchNewPapers();
    logger.info({ count: rows.length }, "Fetched papers from new API");
  } catch (err) {
    logger.error({ err }, "Failed to fetch papers for seeding");
    return;
  }

  const BATCH = 50;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    try {
      await db.insert(studyResourcesTable).values(
        batch.map(r => ({
          title: r.title,
          board: r.board,
          category: r.category,
          subject: r.subject,
          level: r.level,
          objectPath: undefined,
          fileName: r.fileName,
          fileSize: undefined,
          mimeType: r.mimeType,
          description: r.description ?? undefined,
          externalUrl: r.externalUrl,
          uploadedBy: undefined,
        }))
      );
      inserted += batch.length;
    } catch (err) {
      logger.error({ err, batchStart: i }, "Failed to insert seed batch");
    }
  }

  logger.info({ inserted }, "Seeded study resources successfully");
}
