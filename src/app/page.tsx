// ─────────────────────────────────────────────────────────────────────────────
// src/app/page.tsx — the HOME PAGE (route: `/`)
//
// FILE-BASED ROUTING: any `page.tsx` inside `app/` becomes a URL. This one
// lives at `app/page.tsx`, so it serves the root URL `/`. Add
// `app/about/page.tsx` later and it becomes `/about` automatically — no
// router config file like Angular's RouterModule.
//
// Like layout.tsx, this is a SERVER COMPONENT by default — it renders to HTML
// on the server. The moment we need interactivity (useState, onClick, browser
// APIs), we'll add `'use client'` as the first line of a new file and import
// it from here.
//
// HEADS UP: everything below is throwaway scaffolding from create-next-app.
// We replace it with the chat UI in Task 4. The annotations are just to help
// you read JSX/Tailwind syntax for the first time.
// ─────────────────────────────────────────────────────────────────────────────

import Image from "next/image";

// Default-exported function = the page component. Name is for humans only;
// Next.js only cares that there's a default export.
export default function Home() {
  // JSX rules vs Angular templates:
  //   - `className` (not `class`) because `class` is reserved in JS
  //   - `{expression}` for interpolation (Angular: `{{expression}}`)
  //   - `{/* comment */}` for inline comments (regular `//` doesn't work inside JSX)
  //   - one root element only (wrap multiple siblings in <></> if needed)
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        {/* <Image> from next/image auto-optimizes (resize, lazy-load, modern
            formats like AVIF/WebP). Always prefer it over plain <img> in Next. */}
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority /* boolean prop — hint Next to preload this above-the-fold image */
        />
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
        <h1 className="...">
  Askpaper — coming soon.
</h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Looking for a starting point or more instructions? Head over to{" "}
            <a
              href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Templates
            </a>{" "}
            or the{" "}
            <a
              href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Learning
            </a>{" "}
            center.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <a
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[158px]"
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={16}
              height={16}
            />
            Deploy Now
          </a>
          <a
            className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </main>
    </div>
  );
}
