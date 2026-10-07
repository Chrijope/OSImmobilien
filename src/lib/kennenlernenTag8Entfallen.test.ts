/**
 * Die Erinnerung an Tag 8 ist entfallen (26.09.2026).
 *
 * Die Kette des Kennenlernbogens besteht seitdem aus Einladung, Tag 3 und
 * Tag 11. Die Vorlage der Tag-8-Mail ist gelöscht; wer sie trotzdem noch
 * anfragt, etwa ein Zeitplan mit altem Stand, bekommt von
 * `send-transactional-email` eine Absage mit 410, und es geht nichts hinaus.
 * Die Edge Functions laufen in Deno, deshalb wird am Quelltext geprüft.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { VORLAGEN_ZIELGRUPPE } from "../../supabase/functions/_shared/transactional-email-templates/_zielgruppe";

const WURZEL = process.cwd();
const VORLAGEN_ORDNER = "supabase/functions/_shared/transactional-email-templates";

// Zusammengesetzt, damit diese Datei selbst den Suchlauf nicht auslöst.
const ENTFALLEN = ["bewerber", "kennenlernen", "erinnerung", "2"].join("-");

// Die einzige Stelle, an der der Name noch stehen darf: die Sperrliste, mit
// der der Versand einem alten Aufrufer sauber absagt.
const ERLAUBT = new Set(["supabase/functions/send-transactional-email/index.ts"]);

const lies = (pfad: string) => readFileSync(join(WURZEL, pfad), "utf8");

function quelldateien(ordner: string): string[] {
  const ergebnis: string[] = [];
  for (const eintrag of readdirSync(join(WURZEL, ordner))) {
    if (eintrag === "node_modules") continue;
    const pfad = join(ordner, eintrag);
    if (statSync(join(WURZEL, pfad)).isDirectory()) ergebnis.push(...quelldateien(pfad));
    // Tests dürfen den Namen nennen, um sein Fehlen zu prüfen.
    else if (/\.(ts|tsx)$/.test(eintrag) && !/\.test\.(ts|tsx)$/.test(eintrag)) ergebnis.push(pfad);
  }
  return ergebnis;
}

describe("Die Erinnerung an Tag 8 ist entfallen", () => {
  it("der Vorlagenname steht nirgends mehr im Code, außer in der Sperrliste", () => {
    const fundstellen: string[] = [];
    for (const datei of [...quelldateien("src"), ...quelldateien("supabase/functions")]) {
      const rel = relative(WURZEL, join(WURZEL, datei));
      if (ERLAUBT.has(rel)) continue;
      if (lies(datei).includes(ENTFALLEN)) fundstellen.push(rel);
    }
    expect(fundstellen).toEqual([]);
  });

  it("die Vorlagendatei ist gelöscht und steht weder in Registry noch Zielgruppe", () => {
    expect(existsSync(join(WURZEL, VORLAGEN_ORDNER, `${ENTFALLEN}.tsx`))).toBe(false);
    expect(lies(`${VORLAGEN_ORDNER}/registry.ts`)).not.toContain(ENTFALLEN);
    expect(Object.keys(VORLAGEN_ZIELGRUPPE)).not.toContain(ENTFALLEN);
  });

  it("die beiden verbliebenen Erinnerungen sind weiter angemeldet", () => {
    const registry = lies(`${VORLAGEN_ORDNER}/registry.ts`);
    for (const name of ["bewerber-kennenlernen-erinnerung-1", "bewerber-kennenlernen-erinnerung-3"]) {
      expect(registry).toContain(`'${name}':`);
      expect(Object.keys(VORLAGEN_ZIELGRUPPE)).toContain(name);
    }
  });

  it("der Versand sagt einem alten Aufrufer mit 410 ab, statt zu senden", () => {
    const versand = lies("supabase/functions/send-transactional-email/index.ts");
    expect(versand).toContain(`'${ENTFALLEN}'`);
    const absage = versand.indexOf("ENTFALLENE_VORLAGEN.has(templateName)");
    expect(absage).toBeGreaterThan(-1);
    expect(absage).toBeLessThan(versand.indexOf("const template = TEMPLATES[templateName]"));
    expect(versand.slice(absage, absage + 600)).toContain("status: 410");
  });
});
