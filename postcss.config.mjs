// ─────────────────────────────────────────────────────────────────────────────
// postcss.config.mjs — PostCSS pipeline configuration
//
// WHAT IS POSTCSS? A tool that transforms CSS files via plugins. Next.js runs
// every CSS file in your project (including globals.css) through PostCSS at
// build time. The plugins listed here decide what transformations happen.
//
// Tailwind v4 ships as a single PostCSS plugin (`@tailwindcss/postcss`). That
// plugin is what reads `@import "tailwindcss";` in globals.css and expands it
// into the actual utility classes (text-sm, flex, bg-zinc-900, etc.) used in
// your components. Without this file, Tailwind classes would be silently
// dropped and your UI would look unstyled.
//
// HEADS UP — Tailwind v3 used a different setup (`tailwindcss` + `autoprefixer`
// as separate plugins, plus a `tailwind.config.js`). v4 collapses all of that
// into the one plugin below + config inside `@theme` blocks in CSS. If you
// hit v3 tutorials online, the file layout will look different.
//
// File extension `.mjs` = ES module (so `export default` works). Next.js also
// accepts `postcss.config.js` (CommonJS, with `module.exports = …`).
// ─────────────────────────────────────────────────────────────────────────────

const config = {
  plugins: {
    // Key = plugin package name, value = plugin options ({} means "use defaults").
    "@tailwindcss/postcss": {},
  },
};

export default config;
