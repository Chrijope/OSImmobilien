/**
 * Waechter ueber die Bewerberseiten in Liquid Glass (`lp-theme-liquid.css`).
 *
 * Dieselben Grenzen wie fuer die Berater-Mikroseite in `design-liquid.test.ts`.
 * Dazu zwei Punkte, die nur hier gelten:
 *   * Die Regeln duerfen die Mikroseite nicht erreichen, obwohl beide
 *     `.lp-theme` tragen. Abgegrenzt wird ueber `.bewerber-seite`.
 *   * Die Schrift der Seiten steht als feste Farbe im Code. Der Test rechnet
 *     jede davon auf der Glaskarte im unguenstigsten Fall gegen 4,5:1.
 */
import { describe, expect, it } from "vitest";

import {
  ausHex,
  ausToken,
  kontrast,
  lies,
  mische,
  ohneKommentare,
  regeln,
  saettige,
  stellenDesHellenGrundes,
  teile,
  token,
} from "./glasTesthilfe";

const regelwerk = ohneKommentare(lies("lp-theme-liquid.css"));
const bewerber = regeln(regelwerk);
const schichtRegelwerk = ohneKommentare(lies("design-liquid.css"));
const schicht = regeln(schichtRegelwerk);

const ANKER = '[data-glas="liquid"]:not(.dark) .lp-theme.bewerber-seite';
const SEITEN = [
  "BewerberFormularPublic",
  "BewerberKennenlernen",
  "BewerberKooperationsgespraech",
  "BewerberSeite",
  "BewerberKeinInteresse",
];

