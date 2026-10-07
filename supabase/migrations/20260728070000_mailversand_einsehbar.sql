-- Mailversand für Admins einsehbar machen.
--
-- Bisher konnte nur der Server das Versandprotokoll lesen. Wenn ein Kunde
-- keine Einladung bekam, gab es im Programm keine Möglichkeit
-- nachzusehen, woran es lag: abgemeldet, fehlgeschlagen, noch in der
-- Warteschlange oder nie abgeschickt. Genau diese Frage kam auf, und sie war
-- von innen nicht zu beantworten.
--
-- Gelesen wird nur, geschrieben weiterhin ausschließlich vom Server.

DO $$ BEGIN
  CREATE POLICY "Admins lesen das Versandprotokoll"
    ON public.email_send_log FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins lesen abgemeldete Adressen"
    ON public.suppressed_emails FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins sehen den Zustand der Warteschlange"
    ON public.email_send_state FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS email_send_log_zeit_idx
  ON public.email_send_log (created_at DESC);

CREATE INDEX IF NOT EXISTS email_send_log_empfaenger_idx
  ON public.email_send_log (recipient_email, created_at DESC);
