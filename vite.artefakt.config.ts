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
 * Mit NUR_SELBSTAUSKUNFT=1 (npm run build:artefakt-selbstauskunft) nur die
 * Selbstauskunft, ohne Präsentation, für das Artefakt „Selbstauskunft“
 * (Christian, 29.10.2026)   → dist-artefakt-selbstauskunft/
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
const NUR_SELBSTAUSKUNFT = process.env.NUR_SELBSTAUSKUNFT === "1";

/*
 * Dateien aus public/, die zur Laufzeit über feste Pfade geholt werden:
 * Schriften und Logos per fetch (jsPDF, pdfBranding.ts; netzwerk.ts biegt
 * die Pfade relativ um), Objektfotos als <img src="/images/mikroseite/…">
 * (Präsentation, siehe `relativeBildpfade`).
 */
const LAUFZEIT_DATEIEN = [
  "fonts/PlusJakartaSans-Regular.ttf",
  "fonts/PlusJakartaSans-Bold.ttf",
  // Exposé-Schriften für das PDF „Finanzierungsrahmen“ (finanzierungsrahmenPdf.ts).
  "fonts/PlayfairDisplay-Medium.ttf",
  "fonts/PlayfairDisplay-Italic.ttf",
  "fonts/Outfit-Regular.ttf",
  "fonts/Outfit-SemiBold.ttf",
  "images/os-real-estate-logo-quer.png",
  "images/os-real-estate-logo-quer-dunkel.png",
  // Objektfotos und Vertriebsdokumente braucht nur die Präsentation.
  ...(NUR_SELBSTAUSKUNFT ? [] : [
  ...fs.readdirSync(path.join(wurzel, "public/images/mikroseite")).map((d) => `images/mikroseite/${d}`),
  // Fassung B verlinkt am Ende der Konzeptfolien das Vertriebsdokument (DOKUMENTE_B).
  ...fs.readdirSync(path.join(wurzel, "public/vertriebsunterlagen")).map((d) => `vertriebsunterlagen/${d}`),
  ]),
];

/** Titel der Seite (und damit des Artefakts) für die Fassung nur mit Selbstauskunft. */
function seitenTitel(): Plugin {
  return {
    name: "artefakt-seitentitel",
    transformIndexHtml: (html) => (NUR_SELBSTAUSKUNFT ? html.replace(/<title>[^<]*<\/title>/, "<title>OS - Selbstauskunft</title>") : html),
  };
}

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

/** "/images/…" und "/vertriebsunterlagen/…" in Zeichenketten werden relativ, damit sie auch im Unterpfad laden. */
function relativeBildpfade(): Plugin {
  return {
    name: "artefakt-relative-bildpfade",
    transform(code, id) {
      if (!/\/src\/.*\.(ts|tsx)$/.test(id) || !/["'`]\/(images|vertriebsunterlagen)\//.test(code)) return null;
      return code.replace(/(["'`])\/(images|vertriebsunterlagen)\//g, "$1./$2/");
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
    __NUR_SELBSTAUSKUNFT__: JSON.stringify(NUR_SELBSTAUSKUNFT),
    // PDFs der Artefakte (Selbstauskunft, Zusammenfassung) ohne OS-Logo (Christian, 29.10.2026).
    __OHNE_LOGO__: "true",
  },
  plugins: [react(), laufzeitDateien(), relativeBildpfade(), ohneProjektKennung(), seitenTitel()],
  resolve: {
    alias: [
      { find: "@/integrations/supabase/client", replacement: path.join(wurzel, "src/artefakt/supabaseAttrappe.ts") },
      // PDF-Vorschau als Canvas statt blob:-iframe, das im Sandbox-iframe blockiert wird.
      { find: "@/components/pdf/LivePdfVorschau", replacement: path.join(wurzel, "src/artefakt/LivePdfVorschauBilder.tsx") },
      { find: "@", replacement: path.join(wurzel, "src") },
      // CSS-Schriften wie url("/fonts/…") als Datei ins Bündel, mit relativem Pfad.
      { find: /^\/fonts\//, replacement: path.join(wurzel, "public/fonts") + "/" },
    ],
  },
  css: {
    postcss: path.join(wurzel, "postcss.config.js"),
  },
  build: {
    outDir: path.join(wurzel, NUR_SELBSTAUSKUNFT ? "dist-artefakt-selbstauskunft" : "dist-artefakt"),
    emptyOutDir: true,
    target: "es2020",
    sourcemap: false,
    // Wenige Dateien: alles, was dynamisch nachgeladen würde, in den Hauptteil.
    rollupOptions: { output: { inlineDynamicImports: true } },
    chunkSizeWarningLimit: 10000,
  },
});
