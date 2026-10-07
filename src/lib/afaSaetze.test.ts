import { describe, it, expect } from "vitest";
import {
  ANSCHAFFUNGSNAH_GRENZE,
  SONDER_7B_BAUKOSTEN_MAX,
  SONDER_7B_BEMESSUNG_MAX,
  SONDER_7B_JAHRE,
  afaSatzMitUntergrenze,
  anschaffungsnaheHerstellungskosten,
  beweglichVerlauf,
  degressivMoeglich,
  degressiverVerlauf,
  denkmalVerlauf,
  linearerAfaSatz,
  sonderabschreibung7b,
} from "@/lib/afaSaetze";

describe("Linearer AfA-Satz nach § 7 Abs. 4 EStG", () => {
  it("staffelt nach Fertigstellung", () => {
    expect(linearerAfaSatz(1910).satz).toBe(2.5);
    expect(linearerAfaSatz(1924).satz).toBe(2.5);
    expect(linearerAfaSatz(1925).satz).toBe(2);
    expect(linearerAfaSatz(2022).satz).toBe(2);
    expect(linearerAfaSatz(2023).satz).toBe(3);
    expect(linearerAfaSatz(2026).satz).toBe(3);
  });

  it("nimmt ohne Baujahr den Regelsatz", () => {
    expect(linearerAfaSatz(null).satz).toBe(2);
    expect(linearerAfaSatz(0).satz).toBe(2);
  });

  it("gibt für Betriebsgebäude drei Prozent", () => {
    expect(linearerAfaSatz(1990, "betrieb").satz).toBe(3);
  });

  it("nennt zu jedem Satz eine Fundstelle", () => {
    for (const jahr of [1900, 1950, 2024]) {
      expect(linearerAfaSatz(jahr).paragraf).toContain("§ 7");
    }
  });
});

describe("Untergrenze", () => {
  it("hebt einen zu niedrigen abgeleiteten Satz auf den gesetzlichen an", () => {
    const r = afaSatzMitUntergrenze(0.89, 2022);
    expect(r.satz).toBe(2);
    expect(r.untergrenzeGreift).toBe(true);
    expect(r.nachweisNoetig).toBe(false);
  });

  it("hebt beim Neubau auf drei Prozent an", () => {
    expect(afaSatzMitUntergrenze(1.05, 2024).satz).toBe(3);
  });

  it("lässt einen höheren Satz stehen, verlangt dafür aber den Nachweis", () => {
    const r = afaSatzMitUntergrenze(4.35, 1969);
    expect(r.satz).toBeCloseTo(4.35, 6);
    expect(r.untergrenzeGreift).toBe(false);
    expect(r.nachweisNoetig).toBe(true);
  });

  it("verlangt bei genau dem gesetzlichen Satz keinen Nachweis", () => {
    const r = afaSatzMitUntergrenze(2, 1990);
    expect(r.nachweisNoetig).toBe(false);
  });
});

describe("Degressive AfA nach § 7 Abs. 5a EStG", () => {
  it("erkennt das Baubeginn-Fenster", () => {
    expect(degressivMoeglich("2023-09-30")).toBe(false);
    expect(degressivMoeglich("2023-10-01")).toBe(true);
    expect(degressivMoeglich("2027-05-01")).toBe(true);
    expect(degressivMoeglich("2029-09-30")).toBe(true);
    expect(degressivMoeglich("2029-10-01")).toBe(false);
    expect(degressivMoeglich(null)).toBe(false);
    expect(degressivMoeglich("Unsinn")).toBe(false);
  });

  it("schreibt im ersten Jahr fünf Prozent der Bemessungsgrundlage ab", () => {
    const v = degressiverVerlauf(300000, 20, 3);
    expect(v[0].betrag).toBeCloseTo(15000, 2);
  });

  it("beginnt höher als die lineare AfA", () => {
    const v = degressiverVerlauf(300000, 20, 3);
    expect(v[0].betrag).toBeGreaterThan(300000 * 0.03);
  });

  it("wechselt genau einmal zur linearen AfA", () => {
    const v = degressiverVerlauf(300000, 40, 3);
    expect(v.filter((j) => j.gewechselt)).toHaveLength(1);
  });

  it("senkt den Restbuchwert monoton und nie unter null", () => {
    const v = degressiverVerlauf(300000, 40, 3);
    for (let i = 1; i < v.length; i++) {
      expect(v[i].restbuchwert).toBeLessThanOrEqual(v[i - 1].restbuchwert);
    }
    expect(v[v.length - 1].restbuchwert).toBeGreaterThanOrEqual(0);
  });

  it("schreibt nie mehr ab als vorhanden", () => {
    const v = degressiverVerlauf(100000, 60, 3);
    const summe = v.reduce((s, j) => s + j.betrag, 0);
    expect(summe).toBeLessThanOrEqual(100000 + 0.01);
  });
});

