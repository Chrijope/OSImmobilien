import { describe, expect, it } from "vitest";
import { handAngabenLesen, handAlsRohdaten, mitHandAngaben } from "../../supabase/functions/_shared/hand-angaben";
import { festeZahlenEinheit } from "../../supabase/functions/_shared/lotse-feste-zahlen";
import { beschreibungsTexte, einheitQuelle, heizungText, merkmalWert, objektDetails, rohdaten } from "./investagonFelder";

describe("Handangaben statt Investagon (30.10.2026)", () => {
  it("liest nur Brauchbares, Rundgang nur mit https", () => {
    const a = handAngabenLesen({ angaben: { merkmale: ["Aufzug: Ja", " ", 3], rundgangUrl: "javascript:alert(1)", denkmalAnteil: "0", mabvRaten: [{ bezeichnung: "Erdarbeiten", prozent: 30 }, { bezeichnung: "", prozent: 5 }] } });
    expect(a).toEqual({ merkmale: ["Aufzug: Ja"], mabvRaten: [{ bezeichnung: "Erdarbeiten", prozent: 30 }] });
  });

  it("übersetzt in Investagon-Feldnamen, samt vorhandener Handfelder", () => {
    const roh = handAlsRohdaten({
      angaben: { heizung: "gas", freitexte: ["Eins", "Zwei"], degressiveAfa: false },
      balkonArt: "loggia",
      energieausweis: { kennwert: 120 },
      kaufnebenkostenTeile: { grunderwerbsteuer: 6.5 },
      neubau: { fertigstellung: "2027-06-30", sonderAfa7b: true },
    });
    expect(roh).toMatchObject({
      heating_type: "gas",
      extras: [{ value: "Eins", weight: 0 }, { value: "Zwei", weight: 1 }],
      degressive_depreciation_building_onoff: 0,
      object_balcony: "Loggia",
      power_consumption: 120,
      transaction_tax_rate: 6.5,
      end_building_phase_date: "2027-06-30",
      depreciation_special_7b_onoff: 1,
    });
  });

  it("Hand gewinnt gegen Investagon, ohne beides bleibt es leer", () => {
    expect(mitHandAngaben({ heating_type: "oil", tags: ["Alt"] }, { angaben: { heizung: "gas" } })).toEqual({ heating_type: "gas", tags: ["Alt"] });
    expect(mitHandAngaben(undefined, {})).toBeUndefined();
  });

  it("alle Leser sehen die Handangaben, auch ohne Investagon", () => {
    const objekt = { meta: { angaben: { heizung: "district_heating", merkmale: ["Aufzug: Ja"], stellplatzArt: "Garage" } } };
    expect(rohdaten(objekt)).toBeDefined();
    expect(heizungText(objekt)).toBe("Fernwärme");
    expect(merkmalWert(objekt, "Aufzug")).toBe("Ja");
    expect(objektDetails(objekt)).toContainEqual({ label: "Stellplatz", wert: "Garage" });
    const einheit = einheitQuelle({ balkonArt: "balkon", angaben: { freitexte: ["Mietsubvention bis 13 €/m²"] } });
    expect(objektDetails(einheit)).toContainEqual({ label: "Balkon", wert: "Balkon" });
    expect(beschreibungsTexte(einheit)).toEqual(["Mietsubvention bis 13 €/m²"]);
  });

  it("Lotse nimmt Denkmal-AfA vom Objekt und Energiekennwert", () => {
    const objektMeta = { angaben: { denkmalAnteil: 70, denkmalAfaJahre1bis8: 9, denkmalAfaJahre9bis12: 7, denkmalAfaBeginn: "2027-01-01" }, energieausweis: { kennwert: 95 } };
    const { werte } = festeZahlenEinheit({}, objektMeta);
    expect(werte["Denkmal-Anteil in Prozent"]).toBe(70);
    expect(werte["Denkmal-AfA Jahre 1 bis 8 in Prozent"]).toBe(9);
    expect(werte["Energiekennwert in kWh je m² und Jahr"]).toBe(95);
  });
});
