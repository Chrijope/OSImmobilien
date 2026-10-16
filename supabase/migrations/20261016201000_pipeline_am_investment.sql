-- Pipeline am Investment, Etappe 1: Daten angleichen (Freigabe Christian,
-- 11.10.2026).
--
-- Die Stufe gehoert nur noch ans Investment. Bisher stand sie zusaetzlich am
-- Kontakt, und bei einem Kunden mit genau einem Investment zeigte die
-- Pipeline bis zur Selbstauskunft die Kontaktstufe. Diese Migration
--   1. sichert alle Investments, die sie aendert,
--   2. legt Kontakten ohne Investment "Investment 1" an (auch Bestandskunden),
--   3. traegt bei Kunden mit genau einem Investment in einer fruehen Stufe die
--      bisher angezeigte Stufe des Kontakts am Investment ein (Kontaktstufe,
--      sonst Rueckfall ueber den Status), also genau das, was die Pipeline
--      heute zeigt,
--   4. fuehrt die Kontaktstufe kuenftig automatisch aus den Investments nach
--      (hoechste Stufe der laufenden Investments). Sie bleibt nur noch fuer
--      Altleser stehen und wird spaeter entfernt.
-- Die Kontaktstufe selbst wird hier nicht geaendert, es gehen keine Daten
-- verloren. Wiederholbar: Schritt 2 und 3 treffen beim zweiten Lauf nichts
-- mehr, die Sicherung wird nur beim ersten Lauf angelegt.
--
-- Zuruecksetzen bei Bedarf:
--   UPDATE public.investments i SET meta = s.meta
--   FROM public.investments_sicherung_20261011 s WHERE s.id = i.id;
--   DELETE FROM public.investments WHERE meta->>'nachgelegt_am' = '2026-10-11';
--   DROP TRIGGER IF EXISTS trg_kontakt_stufe_nachfuehren ON public.investments;

BEGIN;

