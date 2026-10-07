-- ===========================================================================
-- Partnerlinks absichern: Kürzel geschützt, Sperre wirkt, Tippgeber eindeutig
-- ===========================================================================
--
-- Befunde der Codex-Prüfung vom 26.09.2026, von GL freigegeben. Die
-- Namen in den Partnerlinks bleiben, geschlossen werden diese Lücken:
--
-- F03  Partner konnten `profiles.vp_slug` direkt aus dem Browser ändern oder
--      leeren (die Update-Regel auf die eigene Zeile hat keinen
--      Spaltenschutz). Jetzt ändert das Kürzel nur noch der Dienstschlüssel
--      (Edge Functions `ensure-vp-slug`, `get-tippgeber-vp-slug`, der
--      SQL-Editor) oder Admin und Inhaber. Name, Telefon und alle übrigen
--      Felder bleiben für den Partner frei. Der Trigger `trg_vp_slug_sperre`
--      aus 20260926220000 (gesperrte Wörter) bleibt daneben unverändert.
--
-- F05  Ein gesperrter Partner blieb unter seinem Link sichtbar. Die Edge
--      Function `get-vp-microsite` prüft das jetzt selbst; hier bekommen die
--      Tippgeber-Wege dieselbe Regel: `partner_link_aktiv(uuid)` = Profil
--      nicht gesperrt UND eine Partnerrolle (vertriebspartner,
--      vertriebsleiter, admin, inhaber). Dieselbe Liste wie BERATER_ROLLEN in
--      `supabase/functions/_shared/lead-zuordnung.ts`.
--
-- F07  Der Klickzähler löste das Tippgeber-Kürzel global mit LIMIT 1 auf,
--      eindeutig ist es aber nur je Partner. Neu: `tippgeber_klick_zaehlen(
--      _vp_slug, _tg)` sucht den Tippgeber nur unter dem Partner des Links.
--      Die alte Funktion `increment_tippgeber_klick(text)` bleibt für alte
--      Browser, zählt ein Kürzel aber nur noch bei genau einem Treffer.
--      Beide zählen höchstens 200 Klicks je Tippgeber und Tag (Tabelle
--      `tippgeber_klick_tage`, nur Kennung, Tag und Anzahl, kein
--      Personenbezug).
--
-- TG   Das Tippgeber-Kürzel wurde bei jeder Namensänderung neu vergeben,
--      geteilte Links (?tg=...) liefen danach ins Leere. Jetzt wird es nur
--      noch vergeben, wenn keins da ist. Links, die durch frühere
--      Umbenennungen schon verloren sind, kommen damit nicht zurück.
--
-- OHNE DIESE MIGRATION
--
-- Alles läuft wie bisher. Der Browser ruft zuerst `tippgeber_klick_zaehlen`,
-- fehlt sie, nimmt er die alte Funktion. Die Sperre der Partnerseite wirkt
-- schon mit der ausgerollten Edge Function `get-vp-microsite`.
--
-- Wiederholbar: CREATE OR REPLACE, IF NOT EXISTS, DROP ... IF EXISTS.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Aktiver Partner mit Link (F05)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_link_aktiv(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = _user_id AND p.gesperrt IS NOT TRUE)
     AND EXISTS (SELECT 1 FROM public.user_roles r
                  WHERE r.user_id = _user_id
                    AND r.role::text IN ('vertriebspartner', 'vertriebsleiter', 'admin', 'inhaber'));
$$;

-- Nur für die Funktionen unten, die mit den Rechten des Eigentümers laufen.
REVOKE ALL ON FUNCTION public.partner_link_aktiv(uuid) FROM public, anon, authenticated;

COMMENT ON FUNCTION public.partner_link_aktiv(uuid) IS
  'Partnerlink gilt: Profil nicht gesperrt und Rolle vertriebspartner, vertriebsleiter, admin oder inhaber. Wie beurteileBeraterKennung in _shared/lead-zuordnung.ts. Migration 20260926235000.';

-- ---------------------------------------------------------------------------
-- 2. Tippgeber-Kürzel auflösen: nur beim aktiven Partner (F05)
-- ---------------------------------------------------------------------------
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
    AND public.partner_link_aktiv(p.id)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_tippgeber_slug(text, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Tippgeber-Kürzel bleibt bei Namensänderung (TG)
-- ---------------------------------------------------------------------------
-- Wie 20260610160335, nur ohne den Zweig „Name geändert“. Der Trigger
-- trg_tippgeber_set_slug bleibt, er ruft diese Funktion.
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
  -- Ein vergebenes Kürzel steht in geteilten Links und bleibt deshalb,
  -- auch wenn der Name sich ändert. Vergeben wird nur, wenn keins da ist.
  IF NEW.tg_slug IS NULL OR NEW.tg_slug = '' THEN
    base := public.slugify_de(coalesce(NEW.vorname,'') || '-' || coalesce(NEW.nachname,''));
    IF base IS NULL OR base = '' THEN
      base := 'tippgeber';
    END IF;
    candidate := base;
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

-- ---------------------------------------------------------------------------
-- 4. Klickzähler: eindeutig und begrenzt (F07)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tippgeber_klick_tage (
  tippgeber_id uuid NOT NULL REFERENCES public.tippgeber(id) ON DELETE CASCADE,
  tag date NOT NULL,
  anzahl integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tippgeber_id, tag)
);

-- Zeilensicherheit ohne Regel: Nur die Funktionen unten schreiben und lesen.
ALTER TABLE public.tippgeber_klick_tage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tippgeber_klick_tage FROM anon, authenticated;

