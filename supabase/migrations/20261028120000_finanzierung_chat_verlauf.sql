-- ===========================================================================
-- Finanzierung: Chat statt Verlauf, Vertriebsleitung sieht mit, Angebote
-- nach dem Zuschlag im Verlauf statt weg (Christian, 28.10.2026)
-- ===========================================================================
--
-- WAS SIE TUT
--
--   1. Vertriebsleitung sieht Einreichungen, Zielbanken, Angebotsvergleich
--      und das Download-Protokoll wie admin, inhaber und backoffice (neue
--      Lesefunktion `darf_finanzierung_einsehen`) und gibt wie diese den
--      Zuschlag und zieht zurueck (`darf_finanzierung_steuern` erweitert).
--   2. Verlauf der Angebote: Beim Zuschlag kopiert `finanzierung_zuschlag`
--      die bisher in der Finanzierung stehenden Angebote (von Hand
--      eingetragene) in die neue Tabelle `finanzierung_angebote_verlauf`,
--      bevor die Oberflaeche sie in der Finanzierung ersetzt. Der Gewinner
--      sieht diese Tabelle nicht.
--   3. Chat je Kunde und Finanzierer: `finanzierung_chat_oeffnen` liefert den
--      vorhandenen Chat oder legt ihn an (Zuordnung in `finanzierung_chats`).
--   4. Sobald ein Finanzierer in einen internen Chat kommt, traegt die
--      Datenbank einmalig alle admin, inhaber, vertriebsleiter und backoffice
--      ein (`chat_gruppen.leitung_ergaenzt_am`). Wer danach austritt, bleibt
--      draussen: Die Ergaenzung laeuft je Chat nur ein einziges Mal.
--   5. Der Finanzierer hat „/chat“ in der Seitenleiste (role_permissions).
--
-- WAS SICH NICHT AENDERT
--
--   `finanzierung_nachrichten` bleibt samt Inhalt und Regeln bestehen. Die
--   Oberflaeche zeigt nur noch die letzte alte Nachricht als Vorschau.
--   Austreten aus internen Chats regelt weiter die Regel
--   „Teilnehmer beenden eigene Teilnahme“ (20260802210000); sie gilt auch
--   hier, auch fuer den Ersteller.
--
-- Nur hinzufuegend: neue Spalte, neue Tabellen, neue Funktionen; ersetzte
-- Funktionen behalten Namen und Aufruf, die alte Oberflaeche laeuft weiter.
-- Mehrfach ausfuehrbar.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Vertriebsleitung sieht mit
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.darf_finanzierung_einsehen(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = _user_id
         AND ur.role::text IN ('admin', 'inhaber', 'backoffice', 'vertriebsleiter')
    )
  ), false)
$$;
COMMENT ON FUNCTION public.darf_finanzierung_einsehen(uuid) IS
  'Sieht Einreichungen, Zielbanken, Angebotsvergleich: admin, inhaber, backoffice, '
  'vertriebsleiter (Christian, 28.10.2026). Steuern (Zuschlag) bleibt bei darf_finanzierung_steuern.';
REVOKE ALL ON FUNCTION public.darf_finanzierung_einsehen(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.darf_finanzierung_einsehen(uuid) TO authenticated;

-- Christian, 28.10.2026: „Vertriebsleitung darf auch den Zuschlag geben.“
-- Damit auch Zurueckziehen, Einreichungen anlegen und aendern (alle Regeln
-- und finanzierung_zuschlag fragen diese Funktion). Wortlaut sonst wie
-- 20261027120000.
CREATE OR REPLACE FUNCTION public.darf_finanzierung_steuern(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = _user_id
         AND ur.role::text IN ('admin', 'inhaber', 'backoffice', 'vertriebsleiter')
    )
  ), false)
