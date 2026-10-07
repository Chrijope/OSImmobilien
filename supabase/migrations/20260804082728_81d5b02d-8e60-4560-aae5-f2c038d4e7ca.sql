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
  CHECK (art IN ('erstgespraech', 'beratung', 'objektvorstellung', 'sonstiges'));