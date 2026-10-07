-- ===========================================================================
-- Reservierung unterschrieben: feste Empfaenger der internen Meldung
-- ===========================================================================
--
-- Auftrag GL vom 24.09.2026: Sobald ein Kunde die
-- Reservierungsvereinbarung unterschrieben hat, geht eine Mail mit einem
-- Download-Knopf fuer die unterschriebene PDF an den zustaendigen
-- Vertriebspartner, an GL und an zweite GL. Verschickt wird
-- sie von `finalize-reservierung`, der Rueckfall liegt in
-- `send-reservierung-eskalation`, die Logik in
-- `supabase/functions/_shared/reservierung-unterschrieben-meldung.ts`.
--
-- Der Partner kommt aus dem Kontakt (`zustaendig_id`). Die Geschaeftsfuehrung
-- steht hier, in `public.app_config` unter dem Schluessel
-- `reservierung_unterschrieben_empfaenger`, als JSON-Liste. Jeder Eintrag ist
-- ENTWEDER die Kennung eines Nutzers (profiles.id, dann gilt die Adresse aus
-- seinem Profil) ODER eine Mailadresse. Bewusst keine Namen: Zwei Profile
-- koennen denselben Namen tragen.
--
-- Im Ursprungsprojekt waren hier zwei Adressen der Geschaeftsleitung
-- vorbelegt. OSImmobilien legt die Liste leer an; Empfaenger per Kennung oder
-- Adresse nachtragen (siehe unten).
--
-- SO AENDERT MAN DIE LISTE: Die vollstaendige Liste eintragen, mit Kennungen
-- oder Adressen. Zeile anpassen und ausfuehren:
--
--     update public.app_config
--        set wert = '["name@example.org","office@example.org"]'::jsonb,
--            aktualisiert_am = now()
--      where schluessel = 'reservierung_unterschrieben_empfaenger';
--
-- SO SIEHT MAN DEN STAND:
--
--     select wert from public.app_config
--      where schluessel = 'reservierung_unterschrieben_empfaenger';
--
-- Fehlt der Eintrag oder ist die Liste leer, geht die Meldung nur an den
-- Partner, und der Grund steht im Protokoll der Function. Kein Rueckfall auf
-- eine Adresse im Code und keiner auf alle Administratoren.
--
-- `ON CONFLICT DO NOTHING`: Migrationen laufen von Hand und manchmal zweimal.
-- Ein `DO UPDATE` wuerde beim zweiten Lauf eine inzwischen ergaenzte Liste
-- wieder auf die Vorbelegung zuruecksetzen.

INSERT INTO public.app_config (schluessel, wert)
VALUES ('reservierung_unterschrieben_empfaenger', '[]'::jsonb)
ON CONFLICT (schluessel) DO NOTHING;

-- Kontrolle: eine Zeile mit der Liste.
SELECT schluessel, wert
  FROM public.app_config
 WHERE schluessel = 'reservierung_unterschrieben_empfaenger';
