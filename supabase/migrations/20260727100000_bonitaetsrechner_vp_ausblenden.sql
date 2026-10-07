-- Bonitätsrechner für Vertriebspartner ausblenden
--
-- Die Freigabeliste in der Anwendung ist nur ein Fallback, maßgeblich ist
-- diese Tabelle. Ohne diesen Eintrag bliebe der Bonitätsrechner beim
-- Vertriebspartner sichtbar, obwohl er im Code entfernt wurde.
--
-- Zusätzlich gibt es in `src/lib/sidebarPermissions.ts` eine ausdrückliche
-- Sperre für diese Rolle. Sie greift auch dann, wenn die Route hier später
-- versehentlich wieder eingetragen wird.

DELETE FROM public.role_permissions
WHERE role = 'vertriebspartner'
  AND url = '/bonitaetsrechner';
