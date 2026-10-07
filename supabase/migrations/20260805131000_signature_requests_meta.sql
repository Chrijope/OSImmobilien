-- Merkfeld fuer die Signatur-Erinnerung
--
-- Die Function `signatur-erinnerung` muss sich merken, ob sie zu einer
-- Unterschriftsanfrage schon erinnert (erinnert_at) oder schon eine Aufgabe
-- angelegt hat (aufgabe_at). Ohne dieses Feld liefen ihre Abfragen ins Leere.
ALTER TABLE public.signature_requests
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.signature_requests.meta IS
  'Zusatzinformationen, u.a. erinnert_at und aufgabe_at fuer die Function signatur-erinnerung.';
