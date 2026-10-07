import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  Der PDF-Export der Praesentationen fotografiert den Bildschirm mit
  html2canvas. Das kennt keine Weichzeichnung hinter Flaechen und malte mit
  Liquid Glass halbdurchsichtige Schleier ins PDF. Bis zum 24.09.2026 war die
  Abschaltung zwar gebaut (`ohneLiquidGlasInKopie`), aber nirgends
  eingehaengt. Dieser Test haelt fest, dass jede Aufnahme sie benutzt.
*/
const QUELLE = readFileSync(join(__dirname, "praesentationPdfExport.ts"), "utf8");

describe("PDF-Export der Praesentationen", () => {
  it("schaltet Liquid Glass in jeder fotografierten Kopie ab", () => {
    const aufrufe = QUELLE.split("html2canvas(").slice(1);
    expect(aufrufe.length).toBeGreaterThan(0);
    for (const aufruf of aufrufe) {
      const optionen = aufruf.slice(0, aufruf.indexOf("});"));
      expect(optionen).toMatch(/onclone:\s*\(kopie\)\s*=>\s*ohneLiquidGlasInKopie\(kopie\)/);
    }
  });

  it("holt die Abschaltung aus dem Designschalter", () => {
    expect(QUELLE).toMatch(/import \{ ohneLiquidGlasInKopie \} from "@\/lib\/designSchalter";/);
  });
});
