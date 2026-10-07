-- ===========================================================================
-- Die persönliche Seite des Bewerbers
-- ===========================================================================
--
-- „Die Änderung wirkt unauffällig und verändert im Betrieb am meisten." Bisher
-- trug die Eingangsmail den ganzen Prozess allein: Landet sie im Spam, ist der
-- Fall still verloren. Diese Migration gibt jedem Bewerber ab dem Eingang
-- seiner Bewerbung eine eigene Adresse, unter der er in jedem Zustand dieselben
-- drei Fragen beantwortet bekommt:
--
--   Was ist erledigt?   Wer ist gerade am Zug?   Was kann ich als Nächstes tun?
--
-- Wer am Zug ist, wird aus dem tatsächlichen Vorgang abgeleitet und nicht aus
-- der Pipelinestufe. Deshalb kann MOREImmo am Zug sein, obwohl der Bewerber
-- formal noch in der Stufe Eingang steht. Die Ableitung selbst steht in
-- `supabase/functions/_shared/bewerber-seite.ts`, damit sie geprüft werden
-- kann; diese Datei liefert nur die Tatsachen.
--
-- ── Aufbau, nach dem Muster von `bewerber_formular` und `bewerber_abmeldung` ──
--
--   token       32 Byte Zufall als Hex, nicht ableitbar, ohne Personenbezug.
--   bewerbung_id genau eine Seite je Bewerber, deshalb eindeutig.
--   expires_at  365 Tage. Die Seite begleitet den ganzen Weg bis zum Start,
--               deshalb deutlich länger als die 14 Tage des Kennenlernens.
--
-- Zugriffsschutz wie bei `bewerber_abmeldung`, also in der engen Fassung:
-- Weder `anon` noch `authenticated` haben direkten Tabellenzugriff. Gelesen
-- wird ausschließlich über `get_bewerber_seite(token)`, geschrieben nur über
-- Edge Functions mit der Service-Rolle.
--
-- ── Was ohne diese Migration passiert ──
--
-- Nichts Schlimmes. `get_bewerber_seite` fehlt, die Seite meldet „Diesen Link
-- kennen wir nicht" und der übrige Bewerberprozess läuft unverändert weiter.
-- Die Erfolgsseite der Bewerbung zeigt dann ihren bisherigen Text ohne den
-- Knopf zur persönlichen Seite. Erst nach dem Lauf im SQL-Editor entsteht die
-- Seite.

CREATE TABLE IF NOT EXISTS public.bewerber_seite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  bewerbung_id uuid NOT NULL UNIQUE REFERENCES public.bewerbungen(id) ON DELETE CASCADE,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  letzter_zugriff_am timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '365 days')
);

COMMENT ON TABLE public.bewerber_seite IS
  'Zugangscodes für die persönliche Bewerberseite. Lesen nur über get_bewerber_seite, Schreiben nur über Edge Functions mit Service-Rolle.';

ALTER TABLE public.bewerber_seite ENABLE ROW LEVEL SECURITY;

-- Keine einzige Policy: Kein angemeldeter Nutzer liest oder schreibt hier
-- direkt. Die Service-Rolle umgeht die Zeilensicherheit ohnehin.
REVOKE ALL ON public.bewerber_seite FROM anon, authenticated;

-- ── Die Seiten der Bewerber, die es schon gibt ──
--
-- Ohne diesen Nachtrag hätte nur der nächste Neuzugang eine Seite. Stellen und
-- Termine liegen in derselben Tabelle und tragen ein eigenes `_type`; sie
-- fallen durch die Bedingung heraus, genau wie in `isBewerberRow`
-- (src/lib/bewerbungStore.ts).

INSERT INTO public.bewerber_seite (bewerbung_id)
SELECT b.id
  FROM public.bewerbungen b
 WHERE COALESCE(b.meta ->> '_type', 'bewerber') = 'bewerber'
