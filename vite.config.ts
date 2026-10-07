import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

/*
 * Die WebAssembly-Laufzeit der Spracherkennung gehoert nicht in den Build.
 *
 * onnxruntime-web verweist intern mit `new URL(…, import.meta.url)` auf seine
 * .wasm-Dateien. Vite folgt dem und legt sie als Anhang ab, obwohl kein
 * einziges Bündel darauf zeigt: Die Mitschrift holt die Laufzeit bewusst aus
 * dem eigenen Supabase-Speicher, siehe `wasmBasisUrl` in `src/lib/mitschrift.ts`.
 * Ohne dieses Plugin waere jede Auslieferung um rund 35 MB tote Datei groesser.
 */
function ohneOnnxLaufzeit() {
  return {
    name: "ohne-onnx-laufzeit",
    generateBundle(_optionen: unknown, buendel: Record<string, unknown>) {
      for (const name of Object.keys(buendel)) {
        // Nur die .wasm-Brocken. Die kleinen .mjs bleiben, auf sie kann ein
        // Bündel durchaus zeigen, und sie kosten nichts.
        if (/(^|\/)ort-.*\.wasm$/.test(name)) delete buendel[name];
      }
    },
  };
}

/*
 * Die hoechste Nummer aus `public/versionsnotiz.json`, fest in den Build
 * eingebaut. So weiss der Browser, welche Eintraege sein Programmstand schon
 * kennt, und kann bei einem neuen Build die Notiz vom Server damit
 * vergleichen (siehe `src/lib/versionsnotiz.ts`). Fehlt die Datei oder ist
 * sie kaputt, gilt 0; der Build soll daran nie scheitern.
 */
function hoechsteNotizNr(): number {
  try {
    const roh = JSON.parse(fs.readFileSync(path.resolve(__dirname, "public/versionsnotiz.json"), "utf8"));
    return Array.isArray(roh) ? Math.max(0, ...roh.map((e) => Number(e?.nr) || 0)) : 0;
  } catch {
    return 0;
  }
}

export default defineConfig(({ mode }) => ({
  define: {
    __VERSIONSNOTIZ_NR__: JSON.stringify(hoechsteNotizNr()),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), ohneOnnxLaufzeit(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React + Router (shared by all pages)
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // UI framework
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-accordion",
            "@radix-ui/react-scroll-area",
          ],
          // Supabase (loaded on auth check)
          "vendor-supabase": ["@supabase/supabase-js"],
          // Heavy libs – only loaded by specific pages
          "vendor-charts": ["recharts"],
          "vendor-maps": ["leaflet"],
          // jspdf bewusst nicht als eigener Chunk: Rollup legte Vites Nachlade-
          // Helfer in diesen Chunk, wodurch das Startpaket jsPDF (128 KB gzip)
          // statisch mitzog. Ohne Eintrag landet jsPDF nur in den PDF-Seiten.
          // Utility libs
          "vendor-utils": [
            "date-fns",
            "clsx",
            "tailwind-merge",
            "class-variance-authority",
            "zod",
            "sonner",
          ],
        },
      },
    },
  },
}));
