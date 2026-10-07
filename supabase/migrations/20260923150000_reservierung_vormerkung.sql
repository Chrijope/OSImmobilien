-- ===========================================================================
-- Reservieren aus der Einheitsseite: 60 Minuten Vormerkung
-- ===========================================================================
--
-- WAS DIESE MIGRATION TUT (Christians Regeln vom 23.09.2026)
--
--   1. Neue Spalten an `wohnungen`: `vorgemerkt_bis`, `vorgemerkt_kunde_id`
--      (Verweis auf kontakte, beim Loeschen leer), `vorgemerkt_kunde_name`,
--      `vorgemerkt_von`, `vorgemerkt_berater_name` und `reserviert_von`.
--
--   2. `vormerke_einheit(p_wohnung_id, p_kontakt_id)`. Wer fuer einen Kunden
--      die Reservierungsvereinbarung absendet, merkt die Einheit damit fuer
--      60 Minuten vor, fuer genau diesen Kunden. Die Funktion prueft die
--      Rolle (`darf_reservieren`), beim Vertriebspartner den eigenen Kontakt
--      (`darf_kontakt_bearbeiten`, also Eigentum oder laufende Vertretung),
--      das Globalobjekt und die Exklusivzuweisung. Gesetzt wird in EINEM
--      Schritt und nur, wenn die Einheit frei ist, keinen Kunden hat und
--      entweder keine laufende Vormerkung traegt oder schon fuer diesen Kunden
--      vorgemerkt ist. Zwei Partner, die gleichzeitig klicken, koennen damit
--      nicht beide gewinnen: Der zweite wartet auf die Zeilensperre des
--      ersten und findet danach dessen Vormerkung vor.
--      Der Status bleibt dabei `frei`. Nach 60 Minuten erlischt die
--      Vormerkung von selbst, allein ueber den Zeitstempel, ohne Zeitplan-Job.
--
--   3. `reserviere_einheit_nach_unterschrift(...)`, nur fuer die Dienstrolle
--      (Edge Functions `finalize-reservierung` und
--      `send-reservierung-eskalation`). Reserviert nur, wenn die Einheit frei
--      ist oder schon diesem Kunden gehoert. Eine laufende Vormerkung eines
--      anderen Partners haelt die Unterschrift NICHT auf: Die erste
--      Unterschrift gewinnt. Setzt `kunde_id`, `kunde_name`,
--      `reserviert_am`, `reserviert_von` und leert die Vormerkung.
--
--   4. Der Ausloeser `wohnung_reservierung_pruefen` wird verschaerft:
--        * Den Kunden an einer reservierten Einheit wechseln duerfen nur noch
--          Admin und Inhaber. Bisher durfte jede der vier Vertriebsrollen eine
--          fremde Reservierung auf den eigenen Kunden umschreiben.
--        * Eine Einheit eines Globalobjekts wird nie fuer einen Kunden
--          reserviert, auch nicht von der Dienstrolle (Entscheidung vom
--          10.09.2026: reserviert wird dort nur das ganze Haus). Ein Status
--          `reserviert` ohne Kunden, wie ihn der Investagon-Import setzt,
--          bleibt erlaubt.
--        * Wird eine Einheit belegt, raeumt er die Vormerkung ab; wird sie
--          frei, leert er `reserviert_von`. Damit stimmen die neuen Spalten
--          auch auf den alten Wegen (Handeintrag, Aufheben, Import).
--
-- WAS OHNE SIE PASSIERT
--
--   Der Browser erkennt die fehlende Funktion (PGRST202) und faellt auf den
--   bisherigen Weg zurueck: Die Einheit wird beim Absenden auf reserviert
--   gesetzt, jetzt aber erst nach einer Pruefung, ob sie noch frei ist. Admin
--   und Inhaber sehen einen Hinweis "Migration Vormerkung noch nicht
--   ausgefuehrt". Die Edge Functions reservieren nach der Unterschrift ueber
--   ein bedingtes Update. Es stuerzt nichts ab.
--
-- WIEDERHOLBAR
--
--   ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, DROP TRIGGER IF EXISTS. Ein
--   zweiter Lauf schadet nicht.
--
-- PRUEFEN (lesend, aendert nichts; nach dem Ausfuehren im SQL-Editor):
--
--   select
--     to_regprocedure('public.vormerke_einheit(uuid,uuid)') is not null
--       as vormerken_da,
--     to_regprocedure('public.reserviere_einheit_nach_unterschrift(uuid,uuid,text,text,uuid)') is not null
--       as reservieren_da,
--     (select count(*) from information_schema.columns
--       where table_schema = 'public' and table_name = 'wohnungen'
--         and column_name in ('vorgemerkt_bis', 'vorgemerkt_kunde_id', 'vorgemerkt_kunde_name',
--                             'vorgemerkt_von', 'vorgemerkt_berater_name', 'reserviert_von')) = 6
--       as spalten_da,
--     coalesce(pg_get_functiondef(to_regprocedure('public.wohnung_reservierung_pruefen()')) ilike '%global_objekt%', false)
--       as ausloeser_neu,
--     has_function_privilege('anon', to_regprocedure('public.vormerke_einheit(uuid,uuid)'), 'EXECUTE')
--       as anon_darf_vormerken,            -- erwartet: false
--     has_function_privilege('authenticated', to_regprocedure('public.reserviere_einheit_nach_unterschrift(uuid,uuid,text,text,uuid)'), 'EXECUTE')
--       as angemeldet_darf_reservieren,    -- erwartet: false
--     (select count(*) from public.wohnungen where vorgemerkt_bis > now())
--       as laufende_vormerkungen;
--
--   Erwartet: vormerken_da, reservieren_da, spalten_da und ausloeser_neu
--   stehen auf true, die beiden Rechte auf false.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Die Spalten
-- ---------------------------------------------------------------------------

