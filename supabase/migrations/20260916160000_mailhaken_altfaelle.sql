-- ===========================================================================
-- Der Haken am Mailzeichen: jetzt auch fuer die Altfaelle
-- ===========================================================================
--
-- WARUM
--
-- GL meldet am 16.09.2026, dass in der Bewerberliste der Haken neben
-- dem Briefumschlag weiterhin fehlt, und zwar bei Bewerbern, die einen Bogen
-- nachweislich ausgefuellt haben. Auf seinem Bild traegt ein Bewerber vom
-- 15.09.2026 den Haken, alle vom 08.09.2026 und aelter nicht.
--
-- Zwei Migrationen haben das vorher schon versucht:
--
--   `20260915180000_mailoeffnung_aus_ausgefuelltem_bogen.sql` hat die Spalte
--   `opened_source`, die Funktion `mark_bewerber_mail_opened_aus_bogen` und
--   einen ersten Nachtrag gebracht.
--
--   `20260916120000_mailhaken_aus_bogen_nachtragen.sql` hat denselben Nachtrag
--   wiederholt und ihn nachpruefbar gemacht, also mit einer Zahl vorher und
--   einer Zahl nachher.
--
-- Beide sind aus demselben Grund an den Altfaellen vorbeigelaufen.
--
-- WARUM DER FILTER VOM 15.09.2026 ZU ENG WAR
--
-- Er verlangt genau zwei Merkmale:
--
--   f.antworten->>'bogen' = 'kennenlernen'  oder
--   coalesce(f.antworten->>'weg', '') <> ''
--
-- Das ist dasselbe Merkmal, an dem der Browser den Kennenlernbogen erkennt
-- (`istKennenlernZeile` in `src/lib/kennenlernenLink.ts`). Fuer die Wahl des
-- richtigen Links ist es genau richtig. Als Filter fuer den Mailhaken ist es
-- aus drei Gruenden zu eng:
--
--   1. Der gewaehlte `weg` ist eine Frage des Kennenlernbogens, und den gibt
--      es erst seit dem 06.09.2026. Alles Aeltere kann ihn nicht tragen.
--   2. Das Kennzeichen `bogen` setzt der Versand beim ANLEGEN der Zeile. Beim
--      Absenden ersetzt `submit-bewerber-formular` die ganze Spalte
--      `antworten` durch die geprueften Angaben, und `bogen` steht in deren
--      Schema nicht. Eine eingereichte Zeile traegt das Kennzeichen also gar
--      nicht mehr.
--   3. Und vor allem: Die Bewerber auf dem Bild der GL haben ueberhaupt nicht
--      den Kennenlernbogen ausgefuellt, sondern den frueheren VORABBOGEN aus
--      `send-bewerber-formular`, den es seit dem 19.08.2026 gibt. Der traegt
--      weder `bogen` noch `weg` und fiel damit durch jeden bisherigen Filter.
--
-- WAS JETZT GILT
--
-- GL-Vorgabe vom 16.09.2026, woertlich: „wenn einer der beiden bogen
-- schon ausgefuellt ist, bitte den haken anzeigen."
--
-- Der Grund traegt fuer beide Boegen gleichermassen: Der Link zum Bogen steht
-- ausschliesslich in einer Mail von uns. Wer einen Bogen abgeschickt hat, hat
-- also eine Mail bekommen und geoeffnet.
--
-- Der Filter fragt deshalb nur noch nach dem Status. `eingereicht` setzt im
-- ganzen System genau eine Stelle, naemlich `submit-bewerber-formular`, und
-- nur gegen ein gueltiges, nicht abgelaufenes Token aus der Mail. Der
-- Vorgabewert der Spalte ist `offen`, `bewerber_formular_aufraeumen` setzt
-- `abgelaufen`, ein neuer Versand setzt `ersetzt`. Es gibt keinen Weg, auf dem
-- eine Zeile ohne Zutun des Bewerbers auf `eingereicht` landet. Ein Haken ohne
-- Beleg kann so also nicht entstehen.
--
-- Nach dem Inhalt von `antworten` wird bewusst NICHT gefragt. Der Beleg ist
-- das Absenden und nicht, was dabei angekreuzt wurde. Eine Zeile mit leeren
-- Antworten und Status `eingereicht` waere zwar merkwuerdig, aber immer noch
-- abgeschickt worden.
--
-- WAS DIESE MIGRATION AENDERT
--
--   1. Nichts an der Funktion `mark_bewerber_mail_opened_aus_bogen`. Sie wird
--      unveraendert benutzt, so wie sie am 15.09.2026 entstanden ist. Wer sie
--      nachlesen will, findet sie in
--      `20260915180000_mailoeffnung_aus_ausgefuelltem_bogen.sql` und noch
--      einmal in `20260916120000_mailhaken_aus_bogen_nachtragen.sql`.
--   2. Nur der Nachtrag laeuft erneut, mit dem weiteren Filter. Gezaehlt wird
--      wie am 16.09.2026 zweimal: vorher und nachher. Die zweite Zahl muss 0
--      sein.
--
-- Eine gemessene Oeffnung wird an keiner Stelle ueberschrieben: Die Funktion
-- kehrt sofort um, sobald zu einer der vier Kennenlernmails schon eine
-- Oeffnung vermerkt ist, gleich welcher Herkunft.
--
-- WAS DER HAKEN DANN SAGT UND WAS NICHT
--
-- Der Vermerk landet an einer Kennenlernmail, der Beleg kann aber aus dem
-- Vorabbogen stammen, also aus einer anderen Mail. Belegt ist deshalb: „eine
-- Mail von uns wurde geoeffnet", nicht „genau diese Mail wurde geoeffnet".
-- Genau so steht es auch im Tooltip der Liste, siehe
-- `src/components/bewerbung/KennenlernMailVermerk.tsx`.
--
-- Die Oeffnungsquote wird davon nicht geschoent: Der Vermerk traegt
-- `opened_source = 'bogen'`, und als Messung zaehlt allein `pixel`.
--
-- Wiederholbar: Ein zweiter Lauf findet keine Zeile mehr und aendert nichts.
-- ===========================================================================

