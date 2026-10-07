-- ===========================================================================
-- Handbuch-Seite: Anforderungen, öffentlicher Abruf per Token, Trichter
-- ===========================================================================
--
-- Zur neuen Landingpage mit Konfigurator und persönlichem Immobilienhandbuch
-- (Strategie „Handbuch-Funnel für MOREImmo“ vom 26.09.2026, Auftrag vom
-- selben Tag).
--
-- WAS DIESE MIGRATION ANLEGT
--
--   1. Tabelle `handbuch_anforderungen`: je abgeschicktem Konfigurator eine
--      Zeile mit den sechs Antworten, dem Ausgang, dem persönlichen Token des
--      Handbuchs und dem Token der Selbstauskunft. Geschrieben wird sie nur
--      von `submit-lead` mit dem Dienstschlüssel.
--   2. Funktion `handbuch_abrufen(_token)`: die einzige Tür für Besucher ohne
--      Anmeldung. Sie gibt zu einem gültigen Token genau das zurück, was die
--      Ergebnisseite braucht, und zählt das Öffnen. Keine E-Mail, keine
--      Telefonnummer, keine Kennung des Kontakts.
--   3. Funktion `handbuch_kennzahlen(p_tage, p_berater_id)`: die kleine
--      Übersicht der Verwaltungsseite. Admin und Inhaber sehen alles, jeder
--      andere nur die eigenen Zahlen.
--   4. Trichterzählung: `analysetool_ereignisse` lernt das Werkzeug
--      „handbuch“ und dessen Stufen.
--
-- ZUGRIFF
--
-- Die Tabelle hat Zeilensicherheit von Anfang an. Lesen dürfen Admin und
-- Inhaber alles, ein Partner nur die Anforderungen über seinen eigenen Link
-- (`berater_id`). Schreiben darf niemand außer dem Dienstschlüssel. Für
-- `anon` gibt es keine Regel, Besucher kommen nur über `handbuch_abrufen`.
--
-- OHNE DIESE MIGRATION
--
-- Die Seite läuft trotzdem: Der Lead entsteht, das Handbuch erscheint sofort
-- online und als PDF, weil der Browser es aus den Antworten selbst rechnet.
-- Es fehlen nur der Link in der Mail (die Mail geht dann nicht raus), die
-- Zählung und die Übersicht in der Verwaltung, die dort „Migration
-- ausstehend“ anzeigt.
--
-- Wiederholbar: IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tabelle
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.handbuch_anforderungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  kontakt_id uuid NOT NULL REFERENCES public.kontakte(id) ON DELETE CASCADE,
  investment_id uuid,
  berater_id uuid,
  vorname text NOT NULL DEFAULT '',
  nachname text NOT NULL DEFAULT '',
  antworten jsonb NOT NULL,
  ausgang text NOT NULL,
  sa_token text,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  gueltig_bis timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  geoeffnet_am timestamptz,
  zuletzt_geoeffnet_am timestamptz,
  geoeffnet_anzahl integer NOT NULL DEFAULT 0,
  mail_gesendet_am timestamptz
);

ALTER TABLE public.handbuch_anforderungen
  DROP CONSTRAINT IF EXISTS handbuch_anforderungen_token_check;
ALTER TABLE public.handbuch_anforderungen
  ADD CONSTRAINT handbuch_anforderungen_token_check CHECK (token ~ '^[0-9a-f]{64}$');

ALTER TABLE public.handbuch_anforderungen
  DROP CONSTRAINT IF EXISTS handbuch_anforderungen_ausgang_check;
ALTER TABLE public.handbuch_anforderungen
  ADD CONSTRAINT handbuch_anforderungen_ausgang_check CHECK (ausgang IN ('passt', 'vielleicht', 'noch_nicht'));

CREATE INDEX IF NOT EXISTS handbuch_anforderungen_kontakt_idx ON public.handbuch_anforderungen (kontakt_id);
CREATE INDEX IF NOT EXISTS handbuch_anforderungen_berater_idx ON public.handbuch_anforderungen (berater_id, erstellt_am DESC);
CREATE INDEX IF NOT EXISTS handbuch_anforderungen_zeit_idx ON public.handbuch_anforderungen (erstellt_am DESC);

COMMENT ON TABLE public.handbuch_anforderungen IS
  'Handbuch-Seite: je abgeschicktem Konfigurator eine Zeile. Schreibt nur submit-lead (Dienstschluessel). Besucher lesen nur ueber handbuch_abrufen(token). Migration 20260926170000.';

ALTER TABLE public.handbuch_anforderungen ENABLE ROW LEVEL SECURITY;

