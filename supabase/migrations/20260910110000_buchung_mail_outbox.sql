-- Persist the intent to notify independently of the booking browser.
BEGIN;
CREATE TABLE public.buchung_mail_auftraege (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 buchung_id uuid NOT NULL REFERENCES public.buchungen(id) ON DELETE CASCADE,
 art text NOT NULL CHECK (art IN ('bestaetigung','aenderung')),
 stand text NOT NULL,
 status text NOT NULL DEFAULT 'wartet' CHECK(status IN ('wartet','arbeitet','angenommen','fehler')),
 versuche integer NOT NULL DEFAULT 0,
 request_id bigint,
 naechster_versuch timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(buchung_id,art,stand)
);
ALTER TABLE public.buchung_mail_auftraege ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Eigene Versandauftraege lesen" ON public.buchung_mail_auftraege FOR SELECT TO authenticated
USING (EXISTS(SELECT 1 FROM public.buchungen b WHERE b.id=buchung_id AND (b.mitarbeiter_id=auth.uid() OR public.is_admin_role(auth.uid()))));
GRANT SELECT ON public.buchung_mail_auftraege TO authenticated;

-- Short lease for concurrent/browser/cron requests. Never mistake started for sent.
CREATE TABLE public.buchung_mail_sperren(schluessel text PRIMARY KEY, bis timestamptz NOT NULL, fertig boolean NOT NULL DEFAULT false);
ALTER TABLE public.buchung_mail_sperren ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.buchung_mail_claim(_schluessel text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _r public.buchung_mail_sperren;
BEGIN
 INSERT INTO public.buchung_mail_sperren VALUES(_schluessel,now()-interval '1 second',false) ON CONFLICT DO NOTHING;
 SELECT * INTO _r FROM public.buchung_mail_sperren WHERE schluessel=_schluessel FOR UPDATE;
 IF _r.fertig THEN RETURN 'fertig'; END IF;
 IF _r.bis>now() THEN RETURN 'besetzt'; END IF;
 UPDATE public.buchung_mail_sperren SET bis=now()+interval '4 minutes' WHERE schluessel=_schluessel;
 RETURN 'frei';
END $$;
CREATE FUNCTION public.buchung_mail_fertig(_schluessel text,_erfolg boolean) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.buchung_mail_sperren SET fertig=_erfolg,bis=now() WHERE schluessel=_schluessel;
$$;
CREATE FUNCTION public.buchung_mail_meta_setzen(_id uuid,_patch jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.buchungen SET meta=COALESCE(meta,'{}'::jsonb)||_patch WHERE id=_id;
$$;
REVOKE ALL ON FUNCTION public.buchung_mail_claim(text), public.buchung_mail_fertig(text,boolean), public.buchung_mail_meta_setzen(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buchung_mail_claim(text), public.buchung_mail_fertig(text,boolean), public.buchung_mail_meta_setzen(uuid,jsonb) TO service_role;

CREATE FUNCTION public.buchung_mail_vormerken() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   INSERT INTO public.buchung_mail_auftraege(buchung_id,art,stand) VALUES(NEW.id,'bestaetigung',NEW.start_at::text) ON CONFLICT DO NOTHING;
 ELSIF NEW.start_at IS DISTINCT FROM OLD.start_at OR (NEW.status='abgesagt' AND OLD.status<>'abgesagt') THEN
   INSERT INTO public.buchung_mail_auftraege(buchung_id,art,stand) VALUES(NEW.id,'aenderung',NEW.status || ':' || NEW.start_at::text) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER buchung_mail_vormerken AFTER INSERT OR UPDATE OF start_at,status ON public.buchungen
FOR EACH ROW EXECUTE FUNCTION public.buchung_mail_vormerken();

CREATE FUNCTION public.buchung_mail_erneut(_auftrag_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.buchung_mail_auftraege a SET status='wartet',versuche=0,naechster_versuch=now(),request_id=null
 WHERE a.id=_auftrag_id AND a.status='fehler' AND EXISTS(SELECT 1 FROM public.buchungen b WHERE b.id=a.buchung_id AND (b.mitarbeiter_id=auth.uid() OR public.is_admin_role(auth.uid())));
 IF NOT FOUND THEN RAISE EXCEPTION 'Versandauftrag nicht verfügbar'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.buchung_mail_erneut(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buchung_mail_erneut(uuid) TO authenticated;

CREATE FUNCTION public.buchung_mail_ausliefern() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _a record; _r record; _id bigint; _ok boolean; _body jsonb;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtext('buchung_mail_ausliefern')) THEN RETURN; END IF;
 FOR _a IN SELECT * FROM public.buchung_mail_auftraege WHERE status='arbeitet' AND naechster_versuch <= now() LOOP
   SELECT * INTO _r FROM net._http_response WHERE id=_a.request_id;
   _ok := false;
   IF FOUND AND _r.status_code BETWEEN 200 AND 299 THEN
     BEGIN
       _body := _r.content::jsonb;
       _ok := COALESCE((_body->>'gesendet')::boolean,false) OR _body->>'grund' IN ('bereits gesendet','nichts zu senden');
     EXCEPTION WHEN OTHERS THEN _ok := false;
     END;
   END IF;
   UPDATE public.buchung_mail_auftraege SET status=CASE WHEN _ok THEN 'angenommen' WHEN versuche>=10 THEN 'fehler' ELSE 'wartet' END,
     naechster_versuch=now()+interval '5 minutes' WHERE id=_a.id;
 END LOOP;
 FOR _a IN SELECT a.*,b.absage_token FROM public.buchung_mail_auftraege a JOIN public.buchungen b ON b.id=a.buchung_id
   WHERE a.status='wartet' AND a.naechster_versuch<=now() ORDER BY a.created_at LIMIT 2 FOR UPDATE OF a SKIP LOCKED LOOP
   SELECT net.http_post(
     url := 'https://irwdgutegmivbtgmftyc.supabase.co/functions/v1/send-buchung-' || CASE WHEN _a.art='bestaetigung' THEN 'bestaetigung' ELSE 'aenderung' END,
     headers := '{"Content-Type":"application/json"}'::jsonb,
     body := jsonb_build_object('absageToken',_a.absage_token)) INTO _id;
   UPDATE public.buchung_mail_auftraege SET status='arbeitet',request_id=_id,versuche=versuche+1,naechster_versuch=now()+interval '5 minutes' WHERE id=_a.id;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.buchung_mail_ausliefern() FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') AND EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_net') THEN
   PERFORM cron.schedule('buchung-mail-ausliefern','*/5 * * * *','SELECT public.buchung_mail_ausliefern()');
   -- Activate only after both updated Edge Functions have been deployed and tested.
   UPDATE cron.job SET active=false WHERE jobname='buchung-mail-ausliefern';
 ELSE RAISE WARNING 'Buchungsmail-Wiederholung benötigt pg_cron und pg_net. Vor Freigabe einrichten.';
 END IF;
END $$;
COMMIT;
