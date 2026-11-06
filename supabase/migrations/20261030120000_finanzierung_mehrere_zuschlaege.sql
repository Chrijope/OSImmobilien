-- ===========================================================================
-- Finanzierung: mehrere Zuschlaege, Chat immer mit Finanzierer und Leitung
-- (Christian, 30.10.2026)
-- ===========================================================================
--
-- WAS SIE TUT
--
--   1. `finanzierung_zuschlag` erlaubt einen weiteren Zuschlag fuer denselben
--      Kauf. Der erste Zuschlag sagt wie bisher alle anderen laufenden
--      Einreichungen ab und kopiert die bisherigen Angebote in den Verlauf.
--      Jeder weitere Zuschlag geht auch an eine so abgesagte Einreichung;
--      er sagt niemandem ab und kopiert nichts mehr in den Verlauf.
--   2. `finanzierung_chat_oeffnen` traegt bei jedem Oeffnen den Finanzierer
--      und die Leitung (inhaber, admin, vertriebsleiter, backoffice, nicht
--      gesperrt) ein, wenn sie fehlen. Vorher kam der Finanzierer nur beim
--      Anlegen dazu und die Leitung nur einmal je Chat.
--   3. Jeder Finanzierer sieht nur sein eigenes Angebot (Christian,
--      30.10.2026: „jeder Finanzierer soll nur sein eigenes hochgeladenes
--      Angebot einsehen koennen, alle anderen Nutzerrollen sehen alle“).
--      Jedes Angebot in `finanzierungen.angebote` traegt dazu `finanziererId`.
--      Der Finanzierer liest und schreibt die Tabelle nicht mehr direkt,
--      sondern ueber `finanzierer_finanzierungen` (nur eigene Angebote) und
--      `finanzierer_angebote_speichern` (nur eigene Angebote aendern). Seine
--      Dateien nur zu eigenen Angeboten (`finanzierer_darf_pfad`).
--
-- Ruecknahme: die Funktionen aus 20261027120000 und 20261028120000 erneut
-- einspielen und die beiden Finanzierer-Regeln auf `finanzierungen` wieder
-- anlegen.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.finanzierung_zuschlag(_einreichung_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_investment uuid;
  v_angebot jsonb;
  v_erster boolean;
BEGIN
  IF NOT public.darf_finanzierung_steuern(auth.uid()) THEN
    RAISE EXCEPTION 'Keine Berechtigung' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT investment_id, angebot INTO v_investment, v_angebot FROM public.finanzierung_einreichungen
   -- Nicht nur 'angebot': uebernommene Altfaelle stehen auf 'in_pruefung'.
   -- 'abgesagt': vom ersten Zuschlag abgesagt, jetzt weiterer Zuschlag.
   WHERE id = _einreichung_id AND status IN ('eingereicht', 'in_pruefung', 'rueckfrage', 'angebot', 'abgesagt') FOR UPDATE;
  IF v_investment IS NULL THEN
    RAISE EXCEPTION 'Diese Einreichung laeuft nicht mehr.' USING ERRCODE = 'check_violation';
  END IF;

  v_erster := NOT EXISTS (SELECT 1 FROM public.finanzierung_einreichungen
                           WHERE investment_id = v_investment AND status = 'zuschlag');

  -- Abgesagt ohne vorherigen Zuschlag heisst: von Hand abgesagt, kein Zuschlag.
  IF v_erster AND EXISTS (SELECT 1 FROM public.finanzierung_einreichungen
                           WHERE id = _einreichung_id AND status = 'abgesagt') THEN
    RAISE EXCEPTION 'Diese Einreichung laeuft nicht mehr.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_erster AND v_angebot IS NOT NULL AND jsonb_typeof(v_angebot) = 'object' THEN
    INSERT INTO public.finanzierung_angebote_verlauf (investment_id, angebot, einreichung_id, archiviert_von)
    SELECT v_investment, a, _einreichung_id, auth.uid()
      FROM public.finanzierungen f
     CROSS JOIN LATERAL jsonb_array_elements(
       CASE WHEN jsonb_typeof(f.angebote) = 'array' THEN f.angebote ELSE '[]'::jsonb END) a
     WHERE f.kunde_id = v_investment::text;
  END IF;

  UPDATE public.finanzierung_einreichungen SET status = 'zuschlag' WHERE id = _einreichung_id;
  IF v_erster THEN
    UPDATE public.finanzierung_einreichungen SET status = 'abgesagt'
     WHERE investment_id = v_investment AND id <> _einreichung_id
       AND status IN ('eingereicht', 'in_pruefung', 'rueckfrage', 'angebot');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.finanzierung_zuschlag(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finanzierung_zuschlag(uuid) TO authenticated;


-- Wortlaut wie 20261028120000; neu sind die beiden Eintraege am Ende.
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
  SELECT coalesce(nullif(btrim(p.name), ''), 'Finanzierer') INTO v_finanzierer_name
    FROM public.profiles p WHERE p.id = v_finanzierer;
  v_finanzierer_name := coalesce(v_finanzierer_name, 'Finanzierer');

  IF v_chat IS NULL THEN
    SELECT coalesce(nullif(btrim(concat_ws(' ', k.vorname, k.nachname)), ''), 'Kunde') INTO v_kunde
      FROM public.kontakte k WHERE k.id = v_kontakt;

    -- Kein meta.kundeId: Daran erkennt das CRM Kundenchats.
    INSERT INTO public.chat_gruppen (name, typ, erstellt_von, meta)
    VALUES ('Finanzierung: ' || coalesce(v_kunde, 'Kunde') || ' · ' || v_finanzierer_name,
            'intern', v_uid,
            jsonb_build_object('kind', 'finanzierung', 'typ', 'intern', 'erstelltVon', v_ich,
                               'kontaktId', v_kontakt, 'finanziererId', v_finanzierer,
                               'angepinnt', false, 'ungelesen', false, 'stummgeschaltet', false, 'archiviert', false))
    RETURNING id INTO v_chat;
    INSERT INTO public.finanzierung_chats (kontakt_id, finanzierer_id, chat_id)
    VALUES (v_kontakt, v_finanzierer, v_chat);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.chat_teilnehmer t WHERE t.chat_id = v_chat AND t.benutzer_id = v_uid) THEN
    INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, meta)
    VALUES (v_chat, v_uid, jsonb_build_object('name', v_ich, 'initials', upper(left(v_ich, 1)),
            'role', CASE WHEN v_uid = v_finanzierer THEN 'Finanzierer' ELSE '' END));
  END IF;

  -- Der Finanzierer ist immer dabei, wenn die Leitung den Chat oeffnet.
  IF NOT EXISTS (SELECT 1 FROM public.chat_teilnehmer t WHERE t.chat_id = v_chat AND t.benutzer_id = v_finanzierer) THEN
    INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, meta)
    VALUES (v_chat, v_finanzierer, jsonb_build_object('name', v_finanzierer_name,
            'initials', upper(left(v_finanzierer_name, 1)), 'role', 'Finanzierer'));
  END IF;

  -- Die Leitung ist immer dabei, wenn der Finanzierer den Chat oeffnet.
  INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, meta)
  SELECT v_chat, l.user_id,
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
         AND coalesce(p.gesperrt, false) = false
       ORDER BY ur.user_id,
                array_position(ARRAY['inhaber', 'admin', 'vertriebsleiter', 'backoffice'], ur.role::text)
    ) l
   WHERE NOT EXISTS (SELECT 1 FROM public.chat_teilnehmer t
                      WHERE t.chat_id = v_chat AND t.benutzer_id = l.user_id);

  RETURN v_chat;
