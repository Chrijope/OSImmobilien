import { describe, expect, it } from "vitest";
import { hausgeldTeile, mitHausgeldMonat } from "../../supabase/functions/_shared/einheit-hausgeld";
import { festeZahlenEinheit } from "../../supabase/functions/_shared/lotse-feste-zahlen";
import { oeffentlicheWohnung } from "../../supabase/functions/_shared/expose-oeffentlich";
import { kundenMeta } from "../../supabase/functions/_shared/kunden-meta";
import { einheitMeta, rechenwertNachImport } from "../../supabase/functions/investagon-import/mapping";
import { zusammengefuehrteObjektDaten } from "./objektKarte";

/*
 * Hausgeld bei Investagon-Einheiten (05.10.2026). Anlass: Die
 * Objektauswahl-Karte meldete „Hausgeld fehlt“, obwohl Investagon die Teile
 * liefert. Beispiel einer echten Einheit, ohne Namen.
 *
 * Rechnung: 221,30 umlagefähig + 66,39 nicht umlagefähig + 26,556 Rücklage
 * = 314,246, auf Cent 314,25 € je Monat. Die SEV-Verwaltung (120) und die
 * Stellplatz-Werte zählen nicht dazu.
 */
const ROH = {
  operation_cost_tenant_apartment: 221.3,
  operation_cost_landlord_apartment: 66.39,
  operation_cost_reserve_apartment: 26.556,
  property_management_fee_sev: 120,
  operation_cost_tenant_parking: 12.1,
  operation_cost_landlord_parking: 5.55,
  operation_cost_reserve_parking: 0,
};
/** So steht die Einheit heute in `wohnungen.meta`: ohne Hausgeld gesamt. */
const META_HEUTE = {
  investagonRaw: ROH,
  hausgeldNichtUmlagefaehigEuro: 66.39,
  ruecklageZufuehrungMonat: 26.556,
  verwaltungSevMonat: 120,
};

describe("Hausgeld gesamt einer Einheit", () => {
  it("rechnet umlagefähig plus nicht umlagefähig plus Rücklage, ohne SEV und Stellplatz", () => {
    const t = hausgeldTeile(META_HEUTE);
    expect(221.3 + 66.39 + 26.556).toBeCloseTo(314.246, 6);
    expect(t.gesamt).toBe(314.25);
    expect(t).toMatchObject({ umlagefaehig: 221.3, nichtUmlagefaehig: 66.39, ruecklage: 26.556, sevVerwaltung: 120 });
  });

  it("liest allein aus den Rohdaten", () => {
    expect(hausgeldTeile({ investagonRaw: ROH }).gesamt).toBe(314.25);
  });

  it("ein gepflegtes Hausgeld geht vor", () => {
    expect(hausgeldTeile({ ...META_HEUTE, hausgeldMonat: 300 }).gesamt).toBe(300);
  });

  it("fehlt ein Teil, gibt es kein Hausgeld gesamt", () => {
    const { operation_cost_tenant_apartment: _weg, ...ohneUmlage } = ROH;
    expect(hausgeldTeile({ investagonRaw: ohneUmlage }).gesamt).toBeUndefined();
  });

  it("der Lotse nennt dieselbe Summe", () => {
    expect(festeZahlenEinheit(META_HEUTE).werte["Hausgeld gesamt je Monat in Euro"]).toBe(314.25);
  });

  it("die Objektauswahl-Karte zeigt es für eine Einheit aus dem Bestand", () => {
    const d = zusammengefuehrteObjektDaten({ investment: {}, wohnung: { investagonRaw: ROH }, objekt: null } as never);
    expect(d.hausgeld).toBe(314.25);
    expect(d.hausgeldNichtUmlage).toBe(66.39);
  });
});

describe("Hausgeld in den Antworten der Functions", () => {
  it("Exposé und Kundenansicht bekommen die Summe, aber keine Investagon-Teile", () => {
    const expose = oeffentlicheWohnung({ id: "w1", meta: META_HEUTE }).meta as Record<string, unknown>;
    expect(expose.hausgeldMonat).toBe(314.25);
    expect(expose.investagonRaw ?? {}).not.toHaveProperty("operation_cost_tenant_apartment");
    expect(kundenMeta(META_HEUTE, "wohnung").hausgeldMonat).toBe(314.25);
    expect(kundenMeta(META_HEUTE, "wohnung_global")).not.toHaveProperty("hausgeldMonat");
  });

  it("überschreibt ein vorhandenes Hausgeld nicht", () => {
    expect(mitHausgeldMonat({ hausgeldMonat: 280 }, META_HEUTE).hausgeldMonat).toBe(280);
  });
});

describe("Hausgeld im Investagon-Import", () => {
  it("schreibt den umlagefähigen Teil an die Einheit", () => {
    expect(einheitMeta(ROH)).toMatchObject({ hausgeldUmlagefaehigEuro: 221.3, hausgeldNichtUmlagefaehigEuro: 66.39 });
  });

  it("ein gespeicherter Rückfallwert gehört dem Import, ein Handwert nicht", () => {
    const neu = 320;
    const alteSumme = hausgeldTeile({ investagonRaw: ROH }).gesamt!;
    expect(rechenwertNachImport(neu, alteSumme, undefined, [0, alteSumme])).toMatchObject({ schreiben: true, wert: neu });
    expect(rechenwertNachImport(neu, 250, undefined, [0, alteSumme])).toMatchObject({ schreiben: false, geschuetzt: true });
  });
});
