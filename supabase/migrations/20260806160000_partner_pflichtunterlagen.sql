-- ===========================================================================
-- Pflichtunterlagen des Partners: Personalausweis und § 34c GewO
-- ===========================================================================
--
-- Beim ersten Anmelden muss ein Partner zwei Dinge erledigen, bevor das CRM
-- sich öffnet:
--
--   1. Personalausweis hochladen
--   2. Angeben, ob eine Erlaubnis nach § 34c GewO vorliegt, und sie
--      hochladen, falls ja
--
-- Die Academy beschreibt seit jeher ein solches System mit Ampelstatus. Es hat
-- nur nie existiert: keine Tabelle, kein Speicherort, keine Prüfung. Diese
-- Migration legt die Grundlage.
--
-- Bewusst schlicht gehalten, auf Ansage:
--
--   Keine Prüfung. Hochgeladen genügt, niemand gibt frei. Ein unleserliches
--   Foto fällt damit nicht auf, das ist der bewusst in Kauf genommene Preis
--   für ein Onboarding ohne Wartezeit.
--
--   Kein Ablaufdatum. Ein Personalausweis läuft ab, hier wird das nicht
--   verfolgt. Nachrüstbar, dann fehlt das Datum aber bei allen bis dahin
--   hochgeladenen Ausweisen.
--
--   Fehlender § 34c blockiert nicht. Er ist eine Information für Admin,
--   Backoffice und Vertriebsleitung, kein Riegel.

-- ── Speicherort ────────────────────────────────────────────────────────────
--
-- Eigener, nicht öffentlicher Bucket. Ausweiskopien sind besonders geschützte
-- Daten und dürfen unter keinen Umständen über eine erratbare Adresse
-- erreichbar sein.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'partner-unterlagen', 'partner-unterlagen', false,
  20971520,  -- 20 MB, wie in der Academy beschrieben
  -- Nur PDF und JPEG, auf Ansage. Die Beschraenkung greift schon im Bucket
  -- und nicht erst in der Oberflaeche: Ein Upload am Formular vorbei wird
  -- damit ebenfalls abgewiesen.
  -- image/jpg steht mit dabei, weil manche Handykameras diesen falschen, aber
  -- verbreiteten Typ senden. Ohne ihn scheitert ein Upload, der aussieht wie
  -- ein ganz gewoehnliches Foto.
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- ── Tabelle ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.partner_unterlagen (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'personalausweis' oder 'gewerbeerlaubnis_34c'
  art          text NOT NULL,
  -- Pfad im Bucket partner-unterlagen.
  pfad         text NOT NULL,
  dateiname    text NOT NULL,
  groesse      bigint,
  mime_typ     text,
  hochgeladen_am timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_unterlagen_art_check
    CHECK (art IN ('personalausweis', 'personalausweis_rueckseite', 'gewerbeerlaubnis_34c')),
  -- Je Art nur ein Dokument. Ein zweiter Upload ersetzt den ersten, statt
  -- dass sich Fassungen stapeln und niemand weiss, welche gilt.
  CONSTRAINT partner_unterlagen_einmalig UNIQUE (user_id, art)
);

CREATE INDEX IF NOT EXISTS partner_unterlagen_user_idx
  ON public.partner_unterlagen (user_id);

COMMENT ON TABLE public.partner_unterlagen IS
  'Pflichtunterlagen eines Partners aus dem Onboarding. Die Datei liegt im '
  'Bucket partner-unterlagen, hier stehen nur die Angaben dazu.';

-- ── Merkmale am Profil ─────────────────────────────────────────────────────
--
-- Die Angabe zum § 34c gehört zum Profil, nicht zur Datei: Sie existiert auch
-- dann, wenn keine Datei hochgeladen wird, nämlich bei "nicht vorhanden".

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gewerbeerlaubnis_34c boolean,
  ADD COLUMN IF NOT EXISTS onboarding_abgeschlossen_am timestamptz,
  /*
   * Stichtag der Schonfrist für Bestandspartner.
   *
   * Wer heute schon im CRM arbeitet, soll am Montag nicht vor einer
   * verschlossenen Tür stehen. Er sieht einen Hinweis mit Restfrist und kann
   * weiterarbeiten, bis dieses Datum erreicht ist. Neue Partner bekommen
   * keinen Stichtag und sind sofort in der Pflicht.
   */
  ADD COLUMN IF NOT EXISTS unterlagen_frist_bis timestamptz;

COMMENT ON COLUMN public.profiles.gewerbeerlaubnis_34c IS
  'true = liegt vor, false = liegt nicht vor, NULL = noch nicht angegeben. '
  'Ein false blockiert nichts, es ist eine Information fuer die Leitung.';

-- Allen heute vorhandenen Nutzern eine Frist von 30 Tagen einräumen.
UPDATE public.profiles
   SET unterlagen_frist_bis = now() + interval '30 days'
 WHERE unterlagen_frist_bis IS NULL;

-- ── Zugriffsrechte ─────────────────────────────────────────────────────────

ALTER TABLE public.partner_unterlagen ENABLE ROW LEVEL SECURITY;

/*
 * Wer die Unterlagen sehen darf.
 *
 * Der Partner selbst, damit er sieht was er hochgeladen hat. Dazu Admin,
 * Inhaber, Backoffice und Vertriebsleitung. Ausdruecklich NICHT andere
 * Vertriebspartner: Ein Ausweis geht Kollegen nichts an.
 */
CREATE POLICY "Eigene Unterlagen und Leitung duerfen lesen"
  ON public.partner_unterlagen FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'inhaber')
    OR public.has_role(auth.uid(), 'backoffice')
    OR public.has_role(auth.uid(), 'vertriebsleiter')
  );

-- Hochladen darf jeder nur fuer sich selbst.
CREATE POLICY "Nur eigene Unterlagen anlegen"
  ON public.partner_unterlagen FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Nur eigene Unterlagen ersetzen"
  ON public.partner_unterlagen FOR UPDATE
  USING (user_id = auth.uid());

/*
 * Loeschen nur durch Admin und Inhaber.
 *
 * Nicht durch den Partner selbst: Sonst laedt jemand hoch, das CRM oeffnet
 * sich, und er loescht die Datei gleich wieder. Wer ein falsches Dokument
 * erwischt hat, laedt einfach neu hoch, das ersetzt die alte Fassung.
 */
CREATE POLICY "Nur die Leitung darf loeschen"
  ON public.partner_unterlagen FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber')
  );

-- ── Zugriff auf die Dateien im Bucket ──────────────────────────────────────
--
-- Dieselbe Regel wie auf der Tabelle. Der Pfad beginnt mit der Nutzerkennung,
-- daran haengt die Zuordnung.

CREATE POLICY "Partnerunterlagen lesen"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'partner-unterlagen'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'inhaber')
      OR public.has_role(auth.uid(), 'backoffice')
      OR public.has_role(auth.uid(), 'vertriebsleiter')
    )
  );

CREATE POLICY "Partnerunterlagen hochladen"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'partner-unterlagen'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Eigene Partnerunterlagen ersetzen"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'partner-unterlagen'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Partnerunterlagen loeschen nur Leitung"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'partner-unterlagen'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'inhaber'))
  );
