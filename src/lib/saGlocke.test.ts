import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SA_GLOCKE_LEITUNG_ROLLEN,
  saGlockeLeitung,
  saGlockeLeitungZeilen,
} from "../../supabase/functions/_shared/sa-glocke.ts";

/**
 * Glocke nach einer Selbstauskunft (Christians Entscheidung vom 28.09.2026).
 * Mit Zuständigem nur an ihn, über `zustaendig_id`, ohne Namenssuche. Ohne
 * Zuständigen bei jedem Lead an Admin, Inhaber und Vertriebsleitung.
 */

/** user_roles mit mehreren Rollen je Person, wie in der Datenbank. */
const ROLLEN = [
  { user_id: "u-admin", role: "admin" },
  { user_id: "u-admin", role: "inhaber" }, // Mehrfachrolle
  { user_id: "u-inhaber", role: "inhaber" },
  { user_id: "u-vl", role: "vertriebsleiter" },
  { user_id: "u-vl", role: "vertriebspartner" },
  { user_id: "u-setterin", role: "setterin" },
  { user_id: "u-backoffice", role: "backoffice" },
  { user_id: "u-vp", role: "vertriebspartner" },
];

function rollenClient() {
  const abgefragt: { tabelle?: string; rollen?: readonly string[] } = {};
  const client = {
    from(tabelle: string) {
      abgefragt.tabelle = tabelle;
      return {
        select: () => ({
          in: async (_spalte: string, rollen: readonly string[]) => {
            abgefragt.rollen = rollen;
            return { data: ROLLEN.filter((r) => rollen.includes(r.role)).map(({ user_id }) => ({ user_id })), error: null };
          },
        }),
      };
    },
  };
  return { client, abgefragt };
}

const QUELLE = readFileSync("supabase/functions/finalize-selbstauskunft/index.ts", "utf8");

describe("Glocke nach der Selbstauskunft", () => {
  it("ohne Zuständigen: Admin, Inhaber und Vertriebsleitung, jede Person einmal", async () => {
    const { client, abgefragt } = rollenClient();
    const ids = await saGlockeLeitung(client);
    expect(abgefragt.tabelle).toBe("user_roles");
    expect([...(abgefragt.rollen || [])].sort()).toEqual(["admin", "inhaber", "vertriebsleiter"]);
    expect(ids.sort()).toEqual(["u-admin", "u-inhaber", "u-vl"]);
  });

  it("nie an Setterin, Backoffice oder alle Partner", async () => {
    const { client } = rollenClient();
    const ids = await saGlockeLeitung(client);
    expect(ids).not.toContain("u-setterin");
    expect(ids).not.toContain("u-backoffice");
    expect(ids).not.toContain("u-vp");
    for (const rolle of ["setterin", "backoffice", "vertriebspartner"]) {
      expect(SA_GLOCKE_LEITUNG_ROLLEN).not.toContain(rolle);
    }
  });

  it("Fehler der Rollenabfrage kommt beim Aufrufer an, der ihn protokolliert", async () => {
    const client = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: new Error("weg") }) }) }) };
    await expect(saGlockeLeitung(client)).rejects.toThrow("weg");
  });

  it("Handbuch-Lead und anderer Lead: Link als Pfad auf den Kunden, eine Zeile je Person", () => {
    for (const ausHandbuch of [true, false]) {
      const zeilen = saGlockeLeitungZeilen(["u-admin", "u-admin", "u-vl"], "k-1", "Kunde Beispiel", ausHandbuch);
      expect(zeilen.map((z) => z.benutzer_id)).toEqual(["u-admin", "u-vl"]);
      for (const z of zeilen) {
        expect(z.link).toBe("/kunden/k-1");
        expect(z.titel).toBe("📝 Selbstauskunft eingegangen: Kunde Beispiel");
        const n = JSON.parse(z.nachricht);
        expect(n.kontaktId).toBe("k-1");
        expect(n.text).not.toMatch(/[–—]/);
        expect(n.text.includes("Handbuch-Seite")).toBe(ausHandbuch);
      }
    }
  });

  it("mit Zuständigem: nur über zustaendig_id, keine Namenssuche mehr", () => {
    expect(QUELLE).not.toMatch(/\.eq\("name",/);
    expect(QUELLE).not.toContain("kontakt?.berater");
    expect(QUELLE).toContain("const beraterId = kontakt?.zustaendig_id;");
    expect(QUELLE).toMatch(/\.from\("profiles"\)\s*\.select\("id, email, name"\)\s*\.eq\("id", beraterId\)/);
  });

  it("ohne Zuständigen gilt für jeden Lead, nicht nur für Handbuch-Leads", () => {
    const leitung = QUELLE.indexOf("if (kontakt && !zustaendig) {");
    const handbuch = QUELLE.indexOf("if (ausHandbuch) {");
    expect(leitung).toBeGreaterThan(0);
    // Der Leitungsblock steht vor und nicht im Handbuch-Block.
    expect(leitung).toBeLessThan(handbuch);
    expect(QUELLE.slice(leitung, handbuch)).toContain("saGlockeLeitungZeilen(empfaenger, kontaktId, kundeName, !!ausHandbuch)");
    expect(QUELLE).not.toContain('"setterin"');
    expect(QUELLE).not.toContain("/lead-verwaltung");
  });
});
