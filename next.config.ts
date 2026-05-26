// ─────────────────────────────────────────────────────────────────────────────
// next.config.ts — Next.js build & runtime configuration
//
// Currently empty (we don't need custom config yet). Later, when we add things
// like remote image domains, env-var validation, redirects, headers, or
// experimental flags, they go inside the object below.
//
// Docs: https://nextjs.org/docs/app/api-reference/next-config-js
// ─────────────────────────────────────────────────────────────────────────────

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep these packages out of the Next/webpack bundle. They include native
  // modules (onnxruntime-node) or weird import patterns (pdf-parse's deep
  // /lib/pdf-parse.js entry) that the bundler gets wrong when it tries to
  // tree-shake or analyse them. Listing them here means Next uses Node's
  // normal require() to resolve them at runtime — same way they work locally.
  serverExternalPackages: [
    "pdf-parse",
    "@xenova/transformers",
    "onnxruntime-node",
  ],

  // Vercel's bundler doesn't trace native binaries (.so / .dylib / .node
  // files) through `require()` calls, so onnxruntime-node's shared library
  // gets dropped from the function bundle. Result: at runtime the function
  // crashes with `libonnxruntime.so.1.14.0: cannot open shared object file`.
  // We work around it by explicitly including the entire onnxruntime-node
  // package (and the transformers cache the lib reads from) in every API
  // route's deployment artifact.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/onnxruntime-node/**/*",
      "./node_modules/@xenova/transformers/**/*",
    ],
  },
};

export default nextConfig;
