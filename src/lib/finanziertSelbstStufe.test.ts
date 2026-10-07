import { describe, it, expect, beforeEach } from "vitest";
import { cacheSet } from "@/lib/dataCache";
import { sindBonitaetsunterlagenFreigegeben } from "@/lib/kontaktPipeline";
import type { KundeData } from "@/lib/kundenStore";

/**
 * Vermerk „Kunde finanziert selbst“ (05.10.2026): Nach der unterschriebenen
 * Reservierung wartet die Stufenberechnung nicht auf Bonitäts- oder
 * Bankunterlagen. Vor der Unterschrift bleibt alles wie bisher, sonst
 * übersprünge der Vorgang die Reservierung.
 */

const KUNDE = { id: "k-1" } as KundeData;

function investment(meta: Record<string, unknown>) {
  cacheSet("investments", [{ id: "i-1", kunde_id: "k-1", erstellt_am: "2026-09-01T00:00:00Z", meta }]);
}

describe("Stufenberechnung beim Selbstfinanzierer", () => {
  beforeEach(() => cacheSet("investments", []));

  it("ohne Vermerk zählen fehlende Unterlagen weiter als nicht freigegeben", () => {
    investment({ rvSigned: true, docStatuses: {} });
    expect(sindBonitaetsunterlagenFreigegeben(KUNDE)).toBe(false);
  });

  it("mit Vermerk und unterschriebener Reservierung gilt die Bonität als erledigt", () => {
    investment({ rvSigned: true, docStatuses: {}, selbstauskunftEntfaellt: { aktiv: true } });
    expect(sindBonitaetsunterlagenFreigegeben(KUNDE)).toBe(true);
  });

  it("mit Vermerk, aber ohne Unterschrift, noch nicht", () => {
    investment({ docStatuses: {}, selbstauskunftEntfaellt: { aktiv: true } });
    expect(sindBonitaetsunterlagenFreigegeben(KUNDE)).toBe(false);
  });
});
