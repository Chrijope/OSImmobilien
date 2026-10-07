-- Manual meeting changes use the existing Lovable transactional email worker.
BEGIN;
ALTER TABLE public.aktivitaeten ADD COLUMN IF NOT EXISTS meeting_revision integer NOT NULL DEFAULT 0;

-- Older meetings stored guests in a readable line. Recover all valid addresses;
-- never include the private details in outgoing mail. New meetings persist the
-- exact invitation recipients, including the customer's opt-out in the dialog.
CREATE FUNCTION public.meeting_alte_kommunikation(_a public.aktivitaeten) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _emp jsonb := '[]'; _k jsonb; _g text[]; _ort text;
BEGIN
 SELECT to_jsonb(k) INTO _k FROM public.kontakte k WHERE k.id::text=_a.kunde_id;
 IF NULLIF(btrim(_k->>'email'),'') IS NOT NULL THEN
   _emp := _emp || jsonb_build_array(jsonb_build_object('email',_k->>'email','name',concat_ws(' ',_k->>'vorname',_k->>'nachname')));
 END IF;
 FOR _g IN SELECT regexp_matches(COALESCE(_a.details,''),'([^<,\n]+)<([^<>\s]+@[^<>\s]+\.[^<>\s]+)>','g') LOOP
   _emp := _emp || jsonb_build_array(jsonb_build_object('name',btrim(regexp_replace(_g[1],'^.*Gäste:\s*','')),'email',btrim(_g[2])));
 END LOOP;
 _ort := substring(_a.details from 'Treffpunkt: ([^\n]+)');
 RETURN jsonb_build_object('empfaenger',_emp,'modus',CASE WHEN _ort IS NOT NULL THEN 'vor_ort' WHEN _a.details LIKE '%Telefontermin%' THEN 'telefon' ELSE 'video' END,'treffpunkt',_ort);
END $$;
REVOKE ALL ON FUNCTION public.meeting_alte_kommunikation(public.aktivitaeten) FROM PUBLIC;
UPDATE public.aktivitaeten a SET meeting_kommunikation=public.meeting_alte_kommunikation(a)
 WHERE art='meeting' AND meeting_kommunikation IS NULL
 AND NOT EXISTS(SELECT 1 FROM public.buchungen b WHERE b.aktivitaet_id=a.id);

CREATE TABLE public.meeting_mail_auftraege (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 meeting_id uuid NOT NULL, -- deliberately survives activity/room deletion
 kontakt_id uuid REFERENCES public.kontakte(id) ON DELETE CASCADE,
 benutzer_id uuid NOT NULL,
 revision integer NOT NULL,
 art text NOT NULL CHECK(art IN ('aenderung','absage')),
 email text NOT NULL,
 daten jsonb NOT NULL,
 status text NOT NULL DEFAULT 'wartet' CHECK(status IN ('wartet','arbeitet','angenommen','fehler')),
 versuche integer NOT NULL DEFAULT 0,
 lease_id uuid,
 naechster_versuch timestamptz NOT NULL DEFAULT now(),
 fehler text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(meeting_id,revision,email)
);
ALTER TABLE public.meeting_mail_auftraege ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Eigene Meetingmails lesen" ON public.meeting_mail_auftraege FOR SELECT TO authenticated
 USING(benutzer_id=auth.uid() OR public.is_admin_role(auth.uid()));
GRANT SELECT ON public.meeting_mail_auftraege TO authenticated;
CREATE INDEX meeting_mail_offen ON public.meeting_mail_auftraege(naechster_versuch) WHERE status IN ('wartet','arbeitet');

