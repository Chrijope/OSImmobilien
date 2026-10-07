-- ===========================================================================
-- Alle Bewerber in den Bewerberprozess uebernehmen.
-- ===========================================================================
--
-- WAS HIER PASSIERT
--
-- Es wird NICHTS kopiert und NICHTS geloescht. Beide Bereiche lasen immer
-- schon dieselbe Tabelle `public.bewerbungen`. Gesetzt wird ausschliesslich
-- das Kennzeichen `meta->>'prozess'` auf den Wert 'neu'. Status, Antworten,
-- Termine, Vertraege und Notizen bleiben unangetastet.
--
-- WARUM ES TROTZDEM NOETIG IST
--
-- Die Sichtbarkeit haengt seit dem Wegfall des alten Bereichs nicht mehr am
-- Kennzeichen. Zwei Hintergrundlaeufe lesen es aber weiterhin:
--
--   * `send-bewerber-formular-erinnerungen` erinnert an den ALTEN Vorabbogen
--     und ueberspringt seit dem Umbau alle mit 'neu'. Ohne diese Migration
--     bekaemen uebernommene Bewerber Erinnerungen an einen Bogen, den ihr
--     Ablauf nicht mehr kennt.
--   * `submit-bewerbung` und `zapier-bewerber-webhook` setzen das Kennzeichen
--     bei jeder neuen Bewerbung. Der Bestand soll dieselbe Angabe tragen.
--
-- WICHTIG: NUR ECHTE BEWERBER
--
-- In `bewerbungen` liegen auch Stellenanzeigen und Onboardingtermine,
-- unterschieden ueber `meta->>'_type'`. Der Filter schuetzt sie.
--
-- WIEDERHOLBAR
--
-- Wer schon 'neu' traegt, wird nicht erneut angefasst. Die Datei darf
-- beliebig oft laufen.
--
-- RUECKWEG
--
--   update public.bewerbungen
--      set meta = meta - 'prozess'
--    where coalesce(meta->>'_type', 'bewerber') = 'bewerber';
-- ===========================================================================

update public.bewerbungen
   set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('prozess', 'neu')
 where coalesce(meta->>'_type', 'bewerber') = 'bewerber'
   and coalesce(meta->>'prozess', '') <> 'neu';

-- Prueflauf danach: es darf nur noch eine Zeile mit 'neu' herauskommen.
--   select coalesce(nullif(meta->>'prozess',''),'alt') as ablauf, count(*)
--     from public.bewerbungen
--    where coalesce(meta->>'_type','bewerber') = 'bewerber'
--    group by 1;
