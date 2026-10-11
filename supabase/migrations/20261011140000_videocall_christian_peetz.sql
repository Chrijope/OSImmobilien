-- ===========================================================================
-- Videocall wieder für Christian Peetz als admin (11.10.2026)
--
-- Seit der Übernahme stand in darf_videocall eine leere Liste, weil die
-- Kennungen des Ursprungsprojekts entfernt wurden. Eingetragen wird das Konto
-- von Christian Peetz in diesem Projekt. Dieselbe Kennung steht im Frontend
-- als CHRISTIAN_PEETZ_ID (src/lib/leadPool.ts) und in
-- src/lib/bewerberprozessFreigabe.ts.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.darf_videocall(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL
     AND _uid = ANY (ARRAY['46c4fb38-ee1d-4cb8-b321-5e3fcc652464']::uuid[])
     AND public.has_role(_uid, 'admin')
$$;
REVOKE ALL ON FUNCTION public.darf_videocall(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.darf_videocall(uuid) TO authenticated;
