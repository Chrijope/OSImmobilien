-- ===========================================================================
-- RPC-Sperren gegen Postgres' dreiwertige Logik absichern
-- ===========================================================================
--
-- WARUM
--
-- Ein externes Sicherheitsaudit vom 15.09.2026 hat unter der Kennung F01
-- gemeldet, dass die Berechtigungspruefung in mehreren SECURITY-DEFINER-
-- Funktionen nicht greift. Am 16.09.2026 wurde der Befund gegengeprueft und
-- bestaetigt. Diese Migration schliesst die Luecke.
--
-- WAS WAR DER FEHLER
--
-- Die Sperre war so geschrieben:
--
--   IF NOT (
--     _ist_intern
--     OR (_kontakt_meta ->> 'authUserId') = auth.uid()::text
--     OR ((_kontakt_meta -> 'person2') ->> 'authUserId') = auth.uid()::text
--   ) THEN
--     RAISE EXCEPTION 'Not authorized';
--   END IF;
--
-- Postgres kennt neben wahr und falsch auch unbekannt. Fehlt im `meta` des
-- Kontakts der Schluessel `person2`, und das ist der Normalfall, dann liefert
-- `(_kontakt_meta -> 'person2') ->> 'authUserId'` nicht den leeren Text,
-- sondern NULL. Der Vergleich NULL = '<Kennung>' ergibt dann nicht falsch,
-- sondern unbekannt. Dasselbe gilt fuer `authUserId`, wenn der Kontakt noch
-- kein Portal hat.
--
-- Die Rechnung laeuft damit so:
--   falsch ODER unbekannt  ergibt  unbekannt
--   NICHT unbekannt        ergibt  unbekannt
--   IF unbekannt THEN      wird    uebersprungen
--
-- Die Ausnahme wurde also nie ausgeloest. Die Sperre stand da, tat aber
-- nichts. Ein angemeldeter Kunde konnte mit einer fremden Kontakt-Kennung
-- durchkommen, sofern der fremde Kontakt die geprueften Schluessel nicht
-- gesetzt hatte. Und genau die schwach gefuellten Kontakte, also die ohne
-- Portalzugang, waren dadurch ungeschuetzt.
--
-- WAS SICH AENDERT
--
-- Jeder einzelne Vergleich wird in COALESCE(..., false) gefasst. Damit wird
-- aus unbekannt ein sauberes falsch, und die Oder-Kette kann nur noch wahr
-- oder falsch ergeben. Trifft keine der drei Bedingungen zu, greift die
-- Sperre wie beabsichtigt.
--
-- Auch `_ist_intern` wird eingefasst. Es entsteht aus
-- `auth.uid() IS NULL OR public.is_internal_role(auth.uid())` und kann
-- unbekannt werden, falls `is_internal_role` fuer eine unbekannte Kennung
-- NULL zurueckgibt.
--
-- Fuer berechtigte Aufrufe aendert sich nichts. Interne Rollen, der
-- Dienstschluessel ohne `auth.uid()`, der Kunde selbst und die zweite Person
-- kommen weiter durch. Name, Signatur, Rueckgabetyp, LANGUAGE,
-- SECURITY DEFINER und search_path bleiben unveraendert, ebenso der gesamte
-- fachliche Rumpf einschliesslich der Positivliste fuer nicht-interne
-- Aufrufer. Rechte werden nicht angefasst: CREATE OR REPLACE laesst
-- bestehende GRANTs stehen, und diese Datei enthaelt bewusst keine.
--
-- WELCHE FUNKTIONEN BETROFFEN SIND
--
-- Der Auditbericht nennt drei Funktionen. Die Gegenpruefung am 16.09.2026
-- hat ergeben, dass nur noch eine davon das Muster traegt:
--
--   merge_kontakt_meta(uuid, jsonb)
--     Zuletzt definiert in 20260731090200_merge_kontakt_meta_absichern.sql.
--     Traegt das fehlerhafte Muster bis heute. Wird hier korrigiert.
--
--   confirm_notar_termin(uuid, text, text)
--   register_unterlage_upload(uuid, text, text)
--     Der Bericht verweist auf 20260419153422 und 20260322162611. Beide
--     Funktionen wurden danach jedoch neu geschrieben, zuletzt in
--     20260915201000_investment_rpcs_zeilenweise.sql. Sie pruefen seitdem
--     nicht mehr selbst, sondern rufen public.darf_investment_nutzen auf.
--     Diese Funktion fasst ihre Oder-Kette bereits in COALESCE(..., false)
--     und ist damit gegen dieselbe Ursache gesichert. Sie werden hier
--     bewusst NICHT angefasst. Ein erneutes CREATE OR REPLACE waere ohne
--     Wirkung und wuerde nur das Risiko tragen, einen inzwischen
--     abweichenden Stand in der Produktivdatenbank zu ueberschreiben.
--     `99_PRUEFUNG.sql` prueft trotzdem alle drei, damit ein spaeterer
--     Rueckfall auffaellt.
--
-- Dasselbe gilt fuer merge_investment_meta, das mit 20260915201000 ebenfalls
-- auf darf_investment_nutzen umgestellt wurde.
--
-- Wiederholbar: CREATE OR REPLACE, ein zweiter Lauf aendert nichts.
--
-- ---------------------------------------------------------------------------
-- SICHERUNG: heutigen Wortlaut vorher festhalten
-- ---------------------------------------------------------------------------
--
--   select pg_get_functiondef(p.oid)
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname = 'merge_kontakt_meta';
-- ===========================================================================


