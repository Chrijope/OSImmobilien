import { describe, expect, it } from "vitest";
import { festtagAm, gesehenSchluessel, kartenTexte, motivImJahr, tonFuerRolle } from "./festtagskarten";

const tag = (j: number, m: number, t: number) => new Date(j, m - 1, t, 9);

describe("festtagAm", () => {
  it("Weihnachten nur vom 24. bis 26.12.", () => {
    expect(festtagAm(tag(2026, 12, 23))).toBeNull();
    expect(festtagAm(tag(2026, 12, 24))?.anlass).toBe("weihnachten");
    expect(festtagAm(tag(2026, 12, 26))?.anlass).toBe("weihnachten");
    expect(festtagAm(tag(2026, 12, 27))).toBeNull();
  });

  it("Silvester am 31.12. und 1.1. gehört zum alten Jahr", () => {
    expect(festtagAm(tag(2026, 12, 31))).toEqual({ anlass: "silvester", jahr: 2026, motiv: 1 });
    expect(festtagAm(tag(2027, 1, 1))).toEqual({ anlass: "silvester", jahr: 2026, motiv: 1 });
    expect(festtagAm(tag(2027, 1, 2))).toBeNull();
  });

  it("Geburtstag geht vor, auch am Feiertag", () => {
    expect(festtagAm(tag(2026, 10, 31), "1985-10-31")?.anlass).toBe("geburtstag");
    expect(festtagAm(tag(2026, 12, 24), "24.12.1990")?.anlass).toBe("geburtstag");
    expect(festtagAm(tag(2026, 10, 30), "1985-10-31")).toBeNull();
  });
});

describe("motivImJahr", () => {
  it("wechselt jährlich durch drei Motive", () => {
    expect([2026, 2027, 2028, 2029, 2030].map(motivImJahr)).toEqual([1, 2, 3, 1, 2]);
  });
});

describe("Ton und Texte", () => {
  it("duzt intern, siezt Kunden und Tippgeber, Bewerber bekommen keine Karte", () => {
    expect(tonFuerRolle("vertriebspartner")).toBe("du");
    expect(tonFuerRolle("backoffice")).toBe("du");
    expect(tonFuerRolle("kunde")).toBe("sie");
    expect(tonFuerRolle("tippgeber")).toBe("sie");
    expect(tonFuerRolle("bewerber")).toBeNull();
  });

  it("Kundin auf Deutsch mit Anrede und Ihr-Unterschrift", () => {
    const t = kartenTexte({ anlass: "weihnachten", jahr: 2026, motiv: 1 }, { ton: "sie", sprache: "de", vorname: "Eva", nachname: "Kurz", anrede: "Frau" });
    expect(t.anrede).toBe("Liebe Frau Kurz,");
    expect(t.unterschrift).toBe("Ihr Oliver Skowrnowski");
    expect(t.an).toEqual(["Eva Kurz", "Kundin der OS Real Estate"]);
    expect(t.brief).not.toMatch(/Zusammenarbeit/);
  });

  it("Kunde mit Englisch im Profil bekommt alles auf Englisch", () => {
    const t = kartenTexte({ anlass: "silvester", jahr: 2026, motiv: 1 }, { ton: "sie", sprache: "en", vorname: "John", nachname: "Smith", anrede: "Herr" });
    expect(t.anrede).toBe("Dear Mr Smith,");
    expect(t.gruss).toBe("Happy New Year!");
    expect(t.brief).toContain("2027");
    expect(t.umdrehen).toBe("Turn card over");
  });

  it("intern geduzt mit Rolle in der Adresse", () => {
    const t = kartenTexte({ anlass: "geburtstag", jahr: 2026, motiv: 1 }, { ton: "du", sprache: "en", vorname: "Anna", nachname: "Muster", rolle: "Vertriebspartner" }, tag(2026, 10, 31));
    expect(t.anrede).toBe("Hallo Anna,");
    expect(t.brief).toMatch(/dir/);
    expect(t.augenbraue).toBe("Geburtstag · 31. Oktober");
    expect(t.poststempel).toBe("31.10.26");
    expect(t.an[1]).toBe("Vertriebspartner");
  });

  it("merkt sich die Karte je Anlass und Jahr", () => {
    expect(gesehenSchluessel({ anlass: "silvester", jahr: 2026, motiv: 1 })).toBe("festtagskarte_silvester_2026");
  });
});
