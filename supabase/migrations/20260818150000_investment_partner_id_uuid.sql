-- Reparatur: investment_partner_id muss uuid annehmen, nicht text
--
-- investments.kunde_id wurde am 17.05.2026 (20260517094425) von text auf
-- uuid umgestellt. Die Funktion aus 20260818140000 wurde aber mit
-- text-Parameter angelegt. Folge: Der Aufruf investment_partner_id(kunde_id)
-- schlug mit "function does not exist" fehl. Das liess die Datenkorrektur
-- 20260818141000 mit Query failed abbrechen, und der Einfrier-Trigger fing
-- den Fehler still ab und schrieb keinen Satz fest.
--
-- Hier wird die Funktion mit uuid-Signatur neu angelegt, samt derselben
-- Rechtevergabe (SECURITY DEFINER liest an RLS vorbei fremde Zuordnungen,
-- deshalb nur service_role und der Trigger als Tabellenbesitzer).

DROP FUNCTION IF EXISTS public.investment_partner_id(text);

CREATE OR REPLACE FUNCTION public.investment_partner_id(_kunde_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _berater text;
  _zustaendig uuid;
  _partner uuid;
BEGIN
  IF _kunde_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT k.berater, k.zustaendig_id
    INTO _berater, _zustaendig
    FROM public.kontakte k
   WHERE k.id = _kunde_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF coalesce(trim(_berater), '') <> '' THEN
    SELECT p.id INTO _partner FROM public.profiles p WHERE p.name = _berater LIMIT 1;
    IF _partner IS NOT NULL THEN
      RETURN _partner;
    END IF;
  END IF;

  RETURN _zustaendig;
END;
$$;

COMMENT ON FUNCTION public.investment_partner_id(uuid) IS
  'Zustaendiger Vertriebspartner zu einer investments.kunde_id: erst der '
  'Berater-Name gegen profiles.name, dann kontakte.zustaendig_id.';

REVOKE ALL ON FUNCTION public.investment_partner_id(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.investment_partner_id(uuid) TO service_role;
