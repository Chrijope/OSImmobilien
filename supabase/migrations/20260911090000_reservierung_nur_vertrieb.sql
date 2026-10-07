-- ===========================================================================
-- Reservieren duerfen nur noch Admin, Inhaber, Vertriebsleitung und
-- Vertriebspartner
-- ===========================================================================
--
-- Ausgangslage: Auf `wohnungen` galt fuer UPDATE nur `is_internal_role`, und
-- die Funktion nennt fuenfzehn Rollen, darunter Hausverwaltung, Marketing,
-- Buchhaltung, HR und Setterin. Jede von ihnen konnte eine Einheit auf
-- "reserviert" setzen oder eine fremde Reservierung wieder aufheben. Im
-- Browser fehlte die Pruefung ganz.
--
-- Entscheidung Christians vom 11.09.2026: Reservieren duerfen genau vier
-- Rollen. Die uebrigen internen Rollen duerfen Wohnungsdaten weiter pflegen,
-- nur der Reservierungsstand ist ihnen entzogen. Deshalb kein Umbau der
-- Policy, sondern ein Ausloeser, der genau die drei Felder bewacht.
--
-- Die Entsprechung im Browser ist `src/lib/reservierungsRechte.ts`. Wird die
-- Liste dort geaendert, gehoert sie hier mitgeaendert.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.darf_reservieren(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'inhaber', 'vertriebsleiter', 'vertriebspartner')
  )
$$;

COMMENT ON FUNCTION public.darf_reservieren(uuid) IS
  'Wer eine Einheit fuer einen Kunden reservieren darf. Entscheidung vom 11.09.2026.';

CREATE OR REPLACE FUNCTION public.wohnung_reservierung_pruefen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  wird_reserviert boolean;
BEGIN
  -- Serverseitige Laeufe (Cron, Edge Functions mit Dienstschluessel) haben
  -- keinen angemeldeten Nutzer. Sie bleiben unberuehrt, sonst koennte die
  -- Pipeline den Status nicht mehr nachfuehren.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bewacht wird nur der Eintritt in die Reservierung. Bewusst nicht bewacht:
  --   * der Weg aus der Reservierung heraus zum Verkauf, denn den fuehrt die
  --     Abwicklung nach, nicht der Vertrieb;
  --   * das Freigeben einer Reservierung, denn es faellt als Nebenwirkung an,
  --     wenn ein Kontakt verloren geht oder geloescht wird
  --     (`freeWohnungenForKunde` in `src/lib/objekteStore.ts`). Wuerde der
  --     Ausloeser dort zuschlagen, bliebe die Einheit dauerhaft auf einem
  --     Kunden stehen, den es nicht mehr gibt.
  -- Soll auch das Aufheben auf die vier Rollen begrenzt werden, ist das eine
  -- eigene Entscheidung und eine eigene Migration.
  wird_reserviert :=
       (NEW.status = 'reserviert' AND OLD.status IS DISTINCT FROM 'reserviert')
    OR (NEW.status = 'reserviert'
        AND NEW.kunde_id IS DISTINCT FROM OLD.kunde_id
        AND NEW.kunde_id IS NOT NULL);

  IF wird_reserviert AND NOT public.darf_reservieren(auth.uid()) THEN
    RAISE EXCEPTION
      'Reservieren duerfen nur Admin, Inhaber, Vertriebsleitung und Vertriebspartner.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wohnung_reservierung_pruefen ON public.wohnungen;
CREATE TRIGGER wohnung_reservierung_pruefen
  BEFORE UPDATE ON public.wohnungen
  FOR EACH ROW
  EXECUTE FUNCTION public.wohnung_reservierung_pruefen();

-- Dasselbe beim Anlegen: Eine Einheit darf nicht gleich als reserviert
-- entstehen, wenn die Rolle nicht reservieren darf.
CREATE OR REPLACE FUNCTION public.wohnung_reservierung_pruefen_neu()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'reserviert' AND NOT public.darf_reservieren(auth.uid()) THEN
    RAISE EXCEPTION
      'Reservierungen duerfen nur Admin, Inhaber, Vertriebsleitung und Vertriebspartner anlegen.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wohnung_reservierung_pruefen_neu ON public.wohnungen;
CREATE TRIGGER wohnung_reservierung_pruefen_neu
  BEFORE INSERT ON public.wohnungen
  FOR EACH ROW
  EXECUTE FUNCTION public.wohnung_reservierung_pruefen_neu();
