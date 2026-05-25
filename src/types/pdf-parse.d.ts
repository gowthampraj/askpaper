// ─────────────────────────────────────────────────────────────────────────────
// src/types/pdf-parse.d.ts — ambient declaration for the deep pdf-parse import
//
// @types/pdf-parse declares "pdf-parse" but not "pdf-parse/lib/pdf-parse.js".
// We use that deep path to dodge the package's startup self-test. This file
// re-exports the same type signature from @types/pdf-parse so TypeScript
// stops complaining about an implicit `any`.
//
// Why a separate types/ directory: keeps these ambient declarations out of
// the way of real source files. tsconfig.json's `include` already picks up
// `**/*.ts` so this file is loaded automatically.
// ─────────────────────────────────────────────────────────────────────────────

declare module "pdf-parse/lib/pdf-parse.js" {
  import pdfParse from "pdf-parse";
  export default pdfParse;
}
