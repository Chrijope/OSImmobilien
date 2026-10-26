import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      /*
       * Schriftstufen (A1, 26.10.2026), benannt nach Apples Textstilen, mit
       * Zeilenhöhe und Gewicht. Gerechnet auf die Grundschrift von 90 %
       * (index.css, 1rem = 14,4 px). Untergrenze 11 px, ein Wächtertest
       * (src/styles/schriftgroessen.test.ts) verbietet kleinere neue Größen.
       * `xs` steht deshalb auf 11 statt 10,8 px.
       */
      fontSize: {
        xs: ["0.7639rem", { lineHeight: "1rem" }],
        grosstitel: ["1.8056rem", { lineHeight: "1.2", fontWeight: "700" }], // 26 px
        titel1: ["1.5278rem", { lineHeight: "1.25", fontWeight: "700" }], // 22 px
        titel2: ["1.25rem", { lineHeight: "1.3", fontWeight: "600" }], // 18 px
        ueberschrift: ["1.0417rem", { lineHeight: "1.35", fontWeight: "600" }], // 15 px
        fliesstext: ["0.9028rem", { lineHeight: "1.45", fontWeight: "400" }], // 13 px
        hinweis: ["0.8333rem", { lineHeight: "1.4", fontWeight: "400" }], // 12 px
        fussnote: ["0.7986rem", { lineHeight: "1.35", fontWeight: "400" }], // 11.5 px
        bildunterschrift: ["0.7639rem", { lineHeight: "1.35", fontWeight: "400" }], // 11 px
      },
      // Eine Schrift fuer alles (Christian, 18.10.2026): Systemschrift, keine
      // Zierschrift. font-serif zeigt bewusst dieselbe Schrift.
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'system-ui', 'sans-serif'],
        serif: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'serif'],
      },
      colors: {
        // Feste Markenfarben (tailwind-brand.ts der Guideline): bg-os-tanne,
        // text-os-gruen-tief … Fuer Rollen weiter primary, success usw. nutzen.
        os: {
          tanne: { DEFAULT: "#12362A", 2: "#1A4535", 3: "#0C1F18" },
          gruen: { DEFAULT: "#198A5F", tief: "#15724F" },
          mint: { DEFAULT: "#A7D7C5", hell: "#E3F1EB" },
          nebel: "#F3F6F4",
          linie: "#D3E0D9",
          grau: "#56635D",
          gold: { DEFAULT: "#CCAC05", text: "#7A6603", hell: "#FBF5D6" },
          champagner: { DEFAULT: "#D8C7A0", tief: "#A8915C", hell: "#F4EEDD" },
          warnung: { DEFAULT: "#BD550A", text: "#9A4508", hell: "#FDF1E8" },
          fehler: { DEFAULT: "#A23B32", hell: "#F8E9E7" },
          info: { DEFAULT: "#2F6F86", hell: "#EAF2F5" },
          heute: { DEFAULT: "#8E9692", hell: "#EEF0EF" },
          chart: { 1: "#198A5F", 2: "#12362A", 3: "#CCAC05", 4: "#A7D7C5", 5: "#8E9692", 6: "#A23B32" },
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
          muted: "hsl(var(--sidebar-muted))",
        },
        "chart-b2c": "hsl(var(--chart-b2c))",
        "chart-b2b": "hsl(var(--chart-b2b))",
        "chart-provision": "hsl(var(--chart-provision))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        info: "hsl(var(--info))",
        olive: "hsl(var(--olive))",
        sand: "hsl(var(--sand))",
        // Marken-Orange der Website, ausschliesslich fuer die Hauptaktion
        // einer Seite. Nicht fuer Warnungen, dafuer bleibt alert-orange.
        "brand-orange": "hsl(var(--brand-orange))",
        "brand-orange-tief": "hsl(var(--brand-orange-tief))",
        "brand-orange-foreground": "hsl(var(--brand-orange-foreground))",
        // Dunkle Kopfflaeche der Anzeigenseite /expats-calculator. Modusfest,
        // Begruendung steht beim Token in src/index.css.
        "expats-marine": "hsl(var(--expats-marine))",
        "alert-red": "hsl(var(--alert-red))",
        "alert-orange": "hsl(var(--alert-orange))",
        "alert-green": "hsl(var(--alert-green))",
        "apple-blue": "hsl(var(--apple-blue))",
        "apple-green": "hsl(var(--apple-green))",
        "apple-indigo": "hsl(var(--apple-indigo))",
        "apple-orange": "hsl(var(--apple-orange))",
        "apple-pink": "hsl(var(--apple-pink))",
        "apple-purple": "hsl(var(--apple-purple))",
        "apple-red": "hsl(var(--apple-red))",
        "apple-teal": "hsl(var(--apple-teal))",
        "apple-yellow": "hsl(var(--apple-yellow))",
        "apple-gray": "hsl(var(--apple-gray))",
        "apple-mint": "hsl(var(--apple-mint))",
        "apple-brown": "hsl(var(--apple-brown))",
        "apple-rose": "hsl(var(--apple-rose))",
        "apple-sky": "hsl(var(--apple-sky))",
        "apple-cyan": "hsl(var(--apple-cyan))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Nichts ist eckig (Markenrichtlinie): Feld 10, Karte 16, Glas 22, Knopf rund.
        "os-sm": "10px",
        "os-md": "16px",
        "os-lg": "22px",
        "os-pill": "999px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Zwei-Faktor-Code falsch: kurzes Kopfschütteln wie am iPhone.
        "code-schuetteln": {
          "0%, 100%": { transform: "translateX(0)" },
          "20%, 60%": { transform: "translateX(-8px)" },
          "40%, 80%": { transform: "translateX(8px)" },
        },
        "caret-blink": {
          "0%, 70%, 100%": { opacity: "1" },
          "20%, 50%": { opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "code-schuetteln": "code-schuetteln 0.4s ease-in-out",
        "caret-blink": "caret-blink 1.2s ease-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
