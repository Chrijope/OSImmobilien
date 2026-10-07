-- Aktivitätseinträge darf nur die Leitung entfernen.
--
-- Im Kundenprofil gibt es jetzt einen Papierkorb an der Zeitleiste, sichtbar
-- für Admin, Inhaber und Vertriebsleiter. Eine Einschränkung, die nur in der
-- Oberfläche steht, ist aber keine Berechtigung: Die bisherige Regel
-- "Interne loeschen Aktivitaeten (scoped)" erlaubt jeder internen Rolle das
-- Löschen, solange der Kontakt für sie sichtbar ist. Ein Vertriebspartner
-- könnte damit weiterhin über die Schnittstelle löschen, nur eben ohne Knopf.
--
-- Das ist hier besonders heikel, weil ein Aktivitätseintrag oft der einzige
-- Nachweis darüber ist, was mit einem Kunden besprochen wurde. Wer seine
-- eigene Historie bereinigen kann, macht die Zeitleiste als Nachweis wertlos.
-- Deshalb wird die Regel auf dieselben drei Rollen eingeengt, die auch den
-- Knopf sehen.
--
-- Nicht betroffen: Das DSGVO-Löschen eines ganzen Kontakts läuft über eine
-- Funktion mit SECURITY DEFINER und umgeht diese Regel bewusst.

DROP POLICY IF EXISTS "Interne loeschen Aktivitaeten (scoped)" ON public.aktivitaeten;
DROP POLICY IF EXISTS "Interne loeschen Aktivitaeten" ON public.aktivitaeten;

CREATE POLICY "Leitung loescht Aktivitaeten"
ON public.aktivitaeten
FOR DELETE
TO authenticated
USING (
  (
    public.is_admin_role(auth.uid())
    OR public.has_role(auth.uid(), 'vertriebsleiter'::app_role)
  )
  AND public.kontakt_visible_to_internal(auth.uid(), aktivitaeten.kunde_id)
);

-- Das System-Protokoll bleibt für alle unveränderlich. Es gibt dort bewusst
-- keine DELETE-Regel: Ein Protokoll, das sich bereinigen lässt, belegt nichts.
-- Zur Sicherheit wird eine eventuell vorhandene Regel entfernt.
DROP POLICY IF EXISTS "activity_log_delete" ON public.activity_log;
DROP POLICY IF EXISTS "activity_log_delete_own" ON public.activity_log;
