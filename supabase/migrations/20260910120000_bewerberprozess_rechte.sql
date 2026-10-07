-- ===========================================================================
-- Der Bewerberprozess wird der regulaere Bereich, das Bewerbungsmanagement
-- entfaellt.
-- ===========================================================================
--
-- WARUM
--
-- Bis heute stand `/bewerberprozess` in keiner einzigen Zeile von
-- `public.role_permissions`. Der Bereich haengt allein an einer namentlichen
-- Freigabeliste im Code (`src/lib/bewerberprozessFreigabe.ts`). Da die Tabelle
-- den Code sticht, sobald sie antwortet, saehe die Rolle `hr` den Bereich
-- niemals, auch wenn die Liste in `sidebarPermissions.ts` ihn nennt.
--
-- Gleichzeitig faellt `/bewerbungsmanagement` weg. Seine Zeile bleibt sonst
-- als Rechteeintrag auf eine Route stehen, die es nicht mehr gibt.
--
-- WIEDERHOLBAR
--
-- `on conflict do nothing` beim Einfuegen, `delete` ist ohnehin idempotent.
-- Die Datei darf beliebig oft laufen.
-- ===========================================================================

insert into public.role_permissions (role, url)
values ('hr', '/bewerberprozess')
on conflict do nothing;

delete from public.role_permissions
where url = '/bewerbungsmanagement';

-- Prueflauf: Was sieht die Rolle hr jetzt?
--   select url from public.role_permissions where role = 'hr' order by url;