ALTER TABLE public.wohnungen
  ADD COLUMN IF NOT EXISTS vorgemerkt_bis timestamptz,
  ADD COLUMN IF NOT EXISTS vorgemerkt_kunde_id uuid,
  ADD COLUMN IF NOT EXISTS vorgemerkt_kunde_name text,
  ADD COLUMN IF NOT EXISTS vorgemerkt_von uuid,
  ADD COLUMN IF NOT EXISTS vorgemerkt_berater_name text,
  ADD COLUMN IF NOT EXISTS reserviert_von uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wohnungen_vorgemerkt_kunde_id_fkey'
  ) THEN
    ALTER TABLE public.wohnungen
      ADD CONSTRAINT wohnungen_vorgemerkt_kunde_id_fkey
      FOREIGN KEY (vorgemerkt_kunde_id) REFERENCES public.kontakte(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.wohnungen.vorgemerkt_bis IS
  'Bis wann die Einheit fuer einen Kunden vorgemerkt ist (60 Minuten ab Versand der Reservierungsvereinbarung). Danach von selbst frei.';
COMMENT ON COLUMN public.wohnungen.vorgemerkt_kunde_id IS
  'Fuer welchen Kunden die Einheit vorgemerkt ist. Der Status bleibt dabei frei.';
COMMENT ON COLUMN public.wohnungen.vorgemerkt_von IS
  'Wer vorgemerkt hat, also die Vereinbarung verschickt hat.';
COMMENT ON COLUMN public.wohnungen.reserviert_von IS
  'Wer die Reservierung ausgeloest hat. Nach einer Unterschrift der Absender der Vereinbarung, ersatzweise der zustaendige Partner.';


-- ---------------------------------------------------------------------------
-- 2) Vormerken
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.vormerke_einheit(p_wohnung_id uuid, p_kontakt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bis timestamptz := now() + interval '60 minutes';
  v_einheit record;
  v_kunde_name text;
  v_berater_name text;
  v_treffer uuid;
  v_stand record;
BEGIN
  IF v_uid IS NULL OR NOT public.darf_reservieren(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  END IF;

  IF p_wohnung_id IS NULL OR p_kontakt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'nicht_gefunden');
  END IF;

  -- Admin, Inhaber und Vertriebsleitung duerfen jeden Kontakt, der
  -- Vertriebspartner nur den eigenen oder den einer laufenden Vertretung.
  -- Dieselbe Regel wie die UPDATE-Policies auf kontakte.
  IF NOT public.darf_kontakt_bearbeiten(v_uid, p_kontakt_id) THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  END IF;

  SELECT w.id, w.meta, coalesce(o.global_objekt, false) AS global_objekt, o.exklusiv_partner
    INTO v_einheit
    FROM public.wohnungen w
    JOIN public.objekte o ON o.id = w.objekt_id
   WHERE w.id = p_wohnung_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'nicht_gefunden');
  END IF;

  -- Einheiten eines Globalobjekts werden nie einzeln reserviert.
  IF v_einheit.global_objekt THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'globalobjekt');
  END IF;

  -- Exklusivzuweisung wie in der Objektuebersicht: Admin und Inhaber sehen
  -- alles, alle anderen nur, was ihnen zugewiesen ist. An der Einheit stehen
  -- Nutzerkennungen, am Objekt stehen (noch) Namen.
  IF NOT public.is_admin_role(v_uid) THEN
    -- Bewusst ohne den Fragezeichen-Operator: Manche SQL-Editoren lesen ihn als Platzhalter.
    IF jsonb_typeof(v_einheit.meta -> 'exklusivNutzer') = 'array'
       AND jsonb_array_length(v_einheit.meta -> 'exklusivNutzer') > 0
       AND NOT EXISTS (
         SELECT 1
           FROM jsonb_array_elements_text(v_einheit.meta -> 'exklusivNutzer') AS e(nutzer_id)
          WHERE e.nutzer_id = v_uid::text
       ) THEN
      RETURN jsonb_build_object('ok', false, 'grund', 'exklusiv');
    END IF;
    IF coalesce(cardinality(v_einheit.exklusiv_partner), 0) > 0
       AND NOT EXISTS (
         SELECT 1
           FROM public.profiles p, unnest(v_einheit.exklusiv_partner) AS n(partner_name)
          WHERE p.id = v_uid
            AND lower(trim(n.partner_name)) = lower(trim(coalesce(p.name, '')))
       ) THEN
      RETURN jsonb_build_object('ok', false, 'grund', 'exklusiv');
    END IF;
  END IF;

  SELECT nullif(trim(concat_ws(' ', k.vorname, k.nachname)), '')
    INTO v_kunde_name
    FROM public.kontakte k WHERE k.id = p_kontakt_id;
  SELECT nullif(trim(p.name), '')
    INTO v_berater_name
    FROM public.profiles p WHERE p.id = v_uid;

  -- Der eine Schritt: nur frei, ohne Kunden, ohne fremde laufende Vormerkung.
  UPDATE public.wohnungen w
     SET vorgemerkt_bis = v_bis,
         vorgemerkt_kunde_id = p_kontakt_id,
         vorgemerkt_kunde_name = v_kunde_name,
         vorgemerkt_von = v_uid,
         vorgemerkt_berater_name = v_berater_name
   WHERE w.id = p_wohnung_id
     AND lower(trim(coalesce(w.status, ''))) NOT IN ('reserviert', 'gesetzt', 'verkauft')
     AND nullif(trim(coalesce(w.kunde_id::text, '')), '') IS NULL
     AND (w.vorgemerkt_bis IS NULL
          OR w.vorgemerkt_bis <= now()
          OR w.vorgemerkt_kunde_id = p_kontakt_id)
  RETURNING w.id INTO v_treffer;

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
  SELECT w.status, w.kunde_id, w.vorgemerkt_bis, w.vorgemerkt_berater_name
    INTO v_stand
    FROM public.wohnungen w WHERE w.id = p_wohnung_id;

  IF lower(trim(coalesce(v_stand.status, ''))) IN ('reserviert', 'gesetzt', 'verkauft')
     OR nullif(trim(coalesce(v_stand.kunde_id::text, '')), '') IS NOT NULL THEN
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

