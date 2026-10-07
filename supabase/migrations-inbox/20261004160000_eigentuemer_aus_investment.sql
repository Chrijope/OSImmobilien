-- ===========================================================================
-- Eigentuemer aus dem Investment anlegen, geprueft auf dem Server
-- ===========================================================================
--
-- WARUM
--
--   Nach dem Notartermin uebernimmt das Kundenprofil den Kaeufer als
--   Eigentuemer in die Hausverwaltung. Der Browser schrieb dazu direkt in
--   `eigentuemer`. Seit 20260930120000 duerfen dort nur Hausverwaltung,
--   Admin und Inhaber anlegen. Fuer Partner und Backoffice scheiterte die
--   Uebernahme still, die Stufe sprang trotzdem auf „faelligkeit“, und ein
--   zweiter Versuch kam nie.
--
-- WAS DIESE MIGRATION TUT
--
--   Neue Funktion `eigentuemer_aus_investment(uuid)`, SECURITY DEFINER:
--     - nur angemeldete interne Rollen, die das Investment nutzen duerfen
--       (`darf_investment_nutzen`, dieselbe Regel wie confirm_notar_termin),
--     - nur mit eingetragenem Notartermin,
--     - je Investment genau einmal: Gibt es schon einen Eigentuemer mit
--       `meta.herkunftInvestmentId`, kommt dessen Kennung zurueck. Eine
--       Sperre je Investment verhindert, dass zwei Klicks zugleich anlegen.
--       Einen eindeutigen Index gibt es bewusst nicht: Live liegen am
--       04.10.2026 drei doppelte Altfaelle, die erst jemand zusammenfuehren
--       muss.
--     - Name, Kontaktdaten und Adresse kommen aus dem Kontakt in der
--       Datenbank, nicht aus dem Browser.
--   Rueckgabe: die Kennung des Eigentuemers.
--
--   Aendert keine Daten, keine Function auszurollen, wiederholbar.
--
-- OHNE SIE
--
--   Der Browser nimmt den alten Weg (direktes Anlegen). Das klappt fuer
--   Admin, Inhaber und Hausverwaltung; fuer alle anderen bleibt die Stufe
--   jetzt auf „notar“ stehen und das Kundenprofil bietet einen neuen Versuch
--   an, statt still weiterzuschalten.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.eigentuemer_aus_investment(_investment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _inv public.investments%ROWTYPE;
  _k public.kontakte%ROWTYPE;
  _inv_meta jsonb;
  _notar text;
  _vorhanden uuid;
  _name text;
  _strasse text;
  _objekt_id text;
  _objekt_name text;
  _neu uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_internal_role(_uid) THEN
    RAISE EXCEPTION 'Keine Berechtigung' USING ERRCODE = '42501';
  END IF;
  IF _investment_id IS NULL THEN
    RAISE EXCEPTION 'Investment fehlt';
  END IF;

  SELECT * INTO _inv FROM public.investments WHERE id = _investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment nicht gefunden';
  END IF;
  SELECT * INTO _k FROM public.kontakte WHERE id = _inv.kunde_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontakt nicht gefunden';
  END IF;
  IF NOT public.darf_investment_nutzen(_uid, _inv.kunde_id, _k.meta) THEN
    RAISE EXCEPTION 'Keine Berechtigung' USING ERRCODE = '42501';
  END IF;

  _inv_meta := CASE WHEN jsonb_typeof(_inv.meta) = 'object' THEN _inv.meta ELSE '{}'::jsonb END;
  _notar := COALESCE(NULLIF(_inv_meta -> 'notarData' ->> 'datum', ''), NULLIF(_inv_meta ->> 'notarTermin', ''));
  IF _notar IS NULL THEN
    RAISE EXCEPTION 'Für dieses Investment ist noch kein Notartermin eingetragen';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('eigentuemer_aus_investment:' || _investment_id::text, 0));

  SELECT id INTO _vorhanden
    FROM public.eigentuemer
   WHERE meta ->> 'herkunftInvestmentId' = _investment_id::text
   ORDER BY erstellt_am NULLS LAST, id
   LIMIT 1;
  IF _vorhanden IS NOT NULL THEN
    RETURN _vorhanden;
  END IF;

  _name := NULLIF(trim(concat_ws(' ', NULLIF(trim(_k.vorname), ''), NULLIF(trim(_k.nachname), ''))), '');
  _name := COALESCE(_name, NULLIF(trim(_k.firma), ''), 'Unbekannt');
  _strasse := NULLIF(trim(concat_ws(' ', NULLIF(trim(_k.strasse), ''), NULLIF(trim(_k.hausnummer), ''))), '');
  _objekt_id := NULLIF(_inv_meta ->> 'objektId', '');
  _objekt_name := COALESCE(NULLIF(_inv_meta ->> 'objektTitel', ''), NULLIF(_inv.objekt, ''), NULLIF(_inv_meta ->> 'label', ''));

  INSERT INTO public.eigentuemer (name, email, telefon, adresse, objekte, notizen, meta)
  VALUES (
    _name,
    COALESCE(_k.email, ''),
    COALESCE(_k.telefon, ''),
    NULLIF(concat_ws(', ', _strasse, NULLIF(trim(_k.plz), ''), NULLIF(trim(_k.ort), '')), ''),
    CASE WHEN _objekt_id IS NULL THEN '{}'::text[] ELSE ARRAY[_objekt_id] END,
    'Automatisch übernommen aus Vertrieb (Notar: ' || _notar || ')',
    jsonb_build_object(
      'typ', 'privatperson',
      'anrede', COALESCE(_k.anrede, ''),
      'strasse', COALESCE(_strasse, ''),
      'plz', COALESCE(_k.plz, ''),
      'ort', COALESCE(_k.ort, ''),
      'steuernummer', '',
      'bankIban', '',
      'bankBic', '',
      'verwaltervertragBeginn', '',
      'verwaltervertragEnde', '',
      'verwalterhonorar', 0,
      'kuendigungsfrist', '3 Monate',
      'objektNamen', CASE WHEN _objekt_name IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(_objekt_name) END,
      'wirtschaftsplanJahr', extract(year FROM now())::int,
      'wirtschaftsplanBetrag', 0,
      'instandhaltungsruecklage', 0,
      'ruecklageSollMonatlich', 0,
      'herkunftVertrieb', true,
      'herkunftKontaktId', _k.id::text,
      'herkunftInvestmentId', _investment_id::text,
      'herkunftKontaktName', _name,
      'herkunftNotarDatum', _notar,
      'herkunftUebernommenVon', _uid::text
    )
  )
  RETURNING id INTO _neu;

  RETURN _neu;
END;
$$;

REVOKE ALL ON FUNCTION public.eigentuemer_aus_investment(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.eigentuemer_aus_investment(uuid) TO authenticated;

COMMIT;
