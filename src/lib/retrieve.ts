// ─────────────────────────────────────────────────────────────────────────────
// src/lib/retrieve.ts — top-K similarity search via pgvector
//
// WHAT CHANGED IN WEEK 3:
//   The Week 2 version pulled every chunk from the in-memory Map and did
//   the dot-product loop in JavaScript. Now the chunks live in Postgres
//   and pgvector does the work for us — we send the query embedding to
//   the DB and let it return the top-K rows already sorted.
//
// THE SQL, EXPLAINED:
//
//   SELECT
//     filename,
//     chunk_index,
//     text,
//     1 - (embedding <=> $1::vector) AS score      ← (1)
//   FROM chunks
//   WHERE embedding <=> $1::vector <= $2           ← (2)
//   ORDER BY embedding <=> $1::vector ASC          ← (3)
//   LIMIT $3                                       ← (4)
//
//   (1) `<=>` is pgvector's cosine-distance operator. For normalized
//       embeddings, similarity = 1 - distance, so we convert here to
//       match our existing [0, 1]-ish scoring convention.
//
//   (2) Apply the minimum-similarity threshold as a maximum-distance
//       filter. If the caller wants minScore=0.3, we want distance<=0.7.
//       Filtering in SQL means low-relevance chunks never leave the DB.
//
//   (3) Sort by raw distance ASC (= similarity DESC). This is the clause
//       pgvector's HNSW index actually accelerates — instead of scoring
//       every chunk, the index navigates the high-dimensional graph and
//       skips most of them. At our current scale (~hundreds of chunks)
//       brute force is still fast, but the index is already in place so
//       the query plan upgrades for free when we add more documents.
//
//   (4) Cap the result count.
//
// WHY WE DON'T `SELECT embedding`:
//   We never need the raw 384-D vector on the client. Asking for it would
//   bloat each row with ~1.5 KB of JSON-encoded floats per result. Just
//   project text + filename + chunk_index + score.
//
// EMPTY-RESULT BEHAVIOR (unchanged from Week 2):
//   - No documents uploaded yet → 0 rows → return []
//   - All chunks fall below threshold → 0 rows → return []
//   Callers treat empty as "no context — just chat normally."
// ─────────────────────────────────────────────────────────────────────────────

import { embed } from "./embed";
import { getSql, ensureSchema } from "./db";

/**
 * Default minimum cosine similarity to qualify as a "relevant" chunk.
 * Chunks scoring below this are dropped from the result. Tune up for
 * stricter (fewer false positives, more false negatives) or down for
 * looser retrieval. 0 disables the filter entirely.
 */
export const DEFAULT_MIN_SCORE = 0.3;

export type RetrievedChunk = {
  text: string;
  score: number; // 1 - cosine_distance. Range is theoretically [-1, 1] but
  //                normalized sentence embeddings practically score [0, 1].
  filename: string; // Which PDF the chunk came from
  chunkIndex: number; // Position of the chunk within that PDF
};

/**
 * Embed `query`, run a pgvector top-K query, return the matching chunks.
 *
 * Returns an empty array when:
 *   - no documents are stored, OR
 *   - no chunk's similarity crosses minScore.
 */
export async function retrieveTopK(
  query: string,
  k = 4,
  minScore: number = DEFAULT_MIN_SCORE,
): Promise<RetrievedChunk[]> {
  await ensureSchema();
  const sql = getSql();

  // Embed the question using the SAME model that produced the chunk
  // embeddings (all-MiniLM-L6-v2). Same model → same vector space → the
  // numbers are comparable. Different model would produce gibberish
  // similarities even between identical text.
  const queryEmbedding = await embed(query);

  // pgvector accepts vectors as their textual literal form: "[0.1,0.2,...]".
  // We then cast with ::vector in SQL.
  const queryVec = `[${queryEmbedding.join(",")}]`;

  // Distance threshold corresponding to the similarity threshold the
  // caller asked for. score = 1 - distance  →  distance = 1 - score.
  const maxDistance = 1 - minScore;

  const rows = await sql<
    {
      filename: string;
      chunkIndex: number;
      text: string;
      score: number;
    }[]
  >`
    SELECT
      filename,
      chunk_index                            AS "chunkIndex",
      text,
      1 - (embedding <=> ${queryVec}::vector) AS score
    FROM chunks
    WHERE embedding <=> ${queryVec}::vector <= ${maxDistance}
    ORDER BY embedding <=> ${queryVec}::vector ASC
    LIMIT ${k}
  `;

  // postgres-js returns numeric columns as JS numbers already, so no
  // parsing needed. Just hand back as RetrievedChunk[].
  return rows.map((r) => ({
    filename: r.filename,
    chunkIndex: r.chunkIndex,
    text: r.text,
    score: r.score,
  }));
}
