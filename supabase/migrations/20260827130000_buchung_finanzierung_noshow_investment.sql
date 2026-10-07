-- ---------------------------------------------------------------------------
-- Buchungssystem: Finanzierungsgespraech, No-Show und Investment-Bezug
-- ---------------------------------------------------------------------------
--
-- Drei Erweiterungen aus der Freigabe vom 27.08.2026:
--
--   1. Neuer Anlass 'finanzierungsgespraech' fuer Terminarten und Buchungen.
--   2. Neuer Buchungsstatus 'nicht_erschienen': Der Kunde hatte gebucht und
--      kam nicht. Der Mitarbeiter setzt ihn ueber die Ergebnis-Knoepfe im
--      Kundenprofil, die Folgekette (Inbox-Aufgabe an den Vertriebspartner)
--      laeuft im Frontend.
--   3. Persoenliche Buchungslinks tragen das Investment, zu dem der Termin
--      gehoert. Die Buchung erbt es ueber link_id, eine eigene Spalte an
--      buchungen ist dafuer nicht noetig.
--
-- Ausserdem legt die Migration fuer jeden Mitarbeiter mit Buchungskalender
-- zwei Terminarten an, Objektvorstellung und Finanzierungsgespraech, beide
-- nach den freigegebenen Werten. Idempotent: Wer eine Terminart gleichen
-- Namens schon hat, bekommt keine zweite.

-- 1) Anlass 'finanzierungsgespraech' erlauben
ALTER TABLE public.buchung_terminarten
  DROP CONSTRAINT IF EXISTS buchung_terminarten_anlass_chk;
ALTER TABLE public.buchung_terminarten
  ADD CONSTRAINT buchung_terminarten_anlass_chk
  CHECK (anlass IN ('erstgespraech', 'beratung', 'objektvorstellung', 'finanzierungsgespraech', 'sonstiges'));

ALTER TABLE public.buchungen
  DROP CONSTRAINT IF EXISTS buchungen_anlass_chk;
ALTER TABLE public.buchungen
  ADD CONSTRAINT buchungen_anlass_chk
  CHECK (anlass IN ('erstgespraech', 'beratung', 'objektvorstellung', 'finanzierungsgespraech', 'sonstiges'));

-- 2) Status 'nicht_erschienen' erlauben
ALTER TABLE public.buchungen
  DROP CONSTRAINT IF EXISTS buchungen_status_chk;
ALTER TABLE public.buchungen
  ADD CONSTRAINT buchungen_status_chk
  CHECK (status IN ('offen', 'abgesagt', 'wahrgenommen', 'nicht_erschienen'));

