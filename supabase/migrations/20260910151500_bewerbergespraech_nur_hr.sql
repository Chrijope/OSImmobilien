-- ===========================================================================
-- Das Bewerbergespraech gehoert der Rolle hr, und nur ihr
-- ===========================================================================
--
-- WAS SICH AENDERT
--
-- `bewerber_termin_gastgeber()` verlangt bisher **keine** Rolle. Sie bevorzugt
-- `hr` nur in der Sortierung und nimmt sonst jeden, der eine aktive Terminart
-- mit dem Anlass 'bewerbergespraech' und einen Wochenplan hat. Der Kommentar
-- in 20260906120000 nennt das ausdruecklich Punkt 2: "Sonst jeder andere".
--
-- Das war der Rueckfall fuer die Erprobung, damit ein Administrator die
-- Gespraeche fuehren konnte, solange die HR-Managerin ihren Wochenplan noch
-- nicht gepflegt hatte.
--
-- Seit dem 10.09.2026 duerfen auch hr, vertriebsleiter und vertriebspartner
-- eigene Terminarten anlegen (Migration 20260910143000). Damit wird aus dem
-- Rueckfall eine Luecke: Legt sich ein Vertriebspartner eine Terminart mit
-- diesem Anlass an, kann die Datenbank **ihn** als Gastgeber aller Bewerber
-- waehlen. Das faellt niemandem auf, bis ein Bewerber im falschen Kalender
-- landet.
--
-- Deshalb ist die Rolle `hr` jetzt Bedingung, nicht Vorliebe. Wer den Anlass
-- ohne diese Rolle verwendet, sieht seine Terminart weiterhin in seinem
-- eigenen Buchungskalender. Sie hat nur mit dem Bewerberprozess nichts mehr
-- zu tun.
--
-- WAS DAS KOSTET, UND ZWAR BEWUSST
--
-- Ohne eine Person mit der Rolle hr, aktiver Terminart und Wochenplan ist
-- **keine** Terminbuchung mehr moeglich. Die Buchungsseite zeigt dann ihren
-- Abschlusstext, nichts sieht kaputt aus, es geht nur nichts. Das ist der
-- Preis dafuer, dass niemand versehentlich Gastgeber wird. Verliert die
-- HR-Managerin ihre Rolle, muss jemand nachziehen.
--
-- Tragen mehrere Personen die Rolle hr, gewinnt die kleinste Nutzerkennung.
-- Willkuerlich, aber stabil, wie zuvor.
--
-- Wiederholbar: die Funktion wird ersetzt.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.bewerber_termin_gastgeber()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.mitarbeiter_id
  FROM public.buchung_terminarten t
  WHERE t.anlass = 'bewerbergespraech'
    AND t.aktiv
    AND EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = t.mitarbeiter_id AND r.role::text = 'hr'
    )
    AND EXISTS (
      SELECT 1 FROM public.buchung_verfuegbarkeiten v
      WHERE v.mitarbeiter_id = t.mitarbeiter_id
        AND v.wochentag IS NOT NULL
        AND NOT v.geschlossen
    )
  ORDER BY t.mitarbeiter_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.bewerber_termin_gastgeber() FROM public;

-- Prueflauf: Wer ist jetzt Gastgeberin? NULL heisst, es geht niemand.
--   select public.bewerber_termin_gastgeber();
