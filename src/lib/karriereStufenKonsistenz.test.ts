import { describe, it, expect, vi } from "vitest";

// karriereStufeHelper importiert cacheGet für die Override-Helfer, die hier
// nicht getestet werden. Ein leerer Platzhalter genügt.
vi.mock("@/lib/dataCache", () => ({
  cacheGet: () => [],
}));

import {
  KARRIERE_STUFEN,
  formatSatzProzent,
  formatStufenProvision,
} from "@/lib/karriereStufeHelper";
import { KARRIERESTUFEN } from "@/lib/zielplanungStore";
import { OVERHEAD_AKTIV } from "@/lib/lizenzPakete";

/**
 * Paket D der Provisionssatz-Sanierung: Die Stufen-Tabelle existierte in
 * mehreren Kopien (Zielplanung, Abrechnungen, Auswertungen, Nutzerverwaltung).
 * Diese Tests stellen sicher, dass die abgeleiteten Darstellungen dieselben
 * Sätze liefern wie die kanonische Quelle KARRIERE_STUFEN und dass niemand
 * unbemerkt wieder eine eigene Tabelle mit abweichenden Sätzen einführt.
 */

describe("Kanonische Stufen-Tabelle", () => {
  it("enthält die vier bekannten Stufen mit ihren Sätzen", () => {
    expect(
      KARRIERE_STUFEN.map((s) => ({ id: s.id, titel: s.titel, rate: s.rate })),
    ).toEqual([
      { id: "tippgeber", titel: "Vertriebspartner (Alt)", rate: 3 },
      { id: "vertriebspartner", titel: "Vertriebspartner", rate: 4 },
      { id: "manager", titel: "Team Lead", rate: 4.5 },
      { id: "vertriebsfirma", titel: "Lizenzpartner", rate: 5 },
    ]);
  });
});

describe("Zielplanung: KARRIERESTUFEN ist aus KARRIERE_STUFEN abgeleitet", () => {
  it("liefert je Stufe dieselbe Kennung, denselben Titel und denselben Satz", () => {
    expect(KARRIERESTUFEN).toEqual(
      KARRIERE_STUFEN.map((s) => ({ id: s.id, label: s.titel, rate: s.rate })),
    );
  });
});

describe("formatSatzProzent: deutsche Anzeige der Sätze", () => {
  it("formatiert ganze und halbe Prozentsätze mit Komma", () => {
    expect(formatSatzProzent(3)).toBe("3 %");
    expect(formatSatzProzent(4.5)).toBe("4,5 %");
  });
});

describe("Nutzerverwaltung: Provisions-Anzeige je Stufe", () => {
  it("zeigt die Sätze der kanonischen Quelle; der Junior-Override hängt am Overhead-Schalter", () => {
    expect(KARRIERE_STUFEN.map(formatStufenProvision)).toEqual(
      OVERHEAD_AKTIV
        ? ["3 %", "4 %", "4,5 % + 1,5 % Junior-Override", "5 % + 2 % Junior-Override"]
        : ["3 %", "4 %", "4,5 %", "5 %"],
    );
  });
});
