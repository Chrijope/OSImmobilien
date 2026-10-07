-- ===========================================================================
-- Datenkorrektur: Provisionssaetze im Bestand nach der Regel ab Reservierung
-- ===========================================================================
--
-- CHRISTIANS ENTSCHEIDUNG (29.09.2026)
--
-- Seit 20260929140000 gilt: festgeschrieben wird ab Reservierung, mit dem
-- Satz des aktuell zugewiesenen Partners. Der Bestand passt dazu noch nicht.
--
-- "Alt" ist jeder Satz ohne lockedProvisionRateAnlass. Das sind die im Juni
-- und Juli 2026 vom Browser geschriebenen (ohne Quelle) und alle, die der
-- INSERT-Trigger bis 20260928180000 mit Quelle 'serverseitig' geschrieben
-- hat. Nur 20260929140000 schreibt den Anlass.
--
-- Diese Migration zieht den Bestand in drei Faellen nach:
--
--   1. Vorgaenge VOR der Kaufphase mit altem Satz: Der Satz wird entfernt,
--      damit er bei der Reservierung neu und richtig gesetzt wird.
--      Endzustaende (verloren, archiviert, bestandsimport) bleiben.
--   2. Vorgaenge IN der Kaufphase mit altem Satz, auch die abgeschlossenen
--      (noch nicht ausgezahlt): Der Satz des aktuell zugewiesenen Partners
--      wird festgeschrieben, Quelle 'nachgetragen'.
--   3. Vorgaenge IN der Kaufphase ganz ohne Satz: ebenso. Danach sind alle
--      Vorgaenge ab Reservierung einheitlich.
--
-- Nicht angefasst, nur gezaehlt: Investments mit einem Fehlervermerk
-- (lockedProvisionRateFehler) und Investments in der Kaufphase, zu denen kein
-- Partner oder kein Satz ermittelbar ist.
--
-- WIE
--
-- Diese Migration rechnet keinen Satz selbst. Sie gibt dem Trigger aus
-- 20260929140000 einen Auftrag ('verwerfen' bzw. 'nachtrag'), und der
-- ermittelt den Satz mit derselben Funktion (provisionssatz_ermitteln) und
-- derselben Eigen-/Zugewiesen-Logik wie bei jeder Reservierung. Der Trigger
-- nimmt Auftraege nur ohne angemeldeten Nutzer an, also im SQL-Editor. Eine
-- Gegenprobe am Ende bricht alles ab, wenn er sie nicht angenommen hat; dann
-- ist nichts geaendert. Das Ergebnis steht als Tabelle ganz unten.
--
-- REIHENFOLGE
--
-- Erst 20260929140000_provisionssatz_ab_reservierung.sql, dann diese Datei.
-- Die Pruefung unten bricht ab, wenn die Mechanik fehlt.
--
-- Mehrfach ausfuehrbar: Ein zweiter Lauf findet nichts mehr (Satz entfernt
-- bzw. mit Anlass 'nachtrag') und aendert nichts.
-- ===========================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.provisionssatz_ermitteln(uuid)') IS NULL
     OR to_regprocedure('public.pipelinestufe_ist_kaufphase(text)') IS NULL
     OR strpos(pg_get_functiondef(to_regprocedure('public.investments_provisionssatz_festschreiben()')), '''verwerfen''') = 0
     OR strpos(pg_get_functiondef(to_regprocedure('public.investments_provisionssatz_festschreiben()')), '_nur_bei_anderem_partner') = 0 THEN
    RAISE EXCEPTION 'Zuerst 20260929140000_provisionssatz_ab_reservierung.sql in der aktuellen Fassung ausfuehren.';
  END IF;
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Bitte im SQL-Editor ausfuehren, nicht mit einer Nutzeranmeldung.';
  END IF;
END;
$$;

DO $$
DECLARE
  _verworfen integer;
  _nachgetragen integer;
  _rest integer;
