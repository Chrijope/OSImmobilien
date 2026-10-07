-- Aufgaben einem Investment zuordnen.
--
-- Die Pipeline zeigt pro Investment eine eigene Kachel. Ein Kunde mit zwei
-- Wohnungen hat also zwei Kacheln, oft in verschiedenen Stufen. Eine Aufgabe
-- kannte bisher nur den Kunden. Sie erschien deshalb auf jeder Kachel dieses
-- Kunden, auch dort, wo sie nichts zu suchen hatte.
--
-- Die Spalte bleibt bewusst optional: Eine Aufgabe, die den Kunden als Ganzes
-- betrifft, etwa ein Geburtstagsanruf, gehört zu keinem einzelnen Investment
-- und erscheint weiterhin auf allen Kacheln.

ALTER TABLE public.aufgaben
  ADD COLUMN IF NOT EXISTS investment_id UUID REFERENCES public.investments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS aufgaben_investment_idx
  ON public.aufgaben (investment_id, status, faellig_am);
