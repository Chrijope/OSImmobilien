-- ===========================================================================
-- Dokumenten-Ampel: Freigabe je Unterlage fuer Kunden
-- ===========================================================================
--
-- WAS DIESE MIGRATION TUT (Christians Freigaben vom 23.09.2026)
--
--   Welche Unterlage ein Kunde sieht, entscheidet die Ampel im Code
--   (`supabase/functions/_shared/dokument-freigabe.ts`): Gruen geht von
--   selbst hinaus, Gelb erst nach einer Freigabe, Rot (Mietvertrag,
--   Grundbuch) nie im Original, hoechstens als geprueft geschwaerzte und
--   freigegebene Kopie. Diese Migration legt ab, was die Rollen mit
--   Freigaberecht (Punkt 2) je Unterlage davon abweichend entscheiden.
--
--   Erweitert am 23.09.2026, noch vor dem ersten Lauf: Wer umschalten darf,
--   ist nicht mehr fest Admin und Inhaber, sondern einstellbar (Punkt 2).
--
--   1. Neue Spalten an `objekt_dokumente` und `wohnungs_dokumente`:
--        kunden_freigabe      'frei', 'gesperrt' oder leer. Leer heisst:
--                             Grundregel der Ampel.
--        kunden_freigabe_von  wer zuletzt entschieden hat
--        kunden_freigabe_am   wann
--        geschwaerzt          als geschwaerzt geprueft, von jemandem mit
--                             Freigaberecht. Zaehlt nur bei roten Unterlagen.
--
--   2. `darf_dokument_freigeben(_user_id)`: Wer darf umschalten?
--        * Admin und Inhaber immer (`is_admin_role`), nicht abwaehlbar.
--        * Dazu die Rollen, die Admin oder Inhaber in der Nutzerverwaltung
--          unter „Rollen & Berechtigungen" gewaehlt haben. Die Wahl liegt in
--          `app_config` unter `dokument_freigabe_rollen` als
--          {"rollen": ["vertriebsleiter", ...]}.
--        * Waehlbar sind nur vertriebsleiter, objektpartner, backoffice und
--          vertriebspartner. Jede andere Rolle im Eintrag zaehlt nicht.
--        * Fehlt der Eintrag oder hat er keine Liste, gilt die
--          Voreinstellung: vertriebsleiter und objektpartner. Eine leere
--          Liste ist dagegen eine Entscheidung: nur Admin und Inhaber.
--        * Die Rollen kommen aus `user_roles` wie bei `is_admin_role`: Wer
--          eine berechtigte Rolle traegt, darf, auch wenn im Browser gerade
--          eine andere Rolle aktiv ist.
--        * Aus dem Browser nicht aufrufbar. Sie wird nur von den beiden
--          Stellen unten benutzt, der Browser liest die Einstellung selbst.
--
--   3. `setze_kunden_freigabe(p_tabelle, p_id, p_freigabe, p_geschwaerzt)`:
--      der einzige Weg, diese Spalten aus dem Browser zu aendern. Nur wer
--      `darf_dokument_freigeben` besteht. Antwortet mit jsonb, `ok` und bei
--      Ablehnung `grund`.
--
--   4. Ausloeser `dokument_kundenfreigabe_schuetzen` an beiden Tabellen:
--        * Wer kein Freigaberecht hat, aber Zeilen anlegen oder aendern darf
--          (etwa an `wohnungs_dokumente` alle internen Rollen), aendert die
--          vier Spalten nicht. Beim Anlegen starten sie leer, beim Aendern
--          bleiben die alten Werte. Still, ohne Fehler: Ein Speichern, das
--          die ganze Zeile schickt, soll nicht scheitern.
--        * Wer freigeben darf, steht bei jeder Aenderung von Freigabe oder
--          Schwaerzung selbst als `kunden_freigabe_von` mit der echten Zeit
--          da. Einen fremden Namen oder ein anderes Datum eintragen geht
--          nicht, ohne Aenderung bleiben die alten Werte.
--        * Wechselt die Datei (`url`), gilt eine Freigabe nicht fuer die neue
--          Datei. `frei` und `geschwaerzt` fallen weg, `gesperrt` bleibt.
--          Gilt fuer alle, auch fuer Admin: Eine neue Datei muss neu
--          geprueft werden, sonst ginge nach einer geschwaerzten Kopie das
--          Original hinaus.
--        * Serverseitige Laeufe ohne angemeldeten Nutzer (Dienstrolle,
--          Investagon-Import, SQL-Editor) bleiben bei der Rollenpruefung
--          aussen vor, wie bei `wohnung_reservierung_pruefen`.
--
-- WAS OHNE SIE PASSIERT
--
--   Die Spalten fehlen, der Code liest sie defensiv. Die Ampel laeuft mit
--   ihren Grundregeln, der Schalter im Reiter „Dokumente" ist gesperrt und
--   zeigt jedem, der umschalten duerfte, einen Hinweis. Es stuerzt nichts ab.
--
-- FRUEHERE LUECKE, SEIT DEM 23.09.2026 GESCHLOSSEN
--
--   `saveObjekt` im Browser (`src/lib/objekteStore.ts`) hat beim Speichern
--   eines Objekts alle Objektunterlagen und Einheiten geloescht und neu
--   angelegt; eine Entscheidung waere dabei verloren gegangen. Seit dem
--   23.09.2026 schreibt es nur noch Aenderungen und schickt die vier
--   Freigabespalten nie mit. Der Investagon-Import loescht keine
--   Dokumentzeilen.
--
-- WIEDERHOLBAR
--
--   ADD COLUMN IF NOT EXISTS, Pruefregel nur wenn noch nicht da, CREATE OR
--   REPLACE, DROP TRIGGER IF EXISTS. Ein zweiter Lauf schadet nicht.
--
-- PRUEFEN (lesend, aendert nichts; nach dem Ausfuehren im SQL-Editor):
--
--   select
--     (select count(*) from information_schema.columns
--       where table_schema = 'public' and table_name = 'objekt_dokumente'
--         and column_name in ('kunden_freigabe', 'kunden_freigabe_von', 'kunden_freigabe_am', 'geschwaerzt')) = 4
--       as spalten_objekt_da,
--     (select count(*) from information_schema.columns
--       where table_schema = 'public' and table_name = 'wohnungs_dokumente'
--         and column_name in ('kunden_freigabe', 'kunden_freigabe_von', 'kunden_freigabe_am', 'geschwaerzt')) = 4
--       as spalten_wohnung_da,
--     to_regprocedure('public.setze_kunden_freigabe(text,uuid,text,boolean)') is not null
--       as funktion_da,
--     to_regprocedure('public.darf_dokument_freigeben(uuid)') is not null
--       as rechtepruefung_da,
--     (select count(*) from pg_trigger
--       where tgname = 'dokument_kundenfreigabe_schuetzen' and not tgisinternal) = 2
--       as ausloeser_da,
--     has_function_privilege('anon', to_regprocedure('public.setze_kunden_freigabe(text,uuid,text,boolean)'), 'EXECUTE')
--       as anon_darf_setzen,               -- erwartet: false
--     has_function_privilege('authenticated', to_regprocedure('public.darf_dokument_freigeben(uuid)'), 'EXECUTE')
--       as browser_darf_pruefen;           -- erwartet: false
--
--   Erwartet: die ersten fuenf auf true, die letzten beiden auf false.
--
-- WER GERADE DARF (lesend; ohne Eintrag gilt die Voreinstellung):
--
--   select wert from public.app_config where schluessel = 'dokument_freigabe_rollen';
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Die Spalten
-- ---------------------------------------------------------------------------