describe("Sonderabschreibung § 7b EStG", () => {
  it("rechnet innerhalb beider Grenzen fünf Prozent über vier Jahre", () => {
    const r = sonderabschreibung7b(240000, 80); // 3.000 Euro je m²
    expect(r.moeglich).toBe(true);
    expect(r.bemessungsgrundlage).toBe(240000);
    expect(r.betragProJahr).toBeCloseTo(12000, 2);
    expect(r.summe).toBeCloseTo(12000 * SONDER_7B_JAHRE, 2);
  });

  it("kürzt die Bemessungsgrundlage auf 4.000 Euro je Quadratmeter", () => {
    const r = sonderabschreibung7b(80 * 4500, 80);
    expect(r.moeglich).toBe(true);
    expect(r.bemessungsgrundlage).toBe(80 * SONDER_7B_BEMESSUNG_MAX);
  });

  it("lässt die Förderung über der Baukostenobergrenze ganz entfallen", () => {
    const r = sonderabschreibung7b(80 * (SONDER_7B_BAUKOSTEN_MAX + 1), 80);
    expect(r.moeglich).toBe(false);
    expect(r.betragProJahr).toBe(0);
    expect(r.hinweis).toContain("entfällt");
  });

  it("braucht eine Wohnfläche", () => {
    expect(sonderabschreibung7b(300000, 0).moeglich).toBe(false);
  });
});

describe("Denkmal-AfA", () => {
  it("schreibt vermietet über zwölf Jahre auf hundert Prozent ab", () => {
    const v = denkmalVerlauf(200000, "vermietet");
    expect(v).toHaveLength(12);
    expect(v.slice(0, 8).every((j) => Math.abs(j.betrag - 200000 * 0.09) < 0.01)).toBe(true);
    expect(v.slice(8).every((j) => Math.abs(j.betrag - 200000 * 0.07) < 0.01)).toBe(true);
    expect(v.reduce((s, j) => s + j.betrag, 0)).toBeCloseTo(200000, 2);
  });

  it("schreibt eigengenutzt über zehn Jahre auf neunzig Prozent ab", () => {
    const v = denkmalVerlauf(200000, "eigengenutzt");
    expect(v).toHaveLength(10);
    expect(v.reduce((s, j) => s + j.betrag, 0)).toBeCloseTo(200000 * 0.9, 2);
  });
});

describe("Anschaffungsnahe Herstellungskosten", () => {
  it("zieht die Grenze bei fünfzehn Prozent der Gebäudekosten", () => {
    const r = anschaffungsnaheHerstellungskosten(240000, 0);
    expect(r.grenze).toBeCloseTo(240000 * ANSCHAFFUNGSNAH_GRENZE, 2);
  });

  it("meldet eine Überschreitung", () => {
    const r = anschaffungsnaheHerstellungskosten(240000, 40000);
    expect(r.ueberschritten).toBe(true);
    expect(r.abstand).toBeCloseTo(4000, 2);
  });

  it("bleibt darunter unauffällig", () => {
    const r = anschaffungsnaheHerstellungskosten(240000, 20000);
    expect(r.ueberschritten).toBe(false);
    expect(r.auslastung).toBeLessThan(1);
  });

  it("meldet ohne Gebäudekosten keine Überschreitung", () => {
    expect(anschaffungsnaheHerstellungskosten(0, 50000).ueberschritten).toBe(false);
  });
});

describe("Bewegliche Wirtschaftsgüter", () => {
  it("verteilt linear über die Nutzungsdauer", () => {
    const v = beweglichVerlauf(10000, 10);
    expect(v).toHaveLength(10);
    expect(v[0].betrag).toBeCloseTo(1000, 6);
    expect(v[9].restbuchwert).toBeCloseTo(0, 6);
  });
});
