-- ===========================================================================
-- Rueckgabe an die Zentrale: eine Datenbankfunktion statt eines UPDATE
-- ===========================================================================
--
-- Meldung eines Vertriebspartners vom 28.09.2026: Er kann einen Lead in
-- "Alle Kontakte" nicht an die Zentrale zurueckgeben, es erscheint kurz etwas
-- Rotes.
--
-- Die Migration 20260928150000 hat das WITH CHECK der Regel "Vertriebspartner
-- bearbeiten eigene Kontakte" um `zustaendig_id IS NULL` erweitert. Das
-- reicht nicht. Postgres prueft bei einem UPDATE mit WHERE-Bedingung die NEUE
-- Zeile zusaetzlich gegen die Leseregeln (SELECT-Policies), und PostgREST
-- schickt jedes UPDATE mit `WHERE id = ...`. Die Leseregel des Partners
-- verlangt `is_vp_owner_of_kontakt`. Nach der Rueckgabe ist die
-- Zustaendigkeit leer, ein von der Zentrale zugeteilter Lead gehoert ihm dann
-- nicht mehr, und Postgres bricht ab: "new row violates row-level security
-- policy for table kontakte". Durch kommt nur, was er selbst angelegt oder
-- empfohlen hat (erstelltVonId, empfehlungsgeberVpId), also nicht der
-- Normalfall. Nachgestellt am 28.09.2026 mit genau diesen Regeln.
--
-- Die Leseregel zu erweitern waere falsch: Dann saehe jeder Partner den
-- offenen Pool. Deshalb eine Funktion, die genau diesen einen Schritt
-- erlaubt und selbst prueft, wer ihn gehen darf:
--
--   * der bisherige Zustaendige (zustaendig_id = auth.uid()); eine Vertretung
--     ist damit ausgeschlossen, sie ist nie selbst zustaendig,
--   * die Leitung (darf_leads_zuweisen), die ohnehin jeden Kontakt aendert.
--
-- Der Trigger kontakt_zustaendigkeit_schuetzen laeuft weiter mit, auth.uid()
-- bleibt in der Funktion der Aufrufer.
--
-- Die Oberflaeche ruft die Funktion auf und faellt auf das bisherige UPDATE
-- zurueck, solange sie fehlt. Mehrfach ausfuehrbar.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.lead_an_zentrale_zurueckgeben(
  _kontakt_id uuid,
  _berater_historie jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR _kontakt_id IS NULL THEN
    RETURN false;
  END IF;
  IF _berater_historie IS NOT NULL AND jsonb_typeof(_berater_historie) <> 'array' THEN
    RAISE EXCEPTION 'Die Verlaufsspur muss eine Liste sein.';
  END IF;

  UPDATE public.kontakte
     SET zustaendig_id = NULL,
         berater = '',
         meta = CASE
                  WHEN _berater_historie IS NULL THEN meta
                  ELSE jsonb_set(COALESCE(meta, '{}'::jsonb), '{beraterHistorie}', _berater_historie)
                END
   WHERE id = _kontakt_id
     AND (zustaendig_id = v_uid OR public.darf_leads_zuweisen(v_uid))
     AND (zustaendig_id IS NOT NULL OR COALESCE(berater, '') <> '')
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.lead_an_zentrale_zurueckgeben(uuid, jsonb) IS
  'Gibt einen Lead in den offenen Pool zurueck (zustaendig_id NULL, berater '
  'leer, Verlaufsspur). Nur der bisherige Zustaendige oder die Leitung. Noetig, '
  'weil ein UPDATE des Partners an seiner eigenen Leseregel scheitert, sobald '
  'der Lead ihm nicht mehr gehoert (28.09.2026).';

REVOKE ALL ON FUNCTION public.lead_an_zentrale_zurueckgeben(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lead_an_zentrale_zurueckgeben(uuid, jsonb) TO authenticated;


-- ---------------------------------------------------------------------------
-- Nachsehen
-- ---------------------------------------------------------------------------
--
--     select prosecdef from pg_proc where proname = 'lead_an_zentrale_zurueckgeben';
--
-- Gegenprobe im Betrieb, als Vertriebspartner in "Alle Kontakte":
--   * eigenen, von der Zentrale zugeteilten Lead zurueckgeben -> geht, der
--     Lead steht in der Lead-Verwaltung als Rueckläufer.
--   * Lead eines Kollegen, den er nur als Ersteller oder Vertretung sieht
--     -> wird uebersprungen, die Funktion aendert nichts.
