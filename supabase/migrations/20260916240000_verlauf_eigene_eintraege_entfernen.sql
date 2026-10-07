-- Jeder darf im Verlauf entfernen, was er selbst geschrieben hat.
--
-- WARUM
--
-- Bis heute stand am Verlauf eines Kunden nur fuer Admin, Inhaber und
-- Vertriebsleiter ein Papierkorb, und die Regel
-- "Leitung loescht Aktivitaeten" (20260728140000) hat das auch technisch
-- durchgesetzt. GL hat am 16.09.2026 entschieden, dass auch der
-- Vertriebspartner seine Notizen, Aufgaben und Termine wieder entfernen kann.
--
-- Der Grund der alten Regel bleibt gueltig: Ein Aktivitaetseintrag ist oft der
-- einzige Nachweis darueber, was mit einem Kunden besprochen wurde. Wer seine
-- eigene Historie beliebig bereinigen kann, macht den Verlauf als Nachweis
-- wertlos. Deshalb der engste Schnitt, der GL-Wunsch erfuellt:
--
--   * Die Leitung entfernt wie bisher jeden sichtbaren Eintrag. Diese Regel
--     bleibt unveraendert stehen, sie steht neben der neuen.
--   * Jede andere interne Rolle entfernt nur, was sie selbst geschrieben hat,
--     erkennbar an `benutzer_id`, und nur an einem Kunden, den sie ueberhaupt
--     sehen darf.
--   * Was die Anwendung selbst unter dem Namen "System" geschrieben hat,
--     bleibt ausserhalb der Leitung unantastbar. Das ist hier wichtig, denn
--     `benutzer_id` traegt bei solchen Eintraegen die Kennung des Nutzers, in
--     dessen Sitzung der Code sie angelegt hat. Ohne diese Zeile koennte ein
--     Vertriebspartner den automatischen Vermerk ueber seinen eigenen
--     Stufenwechsel entfernen.
--   * Das zentrale Protokoll `activity_log` bleibt wie bisher fuer alle
--     unveraenderlich. Es hat bewusst gar keine DELETE-Regel.
--
-- Eintraege aus dem Altbestand ohne `benutzer_id` fallen nicht unter die neue
-- Regel. Das ist Absicht: Ohne Kennung laesst sich der Verfasser nicht
-- zuverlaessig feststellen, und ein Namensvergleich in der Datenbank waere
-- raten. Solche Eintraege entfernt weiterhin nur die Leitung, und die
-- Oberflaeche zeigt dort auch keinen Papierkorb: `darfEintragEntfernen` in
-- `src/lib/aktivitaetRechte.ts` vergleicht ebenfalls nur die Kennung, damit
-- kein Knopf erscheint, den die Datenbank anschliessend ablehnt.
--
-- Mehrfach ausfuehrbar.

DROP POLICY IF EXISTS "Eigene Aktivitaeten loeschen" ON public.aktivitaeten;

CREATE POLICY "Eigene Aktivitaeten loeschen"
ON public.aktivitaeten
FOR DELETE
TO authenticated
USING (
  (select public.is_internal_role(auth.uid()))
  AND aktivitaeten.benutzer_id IS NOT NULL
  AND aktivitaeten.benutzer_id = auth.uid()
  AND lower(btrim(coalesce(aktivitaeten.von, ''))) <> 'system'
  AND public.kontakt_visible_to_internal(auth.uid(), aktivitaeten.kunde_id)
);

COMMENT ON POLICY "Eigene Aktivitaeten loeschen" ON public.aktivitaeten IS
  'Selbst geschriebene Verlaufseintraege entfernen, ausser Systemeintraege. '
  'Die Regel "Leitung loescht Aktivitaeten" gilt daneben weiter.';
