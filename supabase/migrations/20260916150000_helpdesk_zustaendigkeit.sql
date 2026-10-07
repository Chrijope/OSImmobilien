-- ===========================================================================
-- Der Helpdesk wechselt die Zustaendigkeit
-- ===========================================================================
--
-- WARUM
--
-- Im Helpdesk laufen die Stoerungsmeldungen aus dem Vertrieb auf. An einem
-- Ticket aus dem Fehler-Dreieck haengt der komplette technische Anhang: die
-- zuletzt besuchte Adresse samt allen Angaben darin, die Konsolenmeldungen und
-- ein automatischer Bildschirmabzug. In einer echten Meldung vom 16.09.2026
-- standen darin Name, Mailadresse, Telefonnummer, Anschrift, Geburtsdatum,
-- Objekt und Kaufpreis eines Kunden.
--
-- Zwei Entscheidungen von Christian am 16.09.2026:
--
-- 1. **Die Rolle hr verliert die Seite.** Das Bewerbermanagement ist fuer
--    Stoerungen im Vertrieb nicht zustaendig, und die Kundendaten im Anhang
--    gehen sie nichts an. Eigene Tickets schreiben und verfolgen kann HR
--    weiterhin ueber `/support-kontaktieren`, das bleibt freigegeben.
--
-- 2. **Die Rolle vertriebsleiter bekommt die Seite.** Sie darf seit der
--    Migration 20260916110000 die Tickets ihrer eigenen Partner lesen, kam
--    aber gar nicht an die Seite heran: `/helpdesk` war fuer sie nirgends
--    freigegeben, waehrend die Dashboard-Kachel "Helpdesk" ihr angezeigt
--    wurde und ins Leere fuehrte.
--
-- WICHTIG ZUR ABGRENZUNG
--
-- Diese Migration regelt nur, wer die SEITE oeffnen darf. Welche Tickets
-- jemand dort zu sehen bekommt, entscheidet allein die Leseregel aus
-- 20260916110000_support_tickets_sichtbarkeit.sql. Die Vertriebsleitung sieht
-- dort die Tickets ihrer eigenen Partner, nicht alle. Ein freigeschalteter
-- Menuepunkt ist keine Zugriffskontrolle; massgeblich bleibt Row Level
-- Security.
--
-- Der Gegenpart im Code ist die Ersatzliste in `src/lib/sidebarPermissions.ts`.
-- Sie greift nur, solange `role_permissions` fuer eine Rolle nichts hergibt,
-- und wurde im selben Zug angepasst. Beide Stellen muessen zusammenpassen.
--
-- Wiederholbar: das Loeschen trifft beim zweiten Lauf nichts mehr, das
-- Einfuegen faengt der Primaerschluessel (role, url) ab.
-- ===========================================================================

DELETE FROM public.role_permissions
WHERE role = 'hr'
  AND url = '/helpdesk';

INSERT INTO public.role_permissions (role, url) VALUES
  ('vertriebsleiter', '/helpdesk')
ON CONFLICT DO NOTHING;

-- Prueflauf: Wer darf die Seite jetzt oeffnen? Erwartet werden unter anderem
-- backoffice und vertriebsleiter, nicht mehr hr.
--   select role, url
--     from public.role_permissions
--    where url = '/helpdesk'
--    order by role;
--
-- Gegenprobe: Was sieht HR noch? `/support-kontaktieren` muss dabei sein.
--   select url from public.role_permissions where role = 'hr' order by url;
