/*
 * Weekly Call: Die eingetragenen Punkte sind wieder fuer alle Teilnehmer
 * sichtbar, weiterhin ohne Verfasser.
 *
 * Das kehrt 20260824160000_weekly_call_nur_eigene_punkte.sql um. Dort war
 * gewollt, dass die Partner sich untereinander gar nicht lesen. Am 26.08.2026
 * hat Christian ausdruecklich das Gegenteil verlangt: Wer einen Punkt
 * eintraegt, soll ihn allgemein sichtbar machen, damit alle vor dem Call
 * wissen, worum es geht. Das ist eine bewusste Entscheidung und kein
 * versehentlicher Rueckschritt.
 *
 * Unveraendert bleiben drei Dinge:
 *
 * 1. Anonymitaet. Die Funktion gibt weiterhin keine Verfasser-ID heraus, nur
 *    das Kennzeichen "von mir" fuer die eigene Zeile. Genau dafuer ist sie
 *    SECURITY DEFINER: Die Leserechte der Tabelle selbst bleiben auf die
 *    eigenen Zeilen beschraenkt, damit niemand die Rohdaten samt user_id
 *    abfragen kann.
 * 2. Aendern und Loeschen. Das erlauben die Policies wcp_update_eigene und
 *    wcp_delete_eigene nach wie vor nur am eigenen Punkt und nur, solange der
 *    Call noch aussteht. Hier wird daran nichts angefasst.
 * 3. Bereits eingetragene Punkte. Es werden keine Daten veraendert, nur zwei
 *    Lesefunktionen neu geschrieben.
 */

CREATE OR REPLACE FUNCTION public.weekly_call_punkte_lesen(_termin date DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  text text,
  call_termin date,
  von_mir boolean,
  besprochen boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT p.id,
         p.text,
         p.call_termin,
         p.user_id = auth.uid() AS von_mir,
         p.besprochen_am IS NOT NULL AS besprochen,
         p.created_at
    FROM public.weekly_call_punkte p
   WHERE public.is_internal_role(auth.uid())
     AND p.call_termin = COALESCE(_termin, public.weekly_call_woche())
   ORDER BY p.created_at ASC;
$$;

COMMENT ON FUNCTION public.weekly_call_punkte_lesen(date) IS
  'Punkte eines Weekly Sales Call fuer alle internen Rollen, ohne Verfasser. '
  'Sichtbarkeit am 26.08.2026 bewusst von "nur eigene" auf "alle" geaendert.';

-- Die Rueckschau zaehlt entsprechend wieder alle Punkte eines Termins. Sonst
-- stuende dort eine kleinere Zahl, als beim Aufklappen zu sehen ist.
CREATE OR REPLACE FUNCTION public.weekly_call_termine()
RETURNS TABLE (call_termin date, anzahl bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT t.call_termin, count(p.id) AS anzahl
    FROM (
      SELECT call_termin FROM public.weekly_call_punkte
      UNION
      SELECT call_termin FROM public.weekly_call_protokolle
    ) t
    LEFT JOIN public.weekly_call_punkte p ON p.call_termin = t.call_termin
   WHERE public.is_internal_role(auth.uid())
   GROUP BY t.call_termin
   ORDER BY t.call_termin DESC;
$$;
