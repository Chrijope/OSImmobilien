import { describe, it, expect } from "vitest";
import type { ObjektWohnung } from "@/lib/objekteStore";
import {
  spanne, renditeProzent, preisJeQm, objektKennzahlen, verkaufsstand,
  sortiereEinheiten, filtereEinheiten, istEinheitInaktiv, weitereEinheiten,
  einfacheFinanzierung, aufEinenBlickZeilen, monatJahr,
} from "@/lib/objektKennzahlen";

/** Intl setzt vor das Eurozeichen ein geschütztes Leerzeichen, für den Vergleich reicht ein normales. */
const n = (s?: string) => (s || "").replace(/\u00a0/g, " ");

function we(teil: Partial<ObjektWohnung> & { weNr: string }): ObjektWohnung {
  return {
    id: teil.weNr, etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 600,
    vkGesamt: 200000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei",
    ...teil,
  };
}

describe("Spanne und Rendite", () => {
  it("lässt Nullen und Leerwerte aus der Spanne heraus", () => {
    expect(spanne([0, 45, undefined, 98, null])).toEqual({ von: 45, bis: 98 });
    expect(spanne([0, undefined])).toBeNull();
  });

  it("rechnet die eine Rendite als Jahreskaltmiete durch Kaufpreis", () => {
    // 790 € Kaltmiete, 232.000 € Kaufpreis: 9.480 / 232.000 = 4,086 %
    expect(renditeProzent(790, 232000)).toBeCloseTo(4.086, 3);
    expect(renditeProzent(790, 0)).toBe(0);
    expect(renditeProzent(0, 232000)).toBe(0);
  });

  it("rechnet den Preis je Quadratmeter", () => {
    expect(preisJeQm(232000, 61.4)).toBeCloseTo(3778.5, 1);
    expect(preisJeQm(232000, 0)).toBe(0);
  });
});

describe("Kennzahlen der Objektseite", () => {
  const liste = [
    we({ weNr: "WE 1", groesse: 45, zimmer: 2, vkGesamt: 189000, mieteGesamt: 590, status: "verkauft" }),
    we({ weNr: "WE 2", groesse: 61.4, zimmer: 3, vkGesamt: 232000, mieteGesamt: 790, status: "frei" }),
    we({ weNr: "WE 3", groesse: 98, zimmer: 4, vkGesamt: 412000, mieteGesamt: 1180, status: "reserviert" }),
  ];

  it("bildet die acht Kacheln aus der Einheitenliste", () => {
    const k = objektKennzahlen(liste);
    expect(k.wohnflaeche).toEqual({ von: 45, bis: 98 });
    expect(k.wohnflaecheGesamt).toBeCloseTo(204.4, 1);
    expect(k.zimmer).toEqual({ von: 2, bis: 4 });
    expect(k.kaufpreis).toEqual({ von: 189000, bis: 412000 });
    expect(k.volumen).toBe(833000);
    expect(k.einheiten).toEqual({ gesamt: 3, frei: 1, reserviert: 1, verkauft: 1 });
    expect(k.kaltmiete).toEqual({ von: 590, bis: 1180 });
    expect(k.rendite!.von).toBeCloseTo(3.437, 2);
    expect(k.rendite!.bis).toBeCloseTo(4.086, 2);
    expect(k.preisJeQm!.von).toBeCloseTo(3778.5, 0);
    expect(k.preisJeQm!.bis).toBeCloseTo(4204.1, 0);
  });

  it("nutzt die neue Miete, sobald die Mieterhöhung erreicht ist", () => {
    const k = objektKennzahlen([we({ weNr: "WE 1", mieteGesamt: 600, neueMiete: 700, mieterhoehungAb: "2026-01-01" })], "2026-09-02");
    expect(k.kaltmiete).toEqual({ von: 700, bis: 700 });
    const vorher = objektKennzahlen([we({ weNr: "WE 1", mieteGesamt: 600, neueMiete: 700, mieterhoehungAb: "2027-01-01" })], "2026-09-02");
    expect(vorher.kaltmiete).toEqual({ von: 600, bis: 600 });
  });

  it("liefert leere Kacheln für ein Objekt ohne Einheiten", () => {
    const k = objektKennzahlen([]);
    expect(k.wohnflaeche).toBeNull();
    expect(k.rendite).toBeNull();
    expect(k.einheiten.gesamt).toBe(0);
  });

  it("zählt den Verkaufsstand nach Stück und Volumen", () => {
    const v = verkaufsstand(liste);
    expect(v.verkauft).toMatchObject({ anzahl: 1, volumen: 189000 });
    expect(v.reserviert).toMatchObject({ anzahl: 1, volumen: 412000 });
    expect(v.frei).toMatchObject({ anzahl: 1, volumen: 232000 });
    expect(v.gesamt.volumen).toBe(833000);
    expect(v.verkauft.anteilProzent).toBeCloseTo(22.69, 1);
  });
});

