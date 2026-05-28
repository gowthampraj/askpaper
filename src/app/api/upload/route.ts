// ─────────────────────────────────────────────────────────────────────────────
// src/app/api/upload/route.ts — POST /api/upload
//
// Accepts a PDF as multipart/form-data, extracts the text with pdf-parse v1,
// stashes {filename, text} in the in-memory store, returns a small summary.
//
// HISTORY: we tried pdf-parse v2 first but it depends on pdfjs-dist which
// expects browser globals (DOMMatrix, ImageData, Path2D). Polyfilling those
// in Node requires @napi-rs/canvas, which is unreliable on macOS/Vercel.
// v1.1.1 has none of that — it's a thin wrapper that reads the PDF directly,
// no DOM, no canvas, runs anywhere Node does.
//
// SIZE LIMIT: Vercel Hobby tier caps request bodies at ~4.5 MB. We enforce
// 5 MB here so we fail with a clear message instead of a silent platform
// rejection. Test PDFs are 700KB-2MB, well under.
// ─────────────────────────────────────────────────────────────────────────────

// Importing from the package root triggers pdf-parse's startup self-test,
// which reads a hardcoded test PDF and crashes when Next bundles it (ENOENT
// on `./test/data/05-versions-space.pdf`). Importing the lib file directly
// skips that bootstrap. This is the standard pdf-parse-on-Next.js workaround.
import pdf from "pdf-parse/lib/pdf-parse.js";
import { saveDocument } from "@/lib/store";
import { chunkText } from "@/lib/chunk";
import { embedMany } from "@/lib/embed";

// Vercel function timeout. Default is 10s; first upload after cold start
// has to download the ~25 MB embedding model from Hugging Face's CDN AND
// embed ~100 chunks, easily 30-60s. Hobby tier caps maxDuration at 60.
// Pro/Enterprise allow up to 800s.
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  // 1. Parse multipart body.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json(
      { error: "Expected multipart/form-data body" },
      { status: 400 },
    );
  }

  // 2. Pull the file. Browser <input type="file" name="file"> posts it here.
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing `file` field" }, { status: 400 });
  }

  // 3. Validate type + size.
  const looksLikePdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    return Response.json(
      { error: "Only PDF files are supported" },
      { status: 415 },
    );
  }
  if (file.size === 0) {
    return Response.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `File too large. Max ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }

  // 4. Read bytes and parse. pdf-parse v1 takes a Buffer directly and
  //    returns { text, numpages, info, metadata, ... } on resolve.
  const buffer = Buffer.from(await file.arrayBuffer());

  let text: string;
  let numPages: number;
  try {
    const result = await pdf(buffer);
    text = result.text ?? "";
    numPages = result.numpages ?? 0;
  } catch (err) {
    console.error("PDF parse failed:", err);
    return Response.json(
      { error: "Could not parse PDF. Is it a valid file?" },
      { status: 422 },
    );
  }

  if (text.trim().length === 0) {
    // Some PDFs are images-only (scanned documents). Without OCR we can't
    // read them. Flag clearly so the user knows why.
    return Response.json(
      {
        error:
          "PDF contains no extractable text. It may be a scanned image — OCR support isn't in this version.",
      },
      { status: 422 },
    );
  }

  // 5. Chunk + embed. First call after server start downloads the embedding
  //    model (~25 MB, ~5-10s). Subsequent uploads in the same process are
  //    fast (~50ms per chunk).
  const chunkStrings = chunkText(text);
  let embeddings: number[][];
  try {
    embeddings = await embedMany(chunkStrings);
  } catch (err) {
    console.error("Embedding failed:", err);
    return Response.json(
      { error: "Failed to embed PDF content. Check server logs." },
      { status: 500 },
    );
  }

  const chunks = chunkStrings.map((chunkBody, i) => ({
    text: chunkBody,
    embedding: embeddings[i],
  }));

  // 6. Persist to Postgres. saveDocument is async now (DB I/O) — we MUST
  //    await or the route would return success before the rows land.
  try {
    await saveDocument({
      filename: file.name,
      text,
      chunks,
      uploadedAt: new Date(),
    });
  } catch (err) {
    console.error("Save to DB failed:", err);
    return Response.json(
      { error: "Failed to persist document. Check server logs." },
      { status: 500 },
    );
  }

  // 7. Summary for the client.
  return Response.json({
    filename: file.name,
    sizeBytes: file.size,
    numPages,
    charCount: text.length,
    chunkCount: chunks.length,
    // Embedding dimensionality should be 384 for all-MiniLM-L6-v2.
    embeddingDim: chunks[0]?.embedding.length ?? 0,
    preview: text.slice(0, 200),
    firstChunkPreview: chunks[0]?.text.slice(0, 200) ?? "",
  });
}
