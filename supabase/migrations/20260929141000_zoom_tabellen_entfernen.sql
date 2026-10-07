-- ===========================================================================
-- Zoom-Anbindung: Tabelle zoom_connections und Spalte profiles.zoom_link weg
-- ===========================================================================
--
-- ENTSCHEIDUNG (GL, 29.09.2026)
--
-- Zoom verschwindet aus dem CRM. Einzige Ausnahme ist der Weekly Sales Call,
-- dessen Link fest im Code steht und nichts aus der Datenbank liest. Die
-- Zoom-Anbindung (Function zoom-integration, OAuth-Rueckruf, Erinnerungen)
-- ist seit dem 29.09.2026 aus dem Repo entfernt.
--
-- WAS SICH AENDERT
--
--   1. Tabelle public.zoom_connections faellt weg, samt ihrer Regel, ihrem
--      Trigger und ihren Indizes. Sie hielt die OAuth-Schluessel der
--      verbundenen Zoom-Konten; kein Code liest sie mehr.
--   2. Die Triggerfunktion public.set_zoom_connections_updated_at() faellt weg.
--   3. Spalte public.profiles.zoom_link faellt weg. Kein Code liest oder
--      schreibt sie; der Weekly Call nimmt seinen Link aus dem Code.
--
-- WAS BLEIBT
--
--   - aktivitaeten.zoom_link. Sie traegt heute den Link zum Videoraum und wird
--     von meeting_anlegen und den Meeting-Mails gelesen. Nicht anfassen.
--   - Die meta-Felder zoomMeeting, zoomReminderSent und terminZoomUrl in
--     kontakte.meta. Sie werden nicht mehr geschrieben, bleiben aber als
--     Altbestand stehen (bewusst keine Datenbereinigung).
--
-- SICHERUNG
--
-- Bewusst ohne CASCADE: Liest noch eine Sicht, eine Regel oder ein
-- Trigger-Ausdruck die Tabelle oder die Spalte, bricht Postgres selbst ab und
-- nichts ist geloescht. Funktionsruempfe kennt Postgres nicht als
-- Abhaengigkeit, deshalb prueft der Block unten sie vorher und bricht mit
-- Namen ab, wenn eine Funktion zoom_connections nennt oder ein Trigger an
-- profiles zoom_link anfasst.
--
-- Vorschau vor dem Ausfuehren (aendert nichts), zeigt, was wegfaellt:
--
--   SELECT
--     (SELECT count(*) FROM public.zoom_connections)                      AS zoom_verbindungen,
--     (SELECT count(*) FROM public.profiles WHERE zoom_link IS NOT NULL)  AS profile_mit_zoom_link;
--
-- Mehrfach ausfuehrbar. Die geloeschten Daten lassen sich nicht
-- wiederherstellen.
-- ===========================================================================

BEGIN;

DO $$
DECLARE
  _treffer text;
BEGIN
  -- Sichten, die die Tabelle oder die Spalte lesen.
  SELECT string_agg(DISTINCT v.oid::regclass::text, ', ')
    INTO _treffer
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    JOIN pg_class v ON v.oid = r.ev_class
   WHERE d.classid = 'pg_rewrite'::regclass
     AND v.oid <> d.refobjid
     AND (
       d.refobjid = to_regclass('public.zoom_connections')
       OR (d.refobjid = 'public.profiles'::regclass
           AND d.refobjsubid = (SELECT attnum FROM pg_attribute
                                 WHERE attrelid = 'public.profiles'::regclass
                                   AND attname = 'zoom_link'
                                   AND NOT attisdropped))
     );
  IF _treffer IS NOT NULL THEN
    RAISE EXCEPTION 'Abbruch, diese Sichten lesen noch Zoom-Daten: %', _treffer;
  END IF;

  -- Funktionen, die die Tabelle nennen (ausser ihrer eigenen Triggerfunktion).
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO _treffer
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
     AND p.prosrc ILIKE '%zoom_connections%'
     AND p.proname <> 'set_zoom_connections_updated_at';
  IF _treffer IS NOT NULL THEN
    RAISE EXCEPTION 'Abbruch, diese Funktionen nennen zoom_connections: %', _treffer;
  END IF;

  -- Trigger an profiles, deren Funktion zoom_link anfasst.
  SELECT string_agg(DISTINCT t.tgname || ' (' || p.proname || ')', ', ')
    INTO _treffer
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgrelid = 'public.profiles'::regclass
     AND NOT t.tgisinternal
     AND p.prosrc ILIKE '%zoom_link%';
  IF _treffer IS NOT NULL THEN
    RAISE EXCEPTION 'Abbruch, diese Trigger an profiles fassen zoom_link an: %', _treffer;
  END IF;
END $$;

DROP TABLE IF EXISTS public.zoom_connections;
DROP FUNCTION IF EXISTS public.set_zoom_connections_updated_at();
ALTER TABLE public.profiles DROP COLUMN IF EXISTS zoom_link;

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeilen 42.1 bis 42.3 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