CREATE OR REPLACE FUNCTION public.merge_kontakt_meta(_kontakt_id uuid, _updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Schluessel, die ein Kunde an seinem eigenen Kontakt setzen darf
  _erlaubte_schluessel text[] := ARRAY[
    'steuersatzManuell',
    'deletionRequestedAt',
    'deletionRequestedBy',
    'portalErstLogin',
    'portalAktiv',
    'portalFreigeschalten',
    'portalAktivAt'
  ];
  _kontakt_meta jsonb;
  _ist_intern boolean;
  _wirksam jsonb;
  _schluessel text;
  _verworfen text[] := ARRAY[]::text[];
  _result jsonb;
BEGIN
  SELECT meta INTO _kontakt_meta FROM public.kontakte WHERE id = _kontakt_id;
  IF NOT FOUND THEN
    -- Neutrale Meldung: keine Auskunft darueber, ob die UUID existiert
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- auth.uid() IS NULL = Service-Role (Edge Functions), anon hat kein EXECUTE
  _ist_intern := auth.uid() IS NULL OR public.is_internal_role(auth.uid());

  -- Geaendert am 16.09.2026 (Audit F01): Jeder Vergleich einzeln in COALESCE,
  -- sonst wird aus einem fehlenden Schluessel ein unbekannt und die Sperre
  -- wird stillschweigend uebersprungen. Siehe Kopf der Migration.
  IF NOT (
    COALESCE(_ist_intern, false)
    OR COALESCE((_kontakt_meta ->> 'authUserId') = auth.uid()::text, false)
    OR COALESCE(((_kontakt_meta -> 'person2') ->> 'authUserId') = auth.uid()::text, false)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  _wirksam := COALESCE(_updates, '{}'::jsonb);

  IF NOT _ist_intern THEN
    _wirksam := '{}'::jsonb;
    FOR _schluessel IN SELECT jsonb_object_keys(COALESCE(_updates, '{}'::jsonb)) LOOP
      IF _schluessel = ANY(_erlaubte_schluessel) THEN
        _wirksam := _wirksam || jsonb_build_object(_schluessel, _updates -> _schluessel);
      ELSE
        _verworfen := _verworfen || _schluessel;
      END IF;
    END LOOP;

    IF array_length(_verworfen, 1) > 0 THEN
      RAISE LOG 'merge_kontakt_meta: nicht erlaubte Schluessel verworfen (%)',
        array_to_string(_verworfen, ', ');
    END IF;
  END IF;

  -- Nichts Erlaubtes uebrig: unveraenderten Stand zurueckgeben, nicht schreiben
  IF _wirksam = '{}'::jsonb THEN
    RETURN COALESCE(_kontakt_meta, '{}'::jsonb);
  END IF;

  UPDATE kontakte
  SET meta = public.jsonb_deep_merge(COALESCE(meta, '{}'::jsonb), _wirksam),
      aktualisiert_am = now()
  WHERE id = _kontakt_id
  RETURNING meta INTO _result;

  RETURN COALESCE(_result, '{}'::jsonb);
END;
$$;


-- ===========================================================================
-- PRUEFLAUF NACH DEM AUSFUEHREN (aendert nichts)
-- ===========================================================================
--
-- 1) Traegt die Funktion jetzt die abgesicherte Fassung?
--
--   select p.proname,
--          (p.prosrc like '%COALESCE(_ist_intern, false)%') as abgesichert
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname = 'merge_kontakt_meta';
--
-- 2) Greift die Sperre wirklich? Als Kunde ausgeben und einen FREMDEN Kontakt
--    anfassen, der weder `authUserId` noch `person2` gesetzt hat. Erwartet
--    wird die Fehlermeldung "Not authorized". Vorher kam die volle `meta`
--    zurueck.
--
--   begin;
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<Kunden-UUID>","role":"authenticated"}';
--     select public.merge_kontakt_meta('<fremde Kontakt-UUID>'::uuid, '{}'::jsonb);
--   rollback;
--
-- 3) Gegenprobe mit dem EIGENEN Kontakt desselben Kunden: dort muss die
--    `meta` weiterhin kommen.
-- ===========================================================================


