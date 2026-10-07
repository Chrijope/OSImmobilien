-- ===========================================================================
-- Objekt und Einheit loeschen: Pruefung in der Datenbank
-- ===========================================================================
--
-- Seit dem 04.10.2026 sperrt die Oberflaeche das Loeschen eines Objekts oder
-- einer Einheit, wenn eine Einheit gebunden ist (reserviert, verkauft, Kunde,
-- Vormerkung, Investagon, Investment, gesendeter Kundenlink) oder das ganze
-- Haus belegt ist. Bisher pruefte nur der Browser, und ein direktes DELETE
-- ueber die Schnittstelle ging an allem vorbei.
--
-- Diese Migration legt die Regeln in die Datenbank:
--   1. `einheit_loesch_grund(jsonb)` und `objekt_loesch_grund(uuid)` liefern
--      den Grund als Satzteil oder NULL, ohne Zeilensicherheit.
--   2. BEFORE-DELETE-Ausloeser auf `objekte` und `wohnungen` lehnen ein
--      Loeschen mit Grund ab, sobald es aus dem Browser kommt: Rolle im
--      Anmeldetoken `authenticated` oder `anon`. Das gilt auch, wenn ein
--      Browser-Aufruf ueber eine Funktion loescht, etwa `objekt_loeschen`.
--      Die Dienstrolle (Edge Functions wie der Investagon-Import) und der
--      SQL-Editor ohne Token bleiben unberuehrt. Der Token und nicht
--      current_user, weil die Ausloeser als SECURITY DEFINER laufen muessen,
--      um die gesperrten Pruefungen aufzurufen.
--   3. `objekt_loeschen(uuid)` sperrt Objekt und Einheiten (FOR UPDATE),
--      prueft das Recht wie die Loeschregel auf `objekte` (Admin und Inhaber,
--      oder objektpartner am eigenen Objekt; ohne `erstellt_von` nie) und
--      dieselben Gruende, und loescht dann samt Kaskade.
--
-- Heutige Loeschwege bleiben: Einheit loeschen und Objekt speichern pruefen
-- im Browser dieselben Gruende und loeschen nur Freies; der Investagon-Import
-- loescht mit der Dienstrolle. Ein neues Objekt, dessen Speichern scheitert,
-- wird wieder entfernt; traegt eine seiner Einheiten schon „verkauft“,
-- bleibt es jetzt stehen und muss von Hand entfernt werden.
--
-- Restrisiko: Ein Investment, das gleichzeitig mit dem Loeschen auf eine
-- Einheit gesetzt wird, sperrt die Einheit nicht, weil Investments nicht
-- mitgesperrt werden.
--
-- Steht fuer sich, Reihenfolge egal, keine Function auszurollen, aendert
-- keine Daten, wiederholbar.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.einheit_loesch_grund(_w jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _anzahl int;
BEGIN
  IF lower(btrim(coalesce(_w ->> 'status', ''))) = 'verkauft' THEN
    RETURN 'verkauft';
  END IF;
  IF lower(btrim(coalesce(_w ->> 'status', ''))) IN ('reserviert', 'gesetzt')
     OR nullif(btrim(coalesce(_w ->> 'reserviert_von', '')), '') IS NOT NULL THEN
    RETURN 'reserviert';
  END IF;
  IF nullif(btrim(coalesce(_w ->> 'kunde_id', '')), '') IS NOT NULL
     OR nullif(btrim(coalesce(_w ->> 'kunde_name', '')), '') IS NOT NULL THEN
    RETURN 'mit Kunde';
  END IF;
  IF (_w ->> 'vorgemerkt_bis') IS NOT NULL AND (_w ->> 'vorgemerkt_bis')::timestamptz > now() THEN
    RETURN 'vorgemerkt';
  END IF;
  IF nullif(btrim(coalesce(_w -> 'meta' ->> 'investagonId', '')), '') IS NOT NULL THEN
    RETURN 'aus Investagon';
  END IF;
  SELECT count(*) INTO _anzahl
    FROM public.investments i
   WHERE (i.meta ->> 'wohnungId') = (_w ->> 'id');
  IF _anzahl > 0 THEN
    RETURN 'Investment verweist darauf';
  END IF;
  IF to_regclass('public.objekt_exposes') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*) FROM public.objekt_exposes e
       WHERE (to_jsonb(e) ->> 'wohnung_id' = $1 OR to_jsonb(e) ->> 'einstieg_wohnung_id' = $1)
         AND (to_jsonb(e) ->> 'gesendet_am') IS NOT NULL
         AND (to_jsonb(e) ->> 'zurueckgezogen_am') IS NULL
    $q$ INTO _anzahl USING (_w ->> 'id');
    IF _anzahl > 0 THEN
      RETURN 'gesendeter Kundenlink';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.objekt_loesch_grund(_objekt_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _o jsonb;
  _w jsonb;
  _grund text;
  _gruende text[] := '{}';
  _anzahl int;
BEGIN
  SELECT to_jsonb(o) INTO _o FROM public.objekte o WHERE o.id = _objekt_id;
  IF _o IS NULL THEN
    RETURN NULL;
  END IF;
  IF coalesce(nullif(btrim(_o ->> 'belegung'), ''), 'frei') <> 'frei'
     OR nullif(btrim(coalesce(_o ->> 'belegung_kunde_id', '')), '') IS NOT NULL THEN
    RETURN 'das ganze Haus reserviert oder verkauft ist';
  END IF;
  SELECT count(*) INTO _anzahl
    FROM public.investments i
   WHERE (i.meta ->> 'objektId') = _objekt_id::text;
  IF _anzahl > 0 THEN
    RETURN CASE WHEN _anzahl = 1 THEN 'ein Investment' ELSE _anzahl || ' Investments' END
      || ' auf das Objekt verweisen';
  END IF;
  FOR _w IN SELECT to_jsonb(w) FROM public.wohnungen w WHERE w.objekt_id = _objekt_id LOOP
    _grund := public.einheit_loesch_grund(_w);
    IF _grund IS NOT NULL THEN
      _gruende := _gruende || ('Einheit „' || coalesce(nullif(btrim(_w ->> 'we_nr'), ''), '?') || '“ (' || _grund || ')');
    END IF;
  END LOOP;
  IF cardinality(_gruende) > 0 THEN
    RETURN 'Einheiten gebunden sind: ' || array_to_string(_gruende[1:3], ', ')
      || CASE WHEN cardinality(_gruende) > 3 THEN ' und ' || (cardinality(_gruende) - 3) || ' weitere' ELSE '' END;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.loeschen_aus_dem_browser()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) IN ('authenticated', 'anon');
