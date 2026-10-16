import { describe, expect, it } from "vitest";
import { sonnenRichtung } from "./szene";

// Plan: x nach rechts, y (in 3D z) nach unten. Nordwinkel 0 heißt Norden oben.
describe("Sonnenstand nach Uhrzeit und Nordpfeil", () => {
  it("steht morgens im Osten, mittags im Süden und am höchsten, abends im Westen", () => {
    const morgen = sonnenRichtung(6, 0), mittag = sonnenRichtung(12, 0), abend = sonnenRichtung(18, 0);
    expect(morgen.x).toBeGreaterThan(0.9);
    expect(mittag.z).toBeGreaterThan(0.5);
    expect(abend.x).toBeLessThan(-0.9);
    expect(mittag.y).toBeGreaterThan(morgen.y);
    expect(morgen.y).toBeGreaterThan(0);
  });

  it("dreht mit dem Nordpfeil: zeigt Norden nach rechts, steht die Mittagssonne links", () => {
    expect(sonnenRichtung(12, 90).x).toBeLessThan(-0.5);
  });
});
