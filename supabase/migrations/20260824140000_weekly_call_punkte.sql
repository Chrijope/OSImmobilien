/*
 * Punkte fuer den Weekly Sales Call.
 *
 * Jeder Vertriebspartner traegt ein, was er im naechsten Call besprechen
 * moechte. Alle sehen die Liste, aber niemand sieht, von wem ein Punkt stammt.
 * Das ist der ganze Zweck: Themen, die sonst niemand anspricht, sollen
 * hochkommen. Waere bekannt, dass die Fuehrung die Namen mitliest, kaemen
 * genau diese Punkte nicht mehr.
 *
 * Anonym heisst hier "anonym in der Anwendung". Die Verfasser-ID steht in der
 * Zeile, sonst koennte niemand seinen eigenen Punkt nachtraeglich aendern. Wer
 * Zugang zum Datenbank-Editor hat, kann sie nachschlagen. Das ist die
 * Notbremse gegen Missbrauch, und den Partnern sollte es so gesagt werden.
 *
 * Nichts wird geloescht. Jeder Punkt traegt den Termin des Calls, fuer den er
 * gedacht war. Die Karte zeigt den anstehenden Call, die frueheren bleiben als
 * Rueckschau erhalten. Damit ist die Liste zum Stichtag von selbst leer, ohne
 * dass ein Job laufen muss, der auch ausfallen kann.
 */

-- ── Der Call, zu dem ein Zeitpunkt gehoert ───────────────────────────────────
--
-- Der Weekly Sales Call ist dienstags 12:30 Uhr und dauert eine Stunde. Ein
-- Punkt gehoert zu dem Call, auf den er zielt: bis dienstags 13:30 Uhr zum
-- heutigen, danach zum naechsten. Dieselbe Regel wie naechsterWeeklyCall() in
-- WeeklyCallCard.tsx.
--
-- Gerechnet wird ausdruecklich in deutscher Ortszeit. Der Server laeuft in UTC,
-- und ohne diese Umrechnung faellt der Schnitt im Sommer eine Stunde falsch.
CREATE OR REPLACE FUNCTION public.weekly_call_woche(_zeitpunkt timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql
STABLE
SET search_path = 'public'
AS $$
  SELECT CASE
    WHEN extract(isodow FROM lokal) = 2 AND lokal::time < time '13:30' THEN lokal::date
    WHEN extract(isodow FROM lokal) = 2 THEN lokal::date + 7
    ELSE lokal::date + ((2 - extract(isodow FROM lokal)::int + 7) % 7)
  END
  FROM (SELECT (_zeitpunkt AT TIME ZONE 'Europe/Berlin') AS lokal) AS t;
$$;

COMMENT ON FUNCTION public.weekly_call_woche(timestamptz) IS
  'Termin des Weekly Sales Call, zu dem ein Zeitpunkt gehoert. Dienstag, '
  'Schnitt um 13:30 deutscher Ortszeit. Einzige Stelle, an der der Stichtag steht.';

-- ── Die Punkte ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.weekly_call_punkte (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Der Call, fuer den der Punkt gedacht ist. Beim Anlegen gesetzt und danach
  -- unveraenderlich, sonst wanderte ein Punkt beim Bearbeiten in die neue Woche.
  call_termin DATE NOT NULL DEFAULT public.weekly_call_woche(),
  text TEXT NOT NULL CHECK (btrim(text) <> '' AND length(text) <= 300),
  besprochen_am TIMESTAMPTZ,
  besprochen_von UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wcp_termin ON public.weekly_call_punkte (call_termin DESC);
CREATE INDEX IF NOT EXISTS idx_wcp_user ON public.weekly_call_punkte (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_call_punkte TO authenticated;
GRANT ALL ON public.weekly_call_punkte TO service_role;

ALTER TABLE public.weekly_call_punkte ENABLE ROW LEVEL SECURITY;

/*
 * Lesen: ausschliesslich die eigenen Zeilen.
 *
 * Die gemeinsame Liste kommt aus weekly_call_punkte_lesen() weiter unten, und
 * die gibt keine Verfasser-ID heraus. Damit ist die Anonymitaet technisch
 * erzwungen und nicht nur in der Oberflaeche ausgeblendet. Wer die Tabelle
 * direkt abfragt, sieht nur sich selbst, auch als Administrator.
 */
CREATE POLICY "wcp_select_eigene" ON public.weekly_call_punkte
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Eintragen darf, wer am Call teilnimmt, und nur auf den eigenen Namen.
CREATE POLICY "wcp_insert" ON public.weekly_call_punkte
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND call_termin = public.weekly_call_woche()
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'inhaber'::public.app_role)
      OR public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role)
      OR public.has_role(auth.uid(), 'vertriebspartner'::public.app_role)
    )
  );

-- Aendern und Loeschen nur am eigenen Punkt und nur, solange der Call noch
-- aussteht. Ein Punkt aus einem vergangenen Call ist Teil des Protokolls.
CREATE POLICY "wcp_update_eigene" ON public.weekly_call_punkte
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND call_termin = public.weekly_call_woche())
  WITH CHECK (user_id = auth.uid() AND call_termin = public.weekly_call_woche());

