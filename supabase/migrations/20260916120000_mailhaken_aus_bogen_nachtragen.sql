-- ===========================================================================
-- Der Haken am Mailzeichen: Nachtrag noch einmal, diesmal nachpruefbar
-- ===========================================================================
--
-- WARUM
--
-- Am 15.09.2026 ist `20260915180000_mailoeffnung_aus_ausgefuelltem_bogen.sql`
-- gelaufen. Sie legt die Spalte `opened_source` an, die Funktion
-- `mark_bewerber_mail_opened_aus_bogen` und traegt in einem DO-Block den
-- Vermerk fuer den Altbestand nach.
--
-- Christian meldet am 16.09.2026: In der Bewerberliste fehlt der Haken neben
-- dem Briefumschlag weiterhin bei Bewerbern, die den Kennenlernbogen
-- nachweislich ausgefuellt und abgeschickt haben.
--
-- WAS WAR DER FEHLER
--
-- Der Nachtrag vom 15.09.2026 war nie nachpruefbar. Er meldet sein Ergebnis
-- ausschliesslich als `RAISE NOTICE`, also als Randnotiz im SQL-Editor, und
-- die Pruefabfrage jenes Tages (`99_PRUEFUNG.sql`, Zeilen 11 und 12) fragte
-- nur, ob es die Funktion und die Spalte gibt. Ob der Nachtrag auch nur eine
-- einzige Zeile geschrieben hat, hat niemand gesehen. Genau das ist die
-- Luecke: Die Pruefung bestaetigte das Werkzeug und nicht die Wirkung.
--
-- Dazu kommt, dass der Vermerk an einer Kette aus vier Gliedern haengt:
--
--   1. es muss eine Zeile in `bewerber_mail_tracking` geben oder angelegt
--      werden koennen (die Pruefung der Spalte `kind` muss die Bewerbermails
--      kennen, sonst weist sie jede neue Zeile ab),
--   2. `submit-bewerber-formular` muss den RPC-Aufruf absetzen,
--   3. der Nachtrag muss die Altfaelle erwischt haben,
--   4. die Bewerberliste muss die Zeile lesen duerfen.
--
-- Reisst eines davon, bleibt der Umschlag grau, und zwar lautlos: Jeder der
-- vier Schritte ist bewusst als "best effort" gebaut und verschluckt seinen
-- Fehler. Deshalb laesst sich von aussen nicht sagen, welches Glied gerissen
-- ist, und deshalb wird der Nachtrag hier schlicht wiederholt.
--
-- WAS SICH AENDERT
--
-- Nichts an der Regel, nur an der Nachpruefbarkeit und an der Vollstaendigkeit:
--
--   1. Spalte, Pruefung der Spalte `kind` und Index werden sicherheitshalber
--      noch einmal hergestellt. Faellt die Migration vom 15.09.2026 doch nicht
--      durchgelaufen sein, steht danach trotzdem alles.
--   2. Die Funktion `mark_bewerber_mail_opened_aus_bogen` wird unveraendert
--      neu angelegt, damit diese Migration auch allein genuegt.
--   3. Der Nachtrag laeuft erneut und zaehlt getrennt mit, wie viele Bewerber
--      offen waren und wie viele danach noch offen sind. Beide Zahlen gehen
--      als `RAISE NOTICE` hinaus, die zweite muss 0 sein.
--   4. `99_PRUEFUNG.sql` bekommt eine Zeile, die genau diese zweite Zahl
--      abfragt. Ab jetzt faellt ein wirkungsloser Nachtrag sofort auf.
--
-- Erkannt wird der Kennenlernbogen an denselben zwei Merkmalen wie im Browser
-- (`istKennenlernZeile` in `src/lib/kennenlernenLink.ts`) und auf der
-- Serverseite (`_shared/kennenlernen-versand.ts`): am Kennzeichen `bogen`, das
-- der Versand beim Anlegen setzt, oder am gewaehlten `weg`, den nur dieser
-- Bogen kennt. Der fruehere Vorabbogen hat beides nicht und bleibt draussen.
--
-- Eine gemessene Oeffnung wird an keiner Stelle ueberschrieben.
--
-- Wiederholbar: Ein zweiter Lauf findet keine Zeile mehr und aendert nichts.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Die Tabelle muss die Bewerbermails und die Herkunft kennen
--
-- Absichtlich wiederholt aus `20260914183000_bewerbermails_oeffnungstracking`
-- und `20260915180000_mailoeffnung_aus_ausgefuelltem_bogen`. Doppelt
-- ausgefuehrt schadet es nicht, und ohne diesen Teil liefe der Nachtrag weiter
-- unten ins Leere, weil die Pruefung der Spalte `kind` jede neue Zeile abwiese.
-- ---------------------------------------------------------------------------
DO $vorbereitung$
BEGIN
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

  CREATE INDEX IF NOT EXISTS idx_bewerber_mail_tracking_bewerber_kind
    ON public.bewerber_mail_tracking(bewerber_id, kind);

  ALTER TABLE public.bewerber_mail_tracking
    ADD COLUMN IF NOT EXISTS opened_source text;

  ALTER TABLE public.bewerber_mail_tracking
    DROP CONSTRAINT IF EXISTS bewerber_mail_tracking_opened_source_check;

  ALTER TABLE public.bewerber_mail_tracking
    ADD CONSTRAINT bewerber_mail_tracking_opened_source_check
    CHECK (opened_source IS NULL OR opened_source IN ('pixel', 'bogen'));

  COMMENT ON COLUMN public.bewerber_mail_tracking.opened_source IS
    'Woher der Oeffnungsvermerk stammt: pixel = das Zaehlpixel wurde geladen, bogen = aus dem abgeschickten Kennenlernbogen abgeleitet, leer = Vermerk aus der Zeit vor dem 15.09.2026, damals gab es nur das Zaehlpixel.';
