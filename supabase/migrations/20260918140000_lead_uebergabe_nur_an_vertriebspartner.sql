-- ===========================================================================
-- Ein Vertriebspartner gibt seinen Lead nur an einen Vertriebspartner
-- ===========================================================================
--
-- WARUM
--
-- Die Migration von heute Morgen (20260918130000) hat die Abgabe geoeffnet:
-- Ein Vertriebspartner darf seinen eigenen Lead weitergeben. Geprueft wurde
-- dabei nur, ob der ABGEBENDE dazu berechtigt ist. Wer EMPFAENGT, wurde nicht
-- geprueft. Das WITH CHECK verlangt vom neuen Zustaendigen nichts weiter, als
-- dass er nicht der Aufrufer selbst und nicht NULL ist.
--
-- Damit konnte ein Partner einen Lead auf jede beliebige Nutzerkennung
-- setzen: auf einen Bewerber, auf ein gesperrtes Konto, auf jemanden aus der
-- Buchhaltung. Der Lead waere danach faktisch verschwunden, denn er steht nur
-- noch in der Liste eines Menschen, der ihn nie bearbeitet, und in der
-- Lead-Verwaltung taucht er nicht auf, weil er einen Zustaendigen hat.
--
-- ENTSCHEIDUNG VON CHRISTIAN
--
-- Der neue Zustaendige muss die Rolle vertriebspartner tragen.
--
-- WARUM DER TRIGGER UND NICHT DIE POLICY
--
-- Eine Policy sieht die neue Zeile, aber nicht, OB sich die Zustaendigkeit
-- ueberhaupt geaendert hat. Die Bedingung "der Zustaendige muss ein
-- Vertriebspartner sein" wuerde dort also auch fuer jede gewoehnliche
-- Bearbeitung gelten. Ein Partner darf aber Kontakte bearbeiten, die er
-- einmal selbst angelegt hat und die laengst jemand anderem gehoeren, etwa
-- einer Setterin. Genau diese Bearbeitungen wuerde eine Policy-Bedingung
-- mitverbieten, obwohl an der Zustaendigkeit gar nichts passiert.
--
-- Der Trigger dagegen vergleicht ALT und NEU. Er greift nur dann, wenn die
-- Zustaendigkeit wirklich wandert. Dort steht auch schon die Regel von heute
-- Morgen, beide gehoeren zusammen an eine Stelle. Und er kann einen Satz
-- sagen, den ein Mensch versteht; eine abgelehnte Policy meldet nur, dass
-- eine Zeile die Zeilensicherheit verletzt.
--
-- WAS AUSDRUECKLICH ERLAUBT BLEIBT
--
--   * Zurueck in den offenen Pool. `zustaendig_id` auf NULL wird von der
--     neuen Bedingung nicht beruehrt, sie greift nur bei einem neuen
--     Zustaendigen. Wie bisher entscheidet ueber diesen Weg allein die
--     Policy: Ein Partner kann nur einen Lead zurueckgeben, der ihm auch
--     ohne Zustaendigkeit gehoert.
--   * Zuweisen durch die Leitung. Admin, Inhaber und Vertriebsleiter gehen
--     ueber `darf_leads_zuweisen` und werden von der neuen Bedingung nicht
--     erfasst. Sie duerfen weiterhin jeden Lead jedem geben, auch einer
--     Setterin oder dem Backoffice. Das ist Absicht: Ein Admin traegt in
--     aller Regel selbst gar keine Vertriebspartner-Rolle, eine Pruefung des
--     Empfaengers auf ihn angewandt wuerde die Lead-Verteilung lahmlegen.
--   * Alles, was andere Rollen tun. Der Absatz greift nur, wenn der Aufrufer
--     die Rolle vertriebspartner traegt und keine Leitungsrolle hat.
--
-- Dieselbe Regel steht fuer die Oberflaeche in
-- `src/lib/leadZuweisungRechte.ts`, geprueft von
-- `src/lib/leadZuweisungRechte.test.ts`.
--
-- Wiederholbar: ein zweiter Lauf aendert nichts.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Darf dieser Mensch einen Lead uebernehmen?
-- ---------------------------------------------------------------------------
--
-- Eine eigene Funktion und nicht `has_role` direkt im Trigger: So steht die
-- Antwort auf die Frage "wer darf Leads bekommen" an einer Stelle und laesst
-- sich spaeter erweitern, ohne den Trigger anzufassen.

