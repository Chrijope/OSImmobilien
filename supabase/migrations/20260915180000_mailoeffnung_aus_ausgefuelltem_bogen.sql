-- ===========================================================================
-- Wer den Kennenlernbogen ausgefuellt hat, hat die Mail geoeffnet
--
-- Beobachtung vom 15.09.2026: In der Bewerberliste fehlt der Haken neben dem
-- Mailzeichen bei Bewerbern, die den Kennenlernbogen nachweislich ausgefuellt
-- haben. Der Grund ist das Messverfahren. Gemessen wird ueber ein unsichtbares
-- Bild in der Mail; laedt das Mailprogramm keine Bilder, kommt nie eine
-- Oeffnung an. Dazu kommt, dass die Bewerbermails das Zaehlpixel erst seit dem
-- 14./15.09.2026 ueberhaupt tragen: Alles, was vorher hinausging, ist
-- ungemessen und bleibt es.
--
-- Der Bogen selbst ist der bessere Beleg. Sein Link steht ausschliesslich in
-- dieser Mail; wer ihn abgeschickt hat, hat die Mail zwangslaeufig geoeffnet.
-- Diese Migration macht daraus einen Vermerk, ohne ihn als Messung auszugeben:
--
--   1. neue Spalte `opened_source` an `bewerber_mail_tracking`
--      leer oder 'pixel' = das Zaehlpixel wurde geladen
--      'bogen'           = aus dem ausgefuellten Kennenlernbogen abgeleitet
--   2. die beiden vorhandenen Funktionen `mark_bewerber_mail_opened` und
--      `mark_bewerber_mail_clicked` schreiben kuenftig 'pixel' dazu
--   3. neue Funktion `mark_bewerber_mail_opened_aus_bogen`, die den
--      abgeleiteten Vermerk setzt. Sie wird ab sofort von
--      `submit-bewerber-formular` bei jedem abgeschickten Bogen gerufen
--   4. Altbestand: fuer jeden Bewerber mit eingereichtem Kennenlernbogen und
--      ohne bisherigen Oeffnungsvermerk wird derselbe Vermerk nachgetragen
--
-- Wiederholbar. Ein zweiter Durchlauf findet keine Zeile mehr und aendert
-- nichts. Eine echte, gemessene Oeffnung wird an keiner Stelle ueberschrieben.
--
-- Hinweis zur Reihenfolge: Teil 0 wiederholt absichtlich die Pruefliste aus
-- `20260914183000_bewerbermails_oeffnungstracking.sql`. Diese Migration steht
-- noch im Eingangskorb und fehlt in der Sammeldatei; ohne sie wuerde die
-- Pruefung der Spalte `kind` jede neue Zeile abweisen und der Nachtrag liefe
-- ins Leere. Doppelt ausgefuehrt schadet sie nicht.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Die Pruefung der Spalte `kind` muss die Bewerbermails kennen
-- ---------------------------------------------------------------------------
DO $$
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

  -- ---------------------------------------------------------------------
  -- 1. Woher ein Oeffnungsvermerk stammt
  -- ---------------------------------------------------------------------
  ALTER TABLE public.bewerber_mail_tracking
    ADD COLUMN IF NOT EXISTS opened_source text;

  ALTER TABLE public.bewerber_mail_tracking
    DROP CONSTRAINT IF EXISTS bewerber_mail_tracking_opened_source_check;

  ALTER TABLE public.bewerber_mail_tracking
    ADD CONSTRAINT bewerber_mail_tracking_opened_source_check
    CHECK (opened_source IS NULL OR opened_source IN ('pixel', 'bogen'));

  COMMENT ON COLUMN public.bewerber_mail_tracking.opened_source IS
    'Woher der Oeffnungsvermerk stammt: pixel = das Zaehlpixel wurde geladen, bogen = aus dem abgeschickten Kennenlernbogen abgeleitet, leer = Vermerk aus der Zeit vor dem 15.09.2026, damals gab es nur das Zaehlpixel.';
END $$;

