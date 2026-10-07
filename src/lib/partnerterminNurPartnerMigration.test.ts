import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Migration partnertermin_nur_partner (29.09.2026).
 *
 * Ausführen lässt sie sich hier nicht. Der Quelltext hält fest: Beide
 * Funktionen der Terminseite nehmen nur noch den angemeldeten Besitzer des
 * Links an und sind nur noch für `authenticated` aufrufbar, jede
 * Gesprächsart bekommt ihre eigene Buchung, und ein Investment zählt nur,
 * wenn es zum Kontakt gehört und läuft. Sonst wie 20260929110000.
 */

const DATEI = "20260929130000_partnertermin_nur_partner.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const VORLAGE = readFileSync("supabase/migrations/20260929110000_partnertermin_umlaute.sql", "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;

const ZUGANG = "CREATE OR REPLACE FUNCTION public.partnertermin_zugang(";
const BESTAETIGEN = "CREATE OR REPLACE FUNCTION public.partnertermin_bestaetigen(";

/** Der Funktionsrumpf bis vor COMMENT ON. */
function rumpf(sql: string, kopf: string): string {
  const a = sql.indexOf(kopf);
  expect(a).toBeGreaterThanOrEqual(0);
  const ende = sql.indexOf("COMMENT ON FUNCTION", a);
  expect(ende).toBeGreaterThan(a);
  return sql.slice(a, ende);
}

const PRUEFUNG_ZUGANG = `

  -- Seit 29.09.2026: nur der angemeldete Besitzer des Links. Fremde bekommen
  -- dieselbe Antwort wie bei einem unbekannten Link.
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM _l.mitarbeiter_id THEN
    RETURN NULL;
  END IF;`;

const PRUEFUNG_BESTAETIGEN = `

  -- Seit 29.09.2026: nur der angemeldete Besitzer des Links.
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM _l.mitarbeiter_id THEN
    RAISE EXCEPTION 'Kein Zugang';
  END IF;`;

/** Der neue Vorschub: das feststehende Investment direkt, sonst der alte Weg. */
function vorschub(sql: string): string {
  const b = rumpf(sql, BESTAETIGEN);
  const a = b.indexOf("    /*\n     * Seit 29.09.2026: Steht das Investment fest");
  const e = b.indexOf("    END IF;\n  END IF;", a) + "    END IF;\n  END IF;".length;
  expect(a).toBeGreaterThan(0);
  return b.slice(a, e);
}

/** Ohne Kommentare und Leerraum, um Blöcke unabhängig von der Formatierung zu vergleichen. */
const kern = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();

const LAUFEND = "COALESCE(i.status, 'aktiv') NOT IN ('abgeschlossen', 'abgesagt', 'storniert')";