describe("Liquid Glass auf den Bewerberseiten: Einbindung", () => {
  it.each(SEITEN)("%s laedt die Datei und markiert Huelle und Karte", (seite) => {
    const inhalt = lies(`../pages/${seite}.tsx`);
    expect(inhalt).toContain('import "@/styles/lp-theme-liquid.css"');
    // Die Huelle: `.lp-theme` mit der eigenen Klasse und dem Haken fuer die
    // durchsichtige Vollbild-Huelle der Schicht.
    expect(inhalt).toMatch(/<div data-lg="seite" className="lp-theme bewerber-seite /);
    expect(inhalt).toMatch(/className="bewerber-karte /);
  });

  it("laesst die Berater-Mikroseite aussen vor", () => {
    for (const datei of ["../components/landing/BeraterMicrositeContent.tsx", "../pages/BeraterMicroseite.tsx"]) {
      const inhalt = lies(datei);
      expect(inhalt, datei).not.toContain("bewerber-seite");
      expect(inhalt, datei).not.toContain("lp-theme-liquid.css");
    }
  });
});

describe("Liquid Glass auf den Bewerberseiten: Grenzen", () => {
  it("haengt jede Regel an Liquid Glass, hell, und an die Bewerberseite, nie an .lp-theme allein", () => {
    expect(bewerber.length).toBeGreaterThan(0);
    const ohneAnker = bewerber.filter((r) => teile(r.selektor).some((teil) => !teil.startsWith(ANKER)));
    expect(ohneAnker.map((r) => r.selektor)).toEqual([]);
    expect(regelwerk).not.toContain("berater-mikroseite");
  });

  it("wirkt nur auf dem Bildschirm", () => {
    const ohneScreen = bewerber.filter((r) => !r.rahmen.some((k) => k.startsWith("@media") && k.includes("screen")));
    expect(ohneScreen.map((r) => r.selektor)).toEqual([]);
  });

  it("neigt keine Kachel", () => {
    expect(regelwerk).not.toMatch(/rotate[XY]|perspective\(|--rx|--ry|data-lg-neigung/);
  });

  it("zeichnet nur ueber die Tokens der Schicht weich", () => {
    const weich = bewerber.filter((r) => /backdrop-filter:(?!\s*none)/.test(r.inhalt));
    expect(weich.length).toBeGreaterThan(0);
    for (const r of weich) {
      expect(r.inhalt, r.selektor).toMatch(/(^|;)\s*backdrop-filter:\s*var\(--lg-filter-(karte|leiste|schwebend)\)/);
    }
  });

  it("bringt keine eigene Farbe mit", () => {
    // In den Selektoren stehen die Inline-Farben der Seiten, die hier gemeint
    // sind. Gezaehlt werden nur die Werte.
    const werte = bewerber.map((r) => r.inhalt).join("\n");
    expect(werte).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(werte).not.toMatch(/rgba?\(/);
    const fest = [...werte.matchAll(/hsl\((\d[^)]*)\)/g)].map((m) => m[0]);
    expect(fest.filter((wert) => !schichtRegelwerk.includes(wert))).toEqual([]);
  });

  it("setzt !important nur gegen Inline-Stile und das !important von .lp-theme", () => {
    const mit = bewerber.filter((r) => r.inhalt.includes("!important"));
    for (const r of mit) expect(r.selektor, r.selektor).toMatch(/\.bewerber-karte($| :is\(\s*\[style)/);
  });

  it("legt die Regel fuer die durchsichtige Huelle nicht ein zweites Mal an", () => {
    // Die steht in der Schicht (`data-lg="seite"`), nicht hier.
    expect(regelwerk).not.toContain("data-lg");
    expect(bewerber.find((r) => r.selektor === ANKER)?.inhalt ?? "").not.toMatch(/background/);
  });
});

describe("Liquid Glass auf den Bewerberseiten: Lesbarkeit", () => {
  const karte = bewerber.find((r) => r.selektor === `${ANKER} .bewerber-karte`)!;
  const tokens = schicht.find((r) => r.selektor === '[data-glas="liquid"]' && r.rahmen.join() === "@media screen")!.inhalt;
  const handy = schicht.find((r) => r.selektor === '[data-glas="liquid"]' && r.rahmen.some((k) => k.includes("hover: none")))!.inhalt;
  const grund = stellenDesHellenGrundes(schicht);
  const glas = ausToken(token(tokens, "lg-glas"));

  it("nimmt fuer die Karte die dichte Stufe und das Karten-Token", () => {
    expect(karte.inhalt).toMatch(/background-color:\s*hsl\(var\(--lg-glas\) \/ var\(--lg-deckkraft-schwebend\)\)/);
    expect(karte.inhalt).toMatch(/backdrop-filter:\s*var\(--lg-filter-karte\)/);
  });

  it("die dichte Stufe gilt auch am Handy unveraendert", () => {
    // Am Handy aendert die Schicht nur die Kartenstufe, nicht die schwebende.
    expect(() => token(handy, "lg-deckkraft-schwebend")).toThrow();
  });

  /*
   * Die Schriftfarben, die auf der Karte stehen (Stand 24.09.2026, aus den
   * fuenf Seiten und `bewerberformular/FragebogenBausteine.tsx`). Nicht dabei:
   * Weiss auf den blauen Knoepfen und das Grau ausgegrauter Kalendertage.
   */
  const SCHRIFT = ["#0F1621", "#1D1D1F", "#3A3A3F", "#4B5057", "#5A5F66", "#6E6E73", "#0A6EDB", "#0A5BB5", "#B23A2B", "#1E7A45", "#6B5636", "#3F5A4A", "#B91C1C", "#991B1B", "#C62828", "#DC2626"];

  it.each([
    ["am Schreibtisch, mit Weichzeichnung", true],
    ["am Handy, ohne Weichzeichnung", false],
  ])("haelt jede Schrift auf der Karte bei 4,5:1, %s", (_titel, weich) => {
    const deckkraft = Number(token(tokens, "lg-deckkraft-schwebend"));
    const saettigung = weich ? Number(token(tokens, "lg-filter-karte").match(/saturate\((\d+)%\)/)![1]) / 100 : 1;
    const flaechen = grund.map((c) => mische(saettige(c, saettigung), glas, deckkraft));
    for (const farbe of SCHRIFT) {
      const min = Math.min(...flaechen.map((f) => kontrast(ausHex(farbe), f)));
      expect(min, `${farbe} faellt auf ${min.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("gibt den zu hellen Toenen die Farben der Schicht", () => {
    // #8A8F98 und #9AA0A8 wie der Browser sie ins Attribut schreibt, dazu #A9640F.
    const grau = bewerber.find((r) => r.selektor.includes("rgb(138, 143, 152)"));
    expect(grau?.selektor).toContain("rgb(154, 160, 168)");
    expect(grau?.inhalt).toMatch(/color:\s*hsl\(var\(--muted-foreground\)\)/);
    const orange = bewerber.find((r) => r.selektor.includes("rgb(169, 100, 15)"));
    expect(orange?.inhalt).toMatch(/color:\s*hsl\(var\(--warning\)\)/);
  });

  it("holt die dunklere Grauschrift der Schicht zurueck, statt sie zu wiederholen", () => {
    expect(bewerber.find((r) => r.selektor === ANKER)?.inhalt).toMatch(/--muted-foreground:\s*inherit/);
  });
});
