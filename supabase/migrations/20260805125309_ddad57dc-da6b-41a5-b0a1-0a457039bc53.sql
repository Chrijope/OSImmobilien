CREATE OR REPLACE FUNCTION public.nachtpruefung_kontakt_ohne_zustaendigen(_lauf timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anzahl integer;
  v_beispiele jsonb;
BEGIN
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'name', btrim(coalesce(vorname, '') || ' ' || coalesce(nachname, '')),
           'seit', erstellt_am, 'grund', grund) ORDER BY erstellt_am), '[]'::jsonb)
    INTO v_anzahl, v_beispiele
    FROM (
      SELECT k.id, k.vorname, k.nachname, k.erstellt_am,
             CASE
               WHEN EXISTS (SELECT 1 FROM public.signature_requests s
                             WHERE s.kontakt_id = k.id AND s.status = 'pending')
                 THEN 'wartet auf eine Unterschrift'
               WHEN EXISTS (SELECT 1 FROM public.investments i WHERE i.kunde_id = k.id)
                 THEN 'hat ein laufendes Investment'
               WHEN EXISTS (SELECT 1 FROM public.buchungen b
                             WHERE b.kontakt_id = k.id AND b.status = 'offen')
                 THEN 'hat einen offenen Termin'
               ELSE 'liegt seit über zwei Tagen ohne Betreuer'
             END AS grund
        FROM public.kontakte k
       WHERE k.zustaendig_id IS NULL
         AND coalesce(k.geloescht, false) = false
         AND (
           (
             coalesce((k.meta->>'offenerLead')::boolean, false) = false
             AND k.erstellt_am < now() - interval '2 days'
           )
           OR EXISTS (SELECT 1 FROM public.signature_requests s
                       WHERE s.kontakt_id = k.id AND s.status = 'pending')
           OR EXISTS (SELECT 1 FROM public.investments i WHERE i.kunde_id = k.id)
           OR EXISTS (SELECT 1 FROM public.buchungen b
                       WHERE b.kontakt_id = k.id AND b.status = 'offen')
         )
       ORDER BY k.erstellt_am
       LIMIT 10
    ) t;

  INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung, beispiele)
  VALUES (_lauf, 'kontakt_ohne_zustaendigen',
          CASE WHEN v_anzahl > 0 THEN 'warnung' ELSE 'hinweis' END, v_anzahl,
          CASE WHEN v_anzahl > 0
               THEN v_anzahl || ' Kontakt(e) haben keinen Zuständigen, obwohl an ihnen etwas läuft oder sie länger brachliegen. Ohne Betreuer kümmert sich niemand, und automatische Aufgaben lassen sich nicht anlegen.'
               ELSE 'Jeder Kontakt, an dem etwas läuft, hat einen Zuständigen.' END,
          v_beispiele);

  RETURN v_anzahl;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
  VALUES (_lauf, 'kontakt_ohne_zustaendigen', 'fehler', 1,
          'Die Prüfung selbst ist ausgefallen: ' || SQLERRM);
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.nachtpruefung_kontakt_ohne_zustaendigen(timestamptz) FROM anon, authenticated;

COMMENT ON FUNCTION public.nachtpruefung_kontakt_ohne_zustaendigen(timestamptz) IS
  'Teilpruefung des Nachtwaechters. Ausgelagert, weil sie als einzige mehrere '
  'Tabellen verbindet und sich dadurch getrennt pruefen und aendern laesst.';