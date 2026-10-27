import { describe, expect, it } from "vitest";
import { berechneVerkaufsreport, type ReportObjekt } from "./verkaufsreport";

const objekt = (id: string, titel: string, wohnungen: ReportObjekt["wohnungen"]): ReportObjekt => ({ id, titel, wohnungen });

describe("berechneVerkaufsreport", () => {
  const objekte = [
    objekt("a", "Hauffstr. 38", [
      { weNr: "10", groesse: 50, vkGesamt: 200000, status: "verkauft" },
      { weNr: "2", groesse: 80, vkGesamt: 300000, status: "reserviert", statusText: "Notartermin" },
      { weNr: "3", groesse: 60, vkGesamt: 240000, status: "frei" },
    ]),
    // Fremdangebot ohne Bewegung: gehoert nicht in den Report.
    objekt("b", "Fremdobjekt", [{ weNr: "1", groesse: 40, vkGesamt: 150000, status: "frei" }]),
  ];
  const investments = [
    { objektId: "a", pipelineStufe: "notar", finanzierungsStatus: "bestaetigt", reserviertAm: "2026-10-01T09:00:00Z", notarTermin: "2026-10-21" },
    { objektId: "a", pipelineStufe: "reservierung", reserviertAm: "2026-10-10T09:00:00Z" },
    { pipelineStufe: "erreicht" },
    { pipelineStufe: "verloren" },
  ];
  const r = berechneVerkaufsreport(objekte, investments);

  it("nimmt nur Objekte mit Bewegung", () => {
    expect(r.objekte.map((o) => o.titel)).toEqual(["Hauffstr. 38"]);
  });

  it("rechnet Kacheln nur aus reservierten und verkauften Einheiten", () => {
    expect(r.kacheln.durchschnittKaufpreis).toBe(250000);
    expect(r.kacheln.kaufpreisVon).toBe(200000);
    expect(r.kacheln.kaufpreisBis).toBe(300000);
    expect(r.kacheln.durchschnittQmPreis).toBe(Math.round((4000 + 3750) / 2));
    expect(r.kacheln.reserviert).toBe(1);
    expect(r.kacheln.verkauft).toBe(1);
    expect(r.kacheln.durchschnittVerkaufsdauerTage).toBe(20);
  });

  it("zählt den Trichter ohne verlorene Vorgänge", () => {
    expect(r.trichter).toEqual([
      { stufe: "Interessenten", anzahl: 3 },
      { stufe: "Erstberatung", anzahl: 2 },
      { stufe: "Reservierung", anzahl: 2 },
      { stufe: "Finanzierung eingereicht", anzahl: 1 },
      { stufe: "Finanzierung bestätigt", anzahl: 1 },
      { stufe: "Notar", anzahl: 1 },
    ]);
  });

  it("listet Einheiten ohne Personendaten, nach Nummer sortiert", () => {
    const e = r.objekte[0].einheiten;
    expect(e.map((x) => x.weNr)).toEqual(["2", "3", "10"]);
    expect(e[0]).toEqual({ weNr: "2", groesse: 80, kaufpreis: 300000, qmPreis: 3750, stand: "Notartermin" });
    expect(JSON.stringify(r)).not.toMatch(/kunde|bank|berater|provision/i);
  });
});
