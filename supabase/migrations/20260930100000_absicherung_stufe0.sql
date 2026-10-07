-- ===========================================================================
-- Absicherung Stufe 0: Rechte zurueckschneiden, ohne sichtbare Aenderung
-- ===========================================================================
--
-- GRUNDSATZ (GL, 29.09.2026)
--
-- Direkt in die Datenbank schreiben duerfen nur Admin und Inhaber, alle
-- anderen Rollen nur ueber gepruefte Functions und RPCs. Was heute
-- funktioniert, muss weiter funktionieren. Stufe 0 ist die reine
-- Absicherung: Sie nimmt nur Rechte weg, die nachweislich niemand im Browser
-- braucht. Keine Function auszurollen, keine Daten geaendert.
--
-- WAS SIE TUT
--
--   1. Die manuelle Sicherung `objekte_sicherung_20260922` (97 Objekte) war
--      ohne Zeilensicherheit und fuer anon und authenticated voll les- und
--      schreibbar. Jetzt: Zeilensicherheit an, alle Rechte von anon,
--      authenticated und PUBLIC entzogen. Die Tabelle bleibt stehen. Kein
--      Code, keine Funktion, keine View, keine Regel und kein Cron-Lauf liest
--      sie (geprueft am 29.09.2026).
--
--   2. 36 Hintergrund-, Cron- und Serverfunktionen verlieren das Aufrufrecht
--      fuer anon, authenticated und PUBLIC. Bisher konnte jeder mit der
--      oeffentlichen Adresse etwa `buchung_pipeline_vorwaerts` rufen und damit
--      einen Kunden in der Pipeline weiterschieben, oder `rotate_audit_log`
--      und `purge_old_activity_log` ausloesen. Geprueft je Funktion:
--        - kein `rpc('…')` im Browser (src/), auch nicht ueber Umwege,
--        - Edge Functions rufen sie nur mit dem Dienstschluessel
--          (service_role behaelt das Recht, wird unten ausdruecklich gesetzt),
--        - keine Zeilenregel (auch storage und realtime) und keine View nennt
--          sie,
--        - jeder Aufrufer in der Datenbank ist SECURITY DEFINER oder ein
--          Cron-Lauf, beide laufen als Besitzer und brauchen das Recht nicht,
--        - kein Spalten-Standardwert und keine CHECK-Bedingung nennt sie.
--      Der Waechter unten prueft die Punkte zu Regeln, Views und Aufrufern bei
--      jedem Lauf erneut und bricht ab, wenn sich etwas geaendert hat.
--      `provisionssatz_fuer_partner` und `investment_partner_id` stehen nicht
--      hier, die entzieht bereits 20260929140000.
--
--   3. anon verliert INSERT, UPDATE, DELETE und TRUNCATE auf jeder Tabelle und
--      View im Schema public; authenticated verliert TRUNCATE (TRUNCATE
--      umgeht die Zeilensicherheit). Das aendert heute nichts im Betrieb:
--      Jede Schreibregel, die fuer anon gilt, verlangt `auth.uid()` oder
--      `auth.role() = 'service_role'`, die drei Views laufen mit
--      `security_invoker`, und keine oeffentliche Seite (Kundenlink, Handbuch,
--      Expose, Buchung, Terminwahl, Signatur, SA-Link, Kennenlerngespraech,
--      Bewerbung, Videoraum-Gast) schreibt direkt in eine Tabelle, alle gehen
--      ueber RPCs oder Edge Functions. Deshalb gibt es keine Ausnahme.
--      Das Recht war also ueberall nur noch durch die Zeilenregel gedeckelt;
--      eine einzige zu weit gefasste Regel haette genuegt.
--
--   Storage (storage.objects) und Realtime bleiben unberuehrt.
--
-- WAS SIE NICHT TUT
--
--   - Sie aendert keine Standardrechte (ALTER DEFAULT PRIVILEGES). Eine neue
--     Tabelle oder Funktion bekommt in Supabase weiter automatisch Rechte fuer
--     anon und authenticated. Prueflauf 50.x zeigt so etwas an; dann diese
--     Migration einfach erneut ausfuehren.
--   - Sie entzieht keine Aufrufrechte von Triggerfunktionen (die laufen nur
--     als Ausloeser und lassen sich ueber die Schnittstelle nicht rufen) und
--     keine von reinen Rechenhilfen ohne Datenzugriff.
--
-- ACHTUNG fuer spaetere Migrationen: Wer eine der Funktionen unten mit
-- DROP FUNCTION und CREATE neu anlegt, bekommt wieder die Standardrechte
-- (PUBLIC, anon, authenticated). CREATE OR REPLACE behaelt die Rechte.
--
-- Mehrfach ausfuehrbar. Aendert keine Daten. Pruefzeilen 50.1 bis 50.7.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Waechter: bricht ab, wenn eine Voraussetzung fehlt
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  _funktionen text[] := ARRAY[
    -- Cron und naechtliche Laeufe
    'public.bewerber_formular_aufraeumen()',
    'public.cleanup_activation_tokens()',
    'public.cleanup_ai_rate_limits()',
    'public.cleanup_email_send_log()',
    'public.cleanup_expired_tokens()',
    'public.purge_old_activity_log()',
    'public.purge_old_webhook_audit_logs()',
    'public.rotate_audit_log()',
    'public.videoraeume_aufraeumen()',
    'public.kennzahlen_tagesstand_lauf()',
    'public.kennzahlen_tagesstand_zusatz()',
    -- OSImmobilien: kennzahlen_gespraeche_woche() wird nicht per Migration angelegt
    'public.kennzahl_schreiben(date,text,text,numeric)',
    'public.nachtpruefung_bericht()',
    'public.nachtpruefung_haengende_raeume(timestamp with time zone)',
    'public.nachtpruefung_kontakt_ohne_zustaendigen(timestamp with time zone)',
    'public.nachtpruefung_raeume_nach_termin(timestamp with time zone)',
    'public.nachtpruefung_reservierung_ohne_bonitaet(timestamp with time zone)',
    -- Mailversand (Edge Function process-email-queue, Dienstschluessel)
    -- OSImmobilien: email_queue_dispatch() wird nicht per Migration angelegt
    'public.meeting_mail_claim()',
    'public.meeting_mail_fertig(uuid,uuid,boolean,text)',
    -- interne Schritte der Buchungs- und Bewerberablaeufe
    'public.buchung_pipeline_vorwaerts(uuid,text)',
    'public.buchung_investment_vorwaerts(uuid,text)',
    'public.buchung_termin_belegt(uuid,timestamp with time zone,timestamp with time zone,text,uuid)',
    'public.buchung_zugang_aufloesen(text)',
    'public.bewerber_stufe_closing(uuid)',
    'public.bewerber_termin_gastgeber()',
    'public.bewerber_kennenlern_kalender()',
    'public.meeting_alte_kommunikation(public.aktivitaeten)',
    -- Teamaufbau, Protokoll, KI-Kontingent, Sicherheitscockpit (Server)
    'public.team_zuordnung()',
    'public.aufsicht_ueber(uuid)',
    'public.zustaendigkeitsbereich(uuid)',
    'public.activity_log_actor_snapshot(uuid)',
    'public.increment_ai_rate_limit(text,integer)',
    'public.detect_audit_anomalies()',
    'public.run_security_self_check()'
  ];
  _f text;
  _oid oid;
  _name text;
  _fehlt text[] := '{}';
  _gebraucht text[] := '{}';