-- ---------------------------------------------------------------------------
-- 2. Die gemessene Oeffnung traegt kuenftig ihren Grund mit
--
-- `COALESCE` an beiden Stellen: Ein bereits gesetzter Grund bleibt stehen.
-- Wurde also erst aus dem Bogen abgeleitet und faellt spaeter doch noch ein
-- Zaehlpixel an, bleibt der Zeitpunkt der erste und der Grund der erste. Das
-- ist dieselbe Regel, nach der `opened_at` seit dem 08.06.2026 arbeitet.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_bewerber_mail_opened(_token uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.bewerber_mail_tracking
     SET opened_at     = COALESCE(opened_at, now()),
         opened_source = COALESCE(opened_source, 'pixel')
   WHERE token = _token;
$$;

CREATE OR REPLACE FUNCTION public.mark_bewerber_mail_clicked(_token uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.bewerber_mail_tracking
     SET clicked_at    = COALESCE(clicked_at, now()),
         opened_at     = COALESCE(opened_at, now()),
         opened_source = COALESCE(opened_source, 'pixel')
   WHERE token = _token;
$$;

-- ---------------------------------------------------------------------------
-- 3. Der abgeleitete Vermerk
--
-- Drei Faelle, in dieser Reihenfolge:
--
--   a) Es gibt schon eine Oeffnung zu einer der vier Kennenlernmails. Dann
--      passiert nichts. Eine gemessene Oeffnung wird nie ueberschrieben, und
--      genau das macht die Funktion mehrfach ausfuehrbar.
--   b) Es gibt eine Trackingzeile ohne Oeffnung. Dann bekommt die juengste
--      den Vermerk. Juengste deshalb, weil alle vier Mails denselben Link
--      tragen und die zuletzt verschickte die wahrscheinlichste ist.
--   c) Es gibt gar keine Trackingzeile. Das ist der Regelfall im Altbestand,
--      denn vor dem 14.09.2026 trug keine Bewerbermail ein Zaehlpixel. Dann
--      entsteht eine Zeile mit `tracked = false`: Diese Mail wurde nicht
--      gemessen, sie wurde nur nachweislich geoeffnet.
--
-- `_gesendet_am` ist der Zeitpunkt, an dem die Einladung entstand. Die Zeile
-- in `bewerber_formular` wird unmittelbar vor dem Versand angelegt, ihr
-- `created_at` ist deshalb der beste bekannte Zeitpunkt der Mail. Fehlt er,
-- gilt der Zeitpunkt des Ausfuellens; er ist sicher nicht frueher.
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
AS $$
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

  -- a) Schon eine Oeffnung vermerkt, gleich welcher Herkunft: nichts tun.
  IF EXISTS (
    SELECT 1 FROM public.bewerber_mail_tracking
     WHERE bewerber_id = _bewerbung_id
       AND kind = ANY(_arten)
       AND opened_at IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  -- b) Die juengste vorhandene Zeile bekommt den Vermerk.
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

  -- c) Gar keine Zeile: eine anlegen, ausdruecklich ohne Messung.
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
$$;

-- Nur die Serverseite darf ableiten. Ohne den Entzug duerfte jeder angemeldete
-- Nutzer ueber diese Funktion fremde Oeffnungen setzen; gebraucht wird sie
-- allein von `submit-bewerber-formular`, und das laeuft mit der Service-Rolle.
REVOKE ALL ON FUNCTION public.mark_bewerber_mail_opened_aus_bogen(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_bewerber_mail_opened_aus_bogen(uuid, timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.mark_bewerber_mail_opened_aus_bogen(uuid, timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_bewerber_mail_opened_aus_bogen(uuid, timestamptz, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Altbestand nachtragen
--
-- Bedingung, ohne jeden Namen: eingereichter Bogen, und zwar der
-- Kennenlernbogen und nicht der alte Vorabbogen. Erkannt wird er wie im
-- Browser und in den Functions, naemlich am Kennzeichen `bogen` oder am
-- gewaehlten Weg. Beides steht in `antworten`, egal ueber welchen Eingang der
-- Bewerber kam (Website, Zapier, Erfassung von Hand): Abgeschickt wird der
-- Bogen immer ueber denselben oeffentlichen Link.
--
-- Gibt es mehrere eingereichte Boegen, zaehlt der erste. Das ist der
-- Zeitpunkt, zu dem die Mail nachweislich offen war.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _zeile record;
  _anzahl int := 0;
BEGIN
  IF to_regclass('public.bewerber_mail_tracking') IS NULL
     OR to_regclass('public.bewerber_formular') IS NULL THEN
    RAISE NOTICE 'Tabellen fehlen, Nachtrag uebersprungen';
    RETURN;
  END IF;

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
    _anzahl := _anzahl + 1;
  END LOOP;

  RAISE NOTICE 'Oeffnung aus ausgefuelltem Bogen nachgetragen: % Bewerber', _anzahl;
END $$;

-- ===========================================================================
-- Kontrollabfragen. Sie aendern nichts.
--
-- VORHER, also vor dem Durchlauf: Wie viele Bewerber waeren betroffen?
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
-- NACHHER: dieselbe Abfrage. Erwartet wird 0.
-- ===========================================================================