DO $nachtrag$
DECLARE
  _zeile record;
  _vorher int := 0;
  _nachher int := 0;
BEGIN
  IF to_regclass('public.bewerber_mail_tracking') IS NULL
     OR to_regclass('public.bewerber_formular') IS NULL THEN
    RAISE NOTICE 'Tabellen fehlen, Nachtrag uebersprungen';
    RETURN;
  END IF;

  IF to_regproc('public.mark_bewerber_mail_opened_aus_bogen(uuid, timestamptz, timestamptz)') IS NULL THEN
    RAISE NOTICE 'mark_bewerber_mail_opened_aus_bogen fehlt, erst 20260915180000 bzw. 20260916120000 ausfuehren';
    RETURN;
  END IF;

  SELECT count(DISTINCT f.bewerbung_id) INTO _vorher
    FROM public.bewerber_formular f
   WHERE f.status = 'eingereicht'
     AND NOT EXISTS (
       SELECT 1 FROM public.bewerber_mail_tracking t
        WHERE t.bewerber_id = f.bewerbung_id
          AND t.kind IN (
            'kennenlernen_einladung',
            'kennenlernen_erinnerung_1',
            'kennenlernen_erinnerung_2',
            'kennenlernen_erinnerung_3'
          )
          AND t.opened_at IS NOT NULL
     );

  /*
   * Gibt es mehrere eingereichte Boegen, zaehlt der erste. Das ist der
   * frueheste Zeitpunkt, zu dem eine Mail von uns nachweislich offen war.
   *
   * `eingereicht_am` kann in ganz alten Zeilen fehlen; `created_at` ist der
   * Zeitpunkt, an dem die Einladung entstand, und damit der Zeitpunkt der
   * Mail. Er ist NOT NULL und deshalb der richtige Rueckfall. Ohne ihn fielen
   * genau die aeltesten Faelle wieder heraus, um die es hier geht.
   */
  FOR _zeile IN
    SELECT DISTINCT ON (f.bewerbung_id)
           f.bewerbung_id,
           COALESCE(f.eingereicht_am, f.created_at) AS ausgefuellt_am,
           f.created_at
      FROM public.bewerber_formular f
     WHERE f.status = 'eingereicht'
       AND NOT EXISTS (
         SELECT 1 FROM public.bewerber_mail_tracking t
          WHERE t.bewerber_id = f.bewerbung_id
            AND t.kind IN (
              'kennenlernen_einladung',
              'kennenlernen_erinnerung_1',
              'kennenlernen_erinnerung_2',
              'kennenlernen_erinnerung_3'
            )
            AND t.opened_at IS NOT NULL
       )
     ORDER BY f.bewerbung_id, COALESCE(f.eingereicht_am, f.created_at) ASC
  LOOP
    PERFORM public.mark_bewerber_mail_opened_aus_bogen(
      _zeile.bewerbung_id, _zeile.ausgefuellt_am, _zeile.created_at
    );
  END LOOP;

  SELECT count(DISTINCT f.bewerbung_id) INTO _nachher
    FROM public.bewerber_formular f
   WHERE f.status = 'eingereicht'
     AND NOT EXISTS (
       SELECT 1 FROM public.bewerber_mail_tracking t
        WHERE t.bewerber_id = f.bewerbung_id
          AND t.kind IN (
            'kennenlernen_einladung',
            'kennenlernen_erinnerung_1',
            'kennenlernen_erinnerung_2',
            'kennenlernen_erinnerung_3'
          )
          AND t.opened_at IS NOT NULL
     );

  RAISE NOTICE 'Mailhaken, Altfaelle: % Bewerber mit ausgefuelltem Bogen waren offen, % sind es danach noch (erwartet: 0)',
    _vorher, _nachher;
