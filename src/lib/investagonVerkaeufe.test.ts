import { describe, expect, it } from "vitest";
import {
  metaNachVerkauf,
  NOTBREMSE_MINDESTENS,
  planeVerkaeufe,
  type VerkaufsZeile,
  verkaufteKennungen,
} from "../../supabase/functions/investagon-import/verkaeufe";
import { statusFelder } from "../../supabase/functions/investagon-import/mapping";

/*
 * Christian am 23.09.2026, der wichtigste Punkt: Ein Partner darf nie eine
 * Wohnung anbieten, die in Investagon schon verkauft ist. Der Schritt in
 * `verkaeufe.ts` zieht deshalb jeden Verkauf in jedem Lauf nach, vor dem
 * eigentlichen Abgleich und unabhaengig davon, ob dieser das Projekt in
 * diesem Lauf erreicht.
 */

function zeile(
  id: string,
  felder: Partial<VerkaufsZeile> = {},
): VerkaufsZeile {
  return {
    id,
    objekt_id: "o1",
    we_nr: id,
    status: "frei",
    kunde_id: null,
    kunde_name: null,
    reserviert_am: null,
    meta: { investagonId: `iv-${id}`, investagonRaw: { active: 1, visibility: 1 } },
    ...felder,
  };
}

describe("Welche Einheiten Investagon verkauft hat", () => {
  it("liest active = 0 aus der Kurzliste, auch als Text", () => {
    const kennungen = verkaufteKennungen([
      { investagonId: "a", roh: { active: 0, visibility: -1 } },
      { investagonId: "b", roh: { active: "0" } },
      { investagonId: "c", roh: { active: 1, visibility: 1 } },
      { investagonId: "d", roh: { active: 6 } },
      { investagonId: "", roh: { active: 0 } },
      { roh: { active: 0 } },
      { investagonId: "e" },
    ]);
    expect([...kennungen].sort()).toEqual(["a", "b"]);
  });
});

describe("Der Plan für einen Lauf", () => {
  const verkauft = new Set(["iv-1", "iv-2", "iv-3", "iv-4", "iv-5"]);

  it("setzt freie und ungebundene Einheiten auf verkauft", () => {
    const plan = planeVerkaeufe(verkauft, [zeile("1"), zeile("2", { status: "reserviert" })], 400);
    expect(plan.nachziehen.map((z) => z.id)).toEqual(["1", "2"]);
    expect(plan.gebunden).toEqual([]);
  });

  it("zieht auch eine Einheit ohne Status nach", () => {
    const plan = planeVerkaeufe(verkauft, [zeile("1", { status: null })], 400);
    expect(plan.nachziehen.map((z) => z.id)).toEqual(["1"]);
  });

  it("laesst den Status einer Einheit mit Kundenvorgang stehen und meldet sie", () => {
    const plan = planeVerkaeufe(verkauft, [
      zeile("1", { status: "reserviert", kunde_id: "kunde-1" }),
      zeile("2", { status: "reserviert", kunde_name: "Kunde B" }),
      zeile("3", { status: "reserviert", reserviert_am: "2026-09-01" }),
    ], 400);
    expect(plan.nachziehen).toEqual([]);
    expect(plan.gebunden.map((z) => z.id)).toEqual(["1", "2", "3"]);
  });

  it("meldet eine gebundene Einheit nur einmal, nicht in jedem Lauf", () => {
    const schonGemeldet = zeile("1", {
      status: "reserviert",
      kunde_id: "kunde-1",
      meta: { investagonId: "iv-1", investagonRaw: { active: 0 } },
    });
    expect(planeVerkaeufe(verkauft, [schonGemeldet], 400).gebunden).toEqual([]);
  });

  it("ueberspringt, was schon verkauft ist oder Investagon nicht als verkauft fuehrt", () => {
    const plan = planeVerkaeufe(verkauft, [
      zeile("1", { status: "verkauft" }),
      zeile("9"),
      zeile("x", { meta: {} }),
    ], 400);
    expect(plan.nachziehen).toEqual([]);
    expect(plan.gebunden).toEqual([]);
  });

  it("zieht die Notbremse, wenn auf einmal ein Viertel der Einheiten verkauft wäre", () => {
    const viele = Array.from({ length: 30 }, (_, i) => zeile(String(i)));
    const alleVerkauft = new Set(viele.map((z) => String(z.meta!.investagonId)));
    const plan = planeVerkaeufe(alleVerkauft, viele, 100);
    expect(plan.nachziehen).toEqual([]);
    expect(plan.gebunden).toEqual([]);
    expect(plan.notbremse).toMatch(/30 Einheiten/);
  });

  it("laesst einen echten Paketverkauf eines Hauses durch", () => {
    const haus = Array.from({ length: 30 }, (_, i) => zeile(String(i)));
    const verkaufteHaus = new Set(haus.map((z) => String(z.meta!.investagonId)));
    const plan = planeVerkaeufe(verkaufteHaus, haus, 400);
    expect(plan.notbremse).toBeUndefined();
    expect(plan.nachziehen).toHaveLength(30);
  });

  it("bleibt bei kleinem Bestand handlungsfähig", () => {
    const wenige = Array.from({ length: NOTBREMSE_MINDESTENS }, (_, i) => zeile(String(i)));
    const plan = planeVerkaeufe(
      new Set(wenige.map((z) => String(z.meta!.investagonId))),
      wenige,
      12,
    );
    expect(plan.nachziehen).toHaveLength(NOTBREMSE_MINDESTENS);
  });
});

