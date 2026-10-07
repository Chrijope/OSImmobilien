-- ===========================================================================
-- Dokumenten-Ampel: Freigabe je Unterlage fuer Kunden
-- ===========================================================================
--
-- Welche Unterlage ein Kunde sieht, entscheidet die Ampel im Code
-- (`supabase/functions/_shared/dokument-freigabe.ts`): Gruen geht von
-- selbst hinaus, Gelb erst nach einer Freigabe, Rot (Mietvertrag,
-- Grundbuch) nie im Original, hoechstens als vom Admin geprueft
-- geschwaerzte und freigegebene Kopie. Diese Migration legt ab, was Admin
-- und Inhaber je Unterlage davon abweichend entscheiden.
--
--   1. Neue Spalten an `objekt_dokumente` und `wohnungs_dokumente`:
--        kunden_freigabe      'frei', 'gesperrt' oder leer. Leer heisst:
--                             Grundregel der Ampel.
--        kunden_freigabe_von  wer zuletzt entschieden hat
--        kunden_freigabe_am   wann
--        geschwaerzt          vom Admin als geschwaerzt geprueft. Zaehlt nur
--                             bei roten Unterlagen.
--
--   2. `setze_kunden_freigabe(p_tabelle, p_id, p_freigabe, p_geschwaerzt)`:
--      der einzige Weg, diese Spalten aus dem Browser zu aendern. Nur Admin
--      und Inhaber (`is_admin_role`). Antwortet mit jsonb, `ok` und bei
--      Ablehnung `grund`.
--
--   3. Ausloeser `dokument_kundenfreigabe_schuetzen` an beiden Tabellen.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Die Spalten
-- ---------------------------------------------------------------------------

ALTER TABLE public.objekt_dokumente
  ADD COLUMN IF NOT EXISTS kunden_freigabe text,
  ADD COLUMN IF NOT EXISTS kunden_freigabe_von uuid,
  ADD COLUMN IF NOT EXISTS kunden_freigabe_am timestamptz,
  ADD COLUMN IF NOT EXISTS geschwaerzt boolean NOT NULL DEFAULT false;

ALTER TABLE public.wohnungs_dokumente
  ADD COLUMN IF NOT EXISTS kunden_freigabe text,
  ADD COLUMN IF NOT EXISTS kunden_freigabe_von uuid,
  ADD COLUMN IF NOT EXISTS kunden_freigabe_am timestamptz,
  ADD COLUMN IF NOT EXISTS geschwaerzt boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objekt_dokumente_kunden_freigabe_check') THEN
    ALTER TABLE public.objekt_dokumente
      ADD CONSTRAINT objekt_dokumente_kunden_freigabe_check
      CHECK (kunden_freigabe IS NULL OR kunden_freigabe IN ('frei', 'gesperrt'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wohnungs_dokumente_kunden_freigabe_check') THEN
    ALTER TABLE public.wohnungs_dokumente
      ADD CONSTRAINT wohnungs_dokumente_kunden_freigabe_check
      CHECK (kunden_freigabe IS NULL OR kunden_freigabe IN ('frei', 'gesperrt'));
  END IF;
END $$;

COMMENT ON COLUMN public.objekt_dokumente.kunden_freigabe IS
  'Entscheidung von Admin oder Inhaber: frei oder gesperrt. Leer heisst Grundregel der Ampel (dokument-freigabe.ts). Aendern nur ueber setze_kunden_freigabe.';
COMMENT ON COLUMN public.objekt_dokumente.geschwaerzt IS
  'Vom Admin als geschwaerzt geprueft. Nur dann darf eine rote Unterlage (Mietvertrag, Grundbuch) ueberhaupt freigegeben werden.';
COMMENT ON COLUMN public.wohnungs_dokumente.kunden_freigabe IS
  'Entscheidung von Admin oder Inhaber: frei oder gesperrt. Leer heisst Grundregel der Ampel (dokument-freigabe.ts). Aendern nur ueber setze_kunden_freigabe.';
COMMENT ON COLUMN public.wohnungs_dokumente.geschwaerzt IS
  'Vom Admin als geschwaerzt geprueft. Nur dann darf eine rote Unterlage (Mietvertrag, Grundbuch) ueberhaupt freigegeben werden.';


-- ---------------------------------------------------------------------------
-- 2) Umschalten, nur Admin und Inhaber
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.setze_kunden_freigabe(
  p_tabelle text,
  p_id uuid,
  p_freigabe text,
  p_geschwaerzt boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_freigabe text := nullif(lower(trim(coalesce(p_freigabe, ''))), '');
  v_treffer uuid;
  v_geschwaerzt boolean;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_role(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  END IF;

  IF v_freigabe IS NOT NULL AND v_freigabe NOT IN ('frei', 'gesperrt') THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'ungueltiger_wert');
  END IF;

  IF p_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'nicht_gefunden');
  END IF;

  -- Die Tabelle nur aus dieser festen Liste, nie als zusammengesetzter Text.
  IF p_tabelle = 'objekt_dokumente' THEN
    UPDATE public.objekt_dokumente
       SET kunden_freigabe = v_freigabe,
           geschwaerzt = coalesce(p_geschwaerzt, geschwaerzt, false),
           kunden_freigabe_von = v_uid,
           kunden_freigabe_am = now()
     WHERE id = p_id
    RETURNING id, geschwaerzt INTO v_treffer, v_geschwaerzt;
  ELSIF p_tabelle = 'wohnungs_dokumente' THEN
    UPDATE public.wohnungs_dokumente
       SET kunden_freigabe = v_freigabe,
           geschwaerzt = coalesce(p_geschwaerzt, geschwaerzt, false),
           kunden_freigabe_von = v_uid,
           kunden_freigabe_am = now()
     WHERE id = p_id
    RETURNING id, geschwaerzt INTO v_treffer, v_geschwaerzt;
  ELSE
    RETURN jsonb_build_object('ok', false, 'grund', 'unbekannte_tabelle');
  END IF;

  IF v_treffer IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'nicht_gefunden');
  END IF;

  RETURN jsonb_build_object('ok', true, 'kunden_freigabe', v_freigabe, 'geschwaerzt', v_geschwaerzt);
