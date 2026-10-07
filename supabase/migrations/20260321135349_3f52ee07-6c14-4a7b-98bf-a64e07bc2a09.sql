
-- Trigger function to notify admins when new objekt_einreichung is created
CREATE OR REPLACE FUNCTION public.notify_admins_neue_einreichung()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_row RECORD;
  einreichung_titel TEXT;
BEGIN
  einreichung_titel := COALESCE(NEW.titel, 'Ohne Titel');
  
  FOR admin_row IN
    SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'inhaber')
  LOOP
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (
      admin_row.user_id,
      'Neue Objekt-Einreichung',
      'Neues Objekt eingereicht: ' || einreichung_titel || COALESCE(' von ' || NEW.akquisiteur_name, ''),
      '/objekt-einreichungen'
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Trigger on insert
CREATE TRIGGER on_neue_einreichung
  AFTER INSERT ON public.objekt_einreichungen
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_neue_einreichung();
