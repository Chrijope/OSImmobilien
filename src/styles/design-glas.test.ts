/**
 * Waechter ueber der Glas-Schicht.
 *
 * Dieselbe Aufgabe wie `design-neu.test.ts`, aber mit einer zusaetzlichen
 * Regel, die es dort nicht gibt und die hier die wichtigste ist: Wo
 * `backdrop-filter` stehen darf.
 *
 * Der Grund ist nicht Geschmack, sondern Geschwindigkeit. Der Browser muss
 * fuer jede weichgezeichnete Flaeche alles darunter noch einmal zeichnen, bei
 * jedem Bildaufbau. Eine Seitenleiste gibt es einmal, eine Karte hundertmal.
 * Wer die Weichzeichnung auf `[data-ui="card"]` setzt, merkt davon auf dem
 * eigenen Rechner nichts und macht das Scrollen in einer langen Kontaktliste
 * unbrauchbar.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "design-glas.css"), "utf8");

/**
 * Die Datei ohne Kommentare.
 *
 * Noetig, weil in den Kommentaren absichtlich steht, was NICHT im Code stehen
 * darf. Ohne diesen Schnitt findet ein Test die Erklaerung des Fehlers und
 * haelt sie fuer den Fehler.
 */
const regelwerk = css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Alle Selektoren der Datei, Kommentare entfernt. */
function selektoren(): string[] {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...ohneKommentare.matchAll(/(^|\})([^{}@]+)\{/g)]
    .map((m) => m[2].trim())
    .filter((s) => s.length > 0 && !s.startsWith("@"));
}

describe("Die Glas-Schicht bleibt abschaltbar", () => {
  it("haengt jede Regel an das Merkmal", () => {
    /*
     * Der ganze Zweck der Schicht: `data-glas` in index.html entfernen, und
     * das CRM sieht wieder aus wie vorher. Eine einzige Regel ohne diesen
     * Anker macht die Umstellung unumkehrbar.
     */
    const ohneAnker = selektoren().filter((s) =>
      s.split(",").some((teil) => !teil.includes('[data-glas="an"]')),
    );
    expect(ohneAnker, `Ohne Anker:\n${ohneAnker.join("\n")}`).toEqual([]);
  });

  it("fasst die erste Schicht nicht an", () => {
    // Farben, Radien und Schatten bleiben in design-neu.css. Wer sie hier
    // ueberschreibt, hat zwei Wahrheiten ueber dieselbe Farbe.
    expect(css).not.toContain('[data-design="neu"]');
    expect(css).not.toMatch(/--(background|foreground|card|primary|border):/);
  });

  it("kommt ohne !important aus", () => {
    expect(css).not.toContain("!important");
  });
});

describe("Die Leistungsregel", () => {
  /** Die Flaechen, die weichgezeichnet werden duerfen, mit Begruendung. */
  const ERLAUBT = [
    '[data-sidebar="sidebar"]', // einmal je Seite
    "header.sticky", // einmal je Seite
    '[role="dialog"]', // selten, liegt ueber allem
    '[role="menu"]', // desgleichen
    "[data-radix-popper-content-wrapper]", // desgleichen
    "table thead tr", // einmal je Tabelle, wandert beim Scrollen ueber die Zeilen
  ];

  it("zeichnet nur weich, was es wenige Male auf dem Schirm gibt", () => {
    const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    // Jeder Block, der backdrop-filter setzt, mit seinem Selektor davor.
    const treffer = [...ohneKommentare.matchAll(/(^|\})([^{}@]+)\{([^}]*)\}/g)]
      .filter((m) => /backdrop-filter:(?!\s*none)/.test(m[3]))
      .map((m) => m[2].trim());

    const unerlaubt = treffer.filter(
      (sel) => !ERLAUBT.some((gut) => sel.includes(gut)),
    );
    expect(
      unerlaubt,
      `Weichzeichnung an einer Stelle, die oft vorkommt:\n${unerlaubt.join("\n")}`,
    ).toEqual([]);
  });

  it("laesst Karten ausdruecklich ohne Weichzeichnung", () => {
    /*
     * Die teuerste Verwechslung. Auf einem Dashboard stehen zwanzig Karten
     * gleichzeitig, in einer Liste hundert.
     */
    const kartenBloecke = [...css.matchAll(/\[data-ui="card"\][^{]*\{([^}]*)\}/g)]
      .map((m) => m[1]);
    expect(kartenBloecke.length).toBeGreaterThan(0);
    for (const block of kartenBloecke) {
      expect(block, "Karten duerfen keine Weichzeichnung tragen").not.toMatch(
        // Der Leerraum steht bewusst innerhalb der Vorausschau: Stuende er
        // davor, matchte der Ausdruck auch "backdrop-filter: none", weil \s*
        // dann null Zeichen nimmt und die Vorausschau am Leerzeichen prueft.
        /backdrop-filter:(?!\s*none)/,
      );
    }
  });

  it("laesst Tabellenzeilen in Ruhe", () => {
    // Nur der Kopf ist Glas. Gelesen wird in den Zeilen.
    expect(css).not.toMatch(/table tbody tr[^{]*\{[^}]*backdrop-filter/);
  });
});

describe("Die Tapete liegt hinter dem Inhalt", () => {
  it("haengt am Element und nicht an einem Pseudoelement", () => {
    /*
     * Der Fehler vom 14.09.2026, der auf dem Dashboard die halbe Seite
     * verschluckt hat.
     *
     * Die Tapete war ein `body::before` mit `position: fixed` und
     * `z-index: 0`. Ein positioniertes Element mit z-index 0 wird NACH allen
     * nicht positionierten Elementen gezeichnet, und weil die unterste
     * Schicht der Verlaeufe deckend ist, lag sie damit VOR jedem Block ohne
     * eigene Positionierung. Sichtbar blieb nur, was ohnehin positioniert
     * ist: Seitenleiste, Kopfleiste, Karten.
     *
     * Als Hintergrund am Element selbst kann das nicht passieren, denn ein
     * Hintergrund liegt immer hinter dem Inhalt.
     */
    expect(regelwerk, "Die Tapete gehoert an den body, nicht an ein Pseudoelement")
      .not.toMatch(/body::(before|after)/);
  });

  it("bleibt ohne deckende Grundfarbe", () => {
    /*
     * Zweite Haelfte desselben Fehlers. Selbst hinter dem Inhalt waere eine
     * deckende Schicht falsch: Sie wuerde die Flaechenfarbe aus
     * design-neu.css ueberschreiben, und damit haette dieselbe Farbe zwei
     * Wahrheiten.
     */
    const block = regelwerk.slice(regelwerk.indexOf('[data-glas="an"] body {'));
    const ende = block.indexOf("}");
    expect(block.slice(0, ende)).not.toMatch(/hsl\(var\(--background\)\)/);
  });
});

describe("Rueckfall, wenn Glas nicht geht", () => {
  it("wird deckend, wenn der Nutzer weniger Transparenz will", () => {
    expect(css).toContain("prefers-reduced-transparency");
  });

  it("wird deckend, wenn der Browser backdrop-filter nicht kennt", () => {
    /*
     * Ohne diesen Zweig blieben halbdurchsichtige Flaechen ohne
     * Weichzeichnung stehen, und der Text darunter laese sich mit.
     */
    expect(css).toContain("@supports not");
  });
});
