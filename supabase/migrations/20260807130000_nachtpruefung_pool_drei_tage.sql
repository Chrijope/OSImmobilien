-- ===========================================================================
-- "Kontakt ohne Zuständigen": die Frist lief für Pool-Leads nie an
-- ===========================================================================
--
-- Die bisherige Bedingung lautete:
--
--     coalesce((k.meta->>'offenerLead')::boolean, false) = false
--     AND k.erstellt_am < now() - interval '2 days'
--
-- Beide Teile mussten zutreffen. `submit-lead` setzt aber bei JEDEM
-- unzugewiesenen Lead `meta.offenerLead = true`, und genau diese Leads sind
-- die, um die es geht. Der erste Teil war für sie dauerhaft falsch, die
-- Zwei-Tage-Frist lief damit nie an. Ein Lead konnte ein halbes Jahr im Pool
-- liegen, ohne je gemeldet zu werden.
--
-- Die Prüfung hat also nur Kontakte gefunden, an denen etwas lief
-- (Unterschrift, Investment, offener Termin). Die stille Mehrheit im Pool war
-- unsichtbar. Das ist die schlimmste Sorte Prüfung: Sie meldet jede Nacht
-- etwas und sieht dabei am Kern vorbei.
--
-- Neu gilt eine reine Frist, ohne Ausnahme für den Pool:
--
--     k.erstellt_am < now() - interval '3 days'
--
-- Drei Tage statt zwei, und der Grund ist das Wochenende. Ein Lead, der
-- freitagabends hereinkommt, soll nicht schon am Samstagmorgen als Befund
-- dastehen, sondern erst montagabends, also im ersten Nachtlauf, in dem
-- wirklich drei Werktage vergangen sein können.
--
-- Der zweite Zweig bleibt unverändert: Läuft an einem Kontakt bereits etwas,
-- ist "offener Lead" keine Erklärung mehr, sondern ein Versehen. Der meldet
-- weiterhin sofort.

CREATE OR REPLACE FUNCTION public.nachtpruefung_kontakt_ohne_zustaendigen(_lauf timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anzahl integer;
  v_beispiele jsonb;
BEGIN
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'name', btrim(coalesce(vorname, '') || ' ' || coalesce(nachname, '')),
           'seit', erstellt_am, 'grund', grund) ORDER BY erstellt_am), '[]'::jsonb)
    INTO v_anzahl, v_beispiele
    FROM (
      SELECT k.id, k.vorname, k.nachname, k.erstellt_am,
             CASE
               WHEN EXISTS (SELECT 1 FROM public.signature_requests s
                             WHERE s.kontakt_id = k.id AND s.status = 'pending')
                 THEN 'wartet auf eine Unterschrift'
               WHEN EXISTS (SELECT 1 FROM public.investments i WHERE i.kunde_id = k.id)
                 THEN 'hat ein laufendes Investment'
               WHEN EXISTS (SELECT 1 FROM public.buchungen b
                             WHERE b.kontakt_id = k.id AND b.status = 'offen')
                 THEN 'hat einen offenen Termin'
               ELSE 'liegt seit über drei Tagen ohne Betreuer'
             END AS grund
        FROM public.kontakte k
       WHERE k.zustaendig_id IS NULL
         AND coalesce(k.geloescht, false) = false
         AND (
           -- Entweder die Frist ist abgelaufen. Bewusst ohne Rücksicht auf
           -- `meta.offenerLead`: Der offene Pool ist ein Zwischenlager, keine
           -- Ablage. Drei Tage decken ein Wochenende ab, danach hat sich
           -- niemand gekümmert und das gehört gemeldet.
           k.erstellt_am < now() - interval '3 days'
           -- … oder es läuft etwas an diesem Kontakt. Dann ist "offener Lead"
           -- keine Erklärung mehr, sondern ein Versehen: Jemand ist mitten im
           -- Vorgang und hat niemanden, der sich kümmert.
           OR EXISTS (SELECT 1 FROM public.signature_requests s
                       WHERE s.kontakt_id = k.id AND s.status = 'pending')
           OR EXISTS (SELECT 1 FROM public.investments i WHERE i.kunde_id = k.id)
           OR EXISTS (SELECT 1 FROM public.buchungen b
                       WHERE b.kontakt_id = k.id AND b.status = 'offen')
         )
       ORDER BY k.erstellt_am
       LIMIT 10
    ) t;

  INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung, beispiele)
  VALUES (_lauf, 'kontakt_ohne_zustaendigen',
          CASE WHEN v_anzahl > 0 THEN 'warnung' ELSE 'hinweis' END, v_anzahl,
          CASE WHEN v_anzahl > 0
               THEN v_anzahl || ' Kontakt(e) haben keinen Zuständigen, obwohl sie länger als drei Tage liegen oder an ihnen bereits etwas läuft. Ohne Betreuer kümmert sich niemand, und automatische Aufgaben lassen sich nicht anlegen.'
               ELSE 'Jeder Kontakt, der länger als drei Tage liegt oder an dem etwas läuft, hat einen Zuständigen.' END,
          v_beispiele);

  RETURN v_anzahl;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.nachtpruefung_befunde (lauf_at, pruefung, schwere, anzahl, meldung)
  VALUES (_lauf, 'kontakt_ohne_zustaendigen', 'fehler', 1,
          'Die Prüfung selbst ist ausgefallen: ' || SQLERRM);
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.nachtpruefung_kontakt_ohne_zustaendigen(timestamptz) FROM anon, authenticated;

COMMENT ON FUNCTION public.nachtpruefung_kontakt_ohne_zustaendigen(timestamptz) IS
  'Teilpruefung des Nachtwaechters. Meldet unzugewiesene Kontakte, die laenger '
  'als drei Tage liegen, und zusaetzlich sofort jeden, an dem bereits etwas '
  'laeuft. Die Drei-Tage-Frist deckt ein Wochenende ab.';

-- Sofort einmal laufen lassen, damit der Rückstand aus dem Pool noch heute im
-- Bericht steht statt erst morgen früh. Der Befund des aktuellen Laufs wird
-- dabei nicht ersetzt, sondern es kommt eine zweite Zeile mit neuem
-- Zeitstempel dazu; das ist gewollt und verschwindet mit dem nächsten
-- Nachtlauf von selbst.
SELECT public.nachtpruefung_kontakt_ohne_zustaendigen(now());
