-- ===========================================================================
-- Geschwister-Aufgaben mitschliessen (15.10.2026)
-- ===========================================================================
--
-- Die Dolmetscher-Aufgabe ("Kunde spricht Englisch: Dolmetscher fuer den
-- Notar klaeren") bekommt jede Person mit der Rolle Backoffice, alle mit
-- demselben Ausloeser dolmetscher_notar:{investment}. Hakt eine Person ihre
-- ab oder sagt sie ab, gilt sie fuer alle als erledigt. Die Zeilenregel
-- laesst niemanden fremde Aufgaben aendern, deshalb diese Funktion.
--
-- aufgaben_geschwister_schliessen(schluessel, kontakt) setzt alle offenen
-- und in Bearbeitung befindlichen Aufgaben mit diesem Schluessel an diesem
-- Kontakt auf erledigt, mit Erledigt-Zeitpunkt und dem Vermerk "Von {Name}
-- erledigt". Nur fuer freigegebene Praefixe, zunaechst dolmetscher_notar:,
-- und nur, wenn der Aufrufer selbst eine schon erledigte oder abgesagte
-- Aufgabe mit diesem Schluessel an diesem Kontakt haelt (ihm zugewiesen,
-- oder ohne Empfaenger von ihm angelegt). Die Liste der Praefixe steht auch
-- im Browser (GESCHWISTER_AUSLOESER_PRAEFIXE in src/lib/aufgabenStore.ts),
-- ein Test vergleicht beide.
--
-- Fehlt die Migration, klappt das eigene Abhaken wie immer, die Geschwister
-- bleiben offen. Steht fuer sich, Reihenfolge egal, keine Function
-- auszurollen, aendert beim Ausfuehren keine Daten, wiederholbar.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.aufgaben_geschwister_schliessen(_schluessel text, _kontakt_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _name text;
  _vermerk text;
  _anzahl integer;
BEGIN
  IF _uid IS NULL OR _schluessel IS NULL OR _kontakt_id IS NULL THEN
    RAISE EXCEPTION 'Nicht berechtigt' USING ERRCODE = '42501';
  END IF;
  IF left(_schluessel, length('dolmetscher_notar:')) <> 'dolmetscher_notar:' THEN
    RAISE EXCEPTION 'Nicht berechtigt' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.aufgaben a
     WHERE a.ausloeser_schluessel = _schluessel
       AND a.kontakt_id = _kontakt_id
       AND a.status::text IN ('erledigt', 'abgesagt')
       AND (a.zugewiesen_an = _uid OR (a.zugewiesen_an IS NULL AND a.benutzer_id = _uid))
  ) THEN
    RAISE EXCEPTION 'Nicht berechtigt' USING ERRCODE = '42501';
  END IF;

  SELECT NULLIF(btrim(p.name), '') INTO _name FROM public.profiles p WHERE p.id = _uid;
  _vermerk := CASE WHEN _name IS NULL THEN 'Von einer Kollegin oder einem Kollegen erledigt'
                   ELSE 'Von ' || _name || ' erledigt' END;

  UPDATE public.aufgaben a
     SET status = 'erledigt',
         erledigt_am = now(),
         beschreibung = CASE WHEN COALESCE(btrim(a.beschreibung), '') = '' THEN _vermerk
                             ELSE a.beschreibung || E'\n\n' || _vermerk END
   WHERE a.ausloeser_schluessel = _schluessel
     AND a.kontakt_id = _kontakt_id
     AND a.status::text IN ('offen', 'in_bearbeitung');
  GET DIAGNOSTICS _anzahl = ROW_COUNT;
  RETURN _anzahl;
END;
$$;

REVOKE ALL ON FUNCTION public.aufgaben_geschwister_schliessen(text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.aufgaben_geschwister_schliessen(text, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
