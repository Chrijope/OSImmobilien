-- ===========================================================================
-- HR darf die eigenen Verfuegbarkeiten im Buchungskalender pflegen
-- ===========================================================================
--
-- BEFUND
--
-- Die HR-Managerin traegt die Rolle `hr`. Sie sieht im Buchungskalender die
-- Maske mit den Wochentagen, denn `useVideocallFreigabe` stellt `hr` seit dem
-- 10.09.2026 ausdruecklich neben admin und inhaber. Speichern kann sie
-- trotzdem nicht, und die Oberflaeche meldete nur, es habe nicht geklappt.
--
-- Der Grund liegt in der Datenbank. `buchung_wochenplan_setzen` laeuft
-- bewusst OHNE SECURITY DEFINER, es greifen also die Regeln der Aufruferin.
-- Die Einfuegeregel auf `buchung_verfuegbarkeiten` lautet seit Migration
-- 20260827200000:
--
--   WITH CHECK (mitarbeiter_id = auth.uid() AND public.darf_videocall(auth.uid()))
--
-- und `darf_videocall` kennt nur zwei Wege: eine Adminrolle oder einen
-- Eintrag in `videocall_freigaben`. Die Rolle `hr` steht in keinem von
-- beiden. Das Loeschen der alten Wochenregeln gelingt, das Einfuegen der
-- neuen scheitert an der Zeilensicherheit, die Transaktion faellt komplett
-- zurueck. Der alte Plan bleibt also stehen, gespeichert wird nichts.
--
-- Dasselbe Muster wie am 10.09.2026 bei den Terminarten (Migration
-- 20260910143000): Die Oberflaeche wurde fuer `hr` geoeffnet, die
-- Schreibregel in der Datenbank blieb zurueck.
--
-- WARUM DAS MEHR IST ALS EIN SCHOENHEITSFEHLER
--
-- `bewerber_termin_gastgeber()` verlangt seit 20260910151500 die Rolle `hr`,
-- eine aktive Terminart UND wenigstens eine Wochenregel in
-- `buchung_verfuegbarkeiten`. Ohne gepflegte Zeiten findet sie niemanden,
-- `bewerber_termin_buchen` hat kein Fenster zu pruefen, und kein Bewerber
-- kann ein Kennenlerngespraech buchen. Die Buchungsseite zeigt dabei ihren
-- Abschlusstext, nichts sieht kaputt aus, es geht nur nichts.
--
-- WAS SICH AENDERT
--
-- `darf_videocall` bekommt die Rolle `hr` als dritten Weg. Damit ist die
-- Datenbank wieder deckungsgleich mit dem, was die Oberflaeche laengst
-- annimmt.
--
-- WARUM DAS GEFAHRLOS IST
--
-- Alle fuenf Regeln, die `darf_videocall` verwenden (Videoraum anlegen,
-- Buchung Einstellungen anlegen, Buchung Verfuegbarkeit anlegen, Buchung
-- Links anlegen, Buchungen anlegen), tragen daneben die Bedingung
-- `... = auth.uid()`. Die Funktion entscheidet also ausschliesslich darueber,
-- ob jemand EIGENE Zeilen anlegen darf, nie fremde. Lesen, Aendern und
-- Loeschen bleiben unveraendert bei `= auth.uid() OR is_admin_role(...)`.
-- HR bekommt damit den eigenen Buchungskalender und keinen Zugriff auf die
-- Zeiten anderer.
--
-- Bewusst die Rolle und nicht ein Eintrag in `videocall_freigaben` fuer
-- diese eine Person: Ein Eintrag waere beim naechsten Wechsel in der Position
-- vergessen, die Rolle wandert dagegen mit. Dieselbe Begruendung steht in
-- `src/hooks/useVideocallFreigabe.ts`.
--
-- Wiederholbar: die Funktion wird ersetzt, nicht ergaenzt.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.darf_videocall(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_role(_uid)
      OR public.has_role(_uid, 'hr')
      OR EXISTS (SELECT 1 FROM public.videocall_freigaben f WHERE f.user_id = _uid)
$$;

REVOKE ALL ON FUNCTION public.darf_videocall(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.darf_videocall(uuid) TO authenticated;

COMMENT ON FUNCTION public.darf_videocall(uuid) IS
  'Darf dieser Nutzer den eigenen Videocall- und Buchungsbereich nutzen: Adminrolle, Rolle hr, oder Eintrag in videocall_freigaben.';

-- Prueflauf 1: Darf die HR-Managerin jetzt? Erwartet: true.
--   select p.name, public.darf_videocall(p.id)
--     from public.profiles p
--     join public.user_roles r on r.user_id = p.id and r.role::text = 'hr';
--
-- Prueflauf 2: Findet der Bewerberprozess eine Gastgeberin? NULL heisst nein,
-- dann fehlt noch die aktive Terminart oder der Wochenplan.
--   select public.bewerber_termin_gastgeber();
