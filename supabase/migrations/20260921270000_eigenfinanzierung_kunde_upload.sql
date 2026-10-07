-- Eigenfinanzierung: der Kunde laedt seine Unterlagen selbst hoch.
--
-- AUSGANGSLAGE
--
-- Steht am Investment der Vermerk "Kunde finanziert selbst", soll der Kunde in
-- seinem Portal sein Finanzierungsangebot und seine Darlehensvertraege selbst
-- ablegen. Bisher ging das nicht, und zwar still: Der Zustand liegt in
-- investments.meta.eigenfinanzierung, geschrieben wird ueber
-- public.merge_investment_meta, und diese Funktion laesst fuer nicht interne
-- Rollen nur die Schluessel marktwertHistorie und steuerCockpit durch
-- (Migration 20260916192000). Alles andere wird verworfen, ohne Fehler. Die
-- Datei landete also im Speicher, der Vermerk am Investment nie. Nach dem
-- naechsten Laden war der Upload weg.
--
-- WARUM NICHT EINFACH DEN SCHLUESSEL FREIGEBEN
--
-- "eigenfinanzierung" auf die Positivliste von merge_investment_meta zu setzen
-- waere der kurze Weg und ein Sicherheitsloch: Der Kunde koennte dann das ganze
-- Objekt ersetzen, also auch aktiv und vpBestaetigt setzen und sich seine
-- eigene Finanzierung freigeben. Deshalb diese enge Funktion, die genau drei
-- Dinge kann und alles andere unangetastet laesst.
--
-- WAS DIESE MIGRATION ANLEGT
--
-- 1. public.eigenfinanzierung_kunde_unterlage(uuid, text, jsonb)
--    Legt das Finanzierungsangebot ab, haengt einen Darlehensvertrag an oder
--    entfernt einen. Nur diese drei Felder werden veraendert:
--    kundenAngebot, kundenDarlehensvertraege, kundenDarlehensvertrag.
--    aktiv, vpBestaetigt, aktiviertVon..., deaktiviert... bleiben unberuehrt.
-- 2. Eine Storage-DELETE-Regel, damit der Kunde seine Datei unter
--    finanzierung/eigen/<kontaktId>/... auch wirklich aus dem Bucket
--    entfernen kann. Die Regel von 20260901121000 deckt nur den eigenen
--    Kontaktordner <kontaktId>/... ab, nicht diesen Pfad.
--
-- SOLANGE SIE NICHT GELAUFEN IST
--
-- Die Oberflaeche stuerzt nicht ab. Der Kunde sieht im Portal unter
-- Finanzierung einen ruhigen Hinweis, dass das Hochladen noch nicht
-- freigeschaltet ist, statt eines Knopfes, der nichts tut. Der
-- Vertriebspartner laedt im Kundenprofil weiter wie bisher hoch: Der Code
-- faellt bei fehlender Funktion auf den bisherigen Weg ueber
-- merge_investment_meta zurueck, und der funktioniert fuer interne Rollen.
--
-- OB SIE GELAUFEN IST
--
--   select to_regprocedure('public.eigenfinanzierung_kunde_unterlage(uuid, text, jsonb)')
--            is not null as funktion_da,
--          exists (select 1 from pg_policies
--                   where policyname = 'Kunde loescht eigenfinanzierung unterlagen')
--            as regel_da;