COMMENT ON TABLE public.tippgeber_klick_tage IS
  'Gezaehlte Klicks je Tippgeber und Tag (Berliner Zeit), nur fuer die Obergrenze. Kein Personenbezug. Migration 20260926235000.';

-- ponytail: feste Obergrenze 200 je Tippgeber und Tag, alte Tageszeilen
-- bleiben liegen (eine Zeile je Tippgeber und Klicktag). Aufräumen, falls die
-- Tabelle je stört.
CREATE OR REPLACE FUNCTION public.tippgeber_klick_buchen(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tag date := (now() AT TIME ZONE 'Europe/Berlin')::date;
  _anzahl integer;
BEGIN
  IF _id IS NULL THEN
    RETURN false;
  END IF;

  -- Der Link eines gesperrten Partners zählt nicht (F05).
  IF NOT EXISTS (SELECT 1 FROM public.tippgeber t
                  WHERE t.id = _id AND public.partner_link_aktiv(t.zugeordnet_id)) THEN
    RETURN false;
  END IF;

  INSERT INTO public.tippgeber_klick_tage AS k (tippgeber_id, tag, anzahl)
  VALUES (_id, _tag, 1)
  ON CONFLICT (tippgeber_id, tag) DO UPDATE
    SET anzahl = k.anzahl + 1
    WHERE k.anzahl < 200
  RETURNING anzahl INTO _anzahl;

  -- Obergrenze erreicht: kein Update, keine Zeile zurück.
  IF _anzahl IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.tippgeber
  SET meta = jsonb_set(
    jsonb_set(
      COALESCE(meta, '{}'::jsonb),
      '{klicks}',
      to_jsonb(COALESCE(NULLIF(meta->>'klicks',''), '0')::int + 1)
    ),
    '{letzter_klick}',
    to_jsonb(now()::text)
  )
  WHERE id = _id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.tippgeber_klick_buchen(uuid) FROM public, anon, authenticated;

-- Der neue Weg: Partnerkürzel plus Tippgeberkürzel (oder Tippgeber-Kennung).
CREATE OR REPLACE FUNCTION public.tippgeber_klick_zaehlen(_vp_slug text, _tg text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _vp text := lower(btrim(coalesce(_vp_slug, '')));
  _tg_text text := lower(btrim(coalesce(_tg, '')));
  _partner uuid;
  _id uuid;
BEGIN
  IF _vp = '' OR _tg_text = '' OR length(_vp) > 80 OR length(_tg_text) > 120 THEN
    RETURN;
  END IF;

  SELECT p.id INTO _partner FROM public.profiles p WHERE p.vp_slug = _vp;
  IF _partner IS NULL THEN
    RETURN;
  END IF;

  -- tg_slug ist je Partner eindeutig (uniq_tippgeber_slug_per_vp).
  SELECT t.id INTO _id
    FROM public.tippgeber t
   WHERE t.zugeordnet_id = _partner
     AND (t.tg_slug = _tg_text OR t.id::text = _tg_text)
   LIMIT 1;

  PERFORM public.tippgeber_klick_buchen(_id);
END;
$$;

REVOKE ALL ON FUNCTION public.tippgeber_klick_zaehlen(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.tippgeber_klick_zaehlen(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.tippgeber_klick_zaehlen(text, text) IS
  'Zaehlt einen Klick auf /vp/<_vp_slug>?tg=<_tg>. Tippgeber nur unter dem Partner des Links, nur bei aktivem Partner, hoechstens 200 je Tag. Migration 20260926235000.';

-- Der alte Weg für Browser mit altem Stand: nur eindeutige Treffer zählen.
CREATE OR REPLACE FUNCTION public.increment_tippgeber_klick(_tippgeber text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF _tippgeber IS NULL OR length(_tippgeber) = 0 OR length(_tippgeber) > 120 THEN
    RETURN;
  END IF;

  BEGIN
    _id := _tippgeber::uuid;
  EXCEPTION WHEN others THEN
    _id := NULL;
  END;

  IF _id IS NULL THEN
    -- Dasselbe Kürzel kann bei mehreren Partnern vorkommen. Dann ist nicht
    -- klar, wessen Tippgeber gemeint ist, und es wird nicht gezählt.
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(t.id))[1] END INTO _id
      FROM public.tippgeber t
     WHERE t.tg_slug = _tippgeber;
  END IF;

  PERFORM public.tippgeber_klick_buchen(_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_tippgeber_klick(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Link-Kürzel der Partner nur über Verwaltung und Dienstschlüssel (F03)
-- ---------------------------------------------------------------------------
-- Neben trg_vp_slug_sperre (gesperrte Wörter), nicht statt ihm.
-- `auth.uid()` leer heißt Dienstschlüssel oder SQL-Editor, wie in
-- 20260916100000 und 20260925120000.
CREATE OR REPLACE FUNCTION public.vp_slug_schutz_pruefen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vp_slug IS NULL THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.vp_slug IS NOT DISTINCT FROM OLD.vp_slug THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'inhaber'::public.app_role) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Das Link-Kuerzel kann nur die Verwaltung aendern, damit bereits geteilte Links gueltig bleiben.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_vp_slug_schutz ON public.profiles;
CREATE TRIGGER trg_vp_slug_schutz
  BEFORE INSERT OR UPDATE OF vp_slug ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.vp_slug_schutz_pruefen();

COMMENT ON FUNCTION public.vp_slug_schutz_pruefen() IS
  'profiles.vp_slug aendern nur Dienstschluessel (auth.uid() leer), Admin und Inhaber. Uebrige Profilfelder bleiben frei. Migration 20260926235000.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- PRUEFEN (Lesen, aendert nichts): Zeilen 20.1 bis 20.6 in 99_PRUEFUNG.sql
-- ---------------------------------------------------------------------------
