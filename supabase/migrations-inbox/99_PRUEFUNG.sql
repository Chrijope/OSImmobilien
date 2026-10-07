-- ===========================================================================
-- Prueflauf: was von den Teilen dieses Ordners ist wirklich in der Datenbank?
-- ===========================================================================
--
-- Aendert nichts. Jede Zeile meldet "ja" oder "fehlt". Die Zeilen decken alle
-- Teile ab, die seit dem 23.09.2026 durch den Eingangskorb gegangen sind;
-- Stand 30.09.2026 sind alle ausgefuehrt, keiner ist offen:
--
--   20260923150000  60 Minuten Vormerkung beim Reservieren einer Einheit
--   20260923151000  Exposé an Kunden senden
--   20260923152000  Reservierung eines ganzen Hauses (Globalobjekt)
--   20260923160000  Globalobjekt: Anlageklasse und Schalter angeglichen
--   20260923170000  Dokumenten-Ampel: Freigabe je Unterlage
--   20260923171000  Kundenlink: Art und Einstiegswohnung
--   20260924120000  Empfaenger der Mail "Reservierung unterschrieben"
--   20260924150000  Investagon-Unterlagen eingeordnet
--   20260924170000  Nachtwaechter prueft die Objektdaten
--   20260926150000  Kunde liest eigene Reservierungsvereinbarung (12.1)
--   20260926160000  Person 2 liest Kundenunterlagen (13.1)
--   20260926170000  Handbuch-Seite (14.1 bis 14.4)
--   20260926180000  Handbuch-Seite: Stand je Lead, Vertriebsleitung (15.1 bis 15.3)
--   20260926200000  Naechtliche Abmeldung (16.1 bis 16.5)
--   20260926210000  Abgesagte Automatikaufgaben sperren keine neue (17.1)
--   20260926220000  Handbuch: Partner-Schalter, gesperrte Kuerzel (18.1 bis 18.5)
--   20260926230000  Duplikate zusammenfuehren (19.1 bis 19.2)
--   20260926235000  Partnerlinks absichern (20.1 bis 20.7)
--   20260927000000  Duplikate: Dateipfade umschreiben (21.1 bis 21.2)
--   20260927010000  Sperre im Profil nur ueber die Verwaltung (22.1 bis 22.2)
--   20260927020000  Tippgeber-Einverstaendnis (23.1 bis 23.5)
--   20260927040000  Meta Pixel nur mit Anlage 4 oder Bestandsschutz (24.1 bis 24.5)
--   20260927060000  Bewerbungen nur Bewerberbereich (25.1 bis 25.9)
--   20260927070000  Pixel-Nachweis am Lead nur durch den Server (26.1 bis 26.3)
--   20260927080000  Offene Gegenzeichnungen: neuer Token, Verweis (27.1 bis 27.2)
--   20260927090000  Pixel-Nachweise bei wiederholten Anfragen geschuetzt (28.1 bis 28.4)
--   20260927120000  Videocall nur fuer den Geschaeftsfuehrer als admin (29.1 bis 29.12)
--   20260928120000  MORE Lotse: Zustimmung, Verlauf, Auszuege, Kontingent, Aufraeumen (30.1 bis 30.9)
--   20260928130000  Support-Antworten atomar anhaengen und melden (31.1 bis 31.5)
--   20260928150000  Rueckgabe an die Zentrale, claim_lead nur Lead-Verwaltung (32.1 bis 32.3)
--   20260928160000  Glocke abgesichert, Portalzugang und Eigentum am Kontakt (33.1 bis 33.9)
--   20260928180000  Kennung statt Name in Empfehlung, Tippgeber-Lead, Provisionssatz (34.1 bis 34.4)
--   20260928190000  Rueckgabe an die Zentrale ueber eine Funktion (35.1)
--   20260928210000  Favoriten fuer Notizen im Kundenprofil (36.1)
--   20260928200000  Handbuch: Selbstauskunft direkt, ohne Lesezugriff (37.1 bis 37.3)
--   20260928220000  Selbstauskunfts-Link: Stand nur bei offenem Link (38.1)
--   20260928230000  Glocke ohne Zustaendigen auch an die Vertriebsleitung (39.1)
--   20260929090000  Glocke nur an den Zustaendigen: Dublette, Vertretung bleibt (40.1 bis 40.2)
--   20260929110000  Terminseite: Gespraechsarten mit echten Umlauten (41.1 bis 41.2)
--   20260929141000  Zoom-Tabellen entfernt, Weekly Call bleibt (42.1 bis 42.3)
--   20260929200000  Unterschriftsanfragen nur serverseitig, Token nur auf dem Server (48.1 bis 48.6)
--   20260929130000  Terminseite nur fuer den Partner, gewaehltes Investment rueckt vor (49.1 bis 49.3)
--   20260930100000  Absicherung Stufe 0: Sicherung zu, Serverfunktionen, anon schreibt nirgends (50.1 bis 50.7)
--   20260930110000  Absicherung Geld und Vertraege: Unterschrift, Abwicklung, Zuordnung, Praemie (51.1 bis 51.10)
--   20260930120000  Absicherung Objekte, Speicher, Chats, Hausverwaltung (52.1 bis 52.14)
--   20260930150000  Stufe abgeschlossen nur Admin, Inhaber, Backoffice (55.1 bis 55.3)
--   20260930130000  Leadpakete: Tabellen, nur lesbar, Schreiben ueber Funktionen (53.1 bis 53.9)
--   20260930140000  Terminseite: Erstgespraech 20, Beratungsgespraech 45 Minuten fest (54.1 bis 54.2)
--   20261001120000  Stufe abrechnung wie abgeschlossen nur Admin, Inhaber, Backoffice, Buchhaltung (56.1)
--   20261004110000  Wochenberichte schicken das Geheimwort der Automatiken mit (57.1)
--   20261004120000  Registrierung ohne Rollenwahl, handle_new_user liest raw_app_meta_data (58.1)
--   20261004150000  Bilder der Objekteinreichung nur ueber die Function, 30 MB am Eimer objekt-medien (59.1 bis 59.2)
--   20261004195000  Zeitplan fuer die Sicherung (01:00 UTC) mit Geheimwort, kein Zeitplan fuer den Papierkorb (81.1 bis 81.2)
--   20261004152000  Kundenportal-Sperre an allen Tabellen, fremde Abfrage zu (82.1)
--   20261004160000  Eigentuemer aus dem Investment ueber eine gepruefte Funktion (83.1)
--   20261004171000  Buchhaltung: Kundenprofil und Pipeline (84.1)
--   20261004170000  Provisionsbescheide ab Freigabe gesperrt, kein Investment doppelt (75.1 bis 75.3)
--   20261004175000  Kundenportal fragt das Empfehlungsprogramm an (76.1)
--   20261007100000  Selbstauskunft: ein fester Link je Investment und Person (91.1 bis 91.7)
--   20261004180000  Buchung uebernimmt die Sprache der Terminseite (77.1)
--   20261004193000  Objekt und Einheit loeschen nur mit Pruefung in der Datenbank (78.1 bis 78.2)
--   20261005120000  Provisionsfelder aus Investagon nur Admin, Inhaber und Buchhaltung (88.1 bis 88.4)
--
-- Erwartet: ueberall "ja". Die Zeilen zu den Rechten pruefen, dass Fremde
-- und angemeldete Nutzer die Dienstfunktionen NICHT aufrufen koennen.
-- ===========================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 1: Vormerkung an Einheiten
-- ─────────────────────────────────────────────────────────────────────────────

SELECT '1.1 Funktion vormerke_einheit' AS pruefung,
       CASE WHEN to_regprocedure('public.vormerke_einheit(uuid,uuid)') IS NOT NULL
            THEN 'ja' ELSE 'fehlt (20260923150000 ausfuehren)' END AS ergebnis

UNION ALL
SELECT '1.2 Funktion reserviere_einheit_nach_unterschrift',
       CASE WHEN to_regprocedure('public.reserviere_einheit_nach_unterschrift(uuid,uuid,text,text,uuid)') IS NOT NULL
            THEN 'ja' ELSE 'fehlt (20260923150000 ausfuehren)' END

UNION ALL
SELECT '1.3 Sechs neue Spalten an wohnungen',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'wohnungen'
                     AND column_name IN ('vorgemerkt_bis', 'vorgemerkt_kunde_id', 'vorgemerkt_kunde_name',
                                         'vorgemerkt_von', 'vorgemerkt_berater_name', 'reserviert_von')) = 6
            THEN 'ja' ELSE 'fehlt (20260923150000 ausfuehren)' END

UNION ALL
SELECT '1.4 Ausloeser kennt das Globalobjekt',
       CASE WHEN coalesce(pg_get_functiondef(to_regprocedure('public.wohnung_reservierung_pruefen()')) ILIKE '%global_objekt%', false)
            THEN 'ja' ELSE 'fehlt (20260923150000 ausfuehren)' END

UNION ALL
SELECT '1.5 Fremde duerfen nicht vormerken',
       CASE WHEN to_regprocedure('public.vormerke_einheit(uuid,uuid)') IS NULL THEN 'fehlt (20260923150000 ausfuehren)'
            WHEN has_function_privilege('anon', to_regprocedure('public.vormerke_einheit(uuid,uuid)'), 'EXECUTE') THEN 'NEIN, Recht zu weit'
            ELSE 'ja' END

UNION ALL
SELECT '1.6 Angemeldete duerfen nicht direkt reservieren',
       CASE WHEN to_regprocedure('public.reserviere_einheit_nach_unterschrift(uuid,uuid,text,text,uuid)') IS NULL THEN 'fehlt (20260923150000 ausfuehren)'
            WHEN has_function_privilege('authenticated', to_regprocedure('public.reserviere_einheit_nach_unterschrift(uuid,uuid,text,text,uuid)'), 'EXECUTE') THEN 'NEIN, Recht zu weit'
            ELSE 'ja' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 2: Exposé an Kunden senden
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '2.1 Sieben neue Spalten an objekt_exposes',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'objekt_exposes'
                     AND column_name IN ('investment_id', 'gesendet_am', 'gesendet_von', 'versandweg',
                                         'zurueckgezogen_am', 'erstmals_aufgerufen_am', 'zuletzt_aufgerufen_am')) = 7
            THEN 'ja' ELSE 'fehlt (20260923151000 ausfuehren)' END

UNION ALL
SELECT '2.2 Exposé fuers ganze Haus moeglich (wohnung_id optional)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'objekt_exposes'
                            AND column_name = 'wohnung_id' AND is_nullable = 'YES')
            THEN 'ja' ELSE 'fehlt (20260923151000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 3: Reservierung eines ganzen Hauses
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '3.1 Funktion vormerke_objekt',
       CASE WHEN to_regprocedure('public.vormerke_objekt(uuid,uuid)') IS NOT NULL
            THEN 'ja' ELSE 'fehlt (20260923152000 ausfuehren)' END

UNION ALL
SELECT '3.2 Funktion reserviere_objekt_nach_unterschrift',
       CASE WHEN to_regprocedure('public.reserviere_objekt_nach_unterschrift(uuid,uuid,text,timestamptz,uuid)') IS NOT NULL
            THEN 'ja' ELSE 'fehlt (20260923152000 ausfuehren)' END

UNION ALL
SELECT '3.3 Zehn neue Spalten an objekte',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'objekte'
                     AND column_name IN ('belegung', 'belegung_kunde_id', 'belegung_kunde_name', 'belegung_am',
                                         'belegung_von', 'vorgemerkt_bis', 'vorgemerkt_kunde_id',
                                         'vorgemerkt_kunde_name', 'vorgemerkt_von', 'vorgemerkt_berater_name')) = 10
            THEN 'ja' ELSE 'fehlt (20260923152000 ausfuehren)' END

UNION ALL
SELECT '3.4 Ausloeser objekt_belegung_pruefen',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'objekt_belegung_pruefen' AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20260923152000 ausfuehren)' END

UNION ALL
SELECT '3.5 Fremde duerfen kein Haus vormerken',
       CASE WHEN to_regprocedure('public.vormerke_objekt(uuid,uuid)') IS NULL THEN 'fehlt (20260923152000 ausfuehren)'
            WHEN has_function_privilege('anon', to_regprocedure('public.vormerke_objekt(uuid,uuid)'), 'EXECUTE') THEN 'NEIN, Recht zu weit'
            ELSE 'ja' END

UNION ALL
SELECT '3.6 Angemeldete duerfen kein Haus direkt reservieren',
       CASE WHEN to_regprocedure('public.reserviere_objekt_nach_unterschrift(uuid,uuid,text,timestamptz,uuid)') IS NULL THEN 'fehlt (20260923152000 ausfuehren)'
            WHEN has_function_privilege('authenticated', to_regprocedure('public.reserviere_objekt_nach_unterschrift(uuid,uuid,text,timestamptz,uuid)'), 'EXECUTE') THEN 'NEIN, Recht zu weit'
            ELSE 'ja' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 4: Globalobjekt, eine Wahrheit
-- ─────────────────────────────────────────────────────────────────────────────
-- Anlageklasse "Globalobjekt" und Schalter global_objekt stimmen ueberein.
-- Ausgenommen sind Investagon-Objekte mit Schalter und anderer Klasse: Dort
-- haelt der Import den Schalter, solange das Haus im CRM reserviert ist.

UNION ALL
SELECT '4.1 Anlageklasse Globalobjekt und Schalter stimmen ueberein',
       CASE WHEN (SELECT count(*) FROM public.objekte o
                   WHERE (regexp_replace(lower(coalesce(o.meta->>'anlageklasse', '')), '[^a-zäöüß]', '', 'g')
                            IN ('globalobjekt', 'globalobjekte')) <> coalesce(o.global_objekt, false)
                     AND NOT (coalesce(o.global_objekt, false) AND o.meta->>'investagonSlug' IS NOT NULL)) = 0
            THEN 'ja' ELSE 'fehlt (20260923160000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 5: Dokumenten-Ampel
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '5.1 Freigabespalten an beiden Dokumenttabellen',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name IN ('objekt_dokumente', 'wohnungs_dokumente')
                     AND column_name IN ('kunden_freigabe', 'kunden_freigabe_von', 'kunden_freigabe_am', 'geschwaerzt')) = 8
            THEN 'ja' ELSE 'fehlt (20260923170000 ausfuehren)' END

UNION ALL
SELECT '5.2 Funktion setze_kunden_freigabe, nicht fuer Fremde',
       CASE WHEN to_regprocedure('public.setze_kunden_freigabe(text,uuid,text,boolean)') IS NULL THEN 'fehlt (20260923170000 ausfuehren)'
            WHEN has_function_privilege('anon', to_regprocedure('public.setze_kunden_freigabe(text,uuid,text,boolean)'), 'EXECUTE') THEN 'NEIN, Recht zu weit'
            ELSE 'ja' END

UNION ALL
SELECT '5.3 Ausloeser an beiden Dokumenttabellen',
       CASE WHEN (SELECT count(*) FROM pg_trigger WHERE tgname = 'dokument_kundenfreigabe_schuetzen' AND NOT tgisinternal) = 2
            THEN 'ja' ELSE 'fehlt (20260923170000 ausfuehren)' END

UNION ALL
SELECT '5.4 Neue Fassung: Freigaberollen einstellbar, nicht aus dem Browser pruefbar',
       CASE WHEN to_regprocedure('public.darf_dokument_freigeben(uuid)') IS NULL THEN 'fehlt (neue Fassung 20260923170000 ausfuehren)'
            WHEN has_function_privilege('authenticated', to_regprocedure('public.darf_dokument_freigeben(uuid)'), 'EXECUTE') THEN 'NEIN, Recht zu weit'
            WHEN (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.setze_kunden_freigabe(text,uuid,text,boolean)')) NOT LIKE '%darf_dokument_freigeben%'
              THEN 'fehlt (neue Fassung 20260923170000 ausfuehren)'
            ELSE 'ja' END

UNION ALL
SELECT '5.5 Neue Fassung: Freigebender immer die Person selbst',
       CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname = 'dokument_kundenfreigabe_schuetzen' AND pronamespace = 'public'::regnamespace)
                 LIKE '%kunden_freigabe_von := auth.uid()%'
            THEN 'ja' ELSE 'fehlt (neue Fassung 20260923170000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 6: Kundenlink, Art und Einstiegswohnung
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '6.1 Spalten art und einstieg_wohnung_id an objekt_exposes',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'objekt_exposes'
                     AND column_name IN ('art', 'einstieg_wohnung_id')) = 2
            THEN 'ja' ELSE 'fehlt (20260923171000 ausfuehren)' END

UNION ALL
SELECT '6.2 Hoechstens eine lebende Objektuebersicht je Kunde',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'objekt_exposes_objektuebersicht_eindeutig')
            THEN 'ja' ELSE 'fehlt (20260923171000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 7: Empfaenger der Mail "Reservierung unterschrieben"
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '7.1 Eintrag reservierung_unterschrieben_empfaenger',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.app_config WHERE schluessel = 'reservierung_unterschrieben_empfaenger')
              THEN 'fehlt (20260924120000 ausfuehren)'
            WHEN (SELECT jsonb_typeof(wert) FROM public.app_config WHERE schluessel = 'reservierung_unterschrieben_empfaenger') <> 'array'
              THEN 'fehlt (Wert ist keine Liste)'
            WHEN (SELECT jsonb_array_length(wert) FROM public.app_config WHERE schluessel = 'reservierung_unterschrieben_empfaenger') < 2
              THEN 'ja, aber Christian Kurz fehlt noch in der Liste'
            ELSE 'ja' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 8: Investagon-Unterlagen eingeordnet
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '8.1 Investagon-Unterlagen nicht mehr pauschal intern',
       CASE WHEN (SELECT count(*) FROM public.objekt_dokumente
                   WHERE url LIKE '/investagon-dokument/%' AND kategorie = 'intern'
                     AND (coalesce(name, '') || ' ' || url) !~* '(provision|courtage|verg(ü|ue)tung|vertriebsvereinbarung|vertriebsvertrag|vermittlungsvertrag|vermittlungsvereinbarung|maklervertrag|maklerauftrag|tippgeber|kalkulation[[:space:]_-]*einkauf|einkaufspreis|(^|[^a-zäöüß])intern([^a-zäöüß]|$))')
                 + (SELECT count(*) FROM public.wohnungs_dokumente
                   WHERE url LIKE '/investagon-dokument/%' AND kategorie = 'intern'
                     AND (coalesce(name, '') || ' ' || url) !~* '(provision|courtage|verg(ü|ue)tung|vertriebsvereinbarung|vertriebsvertrag|vermittlungsvertrag|vermittlungsvereinbarung|maklervertrag|maklerauftrag|tippgeber|kalkulation[[:space:]_-]*einkauf|einkaufspreis|(^|[^a-zäöüß])intern([^a-zäöüß]|$))') = 0
            THEN 'ja' ELSE 'fehlt (20260924150000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 9: Nachtwaechter prueft die Objektdaten
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '9.1 Spalte bereich an nachtpruefung_befunde',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'nachtpruefung_befunde'
                            AND column_name = 'bereich')
            THEN 'ja' ELSE 'fehlt (20260924170000 ausfuehren)' END

UNION ALL
SELECT '9.2 Nachtlauf ruft die Objektpruefung',
       CASE WHEN coalesce(pg_get_functiondef(to_regprocedure('public.nachtpruefung_lauf()')) ILIKE '%nachtpruefung_objektdaten%', false)
            THEN 'ja' ELSE 'fehlt (20260924170000 ausfuehren)' END

UNION ALL
SELECT '9.3 Fuenfzehn Objektregeln im letzten Lauf, keine ausgefallen',
       CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
                              WHERE table_schema = 'public' AND table_name = 'nachtpruefung_befunde'
                                AND column_name = 'bereich')
              THEN 'fehlt (20260924170000 ausfuehren)'
            WHEN (SELECT count(*) FROM public.nachtpruefung_befunde b
                   WHERE b.lauf_at = (SELECT max(lauf_at) FROM public.nachtpruefung_befunde)
                     AND left(b.pruefung, 12) = 'objektdaten_'
                     AND b.schwere <> 'fehler') = 15
              THEN 'ja'
            ELSE 'nein, Tabelle am Ende von 20260924170000 ansehen' END

UNION ALL
SELECT '9.4 Zeitplan ruft die Objektkennzahlen',
       CASE WHEN EXISTS (SELECT 1 FROM cron.job
                          WHERE jobname = 'kennzahlen-tagesstand'
                            AND command ILIKE '%kennzahlen_tagesstand_objektdaten%')
            THEN 'ja' ELSE 'fehlt (20260924170000 ausfuehren)' END

