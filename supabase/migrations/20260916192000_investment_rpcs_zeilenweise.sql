-- ===========================================================================
-- Die vier Investment-Funktionen auf dieselbe Zeilenregel bringen
-- ===========================================================================
--
-- GEHOERT ZU 20260916191000_investments_zeilenweise.sql, ist aber bewusst eine
-- eigene Datei: Sie fasst vier bestehende Datenbankfunktionen an und kann
-- getrennt freigegeben und getrennt zurueckgenommen werden. Ohne sie bleibt
-- die neue Zeilenregel fuer die Spalte `meta` wirkungslos.
--
-- BEFUND
--
-- Vier Funktionen laufen als SECURITY DEFINER, umgehen also die
-- Zeilensicherheit vollstaendig, und pruefen selbst nur `is_internal_role`.
-- `is_internal_role` schliesst `vertriebspartner` ein. Alle vier nehmen eine
-- Investment-Kennung entgegen und geben die vollstaendige Spalte `meta`
-- dieses Investments zurueck:
--
--   merge_investment_meta(uuid, jsonb)          20260801090000
--   register_unterlage_upload(uuid, text, text) 20260901120000
--   unregister_unterlage_upload(uuid, text)     20260901121000
--   confirm_notar_termin(uuid, text, text)      20260517094425
--
-- Ablauf des Missbrauchs, mit `merge_investment_meta` am deutlichsten: Ein
-- angemeldeter Vertriebspartner ruft
--   supabase.rpc('merge_investment_meta', { _investment_id: <fremde Kennung>,
--                                           _updates: {} })
-- auf. Die Funktion findet nichts Schreibbares, springt in den Zweig
-- "nichts Erlaubtes uebrig" und gibt trotzdem `meta` zurueck. Darin stehen
-- unter anderem `saData` (die komplette Selbstauskunft mit Einkommen,
-- Arbeitgeber, Vermoegen), `docFileUrls`, `docStatuses` und `notarData`.
-- Die drei anderen Funktionen liefern `meta` ebenso zurueck und schreiben
-- zusaetzlich in fremde Vorgaenge.
--
-- WAS SICH AENDERT
--
-- Nur der Berechtigungsblock, sonst nichts. Name, Signatur, Rueckgabetyp,
-- Rechte und der gesamte fachliche Rumpf bleiben Wort fuer Wort wie bisher.
-- Aus
--     public.is_internal_role(auth.uid())
--     OR (kontakt.meta ->> 'authUserId') = auth.uid()::text
--     OR ((kontakt.meta -> 'person2') ->> 'authUserId') = auth.uid()::text
-- wird
--     public.darf_investment_nutzen(auth.uid(), inv.kunde_id, kontakt.meta)
-- also dieselbe Aussage, nur dass eine interne Rolle mit
-- Vertriebspartner-Kennzeichen zusaetzlich fuer diesen Kunden zustaendig sein
-- muss und dass die fuenf Rollen ohne Kundenzugriff (objektpartner,
-- hausverwaltung, marketing, hr, versicherungsexperte) gar nicht mehr
-- durchkommen. Fuer Kunde und zweite Person aendert sich nichts. Fuer Aufrufe mit
-- dem Dienstschluessel (`auth.uid()` ist dann leer) aendert sich nichts.
--
-- Mehrfach ausfuehrbar.
--
-- REIHENFOLGE GEGENUEBER 20260916100000, GEPRUEFT
--
-- Durch die Umnummerierung laeuft diese Datei jetzt NACH
-- 20260916100000_rpc_sperren_dreiwertige_logik.sql statt davor. Das ist
-- geprueft und ungefaehrlich: Jene Datei ersetzt `confirm_notar_termin` und
-- `register_unterlage_upload` nur, wenn in der Datenbank noch NICHT die
-- Fassung mit `darf_investment_nutzen` steht (DO-Block mit
-- `prosrc LIKE '%darf_investment_nutzen%'`). In der neuen Reihenfolge legt
-- sie also zuerst ihre eigene, mit COALESCE gesicherte Fassung an, und diese
-- Datei ersetzt sie danach durch die strengere. Der Endstand ist derselbe
-- wie vorher: die Fassung mit `darf_investment_nutzen`, deren Oder-Kette
-- ebenfalls in COALESCE(..., false) steht.
--
-- ---------------------------------------------------------------------------
-- SICHERUNG: heutigen Wortlaut der vier Funktionen festhalten
-- ---------------------------------------------------------------------------
--
--   select p.proname, pg_get_functiondef(p.oid)
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('merge_investment_meta', 'register_unterlage_upload',
--                        'unregister_unterlage_upload', 'confirm_notar_termin');
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0) Die gemeinsame Frage: darf dieser Nutzer an dieses Investment?
-- ---------------------------------------------------------------------------
--
-- Setzt 20260916190000 (`darf_alle_kunden_sehen`) und 20260916191000
-- (`ist_eigenes_investment`) voraus. Am 16.09.2026 von der damaligen Funktion
-- `hat_breiten_investmentzugriff` auf die gemeinsame Regel
-- `darf_alle_kunden_sehen` umgestellt, siehe
-- 20260916190000_kundenzugriff_rollenentscheidung.sql. Die Datei hiess bis
-- dahin 20260915201000 und ist mit umnummeriert worden.
--
-- Das COALESCE ist kein Schmuck: Ist `_user_id`
-- leer, liefern die Vergleiche gegen `meta` nicht `false`, sondern
-- "unbekannt", und `IF NOT (unbekannt)` haette die Pruefung stillschweigend
-- uebersprungen. Der Dienstschluessel wird deshalb danach ausdruecklich
-- zugelassen, so wie merge_investment_meta es seit 20260801090000 schon tut.

