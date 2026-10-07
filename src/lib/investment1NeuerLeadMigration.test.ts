import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Migration investment1_neuer_lead (07.10.2026): Jeder neue Kontakt bekommt
 * "Investment 1" in der Stufe "Neuer Lead". Ausfuehren laesst sie sich hier
 * nicht; der Test haelt fest, was der Trigger und die Formular-Anlage setzen.
 */

const SQL = readFileSync("supabase/migrations/20261007120000_investment1_neuer_lead.sql", "utf8");
const ohneKommentare = SQL.split("\n").map((z) => (z.includes("--") ? z.slice(0, z.indexOf("--")) : z)).join("\n");

describe("Investment 1 startet bei Neuer Lead", () => {
  it("der Trigger legt Investment 1 in neuer_lead an, nicht mehr in erstgespraech", () => {
    const funktion = ohneKommentare.slice(0, ohneKommentare.indexOf("$$;"));
    expect(funktion).toContain("'pipelineStufe', 'neuer_lead'");
    expect(funktion).not.toContain("'erstgespraech'");
  });

  it("Bestandskunden bleiben ohne Auto-Investment", () => {
    expect(ohneKommentare).toMatch(/= 'bestandsimport' THEN\s+RETURN NEW;/);
  });

  it("der Altbestand wird nur bei Kontakten angefasst, die selbst neuer Lead sind", () => {
    const nachFunktion = ohneKommentare.slice(ohneKommentare.indexOf("$$;"));
    const treffer = nachFunktion.match(/COALESCE\(k\.meta->>'pipelineStufe', 'neuer_lead'\) = 'neuer_lead'/g) ?? [];
    // Sicherung, Korrektur und Nachlegen: alle drei mit derselben Bedingung.
    expect(treffer).toHaveLength(3);
  });

  it("sichert die geaenderten Zeilen vorher in einer gesperrten Tabelle", () => {
    expect(ohneKommentare.indexOf("investments_sicherung_20261007")).toBeLessThan(ohneKommentare.indexOf("UPDATE public.investments"));
    expect(ohneKommentare).toContain("ALTER TABLE public.investments_sicherung_20261007 ENABLE ROW LEVEL SECURITY");
  });

  it("die Formular-Anlage (submit-lead) setzt dieselbe Stufe wie der Trigger", () => {
    const anlage = readFileSync("supabase/functions/_shared/handbuch-anlage.ts", "utf8");
    expect(anlage).toContain('label: "Investment 1", pipelineStufe: "neuer_lead"');
    expect(anlage).not.toContain('pipelineStufe: "erstgespraech"');
  });
});
