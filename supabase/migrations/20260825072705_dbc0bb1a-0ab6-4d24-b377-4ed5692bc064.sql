/*
 * Weekly Call: Jeder sieht nur seine eigenen Punkte.
 *
 * Bisher sah jeder die ganze Liste, nur ohne Namen. Gewollt ist jetzt, dass
 * die Partner sich untereinander gar nicht lesen.
 *
 * Die Aufsicht sieht weiterhin alle Punkte, aber unveraendert ohne Verfasser.
 * Ohne sie haette der Call keine Grundlage: Niemand koennte die eingetragenen
 * Themen aufgreifen, und die Funktion waere ein Postfach ohne Empfaenger.
 *
 * Aufzeichnung, Transkript und Zusammenfassung bleiben fuer alle sichtbar.
 * Sie haengen am Termin, nicht an einer Person, und stehen in einer eigenen
 * Tabelle, deren Leserechte hier nicht angefasst werden.
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
     AND (
       p.user_id = auth.uid()
       OR public.is_admin_role(auth.uid())
       OR public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role)
     )
   ORDER BY p.created_at ASC;
$$;

-- Auch die Rueckschau zaehlt nur, was der Nutzer sehen darf. Sonst stuende an
-- einem Termin "7 Punkte" und aufgeklappt waere nur einer da.
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
       WHERE user_id = auth.uid()
          OR public.is_admin_role(auth.uid())
          OR public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role)
      UNION
      SELECT call_termin FROM public.weekly_call_protokolle
    ) t
    LEFT JOIN public.weekly_call_punkte p
           ON p.call_termin = t.call_termin
          AND (
            p.user_id = auth.uid()
            OR public.is_admin_role(auth.uid())
            OR public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role)
          )
   WHERE public.is_internal_role(auth.uid())
   GROUP BY t.call_termin
   ORDER BY t.call_termin DESC;
$$;