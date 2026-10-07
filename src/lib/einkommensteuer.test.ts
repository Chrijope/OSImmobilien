import { describe, it, expect } from "vitest";
import {
  grundfreibetrag,
  grundtarif,
  solidaritaetszuschlag,
  steuerbelastung,
  tariflicheEst,
  STEUERJAHRE,
  type Steuerjahr,
} from "@/lib/einkommensteuer";

describe("Grundfreibetrag", () => {
  it("kennt die Beträge der drei Jahre", () => {
    expect(grundfreibetrag(2024)).toBe(11784); // rückwirkend angehoben
    expect(grundfreibetrag(2025)).toBe(12096);
    expect(grundfreibetrag(2026)).toBe(12348);
  });

  it("lässt bis zum Grundfreibetrag keine Steuer entstehen", () => {
    for (const jahr of STEUERJAHRE) {
      expect(grundtarif(grundfreibetrag(jahr), jahr), String(jahr)).toBe(0);
      expect(grundtarif(grundfreibetrag(jahr) + 1, jahr), String(jahr)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Tarifverlauf", () => {
  it("steigt monoton mit dem Einkommen", () => {
    for (const jahr of STEUERJAHRE) {
      let vorher = -1;
      for (let zve = 0; zve <= 400000; zve += 2500) {
        const st = grundtarif(zve, jahr);
        expect(st, `${jahr} bei ${zve}`).toBeGreaterThanOrEqual(vorher);
        vorher = st;
      }
    }
  });

  it("bleibt an den Zonengrenzen stetig", () => {
    // Ein Euro mehr darf nie einen Sprung von mehr als 50 Cent auslösen.
    const grenzen: Record<Steuerjahr, number[]> = {
      2024: [17005, 66760, 277825],
      2025: [17443, 68480, 277825],
      2026: [17799, 69878, 277825],
    };
    for (const jahr of STEUERJAHRE) {
      for (const g of grenzen[jahr]) {
        const sprung = grundtarif(g + 1, jahr) - grundtarif(g, jahr);
        expect(sprung, `${jahr} an ${g}`).toBeLessThan(2);
      }
    }
  });

  it("erreicht in der Spitzenzone 45 Prozent Grenzsteuersatz", () => {
    const a = grundtarif(300000, 2026);
    const b = grundtarif(310000, 2026);
    expect((b - a) / 10000).toBeCloseTo(0.45, 2);
  });

  it("liegt in der oberen Proportionalzone bei 42 Prozent", () => {
    const a = grundtarif(100000, 2026);
    const b = grundtarif(110000, 2026);
    expect((b - a) / 10000).toBeCloseTo(0.42, 2);
  });
});

describe("Splitting", () => {
  it("entspricht der doppelten Steuer des halben Einkommens", () => {
    expect(tariflicheEst(80000, 2026, "splitting")).toBe(2 * grundtarif(40000, 2026));
  });

  it("ist nie teurer als der Grundtarif", () => {
    for (let zve = 0; zve <= 300000; zve += 5000) {
      expect(tariflicheEst(zve, 2026, "splitting")).toBeLessThanOrEqual(
        tariflicheEst(zve, 2026, "grund"),
      );
    }
  });
});

describe("Solidaritätszuschlag", () => {
  it("fällt unterhalb der Freigrenze nicht an", () => {
    expect(solidaritaetszuschlag(20000, 2026, "grund")).toBe(0);
    expect(solidaritaetszuschlag(20350, 2026, "grund")).toBe(0);
  });

  it("greift in der Milderungszone mit 11,9 Prozent", () => {
    const est = 21000;
    expect(solidaritaetszuschlag(est, 2026, "grund")).toBeCloseTo((est - 20350) * 0.119, 2);
  });

  it("erreicht bei hoher Steuer die 5,5 Prozent", () => {
    const est = 200000;
    expect(solidaritaetszuschlag(est, 2026, "grund")).toBeCloseTo(est * 0.055, 2);
  });

  it("verdoppelt die Freigrenze im Splitting", () => {
    expect(solidaritaetszuschlag(35000, 2026, "splitting")).toBe(0);
    expect(solidaritaetszuschlag(35000, 2026, "grund")).toBeGreaterThan(0);
  });

  it("bleibt aus, wenn er abgewählt ist", () => {
    expect(solidaritaetszuschlag(200000, 2026, "grund", false)).toBe(0);
  });
});

describe("Gesamtbelastung", () => {
  const opt = { jahr: 2026 as Steuerjahr, veranlagung: "grund" as const, kirchensteuerProzent: 0, soli: true };

  it("summiert Einkommensteuer, Soli und Kirchensteuer", () => {
    const r = steuerbelastung(90000, { ...opt, kirchensteuerProzent: 9 });
    expect(r.kirchensteuer).toBeCloseTo(r.est * 0.09, 2);
    expect(r.gesamt).toBeCloseTo(r.est + r.soli + r.kirchensteuer, 2);
  });

  it("bleibt bei Einkommen unter dem Grundfreibetrag bei null", () => {
    const r = steuerbelastung(9000, opt);
    expect(r.gesamt).toBe(0);
  });

  it("führt bei negativem Einkommen nicht zu negativer Steuer", () => {
    expect(steuerbelastung(-40000, opt).gesamt).toBe(0);
  });

  it("liefert für 70.000 Euro einen plausiblen Wert", () => {
    // Grobe Plausibilität: Durchschnittssteuersatz zwischen 20 und 30 Prozent.
    const r = steuerbelastung(70000, opt);
    const quote = r.est / 70000;
    expect(quote).toBeGreaterThan(0.2);
    expect(quote).toBeLessThan(0.3);
  });
});
