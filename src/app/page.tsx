// ─────────────────────────────────────────────────────────────────────────────
// src/app/page.tsx — the HOME PAGE (route: `/`)
//
// TASK 4: replace the create-next-app scaffold with a real chat UI.
//
// `'use client'` (the directive on line 1 below) flips this whole file from a
// SERVER COMPONENT (Next.js default — renders to HTML on the server, ships
// zero JS to the browser) into a CLIENT COMPONENT — JS that runs in the
// browser. We need that the moment we want useState, onClick, onChange,
// browser fetch from event handlers — i.e. interactivity.
//
// Mental model coming from Angular:
//   - useState  ≈ a single reactive field on a component class (no zone.js,
//                 you call the setter and React re-renders).
//   - JSX       ≈ Angular template, but plain JS expressions in `{...}`.
//   - form onSubmit  ≈ (ngSubmit), with `e.preventDefault()` to stop the
//                      browser from doing a full page reload.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";

// One message in the chat log. We keep the shape close to what Groq/OpenAI
// expect so we can hand the array straight to the API in Task 5 (memory).
type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function Home() {
  // Three pieces of UI state. Each `useState` returns [value, setter].
  // React re-renders the component whenever a setter is called with a new value.
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Submit handler. Async because we await the fetch. Typed as a React form
  // event so TypeScript knows `e.preventDefault()` exists.
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || loading) return; // ignore empty sends and double-submits

    // 1. Optimistically add the user's message to the log and clear the input.
    //    "Optimistic" = update UI before the network call returns, so the
    //    user sees their message immediately.
    const userMsg: Message = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // 2. Call our own API route with the FULL conversation history.
      //    LLMs are stateless — every request re-sends every prior turn so
      //    the model can "remember." We build the array as
      //    `[...messages, userMsg]` rather than reading from state because
      //    React state updates are async; `messages` here still reflects
      //    the value at the start of this handler.
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      });

      if (!res.ok || !res.body) throw new Error(`API ${res.status}`);

      // 3. STREAMING: server emits plain text chunks (the model's tokens as
      //    they're generated). We append a placeholder assistant message
      //    first, then mutate its content as each chunk arrives. React
      //    re-renders on every setMessages call → the bubble visibly grows.
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        // Append `chunk` to the LAST message (the assistant placeholder).
        // We use the functional form of setMessages so we don't depend on
        // a stale closure over `messages`.
        setMessages((prev) => {
          const next = prev.slice();
          const last = next[next.length - 1];
          next[next.length - 1] = {
            ...last,
            content: last.content + chunk,
          };
          return next;
        });
      }
    } catch (err) {
      console.error(err);
      // Show the failure inline as an assistant message — simplest UX for now.
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Something went wrong. Try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Askpaper
          </h1>
          {/* Reset button — wipes client state. Server has nothing to clear
              because it stores no history (see route.ts comments). */}
          <button
            type="button"
            onClick={() => setMessages([])}
            disabled={messages.length === 0 || loading}
            className="text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-30 dark:hover:text-zinc-100"
          >
            Clear chat
          </button>
        </div>
      </header>

      {/* Message list. `flex-1` makes it grow to fill vertical space so the
          input pins to the bottom. `overflow-y-auto` lets it scroll. */}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <p className="text-center text-sm text-zinc-500">
            Ask me anything to get started.
          </p>
        )}

        {messages.map((m, i) => (
          // `key` helps React diff lists efficiently. Index is fine here
          // because we only append (never reorder/delete).
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto max-w-[80%] rounded-2xl bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "mr-auto max-w-[80%] rounded-2xl bg-white px-4 py-2 text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
            }
          >
            {/* whitespace-pre-wrap preserves newlines from the model's reply */}
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {m.content}
            </p>
          </div>
        ))}

        {loading && (
          <p className="mr-auto text-sm text-zinc-500">Thinking…</p>
        )}
      </main>

      {/* Input bar pinned at the bottom. `sticky bottom-0` keeps it visible
          when the message list grows past the viewport. */}
      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="mx-auto flex max-w-3xl gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            disabled={loading}
            className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
