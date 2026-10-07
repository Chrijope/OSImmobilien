/**
 * Der Rechner auf der Berater-Mikroseite.
 *
 * Er hing bis zum 17.09.2026 an denselben Abkürzungen wie die grosse
 * Ergebnisseite und zeigte deshalb dieselben falschen Zahlen, nur an einer
 * anderen Stelle. Diese Tests halten fest, was dort schiefging:
 *
 *   1  Die „frei verfügbare Liquidität“ kam aus einer Quote einer fremden
 *      Kalkulation und war immer POSITIV, obwohl dasselbe Modell eine
 *      monatliche Zuzahlung ergibt. Jetzt kommt sie aus den eigenen Cashflows
 *      und darf negativ sein.
 *   2  Die Zehnjahresersparnis war die Jahresersparnis mal einer gesetzten 5,
 *      weil die Sonderabschreibung nach § 7b EStG nach vier Jahren ausläuft.
 *      Jetzt ist sie die Summe der zehn einzeln gerechneten Jahre.
 *   3  Der Satz „Die gesparte Steuer verschwindet nicht in der Wohnung, sie
 *      landet bei dir“ war schlicht falsch.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AppleSteuerRechner from "./AppleSteuerRechner";
import { berechne, type SteuerEingaben } from "@/lib/steuerRechner";
import { SOLLZINS, TILGUNG_ANFANG } from "@/lib/finanzierung";

/* Die Vorbelegung der Oberfläche: 85.000 Euro, Klasse I, keine Kinder, kein
   Bundesland, keine Kirchensteuer, Erstinvestor, volles Hebelziel. */
const VORBELEGUNG: SteuerEingaben = {
  jahresbrutto: 85000,
  steuerklasse: "I",
  partnerBrutto: 0,
  kinder: 0,
  kirchensteuer: false,
  bundesland: undefined,
  bestehendeImmobilien: 0,
  hebelziel: "maximal",
  beschaeftigung: "angestellt",
};

const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  })
    .format(Math.round(n))
    .replace(/\s/g, " ");

function zeigeErgebnis() {
  render(<AppleSteuerRechner onOpenFunnel={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Steuerlast und Potenzial berechnen/ }));
  return berechne(VORBELEGUNG);
}

const seitentext = () => document.body.textContent?.replace(/\s/g, " ") ?? "";

describe("Der Rechner der Mikroseite", () => {
  it("zeigt das Ergebnis erst auf Klick und rechnet mit dem gemeinsamen Kern", () => {
    render(<AppleSteuerRechner onOpenFunnel={vi.fn()} />);
    expect(screen.getByText("Dein Ergebnis erscheint hier")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Steuerlast und Potenzial berechnen/ }));
    const r = berechne(VORBELEGUNG);
    expect(seitentext()).toContain(eur(r.ersparnisJahr));
    expect(seitentext()).toContain(eur(r.vorher.summe));
  });

  it("summiert die Zehnjahresersparnis aus dem Plan, statt sie mit fünf zu multiplizieren", () => {
    const r = zeigeErgebnis();
    const ausPlan = r.plan.reduce((a, z) => a + z.ersparnis, 0);
    expect(r.ersparnis10J).toBeCloseTo(ausPlan, 6);
    /* Der Neubau steht hier, und bei ihm läuft die Sonderabschreibung nach
       vier Jahren aus. Der Faktor liegt deshalb deutlich unter zehn, aber eben
       auch nicht bei genau fünf. */
    expect(r.klasse.sonder7b).toBe(true);
    const faktor = r.ersparnis10J / r.ersparnisJahr;
    expect(faktor).toBeGreaterThan(5);
    expect(faktor).toBeLessThan(6.5);
    expect(seitentext()).toContain(eur(r.ersparnis10J));
  });

  it("zeigt den Knick nach dem vierten Jahr mit Zahlen statt nur als Hinweis", () => {
    const r = zeigeErgebnis();
    expect(r.plan[4].ersparnis).toBeLessThan(r.plan[3].ersparnis * 0.75);
    expect(seitentext()).toContain(eur(r.plan[0].ersparnis));
    expect(seitentext()).toContain(eur(r.plan[4].ersparnis));
    expect(seitentext()).toMatch(/Sonderabschreibung nach § 7b/);
  });

  it("weist eine Zuzahlung als Zuzahlung aus und nennt sie kein freies Geld", () => {
    const r = zeigeErgebnis();
    const ausPlan = r.plan.reduce((a, z) => a + z.cashflowNachSteuer, 0);
    expect(r.freieLiquiditaet10J).toBeCloseTo(ausPlan, 6);
    expect(r.freieLiquiditaet10J).toBeLessThan(0);
    const text = seitentext();
    expect(text).toContain(eur(Math.abs(r.freieLiquiditaet10J)));
    expect(text).toMatch(/bleibt eine Zuzahlung von/);
    // Der alte Satz darf nicht wiederkommen.
    expect(text).not.toMatch(/Frei verfügbar bleiben etwa/);
    expect(text).not.toMatch(/sie landet bei dir/);
  });

  it("trennt Vermögensaufbau, Zuzahlung und Einsatz sichtbar voneinander", () => {
    const r = zeigeErgebnis();
    expect(r.anteilAmObjekt).toBeCloseTo(r.tilgung10J + r.wertsteigerung10J, 6);
    expect(r.vermoegenszuwachs).toBeCloseTo(
      r.anteilAmObjekt + r.freieLiquiditaet10J - r.eigenkapital,
      6,
    );
    const text = seitentext();
    expect(text).toContain(eur(r.anteilAmObjekt));
    expect(text).toContain(eur(r.eigenkapital));
    expect(text).toContain(eur(r.vermoegenszuwachs));
  });

  it("nennt die offene Restschuld, statt nur den getilgten Teil zu zeigen", () => {
    const r = zeigeErgebnis();
    expect(r.vermoegen.restschuld).toBeGreaterThan(0);
    expect(seitentext()).toContain(eur(r.vermoegen.restschuld));
  });

  it("legt Zins, Tilgung und die laufenden Kosten offen", () => {
    const r = zeigeErgebnis();
    expect(r.klasse.zins).toBe(SOLLZINS);
    const text = seitentext();
    expect(text).toMatch(/4 Prozent Sollzins/);
    expect(text).toMatch(/1,5 Prozent anfänglicher Tilgung/);
    expect(text).toContain(eur(r.plan[0].kosten));
    expect(text).toMatch(/Mietausfallwagnis/);
    expect(TILGUNG_ANFANG).toBe(0.015);
  });

  it("hält den Haftungshinweis sichtbar", () => {
    zeigeErgebnis();
    expect(seitentext()).toMatch(/Ersetzt keine individuelle Steuer- oder Anlageberatung/);
  });
});
