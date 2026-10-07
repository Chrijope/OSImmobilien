import { describe, it, expect } from "vitest";
import {
  gueltigeLage, KOORDINATEN_META_SCHLUESSEL, koordinatenAus,
} from "../../supabase/functions/_shared/objekt-koordinaten";
import {
  importMetaZusammenfuehren, koordinatenNachImport, projektKoordinaten,
} from "../../supabase/functions/investagon-import/mapping";
import { oeffentlicheKoordinaten, oeffentlichesMeta } from "../../supabase/functions/_shared/expose-oeffentlich";
import { kundenMeta } from "../../supabase/functions/get-kundenansicht/antwort";

/**
 * Die gespeicherte Lage eines Objekts, `meta.koordinaten` (23.09.2026).
 *
 * Christian will keine Adresssuche im Browser des Besuchers. Die Karte im
 * Exposé nimmt ihren Punkt deshalb nur aus gespeicherten Daten: zuerst aus der
 * gemessenen Analyse, sonst aus diesem Schlüssel. Ihn schreibt der
 * Investagon-Import aus `lat`/`lng` der Einheiten, und Kundenlink wie
 * Kundenansicht lassen davon nur Zahlen und Quelle hinaus.
 */

const AM = "2026-09-23T20:00:00.000Z";

describe("Gültige Lage", () => {
  it("nimmt Zahlen und Zahlen als Text im gültigen Bereich", () => {
    expect(gueltigeLage(54.3087, 13.0741)).toEqual({ lat: 54.3087, lng: 13.0741 });
    expect(gueltigeLage("49.4521", " 11.0767 ")).toEqual({ lat: 49.4521, lng: 11.0767 });
  });

  it("verwirft leere, unsinnige und genullte Werte", () => {
    for (const [lat, lng] of [[null, null], ["", ""], [0, 0], [91, 10], [10, 181], [NaN, 10], ["abc", 10], [{}, []]] as const) {
      expect(gueltigeLage(lat, lng), `${String(lat)}/${String(lng)}`).toBeUndefined();
    }
  });

  it("liest den gespeicherten Wert nur mit bekannter Quelle", () => {
    expect(koordinatenAus({ lat: 54.3, lng: 13.07, quelle: "investagon", am: AM })).toEqual({ lat: 54.3, lng: 13.07, quelle: "investagon", am: AM });
    expect(koordinatenAus({ lat: 54.3, lng: 13.07, quelle: "photon" })).toEqual({ lat: 54.3, lng: 13.07, quelle: "photon" });
    // Die Messung schreibt auch Treffer von Nominatim (`koordinatenInMeta` in `standort-messung.ts`).
    expect(koordinatenAus({ lat: 54.3, lng: 13.07, quelle: "nominatim", genauigkeit: "strasse" })).toEqual({ lat: 54.3, lng: 13.07, quelle: "nominatim" });
    expect(koordinatenAus({ lat: 54.3, lng: 13.07, quelle: "geraten" })).toBeUndefined();
    expect(koordinatenAus({ lat: 54.3, lng: 13.07 })).toBeUndefined();
    expect(koordinatenAus([54.3, 13.07])).toBeUndefined();
    expect(KOORDINATEN_META_SCHLUESSEL).toBe("koordinaten");
  });
});

