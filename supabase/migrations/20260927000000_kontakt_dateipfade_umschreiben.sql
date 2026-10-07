-- ===========================================================================
-- Zusammenführen: Dateipfade des aufgelösten Kontakts umschreiben
-- ===========================================================================
--
-- WORUM ES GEHT
--
-- Beim Zusammenführen (Migration 20260926230000) blieben die Dateien des
-- neueren Kontakts in seinen Ordnern liegen, etwa
-- `kundenordner/<neuerer>/…` oder `reservierung/<neuerer>/…`. Die Leseregeln
-- des Kundenportals hängen am Ordnernamen. Wer den Portalzugang vom neueren
-- übernahm, sah diese Dateien nicht. Christian (26.09.2026): Die Dateien
-- wandern beim Zusammenführen mit.
--
-- Das Verschieben macht die Edge Function `kontakte-zusammenfuehren-dateien`
-- (Speicher kopieren, dann diese Funktion, dann alte Dateien löschen). Diese
-- Funktion schreibt in EINER Transaktion jeden Verweis alter Pfad → neuer
-- Pfad um, in allen Text- und JSON-Spalten des Schemas public, außer in
-- reinen Protokolltabellen. Entweder sind danach alle Verweise umgestellt,
-- oder keiner.
--
-- RECHTE
--
-- Nur die Service-Rolle darf aufrufen. Die Edge Function reicht die Kennung
-- des angemeldeten Nutzers als _aufrufer herein, und hier wird geprüft:
--   - der aufgelöste Kontakt liegt im Papierkorb und trägt
--     meta.zusammengefuehrtIn = behaltener Kontakt,
--   - der behaltene liegt nicht im Papierkorb,
--   - der Aufrufer darf den behaltenen bearbeiten: breiter Kundenzugriff
--     (darf_alle_kunden_sehen) oder Vertriebspartner mit
--     is_vp_owner_of_kontakt, wie in kontakte_zusammenfuehren.
--   - jeder alte Pfad enthält die ID des aufgelösten, jeder neue die des
--     behaltenen.
-- Mit leerer Abbildung prüft die Funktion nur und ändert nichts. So fragt
-- die Edge Function die Rechte ab, bevor sie eine Datei anfasst.
--
-- OHNE DIESE MIGRATION
--
-- Zusammenführen läuft wie bisher, die Dateien bleiben am alten Ort (die
-- Mitarbeitenden sehen sie weiter, das Portal nicht). Der Browser meldet
-- das in einem Hinweis. Die DSGVO-Löschung findet die alten Ordner weiter
-- über meta.zusammenfuehrungen.
--
-- WIEDERHOLBAR: CREATE OR REPLACE, REVOKE/GRANT.
-- ===========================================================================

BEGIN;

-- Ersetzt jeden alten Pfad durch den neuen. Längste zuerst, damit ein Pfad,
-- der Anfang eines anderen ist, dessen Ersetzung nicht zerschneidet. In JSON
-- steht ein Pfad mit maskierten Sonderzeichen, deshalb dort die JSON-Form.
CREATE OR REPLACE FUNCTION public.kontakt_pfade_ersetzen(_wert text, _abbildung jsonb, _json boolean)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _p record;
  _von text;
  _nach text;
BEGIN
  IF _wert IS NULL THEN RETURN NULL; END IF;
  FOR _p IN SELECT key, value #>> '{}' AS neu FROM jsonb_each(_abbildung) ORDER BY length(key) DESC, key LOOP
    IF _json THEN
      _von := to_jsonb(_p.key)::text;
      _von := substr(_von, 2, length(_von) - 2);
      _nach := to_jsonb(_p.neu)::text;
      _nach := substr(_nach, 2, length(_nach) - 2);
    ELSE
      _von := _p.key;
      _nach := _p.neu;
    END IF;
    _wert := replace(_wert, _von, _nach);
  END LOOP;
  RETURN _wert;
END;
$$;

