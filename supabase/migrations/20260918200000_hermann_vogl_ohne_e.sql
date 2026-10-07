-- ===========================================================================
-- Hermann Vogl, ohne e
-- ===========================================================================
--
-- WARUM
--
-- Die Migration 20260827200000 sollte ihn zusammen mit Christian Kurz fuer
-- den Videocall-Bereich freischalten. Sie suchte aber nach dem falschen
-- Namen:
--
--     WHERE btrim(lower(p.name)) IN ('hermann vogel', 'christian kurz')
--
-- Dort steht "Vogel" mit e. Er schreibt sich "Vogl" ohne e. Die Zeile hat
-- ihn also nie gefunden, und er steht seitdem nicht in
-- `videocall_freigaben`. Christian Kurz wurde freigeschaltet, Hermann Vogl
-- nicht, und niemandem ist es aufgefallen, weil ein fehlender Eintrag
-- einfach nur eine fehlende Menuegruppe ist und keine Fehlermeldung.
--
-- Die alte Migration wird NICHT nachtraeglich geaendert. Sie ist gelaufen,
-- sie ist Historie, und ein zweiter Lauf faende ohnehin nicht statt. Diese
-- Migration zieht den Eintrag nach.
--
-- WARUM SIE BEIDE SCHREIBWEISEN SUCHT
--
-- Wie sein Name heute wirklich in `profiles` steht, ist von aussen nicht
-- sicher zu sagen. Moeglich ist beides: richtig als "Hermann Vogl", oder
-- irgendwann einmal falsch als "Hermann Vogel" angelegt. Deshalb sucht die
-- Abfrage unten beide Formen. Findet sie zwei verschiedene Profile, ist das
-- ein eigener Befund (eine Dublette) und gehoert geprueft, siehe die
-- Nachsehen-Abfragen am Ende.
--
-- Der Name selbst wird hier NICHT umgeschrieben. Ein Profilname ist ein
-- personenbezogener Stammdatensatz, und ihn stillschweigend zu aendern,
-- waere eine Aenderung an produktiven Daten ohne Auftrag. Steht dort die
-- falsche Schreibweise, meldet die letzte Abfrage das, und Christian
-- entscheidet.
--
-- WAS DIESE MIGRATION NICHT LOEST
--
-- Den Videocall-Bereich geben zwei voneinander unabhaengige Stellen frei:
-- diese Tabelle, und eine fest im Code stehende Namensliste in
-- `src/lib/bewerberprozessFreigabe.ts`. In der Code-Liste steht Hermann Vogl
-- nicht. Ein Eintrag hier allein reicht also moeglicherweise nicht, damit er
-- die Seite wirklich sieht. Das Zusammenlegen der beiden Tuersteher ist eine
-- offene Entscheidung und kein Teil dieser Migration.
--
-- Wiederholbar: ein zweiter Lauf aendert nichts.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Freigabe nachziehen
-- ---------------------------------------------------------------------------

INSERT INTO public.videocall_freigaben (user_id)
SELECT p.id
FROM public.profiles p
WHERE btrim(lower(p.name)) IN ('hermann vogl', 'hermann vogel')
ON CONFLICT (user_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2) Grundausstattung, wie fuer jeden Freigegebenen
-- ---------------------------------------------------------------------------
--
-- Wortgleich zu Abschnitt 5 der Migration 20260827200000. Ohne
-- Einstellungszeile haette er zwar den Menuepunkt, aber keinen Kalender
-- dahinter. Die vier Standard-Terminarten legt die Oberflaeche beim ersten
-- Aufruf selbst an, siehe `src/lib/buchungStore.ts`, deshalb stehen sie hier
-- nicht.

INSERT INTO public.buchung_einstellungen (mitarbeiter_id, slug, offen_aktiv, zeitzone)
SELECT f.user_id, NULL, false, 'Europe/Berlin'
FROM public.videocall_freigaben f
WHERE NOT EXISTS (
  SELECT 1 FROM public.buchung_einstellungen e WHERE e.mitarbeiter_id = f.user_id
);


-- ---------------------------------------------------------------------------
-- 3) Nachsehen
-- ---------------------------------------------------------------------------
--
-- Steht er jetzt drin, und wie schreibt sich sein Profil wirklich?
--
--     select p.name,
--            (f.user_id is not null) as hat_freigabe,
--            (e.mitarbeiter_id is not null) as hat_kalender
--       from profiles p
--       left join videocall_freigaben f on f.user_id = p.id
--       left join buchung_einstellungen e on e.mitarbeiter_id = p.id
--      where lower(p.name) like '%vog%';
--
-- Zwei Zeilen bedeuten eine Dublette und gehoeren geprueft.
--
-- Steht dort "Hermann Vogel" mit e, ist der Stammdatensatz falsch. Die
-- Korrektur ist bewusst nicht Teil dieser Migration:
--
--     update profiles set name = 'Hermann Vogl'
--      where lower(btrim(name)) = 'hermann vogel';
--
-- Vorher pruefen, woran der Name sonst noch haengt. Die Spalte `berater` an
-- `kontakte` traegt den Namen als Text und entscheidet mit darueber, wer
-- seine eigenen Leads sieht:
--
--     select berater, count(*) from kontakte
--      where lower(berater) like '%vog%' group by berater;
