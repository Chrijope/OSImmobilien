import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAHNSTUFEN_CONFIG } from "@/lib/mahnungShared";

/**
 * Die Anrede-Entscheidungen vom 26.09.2026 (Hausregel in CLAUDE.md unter
 * „Sprache“): Gruppe F siezt, der Bewerberweg duzt, in Mails stehen keine
 * Gedankenstriche.
 *
 * Geprüft wird der Quelltext ohne Kommentare, denn Vitest kann die Vorlagen
 * nicht laden (React kommt über `npm:`). Kommentare zitieren oft den alten
 * Wortlaut und zählen deshalb nicht.
 */
const VORLAGEN = join(__dirname, "..", "..", "supabase", "functions", "_shared", "transactional-email-templates");

function quelle(datei: string): string {
  return readFileSync(join(VORLAGEN, datei), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const DU = /\b(du|dir|dich|dein|deine|deinen|deinem|deiner|Du|Dir|Dich|Dein|Deine|Deinen|Deinem|Deiner|Hallo)\b/g;
const SIE = /\b(Sie|Ihnen|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres)\b|Guten Tag/g;

describe("Reservierungserinnerung siezt (Gruppe F)", () => {
  const text = quelle("reservierung-erinnerung.tsx");
  it("grüßt förmlich, ohne Du", () => {
    expect(text).toContain("foermlich(name, sprache, kundeAnrede)");
    expect(text.match(DU) ?? []).toEqual([]);
  });
  it("kann Englisch", () => {
    expect(text).toContain("sprachen: DE_EN");
  });
});

/**
 * Ausnahme vom 27.09.2026 (Entscheidung Christian): Die Handbuch-Strecke
 * siezt, also auch ihre Zustellmail an den Interessenten. Deutsch grüßt wie
 * Gruppe F mit „Guten Tag Vorname Nachname,“, Englisch bleibt bei „Hello
 * Erika,“. Die Seitentexte bewacht `src/lib/handbuch/handbuchSieAnrede.test.ts`.
 */
describe("Handbuch-Zustellmail siezt (Ausnahme Handbuch-Strecke)", () => {
  const text = quelle("handbuch-zustellung.tsx");
  it("grüßt auf Deutsch förmlich, auf Englisch weiter mit dem Vornamen, ohne Du", () => {
    expect(text).toContain("foermlich(name, sprache, kundeAnrede)");
    expect(text).toContain("hallo(name, sprache)");
    expect(text.match(DU) ?? []).toEqual([]);
  });
  it("bekommt Vor- und Nachnamen", () => {
    const anlage = readFileSync(join(VORLAGEN, "..", "handbuch-anlage.ts"), "utf8");
    expect(anlage).toContain("name: `${e.vorname} ${e.nachname}`.trim(),");
  });
});

describe("Mustervertrag duzt wie der ganze Bewerberweg", () => {
  const text = quelle("muster-vertrag.tsx");
  it("grüßt mit Hallo und Vorname, ohne Sie", () => {
    expect(text).toContain("hallo(bewerberName)");
    expect(text.match(SIE) ?? []).toEqual([]);
  });
});

describe("Portal-Einladung", () => {
  it("grüßt über den gemeinsamen Helfer, also nur mit dem Vornamen", () => {
    expect(quelle("activation-invite.tsx")).toContain("hallo(name, sprache)");
  });
});

describe("Keine Gedankenstriche in Mails", () => {
  it("Notar-Auswahl schreibt „Datum folgt“ statt eines Strichs", () => {
    const text = quelle("notartermin-auswahl.tsx");
    expect(text).toContain("'Datum folgt'");
    expect(text).not.toMatch(/[–—]/);
  });

  it("Mahnung: Betreffs und PDF-Fuß ohne Strich", () => {
    for (const stufe of Object.values(MAHNSTUFEN_CONFIG)) {
      expect(stufe.betreff).not.toMatch(/[–—]/);
      expect(stufe.betreff).toMatch(/, ausstehende Mietzahlung$/);
    }
    for (const datei of ["mahnungShared.ts", "mahnungPdf.ts"]) {
      expect(readFileSync(join(__dirname, datei), "utf8"), datei).not.toMatch(/[–—]/);
    }
  });
});
