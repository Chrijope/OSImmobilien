import { describe, it, expect, vi } from "vitest";

/**
 * Die ganze Kette vom ausgefuellten Selbstauskunft-Formular bis zum Vorschlag
 * im Investmentrechner, mit echten Modulen dazwischen: saQuelle waehlt die
 * Selbstauskunft des Investments, steuerHelper liest daraus das Jahresbrutto,
 * kundenkontextHelper leitet zvE und Veranlagung ab, kundenUebernahme baut den
 * Vorschlag.
 *
 * Nur die beiden Datenquellen sind Attrappen: der Kontakt und die
 * investments-Zeilen aus dem Zwischenspeicher.
 *
 * Sie deckt den Fehler ab, an dem das Jahresbrutto nie im Rechner ankam: Das
 * Formular schreibt `bruttoJahr`, gelesen wurde frueher ausschliesslich
 * `einkommenBruttoJahr`.
 */

const bestand = vi.hoisted(() => ({
  kontakte: {} as Record<string, unknown>,
  investments: [] as unknown[],
}));

vi.mock("@/lib/kundenStore", async (original) => ({
  ...(await original<typeof import("@/lib/kundenStore")>()),
  getKontaktById: (id: string) => bestand.kontakte[id] ?? null,
}));

vi.mock("@/lib/dataCache", async (original) => ({
  ...(await original<typeof import("@/lib/dataCache")>()),
  cacheGet: (tabelle: string) => (tabelle === "investments" ? bestand.investments : []),
}));

import { kundenUebernahmeFuer } from "@/lib/investmentrechner/kundenUebernahme";

/**
 * Eine Selbstauskunft mit genau den Schluesseln, die das Formular speichert
 * (SelbstauskunftForm.tsx: `bruttoJahr` und `person2Data.bruttoJahr`, Betraege
 * als Text in deutscher Schreibweise). Bewusst ohne Import des Formulars, das
 * zoege die halbe Anwendung in den Test.
 */
function saDatenAusFormular() {
  return {
    vorname: "Anna",
    nachname: "Muster",
    familienstand: "verheiratet",
    beschaeftigungsart: "angestellt",
    steuerklasse: "3",
    // Genau so tippt der Kunde es ein, formatCurrency macht daraus diesen Text.
    bruttoJahr: "60.000,00",
    person2: true,
    person2Data: {
      vorname: "Bernd",
      nachname: "Muster",
      familienstand: "verheiratet",
      beschaeftigungsart: "angestellt",
      bruttoJahr: "30.000,00",
    },
    abgeschlossen: true,
    abgeschlossenAm: "2026-08-12T00:00:00.000Z",
  } as Record<string, unknown>;
}

function bestandSetzen(saData: unknown | null) {
  bestand.kontakte = {
    k1: {
      id: "k1",
      vorname: "Anna",
      nachname: "Muster",
      meta: { selbstauskunftSignedAt: "2026-08-12T00:00:00.000Z" },
    },
  };
  bestand.investments = [
    { id: "inv1", kunde_id: "k1", erstellt_am: "2026-08-01T00:00:00.000Z", meta: { nummer: 1, saData } },
  ];
}

describe("Vom Selbstauskunft-Formular bis in den Investmentrechner", () => {
  it("übernimmt das eingetippte Jahresbrutto beider Personen samt Herkunft", () => {
    bestandSetzen(saDatenAusFormular());

    const u = kundenUebernahmeFuer("k1", "inv1");

    expect(u.ohneSelbstauskunft).toBe(false);
    expect(u.aenderung.annualGrossIncome).toBe(90_000);
    // 70 % des Bruttos, die Schaetzung aus bruttoZuZvE.
    expect(u.aenderung.taxableIncomeCustomer).toBe(63_000);
    expect(u.aenderung.jointAssessment).toBe(true);
    expect(u.aenderung.taxClass).toBe("III");

    const brutto = u.posten.find((p) => p.feld === "Jahresbrutto Kunde");
    // Intl setzt ein geschuetztes Leerzeichen vor das Eurozeichen.
    expect(brutto?.wert.replace(/\u00A0/g, " ")).toBe("90.000 €");
    expect(brutto?.hinweis).toBe("Summe beider Personen");
    expect(u.hinweis.text).toBe("Aus der Selbstauskunft vom 12.08.2026");
  });

  it("bleibt bei einer Selbstauskunft ohne Jahresbrutto ohne diesen Posten", () => {
    const alt = saDatenAusFormular();
    delete (alt as Record<string, unknown>).bruttoJahr;
    delete (alt.person2Data as Record<string, unknown>).bruttoJahr;
    bestandSetzen(alt);

    const u = kundenUebernahmeFuer("k1", "inv1");

    expect(u.ohneSelbstauskunft).toBe(false);
    expect(u.aenderung.annualGrossIncome).toBeUndefined();
    expect(u.posten.some((p) => p.feld === "Jahresbrutto Kunde")).toBe(false);
    // Die Veranlagung haengt am Familienstand und kommt trotzdem mit.
    expect(u.aenderung.jointAssessment).toBe(true);
  });

  it("übernimmt nichts, wenn gar keine Selbstauskunft vorliegt", () => {
    bestandSetzen(null);
    const u = kundenUebernahmeFuer("k1", "inv1");
    expect(u.ohneSelbstauskunft).toBe(true);
    expect(u.aenderung).toEqual({});
  });
});
