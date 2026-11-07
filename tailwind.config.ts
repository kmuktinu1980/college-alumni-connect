import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        sunk: v("sunk"),
        ink: v("ink"),
        muted: v("muted"),
        line: v("line"),
        river: v("river"),
        "river-ink": v("river-ink"),
        "river-soft": v("river-soft"),
        amber: v("amber"),
        "amber-soft": v("amber-soft"),
        ok: v("ok"),
        "ok-soft": v("ok-soft"),
        bad: v("bad"),
        "bad-soft": v("bad-soft"),
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', '"Avenir Next"', '"Segoe UI"', "system-ui", "sans-serif"],
        sans: ['"IBM Plex Sans"', '"Segoe UI"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", '"SF Mono"', "Menlo", "monospace"],
      },
      maxWidth: { page: "1060px" },
    },
  },
  plugins: [],
} satisfies Config;
