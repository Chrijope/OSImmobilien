import { describe, expect, it } from "vitest";
import { BUNDESLAENDER } from "@/lib/grunderwerbsteuer";
import { GRUNDBUCH_PROZENT, NOTAR_PROZENT } from "@/lib/kaufnebenkosten";
import { berechneInvestment, standardEingabe } from "./rechenkern";
import {
  BUNDESLAND_AUSWAHL,
  bundeslandName,
  kaufnebenkostenposten,
  saetzeFuerBundesland,
  standardKaufnebenkostenauswahl,
} from "./kaufnebenkostenAuswahl";

/*
 * Geprüft wird nur die Auswahl der Kaufnebenkosten. Der Rechenkern kommt nur
 * einmal vor, um zu zeigen, dass die gesetzten Sätze dort ankommen.
 */

describe("Bundeslandauswahl", () => {
  it("enthält genau die sechzehn Bundesländer ohne den Eintrag für Unbekanntes", () => {
    expect(BUNDESLAND_AUSWAHL).toHaveLength(16);
    expect(BUNDESLAND_AUSWAHL.some((land) => land.value === "andere")).toBe(false);
  });

  it("startet auf dem Weg über das Bundesland, aber ohne Auswahl", () => {
    expect(standardKaufnebenkostenauswahl).toEqual({ weg: "bundesland", bundesland: "" });
    expect(saetzeFuerBundesland(standardKaufnebenkostenauswahl.bundesland)).toBeNull();
  });

  it("nimmt die Grunderwerbsteuer aus der zentralen Tabelle", () => {
    for (const land of BUNDESLAENDER) {
      const eintrag = BUNDESLAND_AUSWAHL.find((auswahl) => auswahl.label === land.name);
      expect(eintrag).toBeDefined();
      const saetze = saetzeFuerBundesland(eintrag?.value ?? "");
      expect(saetze?.transferTaxRate).toBe(land.grunderwerbsteuer);
      expect(saetze?.notaryRate).toBe(NOTAR_PROZENT);
      expect(saetze?.landRegisterRate).toBe(GRUNDBUCH_PROZENT);
    }
  });

  it("liefert für einen unbekannten Schlüssel keine Sätze", () => {
    expect(saetzeFuerBundesland("gibtesnicht")).toBeNull();
    expect(saetzeFuerBundesland("")).toBeNull();
    expect(bundeslandName("gibtesnicht")).toBe("");
  });

  it("nennt das gewählte Bundesland beim Namen", () => {
    expect(bundeslandName("nrw")).toBe("Nordrhein-Westfalen");
  });
});

describe("Posten als Prozentsatz und Betrag", () => {
  it("rechnet die Beträge auf den Gesamtkaufpreis", () => {
    const saetze = saetzeFuerBundesland("nrw");
    expect(saetze).not.toBeNull();
    const posten = kaufnebenkostenposten(saetze!, 300000);
    expect(posten.map((eintrag) => [eintrag.label, eintrag.prozent, eintrag.betrag])).toEqual([
      ["Grunderwerbsteuer", 6.5, 19500],
      ["Notar", 1, 3000],
      ["Grundbuch", 0.5, 1500],
    ]);
  });

  it("rechnet alle drei Posten auf dieselbe Basis, den Kaufpreis der Immobilie", () => {
    const posten = kaufnebenkostenposten({ transferTaxRate: 3.5, notaryRate: 1, landRegisterRate: 0.5 }, 265000);
    expect(posten.map((eintrag) => eintrag.betrag)).toEqual([9275, 2650, 1325]);
  });

  it("fängt fehlenden oder unsinnigen Kaufpreis mit null ab", () => {
    const saetze = { transferTaxRate: 5, notaryRate: 1, landRegisterRate: 0.5 };
    expect(kaufnebenkostenposten(saetze, Number.NaN).every((eintrag) => eintrag.betrag === 0)).toBe(true);
    expect(kaufnebenkostenposten(saetze, -1000).every((eintrag) => eintrag.betrag === 0)).toBe(true);
  });
});

describe("Zusammenspiel mit dem Rechenkern", () => {
  it("ergibt mit den gesetzten Sätzen dieselben Kaufnebenkosten wie die Posten", () => {
    const saetze = saetzeFuerBundesland("bayern");
    expect(saetze).not.toBeNull();
    const eingabe = {
      ...standardEingabe,
      ...saetze!,
      // Makler ist in der Oberfläche entfallen und bleibt deshalb bei null.
      brokerRate: 0,
      otherPurchaseCostRate: 0,
      purchasePrice: 400000,
    };
    const summeDerPosten = kaufnebenkostenposten(saetze!, eingabe.purchasePrice).reduce(
      (summe, eintrag) => summe + eintrag.betrag,
      0,
    );
    expect(berechneInvestment(eingabe).purchaseCosts).toBeCloseTo(summeDerPosten, 6);
  });
});