describe("Investagon-Import: Lage aus den Einheiten", () => {
  it("nimmt die erste Einheit mit gültiger Lage und schreibt die Quelle Investagon", () => {
    const einheiten = [{ lat: null, lng: null }, undefined, { lat: 54.3087, lng: 13.0741 }, { lat: 54.4, lng: 13.1 }];
    expect(projektKoordinaten(einheiten, AM)).toEqual({ lat: 54.3087, lng: 13.0741, quelle: "investagon", am: AM });
  });

  it("liefert ohne Koordinaten nichts, etwa bei der Liste ohne Rohdaten", () => {
    expect(projektKoordinaten([{ lat: 0, lng: 0 }, {}, null], AM)).toBeUndefined();
    expect(projektKoordinaten([], AM)).toBeUndefined();
  });

  it("schreibt beim Abgleich eine gelieferte Lage, auch über eine gemessene", () => {
    const bisher = { investagonSlug: "p1", koordinaten: { lat: 54.1, lng: 13.1, quelle: "photon", am: "2026-09-01T00:00:00Z" } };
    const neu = importMetaZusammenfuehren(bisher, { investagonSlug: "p1", koordinaten: { lat: 54.3087, lng: 13.0741, quelle: "investagon", am: AM } });
    expect(neu.koordinaten).toEqual({ lat: 54.3087, lng: 13.0741, quelle: "investagon", am: AM });
  });

  it("lässt eine vorhandene Lage stehen, wenn Investagon keine liefert, und löscht nichts", () => {
    const vorhanden = { lat: 54.3087, lng: 13.0741, quelle: "photon", am: "2026-09-01T00:00:00Z" };
    expect(importMetaZusammenfuehren({ koordinaten: vorhanden, kurzbeschreibung: "Von Hand" }, { investagonSlug: "p1" })).toEqual({
      koordinaten: vorhanden, kurzbeschreibung: "Von Hand", investagonSlug: "p1",
    });
    // Auch ein kaputter gelieferter Wert ersetzt nichts.
    expect(koordinatenNachImport({ lat: null, lng: null, quelle: "investagon" }, vorhanden)).toBe(vorhanden);
    // Ohne beides entsteht kein Schlüssel.
    expect(importMetaZusammenfuehren({}, { investagonSlug: "p1" })).not.toHaveProperty("koordinaten");
  });

  it("behält bei derselben Lage aus derselben Quelle den bisherigen Zeitpunkt", () => {
    const bisher = { lat: 54.3087, lng: 13.0741, quelle: "investagon", am: "2026-09-01T00:00:00Z" };
    expect(koordinatenNachImport({ lat: 54.3087, lng: 13.0741, quelle: "investagon", am: AM }, bisher)).toBe(bisher);
  });
});

describe("Positivlisten: nur Zahlen und Quelle", () => {
  const vergiftet = { lat: 54.3087, lng: 13.0741, quelle: "investagon", am: AM, notiz: "GIFT", kunde: { name: "GIFT" } };

  it("lässt die Lage im Kundenlink durch, ohne Zeitpunkt und ohne Beiwerk", () => {
    expect(oeffentlicheKoordinaten(vergiftet)).toEqual({ lat: 54.3087, lng: 13.0741, quelle: "investagon" });
    const meta = oeffentlichesMeta({ koordinaten: vergiftet });
    expect(meta.koordinaten).toEqual({ lat: 54.3087, lng: 13.0741, quelle: "investagon" });
    expect(JSON.stringify(meta)).not.toContain("GIFT");
    expect(oeffentlichesMeta({ koordinaten: { lat: "x", lng: 1, quelle: "investagon" } })).not.toHaveProperty("koordinaten");
  });

  it("lässt die Lage in der Kundenansicht genauso durch", () => {
    const meta = kundenMeta({ koordinaten: vergiftet }, "objekt");
    expect(meta.koordinaten).toEqual({ lat: 54.3087, lng: 13.0741, quelle: "investagon" });
    expect(JSON.stringify(meta)).not.toContain("GIFT");
  });

  it("gibt den Mittelpunkt der gemessenen Analyse in beiden weiter", () => {
    const standortanalyse = { schema: 2, objekt_koordinaten: { lat: 54.3087, lng: 13.0741 }, mikrolage: {} };
    expect((oeffentlichesMeta({ standortanalyse }).standortanalyse as { objekt_koordinaten: unknown }).objekt_koordinaten).toEqual({ lat: 54.3087, lng: 13.0741 });
    expect((kundenMeta({ standortanalyse }, "objekt").standortanalyse as { objekt_koordinaten: unknown }).objekt_koordinaten).toEqual({ lat: 54.3087, lng: 13.0741 });
  });
});

describe("Gespeicherte Lage im Browser, dieselbe Reihenfolge wie im Exposé", () => {
  it("nimmt zuerst die gemessene Analyse, dann meta.koordinaten, dann die alten Felder", async () => {
    const { gespeicherteObjektKoordinate } = await import("./einheitEmpfehlung");
    const analyse = { schema: 2, objekt_koordinaten: { lat: 54.1, lng: 13.1 }, mikrolage: {} };
    const koordinaten = { lat: 54.2, lng: 13.2, quelle: "investagon" };
    expect(gespeicherteObjektKoordinate({ meta: { standortanalyse: analyse, koordinaten, lat: 1, lng: 1 } })).toEqual({ lat: 54.1, lng: 13.1 });
    expect(gespeicherteObjektKoordinate({ meta: { koordinaten, lat: 1, lng: 1 } })).toEqual({ lat: 54.2, lng: 13.2 });
    expect(gespeicherteObjektKoordinate({ meta: { lat: 49, lng: 11 } })).toEqual({ lat: 49, lng: 11 });
    expect(gespeicherteObjektKoordinate({ meta: { koordinaten: { lat: 54.2, lng: 13.2, quelle: "geraten" } } })).toBeNull();
  });
});
