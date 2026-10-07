-- ===========================================================================
-- Oeffnungstracking auch fuer die Bewerbervorlagen
--
-- Die Tabelle `bewerber_mail_tracking` gibt es seit dem 08.06.2026. Ihre
-- Spalte `kind` laesst bisher genau zwei Werte zu, `paket_uebersicht` und
-- `muster_vertrag`, also die beiden Mails aus dem Closing. Die Bewerbermails
-- des neuen Prozesses sollen dieselbe Messung bekommen, und dafuer muss die
-- Pruefung fuenf weitere Werte kennen:
--
--   kennenlernen_einladung     die Eingangsmail mit dem Kennenlernbogen
--   kennenlernen_erinnerung_1  Erinnerung an Tag 3
--   kennenlernen_erinnerung_2  Erinnerung an Tag 8
--   kennenlernen_erinnerung_3  die letzte Erinnerung
--   kooperation_einladung      die Einladung zum persoenlichen Gespraech
--
-- Es entsteht keine zweite Tabelle und keine zweite Function. Verschickt wird
-- weiter ueber `send-transactional-email`, gezaehlt weiter ueber
-- `track-bewerber-mail` und die beiden vorhandenen Funktionen
-- `mark_bewerber_mail_opened` und `mark_bewerber_mail_clicked`.
--
-- Solange diese Migration nicht gelaufen ist, weist die Pruefung die neuen
-- Zeilen ab. Das ist eingeplant: Alle vier Einbaustellen legen den Eintrag
-- "best effort" an, fangen den Fehler ab und verschicken die Mail dann ohne
-- Zaehlpixel. Es geht also nichts verloren, es wird nur nichts gemessen.
--
-- Wiederholbar: Ein zweiter Durchlauf schadet nicht.
-- ===========================================================================

DO $$
BEGIN
  -- Fehlt die Tabelle im Projekt, ist hier nichts zu tun. Sie wird von der
  -- Migration vom 08.06.2026 angelegt; siehe 98_FEHLENDE_TABELLEN.sql.
  IF to_regclass('public.bewerber_mail_tracking') IS NULL THEN
    RAISE NOTICE 'bewerber_mail_tracking fehlt, Migration uebersprungen';
    RETURN;
  END IF;

  ALTER TABLE public.bewerber_mail_tracking
    DROP CONSTRAINT IF EXISTS bewerber_mail_tracking_kind_check;

  ALTER TABLE public.bewerber_mail_tracking
    ADD CONSTRAINT bewerber_mail_tracking_kind_check
    CHECK (kind IN (
      'paket_uebersicht',
      'muster_vertrag',
      'kennenlernen_einladung',
      'kennenlernen_erinnerung_1',
      'kennenlernen_erinnerung_2',
      'kennenlernen_erinnerung_3',
      'kooperation_einladung'
    ));
  COMMENT ON COLUMN public.bewerber_mail_tracking.kind IS
    'Welche Mail gemessen wird: paket_uebersicht und muster_vertrag aus dem Closing, kennenlernen_einladung, kennenlernen_erinnerung_1 bis _3 und kooperation_einladung aus dem Bewerberprozess.';

  -- Die Bewerberliste fragt nach Bewerber UND Art zugleich. Der vorhandene
  -- Index auf bewerber_id allein genuegt dafuer, der zusammengesetzte spart bei
  -- 150 Bewerbern aber den Nachfilter.
  CREATE INDEX IF NOT EXISTS idx_bewerber_mail_tracking_bewerber_kind
    ON public.bewerber_mail_tracking(bewerber_id, kind);
END $$;

-- Prueflauf: Kennt die Pruefung jetzt alle sieben Arten? Erwartet: "ja".
--   select case when pg_get_constraintdef(oid) like '%kooperation_einladung%'
--               then 'ja' else 'fehlt' end as erweitert
--     from pg_constraint
--    where conname = 'bewerber_mail_tracking_kind_check';
