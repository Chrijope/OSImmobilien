import { describe, expect, it } from "vitest";
import { kaufnebenkostenSaetze } from "./kaufnebenkosten";
import { fehlendeFinanzierungsunterlagen } from "./finanzierungsObjektpaket";
import { interneHighlights } from "./interneHighlights";
import { exposeObjektdatenAus } from "./exposeInhalt";
import { berechneExpose } from "./exposeRechner";
import { standardAnnahmen } from "./exposeAnnahmen";
import type { ObjektData, ObjektWohnung } from "./objekteStore";

/** Neue Felder in „Objekt anlegen“ (Christian, 28.10.2026). */

describe("Kaufnebenkosten in drei Sätzen", () => {
  it("Fallback: Landessatz aus der PLZ plus 1,5 plus 0,5", () => {
    expect(kaufnebenkostenSaetze({ plz: "86150" })).toMatchObject({ grunderwerbsteuer: 3.5, notar: 1.5, grundbuch: 0.5, summe: 5.5, quelle: "bundesland" });
    expect(kaufnebenkostenSaetze({ plz: "" })).toBeUndefined();
  });

  it("liest die alte Gesamtzahl weiter und zerlegt sie", () => {
    expect(kaufnebenkostenSaetze({ gesamtPct: 7, plz: "86150" })).toMatchObject({ grunderwerbsteuer: 5, notar: 1.5, grundbuch: 0.5, summe: 7, quelle: "gesamt" });
    expect(kaufnebenkostenSaetze({ gesamtPct: 1.5 })).toMatchObject({ grunderwerbsteuer: 1.5, notar: 0, grundbuch: 0, summe: 1.5 });
  });

  it("gepflegte Sätze gehen vor, Lücken fallen zurück", () => {
    expect(kaufnebenkostenSaetze({ teile: { notar: 2 }, gesamtPct: 9, plz: "10115" })).toMatchObject({ grunderwerbsteuer: 6, notar: 2, grundbuch: 0.5, summe: 8.5, quelle: "teile" });
  });
});

const basisObjekt = { id: "o1", plz: "86150", ort: "Augsburg", dokumente: [], meta: {}, wohnungen: [] } as unknown as ObjektData;
const einheit = { id: "w1", weNr: "1", vermietet: true, vermietungsStatus: "vermietet", status: "frei", dokumente: [], bilder: [] } as unknown as ObjektWohnung;

describe("Feste Dokumentkategorien in der Pflichtprüfung", () => {
  it("eine Datei im Fach „WEG-Protokolle“ zählt, auch ohne drei Jahre im Namen", () => {
    const doc = (name: string) => ({ id: name, name, url: "https://x/y.pdf", typ: "standard", kategorie: "objektunterlagen", sichtbar: true });
    const o = { ...basisObjekt, dokumente: [doc("WEG-Protokolle"), doc("Wirtschaftsplan"), doc("Mietvertrag")] } as unknown as ObjektData;
    const r = fehlendeFinanzierungsunterlagen(o, einheit);
    expect(r.vorhanden).toEqual(expect.arrayContaining(["WEG-Protokolle der letzten 3 Jahre", "Wirtschaftsplan", "Mietvertrag"]));
  });
});

describe("Investagon-Extras als interne Highlights der Einheit", () => {
  it("stehen nach den Handpunkten, ohne Doppel", () => {
    const w = { ...einheit, interneHighlightsHand: ["Neue Küche"], investagonRaw: { extras: [{ value: "Neue Küche", weight: 1 }, { value: "Fußbodenheizung", weight: 2 }] } } as unknown as ObjektWohnung;
    const texte = interneHighlights({ ...basisObjekt, wohnungen: [w] } as ObjektData, w).punkte.map((p) => [p.text, p.herkunft]);
    expect(texte.slice(0, 2)).toEqual([["Neue Küche", "hand"], ["Fußbodenheizung", "daten"]]);
  });
});

describe("Exposé: Hausgeld ohne Rücklage", () => {
  it("der umlegbare Teil ist Hausgeld minus nicht umlegbar, die Rücklage wird nicht nochmals abgezogen", () => {
    const w = { ...einheit, vkGesamt: 200000, mieteGesamt: 700, groesse: 50, hausgeldUmlagefaehigEuro: 150, hausgeldNichtUmlagefaehigEuro: 50, ruecklageZufuehrungMonat: 30 } as unknown as ObjektWohnung;
    const daten = exposeObjektdatenAus({ ...basisObjekt, wohnungen: [w] } as ObjektData, w, new Date(2026, 9, 28));
    expect(daten.hausgeldGesamtMonat).toBe(200);
    expect(berechneExpose(daten, standardAnnahmen(2026)).kennzahlen.hausgeldUmlegbarMonat).toBe(150);
  });
});