$$;

REVOKE ALL ON FUNCTION public.einheit_loesch_grund(jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.objekt_loesch_grund(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.objekt_loeschen_pruefen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grund text;
BEGIN
  IF NOT public.loeschen_aus_dem_browser() THEN
    RETURN OLD;
  END IF;
  _grund := public.objekt_loesch_grund(OLD.id);
  IF _grund IS NOT NULL THEN
    RAISE EXCEPTION 'Das Objekt kann nicht gelöscht werden, weil %.', _grund USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.einheit_loeschen_pruefen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grund text;
BEGIN
  IF NOT public.loeschen_aus_dem_browser() THEN
    RETURN OLD;
  END IF;
  _grund := public.einheit_loesch_grund(to_jsonb(OLD));
  IF _grund IS NOT NULL THEN
    RAISE EXCEPTION 'Einheit „%“ kann nicht gelöscht werden (%).',
      coalesce(nullif(btrim(to_jsonb(OLD) ->> 'we_nr'), ''), '?'), _grund
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.objekt_loeschen_pruefen() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.einheit_loeschen_pruefen() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_objekt_loeschen_pruefen ON public.objekte;
CREATE TRIGGER trg_objekt_loeschen_pruefen
  BEFORE DELETE ON public.objekte
  FOR EACH ROW EXECUTE FUNCTION public.objekt_loeschen_pruefen();

DROP TRIGGER IF EXISTS trg_einheit_loeschen_pruefen ON public.wohnungen;
CREATE TRIGGER trg_einheit_loeschen_pruefen
  BEFORE DELETE ON public.wohnungen
  FOR EACH ROW EXECUTE FUNCTION public.einheit_loeschen_pruefen();

CREATE OR REPLACE FUNCTION public.objekt_loeschen(_objekt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _o jsonb;
  _grund text;
  _anzahl int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(o) INTO _o FROM public.objekte o WHERE o.id = _objekt_id FOR UPDATE;
  IF _o IS NULL THEN
    RAISE EXCEPTION 'Das Objekt wurde nicht gefunden. Vielleicht hat es inzwischen jemand anderes entfernt.'
      USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM public.wohnungen w WHERE w.objekt_id = _objekt_id FOR UPDATE;

  IF NOT (
    coalesce(public.is_admin_role(_uid), false)
    OR (
      coalesce(public.has_role(_uid, 'objektpartner'::public.app_role), false)
      AND (_o ->> 'erstellt_von') IS NOT NULL
      AND (_o ->> 'erstellt_von') = _uid::text
    )
  ) THEN
    RAISE EXCEPTION 'Dieses Objekt darfst du nicht löschen.' USING ERRCODE = '42501';
  END IF;

  _grund := public.objekt_loesch_grund(_objekt_id);
  IF _grund IS NOT NULL THEN
    RAISE EXCEPTION 'Das Objekt kann nicht gelöscht werden, weil %.', _grund USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.objekte WHERE id = _objekt_id;
  GET DIAGNOSTICS _anzahl = ROW_COUNT;
  IF _anzahl <> 1 THEN
    RAISE EXCEPTION 'Das Objekt konnte nicht gelöscht werden.' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('geloescht', true);
END;
$$;

REVOKE ALL ON FUNCTION public.objekt_loeschen(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.objekt_loeschen(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeilen 78.1 und 78.2 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