ALTER TABLE public.objekt_dokumente
  ADD COLUMN IF NOT EXISTS kunden_freigabe text,
  ADD COLUMN IF NOT EXISTS kunden_freigabe_von uuid,
  ADD COLUMN IF NOT EXISTS kunden_freigabe_am timestamptz,
  ADD COLUMN IF NOT EXISTS geschwaerzt boolean NOT NULL DEFAULT false;

ALTER TABLE public.wohnungs_dokumente
  ADD COLUMN IF NOT EXISTS kunden_freigabe text,
  ADD COLUMN IF NOT EXISTS kunden_freigabe_von uuid,
  ADD COLUMN IF NOT EXISTS kunden_freigabe_am timestamptz,
  ADD COLUMN IF NOT EXISTS geschwaerzt boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objekt_dokumente_kunden_freigabe_check') THEN
    ALTER TABLE public.objekt_dokumente
      ADD CONSTRAINT objekt_dokumente_kunden_freigabe_check
      CHECK (kunden_freigabe IS NULL OR kunden_freigabe IN ('frei', 'gesperrt'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wohnungs_dokumente_kunden_freigabe_check') THEN
    ALTER TABLE public.wohnungs_dokumente
      ADD CONSTRAINT wohnungs_dokumente_kunden_freigabe_check
      CHECK (kunden_freigabe IS NULL OR kunden_freigabe IN ('frei', 'gesperrt'));
  END IF;
END $$;

COMMENT ON COLUMN public.objekt_dokumente.kunden_freigabe IS
  'Entscheidung einer Person mit Freigaberecht (darf_dokument_freigeben): frei oder gesperrt. Leer heisst Grundregel der Ampel (dokument-freigabe.ts). Aendern nur ueber setze_kunden_freigabe.';
COMMENT ON COLUMN public.objekt_dokumente.geschwaerzt IS
  'Von einer Person mit Freigaberecht als geschwaerzt geprueft. Nur dann darf eine rote Unterlage (Mietvertrag, Grundbuch) ueberhaupt freigegeben werden.';
COMMENT ON COLUMN public.wohnungs_dokumente.kunden_freigabe IS
  'Entscheidung einer Person mit Freigaberecht (darf_dokument_freigeben): frei oder gesperrt. Leer heisst Grundregel der Ampel (dokument-freigabe.ts). Aendern nur ueber setze_kunden_freigabe.';
COMMENT ON COLUMN public.wohnungs_dokumente.geschwaerzt IS
  'Von einer Person mit Freigaberecht als geschwaerzt geprueft. Nur dann darf eine rote Unterlage (Mietvertrag, Grundbuch) ueberhaupt freigegeben werden.';


-- ---------------------------------------------------------------------------
-- 2) Wer freigeben darf
-- ---------------------------------------------------------------------------
--
-- Dieselben Listen stehen im Browser in `src/lib/dokumentFreigabeRollen.ts`,
-- dort entscheiden sie nur, ob der Schalter erscheint. Massgeblich ist diese
-- Funktion. Ein Test vergleicht beide Stellen.

CREATE OR REPLACE FUNCTION public.darf_dokument_freigeben(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Nur diese Rollen lassen sich zuschalten. Steht im Eintrag etwas anderes,
  -- etwa kunde, zaehlt es nicht.
  _waehlbar constant text[] := ARRAY['vertriebsleiter', 'objektpartner', 'backoffice', 'vertriebspartner'];
  _wert jsonb;
  _rollen text[];
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Admin und Inhaber immer, gleich was eingestellt ist.
  IF public.is_admin_role(_user_id) THEN
    RETURN true;
  END IF;

  SELECT c.wert INTO _wert
    FROM public.app_config c
   WHERE c.schluessel = 'dokument_freigabe_rollen'
   LIMIT 1;

  IF jsonb_typeof(_wert -> 'rollen') = 'array' THEN
    -- Eine leere Liste ist eine Entscheidung: nur Admin und Inhaber.
    SELECT coalesce(array_agg(r.rolle), ARRAY[]::text[])
      INTO _rollen
      FROM jsonb_array_elements_text(_wert -> 'rollen') AS r(rolle)
     WHERE r.rolle = ANY (_waehlbar);
  ELSE
    -- Nichts eingestellt: die Voreinstellung vom 23.09.2026.
    _rollen := ARRAY['vertriebsleiter', 'objektpartner'];
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.user_roles ur
     WHERE ur.user_id = _user_id
       AND ur.role::text = ANY (_rollen)
  );
END;
$$;

COMMENT ON FUNCTION public.darf_dokument_freigeben(uuid) IS
  'Darf diese Person Unterlagen fuer Kunden freigeben? Admin und Inhaber immer, dazu die Rollen aus app_config.dokument_freigabe_rollen (ohne Eintrag: vertriebsleiter, objektpartner).';

-- Nur fuer die beiden Stellen unten, die als Eigentuemer laufen. Der Browser
-- braucht sie nicht, und wer die Rolle einer fremden Kennung abfragen kann,
-- erfaehrt mehr, als er muss.
REVOKE ALL ON FUNCTION public.darf_dokument_freigeben(uuid) FROM public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3) Umschalten, nur mit Freigaberecht
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.setze_kunden_freigabe(
  p_tabelle text,
  p_id uuid,
  p_freigabe text,
  p_geschwaerzt boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_freigabe text := nullif(lower(trim(coalesce(p_freigabe, ''))), '');
  v_treffer uuid;
  v_geschwaerzt boolean;
BEGIN
  IF v_uid IS NULL OR NOT public.darf_dokument_freigeben(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  END IF;

  IF v_freigabe IS NOT NULL AND v_freigabe NOT IN ('frei', 'gesperrt') THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'ungueltiger_wert');
  END IF;

  IF p_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'nicht_gefunden');
  END IF;

  -- Die Tabelle nur aus dieser festen Liste, nie als zusammengesetzter Text.
  IF p_tabelle = 'objekt_dokumente' THEN
    UPDATE public.objekt_dokumente
       SET kunden_freigabe = v_freigabe,
           geschwaerzt = coalesce(p_geschwaerzt, geschwaerzt, false),
           kunden_freigabe_von = v_uid,
           kunden_freigabe_am = now()
     WHERE id = p_id
    RETURNING id, geschwaerzt INTO v_treffer, v_geschwaerzt;
  ELSIF p_tabelle = 'wohnungs_dokumente' THEN
    UPDATE public.wohnungs_dokumente
       SET kunden_freigabe = v_freigabe,
           geschwaerzt = coalesce(p_geschwaerzt, geschwaerzt, false),
           kunden_freigabe_von = v_uid,
           kunden_freigabe_am = now()
     WHERE id = p_id
    RETURNING id, geschwaerzt INTO v_treffer, v_geschwaerzt;
  ELSE
    RETURN jsonb_build_object('ok', false, 'grund', 'unbekannte_tabelle');
  END IF;

  IF v_treffer IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'nicht_gefunden');
  END IF;

  RETURN jsonb_build_object('ok', true, 'kunden_freigabe', v_freigabe, 'geschwaerzt', v_geschwaerzt);