UNION ALL
SELECT '9.5 Fremde duerfen die Objektpruefung nicht starten',
       CASE WHEN to_regprocedure('public.nachtpruefung_objektdaten(timestamptz)') IS NULL THEN 'fehlt (20260924170000 ausfuehren)'
            WHEN has_function_privilege('anon', to_regprocedure('public.nachtpruefung_objektdaten(timestamptz)'), 'EXECUTE')
              OR has_function_privilege('authenticated', to_regprocedure('public.nachtpruefung_objektdaten(timestamptz)'), 'EXECUTE')
              THEN 'NEIN, Recht zu weit'
            ELSE 'ja' END

UNION ALL
SELECT '10.1 Zeitplan misst die Umgebung nach',
       CASE WHEN EXISTS (SELECT 1 FROM cron.job
                          WHERE jobname = 'standort-nachholen'
                            AND command ILIKE '%/functions/v1/standort-nachholen%')
            THEN 'ja' ELSE 'fehlt (20260924190000 ausfuehren)' END

UNION ALL
SELECT '11.1 Kundensprache zum Link (Etappe 3)',
       CASE WHEN to_regprocedure('public.kundensprache_zum_link(text,text)') IS NULL
              THEN 'fehlt (20260925190000 ausfuehren)'
            WHEN NOT has_function_privilege('anon', to_regprocedure('public.kundensprache_zum_link(text,text)'), 'EXECUTE')
              THEN 'NEIN, Gaeste duerfen nicht fragen'
            ELSE 'ja' END

UNION ALL
SELECT '11.2 Fremde duerfen kontakt_sprache nicht direkt rufen',
       CASE WHEN to_regprocedure('public.kontakt_sprache(uuid)') IS NULL THEN 'fehlt (20260925190000 ausfuehren)'
            WHEN has_function_privilege('anon', to_regprocedure('public.kontakt_sprache(uuid)'), 'EXECUTE')
              OR has_function_privilege('authenticated', to_regprocedure('public.kontakt_sprache(uuid)'), 'EXECUTE')
              THEN 'NEIN, Recht zu weit'
             ELSE 'ja' END

UNION ALL
SELECT '11.3 Kunden mit Zwei-Faktor brauchen den Code auch in der Datenbank',
       CASE WHEN to_regprocedure('public.kunde_zweiter_faktor_erfuellt()') IS NULL
              THEN 'fehlt (20260925200000 ausfuehren)'
            WHEN (SELECT count(*) FROM pg_policies
                   WHERE policyname = 'Kunden mit Zwei-Faktor nur mit Code'
                     AND permissive = 'RESTRICTIVE')
                 < (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity
                       AND c.relname NOT IN ('profiles', 'user_roles', 'user_settings')) + 1
              THEN 'nein, select public.kunden_zwei_faktor_regeln_anlegen(); ausfuehren'
            ELSE 'ja' END

UNION ALL
SELECT '12.1 Kunde liest eigene Reservierungsvereinbarung (nur Lesen)',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                              WHERE schemaname = 'storage' AND tablename = 'objects'
                                AND policyname = 'Kunde liest eigene Reservierungsvereinbarung')
              THEN 'fehlt (20260926150000 ausfuehren)'
            WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'storage' AND tablename = 'objects'
                            AND policyname = 'Kunde liest eigene Reservierungsvereinbarung'
                            AND cmd <> 'SELECT')
              THEN 'NEIN, Regel darf nur lesen'
            ELSE 'ja' END

UNION ALL
SELECT '13.1 Person 2 liest Kundenunterlagen (nur Lesen)',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                              WHERE schemaname = 'storage' AND tablename = 'objects'
                                AND policyname = 'Person 2 liest Kundenunterlagen')
              THEN 'fehlt (20260926160000 ausfuehren)'
            WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'storage' AND tablename = 'objects'
                            AND policyname = 'Person 2 liest Kundenunterlagen'
                            AND cmd <> 'SELECT')
              THEN 'NEIN, Regel darf nur lesen'
            ELSE 'ja' END

UNION ALL
SELECT '14.1 Handbuch-Seite: Tabelle handbuch_anforderungen mit Zeilensicherheit',
       CASE WHEN to_regclass('public.handbuch_anforderungen') IS NULL THEN 'fehlt (20260926170000 ausfuehren)'
            WHEN NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass('public.handbuch_anforderungen'))
              THEN 'NEIN, Zeilensicherheit aus'
            WHEN has_table_privilege('anon', to_regclass('public.handbuch_anforderungen'), 'SELECT')
              THEN 'NEIN, Gaeste koennen direkt lesen'
            ELSE 'ja' END

UNION ALL
SELECT '14.2 Handbuch-Seite: Abruf per Token fuer Gaeste',
       CASE WHEN to_regprocedure('public.handbuch_abrufen(text)') IS NULL THEN 'fehlt (20260926170000 ausfuehren)'
            WHEN NOT has_function_privilege('anon', to_regprocedure('public.handbuch_abrufen(text)'), 'EXECUTE')
              THEN 'NEIN, Gaeste duerfen nicht abrufen'
            ELSE 'ja' END

UNION ALL
-- Seit 20260926180000 hat die Funktion drei Parameter, vorher zwei. Beide
-- Fassungen zaehlen hier; 15.1 prueft die neue.
SELECT '14.3 Handbuch-Seite: Kennzahlen nur fuer Angemeldete',
       CASE WHEN coalesce(to_regprocedure('public.handbuch_kennzahlen(integer,uuid,boolean)'),
                          to_regprocedure('public.handbuch_kennzahlen(integer,uuid)')) IS NULL
              THEN 'fehlt (20260926170000 ausfuehren)'
            WHEN has_function_privilege('anon', coalesce(to_regprocedure('public.handbuch_kennzahlen(integer,uuid,boolean)'),
                                                         to_regprocedure('public.handbuch_kennzahlen(integer,uuid)')), 'EXECUTE')
              THEN 'NEIN, Recht zu weit'
            ELSE 'ja' END

UNION ALL
SELECT '14.4 Handbuch-Seite: Trichter kennt das Werkzeug handbuch',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conname = 'analysetool_ereignisse_werkzeug_check'
                            AND pg_get_constraintdef(oid) LIKE '%handbuch%')
            THEN 'ja' ELSE 'fehlt (20260926170000 ausfuehren)' END

UNION ALL
SELECT '15.1 Handbuch-Seite: Kennzahlen mit Firmenlink und Vertriebsleitung',
       CASE WHEN to_regprocedure('public.handbuch_kennzahlen(integer,uuid,boolean)') IS NULL THEN 'fehlt (20260926180000 ausfuehren)'
            WHEN has_function_privilege('anon', to_regprocedure('public.handbuch_kennzahlen(integer,uuid,boolean)'), 'EXECUTE')
              THEN 'NEIN, Recht zu weit'
            ELSE 'ja' END

UNION ALL
SELECT '15.2 Handbuch-Seite: Stand je Lead nur fuer Angemeldete',
       CASE WHEN to_regprocedure('public.handbuch_lead_staende(uuid[])') IS NULL THEN 'fehlt (20260926180000 ausfuehren)'
            WHEN has_function_privilege('anon', to_regprocedure('public.handbuch_lead_staende(uuid[])'), 'EXECUTE')
              THEN 'NEIN, Gaeste duerfen den Stand nicht lesen'
            ELSE 'ja' END

UNION ALL
SELECT '15.3 Handbuch-Seite: PDF-Vermerk per Token',
       CASE WHEN to_regprocedure('public.handbuch_pdf_gespeichert(text)') IS NULL THEN 'fehlt (20260926180000 ausfuehren)'
            WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
                              WHERE table_schema = 'public' AND table_name = 'handbuch_anforderungen'
                                AND column_name = 'pdf_gespeichert_am')
              THEN 'NEIN, Spalte pdf_gespeichert_am fehlt'
            ELSE 'ja' END

-- Keine Migration, eine Einstellung (26.09.2026): Welches Konto das Foto im
-- Ansprechpartner-Kasten beim Firmenlink liefert. Ohne Eintrag zeigt die
-- Seite Initialen. Gesetzt wird per Kennung, siehe Bericht.
UNION ALL
SELECT '15.4 Handbuch-Seite: Foto beim Firmenlink (app_config handbuch_firmen_ansprechpartner)',
       CASE WHEN EXISTS (SELECT 1 FROM public.app_config c
                           JOIN public.profiles p ON p.id::text = c.wert->>'userId'
                          WHERE c.schluessel = 'handbuch_firmen_ansprechpartner'
                            AND coalesce(p.avatar_url, '') <> '')
              THEN 'ja'
            WHEN EXISTS (SELECT 1 FROM public.app_config WHERE schluessel = 'handbuch_firmen_ansprechpartner')
              THEN 'Eintrag da, aber Kennung unbekannt oder ohne Profilbild'
            ELSE 'noch nicht gesetzt, die Seite zeigt Initialen' END

UNION ALL
SELECT '16.1 Naechtliche Abmeldung: Funktion nur fuer Service-Rolle',
       CASE WHEN to_regprocedure('public.naechtliche_abmeldung(timestamptz)') IS NULL THEN 'fehlt (20260926200000 ausfuehren)'
            WHEN has_function_privilege('anon', to_regprocedure('public.naechtliche_abmeldung(timestamptz)'), 'EXECUTE')
              OR has_function_privilege('authenticated', to_regprocedure('public.naechtliche_abmeldung(timestamptz)'), 'EXECUTE')
              THEN 'NEIN, Recht zu weit'
            ELSE 'ja' END

UNION ALL
SELECT '16.2 Sitzungen beenden: Funktion nur fuer Service-Rolle',
       CASE WHEN to_regprocedure('public.sitzungen_beenden(uuid)') IS NULL THEN 'fehlt (20260926200000 ausfuehren)'
            WHEN has_function_privilege('anon', to_regprocedure('public.sitzungen_beenden(uuid)'), 'EXECUTE')
              OR has_function_privilege('authenticated', to_regprocedure('public.sitzungen_beenden(uuid)'), 'EXECUTE')
              THEN 'NEIN, Recht zu weit'
            WHEN NOT has_function_privilege('service_role', to_regprocedure('public.sitzungen_beenden(uuid)'), 'EXECUTE')
              THEN 'NEIN, manage-sessions darf nicht aufrufen'
            ELSE 'ja' END

UNION ALL
SELECT '16.3 Naechtliche Abmeldung: Protokolltabelle, im Browser unsichtbar',
       CASE WHEN to_regclass('public.naechtliche_abmeldung_laeufe') IS NULL THEN 'fehlt (20260926200000 ausfuehren)'
            WHEN has_table_privilege('authenticated', to_regclass('public.naechtliche_abmeldung_laeufe'), 'SELECT')
              THEN 'NEIN, angemeldete Nutzer koennen lesen'
            ELSE 'ja' END

UNION ALL
SELECT '16.4 Naechtliche Abmeldung: Zeitplan naechtliche-abmeldung',
       CASE WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'naechtliche-abmeldung' AND active)
            THEN 'ja' ELSE 'fehlt (20260926200000 ausfuehren)' END

UNION ALL
-- Laeuft auch vor der Migration: Die Erneuerungstoken muessen mit der Sitzung
-- verschwinden, sonst waere die Abmeldung wirkungslos.
SELECT '16.5 auth.refresh_tokens haengt mit ON DELETE CASCADE an auth.sessions',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conrelid = 'auth.refresh_tokens'::regclass
                            AND confrelid = 'auth.sessions'::regclass
                            AND contype = 'f' AND confdeltype = 'c')
            THEN 'ja' ELSE 'NEIN, Token bleiben liegen: Funktionen um DELETE FROM auth.refresh_tokens ergaenzen' END

UNION ALL
SELECT '17.1 Aufgaben: abgesagt zaehlt im Ausloeser-Index nicht als offen',
       CASE WHEN to_regclass('public.aufgaben_ausloeser_offen_idx') IS NULL THEN 'fehlt (20260926210000 ausfuehren)'
            WHEN pg_get_indexdef(to_regclass('public.aufgaben_ausloeser_offen_idx')) ILIKE '%abgesagt%' THEN 'ja'
            ELSE 'fehlt (20260926210000 ausfuehren)' END

UNION ALL
SELECT '18.1 Handbuch-Seite: Partner-Schalter in app_config',
       CASE WHEN to_regprocedure('public.handbuch_partner_freigeschaltet()') IS NULL
              OR NOT EXISTS (SELECT 1 FROM public.app_config WHERE schluessel = 'handbuch_partner_freigeschaltet')
              THEN 'fehlt (20260926220000 ausfuehren)'
            WHEN (SELECT wert -> 'aktiv' = 'true'::jsonb FROM public.app_config WHERE schluessel = 'handbuch_partner_freigeschaltet')
              THEN 'ja, fuer Partner freigeschaltet'
            ELSE 'ja, fuer Partner noch gesperrt' END

UNION ALL
SELECT '18.2 Handbuch-Seite: Partner lesen Anforderungen nur mit Schalter',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'handbuch_anforderungen'
                            AND policyname = 'handbuch_anforderungen_lesen'
                            AND qual LIKE '%handbuch_partner_freigeschaltet%')
            THEN 'ja' ELSE 'fehlt (20260926220000 ausfuehren)' END

UNION ALL
SELECT '18.3 Handbuch-Seite: Kennzahlen fuer Partner nur mit Schalter',
       CASE WHEN to_regprocedure('public.handbuch_kennzahlen(integer,uuid,boolean)') IS NOT NULL
             AND pg_get_functiondef(to_regprocedure('public.handbuch_kennzahlen(integer,uuid,boolean)')) LIKE '%handbuch_partner_freigeschaltet%'
            THEN 'ja' ELSE 'fehlt (20260926220000 ausfuehren)' END

UNION ALL
SELECT '18.4 Kuerzel: Sperre gegen konfigurator, selbstauskunft, ergebnis',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vp_slug_sperre' AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20260926220000 ausfuehren)' END

UNION ALL
-- Laeuft auch vor der Migration: Die Sperre greift nur fuer neue Kuerzel.
SELECT '18.5 Kuerzel: kein Partner traegt heute ein gesperrtes Kuerzel',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.profiles
                              WHERE lower(btrim(vp_slug)) IN ('konfigurator', 'selbstauskunft', 'ergebnis'))
            THEN 'ja'
            ELSE 'NEIN, ' || (SELECT count(*) FROM public.profiles
                               WHERE lower(btrim(vp_slug)) IN ('konfigurator', 'selbstauskunft', 'ergebnis'))::text
                 || ' Profil(e) mit gesperrtem Kuerzel, Liste per Lese-SQL im Bericht' END

UNION ALL
SELECT '19.1 Duplikate zusammenfuehren: Funktion kontakte_zusammenfuehren',
       CASE WHEN to_regprocedure('public.kontakte_zusammenfuehren(uuid,uuid,jsonb,jsonb,text,jsonb)') IS NULL THEN 'fehlt (20260926230000 ausfuehren)'
            ELSE 'ja' END

UNION ALL
SELECT '19.2 Duplikate zusammenfuehren: nur fuer angemeldete Nutzer',
       CASE WHEN to_regprocedure('public.kontakte_zusammenfuehren(uuid,uuid,jsonb,jsonb,text,jsonb)') IS NULL THEN 'fehlt (20260926230000 ausfuehren)'
            WHEN has_function_privilege('anon', to_regprocedure('public.kontakte_zusammenfuehren(uuid,uuid,jsonb,jsonb,text,jsonb)'), 'EXECUTE')
              THEN 'NEIN, anon darf aufrufen'
            WHEN NOT has_function_privilege('authenticated', to_regprocedure('public.kontakte_zusammenfuehren(uuid,uuid,jsonb,jsonb,text,jsonb)'), 'EXECUTE')
              THEN 'NEIN, angemeldete Nutzer duerfen nicht aufrufen'
            ELSE 'ja' END

UNION ALL
-- Teil 8: Partnerlinks absichern. Alle Zeilen laufen auch vor der Migration.
SELECT '20.1 Partnerlinks: Regel partner_link_aktiv, nicht oeffentlich',
       CASE WHEN to_regprocedure('public.partner_link_aktiv(uuid)') IS NULL THEN 'fehlt (20260926235000 ausfuehren)'
            WHEN has_function_privilege('anon', to_regprocedure('public.partner_link_aktiv(uuid)'), 'EXECUTE')
              OR has_function_privilege('authenticated', to_regprocedure('public.partner_link_aktiv(uuid)'), 'EXECUTE')
              THEN 'NEIN, Recht zu weit'
            ELSE 'ja' END

UNION ALL
SELECT '20.2 Tippgeber-Kuerzel loest nur beim aktiven Partner auf',
       CASE WHEN pg_get_functiondef(to_regprocedure('public.resolve_tippgeber_slug(text,text)')) LIKE '%partner_link_aktiv%'
            THEN 'ja' ELSE 'fehlt (20260926235000 ausfuehren)' END

UNION ALL
SELECT '20.3 Link-Kuerzel der Partner nur ueber Verwaltung (trg_vp_slug_schutz)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vp_slug_schutz' AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20260926235000 ausfuehren)' END

UNION ALL
SELECT '20.4 Klickzaehler mit Partner- und Tippgeberkuerzel, Tagesgrenze',
       CASE WHEN to_regprocedure('public.tippgeber_klick_zaehlen(text,text)') IS NULL
              OR to_regclass('public.tippgeber_klick_tage') IS NULL THEN 'fehlt (20260926235000 ausfuehren)'
            WHEN NOT has_function_privilege('anon', to_regprocedure('public.tippgeber_klick_zaehlen(text,text)'), 'EXECUTE')
              THEN 'NEIN, Besucher koennen nicht zaehlen'
            WHEN has_table_privilege('authenticated', to_regclass('public.tippgeber_klick_tage'), 'SELECT')
              OR has_table_privilege('anon', to_regclass('public.tippgeber_klick_tage'), 'SELECT')
              THEN 'NEIN, Zaehltabelle im Browser lesbar'
            ELSE 'ja' END

UNION ALL
SELECT '20.5 Alter Klickzaehler zaehlt nur eindeutige Kuerzel',
       CASE WHEN pg_get_functiondef(to_regprocedure('public.increment_tippgeber_klick(text)')) LIKE '%count(*) = 1%'
            THEN 'ja' ELSE 'fehlt (20260926235000 ausfuehren)' END

UNION ALL
SELECT '20.6 Tippgeber-Kuerzel bleibt bei Namensaenderung',
       CASE WHEN to_regprocedure('public.tippgeber_set_slug()') IS NULL THEN 'fehlt (Funktion tippgeber_set_slug unbekannt)'
            WHEN pg_get_functiondef(to_regprocedure('public.tippgeber_set_slug()')) LIKE '%OLD.vorname%'
              THEN 'fehlt (20260926235000 ausfuehren)'
            ELSE 'ja' END

UNION ALL
-- Nur zur Auskunft: Diese Kuerzel kommen bei mehreren Partnern vor. Der alte
-- Zaehlweg zaehlt sie seit der Migration nicht mehr, der neue schon.
SELECT '20.7 Tippgeber-Kuerzel bei mehreren Partnern (Auskunft)',
       (SELECT count(*) FROM (SELECT tg_slug FROM public.tippgeber WHERE tg_slug IS NOT NULL
                               GROUP BY tg_slug HAVING count(DISTINCT zugeordnet_id) > 1) d)::text
       || ' Kuerzel'

UNION ALL
SELECT '21.1 Duplikate zusammenfuehren: Funktion kontakt_dateipfade_umschreiben',
       CASE WHEN to_regprocedure('public.kontakt_dateipfade_umschreiben(uuid,uuid,uuid,jsonb)') IS NULL THEN 'fehlt (20260927000000 ausfuehren)'
            ELSE 'ja' END

UNION ALL
SELECT '21.2 Duplikate zusammenfuehren: Dateipfade nur fuer die Service-Rolle',
       CASE WHEN to_regprocedure('public.kontakt_dateipfade_umschreiben(uuid,uuid,uuid,jsonb)') IS NULL THEN 'fehlt (20260927000000 ausfuehren)'
            WHEN has_function_privilege('anon', to_regprocedure('public.kontakt_dateipfade_umschreiben(uuid,uuid,uuid,jsonb)'), 'EXECUTE')
              OR has_function_privilege('authenticated', to_regprocedure('public.kontakt_dateipfade_umschreiben(uuid,uuid,uuid,jsonb)'), 'EXECUTE')
              OR has_function_privilege('authenticated', to_regprocedure('public.kontakt_pfade_ersetzen(text,jsonb,boolean)'), 'EXECUTE')
              THEN 'NEIN, angemeldete Nutzer duerfen aufrufen'
            ELSE 'ja' END

