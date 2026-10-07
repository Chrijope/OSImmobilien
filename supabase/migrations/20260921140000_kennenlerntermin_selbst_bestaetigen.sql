-- Der Bewerber bestätigt seinen Kennenlerntermin selbst
--
-- Vereinbart wird der Termin seit dem 21.09.2026 über Calendly. Calendly meldet
-- uns nichts zurück, deshalb trug die HR-Managerin Datum und Uhrzeit bisher von
-- Hand im CRM nach.
--
-- Christian hat entschieden, diesen Schritt dem Bewerber zu geben: Er bucht auf
-- einer Seite im Hausstil, in der Calendly eingebettet ist, und trägt darunter
-- die gebuchte Zeit zur Bestätigung ein. Das spart der HR-Managerin das
-- Nachtragen.
--
-- Zwei Funktionen, beide ohne Anmeldung erreichbar, beide über das Token des
-- eingereichten Kennenlernbogens abgesichert. Dasselbe Token, das schon die
-- alte Buchungsstrecke benutzt hat; es gibt keinen zweiten Mechanismus.
--
-- Bewusst eng gehalten:
--   * Die Zugangsfunktion gibt nur den Vornamen und den eigenen Termin heraus.
--     Nachname, Mailadresse und alles andere bleiben drin.
--   * Die Schreibfunktion ändert genau drei Schlüssel im Meta-Feld und fasst
--     keine andere Spalte an.
--   * Ein Termin in der Vergangenheit wird abgelehnt. Wer sich vertippt, soll
--     es merken, solange er noch auf der Seite ist.

-- ── Wer bin ich, und steht mein Termin schon? ─────────────────────────────
CREATE OR REPLACE FUNCTION public.bewerber_kennenlerntermin_zugang(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bewerbung_id uuid;
  _vorname text;
  _meta jsonb;
BEGIN
  IF _token IS NULL OR btrim(_token) = '' THEN
    RETURN NULL;
  END IF;

  SELECT f.bewerbung_id INTO _bewerbung_id
    FROM public.bewerber_formular f
   WHERE f.token = _token
     AND f.status = 'eingereicht'
   ORDER BY f.created_at DESC
   LIMIT 1;

  IF _bewerbung_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT b.vorname, COALESCE(b.meta, '{}'::jsonb)
    INTO _vorname, _meta
    FROM public.bewerbungen b
   WHERE b.id = _bewerbung_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'vorname', COALESCE(_vorname, ''),
    'datum', COALESCE(_meta->>'erstgespraechDatum', ''),
    'uhrzeit', COALESCE(_meta->>'erstgespraechUhrzeit', ''),
    'quelle', COALESCE(_meta->>'erstgespraechQuelle', '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bewerber_kennenlerntermin_zugang(text) FROM public;
GRANT EXECUTE ON FUNCTION public.bewerber_kennenlerntermin_zugang(text) TO anon, authenticated;

-- ── Den bestätigten Termin eintragen ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bewerber_kennenlerntermin_eintragen(
  _token text,
  _datum text,
  _uhrzeit text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bewerbung_id uuid;
  _zeitpunkt timestamptz;
BEGIN
  IF _token IS NULL OR btrim(_token) = '' THEN
    RAISE EXCEPTION 'Kein Zugang';
  END IF;

  SELECT f.bewerbung_id INTO _bewerbung_id
    FROM public.bewerber_formular f
   WHERE f.token = _token
     AND f.status = 'eingereicht'
   ORDER BY f.created_at DESC
   LIMIT 1;

  IF _bewerbung_id IS NULL THEN
    RAISE EXCEPTION 'Kein Zugang';
  END IF;

  -- Format prüfen, bevor gerechnet wird. Ein falsch geformter Wert soll eine
  -- verständliche Meldung geben und keinen Umwandlungsfehler.
  IF _datum !~ '^\d{4}-\d{2}-\d{2}$' OR _uhrzeit !~ '^\d{2}:\d{2}$' THEN
    RAISE EXCEPTION 'Bitte Datum und Uhrzeit angeben';
  END IF;

  _zeitpunkt := (_datum || ' ' || _uhrzeit)::timestamp AT TIME ZONE 'Europe/Berlin';

  -- Eine Stunde Nachsicht: Wer direkt nach einem Termin bestätigt, der gerade
  -- erst war, soll nicht abgewiesen werden.
  IF _zeitpunkt < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'Der Termin liegt in der Vergangenheit';
  END IF;

  IF _zeitpunkt > now() + interval '1 year' THEN
    RAISE EXCEPTION 'Der Termin liegt zu weit in der Zukunft';
  END IF;

  UPDATE public.bewerbungen
     SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
           'erstgespraechDatum', _datum,
           'erstgespraechUhrzeit', _uhrzeit,
           -- Damit im Profil erkennbar bleibt, woher die Zahl stammt. Eine vom
           -- Bewerber getippte Zeit ist nicht dasselbe wie eine bestätigte
           -- Buchung, und bei einem Vertipper will man das wissen.
           'erstgespraechQuelle', 'bewerber',
           'erstgespraechBestaetigtAm', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         )
   WHERE id = _bewerbung_id;

  RETURN jsonb_build_object('datum', _datum, 'uhrzeit', _uhrzeit);
END;
$$;

REVOKE ALL ON FUNCTION public.bewerber_kennenlerntermin_eintragen(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.bewerber_kennenlerntermin_eintragen(text, text, text) TO anon, authenticated;
