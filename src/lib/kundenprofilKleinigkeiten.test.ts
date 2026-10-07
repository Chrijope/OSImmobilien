import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Zwei kleine Fehler im Kundenprofil (04.10.2026).
 */

const profil = readFileSync(resolve(__dirname, "../pages/KundenDetail.tsx"), "utf-8");

describe("Notarfoto „Anzeigen“", () => {
  it("öffnet die Datei unter dem Pfad, unter dem sie hochgeladen wurde", () => {
    const hochladen = profil.indexOf("const storagePath = `notarfotos/${id}/${inv.id}/${filename}`;");
    const anzeigen = profil.indexOf("await resolveUnterlagenUrl(`notarfotos/${id}/${inv.id}/${notarFoto}`)");
    expect(hochladen).toBeGreaterThan(-1);
    expect(anzeigen).toBeGreaterThan(-1);
    expect(profil).not.toContain('toast({ title: "Download", description: notarFoto })');
  });
});

describe("Löschanfrage ablehnen", () => {
  it("ändert den Zwischenspeicher nicht vor dem Speichern und meldet erst danach", () => {
    const start = profil.indexOf("deleteRequested: null,");
    const block = profil.slice(start - 800, start + 600);
    expect(block).toContain('await cacheMetaZusammenfuehren("kontakte", id!, {');
    expect(block.indexOf("await cacheMetaZusammenfuehren")).toBeLessThan(block.indexOf('toast({ title: "Löschanfrage abgelehnt" });'));
    expect(profil).not.toContain("delete currentMeta.deleteRequested;");
  });
});
