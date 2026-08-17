/**
 * Tailwind v4's PostCSS plugin. v4 has no JS config file and no `content`
 * globs — the theme lives in `app/globals.css` under `@theme`, and sources are
 * discovered automatically. Next runs this under Turbopack.
 */
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
