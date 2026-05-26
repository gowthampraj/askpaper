// ─────────────────────────────────────────────────────────────────────────────
// src/lib/embed.ts — local text embeddings via @xenova/transformers
//
// WHAT THIS DOES: turns a string of text into a 384-dimensional vector
// (a `number[]` of length 384) using the all-MiniLM-L6-v2 sentence
// transformer. The vector captures the *meaning* of the text — chunks with
// similar meaning produce mathematically close vectors. That's the entire
// foundation of semantic search and RAG.
//
// WHY LOCAL: @xenova/transformers ships a JS port of HuggingFace's
// transformer models. They run inside Node (or even the browser) via ONNX
// Runtime. Net result: no API key, no per-request cost, no rate limit,
// data never leaves your server. The trade-off is ~25 MB of model weights
// downloaded once and ~50ms of CPU per embed call.
//
// LAZY LOAD + SINGLETON: the pipeline is heavy to construct (loads the
// model, the tokenizer, the WASM runtime). We build it once on first call
// and reuse it forever. On Vercel's serverless, this means the first
// request after a cold start eats a ~5-10s model-download tax; subsequent
// requests in the same instance are fast.
// ─────────────────────────────────────────────────────────────────────────────

import {
  pipeline,
  env as transformersEnv,
  type FeatureExtractionPipeline,
} from "@xenova/transformers";

// VERCEL CACHE-DIR FIX:
//   @xenova/transformers caches downloaded models to disk so subsequent
//   loads are instant. By default it picks a path relative to the package
//   in node_modules. On Vercel, every directory except /tmp is read-only,
//   so the default cache write fails and the lib falls back to slower
//   in-memory loading on every cold start (or, depending on version,
//   crashes). Pointing it at /tmp/transformers makes the cache work
//   throughout the lifetime of a warm function instance. Cold starts will
//   still re-download (since /tmp doesn't persist across instances), but
//   warm requests are fast.
//
//   We only override in production — locally we want the cache in
//   node_modules so it survives `next dev` restarts.
if (process.env.NODE_ENV === "production") {
  transformersEnv.cacheDir = "/tmp/transformers";
}

// Same globalThis trick as the document store — survives hot reloads in
// `next dev` so we don't re-download the model every time you save a file.
const globalForEmbedder = globalThis as unknown as {
  embedderPromise?: Promise<FeatureExtractionPipeline>;
};

/**
 * Lazily build (or reuse) the embedding pipeline.
 *
 * Returns a *promise* rather than the pipeline directly because the first
 * caller has to wait for the model download. Subsequent callers awaiting
 * the same promise just get the cached resolved value — they don't trigger
 * a second download.
 */
function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (!globalForEmbedder.embedderPromise) {
    globalForEmbedder.embedderPromise = pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    ) as Promise<FeatureExtractionPipeline>;
  }
  return globalForEmbedder.embedderPromise;
}

/**
 * Embed a single string. Returns a 384-length array of floats.
 *
 * The pipeline's `pooling: 'mean'` averages token embeddings into a single
 * vector representing the whole sentence/chunk. `normalize: true` L2-
 * normalizes the result so cosine similarity reduces to a plain dot
 * product later — cheaper, and the standard convention for retrieval.
 */
export async function embed(text: string): Promise<number[]> {
  const pipe = await getEmbedder();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  // `output.data` is a Float32Array. Array.from gives us a plain number[]
  // which is easier to serialize, store, and compute on later.
  return Array.from(output.data as Float32Array);
}

/**
 * Embed many strings sequentially. Returns an array of 384-length arrays
 * in the same order as the input.
 *
 * Why sequential rather than batched: simpler, predictable memory, and the
 * model is so small that batching only helps when you have GPU acceleration
 * — which we don't on Vercel's CPU-only functions. We can always batch
 * later if it becomes a bottleneck.
 */
export async function embedMany(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) {
    out.push(await embed(t));
  }
  return out;
}
