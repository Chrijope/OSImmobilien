-- ===========================================================================
-- Kundenportal: Empfehlungsprogramm anfragen
-- ===========================================================================
--
-- GL-Vorgabe vom 04.10.2026: Fragt ein Kunde im Portal das
-- Empfehlungsprogramm an, bekommt der zustaendige Partner eine Aufgabe und
-- eine Glocke, die auf diese Aufgabe zeigt. Ohne Zustaendigen gehen beide an
-- Admin, Inhaber und Vertriebsleitung (Glockenregel vom 29.09.2026), jede
-- Person einmal. Zustaendig ist allein kontakte.zustaendig_id, nie der
-- Beratername; die Setter-Rolle ruht und spielt keine Rolle.
--
-- Warum eine Funktion: Ein Kunde darf weder eine Aufgabe fuer einen anderen
-- anlegen noch der Leitung eine Glocke schicken (darf_glocke_senden,
-- 20260928160000). Ohne diese Migration schickt die Seite nur eine Glocke
-- an den Zustaendigen (mit Link aufs Kundenprofil, ohne Aufgabe); ohne
-- Zustaendigen sieht der Kunde eine Fehlermeldung.
--
-- Die Aufgabe gehoert dem Empfaenger (benutzer_id und zugewiesen_an), nicht
-- dem Kunden. So sieht der Kunde sie nicht und kann sie auch nicht erledigen;
-- das Portal braucht sie nicht. Erkannt wird sie am festen Marker in
-- ausloeser_schluessel ("empfehlungsprogramm:<Kontakt>:<Zeitpunkt>"), nicht
-- am Titel. Liegt fuer den Kontakt schon eine offene Anfrage vor, entsteht
-- keine zweite und keine neue Glocke. Eine Sperre je Kontakt
-- (pg_advisory_xact_lock) verhindert, dass zwei gleichzeitige Klicks beide
-- durch die Pruefung kommen.
--
-- Steht fuer sich, Reihenfolge egal, keine Function auszurollen, aendert
-- keine Daten, wiederholbar.
-- ===========================================================================

BEGIN;

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
      _empfaenger, _empfaenger, _k.id, _titel, _nachricht, 'aufgabe', 'hoch', 'offen', now(),
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

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeile 76.1 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