CREATE OR REPLACE FUNCTION public.kontakt_dateipfade_umschreiben(
  _aufrufer   uuid,
  _behalten   uuid,
  _aufgeloest uuid,
  _abbildung  jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alt public.kontakte%ROWTYPE;
  _neu public.kontakte%ROWTYPE;
  _p record;
  _tab record;
  _spalte record;
  _treffer boolean;
  _anzahl int;
  _muster text;
  _umgeschrieben jsonb := '{}'::jsonb;
BEGIN
  IF _aufrufer IS NULL OR _behalten IS NULL OR _aufgeloest IS NULL OR _behalten = _aufgeloest THEN
    RAISE EXCEPTION 'Bitte zwei verschiedene Kontakte und den Aufrufer angeben.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _alt FROM public.kontakte WHERE id = _behalten;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kontakt nicht gefunden.' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO _neu FROM public.kontakte WHERE id = _aufgeloest;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kontakt nicht gefunden.' USING ERRCODE = 'P0002'; END IF;

  IF coalesce(_alt.geloescht, false) THEN
    RAISE EXCEPTION 'Der behaltene Kontakt liegt im Papierkorb.' USING ERRCODE = '22023';
  END IF;
  IF NOT coalesce(_neu.geloescht, false)
     OR (_neu.meta->>'zusammengefuehrtIn') IS DISTINCT FROM _alt.id::text THEN
    RAISE EXCEPTION 'Diese beiden Kontakte wurden nicht zusammengeführt.' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.darf_alle_kunden_sehen(_aufrufer)
    OR (
      public.has_role(_aufrufer, 'vertriebspartner'::public.app_role)
      AND public.is_vp_owner_of_kontakt(_aufrufer, _alt.zustaendig_id, _alt.meta)
    )
  ) THEN
    RAISE EXCEPTION 'Du darfst die Dateien dieses Kontakts nicht verschieben.' USING ERRCODE = '42501';
  END IF;

  _abbildung := coalesce(_abbildung, '{}'::jsonb);
  IF jsonb_typeof(_abbildung) <> 'object' THEN
    RAISE EXCEPTION 'Abbildung muss ein Objekt sein.' USING ERRCODE = '22023';
  END IF;
  FOR _p IN SELECT key, value FROM jsonb_each(_abbildung) LOOP
    IF jsonb_typeof(_p.value) <> 'string'
       OR position(_neu.id::text IN _p.key) = 0
       OR position(_alt.id::text IN (_p.value #>> '{}')) = 0 THEN
      RAISE EXCEPTION 'Ungültiger Pfad in der Abbildung: %', _p.key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF _abbildung = '{}'::jsonb THEN
    RETURN jsonb_build_object('geprueft', true, 'umgeschrieben', '{}'::jsonb);
  END IF;

  -- Jede Tabelle einmal grob durchsehen (ganze Zeile als Text), nur bei
  -- Treffern die einzelnen Spalten umschreiben. Protokolle bleiben, wie sie
  -- waren: Sie halten fest, was damals geschah.
  _muster := '%' || _neu.id::text || '%';
  FOR _tab IN
    SELECT c.oid, c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE c.relkind = 'r'
       AND c.relname NOT IN ('audit_log', 'audit_log_archive', 'webhook_audit_log',
                             'dsgvo_deletion_log', 'kontakt_view_log', 'activity_log')
     ORDER BY c.relname
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I t WHERE t::text LIKE $1)', _tab.relname)
      INTO _treffer USING _muster;
    CONTINUE WHEN NOT _treffer;

    FOR _spalte IN
      SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS typ
        FROM pg_attribute a
       WHERE a.attrelid = _tab.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
         AND a.atttypid IN ('text'::regtype, 'varchar'::regtype, 'jsonb'::regtype, 'json'::regtype)
    LOOP
      EXECUTE format(
        'UPDATE public.%1$I SET %2$I = CAST(public.kontakt_pfade_ersetzen(%2$I::text, $1, $3) AS %3$s)
          WHERE %2$I::text LIKE $2
            AND public.kontakt_pfade_ersetzen(%2$I::text, $1, $3) IS DISTINCT FROM %2$I::text',
        _tab.relname, _spalte.attname, _spalte.typ)
        USING _abbildung, _muster, _spalte.typ IN ('jsonb', 'json');
      GET DIAGNOSTICS _anzahl = ROW_COUNT;
      IF _anzahl > 0 THEN
        _umgeschrieben := _umgeschrieben || jsonb_build_object(_tab.relname || '.' || _spalte.attname, _anzahl);
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('geprueft', true, 'umgeschrieben', _umgeschrieben);
END;
$$;

COMMENT ON FUNCTION public.kontakt_dateipfade_umschreiben(uuid, uuid, uuid, jsonb) IS
  'Schreibt nach dem Zusammenfuehren alle Verweise auf Dateien des aufgeloesten Kontakts auf die neuen '
  'Pfade unter dem behaltenen um. Eine Transaktion. Nur Service-Rolle (Edge Function '
  'kontakte-zusammenfuehren-dateien). Leere Abbildung = nur Rechtepruefung. Regel vom 26.09.2026.';

REVOKE ALL ON FUNCTION public.kontakt_pfade_ersetzen(text, jsonb, boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.kontakt_dateipfade_umschreiben(uuid, uuid, uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kontakt_pfade_ersetzen(text, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.kontakt_dateipfade_umschreiben(uuid, uuid, uuid, jsonb) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- Nachsehen (lesend, aendert nichts)
-- ---------------------------------------------------------------------------
--
--   select to_regprocedure('public.kontakt_dateipfade_umschreiben(uuid,uuid,uuid,jsonb)') is not null as da,
--          has_function_privilege('authenticated',
--            to_regprocedure('public.kontakt_dateipfade_umschreiben(uuid,uuid,uuid,jsonb)'), 'EXECUTE') as nutzer_darf;
--
-- Erwartet: da = true, nutzer_darf = false.
--
-- Nach einer Zusammenfuehrung zeigt das Protokoll, welche Dateien wanderten:
--
--   select erstellt_am, entity_id, meta
--     from audit_log where action = 'kontakt_dateien_verschoben'
--    order by erstellt_am desc limit 5;
