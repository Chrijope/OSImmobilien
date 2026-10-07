-- ===========================================================================
-- Reservierung eines Globalobjekts: das ganze Haus, mit 60 Minuten Vormerkung
-- ===========================================================================
--
-- WARUM ES DIESE MIGRATION GIBT
--
--   Ein Globalobjekt wird nur als Ganzes verkauft. Seit dem 10.09.2026 gilt:
--   Reserviert wird nur das Haus, seine Einheiten nie einzeln (das lehnt die
--   Datenbank seit 20260923150000_reservierung_vormerkung.sql schon ab). Eine
--   Reservierung am Haus selbst gab es bisher nicht. Die Vereinbarung fuer ein
--   Globalobjekt verspricht aber genau das (Punkt 2 a und b). Ohne diese
--   Migration geht deshalb keine Reservierung eines Globalobjekts hinaus.
--
-- WAS DIESE MIGRATION TUT (GL-Regeln vom 23.09.2026, fuers Haus)
--
--   1. Neue Spalten an `objekte`:
--        Belegung:   `belegung` (frei, reserviert, verkauft; Vorgabe frei),
--                    `belegung_kunde_id` (Verweis auf kontakte, beim Loeschen
--                    leer), `belegung_kunde_name`, `belegung_am`,
--                    `belegung_von`.
--        Vormerkung: `vorgemerkt_bis`, `vorgemerkt_kunde_id` (Verweis auf
--                    kontakte, beim Loeschen leer), `vorgemerkt_kunde_name`,
--                    `vorgemerkt_von`, `vorgemerkt_berater_name`.
--
--   2. `vormerke_objekt(p_objekt_id, p_kontakt_id)`. Wer fuer einen Kunden die
--      Reservierungsvereinbarung fuer das ganze Haus absendet, merkt es damit
--      60 Minuten fuer genau diesen Kunden vor. Dieselben Pruefungen wie
--      `vormerke_einheit`: Rolle (`darf_reservieren`), beim Vertriebspartner
--      der eigene Kontakt (`darf_kontakt_bearbeiten`), nur ein Globalobjekt,
--      Exklusivzuweisung. Gesetzt wird in EINEM Schritt und nur, wenn das Haus
--      frei ist, keinen Kunden hat und entweder keine laufende Vormerkung
--      traegt oder schon fuer diesen Kunden vorgemerkt ist. Die Belegung
--      bleibt dabei `frei`; nach 60 Minuten erlischt die Vormerkung allein
--      ueber den Zeitstempel.
--
--   3. `reserviere_objekt_nach_unterschrift(...)`, nur fuer die Dienstrolle
--      (Edge Functions `finalize-reservierung` und
--      `send-reservierung-eskalation`). Reserviert nur, wenn das Haus frei ist
--      oder schon diesem Kunden gehoert. Eine laufende Vormerkung eines
--      anderen Partners haelt die Unterschrift NICHT auf: Die erste
--      Unterschrift gewinnt. Leert die Vormerkung.
--
--   4. Ein Ausloeser `objekt_belegung_pruefen`, nur fuer Aenderungen an
--      `belegung` und `belegung_kunde_id`:
--        * Belegt werden kann nur ein Globalobjekt.
--        * Reservieren duerfen im Browser nur die Rollen aus
--          `darf_reservieren`.
--        * Den Kunden an einem reservierten Haus wechseln duerfen nur Admin
--          und Inhaber.
--        * Wird das Haus belegt, raeumt er die Vormerkung ab; wird es frei,
--          leert er Kunde, Datum und Ausloeser.
--      Alle uebrigen Aenderungen an `objekte` (Speichern im CRM, Abgleich mit
--      Investagon, Texte) beruehren den Ausloeser nicht.
--
-- WAS OHNE SIE PASSIERT
--
--   Der Knopf "Haus fuer Kunden reservieren" auf der Objektseite ist gesperrt,
--   Admin und Inhaber sehen "Migration Globalobjekt-Reservierung noch nicht
--   ausgefuehrt". Das Formular schickt im Modus "gesamtes Objekt" nichts
--   hinaus. Einheitenreservierungen laufen davon unberuehrt weiter.
--
-- WIEDERHOLBAR
--
--   ADD COLUMN IF NOT EXISTS, Einschraenkungen nur wenn sie fehlen,
--   CREATE OR REPLACE, DROP TRIGGER IF EXISTS. Ein zweiter Lauf schadet nicht.
--
-- PRUEFEN (lesend, aendert nichts; nach dem Ausfuehren im SQL-Editor):
--
--   select
--     to_regprocedure('public.vormerke_objekt(uuid,uuid)') is not null
--       as vormerken_da,
--     to_regprocedure('public.reserviere_objekt_nach_unterschrift(uuid,uuid,text,timestamptz,uuid)') is not null
--       as reservieren_da,
--     (select count(*) from information_schema.columns
--       where table_schema = 'public' and table_name = 'objekte'
--         and column_name in ('belegung', 'belegung_kunde_id', 'belegung_kunde_name', 'belegung_am',
--                             'belegung_von', 'vorgemerkt_bis', 'vorgemerkt_kunde_id',
--                             'vorgemerkt_kunde_name', 'vorgemerkt_von', 'vorgemerkt_berater_name')) = 10
--       as spalten_da,
--     exists (select 1 from pg_trigger
--              where tgname = 'objekt_belegung_pruefen' and not tgisinternal)
--       as ausloeser_da,
--     has_function_privilege('anon', to_regprocedure('public.vormerke_objekt(uuid,uuid)'), 'EXECUTE')
--       as anon_darf_vormerken,            -- erwartet: false
--     has_function_privilege('authenticated', to_regprocedure('public.reserviere_objekt_nach_unterschrift(uuid,uuid,text,timestamptz,uuid)'), 'EXECUTE')
--       as angemeldet_darf_reservieren,    -- erwartet: false
--     (select count(*) from public.objekte where belegung <> 'frei')
--       as belegte_haeuser;
--
--   Erwartet: vormerken_da, reservieren_da, spalten_da und ausloeser_da
--   stehen auf true, die beiden Rechte auf false, belegte_haeuser direkt nach
--   dem ersten Lauf auf 0.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Die Spalten
-- ---------------------------------------------------------------------------