CREATE OR REPLACE FUNCTION public.darf_investment_nutzen(
  _user_id uuid, _kunde_id uuid, _kontakt_meta jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NULL
      OR COALESCE(
           public.darf_alle_kunden_sehen(_user_id)
           OR public.ist_eigenes_investment(_user_id, _kunde_id)
           OR (_kontakt_meta ->> 'authUserId') = _user_id::text
           OR ((_kontakt_meta -> 'person2') ->> 'authUserId') = _user_id::text,
           false)
$$;

COMMENT ON FUNCTION public.darf_investment_nutzen(uuid, uuid, jsonb) IS
  'Darf dieser Nutzer an diesem Investment arbeiten? Breiter Zugriff, eigene '
  'Zustaendigkeit, der Kunde selbst oder die zweite Person. Leere Kennung '
  'bedeutet Dienstschluessel und ist erlaubt.';

REVOKE ALL ON FUNCTION public.darf_investment_nutzen(uuid, uuid, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.darf_investment_nutzen(uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.darf_investment_nutzen(uuid, uuid, jsonb) TO authenticated;


-- ---------------------------------------------------------------------------
-- 1) merge_investment_meta
-- ---------------------------------------------------------------------------
--
-- Rumpf unveraendert aus 20260801090000 uebernommen, samt Positivliste fuer
-- nicht-interne Aufrufer. Geaendert ist allein der IF-NOT-Block.

CREATE OR REPLACE FUNCTION public.merge_investment_meta(_investment_id uuid, _updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  -- Schluessel, die ein Kunde an seinem eigenen Investment setzen darf
  _erlaubte_schluessel text[] := ARRAY[
    'marktwertHistorie',
    'steuerCockpit'
  ];
  _result jsonb;
  _kunde_id uuid;
  _kontakt_meta jsonb;
  _inv_meta jsonb;
  _ist_intern boolean;
  _wirksam jsonb;
  _schluessel text;
  _verworfen text[] := ARRAY[]::text[];
BEGIN
  SELECT kunde_id, meta INTO _kunde_id, _inv_meta
  FROM public.investments WHERE id = _investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found';
  END IF;

  SELECT meta INTO _kontakt_meta FROM public.kontakte WHERE id = _kunde_id;

  -- auth.uid() IS NULL = Service-Role, anon hat kein EXECUTE
  _ist_intern := auth.uid() IS NULL OR public.is_internal_role(auth.uid());

  -- Geaendert am 16.09.2026: Eine interne Rolle allein reicht nicht mehr.
  -- Ein Vertriebspartner muss fuer diesen Kunden zustaendig sein.
  IF NOT public.darf_investment_nutzen(auth.uid(), _kunde_id, _kontakt_meta) THEN
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
      RAISE LOG 'merge_investment_meta: nicht erlaubte Schluessel verworfen (%)',
        array_to_string(_verworfen, ', ');
    END IF;
  END IF;

  -- Nichts Erlaubtes uebrig: unveraenderten Stand zurueckgeben, nicht schreiben
  IF _wirksam = '{}'::jsonb THEN
    RETURN COALESCE(_inv_meta, '{}'::jsonb);
  END IF;

  UPDATE public.investments
  SET meta = COALESCE(meta, '{}'::jsonb) || _wirksam
  WHERE id = _investment_id
  RETURNING meta INTO _result;

  RETURN COALESCE(_result, '{}'::jsonb);
END;
$$;


-- ---------------------------------------------------------------------------
-- 2) register_unterlage_upload
-- ---------------------------------------------------------------------------
--
-- Rumpf unveraendert aus 20260901120000.

CREATE OR REPLACE FUNCTION public.register_unterlage_upload(_investment_id uuid, _doc_name text, _file_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv_row public.investments%ROWTYPE;
  kontakt_row public.kontakte%ROWTYPE;
  current_meta jsonb;
  current_statuses jsonb;
  current_urls jsonb;
BEGIN
  SELECT * INTO inv_row FROM public.investments WHERE id = _investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found';
  END IF;

  SELECT * INTO kontakt_row FROM public.kontakte WHERE id = inv_row.kunde_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontakt not found';
  END IF;

  -- Geaendert am 16.09.2026, siehe Kopf der Migration.
  IF NOT public.darf_investment_nutzen(auth.uid(), inv_row.kunde_id, kontakt_row.meta) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  current_meta := COALESCE(inv_row.meta, '{}'::jsonb);
  current_statuses := COALESCE(current_meta -> 'docStatuses', '{}'::jsonb);
  current_urls := COALESCE(current_meta -> 'docFileUrls', '{}'::jsonb);

  current_statuses := jsonb_set(current_statuses, ARRAY[_doc_name], to_jsonb('uploaded'::text), true);
  current_urls := jsonb_set(current_urls, ARRAY[_doc_name], to_jsonb(_file_url), true);
  current_meta := jsonb_set(current_meta, '{docStatuses}', current_statuses, true);
  current_meta := jsonb_set(current_meta, '{docFileUrls}', current_urls, true);

  UPDATE public.investments SET meta = current_meta WHERE id = _investment_id;
  RETURN current_meta;
END;
$function$;


-- ---------------------------------------------------------------------------
-- 3) unregister_unterlage_upload
-- ---------------------------------------------------------------------------
--
-- Rumpf unveraendert aus 20260901121000.

CREATE OR REPLACE FUNCTION public.unregister_unterlage_upload(_investment_id uuid, _doc_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv_row public.investments%ROWTYPE;
  kontakt_row public.kontakte%ROWTYPE;
  current_meta jsonb;
  current_statuses jsonb;
  current_urls jsonb;
BEGIN
  SELECT * INTO inv_row FROM public.investments WHERE id = _investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found';
  END IF;

  SELECT * INTO kontakt_row FROM public.kontakte WHERE id = inv_row.kunde_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontakt not found';
  END IF;

  -- Geaendert am 16.09.2026, siehe Kopf der Migration.
  IF NOT public.darf_investment_nutzen(auth.uid(), inv_row.kunde_id, kontakt_row.meta) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  current_meta := COALESCE(inv_row.meta, '{}'::jsonb);
  current_statuses := COALESCE(current_meta -> 'docStatuses', '{}'::jsonb) - _doc_name;
  current_urls := COALESCE(current_meta -> 'docFileUrls', '{}'::jsonb) - _doc_name;
  current_meta := jsonb_set(current_meta, '{docStatuses}', current_statuses, true);
  current_meta := jsonb_set(current_meta, '{docFileUrls}', current_urls, true);

  UPDATE public.investments SET meta = current_meta WHERE id = _investment_id;
  RETURN current_meta;
END;
$function$;


-- ---------------------------------------------------------------------------
-- 4) confirm_notar_termin
-- ---------------------------------------------------------------------------
--
-- Rumpf unveraendert aus 20260517094425.

CREATE OR REPLACE FUNCTION public.confirm_notar_termin(_investment_id uuid, _datum text, _uhrzeit text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  SELECT * INTO kontakt_row FROM public.kontakte WHERE id = inv_row.kunde_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontakt not found';
  END IF;

  -- Geaendert am 16.09.2026, siehe Kopf der Migration.
  IF NOT public.darf_investment_nutzen(auth.uid(), inv_row.kunde_id, kontakt_row.meta) THEN
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
$function$;


-- ---------------------------------------------------------------------------
-- 5) Rechte bestaetigen
-- ---------------------------------------------------------------------------
--
-- CREATE OR REPLACE laesst bestehende Rechte unangetastet. Die vier Zeilen
-- stehen hier nur, damit der Stand nach dem Lauf eindeutig ist; sie stammen
-- aus 20260601141419, 20260901120000 und 20260901121000.

REVOKE EXECUTE ON FUNCTION public.merge_investment_meta(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.register_unterlage_upload(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.unregister_unterlage_upload(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.confirm_notar_termin(uuid, text, text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.merge_investment_meta(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_unterlage_upload(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_unterlage_upload(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_notar_termin(uuid, text, text) TO authenticated;


-- ===========================================================================
-- PRUEFUNG NACH DEM AUSFUEHREN (aendert nichts)
-- ===========================================================================
--
-- Als Vertriebspartner ausgeben und ein FREMDES Investment anfassen. Erwartet
-- wird die Fehlermeldung "Not authorized". Vorher kam die volle `meta` zurueck.
--
--   begin;
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<VP-UUID>","role":"authenticated"}';
--     select public.merge_investment_meta('<fremde Investment-UUID>'::uuid, '{}'::jsonb);
--   rollback;
--
-- Gegenprobe mit einem EIGENEN Investment desselben Vertriebspartners: Dort
-- muss die `meta` weiterhin kommen.
-- ===========================================================================
