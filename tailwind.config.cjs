/*
 * Cores da Orprocon (as mesmas do sistema atual). Ficam em variáveis CSS (src/index.css), então o
 * tema escuro troca tudo sozinho: bg-surface, text-ink, border-line, bg-brand-fill...
 */
const v = (nome) => `rgb(var(--${nome}) / <alpha-value>)`;
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: { sans: ["Geist", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
      colors: {
        canvas: v("canvas"), surface: v("surface"), "surface-2": v("surface-2"),
        line: v("line"), "line-strong": v("line-strong"),
        ink: v("ink"), "ink-2": v("ink-2"), muted: v("muted"),
        brand: { DEFAULT: v("brand"), hover: v("brand-hover"), soft: v("brand-soft"), fill: v("brand-fill"), "fill-hover": v("brand-fill-hover") },
        "on-fill": v("on-fill"), grafite: v("grafite"), "on-grafite": v("on-grafite"),
        credit: v("credit"), debit: { DEFAULT: v("debit"), soft: v("debit-soft") },
        warn: { DEFAULT: v("warn"), soft: v("warn-soft") }, info: { DEFAULT: v("info"), soft: v("info-soft") }, ok: { soft: v("ok-soft") }
      },
      borderRadius: { sm: "6px", DEFAULT: "8px", lg: "12px", xl: "14px", "2xl": "16px" },
      boxShadow: { pop: "0 12px 32px rgba(43,38,32,.14), 0 2px 6px rgba(43,38,32,.06)" }
    }
  },
  plugins: []
};