CREATE OR REPLACE FUNCTION public.eigenfinanzierung_kunde_unterlage(
  _investment_id uuid,
  _aktion text,
  _datei jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_row public.investments%ROWTYPE;
  kontakt_row public.kontakte%ROWTYPE;
  _ist_intern boolean;
  _ef jsonb;
  _vertraege jsonb;
  _eintrag jsonb;
  _pfad text;
  _praefix text;
  _name text;
  _rolle text;
  _rest jsonb;
  _letzter jsonb;
  _meta jsonb;
  _urls jsonb;
  _status jsonb;
  _gefunden boolean := false;
  _v jsonb;
BEGIN
  IF _aktion NOT IN ('angebot', 'vertrag_hinzufuegen', 'vertrag_entfernen') THEN
    RAISE EXCEPTION 'Unbekannte Aktion';
  END IF;

  SELECT * INTO inv_row FROM public.investments WHERE id = _investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found';
  END IF;

  -- kunde_id ist seit dem 17.05.2026 eine uuid. Ein ::text daneben laesst die
  -- ganze Funktion mit SQLSTATE 42883 abbrechen, siehe die Lehre aus
  -- 20260921240000. Deshalb uuid gegen uuid.
  SELECT * INTO kontakt_row FROM public.kontakte WHERE id = inv_row.kunde_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontakt not found';
  END IF;

  _ist_intern := public.is_internal_role(auth.uid());

  -- Person 2 eines Doppelprofils wird wie beim Login-Mapping mitgeprueft.
  IF NOT (
    _ist_intern
    OR (kontakt_row.meta ->> 'authUserId') = auth.uid()::text
    OR ((kontakt_row.meta -> 'person2') ->> 'authUserId') = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  _meta := COALESCE(inv_row.meta, '{}'::jsonb);
  _ef := COALESCE(_meta -> 'eigenfinanzierung', '{}'::jsonb);

  -- Ohne den Schalter "Kunde finanziert selbst" darf hier niemand etwas
  -- ablegen, auch kein interner Nutzer.
  IF COALESCE((_ef ->> 'aktiv')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Eigenfinanzierung nicht aktiv';
  END IF;

  _vertraege := COALESCE(_ef -> 'kundenDarlehensvertraege', '[]'::jsonb);
  IF jsonb_typeof(_vertraege) <> 'array' THEN
    _vertraege := '[]'::jsonb;
  END IF;

  -- Altbestand: Wer nur das fruehere Einzelfeld hat, bekommt es beim ersten
  -- Schreiben in die Liste uebernommen, damit es nicht verloren geht.
  IF _ef ? 'kundenDarlehensvertrag' AND jsonb_typeof(_ef -> 'kundenDarlehensvertrag') = 'object' THEN
    _gefunden := false;
    FOR _v IN SELECT * FROM jsonb_array_elements(_vertraege) LOOP
      IF (_v ->> 'storagePath') = (_ef -> 'kundenDarlehensvertrag' ->> 'storagePath') THEN
        _gefunden := true;
      END IF;
    END LOOP;
    IF NOT _gefunden THEN
      _vertraege := _vertraege || jsonb_build_array(_ef -> 'kundenDarlehensvertrag');
    END IF;
  END IF;

  _pfad := NULLIF(trim(COALESCE(_datei ->> 'storagePath', '')), '');
  IF _pfad IS NULL THEN
    RAISE EXCEPTION 'Kein Speicherpfad angegeben';
  END IF;

  -- Der Pfad muss zu diesem Kunden und diesem Investment gehoeren. Sonst
  -- liesse sich ein Eintrag auf eine fremde Datei zeigen.
  _praefix := 'finanzierung/eigen/' || kontakt_row.id::text || '/' || _investment_id::text || '/';
  IF _aktion <> 'vertrag_entfernen' AND left(_pfad, length(_praefix)) <> _praefix THEN
    RAISE EXCEPTION 'Speicherpfad gehoert nicht zu diesem Vorgang';
  END IF;

  IF _aktion = 'vertrag_entfernen' THEN
    -- Entfernt wird nur, was an diesem Investment auch wirklich steht.
    _rest := '[]'::jsonb;
    _gefunden := false;
    FOR _v IN SELECT * FROM jsonb_array_elements(_vertraege) LOOP
      IF (_v ->> 'storagePath') = _pfad THEN
        _gefunden := true;
      ELSE
        _rest := _rest || jsonb_build_array(_v);
      END IF;
    END LOOP;
    IF NOT _gefunden THEN
      RAISE EXCEPTION 'Darlehensvertrag nicht gefunden';
    END IF;

    _ef := jsonb_set(_ef, '{kundenDarlehensvertraege}', _rest, true);
    IF jsonb_array_length(_rest) > 0 THEN
      _letzter := _rest -> (jsonb_array_length(_rest) - 1);
      _ef := jsonb_set(_ef, '{kundenDarlehensvertrag}', _letzter, true);
    ELSE
      _letzter := NULL;
      _ef := _ef - 'kundenDarlehensvertrag';
    END IF;

    -- Spiegel im Kundenordner nur nachziehen, wenn er genau auf die entfernte
    -- Datei zeigt. Zeigt er woandershin, stammt er aus der regulaeren
    -- Finanzierung, und die darf ein Loeschen hier nicht abraeumen.
    _urls := COALESCE(_meta -> 'docFileUrls', '{}'::jsonb);
    _status := COALESCE(_meta -> 'docStatuses', '{}'::jsonb);
    IF (_urls ->> 'Darlehensvertrag') = _pfad THEN
      IF _letzter IS NOT NULL THEN
        _urls := jsonb_set(_urls, '{Darlehensvertrag}', to_jsonb(_letzter ->> 'storagePath'), true);
      ELSE
        _urls := _urls - 'Darlehensvertrag';
        _status := _status - 'Darlehensvertrag';
      END IF;
      _meta := jsonb_set(_meta, '{docFileUrls}', _urls, true);
      _meta := jsonb_set(_meta, '{docStatuses}', _status, true);
    END IF;

  ELSE
    -- Der Eintrag wird hier neu gebaut, nicht uebernommen. Was der Aufrufer
    -- sonst noch mitschickt, faellt damit weg.
    IF _ist_intern THEN
      _name := NULLIF(trim(COALESCE(_datei ->> 'uploadedByName', '')), '');
      _rolle := NULLIF(trim(COALESCE(_datei ->> 'uploadedByRole', '')), '');
    ELSE
      -- Der Kunde bestimmt seinen eigenen Namen nicht, der steht im Kontakt.
      _name := trim(COALESCE(kontakt_row.vorname, '') || ' ' || COALESCE(kontakt_row.nachname, ''));
      _rolle := 'kunde';
    END IF;

    _eintrag := jsonb_build_object(
      'fileName', COALESCE(NULLIF(trim(COALESCE(_datei ->> 'fileName', '')), ''), 'Dokument'),
      'storagePath', _pfad,
      'uploadedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'uploadedByName', COALESCE(_name, 'Unbekannt'),
      'uploadedByRole', COALESCE(_rolle, 'kunde')
    );

    IF _aktion = 'angebot' THEN
      -- Am Ende gibt es genau ein Finanzierungsangebot. Die Regel steht hier
      -- und nicht nur in der Oberflaeche: Was im Browser laeuft, laesst sich
      -- umgehen.
      IF _ef ? 'kundenAngebot' AND jsonb_typeof(_ef -> 'kundenAngebot') = 'object' THEN
        RAISE EXCEPTION 'Finanzierungsangebot liegt bereits vor';
      END IF;
      _ef := jsonb_set(_ef, '{kundenAngebot}', _eintrag, true);
    ELSE
      _vertraege := _vertraege || jsonb_build_array(_eintrag);
      _ef := jsonb_set(_ef, '{kundenDarlehensvertraege}', _vertraege, true);
      -- Das Einzelfeld fuehrt weiterhin den zuletzt hochgeladenen Vertrag.
      _ef := jsonb_set(_ef, '{kundenDarlehensvertrag}', _eintrag, true);

      -- Spiegel in den Kundenordner. Der hat fuer den Darlehensvertrag genau
      -- einen Platz, gespiegelt wird der zuletzt hochgeladene. "signed" heisst
      -- hier: fertig, keine Freigabe noetig.
      _urls := jsonb_set(COALESCE(_meta -> 'docFileUrls', '{}'::jsonb), '{Darlehensvertrag}', to_jsonb(_pfad), true);
      _status := jsonb_set(COALESCE(_meta -> 'docStatuses', '{}'::jsonb), '{Darlehensvertrag}', to_jsonb('signed'::text), true);
      _meta := jsonb_set(_meta, '{docFileUrls}', _urls, true);
      _meta := jsonb_set(_meta, '{docStatuses}', _status, true);
    END IF;

    -- Zeitmarken wie im Store: der erste Zeitpunkt gewinnt, damit die
    -- Auswertung im Dashboard nicht zurueckgesetzt wird.
    IF _aktion = 'angebot' AND COALESCE(_meta ->> 'finanzierungAngebotGesendetAm', '') = '' THEN
      _meta := jsonb_set(_meta, '{finanzierungAngebotGesendetAm}', to_jsonb(_eintrag ->> 'uploadedAt'), true);
    END IF;
    IF _aktion = 'vertrag_hinzufuegen' AND COALESCE(_meta ->> 'darlehensvertragUploadedAm', '') = '' THEN
      _meta := jsonb_set(_meta, '{darlehensvertragUploadedAm}', to_jsonb(_eintrag ->> 'uploadedAt'), true);
    END IF;
  END IF;

  _meta := jsonb_set(_meta, '{eigenfinanzierung}', _ef, true);
  UPDATE public.investments SET meta = _meta WHERE id = _investment_id;

  RETURN _ef;
END;
$$;

COMMENT ON FUNCTION public.eigenfinanzierung_kunde_unterlage(uuid, text, jsonb) IS
  'Eigenfinanzierung: Finanzierungsangebot ablegen (genau eines), Darlehensvertrag anhaengen oder entfernen. Aendert nur kundenAngebot, kundenDarlehensvertraege und kundenDarlehensvertrag, niemals aktiv oder vpBestaetigt.';

REVOKE ALL ON FUNCTION public.eigenfinanzierung_kunde_unterlage(uuid, text, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.eigenfinanzierung_kunde_unterlage(uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.eigenfinanzierung_kunde_unterlage(uuid, text, jsonb) TO authenticated;

-- Loeschen der eigenen Datei im Bucket. Ohne diese Regel scheitert
-- storage.remove fuer den Kunden still, und die Datei bleibt verwaist liegen.
-- Muster der INSERT-Regel "Kunde upload unterlagen" aus 20260818130000.
DROP POLICY IF EXISTS "Kunde loescht eigenfinanzierung unterlagen" ON storage.objects;
CREATE POLICY "Kunde loescht eigenfinanzierung unterlagen"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'unterlagen'
  AND (storage.foldername(name))[1] = 'finanzierung'
  AND (storage.foldername(name))[2] = 'eigen'
  AND EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE (
      (k.meta ->> 'authUserId') = auth.uid()::text
      OR ((k.meta -> 'person2') ->> 'authUserId') = auth.uid()::text
    )
    AND (storage.foldername(name))[3] = k.id::text
  )
);
