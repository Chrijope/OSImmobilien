-- ===========================================================================
-- Sperre im Profil nur ueber die Verwaltung
-- ===========================================================================
--
-- AUSGANGSLAGE
--
-- Die Regel "Nutzer bearbeiten eigenes Profil" (20260316100616) erlaubt jedem
-- angemeldeten Nutzer, seine eigene Zeile in `profiles` zu aendern, ohne
-- Einschraenkung auf bestimmte Spalten. Ein gesperrter Partner mit noch
-- gueltiger Sitzung konnte deshalb ueber die Schnittstelle
-- `gesperrt = false` setzen und sich selbst entsperren. Genauso liess sich
-- die Schonfrist fuer die Pflichtunterlagen (`unterlagen_frist_bis`) nach
-- hinten schieben; an ihr haengt, ob ein Partner ohne vollstaendige
-- Unterlagen noch ins CRM darf (`darfInsCrm` in partnerUnterlagenStore.ts).
--
-- WAS SICH AENDERT
--
-- Ein Trigger auf `profiles`, gebaut wie `trg_vp_slug_schutz`
-- (20260926235000): Die Spalten
--
--   gesperrt, gesperrt_grund      Sperre und ihr Grund
--   unterlagen_frist_bis          Schonfrist fuer die Pflichtunterlagen
--   rollen_variante               Anzeigevariante der Rolle ('lead_berater')
--
-- aendern nur der Dienstschluessel (auth.uid() leer, also Edge Functions und
-- SQL-Editor), Admin und Inhaber. Alle anderen bekommen eine klare Meldung.
-- Uebrige Profilfelder (Name, Telefon, Links, Bild) bleiben frei.
--
-- Wer sperrt heute? Der Reiter Moderation in der Nutzerverwaltung schreibt
-- direkt aus dem Browser (`src/lib/moderationStore.ts`). Fremde Profile darf
-- laut Zeilensicherheit ohnehin nur `is_admin_role` aendern, also Admin und
-- Inhaber, und genau die laesst der Trigger durch. Sperren und Entsperren
-- durch die Verwaltung funktioniert also weiter. `rollen_variante` setzt nur
-- `invite-user` mit dem Dienstschluessel, `unterlagen_frist_bis` bisher nur
-- Migrationen.
--
-- Wiederholbar: CREATE OR REPLACE und DROP TRIGGER IF EXISTS. Die vier
-- Spalten werden vorsorglich mit IF NOT EXISTS angelegt, damit der Trigger
-- nie an einer fehlenden Spalte scheitert; vorhanden sind sie in der
-- Datenbank laengst.
-- ===========================================================================

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gesperrt boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gesperrt_grund text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS unterlagen_frist_bis timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rollen_variante text;

CREATE OR REPLACE FUNCTION public.profil_verwaltungsfelder_schutz_pruefen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Ein neues Profil mit Grundwerten ist immer in Ordnung. Die Frist ist
    -- hier bewusst nicht dabei: Sie darf beim Anlegen einen Vorgabewert tragen.
    IF NEW.gesperrt IS NOT TRUE
       AND NEW.gesperrt_grund IS NULL
       AND NEW.rollen_variante IS NULL THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.gesperrt IS NOT DISTINCT FROM OLD.gesperrt
    AND NEW.gesperrt_grund IS NOT DISTINCT FROM OLD.gesperrt_grund
    AND NEW.unterlagen_frist_bis IS NOT DISTINCT FROM OLD.unterlagen_frist_bis
    AND NEW.rollen_variante IS NOT DISTINCT FROM OLD.rollen_variante THEN
    -- Nichts Geschuetztes geaendert, etwa ein Speichern mit unveraenderten
    -- Werten im selben Datensatz.
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'inhaber'::public.app_role) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Sperre, Unterlagenfrist und Rollenvariante im Profil kann nur die Verwaltung aendern.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_profil_verwaltungsfelder_schutz ON public.profiles;
CREATE TRIGGER trg_profil_verwaltungsfelder_schutz
  BEFORE INSERT OR UPDATE OF gesperrt, gesperrt_grund, unterlagen_frist_bis, rollen_variante
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profil_verwaltungsfelder_schutz_pruefen();

COMMENT ON FUNCTION public.profil_verwaltungsfelder_schutz_pruefen() IS
  'profiles.gesperrt, gesperrt_grund, unterlagen_frist_bis und rollen_variante aendern nur Dienstschluessel (auth.uid() leer), Admin und Inhaber. Uebrige Profilfelder bleiben frei. Migration 20260927010000.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- PRUEFEN (Lesen, aendert nichts): Zeilen 22.1 und 22.2 in 99_PRUEFUNG.sql
-- ---------------------------------------------------------------------------
