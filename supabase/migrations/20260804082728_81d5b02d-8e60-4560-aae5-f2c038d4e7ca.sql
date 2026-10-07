-- OSImmobilien: Kopie von 20260804140000 (inhaltsgleich), im Ursprung nach buchung_grundlage eingespielt.
-- Auf einer frischen Datenbank fehlt hier noch public.buchungen; dann wird dieser Block
-- uebersprungen und die benannten Einzelmigrationen spielen denselben Inhalt ein.
DO $osi_rahmen$ BEGIN
IF to_regclass('public.buchungen') IS NOT NULL THEN
EXECUTE $osi_paket$
ALTER TABLE public.buchung_terminarten
  DROP CONSTRAINT IF EXISTS buchung_terminarten_anlass_chk;
ALTER TABLE public.buchung_terminarten
  ADD CONSTRAINT buchung_terminarten_anlass_chk
  CHECK (anlass IN ('erstgespraech', 'beratung', 'objektvorstellung', 'sonstiges'));

ALTER TABLE public.buchungen
  DROP CONSTRAINT IF EXISTS buchungen_anlass_chk;
ALTER TABLE public.buchungen
  ADD CONSTRAINT buchungen_anlass_chk
  CHECK (anlass IN ('erstgespraech', 'beratung', 'objektvorstellung', 'sonstiges'));

ALTER TABLE public.videoraeume
  DROP CONSTRAINT IF EXISTS videoraeume_art_chk;
ALTER TABLE public.videoraeume
  ADD CONSTRAINT videoraeume_art_chk
  CHECK (art IN ('erstgespraech', 'beratung', 'objektvorstellung', 'sonstiges'))
$osi_paket$;
END IF;
END $osi_rahmen$;
