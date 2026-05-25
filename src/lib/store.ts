// ─────────────────────────────────────────────────────────────────────────────
// src/lib/store.ts — IN-MEMORY DOCUMENT STORE (Week 2 only)
//
// WHAT THIS IS: a plain Map living in server-process memory. Every uploaded
// PDF's parsed text lives here until the function instance dies. That's it.
// No DB, no persistence, no concurrency control.
//
// WHY IN-MEMORY:
//   We deliberately keep Week 2 dead simple. Once basic RAG works end-to-end,
//   Week 3 swaps this out for SQLite + sqlite-vec (real vector search,
//   survives restarts, supports multiple users).
//
// WHAT BREAKS WITH THIS APPROACH:
//   1. Cold starts wipe everything. On Vercel, the function instance is
//      torn down after ~5 min of inactivity. Next request starts fresh →
//      every uploaded PDF is gone.
//   2. Multiple Vercel function instances each have their OWN map. If your
//      upload lands on instance A but your chat lands on instance B, the
//      PDF doesn't exist from B's perspective. (For Week 2 with a single
//      user, this is acceptable. We'll cry about it in Week 3.)
//   3. No real concurrency safety. Two uploads at the same time can race —
//      not a problem for a single user but worth knowing.
//
// SHAPE OF THE STORE: each document keyed by filename. We add `chunks` and
// `embeddings` arrays in later tasks (19, 20). For Task 18, we only store
// the raw extracted text.
// ─────────────────────────────────────────────────────────────────────────────

export type StoredChunk = {
  // The actual text content of this chunk
  text: string;
  // 384-dimensional embedding vector. Populated in Task 20.
  embedding: number[];
};

export type StoredDocument = {
  filename: string;
  // Full extracted text (handy for debugging; not used for retrieval)
  text: string;
  // Chunked + embedded representation. Empty until Tasks 19/20 run.
  chunks: StoredChunk[];
  uploadedAt: Date;
};

// `globalThis` trick: in Next.js dev mode, hot reload re-evaluates this file
// on every save, which would normally reset our Map. Stashing it on
// globalThis means the Map survives hot reloads. In production this is just
// a normal Map — globalThis access happens once at module load.
const globalForStore = globalThis as unknown as {
  documentStore?: Map<string, StoredDocument>;
};

export const documentStore: Map<string, StoredDocument> =
  globalForStore.documentStore ?? new Map();

if (process.env.NODE_ENV !== "production") {
  globalForStore.documentStore = documentStore;
}

// Tiny helpers so callers don't have to think about Map mechanics.
export function saveDocument(doc: StoredDocument): void {
  documentStore.set(doc.filename, doc);
}

export function getDocument(filename: string): StoredDocument | undefined {
  return documentStore.get(filename);
}

export function listDocuments(): StoredDocument[] {
  return Array.from(documentStore.values());
}

export function deleteDocument(filename: string): boolean {
  return documentStore.delete(filename);
}