ALTER TABLE public.objekte
  ADD COLUMN IF NOT EXISTS belegung text NOT NULL DEFAULT 'frei',
  ADD COLUMN IF NOT EXISTS belegung_kunde_id uuid,
  ADD COLUMN IF NOT EXISTS belegung_kunde_name text,
  ADD COLUMN IF NOT EXISTS belegung_am timestamptz,
  ADD COLUMN IF NOT EXISTS belegung_von uuid,
  ADD COLUMN IF NOT EXISTS vorgemerkt_bis timestamptz,
  ADD COLUMN IF NOT EXISTS vorgemerkt_kunde_id uuid,
  ADD COLUMN IF NOT EXISTS vorgemerkt_kunde_name text,
  ADD COLUMN IF NOT EXISTS vorgemerkt_von uuid,
  ADD COLUMN IF NOT EXISTS vorgemerkt_berater_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'objekte_belegung_check'
  ) THEN
    ALTER TABLE public.objekte
      ADD CONSTRAINT objekte_belegung_check
      CHECK (belegung IN ('frei', 'reserviert', 'verkauft'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'objekte_belegung_kunde_id_fkey'
  ) THEN
    ALTER TABLE public.objekte
      ADD CONSTRAINT objekte_belegung_kunde_id_fkey
      FOREIGN KEY (belegung_kunde_id) REFERENCES public.kontakte(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'objekte_vorgemerkt_kunde_id_fkey'
  ) THEN
    ALTER TABLE public.objekte
      ADD CONSTRAINT objekte_vorgemerkt_kunde_id_fkey
      FOREIGN KEY (vorgemerkt_kunde_id) REFERENCES public.kontakte(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.objekte.belegung IS
  'Belegung des ganzen Hauses (nur Globalobjekt): frei, reserviert, verkauft. Reserviert wird erst mit der Unterschrift.';
COMMENT ON COLUMN public.objekte.belegung_kunde_id IS
  'Fuer welchen Kunden das Haus reserviert oder an wen es verkauft ist.';
COMMENT ON COLUMN public.objekte.belegung_von IS
  'Wer die Reservierung ausgeloest hat. Nach einer Unterschrift der Absender der Vereinbarung, ersatzweise der zustaendige Partner.';
COMMENT ON COLUMN public.objekte.vorgemerkt_bis IS
  'Bis wann das Haus fuer einen Kunden vorgemerkt ist (60 Minuten ab Versand der Reservierungsvereinbarung). Danach von selbst frei.';
COMMENT ON COLUMN public.objekte.vorgemerkt_kunde_id IS
  'Fuer welchen Kunden das Haus vorgemerkt ist. Die Belegung bleibt dabei frei.';


-- ---------------------------------------------------------------------------
-- 2) Vormerken
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.vormerke_objekt(p_objekt_id uuid, p_kontakt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bis timestamptz := now() + interval '60 minutes';
  v_objekt record;
  v_kunde_name text;
  v_berater_name text;
  v_treffer uuid;
  v_stand record;
BEGIN
  IF v_uid IS NULL OR NOT public.darf_reservieren(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  END IF;

  IF p_objekt_id IS NULL OR p_kontakt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'nicht_gefunden');
  END IF;

  -- Admin, Inhaber und Vertriebsleitung duerfen jeden Kontakt, der
  -- Vertriebspartner nur den eigenen oder den einer laufenden Vertretung.
  IF NOT public.darf_kontakt_bearbeiten(v_uid, p_kontakt_id) THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  END IF;

  SELECT o.id, coalesce(o.global_objekt, false) AS global_objekt, o.exklusiv_partner
    INTO v_objekt
    FROM public.objekte o
   WHERE o.id = p_objekt_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'nicht_gefunden');
  END IF;

  -- Als Ganzes reserviert wird nur ein Globalobjekt.
  IF NOT v_objekt.global_objekt THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'kein_globalobjekt');
  END IF;

  -- Exklusivzuweisung wie in der Objektuebersicht: Admin und Inhaber sehen
  -- alles, alle anderen nur, was ihnen zugewiesen ist. Am Objekt stehen Namen.
  IF NOT public.is_admin_role(v_uid)
     AND coalesce(cardinality(v_objekt.exklusiv_partner), 0) > 0
     AND NOT EXISTS (
       SELECT 1
         FROM public.profiles p, unnest(v_objekt.exklusiv_partner) AS n(partner_name)
        WHERE p.id = v_uid
          AND lower(trim(n.partner_name)) = lower(trim(coalesce(p.name, '')))
     ) THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'exklusiv');
  END IF;

  SELECT nullif(trim(concat_ws(' ', k.vorname, k.nachname)), '')
    INTO v_kunde_name
    FROM public.kontakte k WHERE k.id = p_kontakt_id;
  SELECT nullif(trim(p.name), '')
    INTO v_berater_name
    FROM public.profiles p WHERE p.id = v_uid;

  -- Der eine Schritt: nur frei, ohne Kunden, ohne fremde laufende Vormerkung.
  UPDATE public.objekte o
     SET vorgemerkt_bis = v_bis,
         vorgemerkt_kunde_id = p_kontakt_id,
         vorgemerkt_kunde_name = v_kunde_name,
         vorgemerkt_von = v_uid,
         vorgemerkt_berater_name = v_berater_name
   WHERE o.id = p_objekt_id
     AND coalesce(o.global_objekt, false)
     AND o.belegung = 'frei'
     AND o.belegung_kunde_id IS NULL
     AND (o.vorgemerkt_bis IS NULL
          OR o.vorgemerkt_bis <= now()
          OR o.vorgemerkt_kunde_id = p_kontakt_id)
  RETURNING o.id INTO v_treffer;

  IF v_treffer IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'grund', 'vorgemerkt',
      'vorgemerkt_bis', v_bis,
      'vorgemerkt_kunde_name', v_kunde_name,
      'vorgemerkt_berater_name', v_berater_name
    );
  END IF;

  -- Kein Treffer: den Grund nennen.
  SELECT o.belegung, o.belegung_kunde_id, o.vorgemerkt_bis, o.vorgemerkt_berater_name
    INTO v_stand
    FROM public.objekte o WHERE o.id = p_objekt_id;

  IF v_stand.belegung <> 'frei' OR v_stand.belegung_kunde_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'vergeben');
  END IF;

  RETURN jsonb_build_object(
    'ok', false,
    'grund', 'vorgemerkt_von_anderem',
    'vorgemerkt_bis', v_stand.vorgemerkt_bis,
    'vorgemerkt_berater_name', v_stand.vorgemerkt_berater_name
  );
