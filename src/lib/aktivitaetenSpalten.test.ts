import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * „column erstellt_am does not exist“ auf `aktivitaeten` (Meldung aus
 * Lovable, 28.09.2026, rund 50 Fehler in sechs Stunden).
 *
 * `aktivitaeten` hat keine Spalte `erstellt_am`, der Zeitstempel heißt
 * `datum` (20260314101936). Die Edge Function `follow-up-eskalation` fragte
 * trotzdem `.gt("erstellt_am", …)` ab, bei jedem Lauf alle 15 Minuten.
 * Dieser Test hält jede Abfrage auf `aktivitaeten` im Browser und in den
 * Edge Functions davon ab.
 */

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) return name === "node_modules" ? [] : dateien(pfad);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [pfad] : [];
  });
}

/**
 * Jede Abfragekette ab `.from("aktivitaeten")`: der Rest der Zeile bis zur
 * nächsten Tabelle, dazu die Folgezeilen, die mit `.` weiterketten.
 */
function aktivitaetenAbfragen(code: string): string[] {
  const treffer: string[] = [];
  const muster = /\.from\(\s*["'`]aktivitaeten["'`]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = muster.exec(code))) {
    const [erste, ...folgende] = code.slice(m.index).split("\n");
    const naechsteTabelle = erste.indexOf(".from(", 1);
    const kette = [naechsteTabelle > 0 ? erste.slice(0, naechsteTabelle) : erste];
    for (const zeile of folgende) {
      if (!zeile.trim().startsWith(".")) break;
      kette.push(zeile);
    }
    treffer.push(kette.join("\n"));
  }
  return treffer;
}

describe("aktivitaeten kennt kein erstellt_am", () => {
  it("die Spalte heißt datum", () => {
    const typen = readFileSync("src/integrations/supabase/types.ts", "utf8");
    const zeile = typen.slice(typen.indexOf("aktivitaeten: {"), typen.indexOf("Insert:", typen.indexOf("aktivitaeten: {")));
    expect(zeile).toContain("datum:");
    expect(zeile).not.toContain("erstellt_am");
  });

  it("keine Abfrage im Browser oder in einer Edge Function benutzt erstellt_am", () => {
    const funde: string[] = [];
    for (const datei of [...dateien("src"), ...dateien("supabase/functions")]) {
      for (const abfrage of aktivitaetenAbfragen(readFileSync(datei, "utf8"))) {
        if (abfrage.includes("erstellt_am")) funde.push(`${datei}: ${abfrage.slice(0, 160)}`);
      }
    }
    expect(funde).toEqual([]);
  });

  it("follow-up-eskalation prüft neue Aktivitäten über datum und verschluckt den Fehler nicht", () => {
    const code = readFileSync("supabase/functions/follow-up-eskalation/index.ts", "utf8");
    const [abfrage] = aktivitaetenAbfragen(code);
    expect(abfrage).toContain('.gt("datum", ab.toISOString())');
    expect(code).toContain("if (aktFehler) stats.errors.push(");
  });

  it("der Suchlauf selbst findet den alten Fehler", () => {
    const alt = 'await supabase\n  .from("aktivitaeten")\n  .select("id")\n  .gt("erstellt_am", x)\n  .limit(1);\n';
    expect(aktivitaetenAbfragen(alt)[0]).toContain("erstellt_am");
  });
});
