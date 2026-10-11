-- Investment 1 startet in der Stufe, mit der der Kontakt angelegt wird.
--
-- Bisher (20261007120000) startete Investment 1 immer bei 'neuer_lead', auch
-- wenn der Kontakt mit einer anderen Stufe angelegt wurde: Partnerleads mit
-- 'zugewiesen', Buchungen mit 'erstgespraech_geplant', CSV-Importe mit
-- 'erreicht' oder 'follow_up'. Kontakt und Investment standen damit vom
-- ersten Moment an in verschiedenen Stufen. Vorgabe vom 11.10.2026: Die
-- Pipeline haengt am Investment, deshalb muss das Investment die Stufe tragen.
--
-- Uebernommen werden nur Startstufen der fruehen Phase (bis Objektauswahl,
-- die die Buchung einer Objektvorstellung setzt). Alles andere, auch eine
-- unbekannte Stufe aus einem Formular, startet bei 'neuer_lead'; weiter
-- hinten liegende Stufen eines CSV-Imports hebt die Oberflaeche wie bisher
-- nach (ImportExportButton, STUFEN_MIT_INVESTMENT). Die Altschreibweise
-- 'erstgespraech' (Empfehlung, Tippgeber) und 'termin_gebucht' (Terminlead
-- aus submit-lead, keine Stufe der Oberflaeche) werden zu
-- 'erstgespraech_geplant'. Bestandskunden ('bestandsimport') bleiben vorerst
-- ohne Auto-Investment.
-- Nur der Trigger aendert sich, bestehende Daten nicht; deshalb keine
-- Sicherungstabelle.

CREATE OR REPLACE FUNCTION public.auto_create_investment_for_kontakt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _stufe text := COALESCE(NULLIF(NEW.meta->>'pipelineStufe', ''), 'neuer_lead');
BEGIN
  IF COALESCE(NEW.meta->>'pipelineStufe', '') = 'bestandsimport' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.investments WHERE kunde_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF _stufe IN ('erstgespraech', 'termin_gebucht') THEN
    _stufe := 'erstgespraech_geplant';
  ELSIF _stufe NOT IN (
    'neuer_lead', 'zugewiesen', 'kontaktversuche', 'nicht_erreicht', 'erreicht',
    'follow_up', 'erstgespraech_geplant', 'eg_noshow', 'beratungsgespraech',
    'bg_noshow', 'objektauswahl'
  ) THEN
    _stufe := 'neuer_lead';
  END IF;

  INSERT INTO public.investments (kunde_id, meta)
  VALUES (
    NEW.id,
    jsonb_build_object(
      'nummer', 1,
      'label', 'Investment 1',
      'pipelineStufe', _stufe
    )
  );

  RETURN NEW;
END;
$$;
