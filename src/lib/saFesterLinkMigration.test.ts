import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Migration sa_fester_link (07.10.2026).
 *
 * Ausführen lässt sie sich hier nicht. Der Quelltext hält fest: Offene Links
 * werden nie geleert oder gelöscht; Ausstellen widerruft andere Empfänger
 * und verwendet denselben wieder; Öffnen und Speichern verlängern; Person 2
 * sieht und schreibt nur ihren Teil; Schreiben nur unter Sperre und für das
 * eigene Investment; Nachfolger nur aus demselben Vorgang; Glocke nur an den
 * Zuständigen mit Bremse je Vorgang; Rechte eng.
 */

const DATEI = "20261007100000_sa_fester_link.sql";
const SQL = readFileSync(`supabase/migrations/${DATEI}`, "utf8");
const KORB_PFAD = `supabase/migrations-inbox/${DATEI}`;

const ohneKommentare = (s: string) => s.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");
const CODE = ohneKommentare(SQL);

/** Rumpf einer Funktion bis zum schliessenden Dollar-Zeichen. */
function funktion(name: string): string {
  const kopf = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const a = CODE.indexOf(kopf);
  expect(a, name).toBeGreaterThanOrEqual(0);
  const start = CODE.indexOf("AS $$", a);
  return CODE.slice(a, CODE.indexOf("\n$$;", start + 5));
}

const OEFFENTLICH = ["get_sa_fill_token", "mark_sa_link_opened", "update_sa_fill_token_data", "sa_link_nachfolger", "sa_neuen_link_anfordern"];
const ALLE = [...OEFFENTLICH, "cleanup_expired_tokens", "sa_link_ausstellen", "sa_link_abschliessen", "sa_daten_sicht", "sa_daten_fuer_person", "sa_als_uuid", "sa_signatur_passt"];

