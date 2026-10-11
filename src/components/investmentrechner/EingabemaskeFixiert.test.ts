import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/*
 * Die Eingabemaske bleibt auf dem Desktop beim Scrollen stehen (11.10.2026).
 * Geprüft am Stylesheet: sticky nur in der Desktop-Abfrage für den
 * Bildschirm, nie auf dem Handy und nie im Druck, und der Rahmen schneidet mit
 * `clip`, denn `overflow: hidden` machte ihn zum Scrollkasten und hob sticky auf.
 */
const css = readFileSync("src/styles/investmentrechner.css", "utf8");

describe("Eingabemaske fixiert", () => {
  it("ist nur auf dem Bildschirm ab 881 Bildpunkten sticky und scrollt dann in sich", () => {
    const block = css.match(/@media screen and \(min-width: 881px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(block).toMatch(/\.input-panel \{[^}]*position: sticky;[^}]*overflow-y: auto;/);
    // Sonst nirgends sticky an der Maske, also weder auf dem Handy noch im Druck.
    expect(css.replace(block, "")).not.toMatch(/\.input-panel \{[^}]*position: sticky/);
  });

  it("der Rahmen des Rechners schneidet mit clip", () => {
    expect(css).toMatch(/\.investmentrechner:not\(\.investmentrechner-print\) \{[^}]*overflow: clip;/);
  });
});
