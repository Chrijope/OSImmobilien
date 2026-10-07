
CREATE OR REPLACE FUNCTION public.notify_crm_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kind text;
  _roles jsonb;
  _u RECORD;
BEGIN
  IF NEW.kategorie::text <> 'system' THEN
    RETURN NEW;
  END IF;
  _kind := COALESCE(NEW.meta ->> 'kind', '');
  IF _kind <> 'crm_neu' THEN
    RETURN NEW;
  END IF;

  _roles := COALESCE(NEW.meta -> 'roles', '[]'::jsonb);

  FOR _u IN
    SELECT DISTINCT ur.user_id, ur.role::text AS role
    FROM public.user_roles ur
    WHERE ur.role::text NOT IN ('kunde', 'tippgeber')
      AND (
        jsonb_array_length(_roles) = 0
        OR _roles ? ur.role::text
      )
  LOOP
    BEGIN
      INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
      VALUES (
        _u.user_id,
        'Neues CRM-Update: ' || NEW.titel,
        COALESCE(LEFT(NEW.inhalt, 240), ''),
        '/#crm-updates'
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_crm_update ON public.news;
CREATE TRIGGER trg_notify_crm_update
AFTER INSERT ON public.news
FOR EACH ROW
EXECUTE FUNCTION public.notify_crm_update();
