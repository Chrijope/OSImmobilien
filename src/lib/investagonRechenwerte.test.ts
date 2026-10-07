import { describe, expect, it } from "vitest";
import {
  ABGLEICH_FASSUNG,
  einheitMeta,
  objektRechenspaltenNachImport,
  objektRechenwerte,
  rechenwerteAus,
  rechenwertNachImport,
} from "../../supabase/functions/investagon-import/mapping";

/*
 * Rechenwerte aus Investagon, seit dem 25.09.2026.
 *
 * Anlass war der Abgleich Sigmundstraße 2, Einheit 6b: Im CRM standen AfA 2 %
 * statt 3,5 %, Grundanteil 20 % statt 18 %, Erhaltungsaufwand 0 statt 35.000
 * und die Rücklagenzuführung fehlte. Die Feldnamen stammen aus der
 * Investagon-Webansicht und der API-Beschreibung (Property). Die Webansicht
 * zeigt Sätze als Anteil, die API liefert sie in Prozent; beides muss gehen.
 */

/** Die Einheit 6b, so wie die Webansicht sie zeigt: Sätze als Anteil. */
const SIGMUND_WEBANSICHT: Record<string, unknown> = {
  share_land: 0.18,
  share_building: 0.82,
  depreciation_rate_building_manual: 0.035,
  depreciation_rate_building_manual_onoff: 1,
  depreciation_rate_building_default: 0.02,
  depreciation_rate_building: "0.035",
  depreciation_rate_furniture: 10,
  purchase_price_furniture: null,
  initial_investment_extra_1y: 35000,
  initial_investment_extra_1y_manual: 35000,
  operation_cost_landlord_apartment: 45,
  operation_cost_reserve_apartment: 90,
  operation_cost_total: 135,
  property_management_fee_sev: 180,
  register_fee_rate: 0.002,
  initial_capital_costs: 646.02,
};

/** Dieselbe Einheit, wie die API sie liefert: nur Felder aus der API-Beschreibung, Sätze in Prozent. */
const SIGMUND_API: Record<string, unknown> = {
  share_land: 18,
  depreciation_rate_building_manual: 3.5,
  depreciation_rate_building_manual_onoff: 1,
  depreciation_rate_furniture: 10,
  purchase_price_furniture: null,
  initial_investment_extra_1y_manual: 35000,
  operation_cost_landlord_apartment: 45,
  operation_cost_reserve_apartment: 90,
  property_management_fee_sev: 180,
};

describe("Rechenwerte aus Investagon lesen", () => {
  it("liest die Webansicht und rechnet Anteile in Prozent um", () => {
    expect(rechenwerteAus(SIGMUND_WEBANSICHT)).toEqual({
      afaSatz: 3.5,
      grundstueckAnteil: 18,
      erhaltungsaufwand: 35000,
      moebelNutzungsdauerJahre: 10,
      finanzierungsnebenkostenSatz: 0.2,
    });
  });

  it("liest die API-Antwort mit Sätzen in Prozent", () => {
    expect(rechenwerteAus(SIGMUND_API)).toEqual({
      afaSatz: 3.5,
      grundstueckAnteil: 18,
      erhaltungsaufwand: 35000,
      moebelNutzungsdauerJahre: 10,
    });
  });

  it('liest "0.035" als 3,5 Prozent, nicht als 35', () => {
    // zahl() aus api.ts hielte den Punkt für einen Tausenderpunkt.
    expect(rechenwerteAus({ depreciation_rate_building: "0.035" }).afaSatz).toBe(3.5);
  });

  it("nimmt den manuellen AfA-Satz nur, wenn der Schalter ihn anwendet", () => {
    expect(rechenwerteAus({ depreciation_rate_building_manual: 3.5, depreciation_rate_building_manual_onoff: 2 }).afaSatz).toBe(3.5);
    expect(rechenwerteAus({ depreciation_rate_building_manual: 3.5, depreciation_rate_building_manual_onoff: 0 }).afaSatz)
      .toBeUndefined();
    expect(rechenwerteAus({
      depreciation_rate_building_manual: 3.5,
      depreciation_rate_building_manual_onoff: 0,
      depreciation_rate_building_default: 0.02,
    }).afaSatz).toBe(2);
  });

  it("lässt Unplausibles weg statt es zu schreiben", () => {
    expect(rechenwerteAus({
      share_land: 100,
      depreciation_rate_building: 25,
      initial_investment_extra_1y_manual: 0,
      depreciation_rate_furniture: 0,
      register_fee_rate: 5,
    })).toEqual({});
    expect(rechenwerteAus({ share_land: null, depreciation_rate_building: "n/a" })).toEqual({});
  });

  it("schreibt Rücklagenzuführung, Möbel-Nutzungsdauer und Finanzierungssatz an die Einheit", () => {
    expect(einheitMeta(SIGMUND_WEBANSICHT)).toMatchObject({
      hausgeldNichtUmlagefaehigEuro: 45,
      verwaltungSevMonat: 180,
      ruecklageZufuehrungMonat: 90,
      moebelNutzungsdauerJahre: 10,
      finanzierungsnebenkostenSatz: 0.2,
    });
    // Nie als Rücklagenbestand.
    expect(einheitMeta(SIGMUND_WEBANSICHT)).not.toHaveProperty("ruecklageWohnung");
  });
});

