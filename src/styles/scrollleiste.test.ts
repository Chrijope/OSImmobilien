import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Waechter fuer die eine waagerechte Scrollleiste des CRM.
 *
 * Christian am 25.09.2026: Auf der Kunden-Pipeline standen zwei waagerechte
 * Regler uebereinander, die gestaltete Scrollleiste und darunter ein eigener
 * Schieberegler (`input type="range"`). Er will genau einen, und ueberall im
 * Projekt soll dieser gleich aussehen und sich gleich verhalten.
 *
 * Die gemeinsame Loesung ist die Scrollleiste aus `index.css`. Drei Dinge
 * koennen sie still aushebeln, und die prueft diese Datei:
 *  1. Ein eigener Regler, der per `scrollLeft` einen Bereich verschiebt.
 *  2. `scrollbar-width: thin` oder `scrollbar-color` an einem waagerechten
 *     Bereich: Chrome ab Version 121 nimmt dann seine eigene Leiste und
 *     uebergeht `::-webkit-scrollbar`. So war es am Grundriss-Streifen im
 *     Exposé. Erlaubt ist nur `none` fuer Wischleisten mit eigener Bedienung.
 *  3. Die Firefox-Ersatzregel in `index.css` ohne ihre `@supports`-Klammer.
 *     Dann traefe sie auch Chrome, und die gestaltete Leiste waere ueberall weg.
 */
const wurzel = process.cwd();
const src = resolve(wurzel, "src");

function dateien(ordner: string, endungen: string[]): string[] {
  const ergebnis: string[] = [];
  for (const name of readdirSync(ordner)) {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) ergebnis.push(...dateien(pfad, endungen));
    else if (endungen.some((e) => name.endsWith(e)) && !/\.test\.tsx?$/.test(name)) ergebnis.push(pfad);
  }
  return ergebnis;
}

const indexCss = readFileSync(resolve(src, "index.css"), "utf8");

describe("Einheitliche waagerechte Scrollleiste", () => {
  it("ist in index.css fuer alle Bereiche gestaltet, waagerecht 12px hoch, Farben aus den Tokens", () => {
    const leiste = indexCss.match(/::-webkit-scrollbar \{([^}]*)\}/);
    expect(leiste).not.toBeNull();
    expect(leiste![1]).toMatch(/height:\s*12px/);
    const griff = indexCss.match(/::-webkit-scrollbar-thumb \{([^}]*)\}/);
    expect(griff![1]).toMatch(/hsl\(var\(--foreground\)/);
    // Die Ecke zwischen zwei Leisten bliebe im Dunkelmodus sonst weiss.
    expect(indexCss).toMatch(/::-webkit-scrollbar-corner \{\s*background: transparent;/);
  });

  it("gibt Firefox dieselbe Farbe nur innerhalb von @supports not selector(::-webkit-scrollbar)", () => {
    const ohneKommentare = indexCss.replace(/\/\*[\s\S]*?\*\//g, "");
    const klammer = ohneKommentare.match(/@supports not selector\(::-webkit-scrollbar\)\s*\{\s*\*\s*\{([^}]*)\}\s*\}/);
    expect(klammer).not.toBeNull();
    expect(klammer![1]).toMatch(/scrollbar-color:\s*hsl\(var\(--foreground\)/);
    // Ausserhalb der Klammer steht nirgends scrollbar-color.
    expect(ohneKommentare.match(/scrollbar-color/g)).toHaveLength(1);
  });

  it("wird an keinem waagerechten Bereich durch scrollbar-width thin oder scrollbar-color ersetzt", () => {
    const verstoesse: string[] = [];
    for (const datei of dateien(src, [".css"])) {
      const text = readFileSync(datei, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const [, selektor, rumpf] of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        // Waagerecht heisst `overflow-x` oder die Kurzform `overflow`, nicht `overflow-y`.
        if (!/overflow(-x)?:\s*(auto|scroll)/.test(rumpf)) continue;
        if (/scrollbar-width:\s*(thin|auto)|scrollbar-color/.test(rumpf)) {
          verstoesse.push(`${relative(wurzel, datei)}: ${selektor.trim()}`);
        }
      }
    }
    for (const datei of dateien(src, [".tsx", ".ts"])) {
      const text = readFileSync(datei, "utf8");
      if (/\[scrollbar-(width|color):(?!none)/.test(text)) verstoesse.push(`${relative(wurzel, datei)}: Tailwind-Klasse`);
    }
    expect(verstoesse).toEqual([]);
  });

  it("hat keinen eigenen Schieberegler, der einen Bereich per scrollLeft verschiebt", () => {
    const verstoesse = dateien(src, [".tsx"]).filter((datei) => {
      const text = readFileSync(datei, "utf8");
      return /type="range"/.test(text) && /\.scrollLeft\s*=/.test(text);
    });
    expect(verstoesse.map((d) => relative(wurzel, d))).toEqual([]);
  });
});
