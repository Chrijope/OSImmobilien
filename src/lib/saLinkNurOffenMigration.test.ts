import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Migration sa_link_nur_offen_lesbar (28.09.2026, Leseluecke Stufe 1).
 *
 * Ausfuehren laesst sie sich hier nicht. Der Quelltext haelt fest: Den
 * gespeicherten Stand gibt `get_sa_fill_token` nur bei offenem und gueltigem
 * Link heraus, bei abgeschicktem oder abgelaufenem Link sind alle
 * personenbezogenen Felder leer. Der uebrige Rumpf, die Rechte und die
 * Signatur bleiben wie in 20260925180000.
 */

const DATEI = "20260928220000_sa_link_nur_offen_lesbar.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;
const KOPF = "CREATE OR REPLACE FUNCTION public.get_sa_fill_token(";

function funktion(sql: string): string {
  const a = sql.indexOf(KOPF);
  expect(a).toBeGreaterThanOrEqual(0);
  return sql.slice(a, sql.indexOf("\n$$;", a) + 4);
}

const ohneKommentare = (s: string) => s.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

/** Der Block, der bei geschlossenem Link leert. */
function leerBlock(): string {
  const f = funktion(SQL);
  const a = f.indexOf("IF NOT coalesce(");
  expect(a).toBeGreaterThanOrEqual(0);
  return f.slice(a, f.indexOf("END IF;", a));
}

describe("Migration sa_link_nur_offen_lesbar", () => {
  it("offener Link: Daten nur bei Status pending und noch nicht abgelaufen", () => {
    // coalesce(..., false): Ein unbekannter Zustand gilt als geschlossen.
    expect(leerBlock()).toContain("IF NOT coalesce(_zeile.status = 'pending' AND _zeile.expires_at > now(), false) THEN");
  });

  it("abgeschickter oder abgelaufener Link: Stand, Name, E-Mail und Zuordnung leer", () => {
    const block = leerBlock();
    for (const zeile of [
      "_zeile.prefill_data := NULL;",
      "_zeile.email := '';",
      "_zeile.name := '';",
      "_zeile.kontakt_id := NULL;",
      "_zeile.investment_id := NULL;",
      "_zeile.created_by := NULL;",
    ]) {
      expect(block).toContain(zeile);
    }
    // Was die Seite fuer "Bereits ausgefuellt" und "Link abgelaufen" braucht, bleibt.
    for (const feld of ["id", "status", "expires_at", "sprache"]) {
      expect(block).not.toContain(`_zeile.${feld} :=`);
    }
  });

  it("ermittelt die Sprache vor dem Leeren, sie braucht kontakt_id", () => {
    const f = funktion(SQL);
    expect(f.indexOf("public.kontakt_sprache(_zeile.kontakt_id)")).toBeLessThan(f.indexOf("IF NOT coalesce("));
  });

  it("laesst Signatur, Sicherheit, Rechte und den uebrigen Rumpf wie in 20260925180000", () => {
    const alt = ohneKommentare(funktion(readFileSync("supabase/migrations/20260925180000_kundensprache_signatur_rpcs.sql", "utf8")));
    const neu = ohneKommentare(funktion(SQL));
    // Neu ist genau der Leer-Block vor RETURN _zeile, sonst Zeile fuer Zeile gleich.
    const ohneLeerzeilen = (s: string) => s.replace(/\n\s*\n/g, "\n");
    expect(ohneLeerzeilen(neu.replace(/\n {2}IF NOT coalesce\([\s\S]*?\n {2}END IF;\n/, "\n"))).toBe(ohneLeerzeilen(alt));
    expect(neu).toContain("RETURNS public.sa_fill_tokens\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER\nSET search_path = public");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.get_sa_fill_token(text) FROM public;");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.get_sa_fill_token(text) TO anon, authenticated;");
    expect(SQL).not.toMatch(/DROP FUNCTION/);
  });

  it("liegt, solange sie offen ist, gleichlautend im Eingangskorb, in der Sammeldatei und in der Pruefung", () => {
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    const alle = readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8");
    expect(alle).toContain(SQL.trim());
    expect(alle).toContain(`-- Teil 6: ${DATEI}`);
    const pruefung = readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8");
    expect(pruefung).toContain("'38.1 Selbstauskunfts-Link");
    expect(pruefung).toContain("_zeile.prefill_data := NULL");
  });
});
