-- ===========================================================================
-- Der Vertriebspartner darf seinen eigenen Lead weitergeben
-- ===========================================================================
--
-- WARUM
--
-- Ab heute gibt ein Vertriebspartner unter "Alle Kontakte" einen Lead selbst
-- an einen Kollegen weiter, mit Pflichtangabe des Grundes. Bisher konnte das
-- nur die Leitung.
--
-- Ueber die Oberflaeche allein geht das nicht: Die Regel
-- "Vertriebspartner bearbeiten eigene Kontakte" (20260915141000) hat kein
-- eigenes WITH CHECK. Ohne WITH CHECK gilt die USING-Bedingung auch fuer die
-- NEUE Zeile. Nach der Abgabe gehoert die Zeile aber jemand anderem und
-- faellt damit durch die Pruefung. Die Datenbank wuerde das UPDATE also
-- ablehnen, obwohl der Partner genau das tun soll.
--
-- WAS GEPRUEFT WURDE, UND WAS SICH DABEI BESTAETIGT HAT
--
-- Frage war, ob ein Partner einen fremden Lead anfassen kann. Antwort: nein.
-- Lesen und Schreiben sind zwar zwei getrennte Regeln, sie tragen fuer den
-- Vertriebspartner aber woertlich dieselbe Bedingung:
--
--   "Vertriebspartner sehen eigene Kontakte"      FOR SELECT
--   "Vertriebspartner bearbeiten eigene Kontakte" FOR UPDATE
--       USING (has_role(vertriebspartner)
--              AND is_vp_owner_of_kontakt(auth.uid(), zustaendig_id, meta))
--
-- Was er nicht sieht, kann er also auch nicht aendern. Ein Umweg an der
-- Liste vorbei besteht nicht.
--
-- Ein Rest bleibt, und nur ihn regelt diese Migration:
-- `is_vp_owner_of_kontakt` ist etwas weiter als "mir zugewiesen". Sie gilt
-- auch fuer Kontakte, die der Partner einmal selbst angelegt hat
-- (`meta.erstelltVonId`) oder als Empfehlungsgeber gemeldet hat
-- (`meta.empfehlungsgeberVpId`), und fuer eine laufende Vertretung. Solche
-- Leads sieht er weiterhin, auch wenn sie laengst einem Kollegen gehoeren.
-- Wenn das WITH CHECK unten die Abgabe oeffnet, waeren genau diese Leads der
-- eine Fall, in dem ein Partner eine fremde Zustaendigkeit verschieben
-- koennte. Der Trigger schliesst ihn im selben Zug.
--
-- WAS DIESE MIGRATION NICHT TUT
--
-- Sie nimmt niemandem etwas weg. Insbesondere bleibt unangetastet, dass
-- "Admin und interne Rollen bearbeiten Kontakte" (20260916190000) das
-- Verschieben von `zustaendig_id` allen erlaubt, die `darf_alle_kunden_sehen`
-- durchlaesst, also auch backoffice, finanzierungspartner, buchhaltung,
-- setterin, individuell und testaccount. Der Knopf sehen nur drei Rollen.
-- Dass beides auseinanderfaellt, ist ein gemeldeter Befund und eine
-- Entscheidung fuer Christian, keine stille Aenderung hier.
--
-- Wiederholbar: ein zweiter Lauf aendert nichts.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Wer darf jeden Lead jedem geben?
-- ---------------------------------------------------------------------------
--
-- Gebraucht wird die Funktion unten im Trigger, fuer den seltenen Fall, dass
-- jemand sowohl die Rolle vertriebspartner als auch eine Leitungsrolle
-- traegt. Dieselbe Liste steht in `src/lib/leadZuweisungRechte.ts` fuer die
-- Oberflaeche; `src/lib/leadZuweisungRechte.test.ts` faellt um, wenn die
-- beiden auseinanderlaufen.

CREATE OR REPLACE FUNCTION public.darf_leads_zuweisen(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role IN ('admin', 'inhaber', 'vertriebsleiter')
    )
  ), false)
$$;

COMMENT ON FUNCTION public.darf_leads_zuweisen(uuid) IS
  'Darf dieser Nutzer jeden Lead jedem zuweisen? Nur die Leitung: admin, '
  'inhaber, vertriebsleiter. Ein Vertriebspartner darf seinen eigenen Lead '
  'abgeben, das entscheidet nicht diese Funktion, sondern '
  'kontakt_zustaendigkeit_schuetzen anhand des bisherigen Zustaendigen.';

