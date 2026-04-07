/**
 * Seed script: parse zimsec papers JS and bulk-insert into study_resources.
 * Run: node scripts/seed-zimsec.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// --- Parse the JS file to extract the data object ---
const raw = fs.readFileSync("/tmp/zimsec_papers.js", "utf8");

// The file format is:
//   function getData(){
//   let dt={
//     ...JSON content...
//   };
//   }
// Extract everything from the first `{` on line 2 to the `};` line.
const lines = raw.split("\n");

// Find the line with `let dt={` and take everything from that `{`
const startLineIdx = lines.findIndex(l => l.match(/let\s+dt\s*=\s*\{/));
if (startLineIdx === -1) {
  console.error("Could not find 'let dt={' in file");
  process.exit(1);
}

// Find the closing `};` line after the start
let endLineIdx = -1;
for (let i = lines.length - 1; i > startLineIdx; i--) {
  if (lines[i].trim() === "};") {
    endLineIdx = i;
    break;
  }
}
if (endLineIdx === -1) {
  console.error("Could not find closing '};' in file");
  process.exit(1);
}

// Reconstruct just the JSON object
const jsonLines = lines.slice(startLineIdx, endLineIdx + 1);
// Replace the first line `let dt={` with `{`
jsonLines[0] = jsonLines[0].replace(/.*let\s+dt\s*=\s*/, "");
// Replace the last line `};` with `}`
jsonLines[jsonLines.length - 1] = "}";

const jsonStr = jsonLines.join("\n");

let papers;
try {
  papers = JSON.parse(jsonStr);
} catch (e) {
  console.error("JSON parse failed:", e.message);
  process.exit(1);
}

const allPapers = Object.values(papers);
console.log(`Total papers in file: ${allPapers.length}`);

// --- Filter: must be verified, have a valid download URL, and have useful metadata ---
const TYPE_TO_CATEGORY = {
  "Question Paper": "past_papers",
  "Marking Scheme": "green_books",
  "Answer": "green_books",
  "Past Paper": "past_papers",
  "Notes": "textbooks",
  "Textbook": "textbooks",
};

const SUBJECT_CLEAN = {
  "maths": "Mathematics",
  "mathematics": "Mathematics",
  "english language": "English Language",
  "english lit": "English Literature",
  "english literature": "English Literature",
  "physics": "Physics",
  "chemistry": "Chemistry",
  "biology": "Biology",
  "combined science": "Combined Science",
  "history": "History",
  "geography": "Geography",
  "commerce": "Commerce",
  "accounts": "Accounts",
  "accounting": "Accounts",
  "economics": "Economics",
  "computer science": "Computer Science",
  "agriculture": "Agriculture",
  "art": "Art & Design",
};

function cleanSubject(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  return SUBJECT_CLEAN[lower] ?? raw.trim().replace(/\b\w/g, c => c.toUpperCase());
}

function categoryFromType(type) {
  if (!type) return "past_papers";
  const lower = type.toLowerCase();
  if (lower.includes("marking") || lower.includes("answer") || lower.includes("scheme")) return "green_books";
  if (lower.includes("note") || lower.includes("textbook") || lower.includes("book")) return "textbooks";
  return "past_papers";
}

const valid = allPapers.filter(p => {
  const url = (p.s3Url || p.downloadURL || "").trim();
  if (!url) return false;
  if (!p.subject || p.subject.length > 200) return false;
  if (!p.isFileVerified) return false;
  return true;
});

console.log(`Valid papers (verified + has URL): ${valid.length}`);

// --- Group by level ---
const byLevel = { "o-level": 0, "a-level": 0, other: 0 };
valid.forEach(p => {
  const lv = (p.level || "").toLowerCase().trim();
  if (lv === "o level" || lv === "o-level") byLevel["o-level"]++;
  else if (lv === "a level" || lv === "a-level") byLevel["a-level"]++;
  else byLevel.other++;
});
console.log("By level:", byLevel);

// --- Build rows ---
const rows = valid.map(p => {
  const url = (p.s3Url || p.downloadURL || "").trim();
  const lv = (p.level || "").toLowerCase().trim();
  const levelNorm = (lv === "o level" || lv === "o-level") ? "o-level" : "a-level";
  const category = categoryFromType(p.type);
  const subject = cleanSubject(p.subject) || "General";
  const year = (p.year && p.year > 0) ? p.year : null;
  const paper = (p.paper && p.paper > 0) ? p.paper : null;

  let title = p.fileName || p.seoTitle || subject;
  // Normalise title: capitalise
  title = title.trim().replace(/\b\w/g, c => c.toUpperCase());
  if (title.length > 255) title = title.slice(0, 252) + "...";

  const description = [
    p.type,
    paper ? `Paper ${paper}` : null,
    p.month ? p.month.charAt(0).toUpperCase() + p.month.slice(1) : null,
  ].filter(Boolean).join(" · ");

  return {
    title,
    board: "zimsec",
    category,
    subject,
    year,
    level: levelNorm,
    object_path: null,
    file_name: (p.s3FileName || p.fileName || `paper-${p.id}.pdf`).slice(0, 255),
    file_size: p.fileSize ? Math.round(p.fileSize * 1024 * 1024) : null,
    mime_type: "application/pdf",
    description: description || null,
    external_url: url,
    uploaded_by: null,
  };
});

console.log(`Rows to insert: ${rows.length}`);

// --- Insert into DB ---
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BATCH = 50;
let inserted = 0;

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const values = [];
  const params = [];
  let idx = 1;
  for (const r of batch) {
    values.push(`($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++})`);
    params.push(
      r.title, r.board, r.category, r.subject, r.year, r.level,
      r.object_path, r.file_name, r.file_size, r.mime_type,
      r.description, r.external_url, r.uploaded_by
    );
  }
  const sql = `
    INSERT INTO study_resources
      (title, board, category, subject, year, level, object_path, file_name, file_size, mime_type, description, external_url, uploaded_by)
    VALUES ${values.join(",")}
    ON CONFLICT DO NOTHING
  `;
  await pool.query(sql, params);
  inserted += batch.length;
  process.stdout.write(`\r  Inserted ${inserted}/${rows.length} rows...`);
}

console.log(`\nDone! Seeded ${inserted} ZIMSEC papers.`);
await pool.end();
