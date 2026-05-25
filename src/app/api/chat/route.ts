// ─────────────────────────────────────────────────────────────────────────────
// src/app/api/chat/route.ts — POST /api/chat (streaming)
//
// TASK 6: stream tokens from Groq → us → the browser.
//
// FLOW:
//   1. Browser POSTs { messages: [...] }
//   2. We call Groq with `stream: true`. Groq returns a long-lived HTTP
//      response that emits "Server-Sent Events" — text frames shaped like
//          data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n
//          data: {"choices":[{"delta":{"content":"lo"}}]}\n\n
//          data: [DONE]\n\n
//      one per generated chunk.
//   3. We read Groq's stream, parse each frame, and write JUST the text
//      ("Hel", then "lo") to OUR response body as plain text.
//   4. Browser reads our response progressively and appends each chunk to
//      the assistant message bubble.
//
// WHY DO WE PARSE/RE-EMIT INSTEAD OF JUST PIPING GROQ'S STREAM THROUGH?
//   Two reasons:
//     - Keeps the client decoupled from Groq's wire format. If we switch
//       providers later (OpenAI, Anthropic, local Ollama), the client
//       doesn't care — it just keeps reading plain text.
//     - Lets us strip out metadata we don't want exposed (token usage,
//       model fingerprints, system prompt echoes).
//
// WHY STREAM AT ALL? Total wall-clock time is identical to non-streaming —
// the model takes the same N seconds to generate. But because the user sees
// the first token at ~150ms instead of waiting for the whole reply, it
// FEELS dramatically faster. Same trick ChatGPT, Claude.ai, etc. use.
// ─────────────────────────────────────────────────────────────────────────────

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatRequest = {
  messages: Message[];
};

const SYSTEM_PROMPT = `You are Askpaper, an assistant that helps users explore and understand PDF documents.

Guidelines:
- Keep replies concise and direct. Avoid filler like "I'm here to help" or "Feel free to ask".
- If you don't know something, say so plainly.
- When PDF content is provided in context (coming in Week 2), ground your answers in it and cite the source.`;

// Validate body. Clients can only send user/assistant turns — server is the
// sole source of system messages (prompt-injection defence).
function isValidMessages(value: unknown): value is Message[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (m) =>
      m &&
      typeof m === "object" &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.length > 0,
  );
}

export async function POST(req: Request) {
  // 1. Parse + validate.
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isValidMessages(body?.messages)) {
    return Response.json(
      { error: "`messages` must be a non-empty array of { role, content }." },
      { status: 400 },
    );
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("GROQ_API_KEY is not set");
    return Response.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const messagesForGroq: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...body.messages,
  ];

  // 2. Call Groq with stream: true. Note we do NOT `await groqRes.json()` or
  //    .text() — that would buffer the whole response. We need .body, which
  //    is a ReadableStream we can consume chunk by chunk.
  const groqRes = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: messagesForGroq,
        stream: true,
      }),
    },
  );

  if (!groqRes.ok || !groqRes.body) {
    const errText = await groqRes.text().catch(() => "");
    console.error("Groq API error:", groqRes.status, errText);
    return Response.json({ error: "Upstream LLM error" }, { status: 502 });
  }

  // 3. Build OUR response stream. ReadableStream is the Web Standard way to
  //    create a streaming HTTP body. The `start` function runs immediately
  //    and pushes data into the stream via `controller.enqueue(...)`.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = groqRes.body!.getReader();
      // SSE frames are delimited by blank lines. A single TCP packet from
      // Groq can contain a partial frame or multiple frames glued together,
      // so we buffer and split on "\n\n".
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process every complete frame we have so far. Keep any partial
          // tail in `buffer` for the next iteration.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            // Frame looks like: "data: {...}"  (sometimes with extra
            // whitespace or "data: [DONE]")
            const line = frame.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") {
              controller.close();
              return;
            }

            // Each chunk is JSON shaped like Groq/OpenAI's streaming format.
            // We only care about the text delta.
            try {
              const json = JSON.parse(payload);
              const delta: string =
                json?.choices?.[0]?.delta?.content ?? "";
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              // Malformed JSON in a frame — skip it rather than killing
              // the whole stream.
            }
          }
        }
        controller.close();
      } catch (err) {
        console.error("Stream error:", err);
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
  });

  // 4. Return the stream as plain text. Headers tell intermediaries (Vercel,
  //    Cloudflare, browsers) NOT to buffer this response.
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // disables nginx buffering on some hosts
    },
  });
}
