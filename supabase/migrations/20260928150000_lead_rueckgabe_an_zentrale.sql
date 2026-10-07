-- ===========================================================================
-- Leads an die Zentrale zurueckgeben, claim_lead auf die Lead-Verwaltung
-- begrenzen
-- ===========================================================================
--
-- Zwei Teile, beide vom 28.09.2026:
--
--   1) Vertriebspartner duerfen ihren Lead in den offenen Pool zurueckgeben.
--   2) claim_lead nur noch fuer die Rollen, die die Lead-Verwaltung nutzen.
--
-- Eine Sperre nach Stufe oder Investment ist bewusst NICHT enthalten
-- (Christians Entscheidung vom 28.09.2026, Variante A): Jeder gibt eigene
-- Kontakte jederzeit zurueck. Ab Reservierung warnt die Oberflaeche vorab,
-- und Admin, Inhaber und Backoffice bekommen eine Glocke.
--
-- Der Vertriebsleiter bekommt in "Alle Kontakte" ebenfalls "An die Zentrale
-- zurückgeben". Dafuer aendert sich hier nichts: Die Regel "Admin und interne
-- Rollen bearbeiten Kontakte" (20260916190000) laesst ihn jede
-- Zustaendigkeit aendern, auch auf NULL, und der Trigger behandelt Pool und
-- Zuweisung fuer ihn gleich. Seine Rechte wachsen nicht.
--
-- Wiederholbar: ein zweiter Lauf aendert nichts.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Das WITH CHECK fuer den Weg zurueck in den Pool
-- ---------------------------------------------------------------------------
--
-- Seit dem 21.09.2026 gibt ein Vertriebspartner Leads an die Zentrale
-- zurueck: `zustaendig_id` auf NULL. Das WITH CHECK der Regel
-- "Vertriebspartner bearbeiten eigene Kontakte" (20260918130000) liess aber
-- nur zwei Faelle durch: Der Partner "besitzt" die Zeile auch danach noch
-- (`is_vp_owner_of_kontakt`), oder die Zustaendigkeit zeigt auf jemand
-- anderen. Nach der Rueckgabe ist sie NULL. Ein selbst angelegter Lead kam
-- durch (erstelltVonId), ein von der Zentrale zugeteilter, der Normalfall,
-- nicht: "new row violates row-level security policy".
--
-- Neu ist der dritte Fall `zustaendig_id IS NULL`. Das USING bleibt Wort fuer
-- Wort, WELCHE Zeilen ein Partner anfassen darf, aendert sich nicht. OB er
-- die Zustaendigkeit aufgeben darf, entscheidet der Trigger unten, der ALT
-- und NEU vergleicht (20260918140000, hier unveraendert): nur der bisherige
-- Zustaendige, keine Vertretung.
--
-- Eine Wartezeit fuer die Rueckgabe gibt es nicht. Die Wartezeit nach
-- "Nicht erreicht" (`meta.verstecktBis`) regelt nur das Anrufen.

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
      -- Neu seit 28.09.2026: zurueck an die Zentrale. Wer das darf, prueft
      -- der Trigger kontakt_zustaendigkeit_schuetzen.
      OR zustaendig_id IS NULL
    )
  );


-- ---------------------------------------------------------------------------
-- 2) claim_lead nur fuer die Lead-Verwaltung
-- ---------------------------------------------------------------------------
--
-- claim_lead (20260531170331) setzt einen Lead ohne Zustaendigen auf den
-- Aufrufer, als SECURITY DEFINER an der Zeilensicherheit vorbei. Erlaubt war
-- es jeder internen Rolle, also auch jedem Vertriebspartner, fuer jede
-- Kennung, die er kennt, etwa aus einer alten Adresszeile. Mit der Rueckgabe
-- landen kuenftig mehr Leads im Pool.
--
-- Einziger Aufrufer ist `leadZuweisenWennFrei` in src/lib/kundenStore.ts,
-- und nur, wenn jemand in der Lead-Verwaltung sich selbst waehlt. Die
-- Lead-Verwaltung sehen admin, inhaber und individuell (voller Zugang),
-- vertriebsleiter und setterin. Genau diese Rollen duerfen weiter
-- uebernehmen. Einen Ablauf, in dem ein Partner selbst aus dem Pool nimmt,
-- gibt es nicht: Er bekommt Leads zugeteilt. Bei mehreren Rollen reicht
-- eine berechtigte.
--
-- Signatur, Rueckgabe, Rechte und der Rest des Rumpfs bleiben wie bisher.

CREATE OR REPLACE FUNCTION public.claim_lead(_kontakt_id uuid, _via text DEFAULT 'manual')
RETURNS TABLE(success boolean, claimed_by uuid, claimed_by_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_updated uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- Seit dem 28.09.2026: nur die Rollen der Lead-Verwaltung, nicht mehr
  -- jede interne Rolle.
  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles ur
     WHERE ur.user_id = v_uid
       AND ur.role IN ('admin', 'inhaber', 'individuell', 'vertriebsleiter', 'setterin')
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  SELECT name INTO v_name FROM public.profiles WHERE id = v_uid;

  -- Atomar nur dann zuweisen, wenn noch unzugewiesen
  UPDATE public.kontakte
     SET zustaendig_id = v_uid,
         berater = COALESCE(NULLIF(berater, ''), v_name),
         meta = COALESCE(meta, '{}'::jsonb)
                || jsonb_build_object(
                     'offenerLead', false,
                     'claimedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                     'claimedBy', v_uid::text,
                     'claimedByName', v_name,
                     'claimedVia', COALESCE(_via, 'manual')
                   )
   WHERE id = _kontakt_id
     AND zustaendig_id IS NULL
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    -- Lead war schon übernommen – bestehende Zuweisung zurückgeben
    RETURN QUERY
    SELECT false, k.zustaendig_id, p.name
      FROM public.kontakte k
      LEFT JOIN public.profiles p ON p.id = k.zustaendig_id
     WHERE k.id = _kontakt_id;
    RETURN;
  END IF;

  -- Audit
  INSERT INTO public.audit_log (actor, action, entity, entity_id, meta)
  VALUES (v_uid, 'lead_claimed', 'kontakte', _kontakt_id::text,
          jsonb_build_object('via', COALESCE(_via, 'manual'), 'name', v_name));

  RETURN QUERY SELECT true, v_uid, v_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_lead(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.claim_lead(uuid, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- Nachsehen
-- ---------------------------------------------------------------------------
--
--     select with_check like '%zustaendig_id IS NULL%' as rueckgabe_offen
--       from pg_policies
--      where schemaname = 'public' and tablename = 'kontakte'
--        and policyname = 'Vertriebspartner bearbeiten eigene Kontakte';
--
--     select prosrc not like '%is_internal_role%' as claim_eng
--       from pg_proc where proname = 'claim_lead';
--
-- Gegenprobe im Betrieb:
--   * Als Vertriebspartner einen eigenen, zugeteilten Lead zurueckgeben
--     -> geht, der Lead steht in der Lead-Verwaltung als Rueckläufer.
--   * Lead, den er nur als Ersteller sieht, der aber einem Kollegen gehoert
--     -> "Du kannst nur Leads weitergeben, für die du selbst zuständig bist."
--   * claim_lead als Setterin oder Vertriebsleiter -> geht wie bisher.
--   * claim_lead als Vertriebspartner -> success = false.
