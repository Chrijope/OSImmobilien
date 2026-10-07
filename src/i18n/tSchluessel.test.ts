/**
 * Wächter: Jeder `t()`-Schlüssel steht in `de.json` UND in `en.json`.
 *
 * Plan Kundensprache vom 25.09.2026, Risiko „neue Kundentexte nur deutsch“.
 * Ohne diesen Test fällt ein vergessener englischer Text erst auf, wenn ein
 * englischer Kunde den nackten Schlüssel „portal.xyz.titel“ auf dem
 * Bildschirm sieht.
 *
 * Geprüft werden alle festen Schlüssel in Dateien, die i18next benutzen:
 * `t("a.b")`, `t('a.b')`, `t(\`a.b\`)` und `i18n.t("a.b")`. Zusammengesetzte
 * Schlüssel wie `t(\`status.${x}\`)` lassen sich so nicht prüfen, für sie
 * gibt es eigene Tests (etwa in `empfehlungenStore.test.ts`). Pluralformen
 * zählen, wenn `_one` oder `_other` vorhanden ist.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import de from "./locales/de.json";
import en from "./locales/en.json";

const SRC = join(__dirname, "..");

function dateien(ordner: string): string[] {
  const ergebnis: string[] = [];
  for (const e of readdirSync(ordner, { withFileTypes: true })) {
    const pfad = join(ordner, e.name);
    if (e.isDirectory()) ergebnis.push(...dateien(pfad));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.|\.spec\./.test(e.name) && !/ [2-9]\.tsx?$/.test(e.name)) ergebnis.push(pfad);
  }
  return ergebnis;
}

function vorhanden(baum: unknown, schluessel: string): boolean {
  let knoten = baum;
  for (const teil of schluessel.split(".")) {
    if (knoten && typeof knoten === "object" && teil in (knoten as Record<string, unknown>)) {
      knoten = (knoten as Record<string, unknown>)[teil];
    } else {
      return false;
    }
  }
  return true;
}

const mitPlural = (baum: unknown, k: string) =>
  vorhanden(baum, k) || vorhanden(baum, `${k}_one`) || vorhanden(baum, `${k}_other`);

const T_AUFRUF = /(?<![\w.$])(?:i18n\.)?t\(\s*(["'`])([A-Za-z0-9_]+(?:\.[A-Za-z0-9_-]+)+)\1/g;
const NUTZT_I18N = /useTranslation|from ["']@\/i18n["']|from ["']i18next["']|i18n\.t\(/;

describe("i18n: jeder t()-Schlüssel hat Deutsch und Englisch", () => {
  const funde: Array<{ datei: string; schluessel: string }> = [];
  for (const datei of dateien(SRC)) {
    const text = readFileSync(datei, "utf8");
    if (!NUTZT_I18N.test(text)) continue;
    for (const m of text.matchAll(T_AUFRUF)) funde.push({ datei: relative(SRC, datei), schluessel: m[2] });
  }

  it("findet überhaupt Schlüssel (sonst prüft der Test nichts)", () => {
    expect(funde.length).toBeGreaterThan(500);
  });

  it("kein Schlüssel fehlt in de.json", () => {
    const fehlt = funde.filter((f) => !mitPlural(de, f.schluessel)).map((f) => `${f.datei}: ${f.schluessel}`);
    expect(fehlt).toEqual([]);
  });

  it("kein Schlüssel fehlt in en.json", () => {
    const fehlt = funde.filter((f) => !mitPlural(en, f.schluessel)).map((f) => `${f.datei}: ${f.schluessel}`);
    expect(fehlt).toEqual([]);
  });
});
