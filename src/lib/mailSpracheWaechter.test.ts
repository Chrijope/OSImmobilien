/**
 * Der Wächter: Jede Kundenmail hat Englisch (Plan Kundensprache, Etappe 2).
 *
 * Ohne ihn entsteht beim nächsten Bau wieder eine Kundenmail, die nur deutsch
 * kann, und niemand merkt es, bis ein englischer Kunde sie bekommt. Deshalb:
 *
 *   1. Jede Vorlage der Registry ist in `_zielgruppe.ts` als „kunde“ oder
 *      „intern“ gekennzeichnet. Eine neue Vorlage ohne Eintrag ist rot.
 *   2. Jede Kundenvorlage meldet `sprachen: DE_EN` und führt ein Textobjekt
 *      mit deutscher und englischer Hälfte, ausser sie steht mit Begründung in
 *      `KUNDENVORLAGEN_OHNE_EN`.
 *   3. Jede Kundenvorlage reicht die Sprache an das Layout weiter.
 *
 * Vitest kann die Vorlagen nicht laden (React kommt dort über `npm:`), also
 * wird der Quelltext gelesen. Dass die englische Fassung auch wirklich ohne
 * deutsche Reste rendert, prüft der Deno-Test `sprache_test.ts` daneben.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  KUNDENVORLAGEN_OHNE_EN,
  VORLAGEN_ZIELGRUPPE,
} from "../../supabase/functions/_shared/transactional-email-templates/_zielgruppe";

const ORDNER = resolve(__dirname, "../../supabase/functions/_shared/transactional-email-templates");
const lies = (datei: string) => readFileSync(resolve(ORDNER, datei), "utf8");

/** Name der Vorlage und Dateiname, aus der Registry gelesen. */
function registry(): Map<string, string> {
  const quelle = lies("registry.ts");
  const dateiJeImport = new Map<string, string>();
  for (const m of quelle.matchAll(/import \{ template as (\w+) \} from '\.\/([\w-]+\.tsx)'/g)) dateiJeImport.set(m[1], m[2]);
  const eintraege = new Map<string, string>();
  const block = quelle.slice(quelle.indexOf("export const TEMPLATES"));
  for (const m of block.matchAll(/^\s*'([a-z0-9-]+)':\s*(\w+),/gm)) {
    const datei = dateiJeImport.get(m[2]);
    if (datei) eintraege.set(m[1], datei);
  }
  return eintraege;
}

const vorlagen = registry();
const kunden = [...vorlagen.keys()].filter((n) => VORLAGEN_ZIELGRUPPE[n] === "kunde");

describe("Kennzeichnung kunde oder intern", () => {
  it("liest die Registry überhaupt", () => {
    expect(vorlagen.size).toBeGreaterThan(100);
  });

  it("jede Vorlage der Registry ist gekennzeichnet", () => {
    const ohne = [...vorlagen.keys()].filter((n) => !VORLAGEN_ZIELGRUPPE[n]);
    expect(ohne, `Bitte in _zielgruppe.ts als 'kunde' oder 'intern' eintragen: ${ohne.join(", ")}`).toEqual([]);
  });

  it("die Kennzeichnung nennt keine Vorlage, die es nicht gibt", () => {
    const verwaist = Object.keys(VORLAGEN_ZIELGRUPPE).filter((n) => !vorlagen.has(n));
    expect(verwaist).toEqual([]);
  });

  it("Ausnahmen ohne Englisch sind Kundenvorlagen und haben einen Grund", () => {
    for (const [name, grund] of Object.entries(KUNDENVORLAGEN_OHNE_EN)) {
      expect(VORLAGEN_ZIELGRUPPE[name], name).toBe("kunde");
      expect(grund.length, name).toBeGreaterThan(10);
    }
  });
});

describe("Jede Kundenvorlage hat Englisch", () => {
  it("es gibt die erwarteten Kundenvorlagen", () => {
    expect(kunden.length).toBeGreaterThanOrEqual(40);
  });

  for (const name of kunden) {
    if (name in KUNDENVORLAGEN_OHNE_EN) continue;
    it(`${name} meldet Deutsch und Englisch und reicht die Sprache weiter`, () => {
      const quelle = lies(vorlagen.get(name)!);
      expect(quelle, "sprachen: DE_EN fehlt").toMatch(/sprachen:\s*DE_EN/);
      // Die 24h- und 6h-Erinnerung leihen sich Inhalt und Texte von der Grundvorlage.
      if (/component:\s*ErstgespraechErinnerung\b/.test(quelle)) {
        expect(quelle).toMatch(/erinnerungBetreff\(/);
        return;
      }
      // Die 1h-Erinnerung nimmt ihre Texte aus der Grundvorlage (ERINNERUNG_TEXTE).
      expect(quelle, "englische Hälfte fehlt").toMatch(/\ben:\s*\{|ERINNERUNG_TEXTE/);
      expect(quelle, "EmailLayout bekommt die Sprache nicht").toMatch(/<EmailLayout[\s\S]*?\bsprache=\{sprache\}/);
    });
  }
});

describe("Der Versand ermittelt die Sprache", () => {
  const versand = readFileSync(resolve(__dirname, "../../supabase/functions/send-transactional-email/index.ts"), "utf8");

  it("nur für Kundenvorlagen mit Englisch, und legt sie in die Felder", () => {
    expect(versand).toMatch(/folgtKundensprache\(templateName, template\.sprachen\)/);
    expect(versand).toMatch(/ermittleMailSprache\(/);
    expect(versand).toMatch(/templateData = \{ \.\.\.templateData, sprache \}/);
  });

  it("nimmt Sprache und Kontakt aus Aufruf oder Metadaten", () => {
    expect(versand).toMatch(/body\.sprache \?\? body\.lang/);
    expect(versand).toMatch(/extraMetadata\?\.kontaktId \?\? extraMetadata\?\.kontakt_id/);
  });

  it("das Layout setzt html lang aus der Sprache", () => {
    expect(lies("_layout.tsx")).toMatch(/<Html lang=\{sprache\}/);
  });
});
