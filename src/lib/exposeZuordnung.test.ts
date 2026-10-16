import { describe, expect, it } from "vitest";
import {
  adresseAusDateiname, adressSchluessel, exposeAblagePfad, exposesZuordnen, exposeZuordnen, speicherDateiname,
  type ExposeDatei, type ZuordnungsObjekt,
} from "./exposeZuordnung";
import { eimerFuerObjektDatei } from "./storage";

const datei = (pfad: string): ExposeDatei => ({ pfad, name: pfad.split("/").pop()! });

const objekte: ZuordnungsObjekt[] = [
  {
    id: "o-barfus", titel: "Barfußstraße 9, 13349 Berlin", adresse: "Barfußstraße 9",
    wohnungen: [
      { id: "w-b3", weNr: "3" },
      { id: "w-b47", weNr: "WE 47", dokumente: [{ name: "Exposé Barfusstraße 9 WE47", url: "/objekt-dokument/x" }] },
    ],
  },
  {
    id: "o-hauff", titel: "Hauffstraße 38", adresse: "Hauffstraße 38 a",
    wohnungen: [{ id: "w-h1", weNr: "1" }, { id: "w-h35", weNr: "35" }],
  },
  { id: "o-agnes", titel: "Doppelhaushälfte Agnesstraße 29", adresse: "Agnesstraße 29", wohnungen: [{ id: "w-a29", weNr: "1" }] },
  { id: "o-agnes30", titel: "Agnesstraße 30", adresse: "Agnesstraße 30", wohnungen: [] },
  { id: "o-andere", titel: "Hauffstraße 381", adresse: "Hauffstraße 381", wohnungen: [{ id: "w-x1", weNr: "1" }] },
];

describe("Exposé-Zuordnung", () => {
  it("liest Straße und Hausnummer aus dem Dateinamen", () => {
    expect(adresseAusDateiname("Exposé Barfusstraße 9 WE03.pdf")).toEqual({ strasse: "barfustr", hausnummer: "9" });
    expect(adresseAusDateiname("Exposé Luisenstraße 72.pdf")).toEqual({ strasse: "luisenstr", hausnummer: "72" });
  });

  it("behandelt ß, ss und Abkürzung gleich", () => {
    expect(adressSchluessel("Barfußstraße 9")).toBe(adressSchluessel("Barfusstraße 9"));
    expect(adressSchluessel("Barfusstr. 9")).toBe(adressSchluessel("Barfusstraße 9"));
  });

  it("ordnet WE03 der Einheit 3 zu, auch bei zerlegtem é aus dem Mac-Dateisystem", () => {
    const z = exposeZuordnen(datei("Exposés/Barfusstraße 9/Exposé Barfusstraße 9 WE03.pdf".normalize("NFD")), objekte);
    expect(z).toMatchObject({ art: "einheit", objektId: "o-barfus", wohnungId: "w-b3", schonDa: false });
  });

  it("findet die Hausnummer nur als ganze Zahl (38 nicht in 381)", () => {
    const z = exposeZuordnen(datei("Hauffstraße 38/Exposé Hauffstraße 38 WE01.pdf"), objekte);
    expect(z).toMatchObject({ art: "einheit", objektId: "o-hauff", wohnungId: "w-h1" });
  });

  it("meldet eine fehlende WE als unklar statt zu raten", () => {
    const z = exposeZuordnen(datei("Hauffstraße 38/Exposé Hauffstraße 38 WE46.pdf"), objekte);
    expect(z.art).toBe("unklar");
  });

  it("erkennt eine schon vorhandene Unterlage", () => {
    expect(exposeZuordnen(datei("Exposé Barfusstraße 9 WE47.pdf"), objekte)).toMatchObject({ art: "einheit", schonDa: true });
  });

  it("ohne WE-Nummer: einzige Einheit, sonst das Objekt ohne Einheiten, sonst unklar", () => {
    expect(exposeZuordnen(datei("Exposé Agnesstraße 29.pdf"), objekte)).toMatchObject({ art: "einheit", wohnungId: "w-a29" });
    expect(exposeZuordnen(datei("Exposé Agnesstraße 30.pdf"), objekte)).toMatchObject({ art: "objekt", objektId: "o-agnes30" });
    expect(exposeZuordnen(datei("Exposé Luisenstraße 72.pdf"), objekte).art).toBe("unklar");
  });

  it("lässt Hilfsordner und fremde Dateien liegen", () => {
    expect(exposeZuordnen(datei("_Generator/neu/Exposé Barfusstraße 9 WE03.pdf"), objekte).art).toBe("ignoriert");
    expect(exposeZuordnen(datei("Zossen Wünsdorf/KfW-Strategie Zossen-Wünsdorf.pdf"), objekte).art).toBe("ignoriert");
  });

  it("macht zwei Dateien für dieselbe Einheit beide unklar", () => {
    const liste = exposesZuordnen([datei("a/Exposé Barfusstraße 9 WE03.pdf"), datei("b/Exposé Barfußstraße 9 WE 3.pdf")], objekte);
    expect(liste.map((z) => z.art)).toEqual(["unklar", "unklar"]);
  });

  it("legt im geschützten Eimer ab, ohne die Grundriss-Ausnahme zu treffen", () => {
    const z = exposeZuordnen(datei("Exposé Barfusstraße 9 WE03.pdf"), objekte);
    if (z.art !== "einheit") throw new Error("erwartet Einheit");
    const pfad = exposeAblagePfad(z);
    expect(pfad).toBe("objekte/o-barfus/wohnungen/w-b3/expose-barfusstrasse-9-we03.pdf");
    expect(eimerFuerObjektDatei(pfad)).toBe("objekt-dokumente");
    expect(speicherDateiname("Exposé Agnesstraße 29.pdf")).toBe("expose-agnesstrasse-29.pdf");
  });
});
