/**
 * M11 vom 04.10.2026: `eigene-investments-reminders` prüfte nur, ob heute
 * schon dieselbe Glocke kam. Ein Anlass wie "Zinsbindung endet in 12 Monaten"
 * gilt einen ganzen Monat, und der Kunde bekam ihn täglich. Jetzt entscheidet
 * ein Sperrschlüssel je Anlass.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EIGENE_INVESTMENTS_SPERRE as SPERRE } from "../../supabase/functions/_shared/kunden-glocke.ts";

const text = readFileSync(
  join(process.cwd(), "supabase", "functions", "eigene-investments-reminders", "index.ts"),
  "utf8",
);

describe("Sperrschlüssel", () => {
  it("ist für denselben Anlass an jedem Tag des Monats gleich", () => {
    expect(SPERRE.anschlussfinanzierung("i1", "2027-10-01", 12)).toBe(SPERRE.anschlussfinanzierung("i1", "2027-10-01", 12));
    expect(SPERRE.reinvest("i1", 6)).toBe("reinvest-i1-6");
  });

  it("trennt die Stufen und eine neue Zinsbindung", () => {
    expect(SPERRE.anschlussfinanzierung("i1", "2027-10-01", 12)).not.toBe(SPERRE.anschlussfinanzierung("i1", "2027-10-01", 6));
    expect(SPERRE.anschlussfinanzierung("i1", "2027-10-01", 12)).not.toBe(SPERRE.anschlussfinanzierung("i1", "2037-10-01", 12));
  });

  it("lässt wiederkehrende Anlässe im nächsten Quartal oder Jahr wieder zu", () => {
    expect(SPERRE.marktwert("i1", new Date(2026, 0, 1))).not.toBe(SPERRE.marktwert("i1", new Date(2026, 3, 1)));
    expect(SPERRE.steuer("i1", new Date(2026, 0, 15))).not.toBe(SPERRE.steuer("i1", new Date(2027, 0, 15)));
    expect(SPERRE.sondertilgung("i1", new Date(2026, 4, 3))).not.toBe(SPERRE.sondertilgung("i1", new Date(2027, 4, 3)));
  });
});

describe("eigene-investments-reminders", () => {
  it("prüft den Sperrschlüssel statt des Tagesdatums und speichert ihn mit", () => {
    expect(text).toContain('.eq("meta->>sperre", sperre)');
    expect(text).toContain("meta: { sperre }");
    expect(text).not.toContain('.gte("erstellt_am"');
  });
});