COMMENT ON FUNCTION public.vormerke_einheit(uuid, uuid) IS
  'Merkt eine freie Einheit fuer 60 Minuten fuer genau einen Kunden vor. Status bleibt frei. Regeln vom 23.09.2026.';

REVOKE ALL ON FUNCTION public.vormerke_einheit(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vormerke_einheit(uuid, uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3) Reservieren nach der Unterschrift (nur Dienstrolle)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserviere_einheit_nach_unterschrift(
  p_wohnung_id uuid,
  p_kontakt_id uuid,
  p_kunde_name text,
  p_reserviert_am text DEFAULT NULL,
  p_reserviert_von uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_am text := coalesce(
    nullif(trim(p_reserviert_am), ''),
    to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_global boolean;
  v_treffer uuid;
  v_stand record;
BEGIN
  IF p_wohnung_id IS NULL OR p_kontakt_id IS NULL THEN
    RETURN jsonb_build_object('ergebnis', 'nicht_gefunden');
  END IF;

  SELECT coalesce(o.global_objekt, false)
    INTO v_global
    FROM public.wohnungen w
    LEFT JOIN public.objekte o ON o.id = w.objekt_id
   WHERE w.id = p_wohnung_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ergebnis', 'nicht_gefunden');
  END IF;

  IF v_global THEN
    RETURN jsonb_build_object('ergebnis', 'globalobjekt');
  END IF;

  -- Frei (egal ob gerade fuer jemand anderen vorgemerkt) oder schon diesem
  -- Kunden reserviert. Die Ausdruecke im SET lesen den Stand VOR dem Update,
  -- `reserviert_von` greift also noch auf die alte Vormerkung zu.
  UPDATE public.wohnungen w
     SET status = 'reserviert',
         -- Ohne ::text: So passt die Zuweisung, ob die Spalte Text (Stand der
         -- Historie) oder uuid ist. Verglichen wird ueberall als Text.
         kunde_id = p_kontakt_id,
         kunde_name = coalesce(nullif(trim(p_kunde_name), ''), w.kunde_name),
         reserviert_am = v_am,
         reserviert_von = coalesce(
           CASE WHEN w.vorgemerkt_kunde_id = p_kontakt_id THEN w.vorgemerkt_von END,
           p_reserviert_von
         ),
         gesetzt_am = NULL,
         gesetzt_bis = NULL,
         vorgemerkt_bis = NULL,
         vorgemerkt_kunde_id = NULL,
         vorgemerkt_kunde_name = NULL,
         vorgemerkt_von = NULL,
         vorgemerkt_berater_name = NULL
   WHERE w.id = p_wohnung_id
     AND (
       (lower(trim(coalesce(w.status, ''))) NOT IN ('reserviert', 'gesetzt', 'verkauft')
        AND nullif(trim(coalesce(w.kunde_id::text, '')), '') IS NULL)
       OR
       (lower(trim(coalesce(w.status, ''))) IN ('reserviert', 'gesetzt')
        AND w.kunde_id::text = p_kontakt_id::text)
     )
  RETURNING w.id INTO v_treffer;

  IF v_treffer IS NOT NULL THEN
    RETURN jsonb_build_object('ergebnis', 'reserviert');
  END IF;

  SELECT w.status, w.kunde_id, w.kunde_name
    INTO v_stand
    FROM public.wohnungen w WHERE w.id = p_wohnung_id;

  RETURN jsonb_build_object(
    'ergebnis', 'vergeben',
    'status', v_stand.status,
    'kunde_id', v_stand.kunde_id,
    'kunde_name', v_stand.kunde_name
  );
END;
$$;

COMMENT ON FUNCTION public.reserviere_einheit_nach_unterschrift(uuid, uuid, text, text, uuid) IS
  'Reserviert eine Einheit nach der letzten Unterschrift, nur wenn sie frei ist oder schon diesem Kunden gehoert. Die erste Unterschrift gewinnt. Nur Dienstrolle.';

REVOKE ALL ON FUNCTION public.reserviere_einheit_nach_unterschrift(uuid, uuid, text, text, uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserviere_einheit_nach_unterschrift(uuid, uuid, text, text, uuid)
  TO service_role;


-- ---------------------------------------------------------------------------
-- 4) Der Ausloeser, verschaerft
-- ---------------------------------------------------------------------------
--
-- Ersetzt die Fassung aus 20260911090000_reservierung_nur_vertrieb.sql. Was
-- dort galt, gilt weiter: Serverseitige Laeufe ohne angemeldeten Nutzer
-- bleiben bei der Rollenpruefung aussen vor, das Aufheben einer Reservierung
-- und der Weg zum Verkauf sind nicht bewacht. Neu sind die drei Punkte aus
-- dem Kopf dieser Datei.

CREATE OR REPLACE FUNCTION public.wohnung_reservierung_pruefen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  wird_reserviert boolean;
  neu_belegt boolean;
  kundenwechsel boolean;
  ist_global boolean;
BEGIN
  neu_belegt := lower(trim(coalesce(NEW.status, ''))) IN ('reserviert', 'gesetzt', 'verkauft');

  -- Aufraeumen, auf jedem Weg, auch mit der Dienstrolle.
  IF neu_belegt THEN
    NEW.vorgemerkt_bis := NULL;
    NEW.vorgemerkt_kunde_id := NULL;
    NEW.vorgemerkt_kunde_name := NULL;
    NEW.vorgemerkt_von := NULL;
    NEW.vorgemerkt_berater_name := NULL;
  END IF;
  IF NOT neu_belegt OR nullif(trim(coalesce(NEW.kunde_id::text, '')), '') IS NULL THEN
    NEW.reserviert_von := NULL;
  END IF;

  wird_reserviert :=
       (NEW.status = 'reserviert' AND OLD.status IS DISTINCT FROM 'reserviert')
    OR (NEW.status = 'reserviert'
        AND NEW.kunde_id IS DISTINCT FROM OLD.kunde_id
        AND NEW.kunde_id IS NOT NULL);

  -- Globalobjekt: nie eine einzelne Einheit fuer einen Kunden. Gilt auch fuer
  -- die Dienstrolle. Ein Status ohne Kunden (Investagon-Import) bleibt frei.
  IF wird_reserviert AND nullif(trim(coalesce(NEW.kunde_id::text, '')), '') IS NOT NULL THEN
    SELECT coalesce(o.global_objekt, false) INTO ist_global
      FROM public.objekte o WHERE o.id = NEW.objekt_id;
    IF coalesce(ist_global, false) THEN
      RAISE EXCEPTION
        'Einheiten eines Globalobjekts werden nicht einzeln reserviert, reserviert wird das ganze Objekt.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF wird_reserviert AND NOT public.darf_reservieren(auth.uid()) THEN
    RAISE EXCEPTION
      'Reservieren duerfen nur Admin, Inhaber, Vertriebsleitung und Vertriebspartner.'
      USING ERRCODE = '42501';
  END IF;

  -- Kundenwechsel an einer reservierten Einheit: nur Admin und Inhaber.
  kundenwechsel :=
        lower(trim(coalesce(OLD.status, ''))) IN ('reserviert', 'gesetzt')
    AND nullif(trim(coalesce(OLD.kunde_id::text, '')), '') IS NOT NULL
    AND nullif(trim(coalesce(NEW.kunde_id::text, '')), '') IS NOT NULL
    AND NEW.kunde_id IS DISTINCT FROM OLD.kunde_id;

  IF kundenwechsel AND NOT public.is_admin_role(auth.uid()) THEN
    RAISE EXCEPTION
      'Diese Einheit ist bereits an einen anderen Kunden reserviert. Den Kunden wechseln duerfen nur Admin und Inhaber.'
      USING ERRCODE = '42501';
  END IF;

  -- Wer im Browser reserviert (Handeintrag, Rueckfallweg), steht als Ausloeser da.
  IF wird_reserviert AND NEW.reserviert_von IS NULL THEN
    NEW.reserviert_von := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wohnung_reservierung_pruefen ON public.wohnungen;
CREATE TRIGGER wohnung_reservierung_pruefen
  BEFORE UPDATE ON public.wohnungen
  FOR EACH ROW
  EXECUTE FUNCTION public.wohnung_reservierung_pruefen();

-- PostgREST soll die neuen Funktionen sofort kennen, sonst meldet es fuer
-- einen Moment noch PGRST202 und der Browser nimmt den Rueckfallweg.
NOTIFY pgrst, 'reload schema';
