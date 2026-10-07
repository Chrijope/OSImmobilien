import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renditeVon } from "./objektKennzahlen";

/*
 * M20c (04.10.2026): Eine Regel für die Mietrendite. Jahreskaltmiete der
 * Wohnung durch Kaufpreis der Wohnung, ohne Stellplatz; der Stellplatz steht
 * mit Preis und Miete in eigener Zeile.
 */

const lies = (pfad: string) => readFileSync(resolve(__dirname, "../..", pfad), "utf-8");

describe("renditeVon", () => {
  it("rechnet ohne Stellplatz", () => {
    const w = { mieteGesamt: 800, vkGesamt: 240000, stellplatzPreis: 15000, stellplatzMiete: 60 } as never;
    expect(renditeVon(w)).toBeCloseTo(4, 6);
  });

  it("gilt in Einheitsseite, Kundenansicht und Exposé", () => {
    for (const datei of ["src/pages/EinheitSeite.tsx", "src/components/kundenansicht/Wohnungsebene.tsx", "src/components/kundenansicht/kundenTexte.ts", "src/lib/exposeInhalt.ts"]) {
      const quelle = lies(datei);
      expect(quelle, datei).toMatch(/renditeVon\(w/);
      expect(quelle, datei).not.toMatch(/renditeProzent\(miete, (w\.vkGesamt|gesamt)\)/);
    }
    expect(lies("src/lib/exposeRechner.ts")).toContain("mietrenditeProzent: renditeProzent(kaltmieteMonat - Math.max(0, zahl(objekt.stellplatzMieteMonat)), kaufpreisAngepasst)");
    expect(lies("src/lib/exposeInhalt.ts")).toContain("stellplatzMieteMonat: w.stellplatzMiete || 0,");
  });
});
