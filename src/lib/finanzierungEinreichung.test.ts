import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  angeboteImVergleich, bankenKollisionen, fehlendeAngaben, fristAmpel, kennzahlenJeFinanzierer,
  type Einreichung,
} from "./finanzierungEinreichung";
import { fristInWerktagen } from "../../supabase/functions/_shared/finanzierung-partner-benachrichtigen";

function e(teil: Partial<Einreichung>): Einreichung {
  return {
    id: Math.random().toString(36), investment_id: "i1", finanzierer_id: "f1", status: "eingereicht",
    frist_bis: null, banken: [], angebot: null, angebot_datei: null, grund: null,
    eingereicht_am: "2026-10-01T08:00:00Z", gesichtet_am: null, angebot_am: null, entschieden_am: null,
    ...teil,
  };
}

const angebot = (effektivzins: number, summe = 200000) => ({
  bank: "Sparkasse", summe, sollzins: 3.5, effektivzins, zinsbindungJahre: 10, tilgung: 2,
  bereitstellungszinsfreiMonate: 6, sondertilgung: "5 %", gueltigBis: "2026-11-30",
});

describe("Bankenkollision", () => {
  it("meldet eine Bank, bei der zwei Finanzierer anfragen, Schreibweise egal", () => {
    const k = bankenKollisionen([
      e({ finanzierer_id: "a", banken: ["Sparkasse Berlin", "DKB"] }),
      e({ finanzierer_id: "b", banken: ["sparkasse  berlin"] }),
    ]);
    expect([...k.keys()]).toEqual(["Sparkasse Berlin"]);
    expect(k.get("Sparkasse Berlin")).toEqual(["a", "b"]);
  });

  it("zählt abgesagte und abgelehnte Einreichungen nicht", () => {
    const k = bankenKollisionen([
      e({ finanzierer_id: "a", banken: ["DKB"] }),
      e({ finanzierer_id: "b", banken: ["DKB"], status: "abgelehnt" }),
    ]);
    expect(k.size).toBe(0);
  });
});

describe("Vergleich", () => {
  it("sortiert nach Effektivzins und lässt Einreichungen ohne Angebot weg", () => {
    const liste = angeboteImVergleich([
      e({ id: "teuer", status: "angebot", angebot: angebot(4.1) }),
      e({ id: "ohne", status: "in_pruefung" }),
      e({ id: "billig", status: "angebot", angebot: angebot(3.6) }),
    ]);
    expect(liste.map((x) => x.id)).toEqual(["billig", "teuer"]);
  });

  it("nennt fehlende Pflichtangaben", () => {
    expect(fehlendeAngaben({ bank: "X", summe: 1 }, false)).toContain("Effektivzins");
    expect(fehlendeAngaben(angebot(3.6), true)).toEqual([]);
    expect(fehlendeAngaben(angebot(3.6), false)).toEqual(["Angebot als PDF"]);
  });
});

describe("Frist", () => {
  it("rechnet 5 Werktage über das Wochenende", () => {
    // Montag 26.10.2026 plus 5 Werktage ist Montag 02.11.2026.
    expect(fristInWerktagen(new Date("2026-10-26T10:00:00Z"))).toBe("2026-11-02");
    // Freitag 30.10.2026 plus 5 Werktage ist Freitag 06.11.2026.
    expect(fristInWerktagen(new Date("2026-10-30T10:00:00Z"))).toBe("2026-11-06");
  });

  it("zeigt rot nur bei überfälligen, offenen Einreichungen", () => {
    const heute = new Date("2026-10-27T10:00:00Z");
    expect(fristAmpel(e({ frist_bis: "2026-10-26" }), heute)).toBe("rot");
    expect(fristAmpel(e({ frist_bis: "2026-10-28" }), heute)).toBe("gelb");
    expect(fristAmpel(e({ frist_bis: "2026-11-05" }), heute)).toBe("gruen");
    expect(fristAmpel(e({ frist_bis: "2026-10-26", status: "angebot" }), heute)).toBeNull();
  });
});

describe("Kennzahlen je Finanzierer", () => {
  it("rechnet Reaktionszeit, Quoten, besten Zins und Volumen", () => {
    const [k] = kennzahlenJeFinanzierer([
      e({ gesichtet_am: "2026-10-01T10:00:00Z", angebot_am: "2026-10-02T08:00:00Z", status: "zuschlag", angebot: angebot(3.6, 250000) }),
      e({ gesichtet_am: "2026-10-01T12:00:00Z", angebot_am: "2026-10-03T08:00:00Z", status: "abgesagt", angebot: angebot(3.9) }),
      e({ status: "abgelehnt", entschieden_am: "2026-10-01T14:00:00Z" }),
      e({ status: "zurueckgezogen" }),
    ]);
    expect(k.eingereicht).toBe(4);
    expect(k.reaktionStunden).toBe(4); // (2 + 4 + 6) / 3
    expect(k.angebotsquote).toBeCloseTo(2 / 3);
    expect(k.zusagequote).toBe(0.5);
    expect(k.besterEffektivzins).toBe(3.6);
    expect(k.volumen).toBe(250000);
  });
});