UNION ALL
-- Teil 1 vom 27.09.2026: Sperre im Profil. Alle Zeilen laufen auch vor der Migration.
SELECT '22.1 Sperre im Profil nur ueber Verwaltung (trg_profil_verwaltungsfelder_schutz)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_profil_verwaltungsfelder_schutz' AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20260927010000 ausfuehren)' END

UNION ALL
SELECT '22.2 Geschuetzt: gesperrt, gesperrt_grund, unterlagen_frist_bis, rollen_variante',
       CASE WHEN pg_get_functiondef(to_regprocedure('public.profil_verwaltungsfelder_schutz_pruefen()')) LIKE '%OLD.gesperrt_grund%'
             AND pg_get_functiondef(to_regprocedure('public.profil_verwaltungsfelder_schutz_pruefen()')) LIKE '%OLD.unterlagen_frist_bis%'
             AND pg_get_functiondef(to_regprocedure('public.profil_verwaltungsfelder_schutz_pruefen()')) LIKE '%OLD.rollen_variante%'
            THEN 'ja' ELSE 'fehlt (20260927010000 ausfuehren)' END

UNION ALL
SELECT '23.1 Tippgeber-Lead mit Einverstaendnis (create_tippgeber_lead, 14 Parameter)',
       CASE WHEN to_regprocedure('public.create_tippgeber_lead(text,text,text,text,text,text,text,text,text,text,text,boolean,text,text)') IS NOT NULL
            THEN 'ja' ELSE 'fehlt (20260927020000 ausfuehren)' END

UNION ALL
SELECT '23.2 Alte Fassung mit 11 Parametern entfernt (sonst mehrdeutig)',
       CASE WHEN to_regprocedure('public.create_tippgeber_lead(text,text,text,text,text,text,text,text,text,text,text)') IS NULL
            THEN 'ja' ELSE 'fehlt (20260927020000 ausfuehren)' END

UNION ALL
SELECT '23.3 Ohne Einverstaendnis wird abgelehnt',
       CASE WHEN coalesce(pg_get_functiondef(to_regprocedure('public.create_tippgeber_lead(text,text,text,text,text,text,text,text,text,text,text,boolean,text,text)')) LIKE '%_einverstaendnis IS NOT TRUE%', false)
            THEN 'ja' ELSE 'fehlt (20260927020000 ausfuehren)' END

UNION ALL
SELECT '23.4 Nur angemeldete Nutzer, keine Fremden',
       CASE WHEN to_regprocedure('public.create_tippgeber_lead(text,text,text,text,text,text,text,text,text,text,text,boolean,text,text)') IS NULL THEN 'fehlt (20260927020000 ausfuehren)'
            WHEN has_function_privilege('anon', to_regprocedure('public.create_tippgeber_lead(text,text,text,text,text,text,text,text,text,text,text,boolean,text,text)'), 'EXECUTE') THEN 'NEIN, Recht zu weit'
            WHEN NOT has_function_privilege('authenticated', to_regprocedure('public.create_tippgeber_lead(text,text,text,text,text,text,text,text,text,text,text,boolean,text,text)'), 'EXECUTE') THEN 'NEIN, Tippgeber koennen nicht senden'
            ELSE 'ja' END

UNION ALL
-- Nur zur Auskunft: so viele Kontakte tragen schon einen Nachweis.
SELECT '23.5 Tippgeber-Leads mit gespeichertem Einverstaendnis (Auskunft)',
       (SELECT count(*) FROM public.kontakte WHERE meta ? 'tippgeberEinverstaendnis')::text || ' Kontakte'

UNION ALL
-- Teil 3: Meta Pixel nur mit Anlage 4 oder Bestandsschutz (20260927040000).
-- Alle Zeilen laufen auch vor der Migration: Die Liste wird nur ueber
-- query_to_xml gelesen, und nur, wenn es sie gibt.
SELECT '24.1 Meta Pixel: Liste meta_pixel_berechtigung',
       CASE WHEN to_regclass('public.meta_pixel_berechtigung') IS NULL THEN 'fehlt (20260927040000 ausfuehren)'
            ELSE 'ja' END

UNION ALL
SELECT '24.2 Meta Pixel: Liste nicht im Browser lesbar oder schreibbar',
       CASE WHEN to_regclass('public.meta_pixel_berechtigung') IS NULL THEN 'fehlt (20260927040000 ausfuehren)'
            WHEN has_table_privilege('anon', to_regclass('public.meta_pixel_berechtigung'), 'SELECT')
              OR has_table_privilege('authenticated', to_regclass('public.meta_pixel_berechtigung'), 'SELECT')
              OR has_table_privilege('authenticated', to_regclass('public.meta_pixel_berechtigung'), 'INSERT')
              OR has_table_privilege('authenticated', to_regclass('public.meta_pixel_berechtigung'), 'UPDATE')
              THEN 'NEIN, Recht zu weit'
            ELSE 'ja' END

UNION ALL
SELECT '24.3 Meta Pixel: Ausloeser trg_meta_pixel_entfernt',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_meta_pixel_entfernt' AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20260927040000 ausfuehren)' END

UNION ALL
SELECT '24.4 Meta Pixel: meta_pixel_entfernen nur fuer die Service-Rolle',
       CASE WHEN to_regprocedure('public.meta_pixel_entfernen(uuid)') IS NULL THEN 'fehlt (20260927040000 ausfuehren)'
            WHEN has_function_privilege('anon', to_regprocedure('public.meta_pixel_entfernen(uuid)'), 'EXECUTE')
              OR has_function_privilege('authenticated', to_regprocedure('public.meta_pixel_entfernen(uuid)'), 'EXECUTE')
              THEN 'NEIN, Recht zu weit'
            ELSE 'ja' END

UNION ALL
-- Nur zur Auskunft: so viele Partner behalten ihr Pixel (Bestandsschutz).
SELECT '24.5 Meta Pixel: Partner mit Bestandsschutz (Auskunft)',
       CASE WHEN to_regclass('public.meta_pixel_berechtigung') IS NULL THEN 'fehlt (20260927040000 ausfuehren)'
            ELSE (xpath('/row/c/text()', query_to_xml(
                   'SELECT count(*) AS c FROM public.meta_pixel_berechtigung
                     WHERE bestandsschutz AND bestandsschutz_beendet_am IS NULL',
                   false, true, '')))[1]::text || ' Partner' END

UNION ALL
-- Teil 4: Bewerbungen nur fuer hr, admin, inhaber und backoffice. Alle Zeilen
-- laufen auch vor der Migration und melden dann "fehlt".
SELECT '25.1 Regel darf_bewerberbereich, nicht fuer Fremde',
       CASE WHEN to_regprocedure('public.darf_bewerberbereich(uuid)') IS NULL THEN 'fehlt (20260927060000 ausfuehren)'
            WHEN has_function_privilege('anon', to_regprocedure('public.darf_bewerberbereich(uuid)'), 'EXECUTE')
              THEN 'NEIN, anon darf aufrufen'
            WHEN NOT has_function_privilege('authenticated', to_regprocedure('public.darf_bewerberbereich(uuid)'), 'EXECUTE')
              THEN 'NEIN, die Regeln koennen die Pruefung nicht aufrufen'
            WHEN pg_get_functiondef(to_regprocedure('public.darf_bewerberbereich(uuid)'))
                 NOT LIKE '%''hr'', ''admin'', ''inhaber'', ''backoffice''%'
              THEN 'NEIN, andere Rollenliste'
            ELSE 'ja' END

UNION ALL
SELECT '25.2 Keine Regel der Bewerbertabellen nutzt mehr is_internal_role',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_policies
               WHERE ((schemaname = 'public' AND tablename IN ('bewerbungen', 'bewerber_formular', 'bewerber_mail_tracking'))
                   OR (schemaname = 'storage' AND tablename = 'objects'
                       AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%''bewerbungen''%'))
                 AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%is_internal_role%')
            THEN 'fehlt (20260927060000 ausfuehren)' ELSE 'ja' END

UNION ALL
SELECT '25.3 bewerbungen: vier Regeln, alle ueber darf_bewerberbereich, Bewerber liest eigene',
       CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bewerbungen') = 4
             AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bewerbungen'
                              AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) NOT LIKE '%darf_bewerberbereich%')
             AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bewerbungen'
                          AND policyname = 'Bewerberbereich sieht Bewerbungen' AND qual LIKE '%benutzer_id%')
            THEN 'ja' ELSE 'fehlt (20260927060000 ausfuehren)' END

UNION ALL
SELECT '25.4 Fragebogen-Antworten und Mail-Tracking nur ueber darf_bewerberbereich',
       CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
                   AND tablename IN ('bewerber_formular', 'bewerber_mail_tracking')) = 3
             AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                              AND tablename IN ('bewerber_formular', 'bewerber_mail_tracking')
                              AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) NOT LIKE '%darf_bewerberbereich%')
            THEN 'ja' ELSE 'fehlt (20260927060000 ausfuehren)' END

UNION ALL
SELECT '25.5 Ablage bewerbungen: oeffnen, hochladen, loeschen nur ueber darf_bewerberbereich',
       CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%''bewerbungen''%') = 3
             AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                              AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%''bewerbungen''%'
                              AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) NOT LIKE '%darf_bewerberbereich%')
            THEN 'ja' ELSE 'fehlt (20260927060000 ausfuehren)' END

UNION ALL
SELECT '25.6 Signaturanfragen der Partnervertraege nur Bewerberbereich (einschraenkend)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_requests'
                          AND policyname = 'Partnervertraege nur Bewerberbereich' AND permissive = 'RESTRICTIVE')
            THEN 'ja' ELSE 'fehlt (20260927060000 ausfuehren)' END

UNION ALL
SELECT '25.7 bewerber_seite und bewerber_abmeldung weiter ohne Regel (nur Service-Rolle)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                          AND tablename IN ('bewerber_seite', 'bewerber_abmeldung'))
            THEN 'NEIN, dort steht eine Regel' ELSE 'ja' END

UNION ALL
-- Nur zur Auskunft: aktivierte Partner, deren Werber nur in der Bewerbung
-- steht und nicht in user_settings. Diesen Teamleitern fehlt der Partner
-- seither in der Teamansicht im Browser; die Datenbank (team_zuordnung)
-- kennt ihn weiter. Erwartet: 0.
SELECT '25.8 Werber nur in der Bewerbung, nicht in user_settings (Auskunft)',
       (SELECT count(*) FROM public.bewerbungen b
         WHERE coalesce(b.meta ->> 'userAccountId', '') <> ''
           AND coalesce(b.meta ->> 'geworbenVonUserId', '') <> ''
           AND NOT EXISTS (
             SELECT 1 FROM public.user_settings s
              WHERE s.user_id::text = b.meta ->> 'userAccountId'
                AND (s.einstellungen ->> 'geworben_von_user_id' = b.meta ->> 'geworbenVonUserId'
                  OR s.einstellungen ->> 'teamleader_id' = b.meta ->> 'geworbenVonUserId')))::text
       || ' Partner'

UNION ALL
-- Tabellenrechte (28.09.2026). „permission denied for table bewerbungen“
-- kommt nie aus einer Zeilenregel, sondern aus fehlenden Rechten. Angemeldete
-- Nutzer brauchen alle vier Rechte (die Regeln filtern die Zeilen), anon
-- keines. Meldet diese Zeile „ja“, stammen weitere Fehler dieser Art aus
-- Abfragen ohne Anmeldung.
SELECT '25.9 bewerbungen: Rechte fuer angemeldete Nutzer, keine fuer anon',
       CASE WHEN NOT (has_table_privilege('authenticated', 'public.bewerbungen', 'SELECT')
                  AND has_table_privilege('authenticated', 'public.bewerbungen', 'INSERT')
                  AND has_table_privilege('authenticated', 'public.bewerbungen', 'UPDATE')
                  AND has_table_privilege('authenticated', 'public.bewerbungen', 'DELETE'))
              THEN 'NEIN, angemeldeten Nutzern fehlt ein Recht'
            WHEN has_table_privilege('anon', 'public.bewerbungen', 'SELECT, INSERT, UPDATE, DELETE')
              THEN 'NEIN, anon hat noch ein Recht'
            ELSE 'ja' END

UNION ALL
-- Teil 5: Nachweis der Pixel-Einwilligung nur durch den Server (20260927070000).
-- Laeuft auch vor der Migration und meldet dann "fehlt".
SELECT '26.1 Pixel-Nachweis am Lead: Ausloeser trg_kontakt_marketing_nachweis',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_kontakt_marketing_nachweis' AND NOT tgisinternal
                            AND tgrelid = 'public.kontakte'::regclass)
            THEN 'ja' ELSE 'fehlt (20260927070000 ausfuehren)' END

UNION ALL
SELECT '26.2 Pixel-Nachweis am Lead: nur der Dienstschluessel schreibt',
       CASE WHEN to_regprocedure('public.kontakt_marketing_nachweis_schuetzen()') IS NULL THEN 'fehlt (20260927070000 ausfuehren)'
            WHEN pg_get_functiondef(to_regprocedure('public.kontakt_marketing_nachweis_schuetzen()')) LIKE '%auth.uid() IS NULL%'
              THEN 'ja'
            ELSE 'NEIN, Schutzregel veraendert' END

UNION ALL
SELECT '26.3 Pixel-Nachweis am Lead: meta ohne Objekt nimmt ihn nicht mit',
       CASE WHEN to_regprocedure('public.kontakt_marketing_nachweis_schuetzen()') IS NULL THEN 'fehlt (20260927070000 ausfuehren)'
            WHEN pg_get_functiondef(to_regprocedure('public.kontakt_marketing_nachweis_schuetzen()')) LIKE '%NEW.meta := OLD.meta%'
              THEN 'ja'
            ELSE 'fehlt (20260927070000 erneut ausfuehren)' END

UNION ALL
-- Teil 6: Offene Gegenzeichnungen, neuer Token und Verweis (20260927080000).
-- Laeuft auch vor der Migration.
SELECT '27.1 Gegenzeichnung: keine offene alte Anfrage ohne Verweis und ohne neuen Token',
       CASE WHEN EXISTS (SELECT 1 FROM public.signature_requests
                          WHERE person_type = 'vertrag_kurz' AND status = 'pending'
                            AND coalesce(sa_data ->> 'bewerberRequestId', '') = ''
                            AND coalesce(sa_data ->> 'tokenErneuertAm', '') = '')
            THEN 'fehlt (20260927080000 ausfuehren), ' ||
                 (SELECT count(*) FROM public.signature_requests
                   WHERE person_type = 'vertrag_kurz' AND status = 'pending'
                     AND coalesce(sa_data ->> 'bewerberRequestId', '') = ''
                     AND coalesce(sa_data ->> 'tokenErneuertAm', '') = '')::text || ' offen'
            ELSE 'ja' END

UNION ALL
SELECT '27.2 Gegenzeichnung: kein Token mehr in der Akte des Bewerbers',
       CASE WHEN EXISTS (SELECT 1 FROM public.bewerbungen WHERE meta ? 'vertragKurzAnfrageToken')
            THEN 'fehlt (20260927080000 ausfuehren)'
            ELSE 'ja' END

UNION ALL
-- Pixel-Nachweise bei wiederholten Anfragen (20260927090000).
-- Laeuft auch vor der Migration und meldet dann "fehlt".
SELECT '28.1 Pixel-Nachweise: Ausloeser schuetzt auch marketingEinwilligungen',
       CASE WHEN to_regprocedure('public.kontakt_marketing_nachweis_schuetzen()') IS NULL THEN 'fehlt (20260927090000 ausfuehren)'
            WHEN pg_get_functiondef(to_regprocedure('public.kontakt_marketing_nachweis_schuetzen()')) LIKE '%marketingEinwilligungen%'
              THEN 'ja'
            ELSE 'fehlt (20260927090000 ausfuehren)' END

UNION ALL
SELECT '28.2 Pixel-Nachweise: Ausloeser haengt an kontakte',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_kontakt_marketing_nachweis' AND NOT tgisinternal
                            AND tgrelid = 'public.kontakte'::regclass)
            THEN 'ja' ELSE 'fehlt (20260927090000 ausfuehren)' END

UNION ALL
SELECT '28.3 Pixel-Nachweise: Anhaengen nur fuer die Service-Rolle',
       CASE WHEN to_regprocedure('public.kontakt_marketing_nachweis_anhaengen(uuid, jsonb)') IS NULL THEN 'fehlt (20260927090000 ausfuehren)'
            WHEN has_function_privilege('anon', 'public.kontakt_marketing_nachweis_anhaengen(uuid, jsonb)', 'EXECUTE')
              OR has_function_privilege('authenticated', 'public.kontakt_marketing_nachweis_anhaengen(uuid, jsonb)', 'EXECUTE')
              THEN 'NEIN, von aussen aufrufbar'
            WHEN has_function_privilege('service_role', 'public.kontakt_marketing_nachweis_anhaengen(uuid, jsonb)', 'EXECUTE')
              THEN 'ja'
            ELSE 'NEIN, Service-Rolle fehlt' END

UNION ALL
SELECT '28.4 Pixel-Nachweise: Liste nur wachsend und nur mit Markierung',
       CASE WHEN to_regprocedure('public.kontakt_marketing_nachweis_schuetzen()') IS NULL THEN 'fehlt (20260927090000 ausfuehren)'
            WHEN pg_get_functiondef(to_regprocedure('public.kontakt_marketing_nachweis_schuetzen()')) LIKE '%app.marketing_nachweis_anhaengen%'
              THEN 'ja'
            ELSE 'fehlt (20260927090000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 29: Videocall nur fuer den Geschaeftsfuehrer als admin
-- Laeuft auch vor der Migration und meldet dann "fehlt".
UNION ALL
SELECT '29.1 Videocall: darf_videocall prueft nur die Konten des Geschaeftsfuehrers',
       CASE WHEN to_regprocedure('public.darf_videocall(uuid)') IS NULL THEN 'fehlt (20260927120000 ausfuehren)'
            WHEN pg_get_functiondef(to_regprocedure('public.darf_videocall(uuid)')) LIKE '%e81f0a13-0578-4456-9960-07be014d869c%'
             AND pg_get_functiondef(to_regprocedure('public.darf_videocall(uuid)')) NOT LIKE '%videocall_freigaben%'
              THEN 'ja'
            ELSE 'fehlt (20260927120000 ausfuehren)' END

UNION ALL
SELECT '29.2 Videocall: kein Weg mehr ueber hr oder die Adminrolle allgemein',
       CASE WHEN to_regprocedure('public.darf_videocall(uuid)') IS NULL THEN 'fehlt (20260927120000 ausfuehren)'
            WHEN pg_get_functiondef(to_regprocedure('public.darf_videocall(uuid)')) NOT LIKE '%is_admin_role%'
             AND pg_get_functiondef(to_regprocedure('public.darf_videocall(uuid)')) NOT LIKE '%''hr''%'
              THEN 'ja'
            ELSE 'fehlt (20260927120000 ausfuehren)' END

UNION ALL
SELECT '29.3 Videocall: ein Konto des Geschaeftsfuehrers traegt die Rolle admin',
       CASE WHEN EXISTS (SELECT 1 FROM public.user_roles
                          WHERE role = 'admin'
                            AND user_id IN ('27ccfbab-f949-4484-90b1-7dffca6a65c9',
                                            'e81f0a13-0578-4456-9960-07be014d869c'))
            THEN 'ja' ELSE 'NEIN, dann kann niemand Videocall-Zeilen anlegen' END

UNION ALL
SELECT '29.4 Videocall: buchung_links.ziel mit Pruefregel',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conname = 'buchung_links_ziel_chk'
                            AND conrelid = 'public.buchung_links'::regclass)
            THEN 'ja' ELSE 'fehlt (20260927120000 ausfuehren)' END

UNION ALL
SELECT '29.5 Videocall: interne Buchungsstrecke nur fuer Gastgeber mit Videocall, nie fuer externe Links',
       CASE WHEN pg_get_functiondef(to_regprocedure('public.buchung_zugang_aufloesen(text)')) LIKE '%darf_videocall(l.mitarbeiter_id)%'
             AND pg_get_functiondef(to_regprocedure('public.buchung_zugang_aufloesen(text)')) LIKE '%l.ziel = ''intern''%'
             AND pg_get_functiondef(to_regprocedure('public.buchung_zugang_aufloesen(text)')) LIKE '%darf_videocall(e.mitarbeiter_id)%'
              THEN 'ja'
            ELSE 'fehlt (20260927120000 ausfuehren)' END

