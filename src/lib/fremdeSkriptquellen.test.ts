/**
 * Skripte, Worker und WASM kommen aus dem eigenen Build, nie von einem CDN.
 *
 * Die Content-Security-Policy in index.html erlaubt für script-src und
 * worker-src nur die eigene Herkunft und wenige benannte Dienste. Eine Adresse
 * bei cdnjs, unpkg oder jsdelivr scheitert deshalb im Browser, und zwar still:
 * So hat das PDF-Verkleinern in den Einstellungen den pdf.js-Worker von cdnjs
 * geladen und nie funktioniert (entfernt am 26.09.2026). Der richtige Weg ist
 * der Import aus dem installierten Paket, etwa
 * `import("pdfjs-dist/build/pdf.worker.mjs?url")`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const wurzel = resolve(__dirname, "..", "..");

function quelldateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) return quelldateien(pfad);
    return /\.(ts|tsx|js|mjs|css|html)$/.test(name) ? [pfad] : [];
  });
}

// Zusammengesetzt, damit diese Datei sich nicht selbst findet.
const FREMDE_CDNS = new RegExp(["cdnjs\\.cloudflare\\.com", "unpkg\\.com", "cdn\\.jsdelivr\\.net"].join("|"));

describe("Keine Skripte von fremden CDNs", () => {
  it("keine Datei unter src nennt cdnjs, unpkg oder jsdelivr", () => {
    const treffer = quelldateien(join(wurzel, "src"))
      .filter((datei) => FREMDE_CDNS.test(readFileSync(datei, "utf8")))
      .map((datei) => datei.slice(wurzel.length + 1));
    expect(treffer).toEqual([]);
  });

  it("index.html lädt nichts von dort", () => {
    expect(readFileSync(join(wurzel, "index.html"), "utf8")).not.toMatch(FREMDE_CDNS);
  });

  it("jeder pdf.js-Worker kommt aus dem installierten Paket", () => {
    const setzen = quelldateien(join(wurzel, "src"))
      .filter((datei) => !/\.test\.tsx?$/.test(datei))
      .filter((datei) => /workerSrc\s*=/.test(readFileSync(datei, "utf8")));
    expect(setzen.length).toBeGreaterThan(0);
    for (const datei of setzen) {
      expect(readFileSync(datei, "utf8"), datei).toContain("pdfjs-dist/build/pdf.worker.mjs?url");
    }
  });
});
