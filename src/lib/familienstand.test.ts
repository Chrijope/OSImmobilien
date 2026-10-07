import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hatGueterstand } from "./familienstand";

describe("hatGueterstand", () => {
  it("erkennt die Schreibweise der Selbstauskunft mit großem Anfangsbuchstaben", () => {
    // Genau dieser Wert wird gespeichert, der alte Vergleich mit "verheiratet" schlug fehl.
    expect(hatGueterstand("Verheiratet")).toBe(true);
    expect(hatGueterstand("Eingetragene Lebenspartnerschaft")).toBe(true);
  });

  it("ist unabhängig von Groß- und Kleinschreibung und Leerzeichen", () => {
    expect(hatGueterstand("verheiratet")).toBe(true);
    expect(hatGueterstand("VERHEIRATET")).toBe(true);
    expect(hatGueterstand("  Verheiratet ")).toBe(true);
    expect(hatGueterstand("eingetragene lebenspartnerschaft")).toBe(true);
  });

  it("verneint Familienstände ohne Güterstand", () => {
    for (const f of ["Ledig", "Geschieden", "Verwitwet", "in Partnerschaft", "ledig"]) {
      expect(hatGueterstand(f)).toBe(false);
    }
  });

  it("verneint leere und fremde Werte", () => {
    expect(hatGueterstand("")).toBe(false);
    expect(hatGueterstand(undefined)).toBe(false);
    expect(hatGueterstand(null)).toBe(false);
    expect(hatGueterstand(42)).toBe(false);
  });
});

describe("Güterstand in Selbstauskunft und Reservierung", () => {
  const lies = (pfad: string) => readFileSync(resolve(__dirname, pfad), "utf8");

  it("Selbstauskunft vergleicht nicht mehr exakt mit der Kleinschreibung", () => {
    const quelle = lies("../components/selbstauskunft/SelbstauskunftForm.tsx");
    expect(quelle).not.toMatch(/familienstand\s*===\s*["']verheiratet["']/);
    expect(quelle).toMatch(/hatGueterstand\(data\.familienstand\)/);
  });

  it("Reservierung nutzt denselben Helfer für beide Käufer", () => {
    const quelle = lies("../components/reservierung/ReservierungsForm.tsx");
    expect(quelle).not.toMatch(/===\s*["']Verheiratet["']/);
    expect(quelle).toMatch(/hatGueterstand\(saFamilienstandInfo\.p1\)\s*&&\s*hatGueterstand\(saFamilienstandInfo\.p2\)/);
  });
});
