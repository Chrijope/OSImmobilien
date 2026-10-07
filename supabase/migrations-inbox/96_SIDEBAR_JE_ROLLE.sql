-- ===========================================================================
-- Prueflauf: Welche Routen sind je Rolle in `public.role_permissions`
-- freigegeben, und wie viele sind es?
-- ===========================================================================
--
-- Diese Datei aendert NICHTS. Sie ist eine reine Abfrage und darf beliebig
-- oft laufen. Sie ist keine Migration und bleibt deshalb dauerhaft in diesem
-- Ordner liegen, so wie 97_, 98_ und 99_.
--
-- WARUM SIE ES GIBT
--
-- Die Freigabe einer Route je Rolle steht in der Tabelle
-- `public.role_permissions`. Die Listen in `src/lib/sidebarPermissions.ts`
-- (`ROLE_ALLOWED_URLS_FALLBACK`) sind ausdruecklich nur der Rueckfall fuer den
-- Fall, dass die Datenbank nicht antwortet, siehe den Kommentar dort ab
-- Zeile 16. Sobald die Tabelle antwortet, gilt allein sie.
--
-- Folge: Aus dem Code allein laesst sich nicht sagen, wie viele Eintraege eine
-- Rolle in der Seitenleiste tatsaechlich sieht. Wer das wissen will, muss
-- diese Abfrage laufen lassen.
--
-- WAS DIE SPALTEN BEDEUTEN
--
--   rolle          der Wert in `role_permissions.role`
--   hinweis        Vollzugriffsrollen tragen hier einen Vermerk: Bei ihnen
--                  gibt `isUrlAllowedForRole` unabhaengig von der Liste frei,
--                  ihre Zeilen in der Tabelle aendern also nichts
--   anzahl_routen  Zahl der verschiedenen freigegebenen Pfade
--   routen         die Pfade selbst, alphabetisch
--
-- WAS DIE ABFRAGE NICHT BEANTWORTET
--
-- Sie zeigt die Freigaben, nicht das Endergebnis. Vor der Rollenliste greifen
-- im Code noch die Sperren (`UEBERALL_AUSGEBLENDET`, `NUR_ADMIN_ROUTEN`,
-- `ROLLEN_SPERREN`), danach die persoenlichen Freigaben und bei der Rolle
-- `vertriebspartner` zusaetzlich die Karrierestufe. Die tatsaechliche Zahl der
-- sichtbaren Eintraege kann also kleiner sein als `anzahl_routen`. Eine Rolle,
-- die hier gar nicht auftaucht, hat keine einzige Zeile in der Tabelle; dann
-- greift fuer sie der Rueckfall aus dem Code.

SELECT
  rp.role                                            AS rolle,
  CASE
    WHEN rp.role IN ('inhaber', 'admin', 'individuell', 'testaccount')
      THEN 'Vollzugriff im Code, diese Liste bleibt ohne Wirkung'
    ELSE ''
  END                                                AS hinweis,
  count(DISTINCT rp.url)                             AS anzahl_routen,
  string_agg(DISTINCT rp.url, ', ' ORDER BY rp.url)  AS routen
FROM public.role_permissions rp
GROUP BY rp.role
ORDER BY rp.role;
