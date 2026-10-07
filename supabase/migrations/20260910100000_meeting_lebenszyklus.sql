-- Atomic manual meetings; all entry points share room/task lifecycle.
BEGIN;
ALTER TABLE public.aktivitaeten ADD COLUMN IF NOT EXISTS meeting_kommunikation jsonb;
ALTER TABLE public.aufgaben ADD COLUMN IF NOT EXISTS meeting_aktivitaet_id uuid
  REFERENCES public.aktivitaeten(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS aufgaben_meeting_aktivitaet_key
  ON public.aufgaben(meeting_aktivitaet_id) WHERE meeting_aktivitaet_id IS NOT NULL;

-- Link legacy tasks only where the customer/title/time match is unambiguous.
WITH kandidaten AS (
 SELECT t.id task_id,a.id activity_id,
   count(*) OVER(PARTITION BY t.id) task_count,count(*) OVER(PARTITION BY a.id) activity_count
 FROM public.aufgaben t JOIN public.aktivitaeten a ON a.art='meeting'
   AND t.typ='meeting' AND t.kontakt_id::text=a.kunde_id AND t.titel=a.beschreibung
   AND t.benutzer_id=a.benutzer_id
   AND to_char(t.faellig_am AT TIME ZONE 'Europe/Berlin','YYYY-MM-DD')=a.faellig_am
   AND to_char(t.uhrzeit,'HH24:MI')=left(a.uhrzeit,5)
 WHERE t.meeting_aktivitaet_id IS NULL
)
UPDATE public.aufgaben t SET meeting_aktivitaet_id=k.activity_id FROM kandidaten k
WHERE t.id=k.task_id AND k.task_count=1 AND k.activity_count=1;

-- Restricted wrapper: the existing collision helper is intentionally private.
CREATE FUNCTION public.meeting_eigene_zeit_belegt(_start timestamptz,_ende timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Bitte erneut anmelden'; END IF;
 RETURN public.buchung_termin_belegt(auth.uid(),_start,_ende,'Europe/Berlin',NULL);
END $$;
REVOKE ALL ON FUNCTION public.meeting_eigene_zeit_belegt(timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meeting_eigene_zeit_belegt(timestamptz,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.meeting_anlegen(_id uuid, _daten jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
  _uid uuid := auth.uid(); _start timestamptz; _dauer integer;
  _raum jsonb := _daten->'raum'; _r public.aktivitaeten; _a public.aufgaben;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Bitte erneut anmelden'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('buchung:' || _uid::text));
  SELECT * INTO _r FROM public.aktivitaeten WHERE id=_id AND benutzer_id=_uid;
  IF FOUND THEN
    IF _r.beschreibung IS DISTINCT FROM _daten->>'beschreibung' OR _r.faellig_am IS DISTINCT FROM _daten->>'faelligAm'
      OR _r.uhrzeit IS DISTINCT FROM _daten->>'uhrzeit' OR _r.zoom_link IS DISTINCT FROM NULLIF(_daten->>'zoomLink','')
      OR _r.details IS DISTINCT FROM _daten->>'details'
      OR COALESCE(_r.meeting_kommunikation-'icsUid','{}'::jsonb) IS DISTINCT FROM COALESCE(_daten->'kommunikation','{}'::jsonb) THEN
      RAISE EXCEPTION 'Dieser Termin ist bereits gespeichert. Bitte im Kundenprofil prüfen und dort ändern';
    END IF;
    RETURN _id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kontakte WHERE id=(_daten->>'kundeId')::uuid) THEN
    RAISE EXCEPTION 'Kunde nicht verfügbar';
  END IF;
  _start := ((_daten->>'faelligAm') || ' ' || (_daten->>'uhrzeit'))::timestamp AT TIME ZONE 'Europe/Berlin';
  _dauer := COALESCE(NULLIF(_daten->>'dauer','')::integer,60);
  IF _start IS NULL OR _start <= now() OR _dauer < 5 OR _dauer > 480
    OR to_char(_start AT TIME ZONE 'Europe/Berlin','YYYY-MM-DD HH24:MI') IS DISTINCT FROM ((_daten->>'faelligAm') || ' ' || (_daten->>'uhrzeit'))
    OR NULLIF(btrim(_daten->>'beschreibung'),'') IS NULL THEN
    RAISE EXCEPTION 'Bitte Titel, zukünftigen Termin und gültige Dauer angeben';
  END IF;
  IF public.meeting_eigene_zeit_belegt(_start,_start+make_interval(mins=>_dauer))
    OR EXISTS (SELECT 1 FROM public.buchungen b WHERE b.mitarbeiter_id=_uid AND b.status <> 'abgesagt'
      AND b.start_at-make_interval(mins=>b.puffer_vor_minuten) < _start+make_interval(mins=>_dauer)
      AND b.ende_at+make_interval(mins=>b.puffer_nach_minuten) > _start) THEN
    RAISE EXCEPTION 'Diese Zeit ist bereits vergeben';
  END IF;
  IF _raum IS NOT NULL AND _raum <> 'null'::jsonb THEN
    INSERT INTO public.videoraeume(id,token,art,titel,gastgeber_id,gastgeber_snapshot,kontakt_id,
      investment_id,termin_at,dauer_minuten,hinweis,transkript_angeboten)
    VALUES (_id,_raum->>'token',_raum->>'art',_daten->>'beschreibung',_uid,_raum->'gastgeber',
      (_daten->>'kundeId')::uuid,NULLIF(_daten->'aufgabe'->>'investmentId','')::uuid,
      _start,_dauer,_raum->>'hinweis',false);
  END IF;
  SELECT * INTO _r FROM jsonb_populate_record(NULL::public.aktivitaeten,jsonb_build_object(
    'id',_id,'kunde_id',_daten->>'kundeId','benutzer_id',_uid,'art','meeting',
    'beschreibung',_daten->>'beschreibung','details',_daten->>'details','von',_daten->>'von',
    'datum',now(),'prioritaet',COALESCE(_daten->>'prioritaet','mittel'),
    'faellig_am',_daten->>'faelligAm','uhrzeit',_daten->>'uhrzeit','dauer',_dauer::text,
    'meeting_kommunikation',_daten->'kommunikation','teilnehmer',_daten->>'teilnehmer','zoom_link',NULLIF(_daten->>'zoomLink','')));
  INSERT INTO public.aktivitaeten(id,kunde_id,benutzer_id,art,beschreibung,details,von,datum,prioritaet,faellig_am,uhrzeit,dauer,teilnehmer,zoom_link,meeting_kommunikation)
    VALUES (_r.id,_r.kunde_id,_r.benutzer_id,_r.art,_r.beschreibung,_r.details,_r.von,_r.datum,_r.prioritaet,_r.faellig_am,_r.uhrzeit,_r.dauer,_r.teilnehmer,_r.zoom_link,_r.meeting_kommunikation);
  SELECT * INTO _a FROM jsonb_populate_record(NULL::public.aufgaben,jsonb_build_object(
    'id',gen_random_uuid(),'benutzer_id',_uid,'kontakt_id',_daten->>'kundeId',
    'investment_id',_daten->'aufgabe'->>'investmentId','typ','meeting','status','offen',
    'prioritaet',COALESCE(_daten->>'prioritaet','mittel'),'titel',_daten->>'beschreibung',
    'beschreibung',COALESCE(_daten->'aufgabe'->>'beschreibung','') || E'\n' || COALESCE(_daten->>'zoomLink',''),
    'faellig_am',_start,'uhrzeit',_daten->>'uhrzeit','zugewiesen_an',_uid,
    'erstellt_von_name',_daten->>'von','meeting_aktivitaet_id',_id));
  INSERT INTO public.aufgaben(id,benutzer_id,kontakt_id,investment_id,typ,status,prioritaet,titel,beschreibung,faellig_am,uhrzeit,zugewiesen_an,erstellt_von_name,meeting_aktivitaet_id)
    VALUES (_a.id,_a.benutzer_id,_a.kontakt_id,_a.investment_id,_a.typ,_a.status,_a.prioritaet,_a.titel,_a.beschreibung,_a.faellig_am,_a.uhrzeit,_a.zugewiesen_an,_a.erstellt_von_name,_id);
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.meeting_anlegen(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meeting_anlegen(uuid,jsonb) TO authenticated;

-- Authenticated wrapper reuses the public path's availability and conflict checks.
CREATE OR REPLACE FUNCTION public.buchung_intern_verschieben(_buchung_id uuid,_start timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _b public.buchungen;
BEGIN
  SELECT * INTO _b FROM public.buchungen WHERE id=_buchung_id;
  IF auth.uid() IS NULL OR NOT FOUND OR NOT (_b.mitarbeiter_id=auth.uid() OR public.is_admin_role(auth.uid())) THEN
    RAISE EXCEPTION 'Keine Berechtigung für diesen Termin';
  END IF;
  RETURN public.buchung_verschieben(_b.absage_token,_start);
END $$;
REVOKE ALL ON FUNCTION public.buchung_intern_verschieben(uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buchung_intern_verschieben(uuid,timestamptz) TO authenticated;

-- Activity edits, completion and deletion also update the associated room/task.
CREATE OR REPLACE FUNCTION public.meeting_folgeobjekte()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _start timestamptz; _ende timestamptz;
BEGIN
  IF OLD.art <> 'meeting' THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_OP='DELETE' THEN
    UPDATE public.videoraeume SET status='beendet'
      WHERE OLD.zoom_link LIKE '%/raum/' || token AND status <> 'beendet';
    RETURN OLD;
  END IF;
  IF NEW.faellig_am IS DISTINCT FROM OLD.faellig_am OR NEW.uhrzeit IS DISTINCT FROM OLD.uhrzeit OR NEW.dauer IS DISTINCT FROM OLD.dauer THEN
    _start := (NEW.faellig_am || ' ' || NEW.uhrzeit)::timestamp AT TIME ZONE 'Europe/Berlin';
    _ende := _start+make_interval(mins=>COALESCE(NULLIF(NEW.dauer,'')::integer,60));
    PERFORM pg_advisory_xact_lock(hashtext('buchung:' || NEW.benutzer_id::text));
    IF _start IS NULL OR _start <= now() OR _ende <= _start OR _ende > _start+interval '8 hours'
      OR to_char(_start AT TIME ZONE 'Europe/Berlin','YYYY-MM-DD HH24:MI') IS DISTINCT FROM (NEW.faellig_am||' '||left(NEW.uhrzeit,5))
      OR public.buchung_termin_belegt(NEW.benutzer_id,_start,_ende,'Europe/Berlin',NEW.id)
      OR EXISTS(SELECT 1 FROM public.buchungen b WHERE b.mitarbeiter_id=NEW.benutzer_id AND b.status<>'abgesagt' AND b.aktivitaet_id IS DISTINCT FROM NEW.id
        AND b.start_at-make_interval(mins=>b.puffer_vor_minuten)<_ende AND b.ende_at+make_interval(mins=>b.puffer_nach_minuten)>_start) THEN
      RAISE EXCEPTION 'Diese Zeit ist bereits vergeben oder liegt in der Vergangenheit';
    END IF;
    UPDATE public.videoraeume SET termin_at=_start,dauer_minuten=COALESCE(NULLIF(NEW.dauer,'')::integer,60) WHERE NEW.zoom_link LIKE '%/raum/' || token;
    UPDATE public.aufgaben SET faellig_am=_start,uhrzeit=NEW.uhrzeit::time WHERE meeting_aktivitaet_id=NEW.id;
  END IF;
  IF NEW.erledigt_am IS DISTINCT FROM OLD.erledigt_am THEN
    UPDATE public.aufgaben SET status=CASE WHEN NEW.erledigt_am IS NULL THEN 'offen'::public.aufgabe_status ELSE 'erledigt'::public.aufgabe_status END,
      erledigt_am=NEW.erledigt_am WHERE meeting_aktivitaet_id=NEW.id;
    IF NEW.erledigt_am IS NOT NULL THEN
      UPDATE public.videoraeume SET status='beendet' WHERE NEW.zoom_link LIKE '%/raum/' || token;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER meeting_folgeobjekte BEFORE UPDATE OR DELETE ON public.aktivitaeten
FOR EACH ROW EXECUTE FUNCTION public.meeting_folgeobjekte();

CREATE OR REPLACE FUNCTION public.meeting_raum_entfernen(_raum_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE _r public.videoraeume; _b record;
BEGIN
  SELECT * INTO _r FROM public.videoraeume WHERE id=_raum_id FOR UPDATE;
  IF NOT FOUND OR NOT (_r.gastgeber_id=auth.uid() OR public.is_admin_role(auth.uid())) THEN
    RAISE EXCEPTION 'Keine Berechtigung für diesen Raum';
  END IF;
  FOR _b IN SELECT id FROM public.buchungen WHERE videoraum_id=_raum_id AND status='offen' LOOP
    PERFORM public.buchung_status_setzen(_b.id,'abgesagt');
  END LOOP;
  DELETE FROM public.aktivitaeten WHERE art='meeting' AND zoom_link LIKE '%/raum/' || _r.token
    AND NOT EXISTS (SELECT 1 FROM public.buchungen b WHERE b.aktivitaet_id=aktivitaeten.id);
  DELETE FROM public.videoraeume WHERE id=_raum_id;
END $$;
REVOKE ALL ON FUNCTION public.meeting_raum_entfernen(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meeting_raum_entfernen(uuid) TO authenticated;
COMMIT;
