import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/*
 * Seit dem 15.10.2026 gibt es keine Karrierestufen mehr. Dieser Test hält
 * fest, dass niemand sie im Quellcode wieder einführt: keine Stufen-Tabelle,
 * keine Auflösung gespeicherter Stufen, kein Lesen oder Schreiben von
 * karriere_override und keine Sidebar-Sperre nach Stufe. Die Werte in der
 * Datenbank bleiben stehen, werden aber nicht mehr angefasst.
 */
function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) return dateien(pfad);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [pfad] : [];
  });
}

const VERBOTEN = /KARRIERE_STUFEN|getKarriereStufe|findKarriereStufe|getKarriereOverrideForUser|karriere_override|karriere_gating_active|PAKET_KARRIERE_MAP|isUrlAllowedForVPStufe|vpStufeId/;

describe("Keine Karrierestufen im Code", () => {
  for (const ordner of ["src", "supabase/functions"]) {
    it(`${ordner} kennt keine Karrierestufen mehr`, () => {
      const treffer = dateien(ordner)
        .filter((d) => !d.endsWith("integrations/supabase/types.ts"))
        .filter((d) => VERBOTEN.test(readFileSync(d, "utf8")));
      expect(treffer).toEqual([]);
    });
  }
});
