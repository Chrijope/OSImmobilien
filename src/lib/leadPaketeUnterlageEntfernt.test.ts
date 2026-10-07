import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ENTFERNTE_DOKUMENT_IDS, seedUnterlagen } from "@/lib/unterlagenSeed";

/**
 * Die veraltete Partnerunterlage "Lead-Pakete & Zuteilung verstehen" und das
 * Lead-Playbook-PDF sind seit dem 29.09.2026 gelöscht (Freigabe von
 * Christian). Weder Route noch Menüeintrag noch Knopf darf zurückkommen.
 */
const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf-8");

describe("Lead-Pakete-Unterlage und Lead-Playbook sind entfernt", () => {
  it("die Dateien gibt es nicht mehr", () => {
    expect(existsSync(resolve(process.cwd(), "src/pages/leadarbeit/LeadPakete.tsx"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/lib/leadPlaybookPdf.ts"))).toBe(false);
  });

  it("keine Route, kein Vorladen, keine Rechte-Zuordnung", () => {
    for (const datei of ["src/App.tsx", "src/lib/routenTabellen.ts", "src/lib/sidebarPermissions.ts", "src/lib/routePrefetch.ts"]) {
      expect(lies(datei), datei).not.toContain("/leadarbeit/lead-pakete");
    }
  });

  it("kein Eintrag unter Unterlagen, auch nicht in gespeicherten Strukturen", () => {
    const ids = seedUnterlagen().flatMap((a) => a.dokumente.map((d) => d.id));
    expect(ids).not.toContain("la-pakete");
    expect(ENTFERNTE_DOKUMENT_IDS).toContain("la-pakete");
  });

  it("kein Knopf ruft das Playbook-PDF mehr auf", () => {
    for (const seite of ["Lead24hRegel", "LeadErstkontakt", "LeadWarmVsKalt", "LeadFollowUp", "LeadFehlerDsgvo"]) {
      const text = lies(`src/pages/leadarbeit/${seite}.tsx`);
      expect(text, seite).not.toContain("leadPlaybookPdf");
      expect(text, seite).not.toContain("Lead-Playbook als PDF");
    }
  });
});