describe("Einheitentabelle", () => {
  const liste = [
    we({ weNr: "WE 10", etage: "DG", groesse: 98, vkGesamt: 412000, status: "frei" }),
    we({ weNr: "WE 2", etage: "EG", lage: "rechts", groesse: 47.3, vkGesamt: 197500, status: "frei" }),
    we({ weNr: "WE 1", etage: "EG", lage: "links", groesse: 45, vkGesamt: 189000, status: "verkauft" }),
    we({ weNr: "WE 3", etage: "1. OG", groesse: 52.1, vkGesamt: 209000, status: "reserviert" }),
  ];

  it("sortiert WE-Nummern natürlich, WE 2 vor WE 10", () => {
    expect(sortiereEinheiten(liste, "weNr", "asc").map((w) => w.weNr)).toEqual(["WE 1", "WE 2", "WE 3", "WE 10"]);
    expect(sortiereEinheiten(liste, "weNr", "desc").map((w) => w.weNr)).toEqual(["WE 10", "WE 3", "WE 2", "WE 1"]);
  });

  it("sortiert Etagen in Hausordnung und dann nach Lage", () => {
    expect(sortiereEinheiten(liste, "etage", "asc").map((w) => w.weNr)).toEqual(["WE 1", "WE 2", "WE 3", "WE 10"]);
  });

  it("sortiert nach Kaufpreis und Preis je Quadratmeter", () => {
    expect(sortiereEinheiten(liste, "vkGesamt", "desc").map((w) => w.weNr)).toEqual(["WE 10", "WE 3", "WE 2", "WE 1"]);
    // je m²: WE 1 4.200, WE 10 4.204, WE 2 4.175, WE 3 4.012
    expect(sortiereEinheiten(liste, "preisJeQm", "asc").map((w) => w.weNr)).toEqual(["WE 3", "WE 2", "WE 1", "WE 10"]);
  });

  it("sortiert nach Status: frei, reserviert, verkauft", () => {
    expect(sortiereEinheiten(liste, "status", "asc").map((w) => w.status)).toEqual(["frei", "frei", "reserviert", "verkauft"]);
  });

  it("zeigt mit dem Schalter nur freie Einheiten", () => {
    expect(filtereEinheiten(liste, true).map((w) => w.weNr).sort()).toEqual(["WE 10", "WE 2"]);
    expect(filtereEinheiten(liste, false)).toHaveLength(4);
  });

  it("markiert verkaufte Einheiten als inaktiv", () => {
    expect(istEinheitInaktiv({ status: "verkauft" })).toBe(true);
    expect(istEinheitInaktiv({ status: "reserviert" })).toBe(false);
    expect(istEinheitInaktiv({ status: "frei" })).toBe(false);
  });

  it("lässt verkaufte Einheiten aus der Liste der weiteren Einheiten heraus", () => {
    expect(weitereEinheiten(liste).map((w) => w.weNr)).toEqual(["WE 2", "WE 3", "WE 10"]);
  });
});

describe("Einfache Finanzierung", () => {
  it("rechnet die Beispielzahlen des Mockups nach", () => {
    // 232.000 plus 9.500 Stellplatz, 5,5 % Nebenkosten in Bayern, 4 % Zins, 1,5 % Tilgung
    const f = einfacheFinanzierung({
      kaufpreis: 232000, stellplatzPreis: 9500, nebenkostenProzent: 5.5,
      zinsProzent: 4, tilgungProzent: 1.5, kaltmieteMonat: 790,
      hausgeldNichtUmlegbarMonat: 90, verwaltungMonat: 0,
    });
    expect(f.gesamtinvestition).toBe(241500);
    expect(Math.round(f.nebenkosten)).toBe(13283);
    expect(Math.round(f.rateMonat)).toBe(1107);
    expect(Math.round(f.eigenanteilMonat)).toBe(407);
  });
});

