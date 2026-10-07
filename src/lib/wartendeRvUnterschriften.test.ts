/**
 * `getWartendeRvUnterschriften` liefert den Hinweis "wartet auf Unterschrift"
 * fuer das Kundenprofil.
 *
 * Anders als die Erinnerungen gilt er fuer alle offenen Vereinbarungen, auch
 * fuer die vor dem Stichtag `RV_ERINNERUNG_AB` und die ohne Versandzeitpunkt:
 * Das ist Anzeige, keine Erinnerung (Entscheidung Christian vom 24.09.2026).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const zeilen = vi.hoisted(() => ({ investments: [] as Array<Record<string, unknown>> }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-toast", () => ({ toast: () => {} }));
vi.mock("./dbStoreHelper", () => ({ isTestAccount: () => false, localGet: () => null, localSet: () => {} }));
vi.mock("./dataCache", () => ({
  // Jede Aenderung als neues Feld, damit der Index im Store neu aufbaut.
  cacheGet: (t: string) => (t === "investments" ? zeilen.investments : []),
  cacheInsert: () => {},
  cacheUpdate: () => {},
  cacheDelete: () => {},
  cacheSet: () => {},
  onCacheChange: () => () => {},
}));

import { getWartendeRvUnterschriften } from "./investmentsStore";

function setze(...metas: Array<Record<string, unknown>>) {
  zeilen.investments = metas.map((meta, i) => ({ id: `inv-${i + 1}`, kunde_id: "k-1", meta: { nummer: i + 1, ...meta } }));
}

beforeEach(() => setze());

describe("Hinweis im Kundenprofil: wartet auf Unterschrift", () => {
  it("nennt eine neue Vereinbarung mit Versandzeitpunkt", () => {
    const versand = "2026-10-01T08:00:00.000Z";
    setze({ rvSignaturePending: true, rvSignatureSentAt: versand });
    expect(getWartendeRvUnterschriften("k-1")).toEqual([
      { investmentId: "inv-1", bezeichnung: "Reservierungsvereinbarung", versendetMs: Date.parse(versand) },
    ]);
  });

  it("nennt auch eine vor dem Stichtag versendete Vereinbarung", () => {
    const versand = "2026-09-10T08:00:00.000Z";
    setze({ rvSignaturePending: true, rvSignatureSentAt: versand });
    expect(getWartendeRvUnterschriften("k-1").map((u) => u.versendetMs)).toEqual([Date.parse(versand)]);
  });

  it("nennt eine Vereinbarung ohne Versandzeitpunkt, dann ohne Dauer", () => {
    setze({ rvSignaturePending: true });
    expect(getWartendeRvUnterschriften("k-1")).toEqual([
      { investmentId: "inv-1", bezeichnung: "Reservierungsvereinbarung", versendetMs: null },
    ]);
  });

  it("verschwindet nach der Unterschrift", () => {
    // So hinterlaesst finalize-reservierung das Investment.
    setze({ rvSignaturePending: false, rvSigned: true, rvSignatureSentAt: "2026-10-01T08:00:00.000Z", rvPdf: "Reservierung.pdf" });
    expect(getWartendeRvUnterschriften("k-1")).toEqual([]);
  });

  it("zeigt nichts, solange nichts versendet ist", () => {
    setze({});
    expect(getWartendeRvUnterschriften("k-1")).toEqual([]);
    expect(getWartendeRvUnterschriften("")).toEqual([]);
  });
});
