/**
 * Wächter „nichts unter 11 px“ (A1, 26.10.2026).
 *
 * Die acht Schriftstufen stehen in `tailwind.config.ts` (text-grosstitel bis
 * text-bildunterschrift). Feste Pixelgrößen unter 11 px waren an über 1.200
 * Stellen gewachsen und sind auf `text-bildunterschrift` umgestellt. Dieser
 * Test verbietet neue. Ausnahme ist die Lead-Score-Anzeige mit „warm“ und
 * „heiß“: Sie bleibt nach Christians Vorgabe, wie sie ist.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const AUSNAHMEN = new Set([
  "src/components/kunden/profil/KundenprofilLeadScore.tsx",
  "src/components/kunde/LeadScoreCard.tsx",
]);

const dateien = execSync("git ls-files 'src/*.tsx' 'src/*.ts'", { encoding: "utf8" })
  .split("\n")
  .filter((d) => d && !/\.test\.tsx?$/.test(d) && !AUSNAHMEN.has(d));

/** text-[Npx] mit N unter 11, auch mit Variante wie sm:text-[10px]. */
const ZU_KLEIN = /(?<![\w-])text-\[(\d+(?:\.\d+)?)px\]/g;

describe("Schriftgrößen", () => {
  it("setzt nirgends eine feste Größe unter 11 px", () => {
    const funde: string[] = [];
    for (const d of dateien) {
      const inhalt = readFileSync(d, "utf8");
      for (const m of inhalt.matchAll(ZU_KLEIN)) {
        if (Number(m[1]) < 11) funde.push(`${d}: ${m[0]}`);
      }
    }
    expect(funde).toEqual([]);
  });

  it("kennt die acht Stufen und die Untergrenze von 11 px", () => {
    const konfig = readFileSync("tailwind.config.ts", "utf8");
    for (const stufe of ["grosstitel", "titel1", "titel2", "ueberschrift", "fliesstext", "hinweis", "fussnote", "bildunterschrift"]) {
      expect(konfig, stufe).toMatch(new RegExp(`\\b${stufe}: \\["[\\d.]+rem"`));
    }
    // 11 px bei 1rem = 14,4 px (html auf 90 %).
    expect(konfig).toMatch(/bildunterschrift: \["0\.7639rem"/);
    expect(konfig).toMatch(/xs: \["0\.7639rem"/);
  });
});

describe("cn() mit den Schriftstufen", () => {
  it("behält Größe und Farbe nebeneinander", async () => {
    const { cn } = await import("@/lib/utils");
    expect(cn("text-bildunterschrift", "text-[hsl(var(--warning-foreground))]")).toBe("text-bildunterschrift text-[hsl(var(--warning-foreground))]");
    expect(cn("text-muted-foreground text-hinweis")).toBe("text-muted-foreground text-hinweis");
    // Zwei Größen: die spätere gewinnt, wie bei den Standardgrößen.
    expect(cn("text-xs", "text-bildunterschrift")).toBe("text-bildunterschrift");
  });
});