-- Keine Rechte fuer Besucher ohne Anmeldung, auch nicht versehentlich ueber
-- Standardrechte des Schemas.
REVOKE ALL ON public.handbuch_anforderungen FROM anon;

DROP POLICY IF EXISTS handbuch_anforderungen_lesen ON public.handbuch_anforderungen;
CREATE POLICY handbuch_anforderungen_lesen
  ON public.handbuch_anforderungen
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'inhaber'::public.app_role)
    OR berater_id = auth.uid()
  );

-- Anlegen, Aendern und Loeschen nur mit dem Dienstschluessel. Dafuer gibt es
-- bewusst keine Regel.

-- ---------------------------------------------------------------------------
-- 2. Oeffentlicher Abruf per Token
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handbuch_abrufen(_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _z public.handbuch_anforderungen%ROWTYPE;
  _slug text;
  _sa_status text;
  _sa_ablauf timestamptz;
BEGIN
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO _z FROM public.handbuch_anforderungen WHERE token = _token LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF _z.gueltig_bis < now() THEN
    RETURN jsonb_build_object('abgelaufen', true, 'vorname', _z.vorname);
  END IF;

  UPDATE public.handbuch_anforderungen
     SET geoeffnet_am = coalesce(geoeffnet_am, now()),
         zuletzt_geoeffnet_am = now(),
         geoeffnet_anzahl = geoeffnet_anzahl + 1
   WHERE id = _z.id;

  IF _z.berater_id IS NOT NULL THEN
    SELECT p.vp_slug INTO _slug
      FROM public.profiles p
     WHERE p.id = _z.berater_id
       AND coalesce(p.gesperrt, false) = false;
  END IF;

  IF _z.sa_token IS NOT NULL THEN
    SELECT t.status, t.expires_at INTO _sa_status, _sa_ablauf
      FROM public.sa_fill_tokens t
     WHERE t.token = _z.sa_token
     LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'abgelaufen', false,
    'vorname', _z.vorname,
    'nachname', _z.nachname,
    'antworten', _z.antworten,
    'ausgang', _z.ausgang,
    'erstelltAm', _z.erstellt_am,
    'gueltigBis', _z.gueltig_bis,
    'beraterSlug', _slug,
    -- Der Link zur Selbstauskunft nur, solange er offen und gueltig ist.
    'saToken', CASE WHEN _sa_status = 'pending' AND _sa_ablauf > now() THEN _z.sa_token ELSE NULL END,
    'saStatus', CASE
                  WHEN _z.sa_token IS NULL THEN NULL
                  WHEN _sa_status = 'used' THEN 'ausgefuellt'
                  WHEN _sa_ablauf IS NOT NULL AND _sa_ablauf <= now() THEN 'abgelaufen'
                  WHEN _sa_status = 'pending' THEN 'offen'
                  ELSE NULL
                END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.handbuch_abrufen(text) FROM public;
GRANT EXECUTE ON FUNCTION public.handbuch_abrufen(text) TO anon, authenticated;

COMMENT ON FUNCTION public.handbuch_abrufen(text) IS
  'Handbuch-Seite: liefert zu einem gueltigen Token Vorname, Antworten, Ausgang, Partnerkuerzel und den offenen Selbstauskunft-Link; zaehlt das Oeffnen. Einzige Tuer fuer Besucher. Migration 20260926170000.';

-- ---------------------------------------------------------------------------
-- 3. Trichterzaehlung: Werkzeug "handbuch" und seine Stufen
-- ---------------------------------------------------------------------------
-- Die Stufen des Handbuchs bekommen eigene Namen mit "hb_" vorn. Die vier
-- bisherigen bleiben unveraendert, damit die Auswertungen von Analysetool und
-- Steuerrechner nichts davon merken.
ALTER TABLE public.analysetool_ereignisse
  DROP CONSTRAINT IF EXISTS analysetool_ereignisse_typ_check;
ALTER TABLE public.analysetool_ereignisse
  ADD CONSTRAINT analysetool_ereignisse_typ_check CHECK (typ IN (
    'analyse_gestartet',
    'analyse_beendet',
    'eintragung_gesehen',
    'eintragung_abgesendet',
    'hb_seite_geoeffnet',
    'hb_konfigurator_gestartet',
    'hb_frage_1',
    'hb_frage_2',
    'hb_frage_3',
    'hb_frage_4',
    'hb_frage_5',
    'hb_frage_6',
    'hb_ausgang_passt',
    'hb_ausgang_vielleicht',
    'hb_ausgang_noch_nicht',
    'hb_handbuch_erhalten',
    'hb_handbuch_geoeffnet',
    'hb_pdf_geladen',
    'hb_sa_gestartet',
    'hb_sa_abgeschickt'
  ));

ALTER TABLE public.analysetool_ereignisse
  DROP CONSTRAINT IF EXISTS analysetool_ereignisse_werkzeug_check;
ALTER TABLE public.analysetool_ereignisse
  ADD CONSTRAINT analysetool_ereignisse_werkzeug_check
  CHECK (werkzeug IN ('analysetool', 'steuerrechner', 'handbuch'));

-- ---------------------------------------------------------------------------
-- 4. Kennzahlen fuer die Verwaltungsseite
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handbuch_kennzahlen(
  p_tage integer DEFAULT 90,
  p_berater_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ich uuid := auth.uid();
  _alles boolean;
  _berater uuid;
  _seit timestamptz := now() - make_interval(days => greatest(coalesce(p_tage, 90), 1));
  _ereignisse jsonb;
  _anforderungen jsonb;
BEGIN
  IF _ich IS NULL THEN
    RETURN NULL;
  END IF;

  _alles := public.has_role(_ich, 'admin'::public.app_role) OR public.has_role(_ich, 'inhaber'::public.app_role);
  -- Wer nicht Admin oder Inhaber ist, sieht nur die eigenen Zahlen, egal
  -- was als Parameter kommt.
  _berater := CASE WHEN _alles THEN p_berater_id ELSE _ich END;

  SELECT coalesce(jsonb_object_agg(typ, anzahl), '{}'::jsonb) INTO _ereignisse
    FROM (
      SELECT e.typ, count(*) AS anzahl
        FROM public.analysetool_ereignisse e
       WHERE e.werkzeug = 'handbuch'
         AND e.erstellt_am >= _seit
         AND (_berater IS NULL OR e.berater_id = _berater)
       GROUP BY e.typ
    ) x;

  SELECT jsonb_build_object(
           'gesamt', count(*),
           'passt', count(*) FILTER (WHERE h.ausgang = 'passt'),
           'vielleicht', count(*) FILTER (WHERE h.ausgang = 'vielleicht'),
           'nochNicht', count(*) FILTER (WHERE h.ausgang = 'noch_nicht'),
           'geoeffnet', count(*) FILTER (WHERE h.geoeffnet_am IS NOT NULL),
           'ueberPartner', count(*) FILTER (WHERE h.berater_id IS NOT NULL),
           'ueberFirma', count(*) FILTER (WHERE h.berater_id IS NULL),
           'saAusgefuellt', count(*) FILTER (WHERE t.status = 'used')
         )
    INTO _anforderungen
    FROM public.handbuch_anforderungen h
    LEFT JOIN public.sa_fill_tokens t ON t.token = h.sa_token
   WHERE h.erstellt_am >= _seit
     AND (_berater IS NULL OR h.berater_id = _berater);

  RETURN jsonb_build_object('ereignisse', _ereignisse, 'anforderungen', _anforderungen, 'tage', greatest(coalesce(p_tage, 90), 1));
END;
$$;

REVOKE ALL ON FUNCTION public.handbuch_kennzahlen(integer, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.handbuch_kennzahlen(integer, uuid) TO authenticated;

COMMENT ON FUNCTION public.handbuch_kennzahlen(integer, uuid) IS
  'Handbuch-Seite: Trichter und Anforderungen der letzten Tage. Admin/Inhaber alles oder je Partner, alle anderen nur die eigenen. Migration 20260926170000.';

COMMIT;

-- ---------------------------------------------------------------------------
-- 5. Zwei-Faktor-Regel fuer die neue Tabelle (falls vorhanden)
-- ---------------------------------------------------------------------------
-- Seit 20260925200000 bekommt jede Tabelle mit Zeilensicherheit eine
-- RESTRICTIVE Regel fuer Kunden mit Zwei-Faktor. Neue Tabellen bekommen sie
-- erst mit einem erneuten Aufruf. Kunden lesen diese Tabelle ohnehin nicht,
-- die Regel haelt nur die Pruefzeile 11.3 gruen.
DO $$
BEGIN
  IF to_regprocedure('public.kunden_zwei_faktor_regeln_anlegen()') IS NOT NULL THEN
    PERFORM public.kunden_zwei_faktor_regeln_anlegen();
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- PRUEFEN (Lesen, aendert nichts)
-- ---------------------------------------------------------------------------
--   select to_regclass('public.handbuch_anforderungen') is not null as tabelle,
--          to_regprocedure('public.handbuch_abrufen(text)') is not null as abruf,
--          to_regprocedure('public.handbuch_kennzahlen(integer,uuid)') is not null as kennzahlen;
--   select public.handbuch_abrufen('x');   -- ergibt NULL