$$;
REVOKE ALL ON FUNCTION public.darf_finanzierung_steuern(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.darf_finanzierung_steuern(uuid) TO authenticated;

DROP POLICY IF EXISTS "Einreichungen lesen" ON public.finanzierung_einreichungen;
CREATE POLICY "Einreichungen lesen" ON public.finanzierung_einreichungen
  FOR SELECT TO authenticated
  USING ((select public.darf_finanzierung_einsehen(auth.uid())) OR finanzierer_id = auth.uid());

DROP POLICY IF EXISTS "Nachrichten lesen" ON public.finanzierung_nachrichten;
CREATE POLICY "Nachrichten lesen" ON public.finanzierung_nachrichten
  FOR SELECT TO authenticated
  USING (
    (select public.darf_finanzierung_einsehen(auth.uid()))
    OR EXISTS (SELECT 1 FROM public.finanzierung_einreichungen e
                WHERE e.id = einreichung_id AND e.finanzierer_id = auth.uid())
  );

DROP POLICY IF EXISTS "Zugriffe lesen" ON public.finanzierung_zugriffe;
CREATE POLICY "Zugriffe lesen" ON public.finanzierung_zugriffe
  FOR SELECT TO authenticated
  USING ((select public.darf_finanzierung_einsehen(auth.uid())));


-- ---------------------------------------------------------------------------
-- 2) Verlauf der Angebote aus der Finanzierung
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.finanzierung_angebote_verlauf (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id uuid NOT NULL REFERENCES public.investments(id) ON DELETE CASCADE,
  angebot jsonb NOT NULL,
  -- Die Einreichung, deren Zuschlag das Angebot aus der Finanzierung nahm.
  einreichung_id uuid REFERENCES public.finanzierung_einreichungen(id) ON DELETE SET NULL,
  archiviert_von uuid,
  archiviert_am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finanzierung_angebote_verlauf_investment
  ON public.finanzierung_angebote_verlauf (investment_id, archiviert_am);
COMMENT ON TABLE public.finanzierung_angebote_verlauf IS
  'Angebote, die beim Zuschlag aus finanzierungen.angebote genommen wurden. '
  'Nicht geloescht, nur aus der Karte in den Verlauf. Sichtbar fuer dieselben '
  'Personen wie die Finanzierung, nie fuer den Finanzierer (Christian, 28.10.2026).';

ALTER TABLE public.finanzierung_angebote_verlauf ENABLE ROW LEVEL SECURITY;

-- Lesen wie „Interne sehen Finanzierungen“ (20260916191000). Der
-- Finanzierer faellt dort heraus, weil darf_alle_kunden_sehen ihn seit
-- 20261027120000 nicht mehr enthaelt; die Regel „Finanzierer mit Zuschlag
-- sehen Finanzierung“ gibt es hier bewusst nicht.
DROP POLICY IF EXISTS "Angebotsverlauf lesen" ON public.finanzierung_angebote_verlauf;
CREATE POLICY "Angebotsverlauf lesen" ON public.finanzierung_angebote_verlauf
  FOR SELECT TO authenticated
  USING (
    (select public.is_internal_role(auth.uid()))
    AND (
      (select public.darf_alle_kunden_sehen(auth.uid()))
      OR public.ist_eigene_finanzierung(auth.uid(), investment_id::text)
    )
  );
-- Schreiben nur ueber finanzierung_zuschlag (SECURITY DEFINER), keine Regel.

-- Wortlaut wie 20261027120000, neu ist nur das Kopieren in den Verlauf.
-- Kopiert wird nur, wenn das Gewinnerangebot Werte hat: Nur dann ersetzt die
-- Oberflaeche die Angebote der Finanzierung (inFinanzierungUebernehmen).
CREATE OR REPLACE FUNCTION public.finanzierung_zuschlag(_einreichung_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_investment uuid;
  v_angebot jsonb;
BEGIN
  IF NOT public.darf_finanzierung_steuern(auth.uid()) THEN
    RAISE EXCEPTION 'Keine Berechtigung' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT investment_id, angebot INTO v_investment, v_angebot FROM public.finanzierung_einreichungen
   -- Nicht nur 'angebot': uebernommene Altfaelle stehen auf 'in_pruefung',
   -- obwohl ihr Angebot laengst in der Finanzierung liegt.
   WHERE id = _einreichung_id AND status IN ('eingereicht', 'in_pruefung', 'rueckfrage', 'angebot') FOR UPDATE;
  IF v_investment IS NULL THEN
    RAISE EXCEPTION 'Diese Einreichung laeuft nicht mehr.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.finanzierung_einreichungen
              WHERE investment_id = v_investment AND status = 'zuschlag') THEN
    RAISE EXCEPTION 'Fuer diesen Kauf gibt es schon einen Zuschlag.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_angebot IS NOT NULL AND jsonb_typeof(v_angebot) = 'object' THEN
    INSERT INTO public.finanzierung_angebote_verlauf (investment_id, angebot, einreichung_id, archiviert_von)
    SELECT v_investment, a, _einreichung_id, auth.uid()
      FROM public.finanzierungen f
     CROSS JOIN LATERAL jsonb_array_elements(
       CASE WHEN jsonb_typeof(f.angebote) = 'array' THEN f.angebote ELSE '[]'::jsonb END) a
     WHERE f.kunde_id = v_investment::text;
  END IF;

  UPDATE public.finanzierung_einreichungen SET status = 'zuschlag' WHERE id = _einreichung_id;
  UPDATE public.finanzierung_einreichungen SET status = 'abgesagt'
   WHERE investment_id = v_investment AND id <> _einreichung_id
     AND status IN ('eingereicht', 'in_pruefung', 'rueckfrage', 'angebot');
END;
$$;
REVOKE ALL ON FUNCTION public.finanzierung_zuschlag(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finanzierung_zuschlag(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3) Leitung in Chats mit einem Finanzierer, einmal je Chat
-- ---------------------------------------------------------------------------

ALTER TABLE public.chat_gruppen ADD COLUMN IF NOT EXISTS leitung_ergaenzt_am timestamptz;
COMMENT ON COLUMN public.chat_gruppen.leitung_ergaenzt_am IS
  'Wann die Leitung (admin, inhaber, vertriebsleiter, backoffice) eingetragen wurde, '
  'weil ein Finanzierer dazukam. Gesetzt heisst: nie wieder automatisch eintragen.';

CREATE OR REPLACE FUNCTION public.chat_finanzierer_leitung_ergaenzen()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_gruppe public.chat_gruppen%ROWTYPE;
BEGIN
  IF NOT public.has_role(NEW.benutzer_id, 'finanzierungspartner'::public.app_role) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_gruppe FROM public.chat_gruppen WHERE id = NEW.chat_id FOR UPDATE;
  IF NOT FOUND
     OR v_gruppe.leitung_ergaenzt_am IS NOT NULL
     OR coalesce(v_gruppe.typ, '') = 'kundenkommunikation'
     OR coalesce(v_gruppe.meta ->> 'typ', '') = 'kundenkommunikation'
     OR coalesce(v_gruppe.meta ->> 'kind', '') = 'tippgeber_vp' THEN
    RETURN NEW;
  END IF;

  -- Zuerst die Marke, dann eintragen: Ein zweiter Finanzierer im selben
  -- Chat oder ein spaeterer Wiedereintritt loest nichts mehr aus.
  UPDATE public.chat_gruppen SET leitung_ergaenzt_am = now() WHERE id = NEW.chat_id;

  INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, meta)
  SELECT NEW.chat_id, l.user_id,
         jsonb_build_object('name', l.name, 'initials', upper(left(l.name, 1)), 'role', l.rolle)
    FROM (
      SELECT DISTINCT ON (ur.user_id)
             ur.user_id,
             coalesce(nullif(btrim(p.name), ''), 'Nutzer') AS name,
             CASE ur.role::text
               WHEN 'inhaber' THEN 'Inhaber'
               WHEN 'admin' THEN 'Admin'
               WHEN 'vertriebsleiter' THEN 'Vertriebsleitung'
               ELSE 'Backoffice'
             END AS rolle
        FROM public.user_roles ur
        LEFT JOIN public.profiles p ON p.id = ur.user_id
       WHERE ur.role::text IN ('admin', 'inhaber', 'vertriebsleiter', 'backoffice')
       ORDER BY ur.user_id,
                array_position(ARRAY['inhaber', 'admin', 'vertriebsleiter', 'backoffice'], ur.role::text)
    ) l
   WHERE NOT EXISTS (SELECT 1 FROM public.chat_teilnehmer t
                      WHERE t.chat_id = NEW.chat_id AND t.benutzer_id = l.user_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Ein Fehler hier darf das Eintragen des Finanzierers nie verhindern.
  RAISE WARNING 'Leitung fuer Chat % nicht ergaenzt: %', NEW.chat_id, SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_finanzierer_leitung_ergaenzen() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_finanzierer_leitung_ergaenzen ON public.chat_teilnehmer;
CREATE TRIGGER trg_chat_finanzierer_leitung_ergaenzen
  AFTER INSERT ON public.chat_teilnehmer
  FOR EACH ROW EXECUTE FUNCTION public.chat_finanzierer_leitung_ergaenzen();

-- Wortlaut wie 20261016236000, neu: Nicht-Admins setzen die Marke
-- leitung_ergaenzt_am nicht zurueck (sonst kaeme die Leitung erneut).
CREATE OR REPLACE FUNCTION public.chat_gruppe_zuordnung_festhalten()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _fest jsonb;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon')
     OR auth.uid() IS NULL OR public.is_admin_role(auth.uid()) THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO _fest
    FROM jsonb_each(CASE WHEN jsonb_typeof(OLD.meta) = 'object' THEN OLD.meta ELSE '{}'::jsonb END) AS e
   WHERE e.key IN ('kundeId', 'kind', 'typ');

  NEW.id := OLD.id;
  NEW.typ := OLD.typ;
  NEW.erstellt_von := OLD.erstellt_von;
  NEW.erstellt_am := OLD.erstellt_am;
  NEW.leitung_ergaenzt_am := OLD.leitung_ergaenzt_am;
  NEW.meta := (CASE WHEN jsonb_typeof(NEW.meta) = 'object' THEN NEW.meta ELSE '{}'::jsonb END
               - 'kundeId' - 'kind' - 'typ') || _fest;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.chat_gruppe_zuordnung_festhalten() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4) Ein Chat je Kunde und Finanzierer
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.finanzierung_chats (
  kontakt_id uuid NOT NULL REFERENCES public.kontakte(id) ON DELETE CASCADE,
  finanzierer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id uuid NOT NULL UNIQUE REFERENCES public.chat_gruppen(id) ON DELETE CASCADE,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kontakt_id, finanzierer_id)
);
COMMENT ON TABLE public.finanzierung_chats IS
  'Welcher Chat gehoert zu Kunde und Finanzierer. Geschrieben nur von finanzierung_chat_oeffnen.';