describe("Migration sa_fester_link", () => {
  it("Aufräumen: kein Löschen und Leeren offener Links mehr, nur abgeschlossene", () => {
    const f = funktion("cleanup_expired_tokens");
    const leeren = f.slice(f.indexOf("UPDATE public.sa_fill_tokens"), f.indexOf("GET DIAGNOSTICS v_sa_geleert"));
    for (const zeile of ["prefill_data     = NULL", "email            = ''", "name             = ''", "WHERE status = 'used'", "updated_at < now() - interval '30 days'"]) {
      expect(leeren).toContain(zeile);
    }
    const gesetzt = leeren.slice(leeren.indexOf("SET"), leeren.indexOf("WHERE"));
    for (const feld of ["token", "kontakt_id", "investment_id", "person_nr", "status", "expires_at", "created_at"]) {
      expect(gesetzt).not.toMatch(new RegExp(`\\b${feld}\\s+=`));
    }
    expect(f).toMatch(/DELETE FROM public\.sa_fill_tokens\s+WHERE status = 'used'\s+AND expires_at IS NOT NULL AND expires_at < now\(\) - interval '180 days';/);
    expect(f.match(/DELETE FROM public\.sa_fill_tokens/g)).toHaveLength(1);
    expect(f).not.toMatch(/DELETE\s+FROM\s+public\.mobile_scan_sessions/);
  });

  it("Bestand: nur offene, gültige Links mit weniger als 30 Tagen Rest, also wiederholbar ohne Dauerverlängerung", () => {
    expect(CODE).toMatch(/UPDATE public\.sa_fill_tokens\s+SET expires_at = now\(\) \+ interval '30 days'\s+WHERE status = 'pending'\s+AND expires_at > now\(\)\s+AND expires_at < now\(\) \+ interval '30 days';/);
  });

  it("Ausstellen: widerruft andere Empfänger, verwendet dieselbe Adresse wieder, alles unter einer Sperre", () => {
    const f = funktion("sa_link_ausstellen");
    expect(f).toContain("PERFORM pg_advisory_xact_lock(hashtext('sa_link:' || _kontakt_id || ':' || _investment_id || ':' || _person_nr));");
    const widerruf = f.slice(f.indexOf("SET status = 'widerrufen'"), f.indexOf("GET DIAGNOSTICS _widerrufen"));
    for (const b of ["kontakt_id = _kontakt_id", "investment_id = _investment_id", "person_nr = _person_nr", "status = 'pending'", "lower(btrim(email)) <> lower(btrim(_email))"]) {
      expect(widerruf).toContain(b);
    }
    // Widerruf vor der Suche nach dem wiederverwendbaren Link.
    expect(f.indexOf("SET status = 'widerrufen'")).toBeLessThan(f.indexOf("FOR UPDATE"));
    expect(f).toContain("AND NOT coalesce(nur_am_link, false)");
    expect(f).toContain("AND lower(btrim(email)) = lower(btrim(_email))");
    expect(f).toContain("expires_at = greatest(expires_at, now() + interval '30 days')");
    expect(f).toContain("_person_nr NOT IN (1, 2)");
    // Die Kopie für Person 2 nur mit ihrem Teil.
    expect(f).toContain("_kopie jsonb := public.sa_daten_sicht(_person_nr, _prefill);");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.sa_link_ausstellen(text, text, integer, text, text, uuid, jsonb) FROM public, anon, authenticated;");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.sa_link_ausstellen(text, text, integer, text, text, uuid, jsonb) TO service_role;");
  });

  it("Person 2: Lesen nur person2Data, Schreiben trägt nur person2Data ein", () => {
    const sicht = funktion("sa_daten_sicht");
    expect(sicht).toContain("WHEN _person_nr = 2 THEN jsonb_build_object(\n      'person2', true,\n      'person2Data'");
    expect(sicht).toContain("ELSE _daten");
    const schreiben = funktion("sa_daten_fuer_person");
    expect(schreiben).toMatch(/WHEN _person_nr = 2 THEN\s+\(CASE WHEN jsonb_typeof\(_bestand\) = 'object' THEN _bestand ELSE '\{\}'::jsonb END\)\s+\|\| jsonb_build_object\(/);
    expect(schreiben).toContain("ELSE _eingabe");
    const lesen = funktion("get_sa_fill_token");
    expect(lesen).toContain("_zeile.prefill_data := public.sa_daten_sicht(_zeile.person_nr, _zeile.prefill_data);");
    const speichern = funktion("update_sa_fill_token_data");
    expect(speichern).toContain("SET prefill_data = public.sa_daten_sicht(v_token_row.person_nr, _data)");
    expect(speichern).toContain("'saData', public.sa_daten_fuer_person(v_token_row.person_nr, _data, meta -> 'saData'))");
  });

  it("Lesen: Stand vom eigenen Investment, geschlossene Links ohne Daten", () => {
    const f = funktion("get_sa_fill_token");
    expect(f).toContain("IF NOT coalesce(_zeile.status = 'pending' AND _zeile.expires_at > now(), false) THEN");
    // Bei geschlossenem Link endet die Funktion vor dem Investment.
    const geschlossen = f.slice(f.indexOf("IF NOT coalesce(_zeile.status"), f.indexOf("IF NOT coalesce(_zeile.nur_am_link"));
    expect(geschlossen).toContain("_zeile.prefill_data := NULL;");
    expect(geschlossen).toContain("RETURN _zeile;");
    expect(f).toContain("WHERE i.id = public.sa_als_uuid(_zeile.investment_id)\n       AND i.kunde_id = public.sa_als_uuid(_zeile.kontakt_id)");
  });

  it("Schreiben: Sperre, Status und Ablauf unter der Sperre, Investment muss zum Kontakt gehören", () => {
    const f = funktion("update_sa_fill_token_data");
    expect(f).toContain("SELECT * INTO v_token_row FROM public.sa_fill_tokens WHERE token = _token FOR UPDATE;");
    const sperre = f.indexOf("FOR UPDATE");
    expect(sperre).toBeLessThan(f.indexOf("IF v_token_row.status <> 'pending' THEN"));
    expect(sperre).toBeLessThan(f.indexOf("IF v_token_row.expires_at < now() THEN"));
    const zuordnung = f.indexOf("RETURN jsonb_build_object('success', false, 'error', 'zuordnung');");
    expect(zuordnung).toBeGreaterThan(0);
    expect(f).toContain("WHERE i.id = public.sa_als_uuid(v_token_row.investment_id)\n       AND i.kunde_id = public.sa_als_uuid(v_token_row.kontakt_id)");
    // Erst die Prüfung, dann jedes Schreiben.
    expect(zuordnung).toBeLessThan(f.indexOf("UPDATE public.sa_fill_tokens"));
    expect(zuordnung).toBeLessThan(f.indexOf("UPDATE public.investments"));
    expect(f).toContain("expires_at = greatest(expires_at, now() + interval '30 days')");
    expect(f).toContain("IF NOT v_token_row.nur_am_link THEN");
  });

  it("Öffnen verlängert nur einen offenen, gültigen Link", () => {
    const f = funktion("mark_sa_link_opened");
    expect(f).toContain("expires_at      = greatest(expires_at, now() + interval '30 days')");
    expect(f).toContain("AND status = 'pending'\n     AND expires_at > now();");
  });

  it("Nachfolger: nur offener Link, derselbe Vorgang und Empfänger, Nachfolger selbst gültig", () => {
    const f = funktion("sa_link_nachfolger");
    expect(f).toContain("IF NOT FOUND OR _alt.status <> 'pending' THEN");
    for (const b of [
      "n.kontakt_id = _alt.kontakt_id",
      "n.investment_id = _alt.investment_id",
      "n.person_nr = _alt.person_nr",
      "lower(btrim(n.email)) = lower(btrim(_alt.email))",
      "n.created_at > _alt.created_at",
      "n.status = 'pending'",
      "n.expires_at > now()",
    ]) {
      expect(f).toContain(b);
    }
    expect(f).toContain("SELECT n.token INTO _neu");
  });

  it("Neuen Link anfordern: Glocke an den Zuständigen, Bremse je Kontakt und Investment", () => {
    const f = funktion("sa_neuen_link_anfordern");
    expect(f).toContain("IF NOT FOUND OR _z.status <> 'pending' OR coalesce(_z.expires_at > now(), false) THEN");
    expect(f).toContain("PERFORM pg_advisory_xact_lock(hashtext('sa_neuer_link:' || _z.kontakt_id || ':' || _z.investment_id));");
    const bremse = f.slice(f.indexOf("IF EXISTS ("), f.indexOf("RETURN 'schon_angefordert';"));
    expect(bremse).toContain("t.kontakt_id = _z.kontakt_id");
    expect(bremse).toContain("t.investment_id = _z.investment_id");
    expect(bremse).toContain("t.neuer_link_angefordert_am > now() - interval '24 hours'");
    expect(bremse).not.toContain("t.token");
    expect(f).toContain("IF _zustaendig IS NOT NULL THEN");
    expect(f).toContain("ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role, 'vertriebsleiter'::public.app_role)");
    expect(f).not.toMatch(/vertriebspartner/);
    expect(f).toContain("coalesce(k.geloescht, false) = false");
    expect(f).not.toMatch(/[–—]/);
  });

  it("Abschicken: Sperre, nur pending zu used, Person gebunden, Stand atomar gegen das Investment", () => {
    const f = funktion("sa_link_abschliessen");
    const sperre = f.indexOf("SELECT * INTO _z FROM public.sa_fill_tokens WHERE token = _token FOR UPDATE;");
    expect(sperre).toBeGreaterThan(0);
    const schon = f.indexOf("IF _z.status = 'used' THEN\n    RETURN jsonb_build_object('ergebnis', 'schon_abgeschlossen');");
    const abgelehnt = f.indexOf("IF _z.status <> 'pending' OR NOT coalesce(_z.expires_at > now(), false) THEN");
    expect(sperre).toBeLessThan(schon);
    expect(schon).toBeLessThan(abgelehnt);
    // Person vor jedem Schreiben geprüft.
    const person = f.indexOf("IF NOT public.sa_signatur_passt(_z.person_nr, _sig ->> 'personType') THEN");
    expect(person).toBeGreaterThan(abgelehnt);
    expect(person).toBeLessThan(f.indexOf("UPDATE public.investments"));
    expect(person).toBeLessThan(f.indexOf("INSERT INTO public.signature_requests"));
    // Zuordnung Investment zu Kontakt vor jedem Schreiben.
    expect(f.indexOf("RETURN jsonb_build_object('ergebnis', 'zuordnung');")).toBeLessThan(f.indexOf("UPDATE public.investments"));
    // Stand im UPDATE selbst gemergt, nicht aus einem früher gelesenen Wert.
    expect(f).toContain("'saData', public.sa_daten_fuer_person(_z.person_nr, _sa_data, meta -> 'saData'),");
    expect(f).toContain("AND r.meta ->> 'saFassung' = _fassung");
    expect(f).toContain("SET status = 'used', abgeschlossen_am = now()\n   WHERE id = _z.id AND status = 'pending';");
    expect(CODE).toContain("ADD COLUMN IF NOT EXISTS abgeschlossen_am timestamptz,");
    expect(CODE).toContain("ADD COLUMN IF NOT EXISTS p2_nachforderung_am timestamptz;");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.sa_link_abschliessen(text, jsonb, jsonb, timestamptz) FROM public, anon, authenticated;");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.sa_link_abschliessen(text, jsonb, jsonb, timestamptz) TO service_role;");
    const passt = funktion("sa_signatur_passt");
    expect(passt).toContain("WHEN _person_nr = 2 THEN lower(btrim(coalesce(_person_type, ''))) = 'person2' ELSE true END");
  });

  it("Rechte: PUBLIC entzogen, nur nötige Rollen, search_path mit pg_temp, Tabellen mit Schema", () => {
    for (const name of OEFFENTLICH) {
      const sig = name === "update_sa_fill_token_data" ? "text, jsonb" : "text";
      expect(SQL).toContain(`REVOKE ALL ON FUNCTION public.${name}(${sig}) FROM public;`);
      expect(SQL).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(${sig}) TO anon, authenticated;`);
      expect(SQL.indexOf(`REVOKE ALL ON FUNCTION public.${name}(`)).toBeLessThan(SQL.indexOf(`GRANT EXECUTE ON FUNCTION public.${name}(`));
    }
    for (const name of ["cleanup_expired_tokens", "sa_daten_sicht", "sa_daten_fuer_person", "sa_als_uuid", "sa_signatur_passt"]) {
      expect(SQL).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM public, anon, authenticated;`));
      expect(SQL).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\(`));
    }
    for (const name of ALLE) {
      expect(funktion(name)).toContain("SET search_path = public, pg_temp");
    }
    expect(CODE).not.toMatch(/(FROM|UPDATE|INTO|JOIN)\s+(sa_fill_tokens|investments|kontakte|benachrichtigungen|user_roles)\b/);
    expect(CODE).not.toMatch(/[\s(]sa_fill_tokens%ROWTYPE/);
    expect(SQL).not.toMatch(/DROP FUNCTION/);
    expect(CODE).toContain("BEGIN;");
    expect(CODE.trim().endsWith("COMMIT;")).toBe(true);
  });

  it("liegt, solange sie offen ist, gleichlautend im Eingangskorb, in der Sammeldatei, im README und in der Prüfung", () => {
    if (!existsSync(KORB_PFAD)) return;
    expect(readFileSync(KORB_PFAD, "utf8")).toBe(SQL);
    const alle = readFileSync("supabase/migrations-inbox/00_ALLE_ZUSAMMEN.sql", "utf8");
    expect(alle).toContain(SQL.trim());
    if (alle.includes("Teil: 20261004130000_absicherung_lesen.sql")) {
      expect(alle.indexOf(`Teil: ${DATEI}`)).toBeGreaterThan(alle.indexOf("Teil: 20261004130000_absicherung_lesen.sql"));
    }
    expect(readFileSync("supabase/migrations-inbox/README.md", "utf8")).toContain(DATEI);
    const pruefung = readFileSync("supabase/migrations-inbox/99_PRUEFUNG.sql", "utf8");
    for (const nr of ["91.1", "91.2", "91.3", "91.4", "91.5", "91.6", "91.7"]) expect(pruefung).toContain(`'${nr} `);
  });
});
