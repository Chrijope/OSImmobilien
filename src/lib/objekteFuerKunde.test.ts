import { describe, expect, it } from "vitest";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { kundenMitRahmen, passendeJeObjekt } from "./objekteFuerKunde";

function we(id: string, vkGesamt: number): ObjektWohnung {
  return { id, weNr: id, etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 800, vkGesamt, qmPreis: 0, rendite: 0, vermietet: true, status: "frei" } as ObjektWohnung;
}
function objekt(id: string, wohnungen: ObjektWohnung[]): ObjektData {
  return {
    id, titel: `Haus ${id}`, adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "",
    bildUrl: "", bilder: [], dokumente: [], wohnungen, videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
    erstellt_am: "2026-01-01", meta: {},
  } as ObjektData;
}
const VP = { rolle: "vertriebspartner", benutzerId: "vp-1", name: "Vera Partner" };

describe("passendeJeObjekt", () => {
  it("zählt je Objekt die Einheiten im Rahmen", () => {
    const objekte = [objekt("a", [we("1", 200000), we("2", 600000)]), objekt("b", [we("3", 900000)])];
    const m = passendeJeObjekt(objekte, { nutzer: VP, kundeId: "k", rahmen: { von: 150000, bis: 300000 } });
    expect(m.get("a")).toBe(1);
    expect(m.get("b")).toBe(0);
  });
});

describe("kundenMitRahmen", () => {
  const kontakte = [{ id: "k1", vorname: "Mira", nachname: "Schulte" }, { id: "k2", vorname: "Jonas", nachname: "Becker" }];
  it("nimmt nur Investments mit Rahmen und nur sichtbare Kontakte", () => {
    const invs = [{ id: "i1", kontaktId: "k1" }, { id: "i2", kontaktId: "k2" }, { id: "i3", kontaktId: "fremd" }];
    const liste = kundenMitRahmen(kontakte, invs, (id) => (id === "i1" ? { von: 1, bis: 2 } : null));
    expect(liste.map((k) => k.investmentId)).toEqual(["i1"]);
    expect(liste[0].name).toBe("Mira Schulte");
  });
  it("unterscheidet mehrere Investments desselben Kunden", () => {
    const invs = [{ id: "i1", kontaktId: "k1", nummer: 1 }, { id: "i2", kontaktId: "k1", nummer: 2 }];
    const liste = kundenMitRahmen(kontakte, invs, () => ({ von: 1, bis: 2 }));
    expect(liste.map((k) => k.name)).toEqual(["Mira Schulte (Investment 1)", "Mira Schulte (Investment 2)"]);
  });
});