UNION ALL
SELECT '29.6 Videocall: Bewerberbuchung nur mit Videocall des Gastgebers',
       CASE WHEN pg_get_functiondef(to_regprocedure('public.bewerber_termin_buchen(text,timestamptz)')) LIKE '%darf_videocall(_gastgeber)%'
            THEN 'ja' ELSE 'fehlt (20260927120000 ausfuehren)' END

UNION ALL
SELECT '29.7 Videocall: Raumverwaltung ohne Adminrolle allgemein, hr oder Vertrieb',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public'
                            AND tablename IN ('videoraeume', 'videoraum_teilnehmer', 'buchung_einstellungen',
                                              'buchung_verfuegbarkeiten', 'buchung_terminarten')
                            AND (COALESCE(qual, '') || COALESCE(with_check, '')) ~ '(is_admin_role|has_role)')
            THEN 'fehlt (20260927120000 ausfuehren)' ELSE 'ja' END

UNION ALL
SELECT '29.8 Videocall: Videoraeume lesen nur mit darf_videocall',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'videoraeume'
                            AND policyname = 'Videoraum lesen' AND qual LIKE '%darf_videocall%')
            THEN 'ja' ELSE 'fehlt (20260927120000 ausfuehren)' END

UNION ALL
SELECT '29.9 Externer Kalender: interne Rollen legen externe Links an',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'buchung_links'
                            AND policyname = 'Buchung Links anlegen'
                            AND with_check LIKE '%extern%' AND with_check LIKE '%is_internal_role%')
            THEN 'ja' ELSE 'fehlt (20260927120000 ausfuehren)' END

UNION ALL
SELECT '29.10 Buchungslinks: Kontakt und Besitzer ueber die Schnittstelle unveraenderlich',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_buchung_links_zuordnung' AND NOT tgisinternal
                            AND tgrelid = 'public.buchung_links'::regclass)
            THEN 'ja' ELSE 'fehlt (20260927120000 ausfuehren)' END

UNION ALL
SELECT '29.11 Buchungslinks: Aendern prueft Kontaktzugriff wie das Anlegen',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'buchung_links'
                            AND policyname = 'Buchung Links aendern'
                            AND with_check LIKE '%kontakt_visible_to_internal%')
            THEN 'ja' ELSE 'fehlt (20260927120000 ausfuehren)' END

UNION ALL
SELECT '29.12 Terminseite: nimmt nur Links auf den externen Kalender an',
       CASE WHEN pg_get_functiondef(to_regprocedure('public.partnertermin_zugang(text)')) LIKE '%l.ziel = ''extern''%'
             AND pg_get_functiondef(to_regprocedure('public.partnertermin_bestaetigen(text,text,text,text,uuid)')) LIKE '%l.ziel = ''extern''%'
              THEN 'ja'
            ELSE 'fehlt (20260927120000 ausfuehren)' END

UNION ALL
SELECT '30.1 MORE Lotse: drei Tabellen vorhanden',
       CASE WHEN to_regclass('public.lotse_zustimmung') IS NOT NULL
             AND to_regclass('public.lotse_nachrichten') IS NOT NULL
             AND to_regclass('public.lotse_unterlagen_auszug') IS NOT NULL
            THEN 'ja' ELSE 'fehlt (20260928120000 ausfuehren)' END

UNION ALL
SELECT '30.2 MORE Lotse: Zeilensicherheit auf allen drei Tabellen an',
       CASE WHEN (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = 'public' AND c.relrowsecurity
                     AND c.relname IN ('lotse_zustimmung', 'lotse_nachrichten', 'lotse_unterlagen_auszug')) = 3
            THEN 'ja' ELSE 'fehlt (20260928120000 ausfuehren)' END

UNION ALL
SELECT '30.3 MORE Lotse: Verlauf nur eigene Zeilen, Schreiben nur die Function',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lotse_nachrichten'
                          AND policyname = 'lotse_nachrichten_lesen' AND qual LIKE '%auth.uid()%')
             AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lotse_nachrichten'
                              AND cmd IN ('INSERT', 'UPDATE', 'ALL'))
             AND NOT has_table_privilege('authenticated', to_regclass('public.lotse_nachrichten'), 'INSERT')
            THEN 'ja' ELSE 'fehlt (20260928120000 ausfuehren)' END

UNION ALL
SELECT '30.4 MORE Lotse: Auszuege fuer angemeldete Nutzer nicht lesbar',
       CASE WHEN to_regclass('public.lotse_unterlagen_auszug') IS NOT NULL
             AND NOT has_table_privilege('authenticated', to_regclass('public.lotse_unterlagen_auszug'), 'SELECT')
             AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lotse_unterlagen_auszug')
            THEN 'ja' ELSE 'fehlt (20260928120000 ausfuehren)' END

UNION ALL
SELECT '30.5 MORE Lotse: Zeitpunkt der Zustimmung setzt die Datenbank',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_lotse_zustimmung_zeitpunkt' AND NOT tgisinternal
                            AND tgrelid = to_regclass('public.lotse_zustimmung'))
            THEN 'ja' ELSE 'fehlt (20260928120000 ausfuehren)' END

UNION ALL
SELECT '30.6 MORE Lotse: Zeitplan raeumt Nachrichten und Kontingent nach 90 Tagen auf',
       CASE WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lotse-verlauf-aufraeumen' AND active
                           AND command LIKE '%lotse_aufraeumen%')
             AND to_regprocedure('public.lotse_aufraeumen()') IS NOT NULL
            THEN 'ja' ELSE 'fehlt (20260928120000 ausfuehren)' END

UNION ALL
SELECT '30.7 MORE Lotse: Kontingent mit Zeilensicherheit, fuer Nutzer nicht lesbar',
       CASE WHEN to_regclass('public.lotse_kontingent') IS NOT NULL
             AND (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.lotse_kontingent'))
             AND NOT has_table_privilege('authenticated', to_regclass('public.lotse_kontingent'), 'SELECT')
             AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lotse_kontingent')
            THEN 'ja' ELSE 'fehlt (20260928120000 ausfuehren)' END

UNION ALL
SELECT '30.8 MORE Lotse: Kontingent reservieren nur fuer die Service-Rolle',
       CASE WHEN to_regprocedure('public.lotse_kontingent_reservieren(uuid,integer)') IS NOT NULL
             AND has_function_privilege('service_role', to_regprocedure('public.lotse_kontingent_reservieren(uuid,integer)'), 'EXECUTE')
             AND NOT has_function_privilege('authenticated', to_regprocedure('public.lotse_kontingent_reservieren(uuid,integer)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.lotse_kontingent_reservieren(uuid,integer)'), 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20260928120000 ausfuehren)' END

UNION ALL
SELECT '30.9 MORE Lotse: Auszuege tragen die Schema-Fassung',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'lotse_unterlagen_auszug' AND column_name = 'schema_fassung')
            THEN 'ja' ELSE 'fehlt (20260928120000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 31: Support-Antworten atomar anhaengen und melden
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '31.1 Support: Nachricht anhaengen fuer Angemeldete, SECURITY DEFINER',
       CASE WHEN to_regprocedure('public.support_ticket_nachricht_anhaengen(uuid,text,text)') IS NOT NULL
             AND (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.support_ticket_nachricht_anhaengen(uuid,text,text)'))
             AND has_function_privilege('authenticated', to_regprocedure('public.support_ticket_nachricht_anhaengen(uuid,text,text)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.support_ticket_nachricht_anhaengen(uuid,text,text)'), 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20260928130000 ausfuehren)' END

UNION ALL
SELECT '31.2 Support: Anhaengen unter Zeilensperre, Glocke nur bei Support-Antwort',
       CASE WHEN to_regprocedure('public.support_ticket_nachricht_anhaengen(uuid,text,text)') IS NOT NULL
             AND pg_get_functiondef(to_regprocedure('public.support_ticket_nachricht_anhaengen(uuid,text,text)')) LIKE '%FOR UPDATE%'
             AND pg_get_functiondef(to_regprocedure('public.support_ticket_nachricht_anhaengen(uuid,text,text)')) LIKE '%p_als = ''support'' AND v_t.benutzer_id IS NOT NULL%'
            THEN 'ja' ELSE 'fehlt (20260928130000 ausfuehren)' END

UNION ALL
SELECT '31.3 Support: Lesemarke setzen nur fuer das eigene Ticket',
       CASE WHEN to_regprocedure('public.support_ticket_gelesen(uuid)') IS NOT NULL
             AND pg_get_functiondef(to_regprocedure('public.support_ticket_gelesen(uuid)')) LIKE '%benutzer_id = v_uid%'
             AND has_function_privilege('authenticated', to_regprocedure('public.support_ticket_gelesen(uuid)'), 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20260928130000 ausfuehren)' END

UNION ALL
SELECT '31.4 Support: Antwort erneut melden vorhanden',
       CASE WHEN to_regprocedure('public.support_ticket_antwort_melden(uuid)') IS NOT NULL
             AND has_function_privilege('authenticated', to_regprocedure('public.support_ticket_antwort_melden(uuid)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.support_ticket_antwort_melden(uuid)'), 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20260928130000 ausfuehren)' END

UNION ALL
SELECT '31.5 Support: Mail-Bremse nur fuer die Service-Rolle',
       CASE WHEN to_regprocedure('public.support_ticket_mail_beanspruchen(uuid)') IS NOT NULL
             AND has_function_privilege('service_role', to_regprocedure('public.support_ticket_mail_beanspruchen(uuid)'), 'EXECUTE')
             AND NOT has_function_privilege('authenticated', to_regprocedure('public.support_ticket_mail_beanspruchen(uuid)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.support_ticket_mail_beanspruchen(uuid)'), 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20260928130000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 32: Vertriebspartner geben Leads an die Zentrale zurueck
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '32.1 Rueckgabe: Regel fuer Vertriebspartner laesst zustaendig_id NULL zu',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'kontakte'
                 AND policyname = 'Vertriebspartner bearbeiten eigene Kontakte'
                 AND with_check LIKE '%zustaendig_id IS NULL%')
            THEN 'ja' ELSE 'fehlt (20260928150000 ausfuehren)' END

UNION ALL
SELECT '32.2 Rueckgabe: Trigger laesst nur den eigenen Lead zurueckgeben',
       CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname = 'kontakt_zustaendigkeit_schuetzen' LIMIT 1)
                 LIKE '%OLD.zustaendig_id <> auth.uid()%'
            THEN 'ja' ELSE 'fehlt (20260918130000 ausfuehren, sonst ist 32.1 zu weit)' END

UNION ALL
SELECT '32.3 claim_lead: nur Rollen der Lead-Verwaltung, nicht jede interne Rolle',
       CASE WHEN to_regprocedure('public.claim_lead(uuid,text)') IS NOT NULL
             AND pg_get_functiondef(to_regprocedure('public.claim_lead(uuid,text)')) NOT LIKE '%is_internal_role%'
             AND pg_get_functiondef(to_regprocedure('public.claim_lead(uuid,text)')) LIKE '%''setterin''%'
             AND has_function_privilege('authenticated', to_regprocedure('public.claim_lead(uuid,text)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.claim_lead(uuid,text)'), 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20260928150000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 33: Glocke nur mit Pfad im CRM und nur an erlaubte Empfaenger
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '33.1 Glocke: Link-Pruefung auf benachrichtigungen und scheduled_notifications',
       CASE WHEN (SELECT count(*) FROM pg_trigger
                   WHERE tgname = 'trg_glocke_link_pruefen' AND NOT tgisinternal
                     AND tgrelid IN ('public.benachrichtigungen'::regclass, 'public.scheduled_notifications'::regclass)) = 2
            THEN 'ja' ELSE 'fehlt (20260928160000 ausfuehren)' END

UNION ALL
SELECT '33.2 Glocke: nur Pfade, kein "//", kein "/\", keine Steuerzeichen',
       CASE WHEN to_regprocedure('public.glocke_link_ist_intern(text)') IS NULL THEN 'fehlt (20260928160000 ausfuehren)'
            WHEN strpos(pg_get_functiondef(to_regprocedure('public.glocke_link_ist_intern(text)')), '^/([^/\\]|$)') > 0
             AND strpos(pg_get_functiondef(to_regprocedure('public.glocke_link_ist_intern(text)')), '[[:cntrl:]]') > 0
            THEN 'ja' ELSE 'NEIN, Link-Pruefung weicht ab' END

UNION ALL
SELECT '33.3 Glocke: genau eine Einfuegeregel, ueber darf_glocke_senden',
       CASE WHEN (SELECT count(*) FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = 'benachrichtigungen' AND cmd IN ('INSERT', 'ALL')
                     AND permissive = 'PERMISSIVE') = 1
             AND EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'benachrichtigungen'
                            AND policyname = 'Glocke nur an erlaubte Empfaenger'
                            AND with_check LIKE '%darf_glocke_senden%')
            THEN 'ja' ELSE 'fehlt (20260928160000 ausfuehren)' END

UNION ALL
SELECT '33.4 Glocke: Warteschlange prueft Empfaenger, Rolle und Kontakt, genau eine Einfuegeregel',
       CASE WHEN (SELECT count(*) FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = 'scheduled_notifications' AND cmd IN ('INSERT', 'ALL')
                     AND permissive = 'PERMISSIVE') = 1
             AND EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'scheduled_notifications'
                            AND policyname = 'auth_insert_scheduled_notifications'
                            AND with_check LIKE '%darf_glocke_senden%'
                            AND with_check LIKE '%kontakt_id%')
            THEN 'ja' ELSE 'fehlt (20260928160000 ausfuehren)' END

UNION ALL
SELECT '33.5 Glocke: Spalte absender_id mit Vorbelegung',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'benachrichtigungen'
                            AND column_name = 'absender_id' AND column_default LIKE '%auth.uid()%')
            THEN 'ja' ELSE 'fehlt (20260928160000 ausfuehren)' END

UNION ALL
SELECT '33.6 Glocke: Pruefung nur fuer Angemeldete, nicht fuer Fremde',
       CASE WHEN to_regprocedure('public.darf_glocke_senden(uuid,text,uuid)') IS NULL THEN 'fehlt (20260928160000 ausfuehren)'
            WHEN has_function_privilege('authenticated', to_regprocedure('public.darf_glocke_senden(uuid,text,uuid)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.darf_glocke_senden(uuid,text,uuid)'), 'EXECUTE')
            THEN 'ja' ELSE 'NEIN, Recht zu weit' END

UNION ALL
SELECT '33.7 Portalzugang und Eigentum am Kontakt: nur Admin und Inhaber',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_kontakt_zuordnung' AND NOT tgisinternal
                            AND tgrelid = 'public.kontakte'::regclass)
             AND to_regprocedure('public.kontakt_zuordnung_schuetzen()') IS NOT NULL
             AND strpos(pg_get_functiondef(to_regprocedure('public.kontakt_zuordnung_schuetzen()')), 'erstelltVonId') > 0
             AND NOT EXISTS (SELECT 1 FROM pg_trigger
                              WHERE tgname = 'trg_kontakt_portalzugang' AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20260928160000 ausfuehren)' END

UNION ALL
SELECT '33.8 merge_kontakt_meta: nur am Kontakt, den man betreut',
       CASE WHEN to_regprocedure('public.merge_kontakt_meta(uuid,jsonb)') IS NOT NULL
             AND strpos(pg_get_functiondef(to_regprocedure('public.merge_kontakt_meta(uuid,jsonb)')), 'is_vp_owner_of_kontakt') > 0
             AND strpos(pg_get_functiondef(to_regprocedure('public.merge_kontakt_meta(uuid,jsonb)')), 'darf_alle_kunden_sehen') > 0
            THEN 'ja' ELSE 'fehlt (20260928160000 ausfuehren)' END

UNION ALL
SELECT '33.9 Suchindizes auf den Portalzugang',
       CASE WHEN to_regclass('public.idx_kontakte_meta_auth_user') IS NOT NULL
             AND to_regclass('public.idx_kontakte_meta_person2_auth_user') IS NOT NULL
            THEN 'ja' ELSE 'fehlt (20260928160000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 34: Kennung statt Name (Empfehlung, Tippgeber-Lead, Provisionssatz)
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '34.1 Empfehlung aus dem Portal: Partner ueber den Namen nur bei genau einem Profil',
       CASE WHEN (SELECT string_agg(prosrc, ' ') FROM pg_proc WHERE proname = 'create_empfehlung_kontakt') LIKE '%count(*) = 1 THEN (array_agg(p.id))[1]%'
             AND (SELECT string_agg(prosrc, ' ') FROM pg_proc WHERE proname = 'create_empfehlung_kontakt') NOT LIKE '%ORDER BY p.created_at DESC%'
            THEN 'ja' ELSE 'fehlt (20260928180000 ausfuehren)' END

UNION ALL
SELECT '34.2 Tippgeber-Lead: Partner ueber den Namen nur bei genau einem Profil',
       CASE WHEN to_regprocedure('public.create_tippgeber_lead(text,text,text,text,text,text,text,text,text,text,text,boolean,text,text)') IS NOT NULL
             AND pg_get_functiondef(to_regprocedure('public.create_tippgeber_lead(text,text,text,text,text,text,text,text,text,text,text,boolean,text,text)')) LIKE '%count(*) = 1 THEN (array_agg(p.id))[1]%'
             AND has_function_privilege('authenticated', to_regprocedure('public.create_tippgeber_lead(text,text,text,text,text,text,text,text,text,text,text,boolean,text,text)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.create_tippgeber_lead(text,text,text,text,text,text,text,text,text,text,text,boolean,text,text)'), 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20260928180000 ausfuehren)' END

UNION ALL
SELECT '34.3 Provisionssatz: eigen ohne erstelltVonId nur bei eindeutigem Namen des Partners',
       CASE WHEN to_regprocedure('public.investments_provisionssatz_festschreiben()') IS NOT NULL
             AND (pg_get_functiondef(to_regprocedure('public.investments_provisionssatz_festschreiben()')) LIKE '%bool_and(p.id = _partner)%'
                  -- seit 20260929140000 liegt die Ermittlung in provisionssatz_ermitteln
                  OR (SELECT string_agg(prosrc, ' ') FROM pg_proc WHERE proname = 'provisionssatz_ermitteln') LIKE '%bool_and(p.id = partner_id)%')
            THEN 'ja' ELSE 'fehlt (20260928180000 ausfuehren)' END

UNION ALL
SELECT '34.4 Provisionssatz: Trigger haengt weiter an investments',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_investments_provisionssatz_festschreiben' AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20260909120000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 35: Rueckgabe an die Zentrale ueber eine Funktion
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '35.1 Rueckgabe: Funktion lead_an_zentrale_zurueckgeben, nur fuer Angemeldete',
       CASE WHEN to_regprocedure('public.lead_an_zentrale_zurueckgeben(uuid,jsonb)') IS NOT NULL
             AND has_function_privilege('authenticated', to_regprocedure('public.lead_an_zentrale_zurueckgeben(uuid,jsonb)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.lead_an_zentrale_zurueckgeben(uuid,jsonb)'), 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20260928190000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 36: Favoriten fuer Notizen im Kundenprofil
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '36.1 Notiz-Favoriten: Spalten angepinnt_am und angepinnt_von an aktivitaeten',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'aktivitaeten'
                     AND column_name IN ('angepinnt_am', 'angepinnt_von')) = 2
            THEN 'ja' ELSE 'fehlt (20260928210000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 37: Handbuch, Selbstauskunft direkt aus Ergebnisseite und PDF
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '37.1 Handbuch: Funktion handbuch_sa_starten, fuer Besucher aufrufbar, mit Sperre fuer Person 2',
       CASE WHEN to_regprocedure('public.handbuch_sa_starten(text)') IS NOT NULL
             AND has_function_privilege('anon', to_regprocedure('public.handbuch_sa_starten(text)'), 'EXECUTE')
             AND strpos(pg_get_functiondef(to_regprocedure('public.handbuch_sa_starten(text)')), 'saSignaturePartial') > 0
            THEN 'ja' ELSE 'fehlt (20260928200000 ausfuehren)' END

UNION ALL
SELECT '37.2 Handbuch: Links aus dem PDF speichern nur am Link (nur_am_link)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'sa_fill_tokens'
                            AND column_name = 'nur_am_link')
             AND strpos(pg_get_functiondef(to_regprocedure('public.update_sa_fill_token_data(text,jsonb)')), 'nur_am_link') > 0
            THEN 'ja' ELSE 'fehlt (20260928200000 ausfuehren)' END

