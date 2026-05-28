// ─────────────────────────────────────────────────────────────────────────────
// src/lib/store.ts — Postgres-backed document store (Week 3)
//
// REPLACED THE IN-MEMORY MAP:
//   The Week 2 version stored everything in a JavaScript Map keyed by
//   filename. Worked great until a) you restarted the dev server, b) a
//   Vercel cold start spun up a new function instance, or c) requests
//   happened to land on two different instances. Now everything goes to
//   Supabase Postgres and survives all three.
//
// PUBLIC API (intentionally similar to the old Map version so callers
// barely changed):
//   saveDocument(doc)            -> Promise<void>
//   listDocuments()              -> Promise<DocumentSummary[]>
//   getDocument(filename)        -> Promise<DocumentSummary | null>
//   deleteDocument(filename)     -> Promise<boolean>
//
// EVERY FUNCTION IS ASYNC because they all hit the database. The upload
// route now `await`s saveDocument; the old fire-and-forget pattern would
// have returned success to the client before the rows were actually
// committed.
//
// SAVE STRATEGY — DELETE + INSERT INSIDE A TRANSACTION:
//   Re-uploading a PDF with the same filename should overwrite, not merge.
//   The simplest correct way: delete the existing documents row (chunks
//   cascade via ON DELETE CASCADE), then insert the new rows. Wrapped in
//   sql.begin() so the partial state is never visible to other reads if
//   we crash mid-way.
//
// BULK CHUNK INSERT — UNNEST:
//   A 100-page PDF produces ~100 chunks. Inserting them one at a time
//   would be 100 round-trips to Supabase (~3s extra latency over a
//   Singapore connection). UNNEST lets us pass parallel arrays and INSERT
//   all rows in a single statement. The pgvector explicit cast
//   `::vector(384)` is required: pgvector does NOT auto-convert text
//   literals to vectors, so we tell it explicitly.
//
// WHAT WE DON'T STORE:
//   The full PDF text. We only store its char_count (for the UI summary)
//   and the chunked pieces with their embeddings. The full text was a
//   debugging field in the Map version; redundant once we have chunks.
// ─────────────────────────────────────────────────────────────────────────────

import { getSql, ensureSchema } from "./db";

// Input shape — what callers pass to saveDocument. Same fields the upload
// route was already building.
export type StoredChunk = {
  text: string;
  embedding: number[]; // 384-D vector from all-MiniLM-L6-v2
};

export type StoredDocument = {
  filename: string;
  text: string; // full PDF text — used only for char_count, not persisted
  chunks: StoredChunk[];
  uploadedAt: Date;
};

// Output shape — what listDocuments / getDocument return. Lightweight,
// no chunks loaded.
export type DocumentSummary = {
  filename: string;
  charCount: number;
  chunkCount: number;
  uploadedAt: Date;
};

/**
 * Save a document and all its chunks. Replaces any existing document with
 * the same filename. All writes happen in a single transaction.
 */
export async function saveDocument(doc: StoredDocument): Promise<void> {
  await ensureSchema();
  const sql = getSql();

  await sql.begin(async (tx) => {
    // Step 1: wipe any prior version. The FK on chunks(filename) has
    // ON DELETE CASCADE so chunk rows go with it automatically.
    await tx`DELETE FROM documents WHERE filename = ${doc.filename}`;

    // Step 2: insert the parent documents row.
    await tx`
      INSERT INTO documents (filename, char_count, uploaded_at)
      VALUES (${doc.filename}, ${doc.text.length}, ${doc.uploadedAt})
    `;

    // Step 3: bulk-insert all chunks in one statement via UNNEST.
    // We build three parallel arrays (indices, texts, embeddings) and let
    // Postgres zip them into rows. Each embedding starts life as a
    // number[] from the embedding model; we serialize to "[0.1,0.2,...]"
    // because that's pgvector's textual literal format.
    if (doc.chunks.length > 0) {
      const indices = doc.chunks.map((_, i) => i);
      const texts = doc.chunks.map((c) => c.text);
      const embeddings = doc.chunks.map(
        (c) => `[${c.embedding.join(",")}]`,
      );

      await tx`
        INSERT INTO chunks (filename, chunk_index, text, embedding)
        SELECT
          ${doc.filename},
          u.idx,
          u.t,
          u.e::vector(384)
        FROM UNNEST(
          ${indices}::int[],
          ${texts}::text[],
          ${embeddings}::text[]
        ) AS u(idx, t, e)
      `;
    }
  });
}

/**
 * Return a summary row for every uploaded document. Most-recent first.
 * Does NOT load chunk text or embeddings — keeps the response small for
 * listings.
 */
export async function listDocuments(): Promise<DocumentSummary[]> {
  await ensureSchema();
  const sql = getSql();

  const rows = await sql<DocumentSummary[]>`
    SELECT
      d.filename,
      d.char_count            AS "charCount",
      COUNT(c.id)::int        AS "chunkCount",
      d.uploaded_at           AS "uploadedAt"
    FROM documents d
    LEFT JOIN chunks c ON c.filename = d.filename
    GROUP BY d.filename, d.char_count, d.uploaded_at
    ORDER BY d.uploaded_at DESC
  `;
  return Array.from(rows);
}

/**
 * Look up one document by filename. Returns null if not found.
 */
export async function getDocument(
  filename: string,
): Promise<DocumentSummary | null> {
  await ensureSchema();
  const sql = getSql();

  const rows = await sql<DocumentSummary[]>`
    SELECT
      d.filename,
      d.char_count                                            AS "charCount",
      (SELECT COUNT(*)::int FROM chunks WHERE filename = d.filename)
                                                              AS "chunkCount",
      d.uploaded_at                                           AS "uploadedAt"
    FROM documents d
    WHERE d.filename = ${filename}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Delete a document and all its chunks. Returns true if a row was deleted,
 * false if no document with that filename existed.
 */
export async function deleteDocument(filename: string): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();

  const result = await sql`
    DELETE FROM documents WHERE filename = ${filename}
  `;
  // postgres-js exposes affected row count on the result object's .count.
  return result.count > 0;
}