END;
$$;
REVOKE ALL ON FUNCTION public.finanzierung_chat_oeffnen(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finanzierung_chat_oeffnen(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3) Jeder Finanzierer nur sein eigenes Angebot
-- ---------------------------------------------------------------------------

-- Bestand: Hat ein Kauf genau einen Zuschlag, gehoeren die unmarkierten
-- Angebote diesem Finanzierer. So sieht er nach der Umstellung, was er vorher sah.
UPDATE public.finanzierungen f
   SET angebote = (
     SELECT jsonb_agg(CASE WHEN a ? 'finanziererId' THEN a
                           ELSE a || jsonb_build_object('finanziererId', z.finanzierer_id) END
                      ORDER BY o)
       FROM jsonb_array_elements(f.angebote) WITH ORDINALITY AS t(a, o))
  FROM (SELECT investment_id, min(finanzierer_id::text) AS finanzierer_id
          FROM public.finanzierung_einreichungen
         WHERE status = 'zuschlag'
         GROUP BY investment_id
        HAVING count(*) = 1) z
 WHERE f.kunde_id = z.investment_id::text
   AND jsonb_typeof(f.angebote) = 'array'
   AND jsonb_array_length(f.angebote) > 0;

-- Die ganze Zeile traegt alle Angebote; eine Zeilenregel kann sie nicht
-- teilen. Deshalb kein direkter Zugriff mehr fuer den Finanzierer.
DROP POLICY IF EXISTS "Finanzierer mit Zuschlag sehen Finanzierung" ON public.finanzierungen;
DROP POLICY IF EXISTS "Finanzierer mit Zuschlag bearbeiten Finanzierung" ON public.finanzierungen;

-- Die Finanzierungen mit Zuschlag, darin nur die eigenen Angebote.
CREATE OR REPLACE FUNCTION public.finanzierer_finanzierungen()
RETURNS SETOF public.finanzierungen
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_populate_record(f, jsonb_build_object('angebote', coalesce((
           SELECT jsonb_agg(a ORDER BY o)
             FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(f.angebote) = 'array' THEN f.angebote ELSE '[]'::jsonb END)
                  WITH ORDINALITY AS t(a, o)
            WHERE a ->> 'finanziererId' = auth.uid()::text), '[]'::jsonb)))
    FROM public.finanzierungen f
   WHERE public.has_role(auth.uid(), 'finanzierungspartner'::public.app_role)
     AND public.finanzierer_hat_zuschlag(auth.uid(), f.kunde_id)
