import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * Eingabemaske als Liste (Christian, 13.11.2026): links die Beschreibung,
 * rechts das Feld. jsdom rechnet kein Layout, geprüft wird die Regel im Stylesheet.
 */
const CSS = readFileSync(resolve(process.cwd(), "src/styles/investmentrechner.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("Eingabemaske: Beschreibung links, Feld rechts", () => {
  it("Feld als zweispaltiges Raster, Beschriftung in Spalte 1, Eingabe in Spalte 2", () => {
    expect(CSS).toMatch(/\.input-panel \.field \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
    expect(CSS).toMatch(/\.input-panel \.field > \.field-label,[^{]*\{[^}]*grid-column: 1;/);
    expect(CSS).toMatch(/\.input-panel \.field > :not\(\.field-label\) \{[^}]*grid-column: 2;/);
  });
  it("auf schmalen Handys wieder untereinander", () => {
    expect(CSS).toMatch(/@media \(max-width: 520px\) \{\s*\.investmentrechner \.input-panel \.field \{\s*display: block;/);
  });
});
