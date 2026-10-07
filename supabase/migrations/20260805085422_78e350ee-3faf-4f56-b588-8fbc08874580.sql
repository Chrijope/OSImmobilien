CREATE OR REPLACE FUNCTION public.videoraum_ablauf(_termin timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN _termin IS NULL THEN now() + interval '60 days'
           ELSE greatest(_termin + interval '30 days', now() + interval '7 days')
         END;
$$;

UPDATE public.videoraeume
   SET expires_at = public.videoraum_ablauf(termin_at)
 WHERE termin_at IS NOT NULL
   AND expires_at < termin_at + interval '30 days';

CREATE OR REPLACE FUNCTION public.videoraum_standard_agenda(_art text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _art
    WHEN 'erstgespraech' THEN '[
      {"titel":"Kurz kennenlernen","text":"Wer wir sind und wie wir arbeiten.","minuten":5},
      {"titel":"Ihre Situation","text":"Wo Sie heute stehen und was Sie erreichen wollen.","minuten":10},
      {"titel":"Passt das zusammen?","text":"Ehrlich und ohne Verkaufsdruck.","minuten":10},
      {"titel":"Nächster Schritt","text":"Sie entscheiden, ob ein ausführliches Gespräch folgt.","minuten":5}
    ]'::jsonb
    WHEN 'beratung' THEN '[
      {"titel":"Ihre Ausgangslage","text":"Einkommen, Steuerlast, was Sie bisher aufgebaut haben.","minuten":10},
      {"titel":"Was rechnerisch möglich ist","text":"Wir rechnen Ihren Rahmen gemeinsam durch.","minuten":15},
      {"titel":"Passende Objekte","text":"Zwei bis drei konkrete Beispiele aus dem Bestand.","minuten":15},
      {"titel":"Selbstauskunft ausfüllen","text":"Wir gehen sie gemeinsam durch. Danach wissen wir verbindlich, welcher Rahmen für Sie machbar ist.","minuten":15},
      {"titel":"Ihre Fragen und nächster Schritt","text":"Sie entscheiden, ob und wie es weitergeht.","minuten":5}
    ]'::jsonb
    WHEN 'objektvorstellung' THEN '[
      {"titel":"Das Objekt im Überblick","text":"Lage, Zustand, Ausstattung.","minuten":15},
      {"titel":"Ihre Berechnung","text":"Zeile für Zeile gemeinsam durch.","minuten":20},
      {"titel":"Vermietung und Verwaltung","text":"Wer sich worum kümmert.","minuten":10},
      {"titel":"Ihre Fragen","text":"Alles, was offen ist.","minuten":15}
    ]'::jsonb
    ELSE '[]'::jsonb
  END;
$$;

CREATE OR REPLACE FUNCTION public.videoraum_vervollstaendigen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.agenda IS NULL OR jsonb_array_length(coalesce(NEW.agenda, '[]'::jsonb)) = 0 THEN
    NEW.agenda := public.videoraum_standard_agenda(NEW.art::text);
  END IF;

  IF NEW.termin_at IS NOT NULL
     AND NEW.expires_at IS NOT DISTINCT FROM (now() + interval '60 days')::timestamptz THEN
    NEW.expires_at := public.videoraum_ablauf(NEW.termin_at);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS videoraum_vervollstaendigen_trg ON public.videoraeume;
CREATE TRIGGER videoraum_vervollstaendigen_trg
  BEFORE INSERT ON public.videoraeume
  FOR EACH ROW EXECUTE FUNCTION public.videoraum_vervollstaendigen();

CREATE OR REPLACE FUNCTION public.videoraum_frist_nachziehen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.termin_at IS DISTINCT FROM OLD.termin_at AND NEW.termin_at IS NOT NULL THEN
    NEW.expires_at := greatest(NEW.expires_at, public.videoraum_ablauf(NEW.termin_at));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS videoraum_frist_nachziehen_trg ON public.videoraeume;
CREATE TRIGGER videoraum_frist_nachziehen_trg
  BEFORE UPDATE ON public.videoraeume
  FOR EACH ROW EXECUTE FUNCTION public.videoraum_frist_nachziehen();

UPDATE public.videoraeume
   SET agenda = public.videoraum_standard_agenda(art::text)
 WHERE (agenda IS NULL OR jsonb_array_length(coalesce(agenda, '[]'::jsonb)) = 0)
   AND art::text <> 'sonstiges';

CREATE OR REPLACE FUNCTION public.videoraeume_aufraeumen()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_geloescht integer := 0;
  v_gerettet integer := 0;
BEGIN
  WITH zu_retten AS (
    SELECT r.id, r.kontakt_id, r.titel, r.notiz, r.termin_at
      FROM public.videoraeume r
     WHERE r.expires_at < now() - interval '90 days'
       AND r.kontakt_id IS NOT NULL
       AND coalesce(btrim(r.notiz), '') <> ''
       AND NOT EXISTS (
         SELECT 1 FROM public.aktivitaeten a
          WHERE a.kunde_id = r.kontakt_id::text
            AND a.details = 'videoraum:' || r.id::text
       )
  ), eingefuegt AS (
    INSERT INTO public.aktivitaeten (kunde_id, art, beschreibung, details, von, faellig_am)
    SELECT z.kontakt_id::text, 'notiz',
           'Notiz aus dem Videogespräch' ||
             coalesce(' am ' || to_char(z.termin_at, 'DD.MM.YYYY'), '') ||
             coalesce(' (' || z.titel || ')', '') || ': ' || z.notiz,
           'videoraum:' || z.id::text,
           'System',
           NULL
      FROM zu_retten z
    RETURNING 1
  )
  SELECT count(*) INTO v_gerettet FROM eingefuegt;

  WITH weg AS (
    DELETE FROM public.videoraeume r
     WHERE r.expires_at < now() - interval '90 days'
       AND NOT EXISTS (SELECT 1 FROM public.gespraech_mitschriften m WHERE m.raum_id = r.id)
       AND NOT EXISTS (SELECT 1 FROM public.buchungen b WHERE b.videoraum_id = r.id)
    RETURNING 1
  )
  SELECT count(*) INTO v_geloescht FROM weg;

  IF v_gerettet > 0 OR v_geloescht > 0 THEN
    RAISE NOTICE 'Videoraeume aufgeraeumt: % geloescht, % Notizen gerettet', v_geloescht, v_gerettet;
  END IF;

  RETURN v_geloescht;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Aufraeumen der Videoraeume ausgefallen: %', SQLERRM;
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.videoraeume_aufraeumen() FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'videoraeume-aufraeumen') THEN
      PERFORM cron.unschedule('videoraeume-aufraeumen');
    END IF;
    PERFORM cron.schedule('videoraeume-aufraeumen', '0 4 * * 0',
                          'SELECT public.videoraeume_aufraeumen();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan fuers Aufraeumen nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.videoraum_gast_wartet_melden()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raum public.videoraeume;
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

  INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
  VALUES (
    v_raum.gastgeber_id,
    NEW.name || ' wartet im Videoraum',
    coalesce(v_raum.titel, 'Ihr Videogespräch') || ': ' || NEW.name ||
      ' ist da und wartet auf den Einlass.',
    '/videocall/raum/' || v_raum.id::text
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Meldung ueber wartenden Gast fehlgeschlagen: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS videoraum_gast_wartet_trg ON public.videoraum_teilnehmer;
CREATE TRIGGER videoraum_gast_wartet_trg
  AFTER INSERT ON public.videoraum_teilnehmer
  FOR EACH ROW EXECUTE FUNCTION public.videoraum_gast_wartet_melden();