/**
 * Exposés lesen nur, solange man den Kunden sehen darf (Prüfung Codex vom
 * 05.10.2026): Migration 20261005110000 und ihr Platz im Eingangskorb.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const lies = (pfad: string) => readFileSync(pfad, "utf8");

const DATEI = "20261005110000_expose_lesen_nach_kundenzugriff.sql";
const SQL = lies(`supabase/migrations/${DATEI}`);
const ohneKommentare = SQL.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

describe(DATEI, () => {
  it("ersetzt nur die Leseregel, ändert keine Daten und ist wiederholbar", () => {
    expect(ohneKommentare).toContain('DROP POLICY IF EXISTS "Exposes lesen" ON public.objekt_exposes;');
    expect(ohneKommentare).toContain("FOR SELECT TO authenticated");
    expect(ohneKommentare).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    expect(ohneKommentare).not.toMatch(/Exposes (anlegen|aendern|loeschen)/);
  });

  it("lässt Admin und Inhaber alles lesen, die neutrale Vorschau nur den Ersteller", () => {
    expect(ohneKommentare).toContain("public.is_admin_role(auth.uid())");
    expect(ohneKommentare).toContain("objekt_exposes.kontakt_id IS NULL\n      AND objekt_exposes.erstellt_von = auth.uid()");
  });

  it("lässt den Ersteller mit Kundenbezug nur lesen, solange er den Kontakt sehen darf", () => {
    expect(ohneKommentare).toContain("objekt_exposes.erstellt_von = auth.uid()\n              AND (");
    expect(ohneKommentare).toContain("COALESCE(public.darf_alle_kunden_sehen(auth.uid()), false)");
    expect(ohneKommentare).toContain("COALESCE(public.is_vp_owner_of_kontakt(auth.uid(), k.zustaendig_id, k.meta), false)");
    // Kein Zweig mehr, in dem der Ersteller ohne Kundenprüfung liest.
    expect(ohneKommentare.match(/erstellt_von = auth\.uid\(\)/g)).toHaveLength(2);
  });

  it("bricht ab, bevor sie etwas ändert, wenn eine Hilfsfunktion fehlt", () => {
    expect(SQL.indexOf("RAISE EXCEPTION")).toBeLessThan(SQL.indexOf("DROP POLICY"));
  });

  it("die öffentlichen Wege lesen mit der Dienstrolle und sind nicht betroffen", () => {
    expect(lies("supabase/functions/get-expose/index.ts")).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(lies("supabase/functions/get-kundenansicht/index.ts")).toMatch(/const db = createClient\(Deno\.env\.get\("SUPABASE_URL"\)!, Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)!/);
  });
});

describe("Eingangskorb", () => {
  it("hat die Prüfzeile 86.1, nur die letzte Zeile endet mit Semikolon", () => {
    const pruefung = lies("supabase/migrations-inbox/99_PRUEFUNG.sql");
    expect(pruefung).toContain("SELECT '86.1 ");
    expect(pruefung).toContain("'fehlt (20261005110000 ausfuehren)'");
    const schluss = pruefung.split("\n").filter((z) => !z.trim().startsWith("--") && z.trimEnd().endsWith(";"));
    // Seit 87.1 bis 87.3 (20261005123000) steht 86.1 nicht mehr am Ende.
    expect(schluss).toHaveLength(1);
  });

  it("liegt, solange offen, unverändert im Korb, in der Sammeldatei und im README", () => {
    const korb = `supabase/migrations-inbox/${DATEI}`;
    if (!existsSync(korb)) return;
    expect(lies(korb)).toBe(SQL);
    expect(lies("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql")).toContain(SQL.trim());
    expect(lies("supabase/migrations-inbox/README.md")).toContain(`\`${DATEI}\``);
  });
});