BEGIN
  -- Fall 1: alter Satz vor der Kaufphase wird entfernt.
  UPDATE public.investments i
     SET meta = i.meta || '{"lockedProvisionRateNeu": "verwerfen"}'::jsonb
   WHERE jsonb_typeof(i.meta) = 'object'
     AND i.meta ? 'lockedProvisionRate'
     AND NOT i.meta ? 'lockedProvisionRateAnlass'
     AND NOT i.meta ? 'lockedProvisionRateFehler'
     AND NOT public.pipelinestufe_ist_kaufphase(i.meta ->> 'pipelineStufe')
     AND coalesce(i.meta ->> 'pipelineStufe', '') NOT IN ('verloren', 'archiviert', 'bestandsimport');
  GET DIAGNOSTICS _verworfen = ROW_COUNT;

  -- Faelle 2 und 3: in der Kaufphase ohne gueltigen Satz wird der Satz des
  -- aktuellen Partners festgeschrieben.
  UPDATE public.investments i
     SET meta = i.meta || '{"lockedProvisionRateNeu": "nachtrag"}'::jsonb
   WHERE jsonb_typeof(i.meta) = 'object'
     AND public.pipelinestufe_ist_kaufphase(i.meta ->> 'pipelineStufe')
     AND NOT i.meta ? 'lockedProvisionRateAnlass'
     AND NOT i.meta ? 'lockedProvisionRateFehler'
     AND (SELECT e.grund FROM public.provisionssatz_ermitteln(i.kunde_id) e) IS NULL;
  GET DIAGNOSTICS _nachgetragen = ROW_COUNT;

  -- Gegenprobe: Hat der Trigger die Auftraege angenommen? Wenn nicht, faellt
  -- die ganze Transaktion zurueck.
  SELECT count(*) INTO _rest
    FROM public.investments i
   WHERE jsonb_typeof(i.meta) = 'object'
     AND NOT i.meta ? 'lockedProvisionRateAnlass'
     AND NOT i.meta ? 'lockedProvisionRateFehler'
     AND (
       (i.meta ? 'lockedProvisionRate'
        AND NOT public.pipelinestufe_ist_kaufphase(i.meta ->> 'pipelineStufe')
        AND coalesce(i.meta ->> 'pipelineStufe', '') NOT IN ('verloren', 'archiviert', 'bestandsimport'))
       OR
       (public.pipelinestufe_ist_kaufphase(i.meta ->> 'pipelineStufe')
        AND (SELECT e.grund FROM public.provisionssatz_ermitteln(i.kunde_id) e) IS NULL)
     );
  IF _rest > 0 THEN
    RAISE EXCEPTION 'Der Trigger hat % Auftraege nicht angenommen. Nichts wurde geaendert.', _rest;
  END IF;

  RAISE NOTICE 'Provisionssatz-Nachtrag: % alte Saetze vor der Kaufphase entfernt, % in der Kaufphase nachgetragen.',
    _verworfen, _nachgetragen;
END;
$$;

COMMIT;

-- Ergebnis (aendert nichts). Der SQL-Editor zeigt NOTICE nicht immer an,
-- deshalb hier als Tabelle. Nach dem Lauf: "alte Saetze" 0; "ohne gueltigen
-- Satz" zeigt nur noch Faelle ohne ermittelbaren Partner.
SELECT
  count(*) FILTER (WHERE i.meta ->> 'lockedProvisionRateAnlass' = 'nachtrag') AS nachgetragen,
  count(*) FILTER (WHERE i.meta ? 'lockedProvisionRate' AND NOT i.meta ? 'lockedProvisionRateAnlass'
                     AND NOT i.meta ? 'lockedProvisionRateFehler'
                     AND coalesce(i.meta ->> 'pipelineStufe', '') NOT IN ('verloren', 'archiviert', 'bestandsimport')) AS alte_saetze,
  count(*) FILTER (WHERE public.pipelinestufe_ist_kaufphase(i.meta ->> 'pipelineStufe')
                     AND NOT i.meta ? 'lockedProvisionRateAnlass'
                     AND NOT i.meta ? 'lockedProvisionRateFehler') AS kaufphase_ohne_gueltigen_satz,
  count(*) FILTER (WHERE i.meta ? 'lockedProvisionRateFehler') AS mit_fehlervermerk_nicht_angefasst
FROM public.investments i
WHERE jsonb_typeof(i.meta) = 'object';

-- Nachsehen (aendert nichts): Pruefzeilen 47.1 und 47.2 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
