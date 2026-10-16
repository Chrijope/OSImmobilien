-- ===========================================================================
-- Empfehlungsprogramm anfragen: Aufgabentitel nach Anlass (15.10.2026)
-- ===========================================================================
--
-- Wortgleich zur Fassung aus 20261004175000_empfehlungsprogramm_anfrage.sql,
-- nur die Aufgabe heisst jetzt "Empfehlungsprogramm angefragt: einrichten
-- und freigeben", ohne Kundennamen (Regel fuer alle automatischen Aufgaben:
-- erst der Anlass, dann was zu tun ist). Den Namen zeigen Inbox und Liste
-- ueber den Kontakt, er steht weiter in der Beschreibung. Die Glocke behaelt
-- ihren Titel mit Namen. Rechte, Sperre, Empfaengerregel und "keine neue,
-- solange eine offen ist" bleiben unveraendert.
--
-- Steht fuer sich, Reihenfolge egal, keine Function auszurollen, aendert
-- keine Daten, wiederholbar.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.empfehlungsprogramm_anfragen(_kontakt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _k public.kontakte%ROWTYPE;
  _name text;
  _titel text;
  _aufgabe_titel text := 'Empfehlungsprogramm angefragt: einrichten und freigeben';
  _nachricht text;
  _empfaenger uuid;
  _aufgabe_id uuid;
  _anzahl int := 0;
  _marker text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _k
  FROM public.kontakte
  WHERE id = _kontakt_id
    AND (
      (meta ->> 'authUserId') = _uid::text
      OR ((meta -> 'person2') ->> 'authUserId') = _uid::text
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nicht berechtigt' USING ERRCODE = '42501';
  END IF;

  _name := trim(coalesce(_k.vorname, '') || ' ' || coalesce(_k.nachname, ''));
  -- Titel der Glocke, mit Namen.
  _titel := 'Empfehlungsprogramm anfragen: ' || _name;
  _nachricht := _name || ' hat über das Kundenportal das Empfehlungsprogramm angefragt. '
    || 'Bitte Empfehlungsprogramm für ' || _name || ' erstellen und freigeben.';

  _marker := 'empfehlungsprogramm:' || _k.id::text;
  PERFORM pg_advisory_xact_lock(hashtext(_marker));

  IF EXISTS (
    SELECT 1 FROM public.aufgaben a
     WHERE a.kontakt_id = _k.id
       AND a.ausloeser_schluessel LIKE _marker || ':%'
       AND a.status IN ('offen', 'in_bearbeitung')
  ) THEN
    RETURN jsonb_build_object('bereits_offen', true, 'empfaenger', 0);
  END IF;

  FOR _empfaenger IN
    SELECT _k.zustaendig_id WHERE _k.zustaendig_id IS NOT NULL
    UNION
    SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
     WHERE _k.zustaendig_id IS NULL
       AND ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role, 'vertriebsleiter'::public.app_role)
  LOOP
    INSERT INTO public.aufgaben (
      benutzer_id, zugewiesen_an, kontakt_id, titel, beschreibung, typ, prioritaet, status, faellig_am,
      ausloeser_schluessel, erstellt_von_name
    )
    VALUES (
      _empfaenger, _empfaenger, _k.id, _aufgabe_titel, _nachricht, 'aufgabe', 'hoch', 'offen', now(),
      _marker || ':' || to_char(clock_timestamp() AT TIME ZONE 'utc', 'YYYYMMDDHH24MISSUS'), 'Kundenportal'
    )
    RETURNING id INTO _aufgabe_id;

    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (
      _empfaenger,
      CASE WHEN _k.zustaendig_id IS NULL THEN 'Empfehlungsprogramm angefragt, ohne Zuständigkeit' ELSE _titel END,
      _nachricht,
      '/inbox?art=aufgabe&aufgabe=' || _aufgabe_id::text
    );
    _anzahl := _anzahl + 1;
  END LOOP;

  IF _anzahl = 0 THEN
    RAISE EXCEPTION 'Kein Empfänger für die Anfrage gefunden';
  END IF;

  RETURN jsonb_build_object('bereits_offen', false, 'empfaenger', _anzahl);
END;
$$;

REVOKE ALL ON FUNCTION public.empfehlungsprogramm_anfragen(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empfehlungsprogramm_anfragen(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
