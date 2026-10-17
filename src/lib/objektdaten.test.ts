import { describe, expect, it } from "vitest";
import {
  aktuellerMieter, mieterZeilen, darfObjektdaten, einheitenSumme, einheitVollstaendigkeit, einheitZeile, fachBelegt, istObjektdatenRoute, objekteFuerRolle,
} from "./objektdaten";
import type { ObjektData, ObjektWohnung } from "./objekteStore";
import type { Mieter } from "./mieterStore";

const we = (teil: Partial<ObjektWohnung>): ObjektWohnung => ({
  id: "w", weNr: "WE 1", etage: "EG", lage: "links", groesse: 65, zimmer: 2, mieteGesamt: 325, vkGesamt: 153500,
  qmPreis: 0, rendite: 0, vermietet: true, status: "frei", ...teil,
});

describe("Objektdaten", () => {
  it("zeigt die Gruppe nur Admin, Inhaber, Backoffice und Objektpartner", () => {
    for (const r of ["admin", "inhaber", "backoffice", "objektpartner"]) expect(darfObjektdaten(r)).toBe(true);
    for (const r of ["vertriebspartner", "vertriebsleiter", "individuell", "testaccount", "kunde", undefined]) expect(darfObjektdaten(r)).toBe(false);
    expect(istObjektdatenRoute("/objektdaten/einheiten?objekt=1")).toBe(true);
    expect(istObjektdatenRoute("/objekte")).toBe(false);
  });

  it("rechnet Miete je m², Kaufpreis je m² und Rendite wie die Vertriebsliste Brück (WE 1)", () => {
    const z = einheitZeile(we({}));
    expect(z.mieteQm).toBeCloseTo(5, 6);
    expect(z.kaufpreisQm).toBeCloseTo(2361.5385, 3);
    expect(z.rendite).toBeCloseTo(0.0254, 4);
    expect(z.status).toBe("vermietet");
  });

  it("lässt leere Werte leer statt null Prozent zu rechnen", () => {
    const z = einheitZeile(we({ mieteGesamt: 0, vermietet: false }));
    expect(z.mieteMonat).toBeNull();
    expect(z.rendite).toBeNull();
    expect(z.status).toBe("Leerstand");
  });

  it("rechnet die Gesamtrendite nur über Einheiten mit Miete und Preis", () => {
    const s = einheitenSumme([einheitZeile(we({})), einheitZeile(we({ id: "b", mieteGesamt: 0, vermietet: false, vkGesamt: 65500 }))]);
    expect(s.kaufpreis).toBe(219000);
    expect(s.rendite).toBeCloseTo(0.0254, 4);
    expect(s.vermietet).toBe(1);
  });

  it("zählt ein Fach nur mit Datei und erkennt frei benannte Dateien", () => {
    expect(fachBelegt("Mietvertrag", [{ name: "Mietvertrag", url: "" }])).toBe(false);
    expect(fachBelegt("Mietvertrag", [{ name: "Mietvertrag WE 5.pdf", url: "x" }])).toBe(true);
    const v = einheitVollstaendigkeit(we({ bilder: [{ id: "1", url: "u", alt: "", reihenfolge: 0 }], dokumente: [] }));
    expect(v.faecher["Wohnungsbilder"]).toBe(true);
    expect(v.faecher["Grundriss"]).toBe(false);
  });

  it("zeigt dem Objektpartner nur seine eigenen Objekte", () => {
    const o = (id: string, von?: string) => ({ id, erstellt_von: von }) as unknown as ObjektData;
    const liste = [o("a", "u1"), o("b", "u2"), o("c")];
    expect(objekteFuerRolle(liste, "objektpartner", "u1").map((x) => x.id)).toEqual(["a"]);
    expect(objekteFuerRolle(liste, "objektpartner", null)).toEqual([]);
    expect(objekteFuerRolle(liste, "backoffice", null)).toHaveLength(3);
  });

  it("nimmt als aktuellen Mieter den belegenden mit dem spätesten Beginn", () => {
    const m = (id: string, status: Mieter["status"], beginn: string, wohneinheitId = "w") =>
      ({ id, status, mietvertragBeginn: beginn, wohneinheitId, kaltmiete: 325, dokumente: [] }) as unknown as Mieter;
    const liste = [m("alt", "aktiv", "2019-11-01"), m("neu", "aktiv", "2024-01-01"), m("weg", "ausgezogen", "2025-01-01"), m("anders", "aktiv", "2025-01-01", "x")];
    expect(aktuellerMieter(liste, "w")?.id).toBe("neu");
    expect(aktuellerMieter([m("weg", "ausgezogen", "2025-01-01")], "w")).toBeUndefined();
  });

  it("meldet abweichende Miete und erkennt den Mietvertrag am Mieter", () => {
    const objekt = { wohnungen: [we({})] } as unknown as ObjektData;
    const mieter = { id: "m", status: "aktiv", mietvertragBeginn: "", wohneinheitId: "w", kaltmiete: 350,
      dokumente: [{ id: "d", name: "MV", url: "u", typ: "mietvertrag", erstelltAm: "" }] } as unknown as Mieter;
    const [z] = mieterZeilen(objekt, [mieter]);
    expect(z.mieteAbweichend).toBe(true);
    expect(z.vertragVorhanden).toBe(true);
    expect(mieterZeilen(objekt, [{ ...mieter, kaltmiete: 325.2 }])[0].mieteAbweichend).toBe(false);
  });

  it("meldet Unterlagen, die laut Liste vorhanden sind, aber im CRM fehlen", () => {
    const v = einheitVollstaendigkeit(we({ dokumente: [{ id: "d", name: "Grundriss", url: "u", kategorie: "wohnungsunterlagen" }] }),
      { unterlageGrundriss: true, unterlageMietvertrag: true, unterlageFotos: false });
    expect(v.faecher["Grundriss"]).toBe(true);
    expect(v.lautListe).toEqual({ Mietvertrag: true });
  });
});
