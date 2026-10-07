import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
  Die alte Objektansicht ist fuer Rollen, die die neue Objektseite nicht
  oeffnen, der einzige Weg zu den Objektunterlagen (etwa die Finanzierung).
  Der ZIP-Download war dort geschrieben, aber an keinen Knopf angeschlossen.
  Seit dem 24.09.2026 haengt er neben "Objektunterlagen".
*/
const QUELLE = readFileSync(resolve(__dirname, "ObjektDetail.tsx"), "utf8");

describe("Objektunterlagen als ZIP in der alten Objektansicht", () => {
  it("haengt der Knopf an handleDownloadAll", () => {
    expect(QUELLE).toMatch(/onClick=\{handleDownloadAll\}/);
    expect(QUELLE).toContain("Alle als ZIP");
  });

  it("zeigt ihn der Kundenrolle nicht", () => {
    const stelle = QUELLE.slice(QUELLE.indexOf("Alle als ZIP") - 600, QUELLE.indexOf("Alle als ZIP"));
    expect(stelle).toContain('user.role !== "kunde"');
  });

  it("laesst keinen zweiten Lauf zu, solange einer packt", () => {
    expect(QUELLE).toMatch(/if \(zipLaeuft\) return;/);
    expect(QUELLE).toMatch(/disabled=\{zipLaeuft\}/);
  });
});