UNION ALL
SELECT '37.3 Handbuch: handbuch_abrufen gibt den Selbstauskunft-Link nicht mehr heraus',
       CASE WHEN to_regprocedure('public.handbuch_abrufen(text)') IS NOT NULL
             AND strpos(pg_get_functiondef(to_regprocedure('public.handbuch_abrufen(text)')), chr(39) || 'saToken' || chr(39)) = 0
            THEN 'ja' ELSE 'fehlt (20260928200000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 38: Selbstauskunfts-Link, gespeicherter Stand nur bei offenem Link
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '38.1 Selbstauskunfts-Link: get_sa_fill_token leert den Stand bei abgeschicktem oder abgelaufenem Link, Besucher duerfen aufrufen',
       CASE WHEN to_regprocedure('public.get_sa_fill_token(text)') IS NOT NULL
             AND has_function_privilege('anon', to_regprocedure('public.get_sa_fill_token(text)'), 'EXECUTE')
             AND strpos(pg_get_functiondef(to_regprocedure('public.get_sa_fill_token(text)')), '_zeile.prefill_data := NULL') > 0
            THEN 'ja' ELSE 'fehlt (20260928220000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 39: Glocke ohne Zustaendigen auch an die Vertriebsleitung
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '39.1 Empfehlung und Tippgeber-Lead ohne Zustaendigen: Glocke an admin, inhaber und vertriebsleiter',
       CASE WHEN (SELECT string_agg(prosrc, ' ') FROM pg_proc WHERE proname = 'create_empfehlung_kontakt') LIKE '%''inhaber''::public.app_role, ''vertriebsleiter''::public.app_role%'
             AND (SELECT string_agg(prosrc, ' ') FROM pg_proc WHERE proname = 'create_tippgeber_lead') LIKE '%''inhaber''::public.app_role, ''vertriebsleiter''::public.app_role%'
            THEN 'ja' ELSE 'fehlt (20260928230000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 40: Empfehlung als Dublette, Glocke nicht an einen fremden Partner
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '40.1 Empfehlung als Dublette eines fremden Kontakts: Glocke an die Leitung statt an den Partner des Empfehlenden',
       CASE WHEN (SELECT string_agg(prosrc, ' ') FROM pg_proc WHERE proname = 'create_empfehlung_kontakt') LIKE '%_duplicate_zustaendig IS DISTINCT FROM _vp_id%'
             AND (SELECT string_agg(prosrc, ' ') FROM pg_proc WHERE proname = 'create_empfehlung_kontakt') LIKE '%''inhaber''::public.app_role, ''vertriebsleiter''::public.app_role%'
            THEN 'ja' ELSE 'fehlt (20260929090000 ausfuehren)' END

UNION ALL
SELECT '40.2 Vertretung bekommt weiter Glocken-Kopien: Trigger trg_benachrichtigung_an_vertretung vorhanden',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_trigger
               WHERE tgname = 'trg_benachrichtigung_an_vertretung'
                 AND tgrelid = 'public.benachrichtigungen'::regclass
            )
            THEN 'ja' ELSE 'fehlt (Trigger wurde entfernt, Vertretung bekommt keine Kopien)' END

-- ───────────────────────────────────────
-- Teil 41: Terminseite, Gespraechsarten und Eintragungen mit echten Umlauten
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ───────────────────────────────────────

-- Rechte und Hinweistexte prueft seit 20260929130000 Teil 49: Besucher duerfen
-- dann nicht mehr, und die Texte lauten "Ueber die Terminseite eingetragen".
UNION ALL
SELECT '41.1 Terminseite: partnertermin_zugang liefert die Gespraechsarten mit Umlauten',
       CASE WHEN to_regprocedure('public.partnertermin_zugang(text)') IS NOT NULL
             AND strpos(pg_get_functiondef(to_regprocedure('public.partnertermin_zugang(text)')), 'Erstgespräch') > 0
             AND strpos(pg_get_functiondef(to_regprocedure('public.partnertermin_zugang(text)')), 'Erstgespraech''') = 0
            THEN 'ja' ELSE 'fehlt (20260929110000 ausfuehren)' END

UNION ALL
SELECT '41.2 Terminseite: partnertermin_bestaetigen traegt Buchung, Aktivitaet und Aufgabe mit Umlauten ein',
       CASE WHEN to_regprocedure('public.partnertermin_bestaetigen(text,text,text,text,uuid)') IS NOT NULL
             AND strpos(pg_get_functiondef(to_regprocedure('public.partnertermin_bestaetigen(text,text,text,text,uuid)')), 'Beratungsgespräch') > 0
             AND strpos(pg_get_functiondef(to_regprocedure('public.partnertermin_bestaetigen(text,text,text,text,uuid)')), 'Erstgespraech''') = 0
            THEN 'ja' ELSE 'fehlt (20260929110000 ausfuehren)' END

-- ───────────────────────────────────────
-- Teil 42: Zoom-Tabellen entfernt (Weekly Call bleibt, liest nichts aus der Datenbank)
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ───────────────────────────────────────

UNION ALL
SELECT '42.1 Zoom: Tabelle zoom_connections und ihre Triggerfunktion sind weg',
       CASE WHEN to_regclass('public.zoom_connections') IS NULL
             AND to_regprocedure('public.set_zoom_connections_updated_at()') IS NULL
            THEN 'ja' ELSE 'fehlt (20260929141000 ausfuehren)' END

UNION ALL
SELECT '42.2 Zoom: Spalte profiles.zoom_link ist weg, aktivitaeten.zoom_link (Videoraum-Link) bleibt',
       CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
                              WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'zoom_link')
             AND EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'aktivitaeten' AND column_name = 'zoom_link')
            THEN 'ja' ELSE 'fehlt (20260929141000 ausfuehren)' END

UNION ALL
SELECT '42.3 Zoom: kein Zeitplan ruft mehr eine Zoom-Function auf',
       CASE WHEN NOT EXISTS (SELECT 1 FROM cron.job WHERE command ILIKE '%zoom%')
            THEN 'ja' ELSE 'fehlt (Zeitplan mit cron.unschedule entfernen, siehe Bericht)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 46: Provisionssatz erst ab Reservierung, neu beim Partnerwechsel
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '46.1 Provisionssatz: Ermittlung als eigene Funktion, nur fuer den Server',
       CASE WHEN to_regprocedure('public.provisionssatz_ermitteln(uuid)') IS NOT NULL
             AND NOT has_function_privilege('authenticated', to_regprocedure('public.provisionssatz_ermitteln(uuid)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.provisionssatz_ermitteln(uuid)'), 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20260929140000 ausfuehren)' END

UNION ALL
SELECT '46.2 Provisionssatz: Trigger auf investments feuert bei INSERT und UPDATE OF meta, schreibt erst ab Kaufphase',
       CASE WHEN to_regprocedure('public.pipelinestufe_ist_kaufphase(text)') IS NOT NULL
             AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_investments_provisionssatz_festschreiben'
                          AND tgrelid = 'public.investments'::regclass
                          AND pg_get_triggerdef(oid) LIKE '%BEFORE INSERT OR UPDATE OF meta%')
             AND pg_get_functiondef(to_regprocedure('public.investments_provisionssatz_festschreiben()')) LIKE '%_nur_bei_anderem_partner%'
            THEN 'ja' ELSE 'fehlt (20260929140000 ausfuehren)' END

UNION ALL
SELECT '46.3 Provisionssatz: Schutz gegen Ueberschreiben aus dem Browser, auch bei meta ohne Objekt',
       CASE WHEN pg_get_functiondef(to_regprocedure('public.investments_provisionssatz_festschreiben()')) LIKE '%WHERE e.key = ANY(_schluessel)%'
             AND pg_get_functiondef(to_regprocedure('public.investments_provisionssatz_festschreiben()')) LIKE '%IF NEW.meta IS NULL OR jsonb_typeof(NEW.meta) <> ''object'' THEN%'
            THEN 'ja' ELSE 'fehlt (20260929140000 ausfuehren)' END

UNION ALL
SELECT '46.4 Provisionssatz: Partnerwechsel am Kontakt schreibt neu fest',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_kontakte_provisionssatz_partnerwechsel'
                          AND tgrelid = 'public.kontakte'::regclass AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20260929140000 ausfuehren)' END

UNION ALL
SELECT '46.5 Provisionssaetze fremder Partner nicht mehr fuer Angemeldete abfragbar',
       CASE WHEN NOT has_function_privilege('authenticated', to_regprocedure('public.provisionssatz_fuer_partner(uuid,boolean)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.provisionssatz_fuer_partner(uuid,boolean)'), 'EXECUTE')
             AND NOT has_function_privilege('authenticated', to_regprocedure('public.investment_partner_id(uuid)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.investment_partner_id(uuid)'), 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20260929140000 ausfuehren)' END

UNION ALL
SELECT '46.6 Kaufphase: festgeschriebener Satz gehoert zum aktuell zustaendigen Partner',
       (SELECT CASE WHEN count(*) = 0 THEN 'ja' ELSE 'abweichend: ' || count(*) || ' (Partnerwechsel pruefen)' END
          FROM public.investments i
         WHERE jsonb_typeof(i.meta) = 'object'
           AND coalesce(i.meta ->> 'pipelineStufe', '') IN ('reservierung', 'bonitaetsunterlagen', 'finanzierung', 'notar', 'faelligkeit', 'abrechnung', 'abgeschlossen')
           AND i.meta ? 'lockedProvisionRatePartner'
           AND (i.meta ->> 'lockedProvisionRatePartner') IS DISTINCT FROM public.investment_partner_id(i.kunde_id)::text)

UNION ALL
SELECT '46.7 Provisionseinstellungen in user_settings aendern nur Admin und Inhaber',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_settings_provision_schuetzen'
                          AND tgrelid = 'public.user_settings'::regclass AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20260929140000 ausfuehren)' END

UNION ALL
SELECT '46.8 Die fuenf Provisionsfunktionen gehoeren dem Tabellenbesitzer (sonst greift RLS in den Triggern)',
       CASE WHEN (SELECT count(*) FROM pg_proc p
                   WHERE p.pronamespace = 'public'::regnamespace
                     AND p.proname IN ('provisionssatz_ermitteln', 'pipelinestufe_ist_kaufphase',
                                       'investments_provisionssatz_festschreiben',
                                       'kontakte_provisionssatz_partnerwechsel', 'user_settings_provision_schuetzen')
                     AND p.proowner = (SELECT relowner FROM pg_class WHERE oid = 'public.investments'::regclass)) = 5
            THEN 'ja' ELSE 'fehlt oder fremder Besitzer (20260929140000 als Tabellenbesitzer ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 47: Datenkorrektur Provisionssaetze im Bestand (nach Teil 46)
-- Laeuft auch vor der Migration und meldet dann "offen".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '47.1 Kein alter Provisionssatz mehr vor der Kaufphase (Satz ohne Anlass, ohne Fehlervermerk)',
       (SELECT CASE WHEN count(*) = 0 THEN 'ja' ELSE 'offen: ' || count(*) || ' (20260929150000 ausfuehren)' END
          FROM public.investments i
         WHERE jsonb_typeof(i.meta) = 'object'
           AND i.meta ? 'lockedProvisionRate'
           AND NOT i.meta ? 'lockedProvisionRateAnlass'
           AND NOT i.meta ? 'lockedProvisionRateFehler'
           AND coalesce(i.meta ->> 'pipelineStufe', '') NOT IN ('reservierung', 'bonitaetsunterlagen', 'finanzierung', 'notar', 'faelligkeit', 'abrechnung', 'abgeschlossen')
           AND coalesce(i.meta ->> 'pipelineStufe', '') NOT IN ('verloren', 'archiviert', 'bestandsimport'))

UNION ALL
SELECT '47.2 Jeder Vorgang ab Reservierung hat einen gueltigen Satz (mit Anlass) oder einen Fehlervermerk',
       (SELECT CASE WHEN count(*) = 0 THEN 'ja' ELSE 'offen: ' || count(*) || ' (20260929150000 ausfuehren; bleibt es danach, fehlt dort ein Partner)' END
          FROM public.investments i
         WHERE jsonb_typeof(i.meta) = 'object'
           AND coalesce(i.meta ->> 'pipelineStufe', '') IN ('reservierung', 'bonitaetsunterlagen', 'finanzierung', 'notar', 'faelligkeit', 'abrechnung', 'abgeschlossen')
           AND NOT i.meta ? 'lockedProvisionRateAnlass'
           AND NOT i.meta ? 'lockedProvisionRateFehler')

-- ───────────────────────────────────────
-- Teil 48: Unterschriftsanfragen nur serverseitig, Token nur auf dem Server
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ───────────────────────────────────────

UNION ALL
SELECT '48.1 signature_requests: keine erlaubende Schreibregel (INSERT, UPDATE, ALL) fuer angemeldete Nutzer',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'signature_requests'
                 AND permissive = 'PERMISSIVE'
                 AND cmd IN ('INSERT', 'UPDATE', 'ALL')
                 AND roles && ARRAY['authenticated', 'anon', 'public']::name[]
            )
            THEN 'ja' ELSE 'fehlt (20260929200000 ausfuehren)' END

UNION ALL
SELECT '48.2 signature_requests: genau zwei erlaubende Leseregeln, Mitarbeiter nur eigene Kunden, Kunden eigene',
       CASE WHEN (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = 'signature_requests'
                     AND permissive = 'PERMISSIVE' AND cmd = 'SELECT')
                 = ARRAY['Interne sehen Signaturanfragen eigener Kunden', 'Kunden sehen eigene Signaturanfragen']
             AND EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'signature_requests'
                            AND policyname = 'Interne sehen Signaturanfragen eigener Kunden'
                            AND qual LIKE '%ist_eigener_kontakt%' AND qual LIKE '%darf_bewerberbereich%')
            THEN 'ja' ELSE 'fehlt oder weitere Leseregel vorhanden (20260929200000 ausfuehren, Abweichung mit pg_policies ansehen)' END

UNION ALL
SELECT '48.3 aftersales_signatur_anlegen vorhanden, SECURITY DEFINER, nur fuer Angemeldete',
       CASE WHEN to_regprocedure('public.aftersales_signatur_anlegen(uuid,jsonb,text)') IS NOT NULL
             AND (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.aftersales_signatur_anlegen(uuid,jsonb,text)'))
             AND has_function_privilege('authenticated', to_regprocedure('public.aftersales_signatur_anlegen(uuid,jsonb,text)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.aftersales_signatur_anlegen(uuid,jsonb,text)'), 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20260929200000 ausfuehren)' END

UNION ALL
SELECT '48.4 signature_requests: Token fuer Angemeldete nicht lesbar, kein Schreibrecht, anon ohne Rechte',
       CASE WHEN NOT has_column_privilege('authenticated', 'public.signature_requests', 'token', 'SELECT')
             AND has_column_privilege('authenticated', 'public.signature_requests', 'status', 'SELECT')
             AND NOT has_table_privilege('authenticated', 'public.signature_requests', 'INSERT')
             AND NOT has_table_privilege('authenticated', 'public.signature_requests', 'UPDATE')
             AND NOT has_table_privilege('authenticated', 'public.signature_requests', 'TRUNCATE')
             AND NOT has_table_privilege('anon', 'public.signature_requests', 'SELECT')
             AND NOT has_column_privilege('anon', 'public.signature_requests', 'token', 'SELECT')
            THEN 'ja' ELSE 'fehlt (20260929200000 ausfuehren)' END

UNION ALL
SELECT '48.5 signature_requests: Loeschen nur Admin, Partnervertraege nur Bewerberbereich (unveraendert)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_requests'
                          AND policyname = 'Admins loeschen Signatur-Requests' AND cmd = 'DELETE')
             AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signature_requests'
                          AND policyname = 'Partnervertraege nur Bewerberbereich' AND permissive = 'RESTRICTIVE')
            THEN 'ja' ELSE 'fehlt (eine der bestehenden Regeln wurde entfernt)' END

UNION ALL
SELECT '48.6 signature_requests: jede Spalte ausser token fuer Angemeldete lesbar (Spaltenrechte vollstaendig)',
       COALESCE((
         SELECT 'fehlt Leserecht fuer: ' || string_agg(c.column_name::text, ', ' ORDER BY c.ordinal_position)
                || ' (in GRANT SELECT (...) der Migration ergaenzen)'
           FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = 'signature_requests'
            AND c.column_name <> 'token'
            AND NOT has_column_privilege('authenticated', 'public.signature_requests', c.column_name::text, 'SELECT')
       ), 'ja')

-- ───────────────────────────────────────
-- Teil 49: Terminseite nur fuer den Partner, dem der Link gehoert
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ───────────────────────────────────────

UNION ALL
SELECT '49.1 Terminseite: partnertermin_zugang nur fuer den angemeldeten Besitzer, Besucher duerfen nicht aufrufen',
       CASE WHEN to_regprocedure('public.partnertermin_zugang(text)') IS NOT NULL
             AND NOT has_function_privilege('anon', to_regprocedure('public.partnertermin_zugang(text)'), 'EXECUTE')
             AND has_function_privilege('authenticated', to_regprocedure('public.partnertermin_zugang(text)'), 'EXECUTE')
             AND strpos(pg_get_functiondef(to_regprocedure('public.partnertermin_zugang(text)')), 'auth.uid() IS DISTINCT FROM _l.mitarbeiter_id') > 0
            THEN 'ja' ELSE 'fehlt (20260929130000 ausfuehren)' END

UNION ALL
SELECT '49.2 Terminseite: partnertermin_bestaetigen nur fuer den angemeldeten Besitzer, Besucher duerfen nicht aufrufen',
       CASE WHEN to_regprocedure('public.partnertermin_bestaetigen(text,text,text,text,uuid)') IS NOT NULL
             AND NOT has_function_privilege('anon', to_regprocedure('public.partnertermin_bestaetigen(text,text,text,text,uuid)'), 'EXECUTE')
             AND has_function_privilege('authenticated', to_regprocedure('public.partnertermin_bestaetigen(text,text,text,text,uuid)'), 'EXECUTE')
             AND strpos(pg_get_functiondef(to_regprocedure('public.partnertermin_bestaetigen(text,text,text,text,uuid)')), 'auth.uid() IS DISTINCT FROM _l.mitarbeiter_id') > 0
            THEN 'ja' ELSE 'fehlt (20260929130000 ausfuehren)' END

UNION ALL
SELECT '49.3 Terminseite: gewaehltes Investment rueckt vor, Texte "Ueber die Terminseite eingetragen", Sperre je Link',
       CASE WHEN to_regprocedure('public.partnertermin_bestaetigen(text,text,text,text,uuid)') IS NOT NULL
             AND strpos(pg_get_functiondef(to_regprocedure('public.partnertermin_bestaetigen(text,text,text,text,uuid)')), 'WHERE i.id = _investment') > 0
             AND strpos(pg_get_functiondef(to_regprocedure('public.partnertermin_bestaetigen(text,text,text,text,uuid)')), 'Über die Terminseite eingetragen.') > 0
             AND strpos(pg_get_functiondef(to_regprocedure('public.partnertermin_bestaetigen(text,text,text,text,uuid)')), 'pg_advisory_xact_lock') > 0
            THEN 'ja' ELSE 'fehlt (20260929130000 ausfuehren)' END

-- ───────────────────────────────────────
-- Teil 50: Absicherung Stufe 0 (Rechte zurueckgeschnitten, nichts sichtbar)
-- Laeuft auch vor der Migration und meldet dann "fehlt" oder "offen".
-- ───────────────────────────────────────

