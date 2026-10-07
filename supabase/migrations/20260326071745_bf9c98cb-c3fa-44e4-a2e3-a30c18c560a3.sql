
-- 1. Delete orphaned investments (no matching kontakt)
DELETE FROM public.investments
WHERE NOT EXISTS (
  SELECT 1 FROM public.kontakte k WHERE k.id::text = investments.kunde_id
);

-- 2. Create trigger function to auto-delete investments when a kontakt is deleted
CREATE OR REPLACE FUNCTION public.cascade_delete_investments_on_kontakt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.investments WHERE kunde_id = OLD.id::text;
  RETURN OLD;
END;
$$;

-- 3. Attach trigger to kontakte table
CREATE TRIGGER trg_cascade_delete_investments
BEFORE DELETE ON public.kontakte
FOR EACH ROW
EXECUTE FUNCTION public.cascade_delete_investments_on_kontakt();