CREATE OR REPLACE FUNCTION public.darf_lead_uebernehmen(_user_id uuid)
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
        AND ur.role = 'vertriebspartner'
    )
  ), false)
$$;

COMMENT ON FUNCTION public.darf_lead_uebernehmen(uuid) IS
  'Darf dieser Nutzer der neue Zustaendige eines Leads werden, wenn ein '
  'Vertriebspartner ihn weitergibt? Nur wer selbst die Rolle '
  'vertriebspartner traegt. Fuer die Leitung gilt die Pruefung nicht, sie '
  'verteilt weiterhin an jeden.';

REVOKE ALL ON FUNCTION public.darf_lead_uebernehmen(uuid) FROM public;
REVOKE ALL ON FUNCTION public.darf_lead_uebernehmen(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.darf_lead_uebernehmen(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 2) Der Trigger bekommt einen dritten Absatz
-- ---------------------------------------------------------------------------
--
-- Die beiden ersten Absaetze bleiben Wort fuer Wort erhalten: die Vertretung
-- (seit 07.08.2026) und "er gibt ab, er nimmt nicht" (seit heute Morgen).

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

  -- Seit dem 18.09.2026: Ein Vertriebspartner gibt ab, er nimmt nicht. Er darf
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

  -- Neu: Er gibt ihn auch nur an einen Vertriebspartner. Sonst koennte er den
  -- Lead auf ein beliebiges Konto setzen, und dort waere er verschwunden.
  -- NULL bleibt ausgenommen, das ist der Weg zurueck in den offenen Pool.
  IF NEW.zustaendig_id IS NOT NULL
     AND (select public.has_role(auth.uid(), 'vertriebspartner'))
     AND NOT public.darf_leads_zuweisen(auth.uid())
     AND NOT public.darf_lead_uebernehmen(NEW.zustaendig_id)
  THEN
    RAISE EXCEPTION 'Weitergeben kannst du einen Lead nur an einen Vertriebspartner.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.kontakt_zustaendigkeit_schuetzen() IS
  'Drei Regeln fuer kontakte.zustaendig_id: Eine Vertretung darf sie nicht '
  'verschieben (seit 07.08.2026); ein Vertriebspartner nur dann, wenn er '
  'selbst der bisherige Zustaendige ist (seit 18.09.2026); und er verschiebt '
  'sie nur auf einen anderen Vertriebspartner oder zurueck in den offenen '
  'Pool (seit 18.09.2026). Alle uebrigen Rollen entscheidet weiterhin allein '
  'die Zeilensicherheit.';

DROP TRIGGER IF EXISTS trg_kontakt_zustaendigkeit_schuetzen ON public.kontakte;
CREATE TRIGGER trg_kontakt_zustaendigkeit_schuetzen
  BEFORE UPDATE ON public.kontakte
  FOR EACH ROW EXECUTE FUNCTION public.kontakt_zustaendigkeit_schuetzen();

REVOKE EXECUTE ON FUNCTION public.kontakt_zustaendigkeit_schuetzen() FROM anon, public;


-- ---------------------------------------------------------------------------
-- 3) Nachsehen
-- ---------------------------------------------------------------------------
--
-- Gibt es die neue Funktion?
--
--     select proname from pg_proc where proname = 'darf_lead_uebernehmen';
--
-- Traegt der Trigger den dritten Absatz?
--
--     select prosrc like '%darf_lead_uebernehmen%' as hat_empfaengerpruefung
--       from pg_proc where proname = 'kontakt_zustaendigkeit_schuetzen';
--
-- Gegenprobe im Betrieb, als Vertriebspartner:
--   * Lead an einen Kollegen mit Rolle vertriebspartner  -> geht.
--   * Lead an jemanden ohne diese Rolle                  -> "Weitergeben
--     kannst du einen Lead nur an einen Vertriebspartner."
--   * Als Admin an jemanden ohne diese Rolle             -> geht weiterhin.