BEGIN
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) <> 3 THEN
    RAISE EXCEPTION 'Absicherung Stufe 0: Rolle anon, authenticated oder service_role fehlt. Nichts geaendert.';
  END IF;

  FOREACH _f IN ARRAY _funktionen LOOP
    _oid := to_regprocedure(_f);
    IF _oid IS NULL THEN
      _fehlt := _fehlt || _f;
      CONTINUE;
    END IF;
    SELECT proname INTO _name FROM pg_proc WHERE oid = _oid;

    -- Eine Zeilenregel oder View laeuft mit den Rechten des Nutzers.
    IF EXISTS (SELECT 1 FROM pg_policies
                WHERE coalesce(qual, '') ~* ('\m' || _name || '\s*\(')
                   OR coalesce(with_check, '') ~* ('\m' || _name || '\s*\('))
       OR EXISTS (SELECT 1 FROM pg_class c
                   WHERE c.relkind IN ('v', 'm')
                     AND c.relnamespace NOT IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                     AND pg_get_viewdef(c.oid) ~* ('\m' || _name || '\s*\('))
       -- Eine Funktion ohne SECURITY DEFINER (auch ein Ausloeser) ruft sie
       -- mit den Rechten des Nutzers auf.
       OR EXISTS (SELECT 1 FROM pg_proc p
                   WHERE p.pronamespace = 'public'::regnamespace
                     AND NOT p.prosecdef
                     AND p.oid <> _oid
                     AND p.prosrc ~* ('\m' || _name || '\s*\('))
    THEN
      _gebraucht := _gebraucht || _f;
    END IF;
  END LOOP;

  IF cardinality(_fehlt) > 0 THEN
    RAISE EXCEPTION 'Absicherung Stufe 0: Funktion(en) nicht gefunden: %. Nichts geaendert.', array_to_string(_fehlt, ', ');
  END IF;
  IF cardinality(_gebraucht) > 0 THEN
    RAISE EXCEPTION 'Absicherung Stufe 0: Diese Funktion(en) werden inzwischen mit Nutzerrechten gebraucht (Regel, View oder Funktion ohne SECURITY DEFINER): %. Nichts geaendert.', array_to_string(_gebraucht, ', ');
  END IF;

  -- Die Sicherung darf niemand mehr lesen. Liest sie inzwischen etwas, halt.
  IF to_regclass('public.objekte_sicherung_20260922') IS NOT NULL AND (
       EXISTS (SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid
                WHERE d.refobjid = to_regclass('public.objekte_sicherung_20260922') -- OSImmobilien: ohne Fehler, wenn die Tabelle fehlt
                  AND r.ev_class <> d.refobjid)
    OR EXISTS (SELECT 1 FROM pg_proc p
                WHERE p.pronamespace NOT IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                  AND p.prosrc ILIKE '%objekte_sicherung_20260922%')
    OR EXISTS (SELECT 1 FROM pg_policies
                WHERE coalesce(qual, '') || coalesce(with_check, '') ILIKE '%objekte_sicherung_20260922%')
  ) THEN
    RAISE EXCEPTION 'Absicherung Stufe 0: objekte_sicherung_20260922 wird von einer View, Funktion oder Regel gelesen. Nichts geaendert.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. Manuelle Sicherung der Objekte: zu, aber nicht geloescht
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.objekte_sicherung_20260922') IS NULL THEN
    RAISE NOTICE 'objekte_sicherung_20260922 gibt es nicht mehr, Schritt 1 entfaellt.';
    RETURN;
  END IF;
  ALTER TABLE public.objekte_sicherung_20260922 ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.objekte_sicherung_20260922 FROM PUBLIC, anon, authenticated;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Hintergrund-, Cron- und Serverfunktionen: nur noch Server und Besitzer
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.bewerber_formular_aufraeumen() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_activation_tokens() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_ai_rate_limits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_email_send_log() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_tokens() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_old_activity_log() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_old_webhook_audit_logs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rotate_audit_log() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.videoraeume_aufraeumen() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kennzahlen_tagesstand_lauf() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kennzahlen_tagesstand_zusatz() FROM PUBLIC, anon, authenticated;
-- OSImmobilien: nur wenn die Funktion existiert (wird nicht per Migration angelegt)
DO $osi$ BEGIN IF to_regprocedure('public.kennzahlen_gespraeche_woche()') IS NOT NULL THEN EXECUTE $q$REVOKE ALL ON FUNCTION public.kennzahlen_gespraeche_woche() FROM PUBLIC, anon, authenticated$q$; END IF; END $osi$;
REVOKE ALL ON FUNCTION public.kennzahl_schreiben(date,text,text,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nachtpruefung_bericht() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nachtpruefung_haengende_raeume(timestamp with time zone) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nachtpruefung_kontakt_ohne_zustaendigen(timestamp with time zone) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nachtpruefung_raeume_nach_termin(timestamp with time zone) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nachtpruefung_reservierung_ohne_bonitaet(timestamp with time zone) FROM PUBLIC, anon, authenticated;
-- OSImmobilien: nur wenn die Funktion existiert (wird nicht per Migration angelegt)
DO $osi$ BEGIN IF to_regprocedure('public.email_queue_dispatch()') IS NOT NULL THEN EXECUTE $q$REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated$q$; END IF; END $osi$;
REVOKE ALL ON FUNCTION public.meeting_mail_claim() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meeting_mail_fertig(uuid,uuid,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buchung_pipeline_vorwaerts(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buchung_investment_vorwaerts(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buchung_termin_belegt(uuid,timestamp with time zone,timestamp with time zone,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.buchung_zugang_aufloesen(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bewerber_stufe_closing(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bewerber_termin_gastgeber() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bewerber_kennenlern_kalender() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meeting_alte_kommunikation(public.aktivitaeten) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_zuordnung() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aufsicht_ueber(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.zustaendigkeitsbereich(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_log_actor_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_ai_rate_limit(text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.detect_audit_anomalies() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_security_self_check() FROM PUBLIC, anon, authenticated;

-- Edge Functions rufen mit dem Dienstschluessel. Das Recht hat service_role
-- heute schon ausdruecklich, hier wird es nur festgehalten.
-- OSImmobilien: die zwei nicht per Migration angelegten Funktionen stehen
-- weiter unten bedingt.
GRANT EXECUTE ON FUNCTION
  public.bewerber_formular_aufraeumen(),
  public.cleanup_activation_tokens(),
  public.cleanup_ai_rate_limits(),
  public.cleanup_email_send_log(),
  public.cleanup_expired_tokens(),
  public.purge_old_activity_log(),
  public.purge_old_webhook_audit_logs(),
  public.rotate_audit_log(),
  public.videoraeume_aufraeumen(),
  public.kennzahlen_tagesstand_lauf(),
  public.kennzahlen_tagesstand_zusatz(),
  public.kennzahl_schreiben(date,text,text,numeric),
  public.nachtpruefung_bericht(),
  public.nachtpruefung_haengende_raeume(timestamp with time zone),
  public.nachtpruefung_kontakt_ohne_zustaendigen(timestamp with time zone),
  public.nachtpruefung_raeume_nach_termin(timestamp with time zone),
  public.nachtpruefung_reservierung_ohne_bonitaet(timestamp with time zone),
  public.meeting_mail_claim(),
  public.meeting_mail_fertig(uuid,uuid,boolean,text),
  public.buchung_pipeline_vorwaerts(uuid,text),
  public.buchung_investment_vorwaerts(uuid,text),
  public.buchung_termin_belegt(uuid,timestamp with time zone,timestamp with time zone,text,uuid),
  public.buchung_zugang_aufloesen(text),
  public.bewerber_stufe_closing(uuid),
  public.bewerber_termin_gastgeber(),
  public.bewerber_kennenlern_kalender(),
  public.meeting_alte_kommunikation(public.aktivitaeten),
  public.team_zuordnung(),
  public.aufsicht_ueber(uuid),
  public.zustaendigkeitsbereich(uuid),
  public.activity_log_actor_snapshot(uuid),
  public.increment_ai_rate_limit(text,integer),
  public.detect_audit_anomalies(),
  public.run_security_self_check()
TO service_role;
DO $osi$ BEGIN IF to_regprocedure('public.kennzahlen_gespraeche_woche()') IS NOT NULL THEN EXECUTE $q$GRANT EXECUTE ON FUNCTION public.kennzahlen_gespraeche_woche() TO service_role$q$; END IF; END $osi$;
DO $osi$ BEGIN IF to_regprocedure('public.email_queue_dispatch()') IS NOT NULL THEN EXECUTE $q$GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role$q$; END IF; END $osi$;

-- ---------------------------------------------------------------------------
-- 3. Tabellen und Views in public: anon schreibt nirgends, TRUNCATE niemand
-- ---------------------------------------------------------------------------
-- Keine Ausnahme: Kein oeffentlicher Ablauf schreibt heute direkt als anon
-- (siehe Kopf). SELECT bleibt unberuehrt, ebenso INSERT, UPDATE und DELETE
-- fuer authenticated; dort entscheidet weiter die Zeilenregel.

DO $$
DECLARE
  _rel regclass;
BEGIN
  FOR _rel IN
    SELECT c.oid::regclass
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE %s FROM anon', _rel);
    EXECUTE format('REVOKE TRUNCATE ON TABLE %s FROM authenticated', _rel);
  END LOOP;
END
$$;

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeilen 50.1 bis 50.7 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