CREATE POLICY "wcp_delete_eigene" ON public.weekly_call_punkte
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND call_termin = public.weekly_call_woche());

CREATE TRIGGER trg_wcp_updated_at
  BEFORE UPDATE ON public.weekly_call_punkte
  FOR EACH ROW EXECUTE FUNCTION public.update_profiles_timestamp();

-- ── Das Protokoll eines Calls ────────────────────────────────────────────────
--
-- Aufzeichnung, Transkript und Zusammenfassung haengen am Termin, nicht an
-- einem Punkt. Eine Zeile je Call.
CREATE TABLE IF NOT EXISTS public.weekly_call_protokolle (
  call_termin DATE NOT NULL PRIMARY KEY,
  aufzeichnung_url TEXT,
  dokument_pfad TEXT,
  dokument_name TEXT,
  notiz TEXT,
  gepflegt_von UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_call_protokolle TO authenticated;
GRANT ALL ON public.weekly_call_protokolle TO service_role;

ALTER TABLE public.weekly_call_protokolle ENABLE ROW LEVEL SECURITY;

-- Lesen darf jeder, der am Call teilnimmt. Hier stehen keine personenbezogenen
-- Daten, sondern das Ergebnis des Calls.
CREATE POLICY "wcpr_select" ON public.weekly_call_protokolle
  FOR SELECT TO authenticated
  USING (public.is_internal_role(auth.uid()));

-- Pflegen nur die Aufsicht.
CREATE POLICY "wcpr_insert" ON public.weekly_call_protokolle
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_role(auth.uid())
    OR public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role)
  );

CREATE POLICY "wcpr_update" ON public.weekly_call_protokolle
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_role(auth.uid())
    OR public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role)
  )
  WITH CHECK (
    public.is_admin_role(auth.uid())
    OR public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role)
  );

CREATE POLICY "wcpr_delete" ON public.weekly_call_protokolle
  FOR DELETE TO authenticated
  USING (public.is_admin_role(auth.uid()));

CREATE TRIGGER trg_wcpr_updated_at
  BEFORE UPDATE ON public.weekly_call_protokolle
  FOR EACH ROW EXECUTE FUNCTION public.update_profiles_timestamp();

-- ── Die gemeinsame, anonyme Liste ────────────────────────────────────────────
--
-- Gibt Text, Zeitpunkt und den Besprochen-Stand zurueck, aber keine
-- Verfasser-ID. Das Kennzeichen "von mir" wird hier berechnet, damit die
-- Oberflaeche eigene Punkte zum Bearbeiten anbieten kann, ohne fremde
-- zuordnen zu koennen.
CREATE OR REPLACE FUNCTION public.weekly_call_punkte_lesen(_termin date DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  text text,
  call_termin date,
  von_mir boolean,
  besprochen boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT p.id,
         p.text,
         p.call_termin,
         p.user_id = auth.uid() AS von_mir,
         p.besprochen_am IS NOT NULL AS besprochen,
         p.created_at
    FROM public.weekly_call_punkte p
   WHERE public.is_internal_role(auth.uid())
     AND p.call_termin = COALESCE(_termin, public.weekly_call_woche())
   ORDER BY p.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.weekly_call_punkte_lesen(date) TO authenticated;

-- Welche Calls haben ueberhaupt Punkte oder ein Protokoll? Fuer die Rueckschau.
CREATE OR REPLACE FUNCTION public.weekly_call_termine()
RETURNS TABLE (call_termin date, anzahl bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT t.call_termin, count(p.id) AS anzahl
    FROM (
      SELECT call_termin FROM public.weekly_call_punkte
      UNION
      SELECT call_termin FROM public.weekly_call_protokolle
    ) t
    LEFT JOIN public.weekly_call_punkte p ON p.call_termin = t.call_termin
   WHERE public.is_internal_role(auth.uid())
   GROUP BY t.call_termin
   ORDER BY t.call_termin DESC;
$$;

GRANT EXECUTE ON FUNCTION public.weekly_call_termine() TO authenticated;

-- Abhaken im Call. Nur die Aufsicht, und ohne Blick auf den Verfasser.
CREATE OR REPLACE FUNCTION public.weekly_call_punkt_abhaken(_id uuid, _besprochen boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT (public.is_admin_role(auth.uid())
          OR public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role)) THEN
    RAISE EXCEPTION 'Nicht berechtigt';
  END IF;

  UPDATE public.weekly_call_punkte
     SET besprochen_am = CASE WHEN _besprochen THEN now() ELSE NULL END,
         besprochen_von = CASE WHEN _besprochen THEN auth.uid() ELSE NULL END
   WHERE id = _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.weekly_call_punkt_abhaken(uuid, boolean) TO authenticated;

-- ── Ablage fuer Transkript und Zusammenfassung ───────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('weekly-call', 'weekly-call', false, 26214400,
        ARRAY['application/pdf', 'text/plain'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "wc_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'weekly-call' AND public.is_internal_role(auth.uid()));

CREATE POLICY "wc_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'weekly-call'
    AND (public.is_admin_role(auth.uid())
         OR public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role))
  );

CREATE POLICY "wc_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'weekly-call' AND public.is_admin_role(auth.uid()));
