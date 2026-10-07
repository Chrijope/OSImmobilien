CREATE OR REPLACE FUNCTION public.is_internal_role(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'inhaber', 'vertriebspartner',
                   'hausverwaltung', 'buchhaltung',
                   'setterin', 'objektpartner', 'finanzierungspartner',
                   'individuell', 'testaccount',
                   'marketing', 'hr', 'backoffice', 'vertriebsleiter')
  )
$function$;