describe("Auf einen Blick", () => {
  const basis = {
    ort: "Augsburg", bundesland: "Bayern", baujahr: 1962, bauzustand: "Kernsanierung",
    anlageklasse: "Eigentumswohnung", hausgeldMonat: 185, hausgeldNichtUmlegbarMonat: 90,
    verwaltungsart: "WEG+SEV", verwaltungWegMonatObjekt: 28, verwaltungSevMonatObjekt: 25,
  };

  it("zeigt bei einer vermieteten Bestandswohnung vermietet seit und keine Garantie", () => {
    const z = aufEinenBlickZeilen({
      ...basis, neubau: false,
      wohnung: we({ weNr: "WE 7", vermietet: true, vermietetSeit: "2023-04-01", mietgarantieKalt: 790, stadtteil: "Göggingen", nebenkostenMonat: 95, mieteGesamt: 790, vkGesamt: 232000, groesse: 61.4, sanierungsjahr: 2024 }),
    });
    const labels = z.miete.map((r) => r.label);
    expect(labels).toContain("Vermietet");
    expect(labels).not.toContain("Erstvermietung garantiert (kalt)");
    expect(z.miete.find((r) => r.label === "Vermietet")!.wert).toBe("seit 04/2023");
    expect(n(z.miete.find((r) => r.label === "Miete (warm)")!.wert)).toBe("885 €");
    expect(n(z.miete.find((r) => r.label === "Rendite")!.wert)).toBe("4,09 %");
    expect(z.fakten.find((r) => r.label === "Lage")!.wert).toBe("Augsburg, Göggingen");
    expect(z.fakten.find((r) => r.label === "Baujahr")!.unter).toBe("Sanierung 2024");
    expect(n(z.miete.find((r) => r.label === "Verwaltung")!.unter)).toBe("WEG 28 €, SEV 25 € je Monat");
  });

  it("zeigt beim Neubau die garantierte Erstvermietung", () => {
    const z = aufEinenBlickZeilen({
      ...basis, neubau: true,
      wohnung: we({ weNr: "WE 1", vermietet: false, mietgarantieKalt: 790, mietgarantieMonate: 24, sevErstesJahrInklusive: true }),
    });
    const garantie = z.miete.find((r) => r.label === "Erstvermietung garantiert (kalt)");
    expect(garantie).toBeDefined();
    expect(n(garantie!.wert)).toBe("790 €");
    expect(garantie!.unter).toBe("24 Monate ab Übergabe");
    expect(z.miete.map((r) => r.label)).not.toContain("Vermietet");
    expect(z.miete.find((r) => r.label === "Verwaltung")!.unter).toContain("SEV im ersten Jahr inklusive");
  });

  it("zeigt auch bei leerstehendem Bestand die Garantie, falls gepflegt", () => {
    const z = aufEinenBlickZeilen({
      ...basis, neubau: false,
      wohnung: we({ weNr: "WE 4", vermietet: false, mietgarantieKalt: 650 }),
    });
    expect(z.miete.map((r) => r.label)).toContain("Erstvermietung garantiert (kalt)");
  });

  it("weist ohne Nebenkosten nur die Kaltmiete aus und jede Zeile trägt eine Erklärung", () => {
    const z = aufEinenBlickZeilen({ ...basis, neubau: false, wohnung: we({ weNr: "WE 5", vermietet: true }) });
    expect(z.miete.map((r) => r.label)).toContain("Kaltmiete");
    expect(z.miete.map((r) => r.label)).not.toContain("Miete (warm)");
    for (const r of [...z.fakten, ...z.miete]) expect(r.info.length).toBeGreaterThan(10);
  });

  it("lässt Kaufpreis und Größe weg (stehen in den Kacheln) und zeigt Energie und Stellplatz als Zeilen", () => {
    const z = aufEinenBlickZeilen({
      ...basis, neubau: false,
      energie: { klasse: "D", art: "Verbrauchsausweis", kennwert: 121, energietraeger: "Gas", gueltigBis: "2032" },
      wohnung: we({ weNr: "WE 7", vermietet: true, mieteGesamt: 790, vkGesamt: 232000, groesse: 61.4, stellplatzPreis: 9500, stellplatzMiete: 40 }),
    });
    expect(z.fakten.map((r) => r.label)).not.toContain("Größe");
    expect(z.miete.map((r) => r.label)).not.toContain("Kaufpreis");
    expect(z.miete.map((r) => r.label)).toContain("Rendite");
    const energie = z.fakten.find((r) => r.label === "Energie")!;
    expect(energie.wert).toBe("Klasse D");
    expect(energie.unter).toBe("Verbrauchsausweis, 121 kWh/(m²·a), Gas, gültig bis 2032");
    const stellplatz = z.miete.find((r) => r.label === "Stellplatz")!;
    expect(n(stellplatz.wert)).toBe("9.500 €");
    expect(n(stellplatz.unter)).toBe("40 € Miete je Monat");
    // Ohne Energieausweis und ohne Stellplatz fehlen die Zeilen.
    const leer = aufEinenBlickZeilen({ ...basis, neubau: false, energie: {}, wohnung: we({ weNr: "WE 8", vermietet: true }) });
    expect(leer.fakten.map((r) => r.label)).not.toContain("Energie");
    expect(leer.miete.map((r) => r.label)).not.toContain("Stellplatz");
  });

  it("formatiert Monat und Jahr", () => {
    expect(monatJahr("2023-04-01")).toBe("04/2023");
    expect(monatJahr("2023-04")).toBe("04/2023");
    expect(monatJahr("2019")).toBe("2019");
    expect(monatJahr(undefined)).toBe("");
  });
});
