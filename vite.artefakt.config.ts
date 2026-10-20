import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

/*
 * Eigenständige Fassung von Beratungspräsentation und Selbstauskunft, zum
 * Teilen als statische Seite (claude.ai-Artefakt). Getrennt von der App:
 *
 *   npx vite build --config vite.artefakt.config.ts   → dist-artefakt/
 *
 * Kein Backend und keine Zugangsdaten:
 * - `@/integrations/supabase/client` wird durch eine Attrappe ersetzt.
 * - `envDir` zeigt auf einen Ordner ohne .env, `envPrefix` passt auf keine
 *   Variable. So landet kein VITE_SUPABASE_* im Bündel, auch wenn lokal eine
 *   .env liegt.
 * - Kein public-Ordner (43 MB). Nur die Schriften und Logos, die jsPDF zur
 *   Laufzeit holt, werden mitgegeben (`laufzeitDateien`).
 */
const wurzel = __dirname;

/*
 * Dateien aus public/, die zur Laufzeit über feste Pfade geholt werden:
 * Schriften und Logos per fetch (jsPDF, pdfBranding.ts; netzwerk.ts biegt
 * die Pfade relativ um), Objektfotos als <img src="/images/mikroseite/…">
 * (Präsentation, siehe `relativeBildpfade`).
 */
const LAUFZEIT_DATEIEN = [
  "fonts/PlusJakartaSans-Regular.ttf",
  "fonts/PlusJakartaSans-Bold.ttf",
  "images/os-real-estate-logo-quer.png",
  "images/os-real-estate-logo-quer-dunkel.png",
  ...fs.readdirSync(path.join(wurzel, "public/images/mikroseite")).map((d) => `images/mikroseite/${d}`),
];

function laufzeitDateien(): Plugin {
  return {
    name: "artefakt-laufzeitdateien",
    generateBundle() {
      for (const datei of LAUFZEIT_DATEIEN) {
        this.emitFile({ type: "asset", fileName: datei, source: fs.readFileSync(path.join(wurzel, "public", datei)) });
      }
    },
  };
}

/** "/images/…" in Zeichenketten wird "./images/…", damit Bilder auch im Unterpfad laden. */
function relativeBildpfade(): Plugin {
  return {
    name: "artefakt-relative-bildpfade",
    transform(code, id) {
      if (!/\/src\/.*\.(ts|tsx)$/.test(id) || !/["'`]\/images\//.test(code)) return null;
      return code.replace(/(["'`])\/images\//g, "$1./images/");
    },
  };
}

/*
 * Die Projektkennung des Supabase-Projekts steht an einigen Stellen fest im
 * Quelltext (z. B. als Name des Anmeldeschlüssels in bellNotifications.ts).
 * Im Bündel ohne Backend hat sie nichts verloren, also wird sie überall
 * unkenntlich gemacht, auch in Modulen, die später dazukommen.
 */
const PROJEKT_KENNUNG = ["irwdgutegm", "ivbtgmftyc"].join("");
function ohneProjektKennung(): Plugin {
  return {
    name: "artefakt-ohne-projektkennung",
    transform(code) {
      return code.includes(PROJEKT_KENNUNG) ? code.replaceAll(PROJEKT_KENNUNG, "kein-projekt") : null;
    },
  };
}

export default defineConfig({
  root: path.join(wurzel, "artefakt"),
  base: "./",
  publicDir: false,
  envDir: path.join(wurzel, "artefakt"),
  envPrefix: "ARTEFAKT_NIE_",
  define: {
    __VERSIONSNOTIZ_NR__: "0",
  },
  plugins: [react(), laufzeitDateien(), relativeBildpfade(), ohneProjektKennung()],
  resolve: {
    alias: [
      { find: "@/integrations/supabase/client", replacement: path.join(wurzel, "src/artefakt/supabaseAttrappe.ts") },
      { find: "@", replacement: path.join(wurzel, "src") },
      // CSS-Schriften wie url("/fonts/…") als Datei ins Bündel, mit relativem Pfad.
      { find: /^\/fonts\//, replacement: path.join(wurzel, "public/fonts") + "/" },
    ],
  },
  css: {
    postcss: path.join(wurzel, "postcss.config.js"),
  },
  build: {
    outDir: path.join(wurzel, "dist-artefakt"),
    emptyOutDir: true,
    target: "es2020",
    sourcemap: false,
    // Wenige Dateien: alles, was dynamisch nachgeladen würde, in den Hauptteil.
    rollupOptions: { output: { inlineDynamicImports: true } },
    chunkSizeWarningLimit: 10000,
  },
});