CREATE FUNCTION public.meeting_mail_vormerken() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _a public.aktivitaeten; _art text; _revision integer; _kommunikation jsonb; _g record; _uid text;
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.art='meeting' AND NEW.faellig_am IS NOT NULL AND NEW.uhrzeit IS NOT NULL THEN
     -- Same UID as the first invitation, even after several moves.
     NEW.meeting_kommunikation := COALESCE(NEW.meeting_kommunikation,'{}'::jsonb) || jsonb_build_object('icsUid',
       'meeting-'||NEW.id||'-'||to_char((NEW.faellig_am||' '||NEW.uhrzeit)::timestamp AT TIME ZONE 'Europe/Berlin' AT TIME ZONE 'UTC','YYYYMMDD"T"HH24MISS"Z"'));
   END IF;
   RETURN NEW;
 END IF;
 IF OLD.art<>'meeting' OR EXISTS(SELECT 1 FROM public.buchungen b WHERE b.aktivitaet_id=OLD.id) THEN RETURN COALESCE(NEW,OLD); END IF;
 IF TG_OP='DELETE' THEN
   IF OLD.erledigt_am IS NOT NULL THEN RETURN OLD; END IF; -- completion is not cancellation
   _a:=OLD; _art:='absage';
 ELSE
   IF NEW.erledigt_am IS NOT NULL OR (NEW.faellig_am IS NOT DISTINCT FROM OLD.faellig_am
     AND NEW.uhrzeit IS NOT DISTINCT FROM OLD.uhrzeit AND NEW.dauer IS NOT DISTINCT FROM OLD.dauer
     AND NEW.beschreibung IS NOT DISTINCT FROM OLD.beschreibung AND NEW.zoom_link IS NOT DISTINCT FROM OLD.zoom_link
     AND NEW.meeting_kommunikation IS NOT DISTINCT FROM OLD.meeting_kommunikation) THEN RETURN NEW; END IF;
   _a:=NEW; _art:='aenderung';
 END IF;
 _revision:=OLD.meeting_revision+1;
 _kommunikation:=COALESCE(_a.meeting_kommunikation,public.meeting_alte_kommunikation(_a));
 _uid:=COALESCE(OLD.meeting_kommunikation->>'icsUid','meeting-'||OLD.id||'-'||to_char((OLD.faellig_am||' '||OLD.uhrzeit)::timestamp AT TIME ZONE 'Europe/Berlin' AT TIME ZONE 'UTC','YYYYMMDD"T"HH24MISS"Z"'));
 IF TG_OP='UPDATE' THEN NEW.meeting_revision:=_revision; NEW.meeting_kommunikation:=_kommunikation||jsonb_build_object('icsUid',_uid); END IF;
 FOR _g IN SELECT lower(btrim(value->>'email')) email, max(btrim(value->>'name')) name
   FROM jsonb_array_elements(COALESCE(_kommunikation->'empfaenger','[]'::jsonb))
   WHERE btrim(value->>'email') ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' GROUP BY lower(btrim(value->>'email')) LOOP
   INSERT INTO public.meeting_mail_auftraege(meeting_id,kontakt_id,benutzer_id,revision,art,email,daten)
   VALUES(OLD.id,NULLIF(OLD.kunde_id,'')::uuid,OLD.benutzer_id,_revision,_art,_g.email,jsonb_build_object(
     'name',_g.name,'titel',_a.beschreibung,'datum',_a.faellig_am,'uhrzeit',_a.uhrzeit,'dauer',COALESCE(NULLIF(_a.dauer,'')::integer,60),
     'start',(_a.faellig_am||' '||_a.uhrzeit)::timestamp AT TIME ZONE 'Europe/Berlin',
     'alteZeit',OLD.faellig_am||' '||OLD.uhrzeit,'zugangUrl',_a.zoom_link,'modus',_kommunikation->>'modus',
     'treffpunkt',_kommunikation->>'treffpunkt','beraterName',_a.von,'icsUid',_uid));
 END LOOP;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER meeting_mail_vormerken BEFORE INSERT OR UPDATE OR DELETE ON public.aktivitaeten
 FOR EACH ROW EXECUTE FUNCTION public.meeting_mail_vormerken();

-- Each recipient has its own lease/retry. Do not let later changes overtake a
-- previous message to the same recipient. A failed predecessor is visible and
-- must be retried before subsequent states are delivered.
CREATE FUNCTION public.meeting_mail_claim() RETURNS SETOF public.meeting_mail_auftraege
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.meeting_mail_auftraege SET status='fehler',fehler='Keine Bestätigung nach zehn Versuchen' WHERE status='arbeitet' AND versuche>=10 AND naechster_versuch<=now();
 RETURN QUERY UPDATE public.meeting_mail_auftraege a SET status='arbeitet',lease_id=gen_random_uuid(),versuche=versuche+1,naechster_versuch=now()+interval '4 minutes'
 WHERE a.id IN (SELECT x.id FROM public.meeting_mail_auftraege x
   WHERE x.status IN ('wartet','arbeitet') AND x.naechster_versuch<=now() AND x.versuche<10
   AND NOT EXISTS(SELECT 1 FROM public.meeting_mail_auftraege p WHERE p.meeting_id=x.meeting_id AND p.email=x.email AND p.revision<x.revision AND p.status<>'angenommen')
   ORDER BY x.created_at LIMIT 10 FOR UPDATE SKIP LOCKED)
 RETURNING a.*;
END $$;
CREATE FUNCTION public.meeting_mail_fertig(_id uuid,_lease uuid,_erfolg boolean,_fehler text DEFAULT NULL) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.meeting_mail_auftraege SET status=CASE WHEN _erfolg THEN 'angenommen' WHEN versuche>=10 THEN 'fehler' ELSE 'wartet' END,
   fehler=CASE WHEN _erfolg THEN NULL ELSE left(COALESCE(_fehler,'Versand fehlgeschlagen'),300) END,naechster_versuch=now()+interval '5 minutes'
 WHERE id=_id AND lease_id=_lease AND status='arbeitet';
$$;
CREATE FUNCTION public.meeting_mail_erneut(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.meeting_mail_auftraege SET status='wartet',versuche=0,lease_id=NULL,naechster_versuch=now(),fehler=NULL
 WHERE id=_id AND status IN ('fehler','wartet') AND (benutzer_id=auth.uid() OR public.is_admin_role(auth.uid()));
 IF NOT FOUND THEN RAISE EXCEPTION 'Versandauftrag nicht verfügbar'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.meeting_mail_claim(),public.meeting_mail_fertig(uuid,uuid,boolean,text),public.meeting_mail_erneut(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meeting_mail_claim(),public.meeting_mail_fertig(uuid,uuid,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.meeting_mail_erneut(uuid) TO authenticated;
COMMIT;