describe("Was an der Einheit geschrieben wird", () => {
  it("setzt active = 0 in den Rohdaten, damit die Angebotslisten sie sofort herausnehmen", () => {
    const meta = { investagonId: "iv-1", investagonRaw: { active: 1, visibility: 1, statusName: "Frei" }, hausgeldMonat: 120 };
    expect(metaNachVerkauf(meta, true)).toEqual({
      investagonId: "iv-1",
      investagonRaw: { active: 0, visibility: 1, statusName: "Frei" },
      hausgeldMonat: 120,
      investagonStatusVerwaltet: true,
    });
  });

  it("markiert eine gebundene Einheit nicht als vom Import geführt", () => {
    expect(metaNachVerkauf({ investagonRaw: { active: 6 } }, false)).toEqual({
      investagonRaw: { active: 0 },
    });
    expect(metaNachVerkauf(null, false)).toEqual({ investagonRaw: { active: 0 } });
  });
});

describe("Der Abgleich nutzt dieselbe Regel (statusFelder)", () => {
  it("setzt eine von Hand reservierte Einheit ohne Kundenvorgang auf verkauft", () => {
    expect(statusFelder({ active: 0 }, { status: "reserviert", meta: {} })).toEqual({
      status: "verkauft",
      verwaltet: true,
    });
  });

  it("laesst eine Einheit mit Kundenvorgang in der Hand der Abwicklung", () => {
    expect(statusFelder({ active: 0 }, { status: "reserviert", kunde_id: "k", meta: {} }).status).toBeUndefined();
    expect(statusFelder({ active: 0 }, { status: "reserviert", kunde_name: "Kunde B", meta: {} }).status).toBeUndefined();
    expect(statusFelder({ active: 0 }, { status: "reserviert", reserviert_am: "2026-09-01", meta: {} }).status).toBeUndefined();
  });

  it("aendert nichts an der bisherigen Regel für nicht verkaufte Einheiten", () => {
    expect(statusFelder({ active: 1 }, { status: "reserviert", meta: {} }).status).toBeUndefined();
    expect(statusFelder({ active: 1 }, { status: "frei", meta: {} }).status).toBe("frei");
    expect(statusFelder({ active: 6 }).status).toBe("reserviert");
  });
});
