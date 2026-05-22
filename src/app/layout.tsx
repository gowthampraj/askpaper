// ─────────────────────────────────────────────────────────────────────────────
// src/app/layout.tsx — the ROOT LAYOUT
//
// ANGULAR ANALOGY: this is your app.component.ts/html. Every page in the app
// renders INSIDE this component. The {children} below is effectively the
// <router-outlet> — Next.js swaps in the right page based on the URL.
//
// Two things make this file special in Next.js App Router:
//
//   1. It's a SERVER COMPONENT by default (no 'use client' directive at the
//      top of the file). That means this code runs on the server during
//      render, and never ships JS to the browser. Great for layouts since
//      they're mostly static markup. We'll see 'use client' in chat UI later.
//
//   2. The file MUST be named exactly `layout.tsx` and live inside the `app/`
//      folder. Next.js picks it up by convention. The function name (here:
//      `RootLayout`) doesn't matter — only the default export does.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// `next/font/google` self-hosts Google Fonts at BUILD TIME — no runtime request
// from the user's browser to fonts.googleapis.com (faster page loads, better
// privacy, no Cumulative Layout Shift). Each call returns an object whose
// `.variable` property is a CSS custom property name. We attach those to
// <html> below so the fonts are available everywhere.
const geistSans = Geist({
  variable: "--font-geist-sans", // referenced from CSS as var(--font-geist-sans)
  subsets: ["latin"], // only download latin glyphs — keeps the bundle small
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// `metadata` is a SPECIAL EXPORT Next.js looks for. It populates <title>,
// <meta>, Open Graph tags, favicons, etc. — the declarative equivalent of
// Angular's Title/Meta services. You can also export this from any page.tsx;
// the most specific (deepest) export wins, so a page can override the layout.
export const metadata: Metadata = {
  title: "Askpaper — RAG-powered PDF chat",
  description: "Upload a PDF, ask questions, get answers with sources.",
};

// The default export of layout.tsx must be a React component that accepts a
// `{ children }` prop and wraps it in <html>...<body>.
//
// `children` is whatever the currently-routed page renders (page.tsx for `/`,
// `dashboard/page.tsx` for `/dashboard`, etc.). React passes it in for free.
//
// `Readonly<{ children: React.ReactNode }>` is just a TypeScript type saying
// "this object has a `children` property of type ReactNode, and shouldn't be
// mutated." ReactNode covers anything renderable: JSX, strings, numbers, null.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // This `return` block IS the JSX. JSX looks like HTML but it's actually
  // JavaScript — `<html lang="en" ...>` desugars to a function call
  // `React.createElement('html', { lang: 'en', ... }, ...)`.
  return (
    <html
      lang="en"
      // Attach the two font CSS variables to <html> so they cascade everywhere.
      // The backtick string is a JS template literal — same as Angular's
      // string interpolation, just JavaScript-native.
      // `antialiased` is a Tailwind utility class that smooths font rendering.
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Tailwind classes: min-h-full = at least viewport height,
          flex flex-col = vertical flex container so children stack and the
          chat UI can fill remaining space later. */}
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