-- ===========================================================================
-- Nachtrag vom 16.09.2026: zwei weitere Funktionen mit demselben Fehler
-- ===========================================================================
--
-- Die erste Fassung dieser Migration liess `confirm_notar_termin` und
-- `register_unterlage_upload` aus, mit der Begruendung, beide seien seit dem
-- 15.09.2026 ueber `public.darf_investment_nutzen` abgesichert.
--
-- Das stimmt fuer den Arbeitsbaum, nicht fuer die Datenbank. Die Migration
-- `20260915201000_investment_rpcs_zeilenweise.sql`, die diese Umstellung
-- bringt, wartet auf eine Entscheidung darueber, welche Rollen kuenftig alle
-- Investments sehen duerfen. Sie ist bewusst weder gepusht noch ausgefuehrt
-- worden. In der laufenden Datenbank stehen deshalb weiterhin die Fassungen
-- vom 19.04.2026 und vom 22.03.2026, und die tragen den Fehler.
--
-- Die Folge ist hier schwerer als bei `merge_kontakt_meta`: Beide Funktionen
-- SCHREIBEN. Wer eine fremde Investment-Kennung hat, konnte einen
-- Notartermin setzen und ein hochgeladenes Dokument eintragen.
--
-- Damit beide Wege nebeneinander bestehen koennen, ersetzt dieser Teil eine
-- Funktion nur dann, wenn die alte Fassung wirklich in der Datenbank steht.
-- Laeuft die Rollen-Migration spaeter, bleibt ihre strengere Pruefung
-- erhalten; laeuft sie nie, ist die Luecke trotzdem zu.
--
-- In beide Funktionen kommt zusaetzlich die Pruefung auf den zweiten Kaeufer,
-- die `register_unterlage_upload` bisher fehlte. Ohne sie kann der zweite
-- Kaeufer sein eigenes Dokument nicht eintragen.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- confirm_notar_termin
-- ---------------------------------------------------------------------------
--
-- Diese Funktion wird nur ersetzt, wenn in der Datenbank noch die alte,
-- verwundbare Fassung steht. Traegt sie bereits die Fassung, die ueber
-- `public.darf_investment_nutzen` prueft, bleibt sie unangetastet: jene
-- Fassung ist gegen dieselbe Ursache schon gesichert, und ein blindes
-- Ueberschreiben wuerde die dortige Einschraenkung zurueckrollen.
DO $aussen$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'confirm_notar_termin'
       AND p.prosrc LIKE '%darf_investment_nutzen%'
  ) THEN
    RAISE NOTICE 'confirm_notar_termin: traegt bereits die neuere Fassung, bleibt unveraendert';
  ELSE
    EXECUTE $funktion$
