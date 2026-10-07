-- Videoraum: bis zu vier Teilnehmer gleichzeitig (Gastgeber plus drei Gaeste).
--
-- Die Verbindungen laufen als Netz von Paarverbindungen im Browser, die
-- Datenbank muss dafuer nichts Neues koennen. Was sie aber technisch
-- erzwingen soll, ist die Obergrenze: Der Einlass-Knopf ist zwar gesperrt,
-- sobald drei Gaeste drin sind, aber ein ausgegrauter Knopf ist keine
-- Kontrolle. Dieser Trigger lehnt den vierten Gast auch dann ab, wenn zwei
-- Gastgeberfenster gleichzeitig einlassen oder jemand direkt auf der Tabelle
-- schreibt.
--
-- Der Gastgeber selbst steht nicht in `videoraum_teilnehmer`, deshalb ist die
-- Grenze hier drei aktive Gaeste je Raum.
--
-- Der Code kommt ausdruecklich auch ohne diese Migration aus: Ohne den
-- Trigger greift weiterhin die Sperre im Knopf und in der Verbindungsschicht,
-- es fehlt nur das harte Netz darunter.

CREATE OR REPLACE FUNCTION public.videoraum_begrenze_teilnehmer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Nur pruefen, wenn jemand aktiv wird. Wer beendet oder abgewiesen wird,
  -- macht Platz und braucht keine Pruefung.
  IF NEW.status IN ('eingelassen', 'im_gespraech')
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('eingelassen', 'im_gespraech')) THEN
    IF (
      SELECT count(*)
      FROM public.videoraum_teilnehmer t
      WHERE t.raum_id = NEW.raum_id
        AND t.id <> NEW.id
        AND t.status IN ('eingelassen', 'im_gespraech')
    ) >= 3 THEN
      RAISE EXCEPTION 'Der Raum ist voll, hoechstens vier Teilnehmer';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS videoraum_teilnehmer_begrenzung ON public.videoraum_teilnehmer;
CREATE TRIGGER videoraum_teilnehmer_begrenzung
  BEFORE INSERT OR UPDATE ON public.videoraum_teilnehmer
  FOR EACH ROW EXECUTE FUNCTION public.videoraum_begrenze_teilnehmer();