describe("Handgepflegte Werte bleiben stehen", () => {
  it("schreibt in ein leeres Feld oder über den Datenbankstandard", () => {
    expect(rechenwertNachImport(3.5, null, undefined, [2])).toEqual({ schreiben: true, wert: 3.5, geschuetzt: false });
    expect(rechenwertNachImport(3.5, 2, undefined, [2])).toEqual({ schreiben: true, wert: 3.5, geschuetzt: false });
  });

  it("lässt einen Handwert ohne Vermerk stehen", () => {
    expect(rechenwertNachImport(3.5, 2.5, undefined, [2])).toEqual({ schreiben: false, geschuetzt: true });
  });

  it("überschreibt den eigenen letzten Wert, aber keinen danach geänderten", () => {
    expect(rechenwertNachImport(3, 3.5, 3.5, [2]).schreiben).toBe(true);
    // Nach dem Import hat jemand 2 eingetragen: Das ist jetzt Handarbeit, auch wenn es der Standard ist.
    expect(rechenwertNachImport(3.5, 2, 3.5, [2])).toEqual({ schreiben: false, geschuetzt: true });
  });

  it("schreibt nichts, wenn Investagon nichts liefert", () => {
    expect(rechenwertNachImport(undefined, 2, undefined, [2])).toEqual({ schreiben: false, geschuetzt: false });
  });

  it("nimmt für das Objekt nur Werte, in denen sich alle Einheiten einig sind", () => {
    expect(objektRechenwerte([SIGMUND_API])).toEqual({ afaSatz: 3.5, grundstueckAnteil: 18, erhaltungsaufwand: 35000 });
    const zweite = { ...SIGMUND_API, share_land: 22 };
    // Uneinig beim Grundanteil, einig bei der AfA; Erhaltungsaufwand nur bei einer Einzelwohnung.
    expect(objektRechenwerte([SIGMUND_API, zweite])).toEqual({ afaSatz: 3.5 });
  });

  it("schreibt am Objekt Sigmundstraße AfA, Grundanteil und Erhaltungsaufwand und vermerkt sie", () => {
    const ergebnis = objektRechenspaltenNachImport(
      objektRechenwerte([SIGMUND_API]),
      { afa_satz: 2, grundstueck_anteil: 20, erhaltungsaufwand: 0 },
      undefined,
    );
    expect(ergebnis.spalten).toEqual({ afa_satz: 3.5, grundstueck_anteil: 18, erhaltungsaufwand: 35000 });
    expect(ergebnis.vermerk).toEqual({ afaSatz: 3.5, grundstueckAnteil: 18, erhaltungsaufwand: 35000 });
    expect(ergebnis.geschuetzt).toEqual([]);
  });

  it("nennt eine von Hand gepflegte Spalte und lässt sie stehen", () => {
    const ergebnis = objektRechenspaltenNachImport(
      objektRechenwerte([SIGMUND_API]),
      { afa_satz: 2.86, grundstueck_anteil: 20, erhaltungsaufwand: 0 },
      undefined,
    );
    expect(ergebnis.spalten).not.toHaveProperty("afa_satz");
    expect(ergebnis.geschuetzt).toEqual(["afa_satz"]);
  });
});

describe("Nachlauf für den Bestand", () => {
  it("hat eine neue Fassung, damit der Viertelstundenlauf jedes Objekt einmal neu abgleicht", () => {
    expect(ABGLEICH_FASSUNG).toBeGreaterThanOrEqual(2);
  });
});
