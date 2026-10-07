CREATE OR REPLACE FUNCTION public.videoraum_gast_wartet_melden()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raum public.videoraeume;
  v_name text;
BEGIN
  IF NEW.status <> 'wartet' THEN RETURN NEW; END IF;

  SELECT * INTO v_raum FROM public.videoraeume WHERE id = NEW.raum_id;
  IF v_raum.gastgeber_id IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.benachrichtigungen b
     WHERE b.benutzer_id = v_raum.gastgeber_id
       AND b.link = '/videocall/raum/' || v_raum.id::text
       AND b.erstellt_am > now() - interval '15 minutes'
  ) THEN
    RETURN NEW;
  END IF;

  v_name := left(btrim(coalesce(NEW.name, '')), 40);
  IF v_name = '' THEN v_name := 'Ein Gast'; END IF;

  INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
  VALUES (
    v_raum.gastgeber_id,
    'Ein Gast wartet im Videoraum',
    coalesce(v_raum.titel, 'Ihr Videogespräch') || ': ' || v_name ||
      ' ist da und wartet auf den Einlass.',
    '/videocall/raum/' || v_raum.id::text
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Meldung ueber wartenden Gast fehlgeschlagen: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.nachtpruefung_haengende_raeume(_lauf timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anzahl integer;
  v_beispiele jsonb;
  v_ids uuid[];
BEGIN
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'titel', titel, 'seit', updated_at) ORDER BY updated_at), '[]'::jsonb),
         coalesce(array_agg(id), '{}'::uuid[])
    INTO v_anzahl, v_beispiele, v_ids
    FROM (SELECT * FROM public.videoraeume
           WHERE status = 'laufend' AND updated_at < now() - interval '6 hours'
           ORDER BY updated_at LIMIT 10) t;

  IF array_length(v_ids, 1) > 0 THEN
    UPDATE public.videoraeume SET status = 'offen', updated_at = now()
     WHERE id = ANY(v_ids);

    UPDATE public.videoraum_teilnehmer
       SET status = 'beendet', verlassen_at = coalesce(verlassen_at, now())
     WHERE raum_id = ANY(v_ids)
       AND status IN ('eingelassen', 'im_gespraech');
  END IF;

  INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung, beispiele)
  VALUES (_lauf, 'videoraum_haengt',
          CASE WHEN v_anzahl > 0 THEN 'warnung' ELSE 'hinweis' END, v_anzahl,
          CASE WHEN v_anzahl > 0
               THEN v_anzahl || ' Videoraum/Videoräume hingen seit über 6 Stunden auf "laufend" und wurden soeben auf "offen" zurückgesetzt. Die Kundenlinks gelten weiter.'
               ELSE 'Kein Videoraum hängt.' END,
          v_beispiele);

  RETURN v_anzahl;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
  VALUES (_lauf, 'videoraum_haengt', 'fehler', 1,
          'Die Prüfung selbst ist ausgefallen: ' || SQLERRM);
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.nachtpruefung_haengende_raeume(timestamptz) FROM anon, authenticated;

COMMENT ON FUNCTION public.nachtpruefung_haengende_raeume(timestamptz) IS
  'Teilpruefung des Nachtwaechters. Ausgelagert wie die Zustaendigkeitspruefung.';