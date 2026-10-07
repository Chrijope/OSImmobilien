-- Bewerber-Fragebogen: Telefonnummer für die Vorbelegung auf der Formularseite.
--
-- Der Abschluss-Schritt des Fragebogens fragt "Unter dieser Nummer, richtig?".
-- Bisher lieferte get_bewerber_formular keine Nummer, das Feld war leer und
-- die Frage ergab keinen Sinn. Jetzt kommt die Telefonnummer der Bewerbung
-- mit, und zwar nur diese eine Angabe: Weder die Bewerbungs-Kennung noch
-- E-Mail oder bereits gegebene Antworten verlassen die Datenbank auf diesem
-- Weg. Die Nummer wird zudem nur herausgegeben, solange der Link offen und
-- nicht abgelaufen ist. Wer ein altes Token kennt, sieht nichts.
--
-- Der Rückgabetyp der Funktion ändert sich, deshalb DROP und neu anlegen.
-- Die Rechte werden anschließend wie in 20260819180000 gesetzt.
--
-- Der Code läuft auch ohne diese Migration: Fehlt die Spalte telefon in der
-- Antwort, bleibt das Feld leer und der Bewerber tippt seine Nummer selbst.

DROP FUNCTION IF EXISTS public.get_bewerber_formular(text);

CREATE FUNCTION public.get_bewerber_formular(_token text)
RETURNS TABLE (
  vorname text,
  status text,
  expires_at timestamptz,
  telefon text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.vorname,
    f.status,
    f.expires_at,
    CASE
      WHEN f.status = 'offen' AND f.expires_at > now() THEN b.telefon
      ELSE NULL
    END AS telefon
  FROM public.bewerber_formular f
  LEFT JOIN public.bewerbungen b ON b.id = f.bewerbung_id
  WHERE f.token = _token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_bewerber_formular(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_bewerber_formular(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_bewerber_formular(text) IS
  'Öffentliche Leseabfrage für die Formularseite. Liefert Vorname, Status, Ablaufdatum und, solange der Link offen ist, die Telefonnummer zur Vorbelegung.';
