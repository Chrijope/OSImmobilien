import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PIPELINE_STUFEN } from "@/lib/pipelineStufen";

/**
 * Wacht darüber, dass die Rangfolge der Pipelinestufen in der Datenbank
 * dieselbe ist wie in `pipelineStufen.ts`.
 *
 * Eine Buchung schiebt die Stufe eines Kontakts nur nach vorne, und diesen
 * Vergleich muss die Datenbank anstellen: Der Buchende hat kein CRM im
 * Browser. Deshalb steht die Reihenfolge ein zweites Mal in
 * `buchung_pipeline_rang`. Dieser Test liest die Migration und vergleicht.
 * Ohne ihn würde eine neue Stufe im TypeScript still an der Datenbank
 * vorbeigehen, und ein Kunde fiele bei der nächsten Buchung zurück.
 *
 * Bewusst am Text der Migration und nicht an einer laufenden Datenbank: Die
 * Tests laufen ohne Supabase.
 */

/**
 * Die zuletzt definierende Migration, nicht eine fest eingetragene.
 *
 * Vorher stand hier ein fester Dateiname. Als die Reihenfolge am 06.08.2026
 * per neuer Migration gedreht wurde, las der Test weiter die alte Fassung und
 * meldete einen Widerspruch, den es nicht mehr gab. Massgeblich ist immer die
 * jüngste Migration, die die Funktion neu schreibt, denn die gilt zuletzt in
 * der Datenbank.
 */
function neuesteMigration(): string {
  const ordner = resolve(__dirname, "../../supabase/migrations");
  const treffer = readdirSync(ordner)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(resolve(ordner, f), "utf8")
      .includes("FUNCTION public.buchung_pipeline_rang"))
    // Der Dateiname beginnt mit dem Zeitstempel, alphabetisch sortiert ist
    // damit die letzte auch die jüngste.
    .sort();
  expect(treffer.length, "keine Migration definiert buchung_pipeline_rang").toBeGreaterThan(0);
  return resolve(ordner, treffer[treffer.length - 1]);
}

const MIGRATION = neuesteMigration();

/** Die Legacy-Aliase sind alte Namen früher Stufen und bewusst umgehängt. */
const LEGACY: Record<string, string> = {
  zugewiesen: "neuer_lead",
  kontaktversuche: "erreicht",
  vermoegensaufbau: "follow_up",
};

/** Alle `WHEN 'stufe' THEN rang` aus der Funktion `buchung_pipeline_rang`. */
function raengeAusMigration(): Map<string, number> {
  const sql = readFileSync(MIGRATION, "utf8");
  const anfang = sql.indexOf("CREATE OR REPLACE FUNCTION public.buchung_pipeline_rang");
  expect(anfang, "buchung_pipeline_rang steht nicht in der Migration").toBeGreaterThan(-1);
  const ende = sql.indexOf("$$;", anfang);
  const rumpf = sql.slice(anfang, ende);

  const raenge = new Map<string, number>();
  for (const treffer of rumpf.matchAll(/WHEN\s+'([a-z_]+)'\s+THEN\s+(-?\d+)/g)) {
    raenge.set(treffer[1], Number(treffer[2]));
  }
  return raenge;
}

describe("buchung_pipeline_rang", () => {
  const raenge = raengeAusMigration();

  it("kennt jede Stufe aus PIPELINE_STUFEN", () => {
    for (const stufe of PIPELINE_STUFEN) {
      expect(raenge.has(stufe.key), `Stufe fehlt in der Migration: ${stufe.key}`).toBe(true);
    }
  });

  /*
   * Stufen, die es nur noch in gespeicherten Daten gibt. Die Migration muss sie
   * kennen, damit ein Altdatensatz nicht auf Rang -1 faellt, die Anwendung
   * zeigt sie aber nicht mehr an.
   */
  const NUR_ALTDATEN = new Set<string>(["erstgespraech"]);

  it("kennt keine Stufe, die es im CRM nicht gibt", () => {
    const bekannt = new Set<string>(PIPELINE_STUFEN.map((s) => s.key));
    for (const stufe of raenge.keys()) {
      if (NUR_ALTDATEN.has(stufe)) continue;
      expect(bekannt.has(stufe), `Unbekannte Stufe in der Migration: ${stufe}`).toBe(true);
    }
  });

  it("legt die abgeschaffte Stufe Erstgespraech gefuehrt auf denselben Rang", () => {
    // Zusammengelegt am 24.08.2026. Altdaten duerfen dadurch weder nach vorne
    // noch nach hinten rutschen.
    expect(raenge.get("erstgespraech")).toBe(raenge.get("erstgespraech_geplant"));
  });

  it("hält die Reihenfolge der echten Stufen ein", () => {
    const echte = PIPELINE_STUFEN.map((s) => s.key).filter((k) => !(k in LEGACY));
    for (let i = 1; i < echte.length; i += 1) {
      const vorher = raenge.get(echte[i - 1]) ?? -1;
      const jetzt = raenge.get(echte[i]) ?? -1;
      expect(jetzt, `${echte[i]} muss hinter ${echte[i - 1]} liegen`).toBeGreaterThan(vorher);
    }
  });

  it("hängt die Legacy-Aliase an ihre heutige Entsprechung", () => {
    for (const [alt, neu] of Object.entries(LEGACY)) {
      expect(raenge.get(alt), `${alt} muss den Rang von ${neu} haben`).toBe(raenge.get(neu));
    }
  });

  it("stuft ein gebuchtes Erstgespräch vor einen neuen Lead, aber hinter Finanzierung", () => {
    // Genau der Fall aus dem Befund: Ein Kunde in "Finanzierung" darf durch
    // ein gebuchtes Erstgespräch nicht zurückfallen.
    const geplant = raenge.get("erstgespraech_geplant") ?? -1;
    expect(geplant).toBeGreaterThan(raenge.get("neuer_lead") ?? -1);
    expect(geplant).toBeLessThan(raenge.get("finanzierung") ?? -1);
  });
});
