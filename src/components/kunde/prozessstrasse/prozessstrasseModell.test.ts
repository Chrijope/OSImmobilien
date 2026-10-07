import { describe, expect, it } from "vitest";
import { baueStrasse, zielStufeFuerRolle } from "./prozessstrasseModell";

describe("Prozessstraße, Rollenschnitt", () => {
  it("Vertrieb endet an Fälligkeit, das Haus an Abgeschlossen", () => {
    expect(zielStufeFuerRolle("vertriebspartner")).toBe("faelligkeit");
    expect(zielStufeFuerRolle("tippgeber")).toBe("faelligkeit");
    expect(zielStufeFuerRolle("unbekannt")).toBe("faelligkeit");
    for (const r of ["admin", "inhaber", "backoffice", "buchhaltung", "vertriebsleiter"]) {
      expect(zielStufeFuerRolle(r)).toBe("abgeschlossen");
    }
  });

  it("Partner sieht Abrechnung und Abgeschlossen nicht", () => {
    const s = baueStrasse("reservierung", "vertriebspartner");
    expect(s.stationen.map((x) => x.key)).not.toContain("abrechnung");
    expect(s.stationen.at(-1)?.key).toBe("faelligkeit");
    expect(s.stationen.at(-1)?.istZiel).toBe(true);
    expect(s.stationen[s.aktuellIndex].key).toBe("reservierung");
    expect(s.zielKey).toBe("faelligkeit");
  });

  it("hinter dem Ziel des Partners gilt das Ziel als erreicht, ohne die Stufe zu verraten", () => {
    const s = baueStrasse("abrechnung", "vertriebspartner");
    expect(s.zielErreicht).toBe(true);
    expect(s.prozent).toBe(100);
    expect(s.stationen.every((x) => x.zustand === "erledigt")).toBe(true);
  });

  it("Admin hat Fälligkeit als normale Station und Abgeschlossen als Ziel", () => {
    const f = baueStrasse("faelligkeit", "admin");
    expect(f.zielErreicht).toBe(false);
    expect(f.stationen.at(-1)?.key).toBe("abgeschlossen");
    expect(f.zielKey).toBe("abgeschlossen");
    expect(baueStrasse("abgeschlossen", "admin").zielErreicht).toBe(true);
  });

  it("NoShow bleibt beim Gespräch stehen und wird markiert", () => {
    const s = baueStrasse("bg_noshow", "admin");
    expect(s.stationen[s.aktuellIndex].key).toBe("beratungsgespraech");
    expect(s.nichtErschienen).toBe(true);
  });
});

describe("Prozesslinie, Aussehen", () => {
  it("erledigt in der Primärfarbe, nicht mehr in Grün", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/components/kunde/prozessstrasse/prozessstrasse.css", "utf8");
    expect(css).toContain("--ps-erledigt: var(--primary);");
    expect(css).not.toContain("--success");
  });
});
