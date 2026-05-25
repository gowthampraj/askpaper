// ─────────────────────────────────────────────────────────────────────────────
// src/lib/chunk.ts — text chunking for embeddings
//
// WHAT THIS DOES: takes a long blob of text (the parsed PDF) and slices it
// into smaller overlapping pieces ("chunks"). Each chunk gets its own
// embedding (Task 20). Smaller chunks → more precise retrieval but more
// vectors to search. Bigger chunks → fewer vectors but each is fuzzier in
// meaning.
//
// WHY OVERLAP: if a meaningful sentence happens to straddle a chunk
// boundary, both surrounding chunks should contain enough of it to make
// sense. Without overlap, retrieval might surface a chunk that ends
// mid-thought, and the LLM gets half a sentence as "context."
//
// CHOSEN PARAMETERS:
//   chunkSize = 1000 characters (~200 tokens — well under
//               all-MiniLM-L6-v2's 512-token limit)
//   overlap   = 200 characters (20% of chunk size)
// These are conventional defaults. Tune later if retrieval quality is poor.
//
// SPLITTING STRATEGY:
//   Pure character-window with overlap. The "smart" alternative is to split
//   on paragraph/sentence boundaries first (LangChain's RecursiveCharSplitter
//   does this), but it adds code we don't need yet. The overlap papers over
//   most boundary issues.
// ─────────────────────────────────────────────────────────────────────────────

export type ChunkOptions = {
  /** Target characters per chunk. */
  size: number;
  /** Overlap between consecutive chunks, in characters. */
  overlap: number;
};

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  size: 1000,
  overlap: 200,
};

/**
 * Normalize whitespace in PDF-extracted text:
 *   - Collapse runs of spaces/tabs to a single space
 *   - Collapse 3+ consecutive newlines to 2 (preserves paragraph breaks)
 *   - Trim each line
 *   - Strip leading/trailing whitespace overall
 *
 * PDF extraction tends to produce ragged text with stray spaces and lots of
 * blank lines. Normalizing here means every chunk is denser and the
 * embeddings reflect actual content, not whitespace patterns.
 */
function normalize(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/**
 * Split `text` into overlapping chunks. Returns an array of strings.
 *
 * The window advances by `size - overlap` each step. With size=1000 and
 * overlap=200, the window jumps 800 chars at a time, so a 10,000-char
 * document produces ~13 chunks.
 */
export function chunkText(
  text: string,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): string[] {
  const { size, overlap } = options;

  if (size <= 0) throw new Error("chunk size must be > 0");
  if (overlap < 0 || overlap >= size) {
    throw new Error("overlap must be >= 0 and < size");
  }

  const cleaned = normalize(text);
  if (cleaned.length === 0) return [];

  // If the whole document fits in one chunk, return it as-is.
  if (cleaned.length <= size) return [cleaned];

  const step = size - overlap; // how far the window moves each iteration
  const chunks: string[] = [];

  for (let i = 0; i < cleaned.length; i += step) {
    const chunk = cleaned.slice(i, i + size).trim();
    if (chunk.length > 0) chunks.push(chunk);
    // If this chunk consumed the rest of the text, we're done.
    if (i + size >= cleaned.length) break;
  }

  return chunks;
}
