
-- 1) Add column
ALTER TABLE public.tippgeber ADD COLUMN IF NOT EXISTS tg_slug text;

-- 2) Slug helper
CREATE OR REPLACE FUNCTION public.slugify_de(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' from
    regexp_replace(
      regexp_replace(
        lower(
          translate(coalesce(input,''),
            'äöüÄÖÜßéèêàáâíìóòúùñç',
            'aouaouseeeaaaiioouunc')
        ),
        '[^a-z0-9]+', '-', 'g'),
      '-+', '-', 'g')
  );
$$;

-- 3) Trigger to auto-generate slug (unique per zugeordnet_id)
CREATE OR REPLACE FUNCTION public.tippgeber_set_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base text;
  candidate text;
  n int := 1;
BEGIN
  -- Only (re)generate if slug missing or name fields changed
  IF NEW.tg_slug IS NULL OR NEW.tg_slug = ''
     OR (TG_OP = 'UPDATE' AND (NEW.vorname <> OLD.vorname OR NEW.nachname <> OLD.nachname)) THEN
    base := public.slugify_de(coalesce(NEW.vorname,'') || '-' || coalesce(NEW.nachname,''));
    IF base IS NULL OR base = '' THEN
      base := 'tippgeber';
    END IF;
    candidate := base;
    -- Ensure uniqueness within the same zugeordnet_id scope
    WHILE EXISTS (
      SELECT 1 FROM public.tippgeber
      WHERE tg_slug = candidate
        AND coalesce(zugeordnet_id::text, '') = coalesce(NEW.zugeordnet_id::text, '')
        AND id <> NEW.id
    ) LOOP
      n := n + 1;
      candidate := base || '-' || n::text;
    END LOOP;
    NEW.tg_slug := candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tippgeber_set_slug ON public.tippgeber;
CREATE TRIGGER trg_tippgeber_set_slug
BEFORE INSERT OR UPDATE OF vorname, nachname, tg_slug ON public.tippgeber
FOR EACH ROW EXECUTE FUNCTION public.tippgeber_set_slug();

-- 4) Backfill
UPDATE public.tippgeber SET tg_slug = NULL WHERE tg_slug = '';
DO $$
DECLARE r record;
DECLARE base text;
DECLARE candidate text;
DECLARE n int;
BEGIN
  FOR r IN SELECT id, vorname, nachname, zugeordnet_id FROM public.tippgeber WHERE tg_slug IS NULL ORDER BY erstellt_am LOOP
    base := public.slugify_de(coalesce(r.vorname,'') || '-' || coalesce(r.nachname,''));
    IF base IS NULL OR base = '' THEN base := 'tippgeber'; END IF;
    candidate := base; n := 1;
    WHILE EXISTS (
      SELECT 1 FROM public.tippgeber
      WHERE tg_slug = candidate
        AND coalesce(zugeordnet_id::text,'') = coalesce(r.zugeordnet_id::text,'')
        AND id <> r.id
    ) LOOP
      n := n + 1; candidate := base || '-' || n::text;
    END LOOP;
    UPDATE public.tippgeber SET tg_slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- 5) Unique index per VP scope
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tippgeber_slug_per_vp
  ON public.tippgeber (zugeordnet_id, tg_slug)
  WHERE tg_slug IS NOT NULL;

-- 6) Resolver RPC: vp_slug + tg_slug -> tippgeber.id (anon-accessible)
CREATE OR REPLACE FUNCTION public.resolve_tippgeber_slug(_vp_slug text, _tg_slug text)
RETURNS TABLE (id uuid, vorname text, nachname text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.vorname, t.nachname
  FROM public.tippgeber t
  JOIN public.profiles p ON p.id = t.zugeordnet_id
  WHERE p.vp_slug = _vp_slug
    AND t.tg_slug = _tg_slug
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_tippgeber_slug(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.resolve_tippgeber_slug(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_tippgeber_slug(text, text) TO service_role;
