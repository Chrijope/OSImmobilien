import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { readFileSync } from "node:fs";
import {
  angeboteImVergleich, angeboteNachZuschlag, bankenKollisionen, darfFinanzierungEinsehen,
  darfFinanzierungSteuern, fehlendeAngaben, fristAmpel, kennzahlenJeFinanzierer,
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

describe("Rechte an Einreichungen (28.10.2026)", () => {
  it("Vertriebsleitung sieht Zielbanken und Vergleich, gibt aber keinen Zuschlag", () => {
    for (const r of ["admin", "inhaber", "backoffice", "vertriebsleiter"]) expect(darfFinanzierungEinsehen(r)).toBe(true);
    for (const r of ["vertriebspartner", "finanzierungspartner", "buchhaltung", null, undefined]) expect(darfFinanzierungEinsehen(r)).toBe(false);
    expect(darfFinanzierungSteuern("vertriebsleiter")).toBe(false);
    expect(darfFinanzierungSteuern("backoffice")).toBe(true);
  });

  it("nennt in der Migration dieselben Rollen wie die Oberflaeche", () => {
    const sql = readFileSync("supabase/migrations/20261028120000_finanzierung_chat_verlauf.sql", "utf8");
    const einsehen = sql.match(/FUNCTION public\.darf_finanzierung_einsehen[\s\S]*?IN \(([^)]*)\)/)![1];
    const rollen = einsehen.match(/'([a-z]+)'/g)!.map((r) => r.replace(/'/g, "")).sort();
    expect(rollen).toEqual(["admin", "backoffice", "inhaber", "vertriebsleiter"]);
    expect(rollen.every((r) => darfFinanzierungEinsehen(r))).toBe(true);
  });
});

describe("Angebote nach dem Zuschlag", () => {
  it("zeigt ohne Zuschlag alle Angebote im Vergleich, nichts im Verlauf", () => {
    const { sichtbar, verlauf } = angeboteNachZuschlag([
      e({ finanzierer_id: "a", status: "angebot", angebot: angebot(3.9) }),
      e({ finanzierer_id: "b", status: "angebot", angebot: angebot(3.6) }),
      e({ finanzierer_id: "c", status: "in_pruefung" }),
    ]);
    expect(sichtbar.map((x) => x.finanzierer_id)).toEqual(["b", "a"]);
    expect(verlauf).toEqual([]);
  });

  it("zeigt nach dem Zuschlag nur den Gewinner, die anderen Angebote im Verlauf statt weg", () => {
    const { sichtbar, verlauf } = angeboteNachZuschlag([
      e({ finanzierer_id: "a", status: "abgesagt", angebot: angebot(3.5) }),
      e({ finanzierer_id: "b", status: "zuschlag", angebot: angebot(3.7) }),
      e({ finanzierer_id: "c", status: "abgelehnt" }),
    ]);
    expect(sichtbar.map((x) => x.finanzierer_id)).toEqual(["b"]);
    expect(verlauf.map((x) => x.finanzierer_id)).toEqual(["a"]);
  });

  it("laesst dem Finanzierer mit Zuschlag nichts Fremdes im Verlauf", () => {
    // Die Datenbank liefert ihm nur die eigene Zeile.
    const { sichtbar, verlauf } = angeboteNachZuschlag([e({ status: "zuschlag", angebot: angebot(3.7) })]);
    expect(sichtbar).toHaveLength(1);
    expect(verlauf).toEqual([]);
  });
});