REVOKE ALL ON FUNCTION public.darf_leads_zuweisen(uuid) FROM public;
REVOKE ALL ON FUNCTION public.darf_leads_zuweisen(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.darf_leads_zuweisen(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 2) Das WITH CHECK, das die Abgabe ueberhaupt zulaesst
-- ---------------------------------------------------------------------------
--
-- Das USING bleibt Wort fuer Wort wie bisher: WAS er anfassen darf, aendert
-- sich nicht. Neu ist allein, WOHIN die Zustaendigkeit danach zeigen darf,
-- naemlich auf jemand anderen. Das ist die Abgabe.
--
-- Unveraendert bleibt auch: In den offenen Pool zurueckgeben
-- (`zustaendig_id` auf NULL) kann ein Vertriebspartner nur bei einem Lead,
-- der ihm auch ohne Zustaendigkeit gehoert. Das war vorher so.

DROP POLICY IF EXISTS "Vertriebspartner bearbeiten eigene Kontakte" ON public.kontakte;
CREATE POLICY "Vertriebspartner bearbeiten eigene Kontakte"
  ON public.kontakte
  FOR UPDATE
  TO authenticated
  USING (
    (select public.has_role(auth.uid(), 'vertriebspartner'))
    AND public.is_vp_owner_of_kontakt(auth.uid(), zustaendig_id, meta)
  )
  WITH CHECK (
    (select public.has_role(auth.uid(), 'vertriebspartner'))
    AND (
      public.is_vp_owner_of_kontakt(auth.uid(), zustaendig_id, meta)
      OR (zustaendig_id IS NOT NULL AND zustaendig_id <> auth.uid())
    )
  );


-- ---------------------------------------------------------------------------
-- 3) Er gibt ab, er nimmt nicht
-- ---------------------------------------------------------------------------
--
-- Der Trigger aus 20260807150000 bekommt einen zweiten Absatz. Der erste,
-- die Vertretung, bleibt Wort fuer Wort erhalten.
--
-- Warum ein Trigger und nicht die Policy: Eine Policy sieht die alte Zeile
-- (USING) und die neue (WITH CHECK), kann beide aber nicht miteinander
-- vergleichen. Die Regel lautet genau so: Wer war vorher zustaendig, und ist
-- der Aufrufer diese Person? Die Bedingung haengt bewusst am BISHERIGEN
-- Zustaendigen und nicht an der Rolle des Aufrufers. Haenge sie an der Rolle,
-- koennte ein Partner einen selbst angelegten, laengst uebergebenen Lead
-- wieder verschieben, und der jetzige Zustaendige merkte es erst, wenn der
-- Kunde weg ist.
--
-- Andere Rollen beruehrt dieser Absatz nicht. Er greift nur, wenn der
-- Aufrufer die Rolle vertriebspartner traegt und keine Leitungsrolle hat.

CREATE OR REPLACE FUNCTION public.kontakt_zustaendigkeit_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Frueh aussteigen, damit der haeufige Fall (Zustaendigkeit unveraendert)
  -- keine einzige Rollenabfrage kostet.
  IF NEW.zustaendig_id IS NOT DISTINCT FROM OLD.zustaendig_id THEN
    RETURN NEW;
  END IF;
  -- Ohne angemeldeten Nutzer laeuft ein Cron oder eine Edge Function mit dem
  -- Dienstschluessel. Die haben ohnehin volle Rechte.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Die Vertretung darf die Zustaendigkeit nicht verschieben. Unveraendert
  -- aus 20260807150000: An ihr haengt die Provision.
  IF NOT public.is_admin_role(auth.uid())
     AND public.ist_aktive_vertretung(auth.uid(), OLD.zustaendig_id)
     AND NOT public.is_vp_eigentuemer_of_kontakt(auth.uid(), OLD.zustaendig_id, OLD.meta)
  THEN
    RAISE EXCEPTION 'Als Vertretung kannst du die Zuständigkeit nicht ändern. An ihr hängt die Provision.';
  END IF;

  -- Neu am 18.09.2026: Ein Vertriebspartner gibt ab, er nimmt nicht. Er darf
  -- die Zustaendigkeit nur dann verschieben, wenn er selbst der bisherige
  -- Zustaendige ist. Ein herrenloser Lead (OLD.zustaendig_id IS NULL) wird
  -- verteilt und nicht weggenommen, das bleibt erlaubt.
  IF (select public.has_role(auth.uid(), 'vertriebspartner'))
     AND NOT public.darf_leads_zuweisen(auth.uid())
     AND OLD.zustaendig_id IS NOT NULL
     AND OLD.zustaendig_id <> auth.uid()
  THEN
    RAISE EXCEPTION 'Du kannst nur Leads weitergeben, für die du selbst zuständig bist.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.kontakt_zustaendigkeit_schuetzen() IS
  'Zwei Regeln fuer kontakte.zustaendig_id: Eine Vertretung darf sie nicht '
  'verschieben (seit 07.08.2026), und ein Vertriebspartner nur dann, wenn er '
  'selbst der bisherige Zustaendige ist (seit 18.09.2026). Alle uebrigen '
  'Rollen entscheidet weiterhin allein die Zeilensicherheit.';

DROP TRIGGER IF EXISTS trg_kontakt_zustaendigkeit_schuetzen ON public.kontakte;
CREATE TRIGGER trg_kontakt_zustaendigkeit_schuetzen
  BEFORE UPDATE ON public.kontakte
  FOR EACH ROW EXECUTE FUNCTION public.kontakt_zustaendigkeit_schuetzen();

REVOKE EXECUTE ON FUNCTION public.kontakt_zustaendigkeit_schuetzen() FROM anon, public;


-- ---------------------------------------------------------------------------
-- 4) Nachsehen
-- ---------------------------------------------------------------------------
--
-- Gibt es die Funktion, und haengt der Trigger?
--
--     select proname from pg_proc
--      where proname in ('darf_leads_zuweisen', 'kontakt_zustaendigkeit_schuetzen');
--
--     select tgname from pg_trigger
--      where tgname = 'trg_kontakt_zustaendigkeit_schuetzen';
--
-- Traegt die Vertriebspartner-Regel jetzt ein eigenes WITH CHECK?
--
--     select policyname, cmd, qual, with_check
--       from pg_policies
--      where tablename = 'kontakte'
--        and policyname = 'Vertriebspartner bearbeiten eigene Kontakte';
--
-- Gegenprobe im Betrieb: Ein Vertriebspartner gibt einen ihm zugewiesenen
-- Lead ab, das muss gehen. Verschiebt er die Zustaendigkeit an einem Lead,
-- den er zwar sieht (selbst angelegt), der aber einem Kollegen gehoert, kommt
-- "Du kannst nur Leads weitergeben, für die du selbst zuständig bist."