$$;
REVOKE ALL ON FUNCTION public.finanzierer_finanzierungen() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finanzierer_finanzierungen() TO authenticated;

-- Der Finanzierer aendert nur Angebote, die ihm gehoeren (Grundschuld,
-- Darlehensvertrag). Fremde Angebote bleiben, wie sie sind; anlegen und
-- entfernen bleibt bei der Leitung.
CREATE OR REPLACE FUNCTION public.finanzierer_angebote_speichern(_investment_id text, _angebote jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_alt jsonb;
BEGIN
  IF v_uid IS NULL
     OR NOT public.has_role(v_uid, 'finanzierungspartner'::public.app_role)
     OR NOT public.finanzierer_hat_zuschlag(v_uid, _investment_id) THEN
    RAISE EXCEPTION 'Keine Berechtigung' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_angebote) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Angebote fehlen' USING ERRCODE = '22023';
  END IF;

  SELECT angebote INTO v_alt FROM public.finanzierungen WHERE kunde_id = _investment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Keine Finanzierung zu diesem Kauf' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.finanzierungen
     SET aktualisiert_am = now(),
         angebote = (
           SELECT coalesce(jsonb_agg(
                    CASE WHEN alt ->> 'finanziererId' = v_uid::text
                         THEN coalesce((SELECT neu || jsonb_build_object('finanziererId', v_uid::text)
                                          FROM jsonb_array_elements(_angebote) AS n(neu)
                                         WHERE neu ->> 'id' = alt ->> 'id'
                                         LIMIT 1), alt)
                         ELSE alt END
                    ORDER BY o), '[]'::jsonb)
             FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(v_alt) = 'array' THEN v_alt ELSE '[]'::jsonb END)
                  WITH ORDINALITY AS t(alt, o))
   WHERE kunde_id = _investment_id;
END;
$$;
REVOKE ALL ON FUNCTION public.finanzierer_angebote_speichern(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finanzierer_angebote_speichern(text, jsonb) TO authenticated;

-- Wortlaut wie 20261027120000; neu ist nur `finanziererId` beim Angebotsordner.
CREATE OR REPLACE FUNCTION public.finanzierer_darf_pfad(_user_id uuid, _name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  teile text[] := storage.foldername(_name);
  uuid_muster constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  kontakt uuid;
BEGIN
  IF NOT public.has_role(_user_id, 'finanzierungspartner'::public.app_role) THEN
    RETURN false;
  END IF;

  IF teile[1] = 'finanzierung' AND teile[2] IS DISTINCT FROM 'eigen' THEN
    IF coalesce(teile[2], '') !~* uuid_muster THEN
      RETURN false;
    END IF;
    IF coalesce(teile[3], '') LIKE 'einreichung-%' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.finanzierung_einreichungen e
         WHERE e.id::text = substr(teile[3], 13)
           AND e.investment_id = teile[2]::uuid
           AND e.finanzierer_id = _user_id
           AND e.status NOT IN ('abgelehnt', 'abgesagt', 'zurueckgezogen')
      );
    END IF;
    RETURN public.finanzierer_hat_zuschlag(_user_id, teile[2])
       AND EXISTS (
         SELECT 1 FROM public.finanzierungen f
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(f.angebote) = 'array' THEN f.angebote ELSE '[]'::jsonb END) a
          WHERE f.kunde_id = teile[2] AND a ->> 'id' = teile[3]
            AND a ->> 'finanziererId' = _user_id::text
       );
  END IF;

  kontakt := public.unterlagen_lese_kontakt(_name);
  RETURN kontakt IS NOT NULL AND public.finanzierer_sieht_kontakt(_user_id, kontakt);
END;
$$;
REVOKE ALL ON FUNCTION public.finanzierer_darf_pfad(uuid, text) FROM public, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
