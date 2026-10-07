import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kein Import-Lauf darf Objekte löschen.
 *
 * Die Edge Function `investagon-import` räumt nach dem Lauf auf, sobald im
 * Aufruf nicht ausdrücklich `aufraeumen: false` steht: Sie löscht Objekte,
 * deren Investagon-Kennung gerade nicht geliefert wird, sofern weder Kunde
 * noch Reservierung noch Verkauf daran hängen. Ein Projekt, das in Investagon
 * nur kurz in "Überprüfung ausstehend" steht, wäre damit weg, samt Bildern
 * und Unterlagen.
 *
 * Christian am 23.09.2026: Was in Investagon nicht angeboten wird, wird
 * ausgeblendet, niemals gelöscht. Der Viertelstundenlauf ist seit dem
 * 22.09.2026 auf "nicht aufräumen" gestellt, siehe
 * `20260922100000_investagon_aufraeumen_aus.sql`. Der Knopf "Import jetzt
 * ausführen" war es bis zum 23.09.2026 nicht.
 *
 * Geprüft wird am Quelltext, weil die Gefahr in einem einzigen fehlenden
 * Schlüssel liegt und ein Oberflächentest ihn nicht sähe.
 */

const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");

/** Alle Rümpfe, mit denen die Oberfläche den Import aufruft. */
function importAufrufe(quelle: string): string[] {
  const treffer = [...quelle.matchAll(/functions\.invoke\("investagon-import",\s*\{\s*body:\s*(\{[^}]*\})/g)];
  return treffer.map((t) => t[1]);
}

describe("Der Import löscht nie", () => {
  const dialog = lies("src/components/objekte/InvestagonImportDialog.tsx");
  const aufrufe = importAufrufe(dialog);

  it("findet die Aufrufe überhaupt", () => {
    // Sonst prüfte der nächste Test gar nichts und bliebe trotzdem grün.
    expect(aufrufe.length).toBeGreaterThanOrEqual(1);
  });

  it("schickt beim echten Lauf ausdrücklich `aufraeumen: false` mit", () => {
    // Trockenlauf und Rohabruf schreiben nichts, der echte Lauf schon.
    const echte = aufrufe.filter((rumpf) => !/trockenlauf|roh:/.test(rumpf));
    expect(echte.length).toBeGreaterThanOrEqual(1);
    for (const rumpf of echte) {
      expect(rumpf, `Aufruf ohne aufraeumen: false: ${rumpf}`).toMatch(/aufraeumen:\s*false/);
    }
  });

  it("stellt auch den Zeitplan auf nicht aufräumen", () => {
    const migration = lies("supabase/migrations/20260922100000_investagon_aufraeumen_aus.sql");
    expect(migration).toMatch(/"aufraeumen"\s*:\s*false/);
  });
});
