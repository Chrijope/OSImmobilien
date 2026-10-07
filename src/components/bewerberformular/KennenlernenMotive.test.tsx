import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MOTIVE, MOTIV_IDS, Motiv } from "./KennenlernenMotive";

/**
 * Die Motive sind Zeichenketten und keine JSX-Bäume.
 *
 * Das hat einen guten Grund (siehe die Datei selbst), aber es nimmt dem
 * Übersetzer die Prüfung ab: Ein vergessenes schließendes Zeichen fällt beim
 * Bauen nicht auf, sondern erst auf dem Bildschirm des Bewerbers, und dann als
 * leere Fläche. Deshalb liest dieser Test jedes Motiv als XML.
 */
describe("Die Motive des Kennenlernens", () => {
  it("sind achtundzwanzig, und jedes ist wohlgeformtes SVG", () => {
    expect(MOTIV_IDS).toHaveLength(28);
    const parser = new DOMParser();
    for (const id of MOTIV_IDS) {
      const doc = parser.parseFromString(MOTIVE[id], "image/svg+xml");
      expect(doc.querySelector("parsererror"), `Motiv ${id}`).toBeNull();
      expect(doc.documentElement.tagName, `Motiv ${id}`).toBe("svg");
    }
  });

  it("beschriftet jedes Motiv für Bildschirmleser", () => {
    for (const id of MOTIV_IDS) {
      const svg = MOTIVE[id];
      expect(svg, `Motiv ${id}`).toContain('role="img"');
      expect(svg.match(/aria-label="([^"]{10,})"/), `Motiv ${id}`).toBeTruthy();
    }
  });

  it("gibt jedem Motiv eigene Verlaufskennungen, damit sich zwei nicht überlagern", () => {
    // Zwei Motive auf derselben Seite mit derselben `id` im `defs`-Block: Das
    // zweite erbt die Farben des ersten, und niemand sieht, warum.
    const kennungen = MOTIV_IDS.flatMap((id) =>
      [...MOTIVE[id].matchAll(/<(?:linearGradient|filter) id="([^"]+)"/g)].map((m) => m[1]),
    );
    expect(new Set(kennungen).size).toBe(kennungen.length);
  });

  it("zeichnet ein Motiv in die Seite und nennt seine Kennung", () => {
    render(<Motiv id="pfad" />);
    const behaelter = screen.getByLabelText(/Sieben Etappen/);
    expect(behaelter.tagName.toLowerCase()).toBe("svg");
    expect(behaelter.closest("[data-motiv]")).toHaveAttribute("data-motiv", "pfad");
  });
});
