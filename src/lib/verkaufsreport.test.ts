import { describe, expect, it } from "vitest";
import { baueStand, betrag, crmWerte, kennzahlen, salescycle, wert, type ReportZeile } from "./verkaufsreport";

const HEUTE = "2026-10-27";

describe("crmWerte", () => {
  it("fuellt nur, was das CRM kennt", () => {
    const w = crmWerte({
      id: "i1", pipelineStufe: "notar", objektTitel: "Hauffstr. 38", weNr: "4", kaufpreis: 176000,
      beratungAm: "2026-09-01", closingAm: "2026-09-07T10:00:00Z", reserviertAm: "2026-09-10T08:00:00Z",
      finanzierungSeit: "2026-09-20T08:00:00Z", notarTermin: "2026-11-13",
      kundenordner: [{ kategorie: "Kaufvertragsentwurf", freigegeben: true, freigegebenAm: "2026-10-16T09:00:00Z" }],
      einreichungen: [
        { eingereicht_am: "2026-09-14T08:00:00Z", banken: ["Volksbank"], status: "abgesagt", entschieden_am: null, angebot: null },
        { eingereicht_am: "2026-09-15T08:00:00Z", banken: ["Sparkasse"], status: "zuschlag", entschieden_am: "2026-10-07T08:00:00Z", angebot: { bank: "Sparkasse" } },
      ],
    }, HEUTE);
    expect(w).toEqual({
      weNr: "4", objekt: "Hauffstr. 38", erstberatung: "2026-09-01", zweitberatung: "2026-09-07", reserviert: "2026-09-10",
      finanzierungEingereicht: "2026-09-14", bank: "Sparkasse", finanzierungGenehmigt: "2026-10-07",
      kve: "2026-10-16", notartermin: "2026-11-13", kaufpreis: "176000",
    });
  });

  it("zaehlt eine kuenftige Beratung nicht und Besichtigung nur nach Gutachterstufe", () => {
    const w = crmWerte({ id: "i2", pipelineStufe: "besichtigung", beratungAm: "2026-11-02", besichtigungSeit: "2026-10-20T08:00:00Z", finanzierungsStatus: "bestaetigt" }, HEUTE);
    expect(w.erstberatung).toBeUndefined();
    expect(w.gutachterBesichtigt).toBeUndefined();
    expect(w.finanzierungGenehmigt).toBe("bestätigt");
  });
});

describe("baueStand", () => {
  it("nimmt Vorgaenge ab Beratung und uebernimmt Handeintraege und Handzeilen", () => {
    const vorher = {
      version: 2 as const,
      zeilen: [
        { id: "a", quelle: "crm" as const, crm: {}, manuell: { stellplatz: "SP" } },
        { id: "h", quelle: "manuell" as const, crm: {}, manuell: { objekt: "Hauffstr.", erstberatung: "Fremdvertrieb" } },
      ],
    };
    const d = baueStand([
      { id: "a", pipelineStufe: "reservierung", objektTitel: "Hauffstr." },
      { id: "b", pipelineStufe: "erreicht" },
      { id: "c", pipelineStufe: "verloren" },
    ], vorher, HEUTE);
    expect(d.zeilen.map((z) => z.id).sort()).toEqual(["a", "h"]);
    expect(wert(d.zeilen.find((z) => z.id === "a")!, "stellplatz")).toBe("SP");
  });
});

describe("kennzahlen", () => {
  const z = (id: string, werte: ReportZeile["manuell"]): ReportZeile => ({ id, quelle: "manuell", crm: {}, manuell: werte });
  const zeilen = [
    z("1", { erstberatung: "2026-09-01", zweitberatung: "07.09.2026", notartermin: "2026-10-01", kaufpreis: "176.000" }),
    z("2", { erstberatung: "Fremdvertrieb", zweitberatung: "noch offen", kaufpreis: "304000" }),
    z("3", { erstberatung: "2026-09-11" }),
  ];
  const k = kennzahlen(zeilen);

  it("zaehlt wie die Excel nur Daten als erledigt, mit Quoten", () => {
    expect(k.trichter[0]).toMatchObject({ label: "Interessenten", anzahl: 3 });
    expect(k.trichter[1]).toMatchObject({ anzahl: 2, anteilAller: 2 / 3, anteilVorstufe: 2 / 3 });
    expect(k.trichter[2]).toMatchObject({ anzahl: 1, anteilVorstufe: 0.5 });
  });

  it("rechnet Salescycle und Ø Kaufpreis", () => {
    expect(salescycle(zeilen[0])).toBe(30);
    expect(k.salescycleTage).toBe(30);
    expect(k.ausgewertet).toBe(1);
    expect(k.kaufpreis).toBe(240000);
    expect(betrag("176.000 €")).toBe(176000);
    expect(betrag("noch offen")).toBeNull();
  });
});
