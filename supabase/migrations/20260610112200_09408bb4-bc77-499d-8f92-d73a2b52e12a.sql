-- Tippgeber sieht aktive Empfehlungsprogramme (für Konditionen-Tab)
DROP POLICY IF EXISTS "Tippgeber sehen aktive Programme" ON public.empfehlungsprogramme;
CREATE POLICY "Tippgeber sehen aktive Programme"
ON public.empfehlungsprogramme
FOR SELECT
TO authenticated
USING (
  aktiv = true
  AND public.has_role(auth.uid(), 'tippgeber'::public.app_role)
);

-- Holt oder erstellt einen privaten 1:1-Chat zwischen dem aufrufenden
-- Tippgeber und seinem zugewiesenen Vertriebspartner.
CREATE OR REPLACE FUNCTION public.get_or_create_tippgeber_vp_chat()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tipp public.tippgeber%ROWTYPE;
  _vp_id uuid;
  _chat_id uuid;
  _tipp_name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'tippgeber'::public.app_role) THEN
    RAISE EXCEPTION 'Nur Tippgeber dürfen diese Funktion nutzen';
  END IF;

  SELECT * INTO _tipp
  FROM public.tippgeber
  WHERE benutzer_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kein Tippgeber-Profil gefunden';
  END IF;

  _vp_id := _tipp.zugeordnet_id;
  IF _vp_id IS NULL THEN
    RAISE EXCEPTION 'Kein zugeordneter Vertriebspartner';
  END IF;

  _tipp_name := COALESCE(NULLIF(trim(_tipp.vorname || ' ' || _tipp.nachname), ''), 'Tippgeber');

  -- Bestehenden Chat suchen (markiert per meta.typ='tippgeber_vp')
  SELECT g.id INTO _chat_id
  FROM public.chat_gruppen g
  WHERE (g.meta->>'kind') = 'tippgeber_vp'
    AND (g.meta->>'tippgeberId') = _tipp.id::text
    AND EXISTS (SELECT 1 FROM public.chat_teilnehmer t WHERE t.chat_id = g.id AND t.benutzer_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.chat_teilnehmer t WHERE t.chat_id = g.id AND t.benutzer_id = _vp_id)
  LIMIT 1;

  IF _chat_id IS NOT NULL THEN
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

  INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id) VALUES (_chat_id, auth.uid());
  INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id) VALUES (_chat_id, _vp_id);

  RETURN jsonb_build_object('chat_id', _chat_id, 'vp_id', _vp_id, 'created', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_tippgeber_vp_chat() TO authenticated;