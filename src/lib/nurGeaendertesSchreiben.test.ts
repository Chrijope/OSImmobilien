import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * H11 (04.10.2026): Kontakt und Investment schreiben nur noch, was sich
 * geändert hat. meta geht als Patch über merge_kontakt_meta beziehungsweise
 * merge_investment_meta, nicht mehr als ganzes Feld aus dem Zwischenspeicher.
 * Das Verhalten selbst prüfen dataCacheAblehnung.test.ts und
 * investmentMetaDurchgereicht.test.tsx.
 */

const lies = (pfad: string) => readFileSync(resolve(__dirname, "../..", pfad), "utf-8");

describe("Nur Geändertes schreiben", () => {
  it("updateKontakt schreibt über kontaktZeileSchreiben: Spalten direkt, meta als Patch", () => {
    const store = lies("src/lib/kundenStore.ts");
    const rumpf = store.slice(store.indexOf("function kontaktZeileSchreiben("), store.indexOf("export function updateKontakt("));
    expect(rumpf).toContain("const patch = metaUnterschied(row.meta, neuMeta, { tief: true });");
    expect(rumpf).toContain('return cacheZeileSchreiben("kontakte", id, geaendert, patch);');
    const update = store.slice(store.indexOf("export function updateKontakt("), store.indexOf("export interface DeleteKontaktOptions"));
    expect(update).toContain("const gespeichert = kontaktZeileSchreiben(id, dbUpdates);");
    expect(update).not.toContain('cacheUpdate("kontakte", id, dbUpdates)');
  });

  it("updateInvestment schickt meta nur als Patch", () => {
    const store = lies("src/lib/investmentsStore.ts");
    const rumpf = store.slice(store.indexOf("function investmentAenderung("), store.indexOf("export async function deleteInvestment("));
    expect(rumpf).toContain("const patch = metaUnterschied(altesMeta, neuMeta);");
    expect(rumpf).toContain('cacheZeileSchreiben("investments", id, geaendert, patch)');
    // Die Kontaktstufe fuehrt seit 11.10.2026 die Datenbank nach, nicht der Browser.
    expect(rumpf).not.toContain('cacheMetaZusammenfuehren("kontakte"');
    expect(rumpf).not.toMatch(/cacheUpdate\("investments", id, u\)/);
  });

  it("Stammdaten im Kundenprofil schreiben Empfehlungsgeber und Ersteller als Patch", () => {
    // Seit dem 18.10.2026 speichert jeder Stift links über `speichereStammdaten`.
    const profil = lies("src/pages/KundenDetail.tsx");
    const rumpf = profil.slice(profil.indexOf("const speichereStammdaten = async ("), profil.indexOf("const wechselBrauchtGrund"));
    expect(rumpf).toContain('cacheMetaZusammenfuehren("kontakte", id, zusatzPatch)');
    expect(rumpf).not.toContain('cacheUpdate("kontakte", id, { meta: nextMeta })');
    // Erfolg erst nach der Antwort.
    expect(rumpf.indexOf("await Promise.all([")).toBeLessThan(rumpf.indexOf("return true;"));
  });
});