-- ── Hilfsfunktion: Stufe wie normalizePipelineStufe (kontaktPipeline.ts) ────
-- Altschreibweisen auf ihre heutige Stufe, Unbekanntes auf NULL.
CREATE OR REPLACE FUNCTION public.pipeline_stufe_normalisieren(_stufe text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN s IN ('after_sales', 'aftersales') THEN 'faelligkeit'
    WHEN s = 'closing' THEN 'objektauswahl'
    WHEN s IN ('erstgespraech', 'termin_gebucht') THEN 'erstgespraech_geplant'
    WHEN s IN ('notar_mit_gs', 'notar_ohne_gs') THEN 'notar'
    WHEN public.buchung_pipeline_rang(s) >= 0 THEN s
    ELSE NULL
  END
  FROM (SELECT lower(btrim(COALESCE(_stufe, ''))) AS s) x;
$$;

-- ── Hilfsfunktion: die Stufe, die die Oberflaeche bisher fuer den Kontakt
-- zeigte (getEffectivePipelineStufe ohne Investments, kontaktPipeline.ts):
-- archiviert, verloren, dann die Kontaktstufe, dann der Rueckfall ueber den
-- Status. Nur fuer diese Migration.
CREATE OR REPLACE FUNCTION public.kontakt_anzeige_stufe_bisher(_meta jsonb, _status text, _archiviert boolean, _objekt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(_archiviert, false) THEN 'archiviert'
    WHEN _status IN ('verloren', 'inaktiv') THEN 'verloren'
    WHEN public.pipeline_stufe_normalisieren(_meta->>'pipelineStufe') IS NOT NULL
      THEN public.pipeline_stufe_normalisieren(_meta->>'pipelineStufe')
    WHEN _status = 'kunde' AND NULLIF(_objekt, '') IS NOT NULL THEN 'abgeschlossen'
    WHEN _status = 'kunde' THEN 'faelligkeit'
    WHEN _status = 'qualifiziert' THEN 'bonitaetsunterlagen'
    WHEN NULLIF(_meta->>'setterTerminDatum', '') IS NOT NULL
      OR NULLIF(_meta->>'beratungsgespraechAm', '') IS NOT NULL THEN 'erstgespraech_geplant'
    WHEN COALESCE(NULLIF(_meta->>'nichtErreichtCount', ''), '0') ~ '^[1-9][0-9]*$' THEN 'nicht_erreicht'
    WHEN _status = 'kontaktiert' THEN 'erreicht'
    ELSE 'neuer_lead'
  END;
$$;

-- ── 1. Sicherung der Investments, die Schritt 3 aendert ─────────────────────
CREATE TABLE IF NOT EXISTS public.investments_sicherung_20261011 AS
SELECT i.*
FROM public.investments i
JOIN public.kontakte k ON k.id = i.kunde_id
WHERE (SELECT count(*) FROM public.investments j WHERE j.kunde_id = k.id) = 1
  AND public.buchung_pipeline_rang(public.pipeline_stufe_normalisieren(i.meta->>'pipelineStufe')) < public.buchung_pipeline_rang('selbstauskunft')
  AND public.kontakt_anzeige_stufe_bisher(k.meta, k.status::text, k.archiviert, k.objekt)
      IS DISTINCT FROM public.pipeline_stufe_normalisieren(i.meta->>'pipelineStufe');
ALTER TABLE public.investments_sicherung_20261011 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.investments_sicherung_20261011 FROM anon, authenticated;

-- ── 2. Kontakte ohne Investment bekommen Investment 1 ───────────────────────
-- In der Stufe, die die Oberflaeche bisher fuer den Kontakt zeigte. Markiert mit
-- 'nachgelegt_am', damit sie sich wiederfinden lassen.
INSERT INTO public.investments (kunde_id, meta)
SELECT k.id, jsonb_build_object(
  'nummer', 1, 'label', 'Investment 1',
  'pipelineStufe', public.kontakt_anzeige_stufe_bisher(k.meta, k.status::text, k.archiviert, k.objekt),
  'nachgelegt_am', '2026-10-11'
)
FROM public.kontakte k
WHERE NOT EXISTS (SELECT 1 FROM public.investments i WHERE i.kunde_id = k.id);

-- ── 3. Genau ein Investment in fruehen Stufen: angezeigte Stufe uebernehmen ──
-- Nur dort zeigte die Pipeline die Kontaktstufe statt der Investmentstufe
-- (getHighestInvestmentStufe ignorierte alles vor der Selbstauskunft).
-- Ab der Selbstauskunft und bei Endzustaenden des Investments blieb schon
-- bisher die Investmentstufe sichtbar, dort aendert sich nichts.
UPDATE public.investments i
SET meta = jsonb_set(COALESCE(i.meta, '{}'::jsonb), '{pipelineStufe}',
                     to_jsonb(public.kontakt_anzeige_stufe_bisher(k.meta, k.status::text, k.archiviert, k.objekt)), true)
FROM public.kontakte k, public.investments_sicherung_20261011 s
WHERE s.id = i.id
  AND k.id = i.kunde_id
  AND public.buchung_pipeline_rang(public.pipeline_stufe_normalisieren(i.meta->>'pipelineStufe')) < public.buchung_pipeline_rang('selbstauskunft');

-- ── 4. Kontaktstufe aus den Investments nachfuehren ─────────────────────────
-- Hoechste Stufe der laufenden Investments. Laeuft keines mehr: abgeschlossen
-- vor Bestandsimport vor verloren vor archiviert. Schreibt nur bei einer
-- Aenderung, damit die Glocke (notify_vp_on_pipeline_change) nicht ohne
-- Anlass laeutet. Abrechnung und Abgeschlossen am Kontakt schuetzt weiter
-- pipeline_abschluss_schuetzen: Darf der Nutzer den Wechsel nicht, bleibt der
-- alte Wert stehen.
CREATE OR REPLACE FUNCTION public.kontakt_stufe_aus_investments(_kontakt uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH st AS (
    SELECT public.pipeline_stufe_normalisieren(meta->>'pipelineStufe') AS s
    FROM public.investments WHERE kunde_id = _kontakt
  )
  SELECT COALESCE(
    (SELECT s FROM st
     WHERE s IS NOT NULL AND s NOT IN ('abgeschlossen', 'bestandsimport', 'verloren', 'archiviert')
     ORDER BY public.buchung_pipeline_rang(s) DESC LIMIT 1),
    (SELECT s FROM st
     WHERE s IN ('abgeschlossen', 'bestandsimport', 'verloren', 'archiviert')
     ORDER BY array_position(ARRAY['abgeschlossen', 'bestandsimport', 'verloren', 'archiviert'], s) LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.kontakt_stufe_nachfuehren()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kontakt uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.kunde_id ELSE NEW.kunde_id END;
  _stufe text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.meta->>'pipelineStufe' IS NOT DISTINCT FROM NEW.meta->>'pipelineStufe'
     AND OLD.kunde_id IS NOT DISTINCT FROM NEW.kunde_id THEN
    RETURN NULL;
  END IF;
  -- Investment 1 beim Anlegen des Kontakts: Der Kontakt hat seine Stufe gerade
  -- erst bekommen. Sie hier umzuschreiben, liesse beim Partner sofort die
  -- Glocke "Pipeline-Stufe geaendert" laeuten, ohne dass etwas geschehen ist.
  IF TG_OP = 'INSERT'
     AND NOT EXISTS (SELECT 1 FROM public.investments WHERE kunde_id = _kontakt AND id <> NEW.id) THEN
    RETURN NULL;
  END IF;

  _stufe := public.kontakt_stufe_aus_investments(_kontakt);
  -- Ohne Investment mit erkennbarer Stufe bleibt der Kontakt, wie er ist.
  IF _stufe IS NOT NULL THEN
    UPDATE public.kontakte
    SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{pipelineStufe}', to_jsonb(_stufe), true)
    WHERE id = _kontakt
      AND (meta->>'pipelineStufe') IS DISTINCT FROM _stufe;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.kontakt_stufe_nachfuehren() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_kontakt_stufe_nachfuehren ON public.investments;
CREATE TRIGGER trg_kontakt_stufe_nachfuehren
AFTER INSERT OR UPDATE OF meta, kunde_id OR DELETE ON public.investments
FOR EACH ROW
EXECUTE FUNCTION public.kontakt_stufe_nachfuehren();

COMMIT;
