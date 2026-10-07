/**
 * Wächter über `de.json` und `en.json` als Ganzes.
 *
 * `tSchluessel.test.ts` prüft die Schlüssel, die im Code fest stehen.
 * Zusammengesetzte Schlüssel wie `t(\`portal.nav.${key}\`)` sieht er nicht.
 * Deshalb hier zusätzlich: Beide Dateien haben genau dieselben Schlüssel,
 * kein Wert ist leer, und die Hausregeln gelten (Plan Kundensprache,
 * Etappe 1):
 *   - kein „advisor“ für den Berater (Entscheidung 16), „tax advisor“ für
 *     den Steuerberater ist erlaubt,
 *   - keine Gedankenstriche in Texten, die Kunden sehen.
 */
import { describe, expect, it } from "vitest";
import de from "./locales/de.json";
import en from "./locales/en.json";

function flach(baum: unknown, weg = ""): Array<[string, string]> {
  if (!baum || typeof baum !== "object") return [];
  return Object.entries(baum as Record<string, unknown>).flatMap(([k, v]) => {
    const schluessel = weg ? `${weg}.${k}` : k;
    return typeof v === "object" && v !== null ? flach(v, schluessel) : [[schluessel, String(v)] as [string, string]];
  });
}

const DE = flach(de);
const EN = flach(en);

describe("Sprachdateien", () => {
  it("haben genau dieselben Schlüssel", () => {
    const deSchluessel = new Set(DE.map(([k]) => k));
    const enSchluessel = new Set(EN.map(([k]) => k));
    expect(DE.map(([k]) => k).filter((k) => !enSchluessel.has(k)), "fehlt in en.json").toEqual([]);
    expect(EN.map(([k]) => k).filter((k) => !deSchluessel.has(k)), "fehlt in de.json").toEqual([]);
  });

  it("haben keine leeren Werte", () => {
    // Absichtlich leer: das deutsche „Uhr“ hinter einer Uhrzeit hat im Englischen kein Gegenstück.
    const ABSICHTLICH_LEER = new Set(["portal.investments.notar.termin_steht_text_oclock"]);
    const leer = [...DE, ...EN].filter(([k, v]) => v.trim() === "" && !ABSICHTLICH_LEER.has(k)).map(([k]) => k);
    expect(leer).toEqual([]);
  });

  it("nennen den Berater im Englischen nie „advisor“", () => {
    const treffer = EN.filter(([, v]) => /advis/i.test(v.replace(/tax ?advisor'?s?/gi, ""))).map(([k, v]) => `${k}: ${v}`);
    expect(treffer).toEqual([]);
  });

  it("enthalten keine Gedankenstriche", () => {
    const treffer = [...DE, ...EN].filter(([, v]) => /[–—]|\s-\s/.test(v)).map(([k, v]) => `${k}: ${v}`);
    expect(treffer).toEqual([]);
  });
});
