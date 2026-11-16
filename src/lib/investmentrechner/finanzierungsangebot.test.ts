import { describe, expect, it } from "vitest";
import { angebotAlsEingabe, angebotAuslesen, bankName, deutscheZahl } from "./finanzierungsangebot";
import { berechneInvestment, standardEingabe } from "./rechenkern";
import { finanzierungLautAngebot } from "@/components/investmentrechner/Eingabebereiche";

/*
 * Ein echtes Konditionsangebot (Baufi24, 12.11.2026) als Text, ohne Kunde und
 * Anschrift. Seite 1 und 2 so, wie die Zeilen dort stehen; pdf.js liefert sie
 * ohne Umbrüche, das Auslesen dampft beides gleich ein.
 */
const SEITE_1 = `Angebot 41393226 zur Finanzierungsanfrage 104717974 Datum: 12.11.2026 Angebot gültig bis:
16.11.2026, 12:00 Uhr
Übersicht
1. Ihr Finanzierungsbedarf
Kaufpreis des Objekts 144.500,00 EUR
Kosten für Notar und Grundbucheintrag + 2.890,00 EUR
Grunderwerbsteuer + 9.392,50 EUR
Finanzierungsbedarf 156.782,00 EUR
2. Ihre Finanzierungsbausteine (Details: siehe Folgeseiten)
Effektiver Jahreszins
Teildarlehen Darlehensbetrag Sollzinsbindung Sollzinssatz
(PAngV)
Sparda Berlin 130.050,00 EUR 10 Jahre 4,66 % 4,80 %
Hanseatic Bank AVD
26.732,00 EUR 60 Monate 7,59 % 7,86 %
Nachrangdarlehen
Summe 156.782,00 EUR
3. Ihre Gesamtfinanzierung
1)
Vergleichszins 5,32 %
Monatliche Gesamtrate aller Finanzierungsbausteine nach Vollauszahlung 884,56 EUR`;

const SEITE_2 = `Ihre Finanzierungsbausteine: Details
Teildarlehen Sparda Berlin Hanseatic Bank AVD Nachrangdarlehen
Darlehensbetrag 130.050,00 EUR 26.732,00 EUR
Sollzinsbindung 10 Jahre 60 Monate
Sollzinssatz 4,66 % 7,59 %
Effektiver Jahreszins
4,80 % 7,86 %
(PAngV)
1)
Vergleichszins 4,80 % --
Rate 667,59 EUR 216,97 EUR
Zahlweise monatlich nachschüssig monatlich
Art der Tilgung annuitätisch annuitätisch
Tilgungssatz bzw. Sparrate 1,50 % 2,15 %
einmal jährlich bis zu insgesamt 6.502,50 EUR (5
Bis zu 100%, 26.732,00 EUR (siehe
Sondertilgungsmöglichkeit %) möglich (Mindestbetrag je Zahlung: 2.500,00
Zusatzvereinbarungen)
EUR)
Restschuld am Ende der 105.260,90 EUR (Tilgungsbeginn Dezember
23.250,53 EUR
Sollzinsbindung 2026 unterstellt)`;

describe("Finanzierungsangebot auslesen", () => {
  it("liest Bedarf, beide Darlehen und Gesamtrate", () => {
    const a = angebotAuslesen([SEITE_1, SEITE_2]);
    expect(a).not.toBeNull();
    if (!a) return;
    expect(a.datum).toBe("12.11.2026");
    expect(a.gueltigBis).toBe("16.11.2026");
    expect(a.kaufpreis).toBe(144500);
    expect(a.notarGrundbuch).toBe(2890);
    expect(a.grunderwerbsteuer).toBe(9392.5);
    expect(a.finanzierungsbedarf).toBe(156782);
    expect(a.gesamtrate).toBe(884.56);
    expect(a.darlehen).toHaveLength(2);
    const [bank, nachrang] = a.darlehen;
    expect(bank).toMatchObject({ betrag: 130050, zinsbindungJahre: 10, sollzins: 4.66, effektivzins: 4.8, tilgung: 1.5, rate: 667.59, restschuld: 105260.9, nachrang: false });
    expect(bankName(bank)).toBe("Sparda Berlin");
    expect(nachrang).toMatchObject({ betrag: 26732, zinsbindungJahre: 5, sollzins: 7.59, tilgung: 2.15, rate: 216.97, restschuld: 23250.53, nachrang: true });
    expect(bankName(nachrang)).toBe("Hanseatic Bank");
    expect(a.hinweise).toEqual([]);
  });

  it("liest auch den eingedampften Text, wie pdf.js ihn liefert", () => {
    const flach = [SEITE_1, SEITE_2].map((s) => s.replace(/\s+/g, " "));
    expect(angebotAuslesen(flach)?.darlehen.map((d) => d.betrag)).toEqual([130050, 26732]);
  });

  it("rechnet die Tilgung aus der Rate zurück, wenn sie fehlt", () => {
    const a = angebotAuslesen([SEITE_1, SEITE_2.replace(/Tilgungssatz bzw\. Sparrate 1,50 % 2,15 %/, "")]);
    expect(a?.darlehen.map((d) => d.tilgung)).toEqual([1.5, 2.15]);
    expect(a?.hinweise).toHaveLength(2);
  });

  it("gibt null ohne erkennbare Darlehenszeile", () => {
    expect(angebotAuslesen(["Exposé Musterstraße 12, Kaufpreis 200.000 €"])).toBeNull();
  });

  it("deutsche Zahlen", () => {
    expect(deutscheZahl("130.050,00")).toBe(130050);
    expect(deutscheZahl("4,66")).toBe(4.66);
  });
});

describe("Finanzierungsangebot übernehmen", () => {
  it("füllt Bankdarlehen und Nachrang und trifft Rate und Restschuld des Angebots", () => {
    const a = angebotAuslesen([SEITE_1, SEITE_2]);
    if (!a) throw new Error("nicht gelesen");
    const eingabe = { ...standardEingabe, purchasePrice: 144500, ...angebotAlsEingabe(a, { garagen: 1 }) };
    expect(eingabe).toMatchObject({ seniorInterestRate: 4.66, seniorRepaymentRate: 1.5, seniorFixedRateYears: 10, juniorFixedRateYears: 5 });
    expect(eingabe.ausfuehrlich).toEqual({ garagen: 1, bankBetrag: 130050, nachrangBetrag: 26732, nachrangZins: 0.0759, nachrangTilgung: 0.0215 });
    const f = finanzierungLautAngebot(eingabe, berechneInvestment(eingabe));
    expect(f).not.toBeNull();
    // Monatlich verrechnet wie die Bank: Rate auf den Cent, Restschuld bis auf Rundungscent.
    expect(Math.round((f?.rate ?? 0) * 100) / 100).toBe(884.56);
    expect(Math.abs((f?.restBank ?? 0) - 105260.9)).toBeLessThan(1);
    expect(Math.abs((f?.restNachrang ?? 0) - 23250.53)).toBeLessThan(1);
  });

  it("lässt alte Angebotsbeträge nicht stehen, wenn das neue Angebot keinen Nachrang hat", () => {
    const a = angebotAuslesen([SEITE_1, SEITE_2]);
    if (!a) throw new Error("nicht gelesen");
    const nurBank = { ...a, darlehen: a.darlehen.filter((d) => !d.nachrang) };
    const aus = angebotAlsEingabe(nurBank, { nachrangBetrag: 5000, nachrangZins: 0.07 }).ausfuehrlich;
    expect(aus).toEqual({ bankBetrag: 130050 });
  });
});
