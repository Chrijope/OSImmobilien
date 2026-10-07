/**
 * Niedrig-Befund vom 04.10.2026: Fehlte ein Teil des Namens, setzten
 * submit-lead und zapier-bewerber-webhook einen Gedankenstrich ein. Der stand
 * dann in Anrede und Mails. Jetzt bleibt der Teil leer.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nachnameVergleichsform } from "../../supabase/functions/_shared/kontakt-dublette.ts";

const lies = (name: string) =>
  readFileSync(join(process.cwd(), "supabase", "functions", name, "index.ts"), "utf8");

describe("Namensplatzhalter", () => {
  it.each(["submit-lead", "zapier-bewerber-webhook"])("%s setzt keinen Gedankenstrich als Namen", (name) => {
    const text = lies(name);
    expect(text).not.toMatch(/(vor|nach)name = "—"/);
  });

  it("ein leerer Nachname zählt in der Dublettenprüfung weiter als unbekannt", () => {
    expect(nachnameVergleichsform("")).toBe("");
    expect(nachnameVergleichsform("—")).toBe("");
  });
});
