const API_BASE = "/api/v1";

type Params = Record<string, string | number | boolean | null | undefined>;

function qs(params: Params = {}) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") u.set(k, String(v)); });
  const s = u.toString();
  return s ? `?${s}` : "";
}

async function json<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error("Document API request failed");
  return res.json() as Promise<T>;
}

export function listDocuments(filters: Params = {}) { return json(`${API_BASE}/documents${qs(filters)}`); }
export function getDocument(id: string | number) { return json(`${API_BASE}/documents/${encodeURIComponent(String(id))}`); }
export function getDocumentFormats(id: string | number) { return json(`${API_BASE}/documents/${encodeURIComponent(String(id))}/formats`); }
export function getDocumentPreview(id: string | number) { return json(`${API_BASE}/documents/${encodeURIComponent(String(id))}/preview`); }
export function downloadDocument(id: string | number) { return `${API_BASE}/documents/${encodeURIComponent(String(id))}/download`; }
export function getDocumentStats() { return json(`${API_BASE}/documents/stats`); }
export function searchDocuments(params: Params = {}) { return json(`${API_BASE}/search${qs(params)}`); }
export function searchByTitle(title: string, exact = false) { return json(`${API_BASE}/search/title${qs({ title, exact })}`); }
export function searchByAuthor(author: string) { return json(`${API_BASE}/search/author${qs({ author })}`); }
export function getSearchSuggestions(q: string) { return json(`${API_BASE}/search/suggestions${qs({ q })}`); }
export function getSearchCategories() { return json(`${API_BASE}/search/categories`); }
export function getSearchFilters() { return json(`${API_BASE}/search/filters`); }
