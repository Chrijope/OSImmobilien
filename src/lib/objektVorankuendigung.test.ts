import { describe, expect, it } from "vitest";
import { einheitenGesperrt, istVorankuendigung, objektSichtStufe } from "./objektVorankuendigung";
import { merkmalTags } from "@/components/objektseite/MerkmalTags";
import { rohdaten, einheitQuelle } from "./investagonFelder";

describe("Vorankündigung (30.10.2026)", () => {
  const voran = { sichtbar: true, meta: { vorankuendigung: true } };
  it("drei Stufen aus sichtbar und meta", () => {
    expect(objektSichtStufe({ sichtbar: false, meta: { vorankuendigung: true } })).toBe("entwurf");
    expect(objektSichtStufe(voran)).toBe("vorankuendigung");
    expect(objektSichtStufe({ sichtbar: true })).toBe("sichtbar");
    expect(istVorankuendigung({ sichtbar: false, meta: { vorankuendigung: true } })).toBe(false);
  });
  it("Vertriebspartner öffnen keine Einheit, die Leitung schon", () => {
    expect(einheitenGesperrt(voran, "vertriebspartner")).toBe(true);
    expect(einheitenGesperrt(voran, "setterin")).toBe(true);
    for (const r of ["admin", "inhaber", "objektpartner", "backoffice", "vertriebsleiter"]) expect(einheitenGesperrt(voran, r)).toBe(false);
    expect(einheitenGesperrt({ sichtbar: true }, "vertriebspartner")).toBe(false);
  });
});

describe("Merkmal-Tags und Miteigentumsanteil", () => {
  it("Einheit zuerst, sonst Objekt, sonst gemeinsame Merkmale aller Einheiten", () => {
    const objekt = { meta: {}, wohnungen: [
      { angaben: { merkmale: ["Erhöhte AfA", "Garage inklusive"] } },
      { angaben: { merkmale: ["Erhöhte AfA", "Balkon"] } },
    ] };
    expect(merkmalTags(objekt).map((m) => m.bezeichnung)).toEqual(["Erhöhte AfA"]);
    expect(merkmalTags(objekt, objekt.wohnungen[1]).map((m) => m.bezeichnung)).toEqual(["Erhöhte AfA", "Balkon"]);
    expect(merkmalTags({ meta: { angaben: { merkmale: ["Aufzug: Ja"] } } }, {}).map((m) => m.wert)).toEqual(["Ja"]);
  });
  it("MEA von Hand landet als object_share_owner", () => {
    expect(rohdaten(einheitQuelle({ angaben: { miteigentumsanteil: 2.345 } }))?.object_share_owner).toBe(2.345);
  });
});
