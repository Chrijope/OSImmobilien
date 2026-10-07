-- Bestandsdaten-Migration: Pipeline-Reihenfolge getauscht (Bonität jetzt vor Closing)
-- 
-- Neue Logik:
--   1. SA unterschrieben → mind. "bonitaetsunterlagen"
--   2. Alle Bonitätsdocs approved + unterlagenFreigegebenAm gesetzt → "closing"
--   3. RV eröffnet (rvPdfFilename) + nicht signed + Mindest-Docs → "objektauswahl"
--   4. RV signed → "reservierung"
--   5. RV signed + freigegeben → "finanzierung" (nur wenn Finanzierungsangebot existiert)
--   6. Notartermin gesetzt → "notar"
--
-- Diese Migration berechnet die korrekte Stufe und überschreibt nur dort, wo die alte
-- Logik einen FALSCHEN Status produziert hat (z.B. "closing" obwohl SA noch nicht signed).

-- Helper: prüft ob ein Kontakt mind. ein Investment mit gegebenem Meta-Flag hat
DO $$
DECLARE
  k RECORD;
  inv RECORD;
  has_sa_signed BOOLEAN;
  has_rv_signed BOOLEAN;
  has_rv_opened BOOLEAN;
  has_notar_termin BOOLEAN;
  has_min_docs BOOLEAN;
  all_bonitaet_approved BOOLEAN;
  unterlagen_freigegeben BOOLEAN;
  alte_stufe TEXT;
  neue_stufe TEXT;
  doc_statuses JSONB;
  required_docs TEXT[] := ARRAY['Selbstauskunft','Personalausweis','Letzter Gehaltsnachweis','Vorletzter Gehaltsnachweis','Vorvorletzter Gehaltsnachweis','Gehaltsnachweis Dezember Vorjahr'];
  d TEXT;
  approved_count INT;
  migration_count INT := 0;
BEGIN
  FOR k IN SELECT id, meta FROM kontakte WHERE COALESCE(geloescht, false) = false LOOP
    has_sa_signed := false;
    has_rv_signed := false;
    has_rv_opened := false;
    has_notar_termin := false;
    has_min_docs := false;
    all_bonitaet_approved := false;
    unterlagen_freigegeben := COALESCE((k.meta ->> 'unterlagenFreigegebenAm') IS NOT NULL, false);
    alte_stufe := COALESCE(k.meta ->> 'pipelineStufe', '');

    FOR inv IN SELECT id, meta FROM investments WHERE kunde_id = k.id::text LOOP
      IF COALESCE((inv.meta ->> 'saSigned')::boolean, false) THEN
        has_sa_signed := true;
      END IF;
      IF COALESCE((inv.meta ->> 'rvSigned')::boolean, false) THEN
        has_rv_signed := true;
      END IF;
      IF (inv.meta ->> 'rvPdfFilename') IS NOT NULL OR (inv.meta ->> 'reservierungEroeffnetAm') IS NOT NULL THEN
        has_rv_opened := true;
      END IF;
      IF (inv.meta ->> 'notarTermin') IS NOT NULL AND (inv.meta ->> 'notarUhrzeit') IS NOT NULL THEN
        has_notar_termin := true;
      END IF;
      doc_statuses := COALESCE(inv.meta -> 'docStatuses', '{}'::jsonb);
      -- Mindest-Docs
      IF (doc_statuses ->> 'Personalausweis' IN ('uploaded','approved'))
         AND (doc_statuses ->> 'Letzter Gehaltsnachweis' IN ('uploaded','approved')) THEN
        has_min_docs := true;
      END IF;
      -- All bonität approved?
      approved_count := 0;
      FOREACH d IN ARRAY required_docs LOOP
        IF doc_statuses ->> d = 'approved' THEN approved_count := approved_count + 1; END IF;
      END LOOP;
      IF approved_count = array_length(required_docs, 1) THEN
        all_bonitaet_approved := true;
      END IF;
    END LOOP;

    -- Logische Stufe berechnen (höchste zuerst)
    neue_stufe := NULL;
    IF has_notar_termin THEN
      neue_stufe := 'notar';
    ELSIF has_rv_signed AND all_bonitaet_approved AND unterlagen_freigegeben THEN
      neue_stufe := 'finanzierung';
    ELSIF has_rv_signed THEN
      neue_stufe := 'reservierung';
    ELSIF has_rv_opened AND has_min_docs THEN
      neue_stufe := 'objektauswahl';
    ELSIF all_bonitaet_approved AND unterlagen_freigegeben THEN
      neue_stufe := 'closing';
    ELSIF has_sa_signed THEN
      neue_stufe := 'bonitaetsunterlagen';
    END IF;

    -- Nur überschreiben, wenn neue Stufe HÖHER/KORREKTER ist als die alte
    -- ODER alte Stufe inkonsistent ist (z.B. "closing" ohne all_bonitaet_approved)
    IF neue_stufe IS NOT NULL AND alte_stufe <> neue_stufe THEN
      -- Spezialfall: "closing" ohne Bonität+Freigabe → zurücksetzen auf neue_stufe
      -- Spezialfall: "bonitaetsunterlagen" mit allen Approvals + Freigabe → vorrücken auf "closing"
      IF (alte_stufe = 'closing' AND NOT (all_bonitaet_approved AND unterlagen_freigegeben))
         OR (alte_stufe = 'bonitaetsunterlagen' AND all_bonitaet_approved AND unterlagen_freigegeben)
         OR (alte_stufe IN ('neuer_lead','kontaktversuche','follow_up','erstgespraech') AND has_sa_signed)
         OR (alte_stufe = 'objektauswahl' AND has_rv_signed)
         OR (alte_stufe = 'reservierung' AND has_notar_termin)
      THEN
        UPDATE kontakte
          SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('pipelineStufe', neue_stufe, 'pipelineStufeMigriertAm', now()),
              aktualisiert_am = now()
          WHERE id = k.id;
        migration_count := migration_count + 1;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Pipeline-Migration: % Kontakte aktualisiert', migration_count;
END $$;