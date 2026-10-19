import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * Unterschriebene Selbstauskunft im neuen Design neu ablegen (19.10.2026).
 * Nur Admin und Inhaber, die bisherige Datei bleibt archiviert. Geprüft am
 * Quelltext der Function, wie die übrigen Tests zu finalize-selbstauskunft.
 */
const QUELLE = readFileSync("supabase/functions/finalize-selbstauskunft/index.ts", "utf8");

describe("finalize-selbstauskunft: neue Fassung", () => {
  it("erlaubt die neue Fassung nur Admin und Inhaber", () => {
    expect(QUELLE).toContain('.in("role", ["admin", "inhaber"])');
    expect(QUELLE).toMatch(/neueFassung === true && !\(await istAdminOderInhaber\(/);
    expect(QUELLE).toContain("status: 403");
  });

  it("ersetzt ohne neue Fassung weiterhin nichts", () => {
    expect(QUELLE).toContain("if (vorhanden && !neueFassung) return");
  });

  it("archiviert die bisherige Datei", () => {
    expect(QUELLE).toContain("saPdfFruehereFassungen");
    expect(QUELLE).toMatch(/saPdfPath: vorhanden/);
  });
});
