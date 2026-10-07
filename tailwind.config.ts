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
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'system-ui', 'sans-serif'],
        serif: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'serif'],
      },
      colors: {
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
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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