CREATE OR REPLACE FUNCTION public.confirm_notar_termin(
  _investment_id uuid,
  _datum text,
  _uhrzeit text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv_row public.investments%ROWTYPE;
  kontakt_row public.kontakte%ROWTYPE;
  current_meta jsonb;
  current_notar_data jsonb;
  bestaetigt jsonb;
BEGIN
  SELECT * INTO inv_row FROM public.investments WHERE id = _investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found';
  END IF;

  SELECT * INTO kontakt_row FROM public.kontakte WHERE id::text = inv_row.kunde_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontakt not found';
  END IF;

  -- Allow internal roles OR the linked customer (Person 1 or Person 2)
  IF NOT (
    COALESCE(public.is_internal_role(auth.uid()), false)
    OR COALESCE((kontakt_row.meta ->> 'authUserId') = auth.uid()::text, false)
    OR COALESCE(((kontakt_row.meta -> 'person2') ->> 'authUserId') = auth.uid()::text, false)
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  current_meta := COALESCE(inv_row.meta, '{}'::jsonb);
  current_notar_data := COALESCE(current_meta -> 'notarData', '{}'::jsonb);
  current_notar_data := jsonb_set(current_notar_data, '{datum}', to_jsonb(_datum), true);
  current_notar_data := jsonb_set(current_notar_data, '{uhrzeit}', to_jsonb(_uhrzeit), true);

  bestaetigt := jsonb_build_object(
    'datum', _datum,
    'uhrzeit', _uhrzeit,
    'bestaetigtAm', to_jsonb(now())
  );

  current_meta := current_meta
    || jsonb_build_object(
      'notarData', current_notar_data,
      'notarTermin', _datum,
      'notarUhrzeit', _uhrzeit,
      'notarTerminBestaetigt', bestaetigt,
      'notarTerminPortalFreigabe', true
    );

  UPDATE public.investments SET meta = current_meta WHERE id = _investment_id;

  RETURN current_meta;
END;
$$;
    $funktion$;
    RAISE NOTICE 'confirm_notar_termin: Sperre abgesichert';
  END IF;
END
$aussen$;

-- ---------------------------------------------------------------------------
-- register_unterlage_upload
-- ---------------------------------------------------------------------------
--
-- Diese Funktion wird nur ersetzt, wenn in der Datenbank noch die alte,
-- verwundbare Fassung steht. Traegt sie bereits die Fassung, die ueber
-- `public.darf_investment_nutzen` prueft, bleibt sie unangetastet: jene
-- Fassung ist gegen dieselbe Ursache schon gesichert, und ein blindes
-- Ueberschreiben wuerde die dortige Einschraenkung zurueckrollen.
DO $aussen$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'register_unterlage_upload'
       AND p.prosrc LIKE '%darf_investment_nutzen%'
  ) THEN
    RAISE NOTICE 'register_unterlage_upload: traegt bereits die neuere Fassung, bleibt unveraendert';
  ELSE
    EXECUTE $funktion$
CREATE OR REPLACE FUNCTION public.register_unterlage_upload(
  _investment_id uuid,
  _doc_name text,
  _file_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_row public.investments%ROWTYPE;
  kontakt_row public.kontakte%ROWTYPE;
  current_meta jsonb;
  current_statuses jsonb;
  current_urls jsonb;
BEGIN
  SELECT * INTO inv_row
  FROM public.investments
  WHERE id = _investment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found';
  END IF;

  SELECT * INTO kontakt_row
  FROM public.kontakte
  WHERE id::text = inv_row.kunde_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontakt not found';
  END IF;

  IF NOT (
    COALESCE(public.is_internal_role(auth.uid()), false)
    OR COALESCE((kontakt_row.meta ->> 'authUserId') = auth.uid()::text, false)
    OR COALESCE(((kontakt_row.meta -> 'person2') ->> 'authUserId') = auth.uid()::text, false)
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  current_meta := COALESCE(inv_row.meta, '{}'::jsonb);
  current_statuses := COALESCE(current_meta -> 'docStatuses', '{}'::jsonb);
  current_urls := COALESCE(current_meta -> 'docFileUrls', '{}'::jsonb);

  current_statuses := jsonb_set(current_statuses, ARRAY[_doc_name], to_jsonb('uploaded'::text), true);
  current_urls := jsonb_set(current_urls, ARRAY[_doc_name], to_jsonb(_file_url), true);
  current_meta := jsonb_set(current_meta, '{docStatuses}', current_statuses, true);
  current_meta := jsonb_set(current_meta, '{docFileUrls}', current_urls, true);

  UPDATE public.investments
  SET meta = current_meta
  WHERE id = _investment_id;

  RETURN current_meta;
END;
$$;
    $funktion$;
    RAISE NOTICE 'register_unterlage_upload: Sperre abgesichert';
  END IF;
END
$aussen$;
