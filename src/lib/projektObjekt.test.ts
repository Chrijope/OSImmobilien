import { describe, expect, it } from "vitest";
import { abverkauf, kaufpreisEingaenge, margeJeEinheit, projektKosten } from "./projektObjekt";

describe("Projektsicht je Objekt", () => {
  const p = { ankaufpreis: 800_000, ankaufNebenkosten: 80_000, aufteilungskosten: 20_000, provisionProzent: 10 };

  it("verteilt die Kosten nach MEA und zieht die Provision ab", () => {
    expect(projektKosten(p)).toBe(900_000);
    const m = margeJeEinheit(p, [
      { id: "a", kaufpreis: 400_000, mea: 600, flaeche: 50 },
      { id: "b", kaufpreis: 300_000, mea: 400, flaeche: 50 },
    ]);
    expect(m.get("a")).toEqual({ kostenanteil: 540_000, provision: 40_000, marge: -180_000, margeProzent: -0.45 });
    expect(m.get("b")?.kostenanteil).toBe(360_000);
  });

  it("nimmt die Fläche, sobald einer Einheit die MEA fehlt, und ohne Kosten keine Marge", () => {
    const m = margeJeEinheit(p, [
      { id: "a", kaufpreis: 500_000, mea: 600, flaeche: 30 },
      { id: "b", kaufpreis: 500_000, mea: null, flaeche: 60 },
    ]);
    expect(m.get("a")?.kostenanteil).toBe(300_000);
    expect(margeJeEinheit({}, [{ id: "a", kaufpreis: 1, mea: 1, flaeche: 1 }]).size).toBe(0);
  });

  it("zählt den Abverkauf und die offenen Kaufpreise je Monat", () => {
    const a = abverkauf([
      { status: "verkauft", kaufpreis: 200_000, flaeche: 50 },
      { status: "reserviert", kaufpreis: 150_000, flaeche: 50 },
      { status: "frei", kaufpreis: 100_000, flaeche: 50 },
      { status: "frei", kaufpreis: 100_000, flaeche: 50 },
    ]);
    expect(a.quote).toBe(0.25);
    expect(a.verkauft).toEqual({ anzahl: 1, umsatz: 200_000, qmPreis: 4000 });
    expect(a.offen.umsatz).toBe(350_000);
    expect(kaufpreisEingaenge([
      { faellig: "2027-02-10", betrag: 100 }, { faellig: "2027-01-31", betrag: 50 },
      { faellig: "2027-02-01", betrag: 10 }, { faellig: "2027-03-01", betrag: 99, eingegangen: true }, { betrag: 5 },
    ])).toEqual([{ monat: "2027-01", betrag: 50, anzahl: 1 }, { monat: "2027-02", betrag: 110, anzahl: 2 }]);
  });
});