END;
$$;

REVOKE ALL ON FUNCTION public.setze_kunden_freigabe(text, uuid, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.setze_kunden_freigabe(text, uuid, text, boolean) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4) Der Ausloeser, der die Spalten schuetzt
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dokument_kundenfreigabe_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Rechte: Nur wer `darf_dokument_freigeben` besteht, entscheidet. Laeufe
  -- ohne angemeldeten Nutzer (Dienstrolle, Import, SQL-Editor) bleiben
  -- aussen vor.
  IF auth.uid() IS NOT NULL AND NOT public.darf_dokument_freigeben(auth.uid()) THEN
    IF TG_OP = 'INSERT' THEN
      NEW.kunden_freigabe := NULL;
      NEW.kunden_freigabe_von := NULL;
      NEW.kunden_freigabe_am := NULL;
      NEW.geschwaerzt := false;
    ELSE
      NEW.kunden_freigabe := OLD.kunden_freigabe;
      NEW.kunden_freigabe_von := OLD.kunden_freigabe_von;
      NEW.kunden_freigabe_am := OLD.kunden_freigabe_am;
      NEW.geschwaerzt := OLD.geschwaerzt;
    END IF;
  ELSIF auth.uid() IS NOT NULL THEN
    -- Wer freigeben darf, steht immer selbst und mit der echten Zeit da.
    -- Sonst koennte beim direkten Schreiben in die Tabelle eine fremde
    -- Person oder ein anderes Datum als Freigebender eingetragen werden.
    IF TG_OP = 'INSERT' THEN
      IF NEW.kunden_freigabe IS NULL AND NOT coalesce(NEW.geschwaerzt, false) THEN
        NEW.kunden_freigabe_von := NULL;
        NEW.kunden_freigabe_am := NULL;
      ELSE
        NEW.kunden_freigabe_von := auth.uid();
        NEW.kunden_freigabe_am := now();
      END IF;
    ELSIF NEW.kunden_freigabe IS DISTINCT FROM OLD.kunden_freigabe
       OR NEW.geschwaerzt IS DISTINCT FROM OLD.geschwaerzt THEN
      NEW.kunden_freigabe_von := auth.uid();
      NEW.kunden_freigabe_am := now();
    ELSE
      NEW.kunden_freigabe_von := OLD.kunden_freigabe_von;
      NEW.kunden_freigabe_am := OLD.kunden_freigabe_am;
    END IF;
  END IF;

  -- Neue Datei: Eine Freigabe galt der alten. `gesperrt` bleibt stehen, denn
  -- eine Sperre zu verlieren waere die unsichere Richtung.
  IF TG_OP = 'UPDATE' AND NEW.url IS DISTINCT FROM OLD.url THEN
    IF NEW.kunden_freigabe = 'frei' THEN
      NEW.kunden_freigabe := NULL;
      NEW.kunden_freigabe_von := NULL;
      NEW.kunden_freigabe_am := NULL;
    END IF;
    NEW.geschwaerzt := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dokument_kundenfreigabe_schuetzen ON public.objekt_dokumente;
CREATE TRIGGER dokument_kundenfreigabe_schuetzen
  BEFORE INSERT OR UPDATE ON public.objekt_dokumente
  FOR EACH ROW
  EXECUTE FUNCTION public.dokument_kundenfreigabe_schuetzen();

DROP TRIGGER IF EXISTS dokument_kundenfreigabe_schuetzen ON public.wohnungs_dokumente;
CREATE TRIGGER dokument_kundenfreigabe_schuetzen
  BEFORE INSERT OR UPDATE ON public.wohnungs_dokumente
  FOR EACH ROW
  EXECUTE FUNCTION public.dokument_kundenfreigabe_schuetzen();

-- PostgREST soll die neue Funktion und die Spalten sofort kennen.
NOTIFY pgrst, 'reload schema';
