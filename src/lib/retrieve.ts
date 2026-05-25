// ─────────────────────────────────────────────────────────────────────────────
// src/lib/retrieve.ts — find the top-K chunks most relevant to a query
//
// WHAT THIS DOES:
//   1. Embed the user's query into the same 384-D vector space as our chunks.
//   2. Score every stored chunk against it using cosine similarity.
//   3. Sort, take the top K, return them.
//
// COSINE SIMILARITY SHORTCUT:
//   Normally: similarity(a, b) = (a · b) / (||a|| * ||b||)
//   But we set `normalize: true` in embed.ts → every vector has length 1.
//   ||a|| = ||b|| = 1 → division becomes a no-op.
//   So similarity collapses to just the dot product, which is the fastest
//   way you can compare two vectors: one tight loop, no sqrt, no divide.
//
// SCALE NOTE: this is a BRUTE-FORCE search — score every chunk for every
// query. With 128 chunks it takes <1 ms. With 100k chunks it'd take ~50 ms.
// With millions, you'd need an Approximate Nearest Neighbour index (HNSW,
// IVF-PQ, etc.) — that's why real vector DBs exist. We'll add SQLite +
// sqlite-vec in Week 3 for a step in that direction; for now brute force
// is fine.
// ─────────────────────────────────────────────────────────────────────────────

import { listDocuments } from "./store";
import { embed } from "./embed";

export type RetrievedChunk = {
  text: string;
  score: number; // Higher = more similar. Range is [-1, 1] but normalized
  //              embeddings from a sentence model usually score [0, 1].
  filename: string; // Which PDF the chunk came from
  chunkIndex: number; // Position of the chunk within that PDF
};

/** Dot product of two equal-length vectors. */
function dot(a: number[], b: number[]): number {
  // We assume a.length === b.length (both 384-D from the same model).
  // Skip the safety check in the hot loop; embeddings come from a single
  // controlled call site so a mismatch would be a programming bug, not
  // runtime data.
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * Embed `query`, score every chunk in the store, return the top K.
 * Returns an empty array if no documents have been uploaded yet — callers
 * should treat that as "no context available, just chat normally."
 */
export async function retrieveTopK(
  query: string,
  k = 4,
): Promise<RetrievedChunk[]> {
  const docs = listDocuments();
  if (docs.length === 0) return [];

  // Embed the question using the SAME model as the chunks. This is the
  // step that makes everything compatible — same vector space, same
  // dimensionality, same "axes".
  const queryEmbedding = await embed(query);

  // Brute-force scoring. Build a flat list of (chunk, score) pairs across
  // all documents.
  const scored: RetrievedChunk[] = [];
  for (const doc of docs) {
    doc.chunks.forEach((chunk, chunkIndex) => {
      // Defensive: skip chunks with no embedding (shouldn't happen post-Task 20)
      if (chunk.embedding.length === 0) return;
      scored.push({
        text: chunk.text,
        score: dot(queryEmbedding, chunk.embedding),
        filename: doc.filename,
        chunkIndex,
      });
    });
  }

  // Highest score first.
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
