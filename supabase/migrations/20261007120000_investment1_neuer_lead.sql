-- Jeder neue Kontakt bekommt "Investment 1" in der Stufe "Neuer Lead".
--
-- Der Trigger aus 20260622163050 legte das erste Investment in der Altstufe
-- 'erstgespraech' an. Die Oberflaeche liest die Stufe des Investments
-- (kontaktPipeline.getBucketEntriesForKunde) und sortierte neue Leads dadurch
-- in den Bereich "Kontakte" statt in die Leadverwaltung. Vorgabe vom
-- 07.10.2026: Investment 1 startet immer bei "neuer_lead".
--
-- Bestandskunden ('bestandsimport') bleiben wie bisher ohne Auto-Investment,
-- sonst stuenden sie als neue Leads in der Pipeline.

CREATE OR REPLACE FUNCTION public.auto_create_investment_for_kontakt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.meta->>'pipelineStufe', '') = 'bestandsimport' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.investments WHERE kunde_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.investments (kunde_id, meta)
  VALUES (
    NEW.id,
    jsonb_build_object('nummer', 1, 'label', 'Investment 1', 'pipelineStufe', 'neuer_lead')
  );

  RETURN NEW;
END;
$$;

-- Sicherung vor der Datenkorrektur: die Zeilen, die Altbestand 1 aendert,
-- im Originalzustand. Zuruecksetzen bei Bedarf:
--   UPDATE public.investments i SET meta = s.meta
--   FROM public.investments_sicherung_20261007 s WHERE s.id = i.id;
-- Die von Altbestand 2 neu angelegten Investments tragen in meta den Marker
-- 'nachgelegt_am' und lassen sich darueber wieder finden.
-- RLS an und keine Policy: Die Tabelle ist ueber die API nicht lesbar.
CREATE TABLE IF NOT EXISTS public.investments_sicherung_20261007 AS
SELECT i.*
FROM public.investments i
JOIN public.kontakte k ON k.id = i.kunde_id
WHERE i.meta->>'pipelineStufe' = 'erstgespraech'
  AND i.meta->>'label' = 'Investment 1'
  AND COALESCE(NULLIF(i.objekt, ''), NULLIF(i.wohnung, '')) IS NULL
  AND COALESCE(i.kaufpreis, 0) = 0
  AND COALESCE(k.meta->>'pipelineStufe', 'neuer_lead') = 'neuer_lead';
ALTER TABLE public.investments_sicherung_20261007 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.investments_sicherung_20261007 FROM anon, authenticated;

-- Altbestand 1: leere Trigger-Investments in 'erstgespraech' bei Kontakten,
-- die selbst noch neuer Lead sind. Nur leere Investments (kein Objekt, keine
-- Wohnung, kein Kaufpreis), damit nichts Bearbeitetes zurueckfaellt.
UPDATE public.investments i
SET meta = jsonb_set(i.meta, '{pipelineStufe}', '"neuer_lead"')
FROM public.kontakte k
WHERE k.id = i.kunde_id
  AND i.meta->>'pipelineStufe' = 'erstgespraech'
  AND i.meta->>'label' = 'Investment 1'
  AND COALESCE(NULLIF(i.objekt, ''), NULLIF(i.wohnung, '')) IS NULL
  AND COALESCE(i.kaufpreis, 0) = 0
  AND COALESCE(k.meta->>'pipelineStufe', 'neuer_lead') = 'neuer_lead';

-- Altbestand 2: neue Leads ganz ohne Investment bekommen Investment 1.
-- Kontakte in spaeteren Stufen bleiben unberuehrt.
INSERT INTO public.investments (kunde_id, meta)
SELECT k.id, jsonb_build_object(
  'nummer', 1, 'label', 'Investment 1', 'pipelineStufe', 'neuer_lead',
  'nachgelegt_am', '2026-10-07'
)
FROM public.kontakte k
WHERE COALESCE(k.meta->>'pipelineStufe', 'neuer_lead') = 'neuer_lead'
  AND NOT EXISTS (SELECT 1 FROM public.investments i WHERE i.kunde_id = k.id);
