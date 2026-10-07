import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  anlageklasseNachImport,
  importMetaZusammenfuehren,
} from "../../supabase/functions/investagon-import/mapping";

/**
 * Anlageklasse beim Abgleich mit Investagon (Christian, 23.09.2026).
 *
 * Bei Investagon-Objekten führt immer Investagon die Anlageklasse. Ein nicht
 * leerer Wert ersetzt, was im CRM steht. Ein LEERER Wert löscht aber nie ein
 * gefülltes Feld. Vorher schrieb der Abgleich ihn einfach darüber.
 */

describe("Anlageklasse nach dem Abgleich", () => {
  it("ein nicht leerer Investagon-Wert ersetzt die bisherige Klasse", () => {
    expect(anlageklasseNachImport("Eigentumswohnung", "WG-Wohnung")).toBe("Eigentumswohnung");
    expect(anlageklasseNachImport("  Globalobjekt ", "WG-Wohnung")).toBe("Globalobjekt");
    expect(anlageklasseNachImport("WG-Wohnung", undefined)).toBe("WG-Wohnung");
  });

  it("ein leerer Investagon-Wert lässt die bisherige Klasse stehen", () => {
    expect(anlageklasseNachImport("", "WG-Wohnung")).toBe("WG-Wohnung");
    expect(anlageklasseNachImport("   ", "WG-Wohnung")).toBe("WG-Wohnung");
    expect(anlageklasseNachImport(undefined, "WG-Wohnung")).toBe("WG-Wohnung");
    expect(anlageklasseNachImport(null, "WG-Wohnung")).toBe("WG-Wohnung");
  });

  it("liefert nichts, wenn weder Investagon noch das CRM eine Klasse kennt", () => {
    expect(anlageklasseNachImport("", undefined)).toBeUndefined();
    expect(anlageklasseNachImport(undefined, "  ")).toBeUndefined();
  });
});

describe("meta beim Abgleich zusammenführen", () => {
  const bisher = { anlageklasse: "WG-Wohnung", verwaltung: "Hausverwaltung Beispiel", importStand: "2026-09-22" };

  it("ein leerer Wert löscht die gefüllte Klasse nicht", () => {
    const neu = importMetaZusammenfuehren(bisher, { anlageklasse: "", importStand: "2026-09-23" });
    expect(neu.anlageklasse).toBe("WG-Wohnung");
    expect(neu.importStand).toBe("2026-09-23");
    expect(neu.verwaltung).toBe("Hausverwaltung Beispiel");
  });

  it("eine fehlende Klasse löscht die gefüllte nicht", () => {
    expect(importMetaZusammenfuehren(bisher, { importStand: "2026-09-23" }).anlageklasse).toBe("WG-Wohnung");
  });

  it("ein nicht leerer Wert ersetzt sie", () => {
    const neu = importMetaZusammenfuehren(bisher, { anlageklasse: "Eigentumswohnung" });
    expect(neu.anlageklasse).toBe("Eigentumswohnung");
    expect(neu.verwaltung).toBe("Hausverwaltung Beispiel");
  });

  it("legt keine leere Klasse an", () => {
    expect("anlageklasse" in importMetaZusammenfuehren(null, { anlageklasse: "" })).toBe(false);
    expect("anlageklasse" in importMetaZusammenfuehren({}, { importStand: "x" })).toBe(false);
  });
});

describe("Der Import benutzt beides wirklich", () => {
  // Geprüft am Quelltext, weil die Edge Function nur in Deno läuft.
  const quelle = readFileSync(resolve(process.cwd(), "supabase/functions/investagon-import/index.ts"), "utf8");

  it("führt meta über die Regel zusammen statt den leeren Wert darüberzuschreiben", () => {
    expect(quelle).toMatch(/importMetaZusammenfuehren\(\s*vor\.meta/);
    expect(quelle).not.toMatch(/anlageklasse:\s*p\.anlageklasse\b/);
  });

  it("setzt den Schalter Globalobjekt beim Anlegen und beim Abgleich", () => {
    expect(quelle).toMatch(/global_objekt:\s*istGlobalAnlageklasse\(gelieferteKlasse\)/);
    expect(quelle).toMatch(/globalSchalterNachImport\(/);
    expect(quelle).toMatch(/updateFelder\.global_objekt\s*=\s*schalter/);
  });
});
