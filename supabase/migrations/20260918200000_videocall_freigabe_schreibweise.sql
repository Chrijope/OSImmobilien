-- ===========================================================================
-- Videocall-Freigabe nachziehen
-- ===========================================================================
--
-- Im Ursprungsprojekt zog diese Migration die Videocall-Freigabe fuer eine
-- bestimmte Person nach, die per Namen gesucht wurde. Diese
-- personenbezogene Anweisung ist entfernt. Freigaben vergibt man im neuen
-- Projekt per Kennung:
--
--     insert into public.videocall_freigaben (user_id)
--     values ('<profiles.id>') on conflict (user_id) do nothing;
--
-- Wiederholbar: ein zweiter Lauf aendert nichts.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Freigabe nachziehen
-- ---------------------------------------------------------------------------

-- Datenanweisung des Ursprungsprojekts entfernt (OSImmobilien)


-- ---------------------------------------------------------------------------
-- 2) Grundausstattung, wie fuer jeden Freigegebenen
-- ---------------------------------------------------------------------------
--
-- Wortgleich zu Abschnitt 5 der Migration 20260827200000. Ohne
-- Einstellungszeile haette ein Freigegebener zwar den Menuepunkt, aber keinen
-- Kalender dahinter. Die vier Standard-Terminarten legt die Oberflaeche beim
-- ersten Aufruf selbst an, siehe `src/lib/buchungStore.ts`.

INSERT INTO public.buchung_einstellungen (mitarbeiter_id, slug, offen_aktiv, zeitzone)
SELECT f.user_id, NULL, false, 'Europe/Berlin'
FROM public.videocall_freigaben f
WHERE NOT EXISTS (
  SELECT 1 FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = f.user_id
);
