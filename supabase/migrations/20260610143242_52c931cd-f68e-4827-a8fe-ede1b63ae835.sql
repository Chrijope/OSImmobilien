
CREATE OR REPLACE FUNCTION public.get_or_create_tippgeber_vp_chat()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tipp public.tippgeber%ROWTYPE;
  _vp_id uuid;
  _vp_name text;
  _vp_initials text;
  _chat_id uuid;
  _tipp_name text;
  _tipp_initials text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'tippgeber'::public.app_role) THEN
    RAISE EXCEPTION 'Nur Tippgeber dürfen diese Funktion nutzen';
  END IF;

  SELECT * INTO _tipp FROM public.tippgeber WHERE benutzer_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kein Tippgeber-Profil gefunden'; END IF;

  _vp_id := _tipp.zugeordnet_id;
  IF _vp_id IS NULL THEN RAISE EXCEPTION 'Kein zugeordneter Vertriebspartner'; END IF;

  _tipp_name := COALESCE(NULLIF(trim(_tipp.vorname || ' ' || _tipp.nachname), ''), 'Tippgeber');
  _tipp_initials := upper(left(coalesce(_tipp.vorname,''),1) || left(coalesce(_tipp.nachname,''),1));
  IF _tipp_initials = '' THEN _tipp_initials := 'TG'; END IF;

  SELECT COALESCE(NULLIF(trim(name),''), 'Vertriebspartner') INTO _vp_name FROM public.profiles WHERE id = _vp_id;
  _vp_name := COALESCE(_vp_name, 'Vertriebspartner');
  _vp_initials := upper(left(split_part(_vp_name,' ',1),1) || left(split_part(_vp_name,' ',2),1));
  IF _vp_initials = '' THEN _vp_initials := 'VP'; END IF;

  SELECT g.id INTO _chat_id
  FROM public.chat_gruppen g
  WHERE (g.meta->>'kind') = 'tippgeber_vp'
    AND (g.meta->>'tippgeberId') = _tipp.id::text
    AND EXISTS (SELECT 1 FROM public.chat_teilnehmer t WHERE t.chat_id = g.id AND t.benutzer_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.chat_teilnehmer t WHERE t.chat_id = g.id AND t.benutzer_id = _vp_id)
  LIMIT 1;

  IF _chat_id IS NOT NULL THEN
    -- Backfill missing participant meta on existing chat
    UPDATE public.chat_teilnehmer
       SET meta = jsonb_build_object('name', _tipp_name, 'initials', _tipp_initials, 'role', 'Tippgeber')
     WHERE chat_id = _chat_id AND benutzer_id = auth.uid()
       AND (meta IS NULL OR meta = '{}'::jsonb OR NOT (meta ? 'name'));
    UPDATE public.chat_teilnehmer
       SET meta = jsonb_build_object('name', _vp_name, 'initials', _vp_initials, 'role', 'Vertriebspartner')
     WHERE chat_id = _chat_id AND benutzer_id = _vp_id
       AND (meta IS NULL OR meta = '{}'::jsonb OR NOT (meta ? 'name'));
    RETURN jsonb_build_object('chat_id', _chat_id, 'vp_id', _vp_id, 'created', false);
  END IF;

  INSERT INTO public.chat_gruppen (name, typ, erstellt_von, meta)
  VALUES (
    'Tippgeber: ' || _tipp_name,
    'direkt',
    auth.uid(),
    jsonb_build_object('kind', 'tippgeber_vp', 'tippgeberId', _tipp.id::text, 'vpId', _vp_id::text)
  )
  RETURNING id INTO _chat_id;

  INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, meta)
    VALUES (_chat_id, auth.uid(), jsonb_build_object('name', _tipp_name, 'initials', _tipp_initials, 'role', 'Tippgeber'));
  INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, meta)
    VALUES (_chat_id, _vp_id, jsonb_build_object('name', _vp_name, 'initials', _vp_initials, 'role', 'Vertriebspartner'));

  RETURN jsonb_build_object('chat_id', _chat_id, 'vp_id', _vp_id, 'created', true);
END;
$function$;

-- Backfill bestehende Tippgeber-VP-Chats
UPDATE public.chat_teilnehmer t
   SET meta = jsonb_build_object(
     'name', COALESCE(NULLIF(trim(p.name),''), 'Nutzer'),
     'initials', COALESCE(NULLIF(upper(left(split_part(p.name,' ',1),1) || left(split_part(p.name,' ',2),1)),''),'NN'),
     'role', CASE WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = t.benutzer_id AND ur.role = 'tippgeber') THEN 'Tippgeber'
                  WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = t.benutzer_id AND ur.role = 'vertriebspartner') THEN 'Vertriebspartner'
                  ELSE 'Nutzer' END
   )
  FROM public.profiles p
 WHERE p.id = t.benutzer_id
   AND t.chat_id IN (SELECT id FROM public.chat_gruppen WHERE meta->>'kind' = 'tippgeber_vp')
   AND (t.meta IS NULL OR t.meta = '{}'::jsonb OR NOT (t.meta ? 'name'));
