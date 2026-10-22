import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/*
 * Eigenständige Fassung des Investmentrechners, als claude.ai-Artefakt
 * „OSImmobilien - Investmentrechner“. Seit dem 22.10.2026 aus demselben Code
 * wie das CRM (src/artefakt/investmentrechner/main.tsx):
 *
 *   npm run build:investmentrechner   → dist-artefakt-investmentrechner/index.html
 *
 * Eine einzige HTML-Datei: Skript, Stile, Schriften und Logos stecken darin
 * (`einzelneDatei`, `assetsInlineLimit`). Kein Backend und keine
 * Zugangsdaten, wie in vite.artefakt.config.ts:
 * - `@/integrations/supabase/client` wird durch eine Attrappe ersetzt.
 * - `envDir` zeigt auf einen Ordner ohne .env, `envPrefix` passt auf keine
 *   Variable, also landet kein VITE_SUPABASE_* im Bündel.
 * - Die Projektkennung des Supabase-Projekts wird unkenntlich gemacht.
 */
const wurzel = __dirname;

const PROJEKT_KENNUNG = ["irwdgutegm", "ivbtgmftyc"].join("");
function ohneProjektKennung(): Plugin {
  return {
    name: "artefakt-ohne-projektkennung",
    transform(code) {
      return code.includes(PROJEKT_KENNUNG) ? code.replaceAll(PROJEKT_KENNUNG, "kein-projekt") : null;
    },
  };
}

/** Skript und Stile in die HTML-Datei schreiben, die Einzeldateien entfallen. */
function einzelneDatei(): Plugin {
  return {
    name: "artefakt-einzelne-datei",
    enforce: "post",
    generateBundle(_optionen, buendel) {
      const html = Object.values(buendel).find((d) => d.type === "asset" && d.fileName.endsWith(".html"));
      if (!html || html.type !== "asset") return;
      let text = String(html.source);
      for (const [name, datei] of Object.entries(buendel)) {
        if (datei.type === "chunk" && name.endsWith(".js")) {
          // `</script` im Code würde das Skript-Element vorzeitig schließen.
          const code = datei.code.replace(/<\/script/gi, "<\\/script");
          text = text.replace(new RegExp(`<script[^>]*src="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*></script>`), () => `<script type="module">${code}</script>`);
          delete buendel[name];
        } else if (datei.type === "asset" && name.endsWith(".css")) {
          text = text.replace(new RegExp(`<link[^>]*href="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`), () => `<style>${String(datei.source)}</style>`);
          delete buendel[name];
        }
      }
      html.source = text;
    },
  };
}

export default defineConfig({
  root: path.join(wurzel, "artefakt-investmentrechner"),
  base: "./",
  publicDir: false,
  envDir: path.join(wurzel, "artefakt-investmentrechner"),
  envPrefix: "ARTEFAKT_NIE_",
  define: {
    __VERSIONSNOTIZ_NR__: "0",
  },
  plugins: [react(), ohneProjektKennung(), einzelneDatei()],
  resolve: {
    alias: [
      { find: "@/integrations/supabase/client", replacement: path.join(wurzel, "src/artefakt/supabaseAttrappe.ts") },
      { find: "@", replacement: path.join(wurzel, "src") },
      // CSS-Schriften wie url("/fonts/…") ins Bündel, als data-Adresse.
      { find: /^\/fonts\//, replacement: path.join(wurzel, "public/fonts") + "/" },
    ],
  },
  css: {
    postcss: path.join(wurzel, "postcss.config.js"),
  },
  build: {
    outDir: path.join(wurzel, "dist-artefakt-investmentrechner"),
    emptyOutDir: true,
    target: "es2020",
    sourcemap: false,
    // Alles in die eine Datei: Bilder und Schriften als data-Adresse, keine nachgeladenen Teile.
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
    chunkSizeWarningLimit: 20000,
  },
});