UNION ALL
SELECT '50.1 objekte_sicherung_20260922: Zeilensicherheit an, anon und authenticated ohne jedes Recht',
       CASE WHEN to_regclass('public.objekte_sicherung_20260922') IS NULL THEN 'ja (Tabelle gibt es nicht mehr)'
            WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.objekte_sicherung_20260922'))
             AND NOT has_table_privilege('anon', 'public.objekte_sicherung_20260922', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
             AND NOT has_table_privilege('authenticated', 'public.objekte_sicherung_20260922', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            THEN 'ja' ELSE 'fehlt (20260930100000 ausfuehren)' END

UNION ALL
SELECT '50.2 Hintergrund-, Cron- und Serverfunktionen: fuer anon und authenticated nicht aufrufbar',
       COALESCE((
         SELECT 'offen: ' || string_agg(f, ', ') || ' (20260930100000 ausfuehren)'
           FROM unnest(ARRAY[
             'public.bewerber_formular_aufraeumen()', 'public.cleanup_activation_tokens()',
             'public.cleanup_ai_rate_limits()', 'public.cleanup_email_send_log()',
             'public.cleanup_expired_tokens()', 'public.purge_old_activity_log()',
             'public.purge_old_webhook_audit_logs()', 'public.rotate_audit_log()',
             'public.videoraeume_aufraeumen()', 'public.kennzahlen_tagesstand_lauf()',
             'public.kennzahlen_tagesstand_zusatz()', 'public.kennzahlen_gespraeche_woche()',
             'public.kennzahl_schreiben(date,text,text,numeric)', 'public.nachtpruefung_bericht()',
             'public.nachtpruefung_haengende_raeume(timestamp with time zone)',
             'public.nachtpruefung_kontakt_ohne_zustaendigen(timestamp with time zone)',
             'public.nachtpruefung_raeume_nach_termin(timestamp with time zone)',
             'public.nachtpruefung_reservierung_ohne_bonitaet(timestamp with time zone)',
             'public.email_queue_dispatch()', 'public.meeting_mail_claim()',
             'public.meeting_mail_fertig(uuid,uuid,boolean,text)',
             'public.buchung_pipeline_vorwaerts(uuid,text)', 'public.buchung_investment_vorwaerts(uuid,text)',
             'public.buchung_termin_belegt(uuid,timestamp with time zone,timestamp with time zone,text,uuid)',
             'public.buchung_zugang_aufloesen(text)', 'public.bewerber_stufe_closing(uuid)',
             'public.bewerber_termin_gastgeber()', 'public.bewerber_kennenlern_kalender()',
             'public.meeting_alte_kommunikation(public.aktivitaeten)', 'public.team_zuordnung()',
             'public.aufsicht_ueber(uuid)', 'public.zustaendigkeitsbereich(uuid)',
             'public.activity_log_actor_snapshot(uuid)', 'public.increment_ai_rate_limit(text,integer)',
             'public.detect_audit_anomalies()', 'public.run_security_self_check()'
           ]) AS f
          WHERE to_regprocedure(f) IS NOT NULL
            AND (has_function_privilege('anon', to_regprocedure(f), 'EXECUTE')
                 OR has_function_privilege('authenticated', to_regprocedure(f), 'EXECUTE'))
       ), 'ja')

UNION ALL
SELECT '50.3 Serverfunktionen: service_role darf sie weiter aufrufen (Cron und Edge Functions)',
       CASE WHEN has_function_privilege('service_role', 'public.meeting_mail_claim()', 'EXECUTE')
             AND has_function_privilege('service_role', 'public.increment_ai_rate_limit(text,integer)', 'EXECUTE')
             AND has_function_privilege('service_role', 'public.run_security_self_check()', 'EXECUTE')
             AND has_function_privilege('service_role', 'public.aufsicht_ueber(uuid)', 'EXECUTE')
             AND has_function_privilege('service_role', 'public.zustaendigkeitsbereich(uuid)', 'EXECUTE')
            THEN 'ja' ELSE 'FEHLT: Edge Functions scheitern (GRANT ... TO service_role aus 20260930100000 ausfuehren)' END

UNION ALL
SELECT '50.4 Browser- und oeffentliche Funktionen unveraendert aufrufbar (Stichprobe)',
       CASE WHEN has_function_privilege('anon', 'public.buchung_anlegen(text,uuid,timestamp with time zone,text,text,text,text,jsonb)', 'EXECUTE')
             AND has_function_privilege('anon', 'public.handbuch_abrufen(text)', 'EXECUTE')
             AND has_function_privilege('anon', 'public.get_signature_request(text)', 'EXECUTE')
             AND has_function_privilege('anon', 'public.buchung_zugang(text)', 'EXECUTE')
             AND has_function_privilege('authenticated', 'public.meeting_mail_erneut(uuid)', 'EXECUTE')
             AND has_function_privilege('authenticated', 'public.kennzahlen_verlauf(text)', 'EXECUTE')
             AND has_function_privilege('authenticated', 'public.team_mitglieder(uuid)', 'EXECUTE')
             AND has_function_privilege('authenticated', 'public.weekly_call_woche(timestamp with time zone)', 'EXECUTE')
            THEN 'ja' ELSE 'FEHLT: eine gebrauchte Funktion ist nicht mehr aufrufbar (sofort melden)' END

UNION ALL
SELECT '50.5 anon: kein INSERT, UPDATE, DELETE, TRUNCATE auf Tabellen und Views in public',
       COALESCE((
         SELECT 'offen: ' || string_agg(c.relname::text, ', ' ORDER BY c.relname) || ' (20260930100000 erneut ausfuehren, sie ist wiederholbar)'
           FROM pg_class c
          WHERE c.relnamespace = 'public'::regnamespace
            AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE')
       ), 'ja')

UNION ALL
SELECT '50.6 authenticated: kein TRUNCATE auf Tabellen und Views in public',
       COALESCE((
         SELECT 'offen: ' || string_agg(c.relname::text, ', ' ORDER BY c.relname) || ' (20260930100000 erneut ausfuehren, sie ist wiederholbar)'
           FROM pg_class c
          WHERE c.relnamespace = 'public'::regnamespace
            AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND has_table_privilege('authenticated', c.oid, 'TRUNCATE')
       ), 'ja')

UNION ALL
SELECT '50.7 authenticated: Schreiben ueber die Zeilenregeln geht weiter (Stichprobe)',
       CASE WHEN has_table_privilege('authenticated', 'public.kontakte', 'INSERT')
             AND has_table_privilege('authenticated', 'public.kontakte', 'UPDATE')
             AND has_table_privilege('authenticated', 'public.aufgaben', 'INSERT')
             AND has_table_privilege('authenticated', 'public.benachrichtigungen', 'DELETE')
            THEN 'ja' ELSE 'FEHLT: angemeldete Nutzer koennen nicht mehr schreiben (sofort melden)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 51: Absicherung Geld und Vertraege (20260930110000)
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '51.1 investments: Waechter fuer Unterschrift, Abwicklung, Notartermin (INVOKER, vor dem Finanzierungswaechter)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_absicherung_investments'
                          AND tgrelid = 'public.investments'::regclass
                          AND pg_get_triggerdef(oid) LIKE '%BEFORE INSERT OR UPDATE OF meta%')
             AND NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.investments_absicherung()'))
             AND pg_get_functiondef(to_regprocedure('public.investment_geschuetzte_schluessel()')) LIKE '%''rvSigned''%'
            THEN 'ja' ELSE 'fehlt (20260930110000 ausfuehren)' END

UNION ALL
SELECT '51.2 merge_investment_meta: Nicht-Admins setzen geschuetzte Schluessel nur zurueck',
       CASE WHEN pg_get_functiondef(to_regprocedure('public.merge_investment_meta(uuid,jsonb)')) LIKE '%investment_wert_leer%'
            THEN 'ja' ELSE 'fehlt (20260930110000 ausfuehren)' END

UNION ALL
SELECT '51.3 Drei gepruefte Wege vorhanden, SECURITY DEFINER, fuer Angemeldete, nicht fuer anon',
       CASE WHEN (SELECT count(*) FROM pg_proc p
                   WHERE p.oid IN (to_regprocedure('public.investment_sa_pdf_vermerken(uuid,text,text)'),
                                   to_regprocedure('public.investment_abwicklung_speichern(uuid,jsonb)'),
                                   to_regprocedure('public.investment_loeschen(uuid)'))
                     AND p.prosecdef
                     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
                     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')) = 3
            THEN 'ja' ELSE 'fehlt (20260930110000 ausfuehren)' END

UNION ALL
SELECT '51.4 investments: direkt loeschen nur Admin und Inhaber',
       CASE WHEN (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = 'investments'
                     AND permissive = 'PERMISSIVE' AND cmd IN ('DELETE', 'ALL'))
                 = ARRAY['Admin und Inhaber loeschen Investments']
            THEN 'ja' ELSE 'fehlt oder weitere Loeschregel vorhanden (20260930110000 ausfuehren)' END

UNION ALL
SELECT '51.5 kontakte: setter, erstelltVonName, kontaktTyp, berater nur Admin, Inhaber, Server',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_kontakt_zuordnung_namen'
                          AND tgrelid = 'public.kontakte'::regclass AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20260930110000 ausfuehren)' END

UNION ALL
SELECT '51.6 kontakte: endgueltig loeschen nur Admin, Inhaber, Vertriebsleitung',
       CASE WHEN (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = 'kontakte'
                     AND permissive = 'PERMISSIVE' AND cmd IN ('DELETE', 'ALL'))
                 = ARRAY['Endgueltig loeschen Admin Inhaber Vertriebsleitung']
            THEN 'ja' ELSE 'fehlt oder weitere Loeschregel vorhanden (20260930110000 ausfuehren)' END

UNION ALL
SELECT '51.7 tippgeber: aendern nur Admin und Inhaber, anlegen nur fuer sich selbst',
       CASE WHEN (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = 'tippgeber'
                     AND permissive = 'PERMISSIVE' AND cmd IN ('UPDATE', 'INSERT', 'ALL'))
                 = ARRAY['Admin und Inhaber bearbeiten Tippgeber', 'Interne erstellen eigene Tippgeber']
            THEN 'ja' ELSE 'fehlt oder weitere Schreibregel vorhanden (20260930110000 ausfuehren)' END

UNION ALL
SELECT '51.8 empfehlungen: Praemie nur Admin und Inhaber, Partner legen nur fuer eigene Kunden an',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_absicherung_empfehlungen'
                          AND tgrelid = 'public.empfehlungen'::regclass AND NOT tgisinternal)
             AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'empfehlungen'
                          AND policyname = 'Interne erstellen Empfehlungen im eigenen Bereich')
             AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'empfehlungen'
                              AND policyname = 'Interne erstellen Empfehlungen')
            THEN 'ja' ELSE 'fehlt (20260930110000 ausfuehren)' END

UNION ALL
SELECT '51.9 Die Funktionen gehoeren dem Tabellenbesitzer (sonst greift RLS in den Pruefungen)',
       CASE WHEN (SELECT count(*) FROM pg_proc p
                   WHERE p.pronamespace = 'public'::regnamespace
                     AND p.proname IN ('investment_sa_pdf_vermerken', 'investment_abwicklung_speichern',
                                       'investment_loeschen', 'merge_investment_meta',
                                       'kontakt_zuordnung_namen_schuetzen', 'empfehlungen_praemie_schuetzen')
                     AND p.proowner = (SELECT relowner FROM pg_class WHERE oid = 'public.investments'::regclass)) = 6
            THEN 'ja' ELSE 'fehlt oder fremder Besitzer (20260930110000 als Tabellenbesitzer ausfuehren)' END

UNION ALL
SELECT '51.10 confirm_notar_termin: nur der Kunde, nur ein freigegebener Vorschlag',
       CASE WHEN pg_get_functiondef(to_regprocedure('public.confirm_notar_termin(uuid,text,text)')) LIKE '%notarTerminVorschlaegeFreigegeben%'
            THEN 'ja' ELSE 'fehlt (20260930110000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Absicherung Objekte, Speicher, Chats, Hausverwaltung (20260930120000)
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '52.1 Hilfsfunktionen darf_objekt_schreiben, darf_wohnung_schreiben, darf_hausverwaltung_schreiben, darf_unterlage_aendern, darf_objekt_medien_schreiben',
       CASE WHEN to_regprocedure('public.darf_objekt_schreiben(uuid,uuid)') IS NOT NULL
             AND to_regprocedure('public.darf_wohnung_schreiben(uuid,uuid)') IS NOT NULL
             AND to_regprocedure('public.darf_hausverwaltung_schreiben(uuid)') IS NOT NULL
             AND to_regprocedure('public.unterlagen_pfad_kontakt(text)') IS NOT NULL
             AND to_regprocedure('public.darf_unterlage_aendern(uuid,text)') IS NOT NULL
             AND to_regprocedure('public.darf_objekt_medien_schreiben(uuid,text)') IS NOT NULL
            THEN 'ja' ELSE 'fehlt (20260930120000 ausfuehren)' END

UNION ALL
SELECT '52.2 Objektbereich: keine Schreibregel mehr fuer alle internen Rollen oder jeden Objektpartner',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_policies
               WHERE schemaname = 'public'
                 AND tablename IN ('objekte', 'wohnungen', 'objekt_bilder', 'wohnungs_bilder',
                                   'wohnungs_dokumente', 'objekt_dokumente', 'objekt_einreichungen')
                 AND permissive = 'PERMISSIVE'
                 AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                 AND (coalesce(qual, '') || coalesce(with_check, '')) ~ '(is_internal_role|is_objekt_manager)')
             AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'wohnungen'
                          AND policyname = 'Wohnungen aendern Admin oder eigener Objektpartner')
            THEN 'ja' ELSE 'fehlt (20260930120000 ausfuehren, Abweichung mit pg_policies ansehen)' END

UNION ALL
SELECT '52.3 Ausloeser objekt_ersteller_festhalten an objekte',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgrelid = 'public.objekte'::regclass
                            AND tgname = 'objekt_ersteller_festhalten' AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20260930120000 ausfuehren)' END