ON CONFLICT (bewerbung_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Lesen für die öffentliche Seite
-- ---------------------------------------------------------------------------
--
-- Was hier bewusst NICHT herausgegeben wird, ist die halbe Entscheidung:
--
--   * keine Pipelinestufe. Die Seite zeigt vier Stationen und nicht die zehn
--     Stufen des CRM. Statt der Stufe gehen drei grobe Merkmale hinaus.
--   * keine Bewertung, kein Score, keine interne Notiz, kein Nachname,
--     keine Mailadresse, keine Bewerbungs-Kennung.
--   * die Zusammenfassung des Gesprächs nur, wenn sie ausdrücklich
--     freigegeben wurde. Ohne Freigabe geht nichts raus, und die Freigabe ist
--     ein eigenes Feld und nicht das Vorhandensein eines Textes.
--
-- Wer ein Token errät, sieht damit einen Vornamen und ein paar Daten.

CREATE OR REPLACE FUNCTION public.get_bewerber_seite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bewerbung uuid;
  _vorname text;
  _status text;
  _meta jsonb;
  _kennen jsonb;
  -- Bewusst einzelne Variablen statt eines record: Findet die Abfrage keinen
  -- Bogen, bleiben sie schlicht NULL. Ein record ohne Zeile ist eine Falle,
  -- die erst zur Laufzeit auffaellt.
  _bogen_token text;
  _bogen_status text;
  _bogen_ablauf timestamptz;
  _bogen_eingereicht timestamptz;
  _bogen_antworten jsonb;
  _freigabe text;
BEGIN
  -- Formfehler früh abweisen, damit ein Tippfehler keine Abfrage auslöst.
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT s.bewerbung_id INTO _bewerbung
    FROM public.bewerber_seite s
   WHERE s.token = _token
     AND s.expires_at > now();

  /*
   * Der zweite gültige Zugang: das Token des Kennenlernens.
   *
   * Es ist genauso lang und genauso zufällig, es gehört demselben Menschen,
   * und es steht in einer Mail, die er schon hat. Ohne diesen Weg müsste jeder
   * Bewerber aus der Zeit vor dieser Migration auf eine neue Mail warten, um
   * seine Seite überhaupt zu finden.
   */
  IF _bewerbung IS NULL THEN
    SELECT f.bewerbung_id INTO _bewerbung
      FROM public.bewerber_formular f
     WHERE f.token = _token;
  END IF;

  IF _bewerbung IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT b.vorname, COALESCE(b.status, ''), COALESCE(b.meta, '{}'::jsonb)
    INTO _vorname, _status, _meta
    FROM public.bewerbungen b
   WHERE b.id = _bewerbung;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Ein Lebenszeichen, nur für das Aufräumen. Best-Effort, ohne eigene Zeile
  -- schlägt nichts fehl.
  UPDATE public.bewerber_seite
     SET letzter_zugriff_am = now()
   WHERE bewerbung_id = _bewerbung;

  _kennen := COALESCE(_meta -> 'kennenlernen', '{}'::jsonb);

  /*
   * Der Bogen: der offene zuerst, sonst der jüngste. Ein eingereichter Bogen
   * hat keinen offenen Nachfolger, deshalb greift die zweite Bedingung.
   */
  SELECT f.token, f.status, f.expires_at, f.eingereicht_am, COALESCE(f.antworten, '{}'::jsonb)
    INTO _bogen_token, _bogen_status, _bogen_ablauf, _bogen_eingereicht, _bogen_antworten
    FROM public.bewerber_formular f
   WHERE f.bewerbung_id = _bewerbung
   ORDER BY (f.status = 'offen') DESC, f.created_at DESC
   LIMIT 1;

  _freigabe := COALESCE(_kennen ->> 'zusammenfassungFreigabeAm', '');

  RETURN jsonb_build_object(
    'vorname', COALESCE(_vorname, ''),
    'beworben_am', COALESCE(_meta ->> 'beworben', ''),

    /*
     * Drei grobe Merkmale statt der Pipelinestufe. Die Seite zeigt keine
     * Stufe, und was sie nicht zeigt, braucht sie auch nicht zu bekommen.
     */
    'beendet', (_status IN ('KeinInteresse', 'Abgelehnt')),
    'beendet_durch', CASE
      WHEN _status NOT IN ('KeinInteresse', 'Abgelehnt') THEN ''
      WHEN COALESCE(_meta ->> 'selbstAbgemeldetAm', '') <> ''
        OR COALESCE(_kennen ->> 'ausstiegAm', '') <> '' THEN 'bewerber'
      ELSE 'moreimmo'
    END,
    'zugesagt', (_status IN ('Vertrag', 'Rechnung', 'Nutzer_anlegen', 'Aktiv')),

    'kennenlernen', jsonb_build_object(
      'token', COALESCE(_bogen_token, ''),
      'status', COALESCE(_bogen_status, ''),
      'laeuft_ab_am', _bogen_ablauf,
      'eingereicht_am', _bogen_eingereicht,
      -- „Angefangen" heißt: im Bogen steht mehr als das Kennzeichen, das
      -- `send-bewerber-kennenlernen` beim Anlegen hineinschreibt.
      'angefangen', (COALESCE(_bogen_antworten, '{}'::jsonb) - 'bogen') <> '{}'::jsonb,
      'gesendet_am', COALESCE(_kennen ->> 'gesendetAm', '')
    ),

    'termin', jsonb_build_object(
      'datum', COALESCE(_meta ->> 'erstgespraechDatum', ''),
      'uhrzeit', COALESCE(_meta ->> 'erstgespraechUhrzeit', ''),
      'berater', COALESCE(_meta ->> 'erstgespraechBerater', ''),
      'gefuehrt_am', COALESCE(_meta -> 'erstgespraechSkript' ->> 'durchgefuehrtAm', '')
    ),

    /*
     * Ohne Freigabe geht nichts raus. Das ist keine Vorsicht, sondern die
     * Regel aus Moment 7: „Ohne Freigabe geht keine maschinell erzeugte
     * Zusammenfassung raus." Solange im CRM niemand freigegeben hat, bleibt
     * dieser Block leer, und die Seite zeigt nur, dass das Gespräch lief.
     */
    'entscheidung', CASE WHEN _freigabe = '' THEN '{}'::jsonb ELSE jsonb_build_object(
      'freigegeben_am', _freigabe,
      'text', COALESCE(_kennen ->> 'zusammenfassungText', ''),
      'einschaetzung', COALESCE(_kennen ->> 'einschaetzung', ''),
      'offener_punkt', COALESCE(_kennen -> 'offenerPunkt', '{}'::jsonb)
    ) END,

    'start', jsonb_build_object(
      'vertrag_status', COALESCE(_meta ->> 'vertragStatus', ''),
      'vertrag_unterschrieben_am', COALESCE(_meta ->> 'vertragSignedAt', ''),
      'aktiv_am', COALESCE(_meta ->> 'aktivAm', ''),
      'servicevereinbarung', COALESCE(_meta ->> 'paketwahl', '')
    ),

    'pause', COALESCE(_kennen -> 'pause', '{}'::jsonb),
    'frage', COALESCE(_kennen -> 'frage', '{}'::jsonb),
    'anruf_widersprochen', COALESCE((_kennen ->> 'anrufWidersprochen')::boolean, false)
  );
END $$;

REVOKE ALL ON FUNCTION public.get_bewerber_seite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_bewerber_seite(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_bewerber_seite(text) IS
  'Öffentliche Leseabfrage der persönlichen Bewerberseite. Ohne Pipelinestufe, ohne Bewertung, ohne interne Notizen. Die Zusammenfassung nur nach ausdrücklicher Freigabe.';

-- ---------------------------------------------------------------------------
-- Aufräumen
-- ---------------------------------------------------------------------------
--
-- Eine Zeile trägt nur ein Token und eine Bewerbungs-Kennung. Sie verschwindet
-- mit dem Bewerber (ON DELETE CASCADE) und ansonsten 30 Tage nach Ablauf.

CREATE OR REPLACE FUNCTION public.bewerber_seite_aufraeumen()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _anzahl integer;
BEGIN
  DELETE FROM public.bewerber_seite
   WHERE expires_at < now() - interval '30 days';

  GET DIAGNOSTICS _anzahl = ROW_COUNT;
  RETURN _anzahl;
END $$;

REVOKE ALL ON FUNCTION public.bewerber_seite_aufraeumen() FROM public, anon, authenticated;

COMMENT ON FUNCTION public.bewerber_seite_aufraeumen() IS
  'Löscht Zugangscodes der Bewerberseite 30 Tage nach ihrem Ablauf.';

-- Wöchentlich, sonntags um 4:10 Uhr UTC. Bewusst zehn Minuten versetzt zum
-- Aufräumen der Abmelde-Token, damit nicht zwei Läufe dieselbe Tabelle sperren.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bewerber-seite-aufraeumen') THEN
      PERFORM cron.unschedule('bewerber-seite-aufraeumen');
    END IF;
    PERFORM cron.schedule('bewerber-seite-aufraeumen', '10 4 * * 0',
                          'SELECT public.bewerber_seite_aufraeumen();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan fuers Aufraeumen nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;