-- Keine Regel fuer Angemeldete: Lesen und Schreiben nur ueber die Funktion.
ALTER TABLE public.finanzierung_chats ENABLE ROW LEVEL SECURITY;

-- Liefert den Chat zu Kunde und Finanzierer einer Einreichung, legt ihn an,
-- wenn es keinen gibt, und traegt den Aufrufer ein (auch wenn er frueher
-- ausgetreten ist: Er klickt bewusst). Andere werden nicht zurueckgeholt.
-- Aufrufen duerfen, wer die Einreichung sieht: die Leitung
-- (darf_finanzierung_einsehen) und der Finanzierer, solange sie laeuft oder
-- den Zuschlag hat.
CREATE OR REPLACE FUNCTION public.finanzierung_chat_oeffnen(_einreichung_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_finanzierer uuid;
  v_status text;
  v_kontakt uuid;
  v_kunde text;
  v_finanzierer_name text;
  v_ich text;
  v_chat uuid;
  v_neu boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet' USING ERRCODE = '42501';
  END IF;

  SELECT e.finanzierer_id, e.status, i.kunde_id
    INTO v_finanzierer, v_status, v_kontakt
    FROM public.finanzierung_einreichungen e
    JOIN public.investments i ON i.id = e.investment_id
   WHERE e.id = _einreichung_id;
  IF NOT FOUND OR v_kontakt IS NULL THEN
    RAISE EXCEPTION 'Diese Einreichung gibt es nicht' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.darf_finanzierung_einsehen(v_uid)
     AND NOT (v_finanzierer = v_uid AND v_status NOT IN ('abgelehnt', 'abgesagt', 'zurueckgezogen')) THEN
    RAISE EXCEPTION 'Keine Berechtigung' USING ERRCODE = '42501';
  END IF;

  -- Zwei gleichzeitige Klicks sollen nicht zwei Chats anlegen.
  PERFORM pg_advisory_xact_lock(hashtext('finanzierung_chat:' || v_kontakt || ':' || v_finanzierer));

  SELECT fc.chat_id INTO v_chat FROM public.finanzierung_chats fc
   WHERE fc.kontakt_id = v_kontakt AND fc.finanzierer_id = v_finanzierer;

  SELECT coalesce(nullif(btrim(p.name), ''), 'Nutzer') INTO v_ich FROM public.profiles p WHERE p.id = v_uid;
  v_ich := coalesce(v_ich, 'Nutzer');

  IF v_chat IS NULL THEN
    SELECT coalesce(nullif(btrim(concat_ws(' ', k.vorname, k.nachname)), ''), 'Kunde') INTO v_kunde
      FROM public.kontakte k WHERE k.id = v_kontakt;
    SELECT coalesce(nullif(btrim(p.name), ''), 'Finanzierer') INTO v_finanzierer_name
      FROM public.profiles p WHERE p.id = v_finanzierer;

    -- Kein meta.kundeId: Daran erkennt das CRM Kundenchats.
    INSERT INTO public.chat_gruppen (name, typ, erstellt_von, meta)
    VALUES ('Finanzierung: ' || coalesce(v_kunde, 'Kunde') || ' · ' || coalesce(v_finanzierer_name, 'Finanzierer'),
            'intern', v_uid,
            jsonb_build_object('kind', 'finanzierung', 'typ', 'intern', 'erstelltVon', v_ich,
                               'kontaktId', v_kontakt, 'finanziererId', v_finanzierer,
                               'angepinnt', false, 'ungelesen', false, 'stummgeschaltet', false, 'archiviert', false))
    RETURNING id INTO v_chat;
    INSERT INTO public.finanzierung_chats (kontakt_id, finanzierer_id, chat_id)
    VALUES (v_kontakt, v_finanzierer, v_chat);
    v_neu := true;
  END IF;

  -- Erst der Aufrufer, dann der Finanzierer: Dessen Eintrag loest die
  -- Leitung aus (chat_finanzierer_leitung_ergaenzen).
  IF NOT EXISTS (SELECT 1 FROM public.chat_teilnehmer t WHERE t.chat_id = v_chat AND t.benutzer_id = v_uid) THEN
    INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, meta)
    VALUES (v_chat, v_uid, jsonb_build_object('name', v_ich, 'initials', upper(left(v_ich, 1)),
            'role', CASE WHEN v_uid = v_finanzierer THEN 'Finanzierer' ELSE '' END));
  END IF;
  IF v_neu AND NOT EXISTS (SELECT 1 FROM public.chat_teilnehmer t WHERE t.chat_id = v_chat AND t.benutzer_id = v_finanzierer) THEN
    INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, meta)
    VALUES (v_chat, v_finanzierer, jsonb_build_object('name', v_finanzierer_name,
            'initials', upper(left(v_finanzierer_name, 1)), 'role', 'Finanzierer'));
  END IF;

  RETURN v_chat;
END;
$$;
REVOKE ALL ON FUNCTION public.finanzierung_chat_oeffnen(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finanzierung_chat_oeffnen(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 5) Seitenleiste: Chat fuer den Finanzierer
-- ---------------------------------------------------------------------------

INSERT INTO public.role_permissions (role, url)
VALUES ('finanzierungspartner', '/chat')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
