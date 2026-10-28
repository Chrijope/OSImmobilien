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
 * Seit dem 28.10.2026 (Christian): Hausgeld = 221,30 umlagefähig + 66,39
 * nicht umlagefähig = 287,69 € je Monat, OHNE Rücklage. Die Rücklage (26,556)
 * steht getrennt; Vorauszahlung = 287,69 + 26,556 = 314,246, auf Cent 314,25.
 * Die SEV-Verwaltung (120) und die Stellplatz-Werte zählen nirgends dazu.
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

describe("Hausgeld einer Einheit", () => {
  it("rechnet umlagefähig plus nicht umlagefähig, die Rücklage NICHT, ohne SEV und Stellplatz", () => {
    const t = hausgeldTeile(META_HEUTE);
    expect(t.hausgeld).toBe(287.69);
    expect(t.vorauszahlung).toBe(314.25);
    expect(t).toMatchObject({ umlagefaehig: 221.3, nichtUmlagefaehig: 66.39, ruecklage: 26.556, sevVerwaltung: 120 });
  });

  it("liest allein aus den Rohdaten", () => {
    expect(hausgeldTeile({ investagonRaw: ROH })).toMatchObject({ hausgeld: 287.69, vorauszahlung: 314.25 });
  });

  it("ein gepflegtes Hausgeld geht vor, die Rücklage kommt nur in die Vorauszahlung", () => {
    expect(hausgeldTeile({ ...META_HEUTE, hausgeldMonat: 300 })).toMatchObject({ hausgeld: 300, vorauszahlung: 326.56 });
  });

  it("eine alte Summe samt Rücklage (bis 28.10.2026 gespeichert) wird als solche erkannt", () => {
    expect(hausgeldTeile({ ...META_HEUTE, hausgeldMonat: 314.25 })).toMatchObject({ hausgeld: 287.69, vorauszahlung: 314.25 });
  });

  it("fehlt ein Hausgeld-Teil, gibt es kein Hausgeld; ohne Rücklage keine Vorauszahlung", () => {
    const { operation_cost_tenant_apartment: _weg, ...ohneUmlage } = ROH;
    expect(hausgeldTeile({ investagonRaw: ohneUmlage }).hausgeld).toBeUndefined();
    const { operation_cost_reserve_apartment: _r, ...ohneRuecklage } = ROH;
    expect(hausgeldTeile({ investagonRaw: ohneRuecklage })).toMatchObject({ hausgeld: 287.69, vorauszahlung: undefined });
  });

  it("der Lotse nennt Hausgeld und Vorauszahlung getrennt", () => {
    const werte = festeZahlenEinheit(META_HEUTE).werte;
    expect(werte["Hausgeld (umlagefähig + nicht umlagefähig, ohne Rücklage) je Monat in Euro"]).toBe(287.69);
    expect(werte["Vorauszahlung gesamt (Hausgeld + Rücklage) je Monat in Euro"]).toBe(314.25);
  });

  it("die Objektauswahl-Karte zeigt es für eine Einheit aus dem Bestand", () => {
    const d = zusammengefuehrteObjektDaten({ investment: {}, wohnung: { investagonRaw: ROH }, objekt: null } as never);
    expect(d.hausgeld).toBe(287.69);
    expect(d.hausgeldNichtUmlage).toBe(66.39);
  });
});

describe("Hausgeld in den Antworten der Functions", () => {
  it("Exposé und Kundenansicht bekommen das Hausgeld ohne Rücklage, aber keine Investagon-Teile", () => {
    const expose = oeffentlicheWohnung({ id: "w1", meta: META_HEUTE }).meta as Record<string, unknown>;
    expect(expose.hausgeldMonat).toBe(287.69);
    expect(expose.investagonRaw ?? {}).not.toHaveProperty("operation_cost_tenant_apartment");
    expect(kundenMeta(META_HEUTE, "wohnung").hausgeldMonat).toBe(287.69);
    expect(kundenMeta(META_HEUTE, "wohnung_global")).not.toHaveProperty("hausgeldMonat");
  });

  it("ein Handwert kommt durch, eine alte Summe samt Rücklage nicht", () => {
    expect(mitHausgeldMonat({ hausgeldMonat: 280 }, { ...META_HEUTE, hausgeldMonat: 280 }).hausgeldMonat).toBe(280);
    expect(mitHausgeldMonat({ hausgeldMonat: 314.25 }, { ...META_HEUTE, hausgeldMonat: 314.25 }).hausgeldMonat).toBe(287.69);
  });
});

describe("Hausgeld im Investagon-Import", () => {
  it("schreibt den umlagefähigen Teil an die Einheit", () => {
    expect(einheitMeta(ROH)).toMatchObject({ hausgeldUmlagefaehigEuro: 221.3, hausgeldNichtUmlagefaehigEuro: 66.39 });
  });

  it("ein gespeicherter Rückfallwert gehört dem Import, ein Handwert nicht", () => {
    const neu = 320;
    const alteSumme = hausgeldTeile({ investagonRaw: ROH }).vorauszahlung!;
    expect(rechenwertNachImport(neu, alteSumme, undefined, [0, alteSumme])).toMatchObject({ schreiben: true, wert: neu });
    expect(rechenwertNachImport(neu, 250, undefined, [0, alteSumme])).toMatchObject({ schreiben: false, geschuetzt: true });
  });
});
