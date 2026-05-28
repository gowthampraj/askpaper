// ─────────────────────────────────────────────────────────────────────────────
// src/lib/db.ts — Postgres + pgvector client and schema bootstrap
//
// WHAT THIS DOES:
//   1. Holds a singleton `postgres` client connected to our Supabase DB.
//   2. Exposes ensureSchema() which creates the pgvector extension and our
//      two tables on first call. Idempotent — safe to call on every cold
//      start; the CREATE ... IF NOT EXISTS statements are no-ops after the
//      first run.
//
// THE TWO TABLES:
//   documents — one row per uploaded PDF (filename, char_count, uploaded_at)
//   chunks    — one row per chunk of every PDF (filename FK, chunk_index,
//               text, embedding). `embedding` is a pgvector vector(384),
//               matching the output dimensionality of all-MiniLM-L6-v2.
//
// WHY pgvector?
//   pgvector is a Postgres extension that adds a real vector data type and
//   distance operators (<=> cosine, <-> L2, <#> negative inner product).
//   Without it, you'd store embeddings as JSON arrays and do similarity
//   math in your app — same algorithm we used with the in-memory Map.
//   WITH it, you write `ORDER BY embedding <=> $1 LIMIT 4` in SQL and the
//   database does the work, often using an index (HNSW or IVFFlat) to skip
//   most of the dataset. The user enabled the extension manually in the
//   Supabase dashboard; the CREATE EXTENSION line below makes the migration
//   idempotent so other environments work too.
//
// WHY `prepare: false`?
//   Supabase's Transaction Pooler is PgBouncer in transaction mode. In that
//   mode, each query may be routed to a different backend Postgres
//   connection, so prepared statements (which live on a specific connection)
//   don't survive between calls. The `postgres` library prepares statements
//   by default; we explicitly disable it. Symptoms if you forget this:
//   intermittent "prepared statement does not exist" errors under load.
//
// WHY THE globalThis SINGLETON?
//   In `next dev`, hot module reloads re-evaluate this file on every save.
//   Without globalThis, you'd open a new connection pool on every change
//   and eventually exhaust Supabase's connection limit. Stashing the
//   client on globalThis means it survives reloads. In production this is
//   a one-time module load, same effect either way.
// ─────────────────────────────────────────────────────────────────────────────

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  // Fail loud and early during cold start rather than mysteriously at the
  // first query. Setting up is a config problem, not a runtime one.
  throw new Error(
    "DATABASE_URL is not set. Add it to .env.local (Supabase → Connect → Transaction pooler).",
  );
}

type Sql = ReturnType<typeof postgres>;

// Same hot-reload-survival trick as src/lib/embed.ts and src/lib/store.ts.
const globalForDb = globalThis as unknown as {
  pgClient?: Sql;
  schemaInitPromise?: Promise<void>;
};

/**
 * Return the singleton `postgres` client. Lazy — created on first call.
 *
 * The `postgres` library handles connection pooling internally. `max: 10`
 * caps concurrent connections per process (Supabase's free tier allows
 * far more, but we don't want a runaway loop to hog them).
 */
export function getSql(): Sql {
  if (!globalForDb.pgClient) {
    globalForDb.pgClient = postgres(DATABASE_URL!, {
      max: 10,
      // Required when using Supabase's Transaction Pooler (PgBouncer in
      // transaction mode) — see file-top comment for why.
      prepare: false,
    });
  }
  return globalForDb.pgClient;
}

/**
 * Create the pgvector extension and our schema if they don't already exist.
 *
 * Call this once before any query that touches `documents` or `chunks`.
 * Cached as a promise so concurrent callers wait on the same bootstrap
 * instead of racing CREATE statements against each other.
 *
 * The HNSW index on `chunks.embedding` accelerates similarity search.
 * At our current scale (<1k chunks) it doesn't matter much — brute force
 * is already fast. But adding it now means we don't have to think about
 * it when the dataset grows.
 */
export function ensureSchema(): Promise<void> {
  if (!globalForDb.schemaInitPromise) {
    globalForDb.schemaInitPromise = (async () => {
      const sql = getSql();
      // .unsafe() lets us send multiple statements in one round-trip. The
      // string is hardcoded, so there's no injection risk — "unsafe" here
      // just means "no parameterization", not "user input".
      await sql.unsafe(`
        CREATE EXTENSION IF NOT EXISTS vector;

        CREATE TABLE IF NOT EXISTS documents (
          filename     TEXT PRIMARY KEY,
          char_count   INTEGER NOT NULL,
          uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS chunks (
          id           BIGSERIAL PRIMARY KEY,
          filename     TEXT NOT NULL REFERENCES documents(filename) ON DELETE CASCADE,
          chunk_index  INTEGER NOT NULL,
          text         TEXT NOT NULL,
          embedding    vector(384) NOT NULL,
          UNIQUE (filename, chunk_index)
        );

        CREATE INDEX IF NOT EXISTS chunks_embedding_idx
          ON chunks USING hnsw (embedding vector_cosine_ops);
      `);
      console.log("[db] schema ready");
    })();
  }
  return globalForDb.schemaInitPromise;
}
