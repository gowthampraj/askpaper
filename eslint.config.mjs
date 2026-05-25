// ─────────────────────────────────────────────────────────────────────────────
// eslint.config.mjs — ESLint "flat config"
//
// WHAT IS ESLINT? A static analyzer that flags suspicious or non-idiomatic
// code (unused variables, missing React hook deps, console.log left in,
// accessibility issues on <img>, etc.) BEFORE you run the app. Think of it
// as a spell-checker for code. It runs on `npm run lint` and inside your
// editor on save (assuming the ESLint extension is installed).
//
// FLAT CONFIG vs. legacy `.eslintrc`:
//   ESLint 9 (released 2024) switched to "flat config" — a single file that
//   exports an array of config objects. The old `.eslintrc.json` / extends-
//   based system is being phased out. If you see online examples with
//   `"extends": ["next/core-web-vitals"]`, that's the legacy format; the
//   modern equivalent is the spread-array style below.
//
// WHY TWO CONFIGS? `eslint-config-next` ships two preset bundles:
//   - `core-web-vitals` — Next-specific rules (no <img>, no <a> for internal
//     links, etc.) tuned to catch issues that hurt page performance scores.
//   - `typescript` — TypeScript-aware rules (no-unused-vars that respects
//     types, no-explicit-any, etc.).
// Spreading both with `...` merges all their rules into our config.
// ─────────────────────────────────────────────────────────────────────────────

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // `globalIgnores` lists paths ESLint should NEVER touch. These are either
  // build artefacts (.next, out, build) or auto-generated files (next-env.d.ts)
  // where lint errors would be meaningless noise.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
