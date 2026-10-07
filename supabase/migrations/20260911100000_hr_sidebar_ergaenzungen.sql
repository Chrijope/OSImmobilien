-- ===========================================================================
-- Die Seitenleiste der Rolle hr wird ergaenzt
-- ===========================================================================
--
-- WARUM
--
-- Wunsch von GL am 11.09.2026. Die Rolle hr gehoert Jana Kirchner im
-- HR-Management, im Alltag arbeitet die HR-Kollegin damit. Sie braucht neben dem
-- Bewerberprozess ein paar Punkte, die bisher nur der Vertrieb sah.
--
-- WAS SICH AENDERT
--
--   Wissen      Immobilien-Lexikon raus, dafuer Unsere Kultur, Unterlagen
--               und Praesentation. Das Lexikon erklaert Fachbegriffe der
--               Kapitalanlage und gehoert in den Vertrieb, nicht ins
--               Bewerbermanagement.
--   Marketing   Marketing und Shop. Der Shop ist im Code weiterhin als
--               Entwurf gekennzeichnet, hr sieht dort deshalb vorerst
--               "Bald verfuegbar" statt eines Links. Die Freigabe steht
--               trotzdem schon, damit der Punkt ohne weitere Aenderung
--               arbeitet, sobald der Entwurf faellt.
--   Auswertung  Wettbewerb. Die uebrigen Auswertungen bleiben zu.
--
-- Teampartner und Chat stehen fuer hr seit der ersten Rechtevergabe in dieser
-- Tabelle. Sie fehlten in der Seitenleiste aus einem anderen Grund: Die beiden
-- Eintraege tragen `adminOnly`, und die Ausnahme `auchFuer: ["hr"]` wurde beim
-- Filtern der Seitenleiste nicht ausgewertet. Das ist im Code repariert
-- (`src/components/AppSidebar.tsx`). Die beiden Zeilen stehen hier trotzdem
-- noch einmal, damit ein Lauf dieser Datei auch dann den gewuenschten Stand
-- herstellt, wenn sie in der Datenbank irgendwann geloescht wurden.
--
-- WAS SICH NICHT AENDERT
--
-- Ausschliesslich Zeilen mit role = 'hr' werden angefasst. Jede andere Rolle
-- behaelt ihre Ansicht unveraendert. Der Entzug von `/nutzerverwaltung` vom
-- 10.09.2026 bleibt bestehen, er wird hier nicht rueckgaengig gemacht.
--
-- WIEDERHOLBAR
--
-- `on conflict do nothing` beim Einfuegen, der Primaerschluessel ist
-- (role, url). Das Loeschen ist ohnehin idempotent. Die Datei darf beliebig
-- oft laufen.
-- ===========================================================================

insert into public.role_permissions (role, url)
values
  ('hr', '/teampartner'),
  ('hr', '/chat'),
  ('hr', '/kultur'),
  ('hr', '/unterlagen'),
  ('hr', '/praesentation'),
  ('hr', '/marketing'),
  ('hr', '/shop'),
  ('hr', '/wettbewerb')
on conflict do nothing;

delete from public.role_permissions
where role = 'hr'
  and url = '/immobilien-lexikon';

-- Prueflauf: Was sieht die Rolle hr jetzt?
--   select url from public.role_permissions where role = 'hr' order by url;
