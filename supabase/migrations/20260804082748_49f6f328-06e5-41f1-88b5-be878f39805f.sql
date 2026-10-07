-- OSImmobilien: Kopie von 20260804150000 (inhaltsgleich), im Ursprung nach buchung_grundlage eingespielt.
-- Auf einer frischen Datenbank fehlt hier noch public.buchungen; dann wird dieser Block
-- uebersprungen und die benannten Einzelmigrationen spielen denselben Inhalt ein.
DO $osi_rahmen$ BEGIN
IF to_regclass('public.buchungen') IS NOT NULL THEN
EXECUTE $osi_paket$
UPDATE public.profiles p
SET telefon = NULLIF(btrim(us.einstellungen -> 'profil' ->> 'telefon'), '')
FROM public.user_settings us
WHERE us.user_id = p.id
  AND NULLIF(btrim(COALESCE(p.telefon, '')), '') IS NULL
  AND NULLIF(btrim(us.einstellungen -> 'profil' ->> 'telefon'), '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.buchung_zugang(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _z record;
  _profil record;
  _einst record;
  _arten jsonb;
BEGIN
  SELECT * INTO _z FROM public.buchung_zugang_aufloesen(_token);
  IF _z.mitarbeiter_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    p.name,
    p.email,
    COALESCE(
      NULLIF(btrim(p.telefon), ''),
      NULLIF(btrim(us.einstellungen -> 'profil' ->> 'telefon'), '')
    ) AS telefon,
    p.avatar_url,
    us.einstellungen -> 'profil' ->> 'position' AS position,
    us.einstellungen -> 'videocall' ->> 'ort' AS ort,
    us.einstellungen -> 'videocall' ->> 'zitat' AS zitat
  INTO _profil
  FROM public.profiles p
  LEFT JOIN public.user_settings us ON us.user_id = p.id
  WHERE p.id = _z.mitarbeiter_id;

  SELECT e.zeitzone, e.begruessung, e.hinweis INTO _einst
  FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = _z.mitarbeiter_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.id,
           'bezeichnung', t.bezeichnung,
           'beschreibung', t.beschreibung,
           'dauer_minuten', t.dauer_minuten,
           'anlass', t.anlass
         ) ORDER BY t.sortierung, t.bezeichnung), '[]'::jsonb)
  INTO _arten
  FROM public.buchung_terminarten t
  WHERE t.mitarbeiter_id = _z.mitarbeiter_id
    AND t.aktiv
    AND (_z.art = 'persoenlich' OR t.oeffentlich)
    AND (_z.terminart_id IS NULL OR t.id = _z.terminart_id);

  RETURN jsonb_build_object(
    'art', _z.art,
    'berater', jsonb_build_object(
      'name', COALESCE(_profil.name, ''),
      'email', _profil.email,
      'telefon', _profil.telefon,
      'bild', _profil.avatar_url,
      'position', _profil.position,
      'ort', _profil.ort,
      'zitat', _profil.zitat
    ),
    'zeitzone', COALESCE(_einst.zeitzone, 'Europe/Berlin'),
    'begruessung', _einst.begruessung,
    'hinweis', _einst.hinweis,
    'kontakt_bekannt', _z.kontakt_id IS NOT NULL,
    'vorbelegung', CASE WHEN _z.art = 'persoenlich'
                        THEN COALESCE(_z.kontakt_snapshot, '{}'::jsonb)
                        ELSE '{}'::jsonb END,
    'terminarten', _arten
  );
END;
$$;
REVOKE ALL ON FUNCTION public.buchung_zugang(text) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_zugang(text) TO anon, authenticated
$osi_paket$;
END IF;
END $osi_rahmen$;