END;
$$;

REVOKE ALL ON FUNCTION public.setze_kunden_freigabe(text, uuid, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.setze_kunden_freigabe(text, uuid, text, boolean) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3) Der Ausloeser, der die Spalten schuetzt
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dokument_kundenfreigabe_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Rechte: Nur Admin und Inhaber entscheiden. Laeufe ohne angemeldeten
  -- Nutzer (Dienstrolle, Import, SQL-Editor) bleiben aussen vor.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_role(auth.uid()) THEN
    IF TG_OP = 'INSERT' THEN
      NEW.kunden_freigabe := NULL;
      NEW.kunden_freigabe_von := NULL;
      NEW.kunden_freigabe_am := NULL;
      NEW.geschwaerzt := false;
    ELSE
      NEW.kunden_freigabe := OLD.kunden_freigabe;
      NEW.kunden_freigabe_von := OLD.kunden_freigabe_von;
      NEW.kunden_freigabe_am := OLD.kunden_freigabe_am;
      NEW.geschwaerzt := OLD.geschwaerzt;
    END IF;
  END IF;

  -- Neue Datei: Eine Freigabe galt der alten. `gesperrt` bleibt stehen, denn
  -- eine Sperre zu verlieren waere die unsichere Richtung.
  IF TG_OP = 'UPDATE' AND NEW.url IS DISTINCT FROM OLD.url THEN
    IF NEW.kunden_freigabe = 'frei' THEN
      NEW.kunden_freigabe := NULL;
      NEW.kunden_freigabe_von := NULL;
      NEW.kunden_freigabe_am := NULL;
    END IF;
    NEW.geschwaerzt := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dokument_kundenfreigabe_schuetzen ON public.objekt_dokumente;
CREATE TRIGGER dokument_kundenfreigabe_schuetzen
  BEFORE INSERT OR UPDATE ON public.objekt_dokumente
  FOR EACH ROW
  EXECUTE FUNCTION public.dokument_kundenfreigabe_schuetzen();

DROP TRIGGER IF EXISTS dokument_kundenfreigabe_schuetzen ON public.wohnungs_dokumente;
CREATE TRIGGER dokument_kundenfreigabe_schuetzen
  BEFORE INSERT OR UPDATE ON public.wohnungs_dokumente
  FOR EACH ROW
  EXECUTE FUNCTION public.dokument_kundenfreigabe_schuetzen();

-- PostgREST soll die neue Funktion und die Spalten sofort kennen.
NOTIFY pgrst, 'reload schema';