UNION ALL
SELECT '52.4 einheit_reservierung_aufheben und einheit_belegung_abgleichen: SECURITY DEFINER, nur Angemeldete, Abgleich mit Unterschriftsprüfung',
       CASE WHEN to_regprocedure('public.einheit_reservierung_aufheben(uuid)') IS NOT NULL
             AND to_regprocedure('public.einheit_belegung_abgleichen(uuid)') IS NOT NULL
             AND (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.einheit_reservierung_aufheben(uuid)'))
             AND (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.einheit_belegung_abgleichen(uuid)'))
             AND has_function_privilege('authenticated', to_regprocedure('public.einheit_reservierung_aufheben(uuid)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.einheit_reservierung_aufheben(uuid)'), 'EXECUTE')
             AND has_function_privilege('authenticated', to_regprocedure('public.einheit_belegung_abgleichen(uuid)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.einheit_belegung_abgleichen(uuid)'), 'EXECUTE')
             AND strpos(pg_get_functiondef(to_regprocedure('public.einheit_belegung_abgleichen(uuid)')), 'v_status = ''frei'' AND NOT v_admin AND NOT v_rv_unterschrieben') > 0
             AND strpos(pg_get_functiondef(to_regprocedure('public.einheit_belegung_abgleichen(uuid)')), 'IF NOT v_admin AND NOT v_rv_unterschrieben THEN') > 0
             AND strpos(pg_get_functiondef(to_regprocedure('public.einheit_belegung_abgleichen(uuid)')), '''backoffice''::public.app_role') > 0
            THEN 'ja' ELSE 'fehlt (20260930120000 ausfuehren)' END

UNION ALL
SELECT '52.5 unterlagen: Ueberschreiben und Loeschen nicht mehr fuer alle internen Rollen',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_policies
               WHERE schemaname = 'storage' AND tablename = 'objects'
                 AND permissive = 'PERMISSIVE'
                 AND cmd IN ('UPDATE', 'DELETE', 'ALL')
                 AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%''unterlagen''::text%'
                 AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%is_internal_role%')
             AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                          AND policyname = 'Unterlagen ueberschreiben nur zustaendig' AND cmd = 'UPDATE')
             AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                          AND policyname = 'Unterlagen loeschen nur zustaendig' AND cmd = 'DELETE')
            THEN 'ja' ELSE 'fehlt (20260930120000 ausfuehren, Abweichung mit pg_policies ansehen)' END

UNION ALL
SELECT '52.6 unterlagen: Hochladen unveraendert (Intern, Kunde, Chat, Mobile-Scan)',
       CASE WHEN (SELECT count(*) FROM pg_policies
                   WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'INSERT'
                     AND policyname IN ('Internal upload unterlagen', 'Kunde upload unterlagen',
                                        'Chat participants upload unterlagen', 'Mobile scan upload via token')) = 4
            THEN 'ja' ELSE 'fehlt (eine der bestehenden Upload-Regeln wurde entfernt)' END

UNION ALL
SELECT '52.7 praesentation-pdfs: Schreiben nur Admin und Inhaber (wie 20260918170000)',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_policies
               WHERE schemaname = 'storage' AND tablename = 'objects'
                 AND permissive = 'PERMISSIVE'
                 AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                 AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%praesentation-pdfs%'
                 AND (coalesce(qual, '') || coalesce(with_check, '')) NOT LIKE '%is_admin_role%')
             AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                          AND policyname = 'Praesentation-PDFs pflege insert')
            THEN 'ja' ELSE 'fehlt (20260930120000 ausfuehren)' END

UNION ALL
SELECT '52.8 objekt-medien: Schreiben nur geprueft, Einreichungen unveraendert',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_policies
               WHERE schemaname = 'storage' AND tablename = 'objects'
                 AND permissive = 'PERMISSIVE'
                 AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                 AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%objekt-medien%'
                 AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%is_internal_role%')
             AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname IN ('objekt_medien_geprueft_insert', 'objekt_medien_geprueft_update',
                                      'objekt_medien_geprueft_delete',
                                      'objekt_medien_anon_einreichung_upload', 'objekt_medien_auth_einreichung_upload')) = 5
            THEN 'ja' ELSE 'fehlt (20260930120000 ausfuehren)' END

UNION ALL
SELECT '52.9 ansprechpartner: Schreiben nur Admin und Inhaber',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_policies
               WHERE schemaname = 'storage' AND tablename = 'objects'
                 AND permissive = 'PERMISSIVE'
                 AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                 AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%''ansprechpartner''::text%'
                 AND (coalesce(qual, '') || coalesce(with_check, '')) NOT LIKE '%is_admin_role%')
             AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                          AND policyname = 'Admins upload Ansprechpartner')
            THEN 'ja' ELSE 'fehlt (20260930120000 ausfuehren)' END

UNION ALL
SELECT '52.10 chat_teilnehmer: keine erlaubende Eintragsregel mehr',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'chat_teilnehmer'
                 AND permissive = 'PERMISSIVE'
                 AND cmd IN ('INSERT', 'UPDATE', 'ALL'))
             AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_teilnehmer'
                          AND policyname = 'Teilnehmer beenden eigene Teilnahme' AND cmd = 'DELETE')
            THEN 'ja' ELSE 'fehlt (20260930120000 ausfuehren)' END

UNION ALL
SELECT '52.11 chat_teilnehmer_eintragen: SECURITY DEFINER, nur Angemeldete',
       CASE WHEN to_regprocedure('public.chat_teilnehmer_eintragen(uuid,jsonb)') IS NOT NULL
             AND (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.chat_teilnehmer_eintragen(uuid,jsonb)'))
             AND has_function_privilege('authenticated', to_regprocedure('public.chat_teilnehmer_eintragen(uuid,jsonb)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.chat_teilnehmer_eintragen(uuid,jsonb)'), 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20260930120000 ausfuehren)' END

UNION ALL
SELECT '52.12 Ausloeser chat_nachricht_nur_lesebestaetigung an chat_nachrichten',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgrelid = 'public.chat_nachrichten'::regclass
                            AND tgname = 'chat_nachricht_nur_lesebestaetigung' AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20260930120000 ausfuehren)' END

UNION ALL
SELECT '52.13 Hausverwaltung: Anlegen und Aendern nur Rolle hausverwaltung, Admin, Inhaber',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM pg_policies
               WHERE schemaname = 'public'
                 AND tablename IN ('mieter', 'eigentuemer', 'vermietungen', 'kautionen', 'versicherungen',
                                   'zaehlerstaende', 'betriebskosten', 'hv_tickets', 'dienstleister')
                 AND permissive = 'PERMISSIVE'
                 AND cmd IN ('INSERT', 'UPDATE', 'ALL')
                 AND (coalesce(qual, '') || coalesce(with_check, '')) NOT LIKE '%darf_hausverwaltung_schreiben%')
             AND (SELECT count(*) FROM pg_policies
                   WHERE schemaname = 'public'
                     AND policyname IN ('Hausverwaltung legt an', 'Hausverwaltung aendert')) = 18
            THEN 'ja' ELSE 'fehlt (20260930120000 ausfuehren)' END

UNION ALL
SELECT '52.14 Loeschen unveraendert: Wohnungsbilder, Wohnungsunterlagen, Einreichungen nur Admin',
       CASE WHEN (SELECT count(*) FROM pg_policies
                   WHERE schemaname = 'public' AND cmd = 'DELETE'
                     AND (tablename, policyname) IN (('wohnungs_bilder', 'Admins loeschen WBilder'),
                                                     ('wohnungs_dokumente', 'Admins loeschen WDokumente'),
                                                     ('objekt_einreichungen', 'Admins loeschen Einreichungen'))
                     AND qual LIKE '%is_admin_role%') = 3
            THEN 'ja' ELSE 'fehlt (20260930120000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 56: Stufe abrechnung nur Admin, Inhaber, Backoffice (20261001120000)
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '56.1 Waechter schuetzt auch die Stufe abrechnung',
       CASE WHEN to_regprocedure('public.pipeline_abschluss_schuetzen()') IS NOT NULL
             AND pg_get_functiondef(to_regprocedure('public.pipeline_abschluss_schuetzen()')) LIKE '%NOT IN (''abrechnung'', ''abgeschlossen'')%'
             AND pg_get_functiondef(to_regprocedure('public.pipeline_abschluss_schuetzen()')) LIKE '%''buchhaltung''::public.app_role%'
            THEN 'ja' ELSE 'fehlt (20261001120000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 55: Stufe abgeschlossen nur Admin, Inhaber, Backoffice (20260930150000)
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '55.1 investments: Waechter fuer die Stufe abgeschlossen (vor Finanzierungs- und Provisionswaechter)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_absicherung_pipeline_abschluss'
                          AND tgrelid = 'public.investments'::regclass
                          AND pg_get_triggerdef(oid) LIKE '%BEFORE INSERT OR UPDATE OF meta%')
            THEN 'ja' ELSE 'fehlt (20260930150000 ausfuehren)' END

UNION ALL
SELECT '55.2 kontakte: Waechter fuer die Stufe abgeschlossen',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_absicherung_pipeline_abschluss'
                          AND tgrelid = 'public.kontakte'::regclass
                          AND pg_get_triggerdef(oid) LIKE '%BEFORE INSERT OR UPDATE OF meta%')
            THEN 'ja' ELSE 'fehlt (20260930150000 ausfuehren)' END

UNION ALL
SELECT '55.3 Waechter laesst Backoffice durch, nicht direkt aufrufbar',
       CASE WHEN pg_get_functiondef(to_regprocedure('public.pipeline_abschluss_schuetzen()')) LIKE '%backoffice%'
             AND NOT has_function_privilege('authenticated', 'public.pipeline_abschluss_schuetzen()', 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20260930150000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 53: Leadpakete (20260930130000)
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '53.1 Leadpakete: Tabellen lead_pakete und lead_paket_zuweisungen vorhanden',
       CASE WHEN to_regclass('public.lead_pakete') IS NOT NULL
             AND to_regclass('public.lead_paket_zuweisungen') IS NOT NULL
            THEN 'ja' ELSE 'fehlt (20260930130000 ausfuehren)' END

UNION ALL
SELECT '53.2 Leadpakete: Zeilenschutz (RLS) auf beiden Tabellen an',
       CASE WHEN (SELECT count(*) FROM pg_class
                   WHERE oid IN (to_regclass('public.lead_pakete'), to_regclass('public.lead_paket_zuweisungen'))
                     AND relrowsecurity) = 2
            THEN 'ja' ELSE 'fehlt' END

UNION ALL
SELECT '53.3 Leadpakete: niemand schreibt direkt, anon liest nicht',
       CASE WHEN to_regclass('public.lead_pakete') IS NULL OR to_regclass('public.lead_paket_zuweisungen') IS NULL THEN 'fehlt'
            WHEN has_table_privilege('authenticated', to_regclass('public.lead_pakete'), 'INSERT,UPDATE,DELETE,TRUNCATE')
              OR has_table_privilege('authenticated', to_regclass('public.lead_paket_zuweisungen'), 'INSERT,UPDATE,DELETE,TRUNCATE')
              OR has_table_privilege('anon', to_regclass('public.lead_pakete'), 'SELECT,INSERT,UPDATE,DELETE')
              OR has_table_privilege('anon', to_regclass('public.lead_paket_zuweisungen'), 'SELECT,INSERT,UPDATE,DELETE')
            THEN 'offen: Schreibrecht vorhanden (20260930130000 erneut ausfuehren)'
            WHEN has_table_privilege('authenticated', to_regclass('public.lead_pakete'), 'SELECT')
             AND has_table_privilege('authenticated', to_regclass('public.lead_paket_zuweisungen'), 'SELECT')
            THEN 'ja' ELSE 'fehlt: Leserecht fuer angemeldete Nutzer' END

UNION ALL
SELECT '53.4 Leadpakete: nur Leseregeln, keine Schreibregel',
       CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
                    AND tablename IN ('lead_pakete', 'lead_paket_zuweisungen') AND cmd = 'SELECT') = 2
             AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                    AND tablename IN ('lead_pakete', 'lead_paket_zuweisungen') AND cmd <> 'SELECT')
            THEN 'ja' ELSE 'fehlt' END

UNION ALL
SELECT '53.5 Leadpakete: fuenf Funktionen fuer Angemeldete aufrufbar, keine fuer anon',
       CASE WHEN to_regprocedure('public.lead_paket_anlegen(uuid,integer,numeric,date,date,text)') IS NULL
              OR to_regprocedure('public.lead_paket_aendern(uuid,date,date,boolean,text)') IS NULL
              OR to_regprocedure('public.lead_paket_zuweisung_vermerken(uuid,uuid)') IS NULL
              OR to_regprocedure('public.lead_paket_reklamation(uuid,text)') IS NULL
              OR to_regprocedure('public.lead_paket_aus_bewerbung(uuid)') IS NULL
            THEN 'fehlt'
            WHEN has_function_privilege('authenticated', to_regprocedure('public.lead_paket_anlegen(uuid,integer,numeric,date,date,text)'), 'EXECUTE')
             AND has_function_privilege('authenticated', to_regprocedure('public.lead_paket_aendern(uuid,date,date,boolean,text)'), 'EXECUTE')
             AND has_function_privilege('authenticated', to_regprocedure('public.lead_paket_zuweisung_vermerken(uuid,uuid)'), 'EXECUTE')
             AND has_function_privilege('authenticated', to_regprocedure('public.lead_paket_reklamation(uuid,text)'), 'EXECUTE')
             AND has_function_privilege('authenticated', to_regprocedure('public.lead_paket_aus_bewerbung(uuid)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.lead_paket_anlegen(uuid,integer,numeric,date,date,text)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.lead_paket_aendern(uuid,date,date,boolean,text)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.lead_paket_zuweisung_vermerken(uuid,uuid)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.lead_paket_reklamation(uuid,text)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.lead_paket_aus_bewerbung(uuid)'), 'EXECUTE')
            THEN 'ja' ELSE 'offen: Aufrufrechte stimmen nicht' END

UNION ALL
SELECT '53.6 Leadpakete: interne Hilfsfunktionen fuer Browser gesperrt',
       CASE WHEN to_regprocedure('public.lead_paket_status_nachziehen(uuid)') IS NULL
              OR to_regprocedure('public.lead_paket_datum(text)') IS NULL
              OR to_regprocedure('public.lead_paket_aus_bewerbung_intern(uuid)') IS NULL THEN 'fehlt'
            WHEN has_function_privilege('authenticated', to_regprocedure('public.lead_paket_status_nachziehen(uuid)'), 'EXECUTE')
              OR has_function_privilege('anon', to_regprocedure('public.lead_paket_status_nachziehen(uuid)'), 'EXECUTE')
              OR has_function_privilege('authenticated', to_regprocedure('public.lead_paket_datum(text)'), 'EXECUTE')
              OR has_function_privilege('anon', to_regprocedure('public.lead_paket_datum(text)'), 'EXECUTE')
              OR has_function_privilege('authenticated', to_regprocedure('public.lead_paket_aus_bewerbung_intern(uuid)'), 'EXECUTE')
              OR has_function_privilege('anon', to_regprocedure('public.lead_paket_aus_bewerbung_intern(uuid)'), 'EXECUTE')
            THEN 'offen: Hilfsfunktion aufrufbar' ELSE 'ja' END

UNION ALL
SELECT '53.7 Leadpakete: ein Lead zaehlt paketuebergreifend nur einmal (eindeutiger Teilindex)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                          WHERE schemaname = 'public'
                            AND indexname = 'lead_paket_zuweisungen_einmal_gueltig'
                            AND indexdef ILIKE '%UNIQUE%'
                            AND indexdef ILIKE '%reklamiert_am IS NULL%')
            THEN 'ja' ELSE 'fehlt' END

UNION ALL
SELECT '53.8 Leadpakete: Paket aus der Bewerbung nur Bewerberbereich, nur bei passender E-Mail',
       CASE WHEN to_regprocedure('public.lead_paket_aus_bewerbung(uuid)') IS NULL
              OR to_regprocedure('public.lead_paket_aus_bewerbung_intern(uuid)') IS NULL THEN 'fehlt'
            WHEN pg_get_functiondef(to_regprocedure('public.lead_paket_aus_bewerbung(uuid)')) LIKE '%darf_bewerberbereich(v_uid)%'
             AND pg_get_functiondef(to_regprocedure('public.lead_paket_aus_bewerbung_intern(uuid)')) LIKE '%email_abweichend%'
             AND pg_get_functiondef(to_regprocedure('public.lead_paket_datum(text)')) LIKE '%Europe/Berlin%'
            THEN 'ja' ELSE 'offen: alte Fassung (20260930130000 erneut ausfuehren)' END

UNION ALL
SELECT '53.9 Leadpakete: Glocke an Admin und Inhaber, wenn HR oder Backoffice ein Paket anlegt',
       CASE WHEN to_regprocedure('public.lead_paket_aus_bewerbung(uuid)') IS NULL THEN 'fehlt'
            WHEN pg_get_functiondef(to_regprocedure('public.lead_paket_aus_bewerbung(uuid)')) LIKE '%INSERT INTO public.benachrichtigungen%'
             AND pg_get_functiondef(to_regprocedure('public.lead_paket_aus_bewerbung(uuid)')) LIKE '%ur.user_id <> v_uid%'
            THEN 'ja' ELSE 'offen: alte Fassung ohne Glocke (20260930130000 erneut ausfuehren)' END

-- ───────────────────────────────────────
-- Teil 54: Terminseite, feste Dauer fuer Erstgespraech und Beratungsgespraech
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ───────────────────────────────────────

UNION ALL
SELECT '54.1 Terminseite: partnertermin_zugang zeigt Erstgespraech 20 und Beratung 45 Minuten, ohne eigene Terminart',
       CASE WHEN to_regprocedure('public.partnertermin_zugang(text)') IS NOT NULL
             AND strpos(pg_get_functiondef(to_regprocedure('public.partnertermin_zugang(text)')), 'CASE WHEN a.anlass IN (''erstgespraech'', ''beratung'')') > 0
             AND strpos(pg_get_functiondef(to_regprocedure('public.partnertermin_zugang(text)')), '''Erstgespräch''::text, 20::integer') > 0
             AND strpos(pg_get_functiondef(to_regprocedure('public.partnertermin_zugang(text)')), '''Beratungsgespräch'', 45') > 0
            THEN 'ja' ELSE 'fehlt (20260930140000 ausfuehren)' END

UNION ALL
SELECT '54.2 Terminseite: partnertermin_bestaetigen speichert Erstgespraech 20 und Beratung 45 Minuten, ohne eigene Terminart',
       CASE WHEN to_regprocedure('public.partnertermin_bestaetigen(text,text,text,text,uuid)') IS NOT NULL
             AND strpos(pg_get_functiondef(to_regprocedure('public.partnertermin_bestaetigen(text,text,text,text,uuid)')), 'CASE WHEN _anlass IN (''erstgespraech'', ''beratung'')') > 0
             AND strpos(pg_get_functiondef(to_regprocedure('public.partnertermin_bestaetigen(text,text,text,text,uuid)')), '''Erstgespräch''::text, 20::integer') > 0
             AND strpos(pg_get_functiondef(to_regprocedure('public.partnertermin_bestaetigen(text,text,text,text,uuid)')), '''Beratungsgespräch'', 45') > 0
            THEN 'ja' ELSE 'fehlt (20260930140000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 57: Wochenberichte schicken das Geheimwort mit (20261004110000)
-- Meldet "fehlt", solange einer der Zeitplaene den Kopf nicht traegt. Gibt es
-- gar keinen Zeitplan, meldet die Zeile das ausdruecklich.
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '57.1 Zeitplaene von send-weekly-summary und send-weekly-vp-summary schicken x-internal-secret mit',
       CASE WHEN NOT EXISTS (SELECT 1 FROM cron.job
                              WHERE command LIKE '%/functions/v1/send-weekly-summary%'
                                 OR command LIKE '%/functions/v1/send-weekly-vp-summary%')
            THEN 'offen: kein Zeitplan gefunden'
            WHEN EXISTS (SELECT 1 FROM cron.job
                          WHERE (command LIKE '%/functions/v1/send-weekly-summary%'
                                 OR command LIKE '%/functions/v1/send-weekly-vp-summary%')
                            AND command NOT LIKE '%x-internal-secret%')
            THEN 'fehlt (20261004110000 ausfuehren, vorher Geheimwort im Tresor)' ELSE 'ja' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 58: Registrierung ohne Rollenwahl (20261004120000)
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '58.1 handle_new_user liest raw_app_meta_data, nicht raw_user_meta_data',
       CASE WHEN to_regprocedure('public.handle_new_user()') IS NOT NULL
             AND pg_get_functiondef(to_regprocedure('public.handle_new_user()')) LIKE '%raw_app_meta_data ->> ''role''%'
             AND pg_get_functiondef(to_regprocedure('public.handle_new_user()')) NOT LIKE '%raw_user_meta_data ->> ''role''%'
            THEN 'ja' ELSE 'fehlt (20261004120000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 80: Terminerinnerungen mit Ausweis, Glocken-Sperre eindeutig
-- (20261004190000 und 20261004191000)
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '80.1 Zeitplan von send-termin-erinnerungen schickt x-internal-secret mit',
       CASE WHEN NOT EXISTS (SELECT 1 FROM cron.job
                              WHERE command LIKE '%/functions/v1/send-termin-erinnerungen%')
            THEN 'offen: kein Zeitplan gefunden'
            WHEN EXISTS (SELECT 1 FROM cron.job
                          WHERE command LIKE '%/functions/v1/send-termin-erinnerungen%'
                            AND command NOT LIKE '%x-internal-secret%')
            THEN 'fehlt (20261004190000 ausfuehren, vorher Geheimwort im Tresor)' ELSE 'ja' END
UNION ALL
SELECT '80.2 Eindeutiger Index benachrichtigungen_sperre_eindeutig vorhanden',
       CASE WHEN to_regclass('public.benachrichtigungen_sperre_eindeutig') IS NOT NULL
            THEN 'ja' ELSE 'fehlt (20261004191000 ausfuehren)' END
UNION ALL
SELECT '80.3 Keine doppelten Glocken mit demselben Sperrschluessel',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.benachrichtigungen
                              WHERE meta ? 'sperre'
                              GROUP BY benutzer_id, meta ->> 'sperre'
                             HAVING count(*) > 1)
            THEN 'ja' ELSE 'nein: doppelte Zeilen, der Index kann nicht angelegt werden' END
-- Teil 59: Bilder der Objekteinreichung nur ueber die Function (20261004150000)
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '59.1 Niemand laedt mehr selbst nach objekt-medien/einreichungen hoch (anon und Angemeldete)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'storage' AND tablename = 'objects'
                            AND policyname IN ('objekt_medien_anon_einreichung_upload',
                                               'objekt_medien_auth_einreichung_upload'))
            THEN 'fehlt (20261004150000 ausfuehren, vorher submit-objekt-einreichung ausrollen und Publish)'
            ELSE 'ja' END

UNION ALL
SELECT '59.2 Eimer objekt-medien nimmt hoechstens 30 MB je Datei',
       CASE WHEN EXISTS (SELECT 1 FROM storage.buckets
                          WHERE id = 'objekt-medien' AND file_size_limit = 31457280)
            THEN 'ja' ELSE 'fehlt (20261004150000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 81: Zeitplan fuer die Sicherung, keiner fuer den Papierkorb (20261004195000)
-- 81.1 laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '81.1 Zeitplan sicherung-taeglich: daily-backup um 01:00 UTC mit x-internal-secret',
       CASE WHEN EXISTS (SELECT 1 FROM cron.job
                          WHERE jobname = 'sicherung-taeglich' AND active
                            AND schedule = '0 1 * * *'
                            AND command LIKE '%/functions/v1/daily-backup%'
                            AND command LIKE '%x-internal-secret%')
            THEN 'ja' ELSE 'fehlt (20261004195000 ausfuehren, vorher Geheimwort im Tresor)' END

UNION ALL
SELECT '81.2 Kein Zeitplan startet auto-purge-papierkorb, der Papierkorb bleibt',
       CASE WHEN EXISTS (SELECT 1 FROM cron.job
                          WHERE jobname = 'papierkorb-leeren-taeglich'
                             OR command LIKE '%/functions/v1/auto-purge-papierkorb%')
            THEN 'NEIN: Zeitplan vorhanden (20261004195000 ausfuehren, sie entfernt ihn)' ELSE 'ja' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 59: Absicherung Lesen (20261004130000)
-- Laeuft auch vor der Migration und meldet dann "fehlt".
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '59.1 Unterlagen: Leseregeln nur zustaendig (beide Eimer), keine globale Leseregel, Resolver nicht oeffentlich',
       CASE WHEN to_regprocedure('public.darf_unterlage_lesen(uuid,text)') IS NULL
              OR to_regprocedure('public.unterlagen_lese_kontakt(text)') IS NULL
            THEN 'fehlt (20261004130000 ausfuehren)'
            WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                          AND policyname = 'Unterlagen lesen nur zustaendig' AND cmd = 'SELECT'
                          AND qual LIKE '%bucket_id = ''unterlagen''%'
                          AND qual LIKE '%darf_unterlage_lesen(auth.uid(), name)%')
             AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                          AND policyname = 'SA-PDFs intern lesen nur zustaendig' AND cmd = 'SELECT'
                          AND qual LIKE '%bucket_id = ''selbstauskunft-pdfs''%'
                          AND qual LIKE '%darf_unterlage_lesen(auth.uid(), name)%')
             AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                          AND policyname = 'SA-PDFs: owner read' AND cmd = 'SELECT'
                          AND qual LIKE '%bucket_id = ''selbstauskunft-pdfs''%'
                          AND qual LIKE '%authUserId%'
                          AND qual NOT LIKE '%is_internal_role%')
             AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                              AND policyname IN ('Internal read unterlagen', 'SA-PDFs: internal or owner read'))
             AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                              AND permissive = 'PERMISSIVE' AND cmd IN ('SELECT', 'ALL')
                              AND (coalesce(qual, '') || coalesce(with_check, '')) NOT LIKE '%bucket_id%')
             AND has_function_privilege('authenticated', 'public.darf_unterlage_lesen(uuid,text)', 'EXECUTE')
             AND NOT has_function_privilege('authenticated', 'public.unterlagen_lese_kontakt(text)', 'EXECUTE')
             AND NOT has_function_privilege('anon', 'public.unterlagen_lese_kontakt(text)', 'EXECUTE')
             AND strpos(pg_get_functiondef(to_regprocedure('public.unterlagen_lese_kontakt(text)')), 'docFileUrls') = 0
            THEN 'ja' ELSE 'fehlt (20261004130000 ausfuehren)' END

UNION ALL
SELECT '59.2 Hausverwaltung: acht Tabellen lesen nur Hausverwaltung, Admin, Inhaber',
       CASE WHEN to_regprocedure('public.darf_hausverwaltung_lesen(uuid)') IS NOT NULL
             AND (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND policyname = 'Hausverwaltung liest'
                   AND tablename IN ('mieter', 'eigentuemer', 'vermietungen', 'kautionen', 'versicherungen',
                                     'zaehlerstaende', 'betriebskosten', 'hv_tickets')) = 8
             AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND cmd = 'SELECT'
                              AND permissive = 'PERMISSIVE' AND policyname <> 'Hausverwaltung liest'
                              AND tablename IN ('mieter', 'eigentuemer', 'vermietungen', 'kautionen', 'versicherungen',
                                                'zaehlerstaende', 'betriebskosten', 'hv_tickets'))
            THEN 'ja' ELSE 'fehlt (20261004130000 ausfuehren)' END

UNION ALL
SELECT '59.3 lookup_activation_name nicht mehr fuer anon und authenticated',
       CASE WHEN to_regprocedure('public.lookup_activation_name(text)') IS NULL THEN 'ja (Funktion entfernt)'
            WHEN NOT has_function_privilege('anon', 'public.lookup_activation_name(text)', 'EXECUTE')
             AND NOT has_function_privilege('authenticated', 'public.lookup_activation_name(text)', 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20261004130000 ausfuehren)' END

UNION ALL
SELECT '59.4 Scan-Sitzungen: der taegliche Cleanup loescht mobile_scan_sessions nicht mehr',
       CASE WHEN to_regprocedure('public.cleanup_expired_tokens()') IS NULL THEN 'fehlt (Funktion nicht da)'
            WHEN pg_get_functiondef(to_regprocedure('public.cleanup_expired_tokens()')) ~* 'DELETE\s+FROM\s+public\.mobile_scan_sessions'
            THEN 'fehlt (20261004130000 ausfuehren)' ELSE 'ja' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 82: Kundenportal-Sperre an allen Tabellen, fremde Abfrage zu (20261004152000)
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '82.1 Sperrregel an allen Tabellen, kunde_portal_gesperrt nicht fuer authenticated, Sperre in den Kundenfunktionen',
       CASE WHEN to_regprocedure('public.kunde_portal_gesperrt(uuid)') IS NOT NULL
             AND pg_get_functiondef(to_regprocedure('public.kunde_portal_gesperrt(uuid)')) LIKE '%ur.role::text <> ''kunde''%'
             AND pg_get_functiondef(to_regprocedure('public.merge_kontakt_meta(uuid,jsonb)')) LIKE '%kunde_portal_gesperrt(auth.uid())%'
             AND pg_get_functiondef(to_regprocedure('public.merge_investment_meta(uuid,jsonb)')) LIKE '%kunde_portal_gesperrt(auth.uid())%'
             AND pg_get_functiondef(to_regprocedure('public.darf_investment_nutzen(uuid,uuid,jsonb)')) LIKE '%kunde_portal_gesperrt(_user_id)%'
             AND pg_get_functiondef(to_regprocedure('public.ist_kunde_des_kontakts(uuid,uuid)')) LIKE '%kunde_portal_gesperrt(_user_id)%'
             AND NOT has_function_privilege('authenticated', to_regprocedure('public.kunde_portal_gesperrt(uuid)'), 'EXECUTE')
             AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Kundenportal-Sperre'
                              AND COALESCE(qual, '') NOT LIKE '%kundenportal_gesperrt_fuer_mich()%')
             AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                              WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity
                                AND c.relname NOT IN ('profiles', 'user_roles', 'user_settings')
                                AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public'
                                                 AND p.tablename = c.relname AND p.policyname = 'Kundenportal-Sperre'))
            THEN 'ja' ELSE 'fehlt (20261004152000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 83: Eigentuemer aus dem Investment ueber eine gepruefte Funktion (20261004160000)
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '83.1 Funktion eigentuemer_aus_investment, nicht fuer anon',
       CASE WHEN to_regprocedure('public.eigentuemer_aus_investment(uuid)') IS NOT NULL
             AND has_function_privilege('authenticated', to_regprocedure('public.eigentuemer_aus_investment(uuid)'), 'EXECUTE')
             AND NOT has_function_privilege('anon', to_regprocedure('public.eigentuemer_aus_investment(uuid)'), 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20261004160000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 84: Buchhaltung: Kundenprofil und Pipeline (20261004171000)
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '84.1 role_permissions buchhaltung /kunden und /pipeline',
       CASE WHEN (SELECT count(*) FROM public.role_permissions WHERE role = 'buchhaltung' AND url IN ('/kunden', '/pipeline')) = 2
            THEN 'ja' ELSE 'fehlt (20261004171000 ausfuehren)' END
-- Teil 75: Provisionsbescheide ab Freigabe gesperrt (20261004170000)
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '75.1 Ausloeser sperrt Zahlen freigegebener und ausgezahlter Bescheide',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_provisionsabrechnung_bescheid_sperre'
                            AND tgrelid = 'public.provisionsabrechnungen'::regclass
                            AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20261004170000 ausfuehren)' END

UNION ALL
SELECT '75.2 Ausloeser verhindert, dass ein Investment in zwei Bescheiden abgerechnet wird',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_provisionsabrechnung_keine_doppelung'
                            AND tgrelid = 'public.provisionsabrechnungen'::regclass
                            AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20261004170000 ausfuehren)' END

UNION ALL
SELECT '75.3 Ausloeser verhindert das Loeschen freigegebener und ausgezahlter Bescheide aus dem Browser',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_provisionsabrechnung_loeschen_pruefen'
                            AND tgrelid = 'public.provisionsabrechnungen'::regclass
                            AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20261004170000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 76: Kundenportal fragt das Empfehlungsprogramm an (20261004175000)
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '76.1 Funktion empfehlungsprogramm_anfragen, fuer Angemeldete, nicht fuer anon',
       CASE WHEN to_regprocedure('public.empfehlungsprogramm_anfragen(uuid)') IS NOT NULL
             AND has_function_privilege('authenticated', 'public.empfehlungsprogramm_anfragen(uuid)', 'EXECUTE')
             AND NOT has_function_privilege('anon', 'public.empfehlungsprogramm_anfragen(uuid)', 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20261004175000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 77: Buchung uebernimmt die Sprache der Terminseite (20261004180000)
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '77.1 buchung_anlegen mit _sprache, fuer Besucher aufrufbar',
       CASE WHEN to_regprocedure('public.buchung_anlegen(text,uuid,timestamptz,text,text,text,text,text,jsonb)') IS NOT NULL
             AND has_function_privilege('anon', 'public.buchung_anlegen(text,uuid,timestamptz,text,text,text,text,text,jsonb)', 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20261004180000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 78: Objekt loeschen ueber eine gepruefte Funktion (20261004193000)
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '78.1 Funktion objekt_loeschen, fuer Angemeldete, nicht fuer anon',
       CASE WHEN to_regprocedure('public.objekt_loeschen(uuid)') IS NOT NULL
             AND has_function_privilege('authenticated', 'public.objekt_loeschen(uuid)', 'EXECUTE')
             AND NOT has_function_privilege('anon', 'public.objekt_loeschen(uuid)', 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20261004193000 ausfuehren)' END

UNION ALL
SELECT '78.2 Ausloeser pruefen jedes Loeschen von Objekten und Einheiten aus dem Browser',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_objekt_loeschen_pruefen'
                            AND tgrelid = 'public.objekte'::regclass AND NOT tgisinternal)
             AND EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_einheit_loeschen_pruefen'
                            AND tgrelid = 'public.wohnungen'::regclass AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20261004193000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 85: Wohnungsauswahl am Kundenlink (20261005100000)
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '85.1 Spalte objekt_exposes.wohnung_auswahl mit Pruefregel',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'objekt_exposes' AND column_name = 'wohnung_auswahl')
             AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objekt_exposes_wohnung_auswahl_check')
            THEN 'ja' ELSE 'fehlt (20261005100000 ausfuehren)' END

UNION ALL
SELECT '85.2 Ausloeser: Art und Wohnungsauswahl eines Kundenlinks aendert nur der Server',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_objekt_exposes_kundenlink_nur_server'
                            AND tgrelid = 'public.objekt_exposes'::regclass AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20261005100000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 86: Exposés lesen nur mit Kundenzugriff (20261005110000)
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '86.1 Leseregel objekt_exposes: Ersteller liest nur, solange er den Kunden sehen darf',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'objekt_exposes' AND policyname = 'Exposes lesen'
                            AND qual LIKE '%darf_alle_kunden_sehen%' AND qual LIKE '%is_vp_owner_of_kontakt%')
            THEN 'ja' ELSE 'fehlt (20261005110000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 87: Lotse wertet neue Unterlagen automatisch aus (20261005123000)
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '87.1 Tabelle lotse_auswertung_warteschlange',
       CASE WHEN to_regclass('public.lotse_auswertung_warteschlange') IS NOT NULL
            THEN 'ja' ELSE 'fehlt (20261005123000 ausfuehren)' END

UNION ALL
SELECT '87.2 Ausloeser auf objekt_dokumente und wohnungs_dokumente',
       CASE WHEN (SELECT count(*) FROM pg_trigger
                   WHERE tgname IN ('trg_lotse_auswertung_objekt', 'trg_lotse_auswertung_einheit') AND NOT tgisinternal) = 2
            THEN 'ja' ELSE 'fehlt (20261005123000 ausfuehren)' END

UNION ALL
SELECT '87.3 Zeitplan lotse-unterlagen-auswerten mit Geheimwort',
       CASE WHEN EXISTS (SELECT 1 FROM cron.job
                          WHERE jobname = 'lotse-unterlagen-auswerten' AND command LIKE '%x-internal-secret%')
            THEN 'ja' ELSE 'fehlt (20261005123000 ausfuehren, Geheimwort im Tresor?)' END
-- Teil 89: Reservierungslink nach dem Aufheben ungueltig (20261005130000)
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '89.1 Unterschrift und Abruf lehnen rv-Links vor dem letzten Aufheben ab',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                          WHERE n.nspname = 'public' AND p.proname = 'sign_signature_request'
                            AND pg_get_functiondef(p.oid) LIKE '%rv_anfrage_aufgehoben%')
             AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                          WHERE n.nspname = 'public' AND p.proname = 'get_signature_request'
                            AND pg_get_functiondef(p.oid) LIKE '%rv_anfrage_aufgehoben%')
            THEN 'ja' ELSE 'fehlt (20261005130000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 88: Provisionsfelder aus Investagon nur Admin, Inhaber und Buchhaltung (20261005120000)
-- Alle Zeilen laufen auch vor der Migration: Gezaehlt wird ueber query_to_xml,
-- und nur, wenn es die Tabelle gibt.
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '88.1 Tabelle investagon_intern: Zeilenschutz an, lesen nur Admin, Inhaber und Buchhaltung, kein Schreibrecht im Browser',
       CASE WHEN to_regclass('public.investagon_intern') IS NULL THEN 'fehlt (20261005120000 ausfuehren)'
            WHEN NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.investagon_intern'))
              OR has_table_privilege('anon', to_regclass('public.investagon_intern'), 'SELECT')
              OR has_table_privilege('authenticated', to_regclass('public.investagon_intern'), 'INSERT')
              OR has_table_privilege('authenticated', to_regclass('public.investagon_intern'), 'UPDATE')
              OR has_table_privilege('authenticated', to_regclass('public.investagon_intern'), 'DELETE')
              THEN 'NEIN, Recht zu weit'
            WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'investagon_intern'
                            AND (cmd <> 'SELECT' OR qual NOT LIKE '%is_admin_role%' OR qual NOT LIKE '%buchhaltung%'))
              THEN 'NEIN, fremde Regel auf investagon_intern'
            WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'investagon_intern'
                            AND policyname = 'Investagon intern Admin Inhaber Buchhaltung')
            THEN 'ja' ELSE 'fehlt (20261005120000 ausfuehren)' END

UNION ALL
SELECT '88.2 Ausloeser trennen die Provisionsfelder beim Schreiben von meta ab (Objekte und Einheiten)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_investagon_intern_abtrennen'
                            AND tgrelid = 'public.objekte'::regclass AND NOT tgisinternal)
             AND EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_investagon_intern_abtrennen'
                            AND tgrelid = 'public.wohnungen'::regclass AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20261005120000 ausfuehren)' END

UNION ALL
SELECT '88.3 Keine Provisionsfelder mehr in meta.investagonRaw',
       CASE WHEN to_regclass('public.investagon_intern') IS NULL THEN 'fehlt (20261005120000 ausfuehren)'
            ELSE (xpath('/row/c/text()', query_to_xml(
                   'SELECT CASE WHEN n = 0 THEN ''ja'' ELSE ''NEIN, '' || n || '' Zeilen'' END AS c FROM (
                      SELECT (SELECT count(*) FROM public.objekte WHERE meta -> ''investagonRaw'' ?| ARRAY[''commission'',''commission_comment'',''userCommissions'',''selling_price_commission'',''selling_price_commission_manual'',''sellingPriceCommission'',''transaction_broker_rate'',''listing_broker''])
                           + (SELECT count(*) FROM public.wohnungen WHERE meta -> ''investagonRaw'' ?| ARRAY[''commission'',''commission_comment'',''userCommissions'',''selling_price_commission'',''selling_price_commission_manual'',''sellingPriceCommission'',''transaction_broker_rate'',''listing_broker'']) AS n) z',
                   false, true, '')))[1]::text END

UNION ALL
SELECT '88.4 Kopie vollstaendig: je Objekt und Einheit mit Investagon-Datensatz eine Zeile in investagon_intern',
       CASE WHEN to_regclass('public.investagon_intern') IS NULL THEN 'fehlt (20261005120000 ausfuehren)'
            ELSE (xpath('/row/c/text()', query_to_xml(
                   'SELECT CASE WHEN io = o AND iw = w THEN ''ja ('' ELSE ''NEIN ('' END
                           || io || '' von '' || o || '' Objekten, '' || iw || '' von '' || w || '' Einheiten)'' AS c FROM (
                      SELECT (SELECT count(*) FROM public.objekte WHERE jsonb_typeof(meta -> ''investagonRaw'') = ''object'') AS o,
                             (SELECT count(*) FROM public.wohnungen WHERE jsonb_typeof(meta -> ''investagonRaw'') = ''object'') AS w,
                             (SELECT count(*) FROM public.investagon_intern WHERE objekt_id IS NOT NULL) AS io,
                             (SELECT count(*) FROM public.investagon_intern WHERE wohnung_id IS NOT NULL) AS iw) z',
                   false, true, '')))[1]::text END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 90: Weekly Sales Call, zwei Calls, Punkte je Call getrennt (20261005160000)
-- Alle Zeilen laufen auch vor der Migration.
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '90.1 Spalte weekly_call_punkte.call_runde (19:00 lead_berater, 19:30 vertriebspartner)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'weekly_call_punkte'
                            AND column_name = 'call_runde' AND is_nullable = 'NO')
             AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                          WHERE n.nspname = 'public' AND p.proname = 'weekly_call_runden')
            THEN 'ja' ELSE 'fehlt (20261005160000 ausfuehren)' END

UNION ALL
SELECT '90.2 Lesen, Eintragen, Aendern, Loeschen nur im eigenen Call, call_runde fest',
       CASE WHEN (SELECT count(*) FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = 'weekly_call_punkte'
                     AND policyname IN ('wcp_select_eigene', 'wcp_insert', 'wcp_update_eigene', 'wcp_delete_eigene')
                     AND COALESCE(qual, with_check) LIKE '%weekly_call_runden%'
                     AND (cmd <> 'UPDATE' OR with_check LIKE '%weekly_call_runden%')) = 4
             AND EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'trg_wcp_runde_fest'
                            AND tgrelid = 'public.weekly_call_punkte'::regclass AND NOT tgisinternal)
            THEN 'ja' ELSE 'fehlt (20261005160000 ausfuehren)' END

UNION ALL
SELECT '90.3 Lesen und Rueckschau nur der eigenen Calls, alte Fassungen entfernt',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                          WHERE n.nspname = 'public' AND p.proname = 'weekly_call_punkte_lesen'
                            AND pg_get_function_identity_arguments(p.oid) = '_termin date, _runde text')
             AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                          WHERE n.nspname = 'public' AND p.proname = 'weekly_call_termine'
                            AND pg_get_function_identity_arguments(p.oid) = '_runde text')
             AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname IN ('weekly_call_punkte_lesen', 'weekly_call_termine')) = 2
            THEN 'ja' ELSE 'fehlt (20261005160000 ausfuehren)' END

-- ─────────────────────────────────────────────────────────────────────────────
-- Teil 91: Selbstauskunft, ein fester Link je Investment und Person (20261007100000)
-- Alle Zeilen laufen auch vor der Migration.
-- ─────────────────────────────────────────────────────────────────────────────

UNION ALL
SELECT '91.1 Spalten sa_fill_tokens.neuer_link_angefordert_am, abgeschlossen_am, p2_nachforderung_am',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'sa_fill_tokens'
                     AND column_name IN ('neuer_link_angefordert_am', 'abgeschlossen_am', 'p2_nachforderung_am')) = 3
            THEN 'ja' ELSE 'fehlt (20261007100000 ausfuehren)' END

UNION ALL
SELECT '91.2 Aufraeumen loescht offene Selbstauskunfts-Links nicht mehr, nur abgeschlossene',
       CASE WHEN to_regprocedure('public.cleanup_expired_tokens()') IS NULL THEN 'fehlt (Funktion nicht da)'
            WHEN pg_get_functiondef(to_regprocedure('public.cleanup_expired_tokens()')) ~* 'DELETE\s+FROM\s+public\.sa_fill_tokens\s+WHERE\s+status\s*=\s*''used'''
             AND pg_get_functiondef(to_regprocedure('public.cleanup_expired_tokens()')) !~* 'DELETE\s+FROM\s+public\.sa_fill_tokens\s+WHERE\s+expires_at'
            THEN 'ja' ELSE 'fehlt (20261007100000 ausfuehren)' END

UNION ALL
SELECT '91.3 get_sa_fill_token liest den Stand vom Investment, Person 2 nur ihren Teil',
       CASE WHEN to_regprocedure('public.get_sa_fill_token(text)') IS NOT NULL
             AND pg_get_functiondef(to_regprocedure('public.get_sa_fill_token(text)')) LIKE '%saData%'
             AND pg_get_functiondef(to_regprocedure('public.get_sa_fill_token(text)')) LIKE '%sa_daten_sicht%'
            THEN 'ja' ELSE 'fehlt (20261007100000 ausfuehren)' END

UNION ALL
SELECT '91.4 Oeffnen und Speichern verlaengern den Link um 30 Tage, Speichern unter Sperre und nur fuers eigene Investment',
       CASE WHEN to_regprocedure('public.mark_sa_link_opened(text)') IS NOT NULL
             AND to_regprocedure('public.update_sa_fill_token_data(text, jsonb)') IS NOT NULL
             AND pg_get_functiondef(to_regprocedure('public.mark_sa_link_opened(text)')) LIKE '%30 days%'
             AND pg_get_functiondef(to_regprocedure('public.update_sa_fill_token_data(text, jsonb)')) LIKE '%30 days%'
             AND pg_get_functiondef(to_regprocedure('public.update_sa_fill_token_data(text, jsonb)')) LIKE '%FOR UPDATE%'
             AND pg_get_functiondef(to_regprocedure('public.update_sa_fill_token_data(text, jsonb)')) LIKE '%zuordnung%'
            THEN 'ja' ELSE 'fehlt (20261007100000 ausfuehren)' END

UNION ALL
SELECT '91.5 Weiterleitung und Neuer-Link-Knopf da, anon darf beide aufrufen',
       CASE WHEN to_regprocedure('public.sa_link_nachfolger(text)') IS NOT NULL
             AND to_regprocedure('public.sa_neuen_link_anfordern(text)') IS NOT NULL
             AND has_function_privilege('anon', 'public.sa_link_nachfolger(text)', 'EXECUTE')
             AND has_function_privilege('anon', 'public.sa_neuen_link_anfordern(text)', 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20261007100000 ausfuehren)' END

UNION ALL
SELECT '91.6 Fester Link wird nur ueber die Function ausgestellt (sa_link_ausstellen, kein Besucher, kein Nutzer)',
       CASE WHEN to_regprocedure('public.sa_link_ausstellen(text, text, integer, text, text, uuid, jsonb)') IS NOT NULL
             AND NOT has_function_privilege('anon', 'public.sa_link_ausstellen(text, text, integer, text, text, uuid, jsonb)', 'EXECUTE')
             AND NOT has_function_privilege('authenticated', 'public.sa_link_ausstellen(text, text, integer, text, text, uuid, jsonb)', 'EXECUTE')
            THEN 'ja' ELSE 'fehlt (20261007100000 ausfuehren)' END

UNION ALL
SELECT '91.7 Abschicken unter Sperre (sa_link_abschliessen, nur die Function)',
       CASE WHEN to_regprocedure('public.sa_link_abschliessen(text, jsonb, jsonb, timestamptz)') IS NOT NULL
             AND to_regprocedure('public.sa_signatur_passt(integer, text)') IS NOT NULL
             AND NOT has_function_privilege('anon', 'public.sa_link_abschliessen(text, jsonb, jsonb, timestamptz)', 'EXECUTE')
             AND NOT has_function_privilege('authenticated', 'public.sa_link_abschliessen(text, jsonb, jsonb, timestamptz)', 'EXECUTE')
             AND pg_get_functiondef(to_regprocedure('public.sa_link_abschliessen(text, jsonb, jsonb, timestamptz)')) LIKE '%FOR UPDATE%'
            THEN 'ja' ELSE 'fehlt (20261007100000 ausfuehren)' END;
