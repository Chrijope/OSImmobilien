import { describe, expect, it } from "vitest";
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
  it("enthält seit dem 08.11.2026 nur Berlin und Brandenburg / Potsdam", () => {
    expect(BUNDESLAND_AUSWAHL.map((land) => [land.value, land.label])).toEqual([
      ["berlin", "Berlin"],
      ["brandenburg", "Brandenburg / Potsdam"],
    ]);
  });

  it("startet auf dem Weg über das Bundesland, aber ohne Auswahl", () => {
    expect(standardKaufnebenkostenauswahl).toEqual({ weg: "bundesland", bundesland: "" });
    expect(saetzeFuerBundesland(standardKaufnebenkostenauswahl.bundesland)).toBeNull();
  });

  it("belegt beide mit den OS-Sätzen vor: 6,5 + 1,5 + 0,5 = 8,5 %, auch Berlin (gesetzlich 6,0 % GrESt)", () => {
    for (const land of BUNDESLAND_AUSWAHL) {
      expect(saetzeFuerBundesland(land.value)).toEqual({ transferTaxRate: 6.5, notaryRate: NOTAR_PROZENT, landRegisterRate: GRUNDBUCH_PROZENT });
    }
    expect(NOTAR_PROZENT + GRUNDBUCH_PROZENT + 6.5).toBe(8.5);
  });

  it("ein gespeichertes anderes Bundesland setzt keine Sätze mehr", () => {
    expect(saetzeFuerBundesland("sachsen")).toBeNull();
  });

  it("liefert für einen unbekannten Schlüssel keine Sätze", () => {
    expect(saetzeFuerBundesland("gibtesnicht")).toBeNull();
    expect(saetzeFuerBundesland("")).toBeNull();
    expect(bundeslandName("gibtesnicht")).toBe("");
  });

  it("nennt das gewählte Bundesland beim Namen", () => {
    expect(bundeslandName("brandenburg")).toBe("Brandenburg / Potsdam");
  });
});

describe("Posten als Prozentsatz und Betrag", () => {
  it("rechnet die Beträge auf den Gesamtkaufpreis", () => {
    const saetze = saetzeFuerBundesland("berlin");
    expect(saetze).not.toBeNull();
    const posten = kaufnebenkostenposten(saetze!, 300000);
    expect(posten.map((eintrag) => [eintrag.label, eintrag.prozent, eintrag.betrag])).toEqual([
      ["Grunderwerbsteuer", 6.5, 19500],
      ["Notar", 1.5, 4500],
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
    const saetze = saetzeFuerBundesland("brandenburg");
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
