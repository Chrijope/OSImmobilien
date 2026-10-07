import { describe, it, expect } from "vitest";
import {
  validiereEigenesInvestment,
  zahlOderNull,
} from "@/lib/eigeneInvestmentValidierung";

// Festes "Heute", damit die Tests nicht vom Kalender abhaengen.
const HEUTE = new Date("2026-08-18T12:00:00");

const form = (over: Record<string, string> = {}): Record<string, string> => ({
  bezeichnung: "Testwohnung",
  kaufpreis: "", kaufdatum: "", nebenkosten: "",
  baujahr: "", wohnflaeche: "",
  darlehenssumme: "", offene_tilgung: "", zinssatz: "", monatliche_rate: "",
  anfangstilgung: "", sondertilgung_jahr: "",
  mieteinnahmen_kalt: "", mieteinnahmen_warm: "", hausgeld: "", ruecklagen: "",
  eigenanteil_manuell: "",
  gebaeude_anteil_prozent: "", afa_satz_prozent: "",
  grundsteuer_jahr: "", versicherung_jahr: "", verwaltungskosten_jahr: "",
  hausgeld_nicht_umlage_monat: "", umlagen_monat: "",
  miteigentumsanteil_prozent: "",
  ...over,
});

describe("zahlOderNull", () => {
  it("laesst leere Felder NULL statt 0", () => {
    expect(zahlOderNull("")).toBeNull();
    expect(zahlOderNull("   ")).toBeNull();
    expect(zahlOderNull(undefined)).toBeNull();
  });

  it("liest Zahlen inklusive Komma-Schreibweise", () => {
    expect(zahlOderNull("1200")).toBe(1200);
    expect(zahlOderNull("2,5")).toBe(2.5);
    expect(zahlOderNull("2.5")).toBe(2.5);
  });

  it("liefert NaN fuer Unlesbares (wird als Fehler gemeldet)", () => {
    expect(Number.isNaN(zahlOderNull("abc") as number)).toBe(true);
  });
});

describe("validiereEigenesInvestment: leere Felder sind erlaubt", () => {
  it("meldet fuer ein leeres Formular weder Fehler noch Warnungen", () => {
    const erg = validiereEigenesInvestment(form(), HEUTE);
    expect(erg.fehler).toEqual([]);
    expect(erg.warnungen).toEqual([]);
    expect(erg.felder).toEqual({});
  });

  it("akzeptiert plausible Eingaben ohne Beanstandung", () => {
    const erg = validiereEigenesInvestment(form({
      kaufpreis: "300000", kaufdatum: "2024-05-01", baujahr: "1990",
      darlehenssumme: "250000", offene_tilgung: "240000", zinssatz: "3.8",
      gebaeude_anteil_prozent: "80", afa_satz_prozent: "2",
      miteigentumsanteil_prozent: "50", grundsteuer_jahr: "400",
    }), HEUTE);
    expect(erg.fehler).toEqual([]);
    expect(erg.warnungen).toEqual([]);
  });
});

describe("validiereEigenesInvestment: harte Fehler blockieren", () => {
  it("lehnt negative Betraege ab und markiert das Feld", () => {
    const erg = validiereEigenesInvestment(form({ kaufpreis: "-1000" }), HEUTE);
    expect(erg.fehler.length).toBe(1);
    expect(erg.fehler[0]).toContain("Kaufpreis");
    expect(erg.felder.kaufpreis).toBe("fehler");
  });

  it("lehnt Prozentwerte ausserhalb von 0 bis 100 ab", () => {
    const zuHoch = validiereEigenesInvestment(form({ gebaeude_anteil_prozent: "120" }), HEUTE);
    expect(zuHoch.fehler[0]).toContain("zwischen 0 und 100");
    expect(zuHoch.felder.gebaeude_anteil_prozent).toBe("fehler");
    const negativ = validiereEigenesInvestment(form({ miteigentumsanteil_prozent: "-5" }), HEUTE);
    expect(negativ.fehler.length).toBe(1);
  });

  it("lehnt unlesbare Zahlen ab", () => {
    const erg = validiereEigenesInvestment(form({ grundsteuer_jahr: "abc" }), HEUTE);
    expect(erg.fehler[0]).toContain("keine gültige Zahl");
  });

  it("lehnt einen negativen Zinssatz ab", () => {
    const erg = validiereEigenesInvestment(form({ zinssatz: "-1" }), HEUTE);
    expect(erg.fehler.length).toBe(1);
    expect(erg.felder.zinssatz).toBe("fehler");
  });
});

describe("validiereEigenesInvestment: Warnungen erlauben das Speichern nach Bestaetigung", () => {
  it("warnt bei Zinssatz ueber 15 Prozent", () => {
    const erg = validiereEigenesInvestment(form({ zinssatz: "16" }), HEUTE);
    expect(erg.fehler).toEqual([]);
    expect(erg.warnungen.length).toBe(1);
    expect(erg.felder.zinssatz).toBe("warnung");
  });

  it("warnt bei Kaufpreis 0, wenn er angegeben ist", () => {
    const erg = validiereEigenesInvestment(form({ kaufpreis: "0" }), HEUTE);
    expect(erg.fehler).toEqual([]);
    expect(erg.warnungen[0]).toContain("Kaufpreis");
  });

  it("warnt bei unplausiblem Baujahr (1800 bis aktuelles Jahr)", () => {
    const zuAlt = validiereEigenesInvestment(form({ baujahr: "1750" }), HEUTE);
    expect(zuAlt.warnungen[0]).toContain("Baujahr");
    const zukunft = validiereEigenesInvestment(form({ baujahr: "2027" }), HEUTE);
    expect(zukunft.warnungen[0]).toContain("Baujahr");
    const ok = validiereEigenesInvestment(form({ baujahr: "2026" }), HEUTE);
    expect(ok.warnungen).toEqual([]);
  });

  it("warnt bei Kaufdatum in der Zukunft", () => {
    const erg = validiereEigenesInvestment(form({ kaufdatum: "2026-12-31" }), HEUTE);
    expect(erg.fehler).toEqual([]);
    expect(erg.warnungen[0]).toContain("Zukunft");
    expect(erg.felder.kaufdatum).toBe("warnung");
  });

  it("warnt, wenn die offene Tilgung ueber der Darlehenssumme liegt", () => {
    const erg = validiereEigenesInvestment(form({ darlehenssumme: "200000", offene_tilgung: "250000" }), HEUTE);
    expect(erg.fehler).toEqual([]);
    expect(erg.warnungen[0]).toContain("Darlehenssumme");
    expect(erg.felder.offene_tilgung).toBe("warnung");
  });

  it("warnt nicht, wenn die offene Tilgung unter der Darlehenssumme liegt", () => {
    const erg = validiereEigenesInvestment(form({ darlehenssumme: "200000", offene_tilgung: "150000" }), HEUTE);
    expect(erg.warnungen).toEqual([]);
  });
});