END;
$$;

COMMENT ON FUNCTION public.vormerke_objekt(uuid, uuid) IS
  'Merkt ein freies Globalobjekt (das ganze Haus) fuer 60 Minuten fuer genau einen Kunden vor. Belegung bleibt frei. Regeln vom 23.09.2026.';

REVOKE ALL ON FUNCTION public.vormerke_objekt(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vormerke_objekt(uuid, uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3) Reservieren nach der Unterschrift (nur Dienstrolle)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserviere_objekt_nach_unterschrift(
  p_objekt_id uuid,
  p_kontakt_id uuid,
  p_kunde_name text,
  p_belegung_am timestamptz DEFAULT NULL,
  p_belegung_von uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_global boolean;
  v_treffer uuid;
  v_stand record;
BEGIN
  IF p_objekt_id IS NULL OR p_kontakt_id IS NULL THEN
    RETURN jsonb_build_object('ergebnis', 'nicht_gefunden');
  END IF;

  SELECT coalesce(o.global_objekt, false)
    INTO v_global
    FROM public.objekte o
   WHERE o.id = p_objekt_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ergebnis', 'nicht_gefunden');
  END IF;

  IF NOT v_global THEN
    RETURN jsonb_build_object('ergebnis', 'kein_globalobjekt');
  END IF;

  -- Frei (egal ob gerade fuer jemand anderen vorgemerkt) oder schon diesem
  -- Kunden reserviert. Die Ausdruecke im SET lesen den Stand VOR dem Update.
  -- Gehoert das Haus schon diesem Kunden, bleibt das erste Datum stehen.
  UPDATE public.objekte o
     SET belegung = 'reserviert',
         belegung_kunde_id = p_kontakt_id,
         belegung_kunde_name = coalesce(nullif(trim(p_kunde_name), ''), o.belegung_kunde_name),
         belegung_am = CASE
           WHEN o.belegung = 'reserviert' AND o.belegung_am IS NOT NULL THEN o.belegung_am
           ELSE coalesce(p_belegung_am, now())
         END,
         belegung_von = coalesce(
           CASE WHEN o.vorgemerkt_kunde_id = p_kontakt_id THEN o.vorgemerkt_von END,
           o.belegung_von,
           p_belegung_von
         ),
         vorgemerkt_bis = NULL,
         vorgemerkt_kunde_id = NULL,
         vorgemerkt_kunde_name = NULL,
         vorgemerkt_von = NULL,
         vorgemerkt_berater_name = NULL
   WHERE o.id = p_objekt_id
     AND (
       (o.belegung = 'frei' AND o.belegung_kunde_id IS NULL)
       OR
       (o.belegung = 'reserviert' AND o.belegung_kunde_id = p_kontakt_id)
     )
  RETURNING o.id INTO v_treffer;

  IF v_treffer IS NOT NULL THEN
    RETURN jsonb_build_object('ergebnis', 'reserviert');
  END IF;

  SELECT o.belegung, o.belegung_kunde_id, o.belegung_kunde_name
    INTO v_stand
    FROM public.objekte o WHERE o.id = p_objekt_id;

  RETURN jsonb_build_object(
    'ergebnis', 'vergeben',
    'belegung', v_stand.belegung,
    'kunde_id', v_stand.belegung_kunde_id,
    'kunde_name', v_stand.belegung_kunde_name
  );
END;
$$;

COMMENT ON FUNCTION public.reserviere_objekt_nach_unterschrift(uuid, uuid, text, timestamptz, uuid) IS
  'Reserviert ein Globalobjekt nach der letzten Unterschrift, nur wenn es frei ist oder schon diesem Kunden gehoert. Die erste Unterschrift gewinnt. Nur Dienstrolle.';

REVOKE ALL ON FUNCTION public.reserviere_objekt_nach_unterschrift(uuid, uuid, text, timestamptz, uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserviere_objekt_nach_unterschrift(uuid, uuid, text, timestamptz, uuid)
  TO service_role;


-- ---------------------------------------------------------------------------
-- 4) Der Ausloeser
-- ---------------------------------------------------------------------------
--
-- Nach dem Muster von `wohnung_reservierung_pruefen`. Er greift nur, wenn
-- `belegung` oder `belegung_kunde_id` im Update stehen; das Speichern eines
-- Objekts im CRM und der Abgleich mit Investagon schreiben beide Spalten nie.

CREATE OR REPLACE FUNCTION public.objekt_belegung_pruefen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  neu_belegt boolean;
  wird_reserviert boolean;
  kundenwechsel boolean;
BEGIN
  neu_belegt := NEW.belegung IN ('reserviert', 'verkauft');

  -- Belegt werden kann nur ein Globalobjekt. Gilt auch fuer die Dienstrolle.
  IF neu_belegt
     AND (NEW.belegung IS DISTINCT FROM OLD.belegung OR NEW.belegung_kunde_id IS DISTINCT FROM OLD.belegung_kunde_id)
     AND NOT coalesce(NEW.global_objekt, false) THEN
    RAISE EXCEPTION
      'Als Ganzes reserviert oder verkauft wird nur ein Globalobjekt.'
      USING ERRCODE = '42501';
  END IF;

  -- Aufraeumen, auf jedem Weg, auch mit der Dienstrolle.
  IF neu_belegt THEN
    NEW.vorgemerkt_bis := NULL;
    NEW.vorgemerkt_kunde_id := NULL;
    NEW.vorgemerkt_kunde_name := NULL;
    NEW.vorgemerkt_von := NULL;
    NEW.vorgemerkt_berater_name := NULL;
  ELSE
    NEW.belegung_kunde_id := NULL;
    NEW.belegung_kunde_name := NULL;
    NEW.belegung_am := NULL;
    NEW.belegung_von := NULL;
  END IF;

  wird_reserviert :=
        NEW.belegung = 'reserviert'
    AND NEW.belegung_kunde_id IS NOT NULL
    AND (OLD.belegung IS DISTINCT FROM 'reserviert'
         OR NEW.belegung_kunde_id IS DISTINCT FROM OLD.belegung_kunde_id);

  IF wird_reserviert AND NEW.belegung_am IS NULL THEN
    NEW.belegung_am := now();
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF wird_reserviert AND NOT public.darf_reservieren(auth.uid()) THEN
    RAISE EXCEPTION
      'Reservieren duerfen nur Admin, Inhaber, Vertriebsleitung und Vertriebspartner.'
      USING ERRCODE = '42501';
  END IF;

  -- Kundenwechsel an einem reservierten oder verkauften Haus: nur Admin und Inhaber.
  kundenwechsel :=
        OLD.belegung IN ('reserviert', 'verkauft')
    AND OLD.belegung_kunde_id IS NOT NULL
    AND NEW.belegung_kunde_id IS NOT NULL
    AND NEW.belegung_kunde_id IS DISTINCT FROM OLD.belegung_kunde_id;

  IF kundenwechsel AND NOT public.is_admin_role(auth.uid()) THEN
    RAISE EXCEPTION
      'Dieses Haus ist bereits an einen anderen Kunden reserviert. Den Kunden wechseln duerfen nur Admin und Inhaber.'
      USING ERRCODE = '42501';
  END IF;

  -- Wer im Browser reserviert (Handeintrag), steht als Ausloeser da.
  IF wird_reserviert AND NEW.belegung_von IS NULL THEN
    NEW.belegung_von := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS objekt_belegung_pruefen ON public.objekte;
CREATE TRIGGER objekt_belegung_pruefen
  BEFORE UPDATE OF belegung, belegung_kunde_id ON public.objekte
  FOR EACH ROW
  EXECUTE FUNCTION public.objekt_belegung_pruefen();

-- PostgREST soll die neuen Spalten und Funktionen sofort kennen, sonst meldet
-- es fuer einen Moment noch PGRST202 und der Browser haelt das Haus fuer
-- nicht reservierbar.
NOTIFY pgrst, 'reload schema';