-- 2b) buchung_status_setzen kennt den neuen Status. Gegenueber der Fassung
--     aus 20260804180000 aendert sich nur: 'nicht_erschienen' ist erlaubt,
--     schliesst den Videoraum und hakt den Termin in der Kundenakte ab,
--     mit einem No-Show-Vermerk in der Beschreibung.
CREATE OR REPLACE FUNCTION public.buchung_status_setzen(_buchung_id uuid, _status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _buchung public.buchungen;
BEGIN
  IF _status NOT IN ('offen', 'abgesagt', 'wahrgenommen', 'nicht_erschienen') THEN
    RAISE EXCEPTION 'Unbekannter Status';
  END IF;

  SELECT * INTO _buchung FROM public.buchungen WHERE id = _buchung_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Diese Buchung gibt es nicht';
  END IF;

  IF NOT (_buchung.mitarbeiter_id = auth.uid() OR public.is_admin_role(auth.uid())) THEN
    RAISE EXCEPTION 'Keine Berechtigung fuer diese Buchung';
  END IF;

  IF _buchung.status = _status THEN
    RETURN jsonb_build_object('id', _buchung.id, 'status', _buchung.status);
  END IF;

  UPDATE public.buchungen b
  SET status = _status,
      abgesagt_at = CASE WHEN _status = 'abgesagt' THEN now() ELSE b.abgesagt_at END
  WHERE b.id = _buchung.id
  RETURNING * INTO _buchung;

  IF _status = 'abgesagt' THEN
    IF _buchung.videoraum_id IS NOT NULL THEN
      UPDATE public.videoraeume
      SET status = 'beendet'
      WHERE id = _buchung.videoraum_id
        AND status <> 'beendet';
    END IF;

    IF _buchung.aktivitaet_id IS NOT NULL THEN
      UPDATE public.aktivitaeten a
      SET erledigt_am = COALESCE(a.erledigt_am, now()),
          beschreibung = CASE
            WHEN COALESCE(a.beschreibung, '') LIKE 'Abgesagt:%' THEN a.beschreibung
            ELSE 'Abgesagt: ' || COALESCE(NULLIF(btrim(a.beschreibung), ''), 'Termin')
          END,
          details = COALESCE(a.details, '') || E'\nVom Ansprechpartner abgesagt.'
      WHERE a.id = _buchung.aktivitaet_id;
    END IF;
  END IF;

  -- Nicht erschienen: Der Termin ist vorbei, der Raum wird geschlossen und
  -- der Termin in der Akte abgehakt, damit er nicht der "naechste Termin"
  -- des Kunden bleibt. Der Vermerk macht den No-Show im Verlauf sichtbar.
  IF _status = 'nicht_erschienen' THEN
    IF _buchung.videoraum_id IS NOT NULL THEN
      UPDATE public.videoraeume
      SET status = 'beendet'
      WHERE id = _buchung.videoraum_id
        AND status <> 'beendet';
    END IF;

    IF _buchung.aktivitaet_id IS NOT NULL THEN
      UPDATE public.aktivitaeten a
      SET erledigt_am = COALESCE(a.erledigt_am, now()),
          beschreibung = CASE
            WHEN COALESCE(a.beschreibung, '') LIKE 'No-Show:%' THEN a.beschreibung
            ELSE 'No-Show: ' || COALESCE(NULLIF(btrim(a.beschreibung), ''), 'Termin')
          END
      WHERE a.id = _buchung.aktivitaet_id;
    END IF;
  END IF;

  -- Ein wahrgenommener Termin ist vorbei. Bliebe er in der Akte offen, waere
  -- er dort weiterhin der "naechste Termin" des Kunden.
  IF _status = 'wahrgenommen' AND _buchung.aktivitaet_id IS NOT NULL THEN
    UPDATE public.aktivitaeten a
    SET erledigt_am = COALESCE(a.erledigt_am, now())
    WHERE a.id = _buchung.aktivitaet_id;
  END IF;

  RETURN jsonb_build_object('id', _buchung.id, 'status', _buchung.status);
END;
$$;

REVOKE ALL ON FUNCTION public.buchung_status_setzen(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.buchung_status_setzen(uuid, text) TO authenticated;

-- 3) Investment am persoenlichen Buchungslink
ALTER TABLE public.buchung_links
  ADD COLUMN IF NOT EXISTS investment_id uuid REFERENCES public.investments(id) ON DELETE SET NULL;

-- 4) Terminarten Objektvorstellung und Finanzierungsgespraech anlegen.
--    Fuer jeden Mitarbeiter, der den Buchungskalender schon nutzt (eine
--    Einstellungszeile hat), und nur, wenn er die Terminart nicht schon
--    selbst angelegt hat. Werte laut Freigabe: 60 Minuten, 15 Minuten
--    Puffer danach, fruehestens in 4 Stunden buchbar, 60 Tage im Voraus.
INSERT INTO public.buchung_terminarten
  (mitarbeiter_id, bezeichnung, beschreibung, dauer_minuten,
   puffer_vor_minuten, puffer_nach_minuten, vorlauf_minuten,
   vorausschau_tage, raster_minuten, aktiv, oeffentlich, anlass, sortierung)
SELECT
  e.mitarbeiter_id,
  'Objektvorstellung',
  'Wir stellen dir deine passende Immobilie im Detail vor: Lage, Objekt, Zahlen und Unterlagen. Am Ende weißt du genau, was du kaufst und wie es weitergeht.',
  60, 0, 15, 240, 60, 15, true, false, 'objektvorstellung',
  COALESCE((SELECT MAX(t.sortierung) FROM public.buchung_terminarten t WHERE t.mitarbeiter_id = e.mitarbeiter_id), 0) + 1
FROM public.buchung_einstellungen e
WHERE NOT EXISTS (
  SELECT 1 FROM public.buchung_terminarten t
  WHERE t.mitarbeiter_id = e.mitarbeiter_id AND lower(t.bezeichnung) = 'objektvorstellung'
);

INSERT INTO public.buchung_terminarten
  (mitarbeiter_id, bezeichnung, beschreibung, dauer_minuten,
   puffer_vor_minuten, puffer_nach_minuten, vorlauf_minuten,
   vorausschau_tage, raster_minuten, aktiv, oeffentlich, anlass, sortierung)
SELECT
  e.mitarbeiter_id,
  'Finanzierungsgespräch',
  'Wir besprechen deine Finanzierung: den Rahmen, die Konditionen und die Unterlagen für die Bank. Danach stehen die nächsten Schritte bis zur Zusage fest.',
  60, 0, 15, 240, 60, 15, true, false, 'finanzierungsgespraech',
  COALESCE((SELECT MAX(t.sortierung) FROM public.buchung_terminarten t WHERE t.mitarbeiter_id = e.mitarbeiter_id), 0) + 2
FROM public.buchung_einstellungen e
WHERE NOT EXISTS (
  SELECT 1 FROM public.buchung_terminarten t
  WHERE t.mitarbeiter_id = e.mitarbeiter_id AND lower(t.bezeichnung) = 'finanzierungsgespräch'
);