describe("Migration partnertermin_nur_partner", () => {
  it("lässt die Gesprächsarten, Umlaute, Signaturen und Sicherheitsangaben wie in 20260929110000", () => {
    for (const kopf of [ZUGANG, BESTAETIGEN]) {
      const neu = rumpf(SQL, kopf);
      const alt = rumpf(VORLAGE, kopf);
      // Kopf bis AS $$ ist wortgleich.
      expect(neu.slice(0, neu.indexOf("AS $$"))).toBe(alt.slice(0, alt.indexOf("AS $$")));
      for (const name of ["'Erstgespräch'", "'Beratungsgespräch'", "'Objektgespräch'", "'Finanzierungsgespräch'"]) {
        expect(neu).toContain(name);
      }
    }
    expect(rumpf(SQL, BESTAETIGEN)).toContain(
      "WHEN 'erstgespraech'     THEN 'erstgespraech_geplant'\n    WHEN 'beratung'          THEN 'beratungsgespraech'\n    WHEN 'objektvorstellung' THEN 'objektauswahl'",
    );
  });

  /*
    BLOCKER aus der Gegenprüfung vom 29.09.2026: Das Investment am Link wurde
    ungeprüft übernommen. Ein Partner hätte seinen eigenen Link per direktem
    Aufruf auf ein fremdes Investment setzen und es vorrücken lassen können.
  */
  it("nimmt das Investment am Link und die Auswahl nur, wenn sie zum Kontakt gehören und laufen", () => {
    const b = kern(rumpf(SQL, BESTAETIGEN));
    expect(b).toContain(kern(`SELECT i.id INTO _investment FROM public.investments i
      WHERE i.id = _l.investment_id AND i.kunde_id = _l.kontakt_id AND ${LAUFEND};`));
    expect(b).toContain(kern(`SELECT i.id INTO _investment FROM public.investments i
      WHERE i.id = _investment_id AND i.kunde_id = _l.kontakt_id AND ${LAUFEND};`));
    expect(b).not.toContain("_investment := _l.investment_id");
    const z = kern(rumpf(SQL, ZUGANG));
    expect(z).toContain(kern(`SELECT i.id INTO _link_investment FROM public.investments i
      WHERE i.id = _l.investment_id AND i.kunde_id = _l.kontakt_id AND ${LAUFEND};`));
    expect(z).not.toContain("_link_investment := _l.investment_id");
    // uuid gegen uuid, nie über Text.
    expect(b).not.toMatch(/(kunde_id|investment_id|_investment)::text/);
  });

  /*
    Bei mehreren Investments rückte bisher keines vor, denn
    `buchung_investment_vorwaerts` greift nur bei genau einem.
  */
  it("rückt ein feststehendes Investment direkt vor, nur vorwärts und nur pipelineStufe", () => {
    const v = vorschub(SQL);
    expect(v).toContain("IF _investment IS NOT NULL THEN");
    expect(v).toContain("SET meta = COALESCE(i.meta, '{}'::jsonb) || jsonb_build_object('pipelineStufe', _stufe)");
    expect(v).toContain("WHERE i.id = _investment\n        AND i.kunde_id = _l.kontakt_id");
    expect(v).toMatch(/buchung_pipeline_rang\(_stufe\)\s+> public\.buchung_pipeline_rang\(/);
    expect(v).toContain("ELSE\n      PERFORM public.buchung_investment_vorwaerts(_l.kontakt_id, _stufe);");
    // uuid gegen uuid, nie über Text.
    expect(v).not.toMatch(/::text/);
  });

  it("schreibt nicht mehr, der Kunde habe bestätigt", () => {
    const b = rumpf(SQL, BESTAETIGEN);
    expect(b).not.toMatch(/Vom Kunden/);
    expect(b.match(/über die Terminseite eingetragen/gi)).toHaveLength(3);
    for (const t of b.match(/'[^']*eingetragen[^']*'/g) ?? []) expect(t).not.toMatch(/[–—]/);
  });

  it("sperrt je Link, bevor die vorhandene Buchung nachgeschlagen wird", () => {
    const b = rumpf(SQL, BESTAETIGEN);
    expect(b.indexOf("pg_advisory_xact_lock(hashtext(_l.id::text))")).toBeLessThan(b.indexOf("SELECT b.* INTO _alt"));
  });

  /*
    Christians Ablauf: Jede Gesprächsart wird eigens eingetragen. Bisher
    überschrieb ein Beratungsgespräch das Erstgespräch am selben Link.
  */
  it("aktualisiert nur eine Buchung derselben Gesprächsart, die nicht vorbei ist, sonst legt es neu an", () => {
    const b = kern(rumpf(SQL, BESTAETIGEN));
    expect(b).toContain(kern(`SELECT b.* INTO _alt FROM public.buchungen b
      WHERE b.link_id = _l.id AND b.status <> 'abgesagt' AND b.anlass = _anlass
        AND b.start_at >= now() - interval '1 hour'
      ORDER BY b.created_at DESC LIMIT 1; IF FOUND THEN UPDATE public.buchungen b`));
    // Der alte Fall, die jüngste Buchung jeder Gesprächsart zu überschreiben, ist weg.
    expect(b).not.toContain("IF FOUND AND _l.einmalig THEN");
  });

  it("lässt einen einmaligen Link bei genau einer Buchung, geprüft unter der Sperre", () => {
    const b = kern(rumpf(SQL, BESTAETIGEN));
    const einmalig = kern(`IF _l.einmalig AND EXISTS ( SELECT 1 FROM public.buchungen b
      WHERE b.link_id = _l.id AND b.status <> 'abgesagt' ) THEN
      RAISE EXCEPTION 'Über diesen Link steht bereits ein Termin';`);
    expect(b).toContain(einmalig);
    expect(b.indexOf("pg_advisory_xact_lock")).toBeLessThan(b.indexOf(einmalig));
  });

  it("liefert der Seite je Gesprächsart den letzten Termin mit Korrigierbarkeit und Investment", () => {
    const z = kern(rumpf(SQL, ZUGANG));
    expect(z).toContain("SELECT DISTINCT ON (b.anlass)");
    expect(z).toContain("'korrigierbar', b.start_at >= now() - interval '1 hour'");
    expect(z).toContain("g.meeting_aktivitaet_id = b.aktivitaet_id");
    expect(z).toContain("ORDER BY b.anlass, b.created_at DESC");
    expect(z).toContain("'termine', _termine");
    expect(kern(rumpf(SQL, BESTAETIGEN))).toContain("'korrigierbar', true");
  });

  it("prüft in beiden Funktionen den Besitzer direkt nach dem Link", () => {
    expect(rumpf(SQL, ZUGANG)).toContain(PRUEFUNG_ZUGANG);
    expect(rumpf(SQL, BESTAETIGEN)).toContain(PRUEFUNG_BESTAETIGEN);
    // Die Prüfung steht vor jedem Lesen von Berater, Kunde oder Investments.
    const z = rumpf(SQL, ZUGANG);
    expect(z.indexOf(PRUEFUNG_ZUGANG)).toBeLessThan(z.indexOf("FROM public.profiles p"));
    const b = rumpf(SQL, BESTAETIGEN);
    expect(b.indexOf(PRUEFUNG_BESTAETIGEN)).toBeLessThan(b.indexOf("FROM public.profiles p"));
  });

  it("nimmt Besuchern und PUBLIC das Aufrufrecht und gibt es nur Angemeldeten", () => {
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.partnertermin_zugang(text) FROM PUBLIC, anon;");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.partnertermin_zugang(text) TO authenticated;");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.partnertermin_bestaetigen(text, text, text, text, uuid) FROM PUBLIC, anon;");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.partnertermin_bestaetigen(text, text, text, text, uuid) TO authenticated;");
    expect(SQL).not.toMatch(/TO[^;]*\banon\b/);
    expect(SQL).not.toMatch(/DROP FUNCTION|DELETE FROM|UPDATE public\.buchung_links/);
  });

  it("liegt, solange sie offen ist, gleichlautend im Eingangskorb, in der Sammeldatei und in der Prüfung", () => {
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    const alle = readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8");
    expect(alle).toContain(SQL.trim());
    expect(alle).toContain(`-- Teil 1: ${DATEI}`);
    const pruefung = readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8");
    for (const zeile of ["'49.1 Terminseite", "'49.2 Terminseite", "'49.3 Terminseite"]) expect(pruefung).toContain(zeile);
    // Nur die letzte Prüfzeile trägt ein Semikolon.
    expect(pruefung.match(/END;\s*$/gm)).toHaveLength(1);
    expect(pruefung.trimEnd().endsWith("END;")).toBe(true);
    // 41.x darf nach dieser Migration nicht mehr „fehlt“ melden: Besucher dürfen nicht mehr, der Text ist neu.
    const teil41 = pruefung.slice(pruefung.indexOf("'41.1"), pruefung.indexOf("'42.1"));
    expect(teil41).not.toContain("has_function_privilege('anon'");
    expect(teil41).not.toContain("über die Terminseite bestätigt");
  });
});
