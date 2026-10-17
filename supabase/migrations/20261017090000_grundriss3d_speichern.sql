-- 3D-Grundriss speichern (17.10.2026).
--
-- Christian: Jede Nutzerrolle soll den Grundriss-Editor nutzen können. Die
-- Zeilensicherheit an `wohnungen` lässt aber nur Admin, Inhaber und den
-- Objektpartner am eigenen Objekt schreiben, und das soll für alle anderen
-- Felder so bleiben (Preise, Status, Reservierung).
--
-- Deshalb eine schmale Funktion: Jede interne Rolle (is_internal_role, also
-- ohne Kunde, Tippgeber und Bewerber) darf genau einen Schlüssel setzen,
-- `meta.grundriss3d`. Sonst ändert sie an der Einheit nichts. jsonb_set in
-- einem Schritt, damit gleichzeitige Änderungen an anderen meta-Schlüsseln
-- nicht überschrieben werden.

CREATE OR REPLACE FUNCTION public.grundriss3d_speichern(_wohnung_id uuid, _plan jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _gefunden boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_internal_role(auth.uid()) THEN
    RAISE EXCEPTION 'Den 3D-Grundriss können nur Mitarbeiter und Partner des Hauses speichern.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_plan) <> 'object' OR jsonb_typeof(_plan -> 'waende') <> 'array' THEN
    RAISE EXCEPTION 'Kein gültiger Grundriss.' USING ERRCODE = '22023';
  END IF;
  -- Ein Plan hat wenige KB; die Grenze hält Missbrauch als Datenablage fern.
  IF octet_length(_plan::text) > 300000 THEN
    RAISE EXCEPTION 'Der Grundriss ist zu groß.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.wohnungen
     SET meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{grundriss3d}', _plan, true)
   WHERE id = _wohnung_id
  RETURNING true INTO _gefunden;

  RETURN coalesce(_gefunden, false);
END;
$$;

REVOKE ALL ON FUNCTION public.grundriss3d_speichern(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.grundriss3d_speichern(uuid, jsonb) TO authenticated;