END $vorbereitung$;

-- ---------------------------------------------------------------------------
-- 2. Der abgeleitete Vermerk, unveraendert aus der Migration vom 15.09.2026
--
-- Steht hier noch einmal, damit diese Migration allein genuegt. Die drei
-- Faelle in ihrer Reihenfolge:
--
--   a) Es gibt schon eine Oeffnung zu einer der vier Kennenlernmails: nichts
--      tun. Eine gemessene Oeffnung wird nie ueberschrieben, und genau das
--      macht die Funktion mehrfach ausfuehrbar.
--   b) Es gibt eine Trackingzeile ohne Oeffnung: die juengste bekommt den
--      Vermerk. Juengste deshalb, weil alle vier Mails denselben Link tragen
--      und die zuletzt verschickte die wahrscheinlichste ist.
--   c) Es gibt gar keine Trackingzeile: eine entsteht mit `tracked = false`.
--      Das ist der Regelfall im Altbestand und beim Sammelversand, der seine
--      Mail selbst schreibt und kein Zaehlpixel anlegt.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_bewerber_mail_opened_aus_bogen(
  _bewerbung_id uuid,
  _zeitpunkt timestamptz DEFAULT now(),
  _gesendet_am timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $funktion$
DECLARE
  _arten text[] := ARRAY[
    'kennenlernen_einladung',
    'kennenlernen_erinnerung_1',
    'kennenlernen_erinnerung_2',
    'kennenlernen_erinnerung_3'
  ];
  _treffer uuid;
BEGIN
  IF _bewerbung_id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.bewerber_mail_tracking
     WHERE bewerber_id = _bewerbung_id
       AND kind = ANY(_arten)
       AND opened_at IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  SELECT token INTO _treffer
    FROM public.bewerber_mail_tracking
   WHERE bewerber_id = _bewerbung_id
     AND kind = ANY(_arten)
   ORDER BY sent_at DESC
   LIMIT 1;

  IF _treffer IS NOT NULL THEN
    UPDATE public.bewerber_mail_tracking
       SET opened_at     = COALESCE(_zeitpunkt, now()),
           opened_source = 'bogen'
     WHERE token = _treffer;
    RETURN;
  END IF;

  INSERT INTO public.bewerber_mail_tracking
    (bewerber_id, kind, sent_at, opened_at, opened_source, tracked)
  VALUES (
    _bewerbung_id,
    'kennenlernen_einladung',
    COALESCE(_gesendet_am, _zeitpunkt, now()),
    COALESCE(_zeitpunkt, now()),
    'bogen',
    false
  );
END;
$funktion$;

-- Nur die Serverseite darf ableiten. Ohne den Entzug duerfte jeder angemeldete
-- Nutzer ueber diese Funktion fremde Oeffnungen setzen; gebraucht wird sie
-- allein von `submit-bewerber-formular`, und das laeuft mit der Service-Rolle.
REVOKE ALL ON FUNCTION public.mark_bewerber_mail_opened_aus_bogen(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_bewerber_mail_opened_aus_bogen(uuid, timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.mark_bewerber_mail_opened_aus_bogen(uuid, timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_bewerber_mail_opened_aus_bogen(uuid, timestamptz, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Nachtrag, und diesmal mit Ergebnis
--
-- Gezaehlt wird zweimal: vorher, wie viele Bewerber mit eingereichtem
-- Kennenlernbogen keinen Oeffnungsvermerk haben, und nachher noch einmal
-- dasselbe. Die zweite Zahl muss 0 sein. Steht dort etwas anderes, hat der
-- Nachtrag nicht gegriffen, und das faellt ab jetzt sofort auf, statt erst
-- Wochen spaeter in der Liste.
--
-- Gibt es mehrere eingereichte Boegen, zaehlt der erste. Das ist der
-- Zeitpunkt, zu dem die Mail nachweislich offen war.
-- ---------------------------------------------------------------------------
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

  SELECT count(DISTINCT f.bewerbung_id) INTO _vorher
    FROM public.bewerber_formular f
   WHERE f.status = 'eingereicht'
     AND f.eingereicht_am IS NOT NULL
     AND (
       f.antworten->>'bogen' = 'kennenlernen'
       OR COALESCE(f.antworten->>'weg', '') <> ''
     )
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

  FOR _zeile IN
    SELECT DISTINCT ON (f.bewerbung_id)
           f.bewerbung_id,
           f.eingereicht_am,
           f.created_at
      FROM public.bewerber_formular f
     WHERE f.status = 'eingereicht'
       AND f.eingereicht_am IS NOT NULL
       AND (
         f.antworten->>'bogen' = 'kennenlernen'
         OR COALESCE(f.antworten->>'weg', '') <> ''
       )
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
     ORDER BY f.bewerbung_id, f.eingereicht_am ASC
  LOOP
    PERFORM public.mark_bewerber_mail_opened_aus_bogen(
      _zeile.bewerbung_id, _zeile.eingereicht_am, _zeile.created_at
    );
  END LOOP;

  SELECT count(DISTINCT f.bewerbung_id) INTO _nachher
    FROM public.bewerber_formular f
   WHERE f.status = 'eingereicht'
     AND f.eingereicht_am IS NOT NULL
     AND (
       f.antworten->>'bogen' = 'kennenlernen'
       OR COALESCE(f.antworten->>'weg', '') <> ''
     )
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

  RAISE NOTICE 'Mailhaken aus dem Bogen: % Bewerber waren offen, % sind es danach noch (erwartet: 0)',
    _vorher, _nachher;
END $nachtrag$;

-- ===========================================================================
-- Kontrollabfragen. Sie aendern nichts.
--
-- 1. Wie viele Bewerber mit eingereichtem Kennenlernbogen haben KEINEN
--    Oeffnungsvermerk? Erwartet wird 0.
--
--   select count(distinct f.bewerbung_id) as offene_haken
--     from public.bewerber_formular f
--    where f.status = 'eingereicht'
--      and f.eingereicht_am is not null
--      and (f.antworten->>'bogen' = 'kennenlernen'
--           or coalesce(f.antworten->>'weg', '') <> '')
--      and not exists (
--            select 1 from public.bewerber_mail_tracking t
--             where t.bewerber_id = f.bewerbung_id
--               and t.kind in ('kennenlernen_einladung','kennenlernen_erinnerung_1',
--                              'kennenlernen_erinnerung_2','kennenlernen_erinnerung_3')
--               and t.opened_at is not null);
--
-- 2. Wie verteilen sich die Vermerke auf gemessen und abgeleitet? Nur
--    `pixel` ist eine Messung, `bogen` ist ein Beleg. Fuer die Oeffnungsquote
--    zaehlt ausschliesslich `pixel`.
--
--   select coalesce(opened_source, 'unbekannt') as herkunft, count(*)
--     from public.bewerber_mail_tracking
--    where kind like 'kennenlernen%'
--      and opened_at is not null
--    group by 1
--    order by 1;
-- ===========================================================================
