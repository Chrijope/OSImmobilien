
CREATE OR REPLACE FUNCTION public.auto_create_investment_for_kontakt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stufe text;
  v_exists boolean;
BEGIN
  v_stufe := COALESCE(NEW.meta->>'pipelineStufe', '');

  -- Bestandskunden bleiben im Pre-Funnel; kein Auto-Investment
  IF v_stufe = 'bestandsimport' THEN
    RETURN NEW;
  END IF;

  -- Sicherheits-Guard: nichts anlegen, falls für diesen Kontakt schon ein Investment existiert
  SELECT EXISTS (SELECT 1 FROM public.investments WHERE kunde_id = NEW.id) INTO v_exists;
  IF v_exists THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.investments (kunde_id, meta)
  VALUES (
    NEW.id,
    jsonb_build_object(
      'nummer', 1,
      'label', 'Investment 1',
      'pipelineStufe', 'erstgespraech'
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_investment ON public.kontakte;
CREATE TRIGGER trg_auto_create_investment
AFTER INSERT ON public.kontakte
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_investment_for_kontakt();
