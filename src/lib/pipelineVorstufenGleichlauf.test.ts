import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FORTSCHRITT_STUFEN } from "./pipelineStufen";

/**
 * Die Stufenreihenfolge steht an zwei Orten. Dieser Test hält sie zusammen.
 *
 * Der Browser liest `src/lib/pipelineStufen.ts`, die Edge Functions lesen
 * `supabase/functions/_shared/pipeline-vorstufen.ts`. Deno und Vite teilen
 * sich keinen Code, deshalb gibt es die Liste zweimal.
 *
 * Genau diese Doppelpflege hat am 06.08.2026 den Fehler verursacht, um den es
 * hier geht: Die Reihenfolge wurde gedreht, zwei Stellen wurden nachgezogen,
 * `finalize-selbstauskunft` wurde übersehen. Sechs Wochen lang schob jede
 * unterschriebene Selbstauskunft den Kunden an Objektauswahl und Reservierung
 * vorbei auf die Bonitätsunterlagen.
 *
 * Läuft dieser Test rot, ist wieder eine Seite geändert worden und die andere
 * nicht. Dann gehört die Änderung an beide Stellen, nicht der Test angepasst.
 */

const GETEILTE_DATEI = join(
  process.cwd(),
  "supabase/functions/_shared/pipeline-vorstufen.ts",
);

/** Liest ein benanntes String-Array aus der Deno-Datei. */
function leseListe(quelle: string, name: string): string[] {
  const start = quelle.indexOf(`export const ${name} = [`);
  if (start < 0) throw new Error(`${name} nicht gefunden`);
  const ende = quelle.indexOf("]", start);
  return [...quelle.slice(start, ende).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

describe("Die Stufenreihenfolge der Edge Functions", () => {
  const quelle = readFileSync(GETEILTE_DATEI, "utf-8");

  it("stimmt Stufe für Stufe mit der des Browsers überein", () => {
    const imBrowser = FORTSCHRITT_STUFEN.map((s) => s.key);
    const inDenFunctions = leseListe(quelle, "FORTSCHRITT_REIHENFOLGE");

    expect(inDenFunctions).toEqual(imBrowser);
  });

  it("führt die Aliasnamen für Stufen ohne eigenen Schritt", () => {
    // Ohne sie bliebe ein Vorgang auf "bg_noshow" liegen, obwohl
    // "beratungsgespraech" in der Vorstufenmenge steht.
    for (const alias of ["eg_noshow", "erstgespraech", "bg_noshow", "zugewiesen", "kontaktversuche", "vermoegensaufbau"]) {
      expect(quelle).toContain(`${alias}:`);
    }
  });

  it("kennt die alte Stufe closing, die es im Browser nicht mehr gibt", () => {
    // Die bisherigen Listen in den Functions führen sie, und Altdaten können
    // sie noch tragen. Fiele sie weg, bliebe so ein Vorgang für immer stehen.
    expect(quelle).toContain("closing:");
    expect(FORTSCHRITT_STUFEN.map((s) => s.key)).not.toContain("closing");
  });

  it("enthält keine Zustände, die gar keine Fortschrittsstufen sind", () => {
    const inDenFunctions = leseListe(quelle, "FORTSCHRITT_REIHENFOLGE");
    for (const zustand of ["verloren", "archiviert", "bestandsimport"]) {
      expect(inDenFunctions).not.toContain(zustand);
    }
  });

  it("hat die Selbstauskunft vor der Objektauswahl und die Bonität dahinter", () => {
    const liste = leseListe(quelle, "FORTSCHRITT_REIHENFOLGE");
    const sa = liste.indexOf("selbstauskunft");
    const oa = liste.indexOf("objektauswahl");
    const res = liste.indexOf("reservierung");
    const bon = liste.indexOf("bonitaetsunterlagen");

    expect(sa).toBeLessThan(oa);
    expect(oa).toBeLessThan(res);
    expect(res).toBeLessThan(bon);
  });
});
