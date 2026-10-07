import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Migration partnertermin_umlaute (29.09.2026).
 *
 * Ausführen lässt sie sich hier nicht. Der Quelltext hält fest: Beide
 * Funktionen der Terminseite sind wortgleich zu 20260927120000, nur die
 * sichtbaren Texte tragen echte Umlaute. Kennungen, Logik und Rechte bleiben.
 */

const DATEI = "20260929110000_partnertermin_umlaute.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const VORLAGE = readFileSync("supabase/migrations/20260927120000_videocall_nur_geschaeftsfuehrer.sql", "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;

const KOEPFE = [
  "CREATE OR REPLACE FUNCTION public.partnertermin_zugang(",
  "CREATE OR REPLACE FUNCTION public.partnertermin_bestaetigen(",
];

/** Die Funktion samt COMMENT, REVOKE und GRANT, bis zum GRANT-Satz. */
function funktion(sql: string, kopf: string): string {
  const a = sql.indexOf(kopf);
  expect(a).toBeGreaterThanOrEqual(0);
  const ende = sql.indexOf("TO anon, authenticated;", a);
  expect(ende).toBeGreaterThan(a);
  return sql.slice(a, ende);
}

/** Zurück in die Ersatzschreibweise, um gegen die Vorlage zu vergleichen. */
const ersatz = (s: string) =>
  s.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss");

/** Alle SQL-Zeichenketten eines Rumpfs, ohne Kommentarzeilen. */
function literale(rumpf: string): string[] {
  const ohneKommentare = rumpf.replace(/\/\*[\s\S]*?\*\//g, "").split("\n")
    .map((z) => z.replace(/--.*$/, "")).join("\n");
  return [...ohneKommentare.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1]);
}

describe("Migration partnertermin_umlaute", () => {
  it.each(KOEPFE)("%s ist bis auf die Umlaute wortgleich zur Fassung vom 27.09.", (kopf) => {
    const neu = funktion(SQL, kopf);
    const alt = funktion(VORLAGE, kopf);
    expect(neu).not.toBe(alt);
    expect(ersatz(neu)).toBe(alt);
  });

  it.each(KOEPFE)("%s ändert Umlaute nur in Zeichenketten, nie in Code oder Kommentaren", (kopf) => {
    const ohneLiterale = funktion(SQL, kopf).replace(/'(?:[^']|'')*'/g, "''");
    expect(ohneLiterale).not.toMatch(/[äöüÄÖÜß]/);
  });

  it("lässt die Kennungen der Gesprächsarten und Stufen unangetastet", () => {
    for (const kennung of [
      "('erstgespraech'::text,",
      "('beratung',",
      "('objektvorstellung',",
      "('finanzierungsgespraech',",
      "WHEN 'erstgespraech'     THEN 'erstgespraech_geplant'",
      "WHEN 'beratung'          THEN 'beratungsgespraech'",
      "'persoenlich'",
    ]) {
      expect(SQL).toContain(kennung);
    }
  });

  it("zeigt die vier Gesprächsarten mit echten Umlauten, in beiden Funktionen", () => {
    for (const kopf of KOEPFE) {
      const f = funktion(SQL, kopf);
      for (const name of ["'Erstgespräch'", "'Beratungsgespräch'", "'Objektgespräch'", "'Finanzierungsgespräch'"]) {
        expect(f).toContain(name);
      }
    }
    expect(funktion(SQL, KOEPFE[1])).toContain("'Vom Kunden über die Terminseite bestätigt.'");
  });

  it("hat in den sichtbaren Texten keine Ersatzumlaute mehr", () => {
    const erlaubt = new Set(["zueinander"]);
    for (const kopf of KOEPFE) {
      const texte = literale(funktion(SQL, kopf).split("\nCOMMENT ON FUNCTION")[0])
        // Kennungen wie 'erstgespraech' oder 'erstgespraech_geplant' sind Schlüssel, keine Texte.
        .filter((t) => !/^[a-z_]+$/.test(t));
      const woerter = texte.flatMap((t) => t.split(/[^A-Za-zäöüÄÖÜß]+/));
      const ersatzWoerter = woerter.filter((w) => /ae|oe|ue/i.test(w) && !erlaubt.has(w.toLowerCase()));
      expect(ersatzWoerter).toEqual([]);
    }
  });

  it("lässt Signatur, Sicherheit und Rechte wie bisher und bleibt wiederholbar", () => {
    expect(SQL).toContain("RETURNS jsonb\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER\nSET search_path = public");
    expect(SQL).toContain("RETURNS jsonb\nLANGUAGE plpgsql\nVOLATILE\nSECURITY DEFINER\nSET search_path = public");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.partnertermin_zugang(text) FROM public;");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.partnertermin_zugang(text) TO anon, authenticated;");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.partnertermin_bestaetigen(text, text, text, text, uuid) FROM public;");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.partnertermin_bestaetigen(text, text, text, text, uuid) TO anon, authenticated;");
    expect(SQL).not.toMatch(/DROP FUNCTION/);
    // Außerhalb der beiden Funktionen steht nur BEGIN und COMMIT: keine Datenänderung.
    let rest = SQL.replace(/^--.*$/gm, "");
    for (const kopf of KOEPFE) rest = rest.replace(funktion(SQL, kopf) + "TO anon, authenticated;", "");
    expect(rest.replace(/\s+/g, " ").trim()).toBe("BEGIN; COMMIT;");
  });

  it("schreibt keine Gedankenstriche in sichtbare Texte", () => {
    for (const kopf of KOEPFE) {
      for (const t of literale(funktion(SQL, kopf))) expect(t).not.toMatch(/[–—]/);
    }
  });

  it("liegt, solange sie offen ist, gleichlautend im Eingangskorb, in der Sammeldatei und in der Prüfung", () => {
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    const alle = readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8");
    expect(alle).toContain(SQL.trim());
    expect(alle).toContain(`-- Teil 3: ${DATEI}`);
    const pruefung = readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8");
    expect(pruefung).toContain("'41.1 Terminseite");
    expect(pruefung).toContain("'41.2 Terminseite");
  });
});
