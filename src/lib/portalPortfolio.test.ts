import { describe, it, expect } from "vitest";
import {
  moreImmoPosition,
  eigenePosition,
  berechnePortfolioKennzahlen,
  berechneVermoegen,
  vermoegensVerlauf,
  type PortfolioPosition,
} from "./portalPortfolio";

const pos = (teil: Partial<PortfolioPosition>): PortfolioPosition => ({
  id: "x",
  quelle: "eigene",
  kaufpreis: 0,
  jahresmiete: null,
  restschuld: null,
  marktwert: null,
  marktwertHistorie: [],
  kaufdatum: null,
  ...teil,
});

describe("moreImmoPosition", () => {
  it("uebernimmt Kaufpreis, Jahresmiete und Restschuld aus den Metadaten", () => {
    const p = moreImmoPosition(
      { id: "a", kaufpreis: 200000, meta: { jahresnettomiete: 9000, restschuld: 150000 } },
      null,
    );
    expect(p.quelle).toBe("moreimmo");
    expect(p.kaufpreis).toBe(200000);
    expect(p.jahresmiete).toBe(9000);
    expect(p.restschuld).toBe(150000);
  });

  it("faellt bei fehlender Restschuld auf die Darlehenssumme des akzeptierten Angebots zurueck", () => {
    const fin = {
      akzeptiertes_angebot_id: "ang1",
      angebote: [{ id: "ang1", darlehensbetrag: 180000, zinssatz: 3.5 }],
    };
    const p = moreImmoPosition({ id: "a", kaufpreis: 200000, meta: {} }, fin);
    expect(p.restschuld).toBe(180000);
  });

  it("meldet fehlende Angaben als null statt 0", () => {
    const p = moreImmoPosition({ id: "a", kaufpreis: 200000, meta: {} }, null);
    expect(p.jahresmiete).toBeNull();
    expect(p.restschuld).toBeNull();
  });

  it("liest den letzten Marktwert aus der Historie", () => {
    const p = moreImmoPosition(
      {
        id: "a",
        kaufpreis: 100000,
        meta: {
          marktwertHistorie: [
            { datum: "2026-06-01", wert: 120000, quelle: "ki" },
            { datum: "2025-01-01", wert: 110000, quelle: "manuell" },
          ],
        },
      },
      null,
    );
    // Historie wird sortiert, der juengste Eintrag zaehlt
    expect(p.marktwert).toBe(120000);
  });
});

describe("eigenePosition", () => {
  it("rechnet die Kaltmiete auf das Jahr hoch", () => {
    const p = eigenePosition({ id: "b", kaufpreis: 150000, mieteinnahmen_kalt: 500 });
    expect(p.jahresmiete).toBe(6000);
  });

  it("nutzt offene_tilgung vor der Darlehenssumme", () => {
    const p = eigenePosition({ id: "b", offene_tilgung: 90000, darlehenssumme: 120000 });
    expect(p.restschuld).toBe(90000);
  });

  it("akzeptiert eine erfasste Restschuld von 0 (abbezahlt)", () => {
    const p = eigenePosition({ id: "b", offene_tilgung: 0, darlehenssumme: 120000 });
    expect(p.restschuld).toBe(0);
  });

  it("meldet fehlende Miete und Restschuld als null", () => {
    const p = eigenePosition({ id: "b", kaufpreis: 150000 });
    expect(p.jahresmiete).toBeNull();
    expect(p.restschuld).toBeNull();
  });
});

describe("berechnePortfolioKennzahlen", () => {
  it("zaehlt MOREImmo und eigene Positionen getrennt", () => {
    const kz = berechnePortfolioKennzahlen([
      pos({ quelle: "moreimmo" }),
      pos({ quelle: "moreimmo" }),
      pos({ quelle: "eigene" }),
    ]);
    expect(kz.anzahl).toBe(3);
    expect(kz.anzahlMoreImmo).toBe(2);
    expect(kz.anzahlEigene).toBe(1);
  });

  it("rechnet die Rendite nur ueber Positionen mit belegter Miete", () => {
    const kz = berechnePortfolioKennzahlen([
      pos({ kaufpreis: 100000, jahresmiete: 5000 }),
      pos({ kaufpreis: 100000, jahresmiete: null }),
    ]);
    expect(kz.kaufpreisGesamt).toBe(200000);
    expect(kz.mieteGesamt).toBe(5000);
    expect(kz.mieteAnzahl).toBe(1);
    // 5000 / 100000, NICHT 5000 / 200000
    expect(kz.rendite).toBeCloseTo(5.0, 5);
  });

  it("liefert null statt einer Schein-Rendite, wenn keine Miete belegt ist", () => {
    const kz = berechnePortfolioKennzahlen([pos({ kaufpreis: 100000 })]);
    expect(kz.rendite).toBeNull();
  });
});

describe("berechneVermoegen", () => {
  it("nutzt den Marktwert und faellt sonst auf den Kaufpreis zurueck", () => {
    const v = berechneVermoegen([
      pos({ kaufpreis: 100000, marktwert: 130000, restschuld: 80000 }),
      pos({ kaufpreis: 200000, marktwert: null, restschuld: 150000 }),
    ]);
    expect(v.immobilienwert).toBe(330000);
    expect(v.mitMarktwert).toBe(1);
    expect(v.restschuldGesamt).toBe(230000);
    expect(v.restschuldFehlt).toBe(0);
    expect(v.nettoVermoegen).toBe(100000);
  });

  it("zaehlt fehlende Restschuld-Angaben statt sie als 0 zu werten", () => {
    const v = berechneVermoegen([
      pos({ kaufpreis: 100000, restschuld: null }),
      pos({ kaufpreis: 100000, restschuld: 60000 }),
    ]);
    expect(v.restschuldFehlt).toBe(1);
    expect(v.restschuldGesamt).toBe(60000);
    expect(v.nettoVermoegen).toBe(140000);
  });
});

describe("vermoegensVerlauf", () => {
  it("ist leer, wenn keine Position eine Marktwert-Historie hat", () => {
    expect(vermoegensVerlauf([pos({ kaufpreis: 100000 })])).toEqual([]);
  });

  it("bildet je Stichtag den letzten Marktwert, sonst den Kaufpreis ab", () => {
    const verlauf = vermoegensVerlauf([
      pos({
        kaufpreis: 100000,
        marktwertHistorie: [
          { datum: "2025-01-01", wert: 110000 },
          { datum: "2026-01-01", wert: 120000 },
        ],
      }),
      pos({ kaufpreis: 200000 }),
    ]);
    expect(verlauf).toEqual([
      { datum: "2025-01-01", wert: 310000 },
      { datum: "2026-01-01", wert: 320000 },
    ]);
  });
});
