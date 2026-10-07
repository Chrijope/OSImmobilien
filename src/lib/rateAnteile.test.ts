import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  RATE_EINGANG,
  mieterbeitrag,
  rateAnteile,
  rateRechenweg,
  type RateEingang,
} from "@/lib/rateAnteile";

/**
 * Wer trägt die Rate? Die Folie muss dieselbe Antwort geben wie die
 * Musterrechnung zwei Stationen später.
 *
 * Der Fehler, den diese Tests verhindern: Auf der Folie standen 62, 24 und 14
 * Prozent, nachrechnen liessen sich aus der Bestandsrechnung aber 78, 8 und
 * 14. Der Partner lernte eine Zahl und zeigte im Kundengespräch eine andere.
 *
 * Deshalb prüfen die Tests drei Dinge: dass die Anteile aufgehen, dass sie
 * genau 100 Prozent ergeben, und dass die Ausgangswerte hier dieselben sind
 * wie in der Musterrechnung der jeweiligen Präsentation. Der letzte Teil liest
 * den Quelltext, so wie es `objektauswahlEineStelle.test.ts` schon tut, denn
 * die Musterrechnungen stehen in den Seitendateien und werden nicht exportiert.
 */

const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");

const moreimmo = lies("src/pages/BeratungspraesentationHV.tsx");
// Die Musterrechnungen stehen seit dem Sprachwechsel als Texte je Sprache hier.
const moreimmoTexte = lies("src/lib/beratungspraesentationTexte.ts");
const ersteFassung = lies("src/pages/Beratungspraesentation.tsx");
const sprechskripte = lies("src/lib/beratungSprechskripte.ts");

const alleEingaenge = Object.entries(RATE_EINGANG) as [string, RateEingang][];

describe("Die drei Anteile gehen auf", () => {
  it.each(alleEingaenge)("%s: die drei Beträge ergeben genau die Rate", (_id, e) => {
    expect(mieterbeitrag(e) + e.entlastungAbJahrZwei + e.eigenbeitragAbJahrZwei).toBe(e.rate);
  });

  it.each(alleEingaenge)("%s: die drei Prozentwerte ergeben genau 100", (_id, e) => {
    const a = rateAnteile(e);
    expect(a.mieter + a.finanzamt + a.kunde).toBe(100);
  });

  it.each(alleEingaenge)("%s: kein Anteil ist negativ oder über 100", (_id, e) => {
    const a = rateAnteile(e);
    for (const wert of [a.mieter, a.finanzamt, a.kunde]) {
      expect(wert).toBeGreaterThanOrEqual(0);
      expect(wert).toBeLessThanOrEqual(100);
    }
  });

  // Der Kundenanteil ist der Rest, damit die Summe stimmt. Die Rundung darf
  // ihn deshalb um höchstens einen Prozentpunkt verschieben, sonst stimmt die
  // grosse Zahl auf der Folie nicht mehr mit dem Betrag darunter überein.
  it.each(alleEingaenge)("%s: der Kundenanteil bleibt am echten Wert", (_id, e) => {
    const echt = (e.eigenbeitragAbJahrZwei / e.rate) * 100;
    expect(Math.abs(rateAnteile(e).kunde - echt)).toBeLessThanOrEqual(1);
  });
});

describe("Die Anteile der einzelnen Musterwohnungen", () => {
  it("sanierter Bestand: 78, 8 und 14 Prozent", () => {
    expect(rateAnteile(RATE_EINGANG.bestand)).toEqual({ mieter: 78, finanzamt: 8, kunde: 14 });
  });

  it("WG und Co-Living: 81, 9 und 10 Prozent", () => {
    expect(rateAnteile(RATE_EINGANG.wg)).toEqual({ mieter: 81, finanzamt: 9, kunde: 10 });
  });

  it("Beispielwohnung Memmingen: 56, 23 und 21 Prozent", () => {
    expect(rateAnteile(RATE_EINGANG.memmingen)).toEqual({ mieter: 56, finanzamt: 23, kunde: 21 });
  });

  it("die alten Folienwerte 62, 24 und 14 lassen sich aus keiner Rechnung herleiten", () => {
    for (const [, e] of alleEingaenge) {
      expect(rateAnteile(e)).not.toEqual({ mieter: 62, finanzamt: 24, kunde: 14 });
    }
  });
});

