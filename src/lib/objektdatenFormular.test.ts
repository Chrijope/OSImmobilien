import { describe, expect, it } from "vitest";
import { LEERE_EINHEIT, einheitFormAus, einheitFormInDaten, objektFormAus, objektFormInMeta, zahlAus } from "./objektdatenFormular";

describe("Objektdaten im Formular Objekt anlegen", () => {
  it("liest deutsche Zahlen", () => {
    expect(zahlAus("1.234,50 €")).toBe(1234.5);
    expect(zahlAus("12,5 %")).toBe(12.5);
    expect(zahlAus("")).toBeNull();
    expect(zahlAus("abc")).toBeNull();
  });

  it("schreibt die Formularwerte in die Listendaten und lässt fremde Werte stehen", () => {
    const { werte, garage, mieter } = einheitFormInDaten(
      { ...LEERE_EINHEIT, haus: "38 f", mea: "45,3", sollMiete: "", letzteErhoehung: "2025-03-01", garageNr: "G4", garageStatus: "extern", garageIstMiete: "50", mieterName: "Anna Muster", kaution: "1.200" },
      { sollMiete: 500, heizkosten: 80 },
    );
    expect(werte).toEqual({ haus: "38 f", mea: 45.3, letzteErhoehung: "2025-03-01", heizkosten: 80 });
    expect(garage).toEqual({ nr: "G4", art: "garage", status: "extern", istMiete: 50 });
    expect(mieter).toEqual({ name: "Anna Muster", beginn: "", befristetBis: "", kaution: 1200 });
    expect(einheitFormInDaten({ ...LEERE_EINHEIT, garageIstMiete: "50" }, {}).garage).toBeNull();
  });

  it("belegt das Formular aus den gespeicherten Werten vor", () => {
    const f = einheitFormAus({ mea: 45.3, letzteErhoehung: "01.03.2025" }, { nr: "SP1", art: "stellplatz", status: "frei", istMiete: null },
      { vorname: "Anna", nachname: "Muster", mietvertragBeginn: "2020-01-01", mietvertragEnde: "", kaution: 0 });
    expect(f).toMatchObject({ mea: "45,3", letzteErhoehung: "2025-03-01", garageNr: "SP1", garageArt: "stellplatz", mieterName: "Anna Muster", mietbeginn: "2020-01-01", kaution: "" });
  });

  it("übersetzt Subvention, Kappungsgrenze und Reservierung hin und zurück", () => {
    const meta = objektFormInMeta({
      subventionArt: "ziel", zielQm: "13,50", steigerungProzent: "", einmalBetrag: "", garageAnrechnung: "100",
      laufzeitMonate: "", garagenSubventionMonate: "", vergleichsmieteQm: "9,8", kappungsgrenzeProzent: "15", reservierungTage: "14",
    }, { meilensteine: { abnahme: "2026-06-30" } });
    expect(meta.mietgarantie).toEqual({ art: "ziel", zielQm: 13.5, steigerung: 0, einmalBetrag: 0, garageAnrechnung: 100, laufzeitMonate: 36, garagenSubventionMonate: 12 });
    expect(meta.mieterhoehung).toEqual({ kappungsgrenze: 0.15, vergleichsmieteQm: 9.8 });
    expect(meta.aufteilung).toEqual({ meilensteine: { abnahme: "2026-06-30" }, reservierungTage: 14 });
    const zurueck = objektFormAus({ mieterhoehung: meta.mieterhoehung, aufteilung: meta.aufteilung }, meta.mietgarantie);
    expect(zurueck).toMatchObject({ subventionArt: "ziel", zielQm: "13,5", kappungsgrenzeProzent: "15", vergleichsmieteQm: "9,8", reservierungTage: "14", laufzeitMonate: "36" });
    expect(objektFormInMeta({ ...zurueck, subventionArt: "", kappungsgrenzeProzent: "25", reservierungTage: "" }, meta.aufteilung).mietgarantie).toBeNull();
  });
});

describe("zahlAus im Listenimport", () => {
  it("liest Tausenderpunkte ohne Komma als Tausender, Dezimalpunkt bleibt Dezimalpunkt", () => {
    expect(zahlAus("250.000")).toBe(250000);
    expect(zahlAus("1.234.567")).toBe(1234567);
    expect(zahlAus("12.5")).toBe(12.5);
    expect(zahlAus("0.15")).toBe(0.15);
  });
});
