-- Videoraum: Der Warteraum wird technisch erzwungen, dazu Notiz und Warteplatz.
--
-- Bisher hing der Signalkanal allein am Raumtoken. Der steht im Link, den der
-- Kunde bekommt. Wer ihn hatte, konnte sich mit dem oeffentlichen Anon-
-- Schluessel in den Kanal einhaengen, ohne je eingelassen worden zu sein.
-- Beide Seiten versprechen aber "Erst mit dem Einlassen beginnt die
-- Videoverbindung".
--
-- Deshalb bekommt der Raum ein zweites Geheimnis, das nicht im Link steht und
-- den Kanalnamen bildet. Der Gastgeber erneuert es beim Einlassen, und die
-- Datenbank gibt es ausschliesslich an einen Gast heraus, der bereits
-- eingelassen ist (`videoraum_gast_status` weiter unten).
--
-- Was damit NICHT geloest ist: Supabase Realtime prueft ohne "Realtime
-- Authorization" (RLS auf `realtime.messages`) nicht, wer einen Broadcast-
-- Kanal betritt. Die Sperre ist also die Unkenntnis des Namens, keine
-- serverseitige Pruefung. Wer das Geheimnis einmal kennt, kommt bis zur
-- naechsten Erneuerung wieder in denselben Kanal. Dicht wird es erst mit
-- Realtime Authorization oder einem eigenen Signalserver.

-- ---------------------------------------------------------------------------
-- 1) Neue Spalten
-- ---------------------------------------------------------------------------

ALTER TABLE public.videoraeume
  ADD COLUMN IF NOT EXISTS signal_geheimnis text,
  -- Notiz des Gastgebers zum Gespraech. Auf der Gastgeberseite stand ein Feld,
  -- das nichts gespeichert hat.
  ADD COLUMN IF NOT EXISTS notiz text;

-- Es gibt keine Mitschrift. Solange das so ist, wird auch keine Einwilligung
-- dafuer eingeholt, und neue Raeume starten mit "nicht angeboten". Die Spalte
-- bleibt stehen, damit die Mitschrift spaeter ohne Umbau zurueckkommt.
-- Bestandsraeume bleiben unangetastet, das Feld wird nirgends mehr gelesen.
ALTER TABLE public.videoraeume
  ALTER COLUMN transkript_angeboten SET DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2) Statusabfrage des Gastes
-- ---------------------------------------------------------------------------
--
-- Drei Angaben kommen dazu:
--
--   * `signal_geheimnis` nur fuer Eingelassene. Wer im Warteraum steht,
--     bekommt NULL und kann den Kanal nicht einmal benennen.
--   * `warteposition`: der wievielte Wartende dieser Gast ist. Es kann immer
--     nur eine Person im Gespraech sein, deshalb soll er sehen, dass er nicht
--     vergessen wurde.
--   * `gespraech_laeuft`: sitzt gerade jemand anderes drin.

CREATE OR REPLACE FUNCTION public.videoraum_gast_status(_gast_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'status', t.status,
    'raum_status', r.status,
    'name', t.name,
    'teilnehmer_id', t.id,
    'signal_geheimnis', CASE
      WHEN t.status IN ('eingelassen', 'im_gespraech') THEN r.signal_geheimnis
      ELSE NULL
    END,
    'warteposition', (
      SELECT count(*)
      FROM public.videoraum_teilnehmer w
      WHERE w.raum_id = t.raum_id
        AND w.status = 'wartet'
        AND w.beigetreten_at <= t.beigetreten_at
    ),
    'gespraech_laeuft', EXISTS (
      SELECT 1
      FROM public.videoraum_teilnehmer d
      WHERE d.raum_id = t.raum_id
        AND d.id <> t.id
        AND d.status IN ('eingelassen', 'im_gespraech')
    )
  )
  FROM public.videoraum_teilnehmer t
  JOIN public.videoraeume r ON r.id = t.raum_id
  WHERE t.gast_token = _gast_token
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.videoraum_gast_status(text) FROM public;
GRANT EXECUTE ON FUNCTION public.videoraum_gast_status(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Die oeffentliche Raumansicht gibt das Geheimnis nicht heraus
-- ---------------------------------------------------------------------------
--
-- `videoraum_ansicht` waehlt die Felder einzeln aus, das neue ist also nicht
-- dabei. Hier steht sie nur noch einmal unveraendert, damit beim Lesen der
-- Migration keine Frage offenbleibt, ob das Geheimnis versehentlich mit
-- hinausgeht. Ohne Beitritt bekommt der Gast weiterhin genau diese Felder.
CREATE OR REPLACE FUNCTION public.videoraum_ansicht(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'art', r.art,
    'titel', r.titel,
    'status', r.status,
    'termin_at', r.termin_at,
    'dauer_minuten', r.dauer_minuten,
    'agenda', r.agenda,
    'hinweis', r.hinweis,
    'transkript_angeboten', r.transkript_angeboten,
    'gastgeber', r.gastgeber_snapshot,
    'objekt', COALESCE(r.meta -> 'objekt', '{}'::jsonb)
  )
  FROM public.videoraeume r
  WHERE r.token = _token
    AND r.expires_at > now()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.videoraum_ansicht(text) FROM public;
GRANT EXECUTE ON FUNCTION public.videoraum_ansicht(text) TO anon, authenticated;