describe("Die Musterrechnungen der Präsentationen tragen dieselben Zahlen", () => {
  it("MOREImmo, sanierter Bestand: Miete, Rate und nicht umlagefähige Kosten", () => {
    expect(moreimmoTexte).toContain('{ pos: "Kaltmiete", betrag: "+1.400 €" }');
    expect(moreimmoTexte).toContain('{ pos: "Zins und Tilgung", betrag: "−1.604 €" }');
    expect(moreimmoTexte).toContain('{ pos: "Nicht umlagefähige Kosten", betrag: "−150 €" }');
  });

  it("MOREImmo, sanierter Bestand: Entlastung und Eigenbeitrag ab dem zweiten Jahr", () => {
    expect(moreimmoTexte).toContain('entlastungMonat: "126 €"');
    expect(moreimmoTexte).toContain('beitragMonat: "−228 €"');
  });

  it("MOREImmo, WG: Miete, Rate, Kosten, Entlastung und Eigenbeitrag", () => {
    expect(moreimmoTexte).toContain('{ pos: "Kaltmiete", betrag: "+1.600 €" }');
    expect(moreimmoTexte).toContain('{ pos: "Zins und Tilgung", betrag: "−1.895 €" }');
    expect(moreimmoTexte).toContain('{ pos: "Nicht umlagefähige Kosten", betrag: "−73 €" }');
    expect(moreimmoTexte).toContain('entlastungMonat: "168 €"');
    expect(moreimmoTexte).toContain('beitragMonat: "−200 €"');
  });

  it("erste Fassung, Memmingen: Rate, Miete, Hausgeld, Steuervorteil, Eigenaufwand", () => {
    for (const wert of [660, 429, 62, 152, 141]) {
      expect(ersteFassung).toContain(`end={${wert}}`);
    }
  });
});

describe("Die Folien rechnen, statt Zahlen zu tippen", () => {
  it("die Präsentationen speisen ihre Anteile aus dem Modul", () => {
    expect(moreimmo).toContain("RATE_ANTEILE_BESTAND");
    expect(moreimmo).toContain('from "@/lib/rateAnteile"');
    expect(ersteFassung).toContain("ANTEILE_MEMMINGEN");
    expect(ersteFassung).toContain('from "@/lib/rateAnteile"');
  });

  it("die erste Fassung nennt nicht mehr die alten 75 und 12,5 Prozent", () => {
    expect(ersteFassung).not.toContain("Mieter 75 %");
    expect(ersteFassung).not.toContain("Finanzamt ~12,5 %");
  });

  it("in keiner Folie steht die alte Aufteilung noch als feste Zahl", () => {
    expect(moreimmo).not.toContain('breite: "62%"');
    expect(moreimmo).not.toContain('breite: "24%"');
    expect(moreimmo).not.toContain('wert: 62,');
    expect(moreimmo).not.toContain('wert: 24,');
    expect(moreimmo).not.toContain('wert: "62 %"');
    expect(moreimmo).not.toContain('wert: "24 %"');
  });

  it("das Sprechskript nennt dieselben Zahlen wie die Folie", () => {
    // Das Skript gehört zur MOREImmo-Präsentation, also zum sanierten Bestand.
    expect(sprechskripte).not.toContain("Der Mieter 62 Prozent");
    expect(sprechskripte).toContain("das sind 78 Prozent");
    expect(sprechskripte).toContain("das sind 8 Prozent");
    expect(sprechskripte).toContain("also 14 Prozent");
  });
});

describe("Der Rechenweg auf der Folie", () => {
  it("nennt die Beträge, aus denen die Prozente entstehen", () => {
    const satz = rateRechenweg(RATE_EINGANG.bestand);
    expect(satz).toContain("1.400 €");
    expect(satz).toContain("150 €");
    expect(satz).toContain("1.250 €");
    expect(satz).toContain("126 €");
    expect(satz).toContain("228 €");
    expect(satz).toContain("1.604 €");
  });
});
