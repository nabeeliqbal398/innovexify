import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: "hsl(var(--surface))",
        "surface-muted": "hsl(var(--surface-muted))",
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", hover: "hsl(var(--primary-hover))", foreground: "hsl(var(--primary-foreground))", soft: "hsl(var(--primary-soft))", "soft-foreground": "hsl(var(--primary-soft-foreground))" },
        sidebar: { DEFAULT: "hsl(var(--sidebar))", hover: "hsl(var(--sidebar-hover))", foreground: "hsl(var(--sidebar-foreground))", muted: "hsl(var(--sidebar-muted))", accent: "hsl(var(--sidebar-accent))" },
        success: { DEFAULT: "hsl(var(--success))", soft: "hsl(var(--success-soft))" },
        info: { DEFAULT: "hsl(var(--info))", soft: "hsl(var(--info-soft))" },
        warning: { DEFAULT: "hsl(var(--warning))", soft: "hsl(var(--warning-soft))" },
        danger: { DEFAULT: "hsl(var(--danger))", hover: "hsl(var(--danger-hover))", soft: "hsl(var(--danger-soft))" },
        violet: { DEFAULT: "hsl(var(--violet))", soft: "hsl(var(--violet-soft))" },
        teal: { DEFAULT: "hsl(var(--teal))", soft: "hsl(var(--teal-soft))" },
        neutral: { soft: "hsl(var(--neutral-soft))", DEFAULT: "hsl(var(--neutral))" },
        ring: "hsl(var(--ring))",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: { xs: ["12px", "16px"], sm: ["13px", "18px"], base: ["14px", "20px"], lg: ["15px", "22px"], xl: ["17px", "24px"], "2xl": ["24px", "30px"], "3xl": ["26px", "32px"] },
      borderRadius: { md: "8px", lg: "12px", xl: "14px" },
      boxShadow: {
        pop: "0 12px 32px -8px rgba(15,23,42,.2)",
        dialog: "0 24px 48px -12px rgba(15,23,42,.35)",
        drawer: "-24px 0 48px -16px rgba(15,23,42,.3)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        pop: { from: { opacity: "0", transform: "scale(.97)" }, to: { opacity: "1", transform: "none" } },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
        slide: { from: { transform: "translateX(24px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
      },
      animation: { rise: "rise .24s ease-out", pop: "pop .18s ease-out", fade: "fade .15s ease-out", slide: "slide .2s ease-out", shimmer: "shimmer 1.1s linear infinite" },
    },
  },
  plugins: [],
};

export default config;
