-- Telefonnummer des Ansprechpartners auf der Buchungsseite.
--
-- Im Kaestchen "Ihr Ansprechpartner" fehlte die Telefonnummer, obwohl in den
-- Einstellungen eine eingetragen war. Ursache: Die Einstellungen legten sie
-- ausschliesslich im Nutzerprofil ab (`user_settings.einstellungen.profil`),
-- alles Serverseitige liest sie aber aus `profiles`. Dort stand sie nie.
--
-- Zwei Teile:
--   1. Einmaliges Nachtragen des Bestands aus dem Nutzerprofil nach `profiles`.
--   2. `buchung_zugang` greift zusaetzlich auf das Nutzerprofil zurueck, falls
--      in `profiles` nichts steht. Damit wirkt es sofort und nicht erst, wenn
--      jemand seine Einstellungen erneut speichert.
--
-- Nebenbei gibt die Funktion jetzt auch Position, Ort und den Satz an den
-- Kunden heraus. Der Warteraum zeigt beides bereits, die Buchungsseite hatte
-- es nur nie bekommen.

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

  -- Position, Ort und der Satz an den Kunden stehen im Nutzerprofil, nicht in
  -- `profiles`. Die Telefonnummer stand dort bisher ausschliesslich, deshalb
  -- der Rueckgriff: erst `profiles`, dann das Nutzerprofil.
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
    -- Am offenen Link erscheinen nur die oeffentlichen Terminarten.
    AND (_z.art = 'persoenlich' OR t.oeffentlich)
    -- Ist der Link auf eine Terminart festgelegt, gibt es nur diese.
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
GRANT EXECUTE ON FUNCTION public.buchung_zugang(text) TO anon, authenticated;
