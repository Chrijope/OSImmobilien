import { describe, expect, it } from "vitest";
import { betragInWorten, LEER, monateZwischen, plusMonate, rechne, vorbelegen, zahlInWorten } from "./mietzuzahlung";

/** Vereinbarung über eine Mietzuzahlung (30.10.2026): Rechnung nach der Vorlage im Drive. */

const basis = {
  ...LEER,
  flaeche: "54,08", istMiete: "600", zielQm: "13", laufzeitMonate: "36",
  uebergabe: "2026-12-01", letzteErhoehung: "2026-03-01", erhoehungProzent: "4",
};

describe("Rechnung", () => {
  it("rechnet bis zur nächsten Erhöhung mit der Ist-Miete, danach mit der erhöhten", () => {
    const r = rechne(basis);
    // Ziel 13 € × 54,08 m² = 703,04 €; nächste Erhöhung 15 Monate nach dem 01.03.2026.
    expect(r.zielMiete).toBe(703.04);
    expect(r.naechsteErhoehung).toBe("2027-06-01");
    expect(r.phase1).toMatchObject({ monate: 6, differenz: 103.04, betrag: 618.24, bis: "2027-05-31" });
    expect(r.phase2).toMatchObject({ monate: 30, neueMiete: 624, differenz: 79.04, betrag: 2371.2, bis: "2029-11-30" });
    expect(r.gesamt).toBe(2989.44);
  });

  it("nimmt ein eingetragenes Datum der nächsten Erhöhung und die Garage dazu", () => {
    const r = rechne({ ...basis, naechsteErhoehung: "2027-12-01", garageNr: "G22", garageIstMiete: "80", garageZuschussAuf: "100", garageMonate: "12" });
    expect(r.phase1.monate).toBe(12);
    expect(r.phase2?.monate).toBe(24);
    expect(r.garage).toMatchObject({ differenz: 20, betrag: 240 });
  });

  it("ohne Erhöhung in der Laufzeit eine Phase über alle Monate, über dem Ziel nichts", () => {
    expect(rechne({ ...basis, letzteErhoehung: "", erhoehungProzent: "" }).phase2).toBeNull();
    expect(rechne({ ...basis, letzteErhoehung: "", erhoehungProzent: "" }).phase1.monate).toBe(36);
    expect(rechne({ ...basis, istMiete: "800" }).gesamt).toBe(0);
  });

  it("rechnet Monate und Daten", () => {
    expect(plusMonate("2026-03-01", 15)).toBe("2027-06-01");
    expect(monateZwischen("2026-12-01", "2027-06-01")).toBe(6);
    expect(monateZwischen("2026-12-15", "2027-06-01")).toBe(5);
  });
});

describe("Vorbelegung", () => {
  it("nimmt Kunde, Objekt, Einheit und Objektdaten aus dem System", () => {
    const d = vorbelegen({
      kunde: { vorname: "Anna", nachname: "Muster", strasse: "Weg 1", plz: "10115", ort: "Berlin" },
      objekt: { adresse: "Hauffstraße 38 d", plz: "14548", ort: "Schwielowsee", meta: { mietgarantie: { zielQm: 13, laufzeitMonate: 36, garageAnrechnung: 100, garagenSubventionMonate: 12 }, mieterhoehung: { kappungsgrenze: 0.15 }, grundbuch: { von: "Caputh", amtsgericht: "Potsdam" } } },
      wohnung: { weNr: "WE 21", etage: "2.OG", lage: "mi", groesse: 54.08, mieteGesamt: 703.04 },
      listenwerte: { letzteErhoehung: "2026-03-01", grundbuchBlatt: "1234" },
      garage: { nr: "G22", istMiete: 80 },
      uebergabe: "2026-12-01",
    });
    expect(d).toMatchObject({
      kaeuferName: "Anna Muster", kaeuferAnschrift: "Weg 1, 10115 Berlin", weNr: "21", lage: "2.OG mi",
      grundbuchVon: "Caputh", amtsgericht: "Potsdam", blatt: "1234", flaeche: "54,08", istMiete: "703,04",
      zielQm: "13", erhoehungProzent: "15", garageNr: "G22", garageZuschussAuf: "100", garageMonate: "12", bank: "", iban: "",
    });
  });
});

describe("Betrag in Worten", () => {
  it("schreibt Beträge wie auf Verträgen", () => {
    expect(zahlInWorten(2989)).toBe("zweitausendneunhundertneunundachtzig");
    expect(zahlInWorten(101)).toBe("einhunderteins");
    expect(zahlInWorten(21)).toBe("einundzwanzig");
    expect(zahlInWorten(1000)).toBe("eintausend");
    expect(betragInWorten(2989.44)).toBe("zweitausendneunhundertneunundachtzig Euro und 44 Cent");
  });
});