END $nachtrag$;

-- ===========================================================================
-- Zum Nachsehen im SQL-Editor. Aendert nichts und gibt keine Namen aus,
-- sondern nur Zahlen.
--
-- Drei Spalten:
--
--   mit_ausgefuelltem_bogen   Wie viele Bewerber haben ueberhaupt einen
--                             eingereichten Bogen, egal welchen der beiden?
--                             Das ist die Menge, um die es geht.
--   davor_ohne_haken          Wie viele davon haetten OHNE den Vorabbogen
--                             keinen Haken bekommen, weil ihre Zeilen weder
--                             `bogen` noch `weg` tragen? Das ist die Zahl der
--                             Altfaelle, also genau die, die GL
--                             gefehlt haben.
--   jetzt_noch_offen          Wie viele haben nach dem Lauf noch keinen
--                             Oeffnungsvermerk? Erwartet wird 0.
--
--   with boegen as (
--     select distinct f.bewerbung_id,
--            bool_or(f.antworten->>'bogen' = 'kennenlernen'
--                    or coalesce(f.antworten->>'weg', '') <> '')
--              over (partition by f.bewerbung_id) as hat_kennenlernbogen
--       from public.bewerber_formular f
--      where f.status = 'eingereicht'
--   ), offen as (
--     select b.bewerbung_id, b.hat_kennenlernbogen,
--            not exists (
--              select 1 from public.bewerber_mail_tracking t
--               where t.bewerber_id = b.bewerbung_id
--                 and t.kind in ('kennenlernen_einladung','kennenlernen_erinnerung_1',
--                                'kennenlernen_erinnerung_2','kennenlernen_erinnerung_3')
--                 and t.opened_at is not null
--            ) as ohne_haken
--       from boegen b
--   )
--   select count(*)                                            as mit_ausgefuelltem_bogen,
--          count(*) filter (where not hat_kennenlernbogen)      as davor_ohne_haken,
--          count(*) filter (where ohne_haken)                   as jetzt_noch_offen
--     from offen;
--
-- Und wie sich die Vermerke auf gemessen und abgeleitet verteilen. Nur `pixel`
-- ist eine Messung, `bogen` ist ein Beleg. Fuer die Oeffnungsquote zaehlt
-- ausschliesslich `pixel`.
--
--   select coalesce(opened_source, 'unbekannt') as herkunft, count(*)
--     from public.bewerber_mail_tracking
--    where kind like 'kennenlernen%'
--      and opened_at is not null
--    group by 1
--    order by 1;
-- ===========================================================================
