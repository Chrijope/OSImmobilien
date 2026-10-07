import { describe, it, expect } from "vitest";
import { objektStruktur, objektAnlageklasse, objektBauzustand, portfolioKennzahlen } from "@/lib/objektKlassen";

const obj = (o: Record<string, unknown> = {}) =>
  ({ id: "o1", wohnungen: [], ...o }) as never;
const we = (vkGesamt: number) => ({ id: crypto.randomUUID(), vkGesamt }) as never;

describe("Struktur eines Objekts", () => {
  it("erkennt ein Globalobjekt", () => {
    expect(objektStruktur(obj({ globalObjekt: true, wohnungen: [we(1), we(2)] }))).toBe("globalobjekt");
  });

  it("bleibt Globalobjekt, auch wenn es nur eine Einheit hat", () => {
    // Sonst saesse der Kalkulator auf der Wohnungsseite statt am Objekt.
    expect(objektStruktur(obj({ globalObjekt: true, wohnungen: [we(1)] }))).toBe("globalobjekt");
  });

  it("erkennt eine Einzelwohnung am Merkmal", () => {
    expect(objektStruktur(obj({ meta: { einzelwohnung: true }, wohnungen: [we(1)] }))).toBe("einzelwohnung");
  });

  it("erkennt eine Einzelwohnung auch ohne Merkmal an der einen Einheit", () => {
    expect(objektStruktur(obj({ wohnungen: [we(1)] }))).toBe("einzelwohnung");
  });

  it("erkennt mehrere einzeln verkaufte Einheiten", () => {
    expect(objektStruktur(obj({ wohnungen: [we(1), we(2), we(3)] }))).toBe("mehrere_einheiten");
  });
});

describe("Anlageklasse und Bauzustand", () => {
  it("liest die Anlageklasse aus demselben Feld wie der Badge an der Kachel", () => {
    expect(objektAnlageklasse(obj({ meta: { anlageklasse: "WG-Wohnung" } }))).toBe("WG-Wohnung");
  });

  it("liefert null statt zu raten, wenn nichts gepflegt ist", () => {
    expect(objektAnlageklasse(obj())).toBeNull();
    expect(objektAnlageklasse(obj({ meta: { anlageklasse: "   " } }))).toBeNull();
  });

  it("liest den Bauzustand aus den Globaldaten", () => {
    expect(objektBauzustand(obj({ globalDaten: { zustand: "Neubau" } }))).toBe("Neubau");
    expect(objektBauzustand(obj())).toBeNull();
  });
});

describe("Portfoliokennzahlen", () => {
  const bestand = [
    obj({ meta: { anlageklasse: "Eigentumswohnung" }, globalDaten: { zustand: "Neubau" },
          wohnungen: [we(539000), we(549000), we(598000)] }),
    obj({ meta: { einzelwohnung: true, anlageklasse: "WG-Wohnung" }, globalDaten: { zustand: "Bestand" },
          wohnungen: [we(667000)] }),
    obj({ globalObjekt: true, meta: { anlageklasse: "Eigentumswohnung" },
          wohnungen: [we(4258000)] }),
    obj({ wohnungen: [we(246000), we(448000)] }),                   // ohne Anlageklasse
  ];
  const k = portfolioKennzahlen(bestand);

  it("zaehlt Objekte und Einheiten getrennt", () => {
    expect(k.objekte).toBe(4);
    expect(k.einheiten).toBe(7);
  });

  it("summiert den Portfoliowert aus den Einheiten", () => {
    expect(k.portfoliowert).toBe(539000 + 549000 + 598000 + 667000 + 4258000 + 246000 + 448000);
  });

  it("nennt die guenstigste und teuerste Einheit", () => {
    expect(k.preisVon).toBe(246000);
    expect(k.preisBis).toBe(4258000);
  });

  it("verteilt nach Vermarktungsart", () => {
    expect(k.struktur).toEqual({ globalobjekt: 1, einzelwohnung: 1, mehrere_einheiten: 2 });
  });

  it("zaehlt die Anlageklassen, haeufigste zuerst", () => {
    expect(k.anlageklassen).toEqual([["Eigentumswohnung", 2], ["WG-Wohnung", 1]]);
  });

  it("weist Objekte ohne Anlageklasse aus, statt sie stillschweigend wegzulassen", () => {
    expect(k.klasseOffen).toBe(1);
  });

  it("zaehlt auch die Bauzustaende", () => {
    expect(k.bauzustaende).toEqual([["Bestand", 1], ["Neubau", 1]]);
  });

  it("kommt mit leerem Bestand zurecht", () => {
    const leer = portfolioKennzahlen([]);
    expect(leer.einheiten).toBe(0);
    expect(leer.preisVon).toBe(0);
  });

  it("ignoriert Einheiten ohne Preis bei der Spanne", () => {
    const k2 = portfolioKennzahlen([obj({ wohnungen: [we(0), we(100000), we(0)] })]);
    expect(k2.preisVon).toBe(100000);
    expect(k2.einheiten).toBe(3);
  });
});
