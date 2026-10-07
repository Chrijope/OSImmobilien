/**
 * M9 vom 04.10.2026: Die Glocke zur neuen Buchung ging an den
 * Kalenderbesitzer, auch wenn der Kontakt laengst einem anderen Partner
 * gehoert. Jetzt wie bei Absage und Verschiebung: der aktuelle Zustaendige,
 * ohne ihn die Leitung.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const lies = (name: string) =>
  readFileSync(join(process.cwd(), "supabase", "functions", name, "index.ts"), "utf8");

describe("send-buchung-bestaetigung", () => {
  const text = lies("send-buchung-bestaetigung");

  it("bestimmt den Empfaenger der Glocke wie send-buchung-aenderung", () => {
    expect(text).toContain("await zustaendigOderLeitung(supabase, buchung.kontakt_id)");
    expect(lies("send-buchung-aenderung")).toContain("await zustaendigOderLeitung(supabase, buchung.kontakt_id)");
  });

  it("schreibt die Glocke nicht mehr fest an den Kalenderbesitzer", () => {
    expect(text).not.toMatch(/insert\(\{\s*benutzer_id: buchung\.mitarbeiter_id/);
  });
});
