-- ===========================================================================
-- Duplikate zusammenführen: der ältere Kontakt bleibt, alles wandert mit
-- ===========================================================================
--
-- WAS BISHER PASSIERTE
--
-- „Zusammenführen“ unter Alle Kontakte und in der Lead-Verwaltung hat nichts
-- zusammengeführt. Es behielt den Eintrag „mit Telefon, sonst mit E-Mail,
-- sonst den ältesten“ (oft also den NEUEREN) und schob die übrigen in den
-- Papierkorb. Investments, Aufgaben, Verlauf, Dokumente, Unterschriften und
-- Portalzugang blieben am Kontakt im Papierkorb hängen und waren aus Sicht
-- des behaltenen Kontakts verschwunden.
--
-- DIE NEUE REGEL (GL, 26.09.2026)
--
--   1. Es bleibt immer der ÄLTERE Kontakt (früheres erstellt_am, bei
--      Gleichstand die kleinere MORE-Nummer, zuletzt die Kennung).
--   2. Leere Felder des älteren werden aus dem neueren gefüllt, bei
--      Widerspruch bleibt der Wert des älteren; der abweichende Wert steht als
--      Notiz im Verlauf und vollständig in meta.zusammenfuehrungen. Das
--      rechnet der Browser aus (src/lib/kontaktZusammenfuehren.ts, getestet)
--      und übergibt es hier.
--   3. ALLE Verknüpfungen des neueren wandern zum älteren (Liste unten, dazu
--      automatisch jeder Fremdschlüssel auf kontakte.id).
--   4. Der neuere geht in den Papierkorb, mit Grund „zusammengeführt in
--      MI-…“ und meta.zusammengefuehrtIn. Nichts wird endgültig gelöscht.
--   5. Portalzugang: Hat nur der neuere einen, geht er auf den älteren über
--      und wird am neueren entfernt. Haben beide einen, bleibt jeder, wo er
--      ist, und die Antwort meldet portal_konflikt = true.
--
-- WARUM EINE DATENBANKFUNKTION
--
-- Es sind gut dreißig Tabellen. Im Browser wären das dreißig einzelne
-- Schreibvorgänge; bricht einer ab, hängt die Hälfte am einen und die Hälfte
-- am anderen Kontakt. Hier läuft alles in EINER Transaktion: Entweder ist
-- danach alles umgehängt, oder es hat sich gar nichts geändert. Dazu kommt,
-- dass ein Partner manche Nebentabellen nicht selbst schreiben darf.
--
-- RECHTE
--
-- Wer heute zusammenführen (also den neueren in den Papierkorb legen) darf,
-- darf es weiter, sonst niemand: breiter Kundenzugriff
-- (darf_alle_kunden_sehen), oder ein Vertriebspartner, der den älteren
-- bearbeiten darf (is_vp_owner_of_kontakt) und Eigentümer des neueren ist
-- (is_vp_eigentuemer_of_kontakt), genau wie bei den Regeln auf kontakte.
-- Die Schutzauslöser (Zuständigkeit, Reservierung) laufen unverändert mit;
-- lehnt einer ab, wird die ganze Zusammenführung zurückgerollt.
--
-- DATEIEN IM SPEICHER
--
-- Dateien werden NICHT verschoben. Ihre Pfade stehen in den umgehängten
-- Zeilen (kunde_dokumente.storage_path, investments.meta, …) und bleiben
-- gültig. Die DSGVO-Löschung beachtet meta.zusammengefuehrtIn bzw.
-- meta.zusammenfuehrungen (Edge Functions dsgvo-hard-delete und
-- dsgvo-storage-cleanup), damit sie weder fremde Dateien löscht noch eigene
-- vergisst.
--
-- OHNE DIESE MIGRATION
--
-- Der Knopf „Zusammenführen“ meldet „Datenbank-Erweiterung fehlt noch“ und
-- ändert nichts. Das alte Verhalten (neueren behalten, älteren wegwerfen)
-- gibt es nicht mehr.
--
-- WIEDERHOLBAR: CREATE OR REPLACE, REVOKE/GRANT.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.kontakte_zusammenfuehren(
  _behalten  uuid,
  _aufloesen uuid,
  _felder    jsonb,
  _meta      jsonb,
  _notiz     text,
  _stand     jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _alt public.kontakte%ROWTYPE;
  _neu public.kontakte%ROWTYPE;
  _name text;
  _nr text;
  _alt_nr text;
  _felder_sauber jsonb;
  _neu_meta jsonb;
  _ziele text[];
  _ziel text;
  _tabelle text;
  _spalte text;
  _typ text;
  _anzahl int;
  _umgehaengt jsonb := '{}'::jsonb;
  _nicht text[] := ARRAY[]::text[];
  _chat uuid;
  _portal_konflikt boolean := false;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet.' USING ERRCODE = '42501';
  END IF;
  IF _behalten IS NULL OR _aufloesen IS NULL OR _behalten = _aufloesen THEN
    RAISE EXCEPTION 'Bitte zwei verschiedene Kontakte angeben.' USING ERRCODE = '22023';
  END IF;

  -- Beide sperren, in fester Reihenfolge, damit zwei gleichzeitige Aufrufe
  -- sich nicht gegenseitig blockieren.
  PERFORM 1 FROM public.kontakte WHERE id IN (_behalten, _aufloesen) ORDER BY id FOR UPDATE;
  SELECT * INTO _alt FROM public.kontakte WHERE id = _behalten;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kontakt nicht gefunden.' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO _neu FROM public.kontakte WHERE id = _aufloesen;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kontakt nicht gefunden.' USING ERRCODE = 'P0002'; END IF;
  IF coalesce(_alt.geloescht, false) OR coalesce(_neu.geloescht, false) THEN
    RAISE EXCEPTION 'Einer der beiden Kontakte liegt schon im Papierkorb.' USING ERRCODE = '22023';
  END IF;

  -- Rechte: wie das Loeschen des neueren und das Bearbeiten des aelteren.
  IF NOT (
    public.darf_alle_kunden_sehen(_uid)
    OR (
      public.has_role(_uid, 'vertriebspartner'::public.app_role)
      AND public.is_vp_owner_of_kontakt(_uid, _alt.zustaendig_id, _alt.meta)
      AND public.is_vp_eigentuemer_of_kontakt(_uid, _neu.zustaendig_id, _neu.meta)
    )
  ) THEN
    RAISE EXCEPTION 'Du darfst diese beiden Kontakte nicht zusammenführen.' USING ERRCODE = '42501';
  END IF;

  -- Richtung: Behalten wird immer der aeltere. Gleiche Regel wie
  -- vergleicheAlter() im Browser; die Kennung vergleicht bytegenau ("C").
  IF (
       _alt.erstellt_am,
       coalesce(nullif(nullif(substring(coalesce(_alt.meta->>'moreId', _alt.meta->>'kundenNr', '') FROM '^\s*(\d{1,18})'), ''), '0')::bigint, 9223372036854775807),
       _alt.id::text COLLATE "C"
     ) > (
       _neu.erstellt_am,
       coalesce(nullif(nullif(substring(coalesce(_neu.meta->>'moreId', _neu.meta->>'kundenNr', '') FROM '^\s*(\d{1,18})'), ''), '0')::bigint, 9223372036854775807),
       _neu.id::text COLLATE "C"
     ) THEN
    RAISE EXCEPTION 'Behalten wird immer der ältere Kontakt.' USING ERRCODE = '22023';
  END IF;

  -- Stand: Der Browser hat mit diesem Stand gerechnet. Hat sich seitdem
  -- etwas geaendert, lieber abbrechen als einen neueren Wert ueberschreiben.
  IF _stand IS NOT NULL AND (
       ((_stand->>(_alt.id::text)) IS NOT NULL AND (_stand->>(_alt.id::text))::timestamptz IS DISTINCT FROM _alt.aktualisiert_am)
    OR ((_stand->>(_neu.id::text)) IS NOT NULL AND (_stand->>(_neu.id::text))::timestamptz IS DISTINCT FROM _neu.aktualisiert_am)
  ) THEN
    RAISE EXCEPTION 'Einer der beiden Kontakte wurde gerade geändert. Bitte die Seite neu laden und noch einmal zusammenführen.'
      USING ERRCODE = '40001';
  END IF;

  SELECT nullif(btrim(p.name), '') INTO _name FROM public.profiles p WHERE p.id = _uid;

  _nr := substring(coalesce(_alt.meta->>'moreId', _alt.meta->>'kundenNr', '') FROM '^\s*(\d{1,18})');
  _alt_nr := CASE WHEN _nr IS NOT NULL AND _nr::bigint > 0
                  THEN 'MI-' || lpad(_nr::bigint::text, 5, '0')
                  ELSE 'Kontakt ' || _alt.id::text END;

  -- -------------------------------------------------------------------------
  -- 1) Den aelteren Kontakt fortschreiben
  -- -------------------------------------------------------------------------
  -- Nur diese Spalten darf der Browser setzen, nie id, geloescht, erstellt_am.
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO _felder_sauber
    FROM jsonb_each(coalesce(_felder, '{}'::jsonb))
   WHERE key = ANY (ARRAY[
     'anrede', 'vorname', 'nachname', 'email', 'telefon', 'firma', 'position',
     'strasse', 'hausnummer', 'plz', 'ort', 'land', 'budget', 'kaufpreis',
     'finanzierbarkeit', 'objekt', 'quelle', 'notizen', 'zustaendig_id', 'berater'
   ]);

  _meta := coalesce(_meta, _alt.meta, '{}'::jsonb);
  IF jsonb_typeof(_meta) <> 'object' THEN
    RAISE EXCEPTION 'meta muss ein Objekt sein.' USING ERRCODE = '22023';
  END IF;
  -- Die eigene Nummer bleibt, gleich was der Browser schickt.
  _meta := (_meta - 'moreId' - 'kundenNr')
        || jsonb_strip_nulls(jsonb_build_object('moreId', _alt.meta->'moreId', 'kundenNr', _alt.meta->'kundenNr'));

  UPDATE public.kontakte k SET
    anrede = r.anrede, vorname = r.vorname, nachname = r.nachname,
    email = r.email, telefon = r.telefon, firma = r.firma, position = r.position,
    strasse = r.strasse, hausnummer = r.hausnummer, plz = r.plz, ort = r.ort, land = r.land,
    budget = r.budget, kaufpreis = r.kaufpreis, finanzierbarkeit = r.finanzierbarkeit,
    objekt = r.objekt, quelle = r.quelle, notizen = r.notizen,
    zustaendig_id = r.zustaendig_id, berater = r.berater,
    meta = _meta
  FROM jsonb_populate_record(NULL::public.kontakte, to_jsonb(_alt) || _felder_sauber) r
  WHERE k.id = _alt.id;

  -- -------------------------------------------------------------------------
  -- 2) Alle Verknuepfungen umhaengen
  -- -------------------------------------------------------------------------
  -- Feste Liste (auch Spalten ohne Fremdschluessel, text wie uuid) plus jeder
  -- Fremdschluessel auf kontakte(id), damit eine kuenftige Tabelle nicht
  -- vergessen wird. Fehlt eine Tabelle oder Spalte, wird sie uebersprungen.
  -- Nicht dabei: finanzierungen.kunde_id (zeigt auf das Investment) und
  -- dsgvo_deletion_log (Protokoll, bleibt beim geloeschten Kontakt).
  SELECT array_agg(DISTINCT z ORDER BY z) INTO _ziele
    FROM (
      SELECT unnest(ARRAY[
        'investments.kunde_id', 'aktivitaeten.kunde_id', 'follow_ups.kunde_id',
        'aufgaben.kontakt_id', 'anrufe.kontakt_id', 'emails.kontakt_id',
        'pipeline.kontakt_id', 'activity_log.kontakt_id', 'kontakt_view_log.kontakt_id',
        'kunde_dokumente.kontakt_id', 'sa_fill_tokens.kontakt_id',
        'signature_requests.kontakt_id', 'activation_tokens.kontakt_id',
        'mobile_scan_sessions.kontakt_id', 'handbuch_anforderungen.kontakt_id',
        'investment_berechnungen.kontakt_id', 'gespraech_mitschriften.kontakt_id',
        'sales_coach_aufnahmen.kontakt_id', 'buchungen.kontakt_id',
        'buchung_links.kontakt_id', 'videoraeume.kontakt_id',
        'meeting_mail_auftraege.kontakt_id', 'scheduled_notifications.kontakt_id',
        'objekt_exposes.kontakt_id', 'objektvorstellungen.kontakt_id',
        'empfehlungen.kontakt_id', 'empfehlungen.empfohlen_von',
        'kunden_bewertungen.kunde_id', 'vp_bewertungen.kontakt_id',
        'kundenportal_sperren.kontakt_id',
        'wohnungen.kunde_id', 'wohnungen.vorgemerkt_kunde_id',
        'objekte.belegung_kunde_id', 'objekte.vorgemerkt_kunde_id'
      ]) AS z
      UNION
      SELECT c.relname || '.' || a.attname
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
       WHERE con.contype = 'f'
         AND con.confrelid = 'public.kontakte'::regclass
         AND array_length(con.conkey, 1) = 1
    ) s
   WHERE z <> 'dsgvo_deletion_log.kontakt_id'
     AND z NOT LIKE 'kontakte.%';

  FOREACH _ziel IN ARRAY _ziele LOOP
    _tabelle := split_part(_ziel, '.', 1);
    _spalte := split_part(_ziel, '.', 2);
    _typ := NULL;
    SELECT format_type(a.atttypid, a.atttypmod) INTO _typ
      FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.' || quote_ident(_tabelle))
       AND a.attname = _spalte AND a.attnum > 0 AND NOT a.attisdropped;
    CONTINUE WHEN _typ IS NULL OR _typ NOT IN ('uuid', 'text', 'character varying');

    -- Eigener Unterblock: Verbietet eine Eindeutigkeitsregel das Umhaengen
    -- (etwa eine Bewertung je Kontakt, die der aeltere schon hat), bleibt
    -- genau diese Tabelle beim neueren und wird gemeldet. Alles andere laeuft.
    BEGIN
      EXECUTE format('UPDATE public.%I SET %I = CAST($1 AS %s) WHERE %I = CAST($2 AS %s)',
                     _tabelle, _spalte, _typ, _spalte, _typ)
        USING _alt.id::text, _neu.id::text;
      GET DIAGNOSTICS _anzahl = ROW_COUNT;
      IF _anzahl > 0 THEN
        _umgehaengt := _umgehaengt || jsonb_build_object(_ziel, _anzahl);
      END IF;
    EXCEPTION WHEN unique_violation OR exclusion_violation THEN
      _nicht := _nicht || _ziel;
    END;
  END LOOP;

  -- Verweise in meta anderer Tabellen (Schluessel mit der Kontaktkennung als Text).
  FOREACH _ziel IN ARRAY ARRAY[
    'chat_gruppen.kundeId', 'kommunikation.kunde_id',
    'empfehlungen.kontaktId', 'empfehlungen.neuerKontaktId', 'empfehlungen.empfehlenderKundeId',
    'empfehlungsprogramme.kontaktId', 'eigentuemer.herkunftKontaktId',
    'kontakte.empfehlungsgeberKontaktId'
  ] LOOP
    _tabelle := split_part(_ziel, '.', 1);
    _spalte := split_part(_ziel, '.', 2);
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_attribute a
       WHERE a.attrelid = to_regclass('public.' || quote_ident(_tabelle))
         AND a.attname = 'meta' AND NOT a.attisdropped
         AND format_type(a.atttypid, a.atttypmod) = 'jsonb');
    EXECUTE format('UPDATE public.%I SET meta = jsonb_set(meta, ARRAY[%L], to_jsonb($1::text)) WHERE meta->>%L = $2',
                   _tabelle, _spalte, _spalte)
      USING _alt.id::text, _neu.id::text;
    GET DIAGNOSTICS _anzahl = ROW_COUNT;
    IF _anzahl > 0 THEN
      _umgehaengt := _umgehaengt || jsonb_build_object('meta:' || _ziel, _anzahl);
    END IF;
  END LOOP;

  -- Zwei Kundenchats am aelteren? Wie 20260919160000: der aelteste bleibt,
  -- Nachrichten und Teilnehmer wandern hinueber, die leere Gruppe geht.
  IF to_regclass('public.chat_gruppen') IS NOT NULL THEN
    SELECT g.id INTO _chat
      FROM public.chat_gruppen g
     WHERE g.typ = 'kundenkommunikation' AND g.meta->>'kundeId' = _alt.id::text
     ORDER BY g.erstellt_am, g.id
     LIMIT 1;
    IF _chat IS NOT NULL THEN
      UPDATE public.chat_nachrichten n SET chat_id = _chat
        FROM public.chat_gruppen g
       WHERE n.chat_id = g.id AND g.id <> _chat
         AND g.typ = 'kundenkommunikation' AND g.meta->>'kundeId' = _alt.id::text;
      INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, beigetreten_am, meta)
      SELECT DISTINCT ON (t.benutzer_id) _chat, t.benutzer_id, t.beigetreten_am, t.meta
        FROM public.chat_teilnehmer t
        JOIN public.chat_gruppen g ON g.id = t.chat_id
       WHERE g.id <> _chat AND g.typ = 'kundenkommunikation' AND g.meta->>'kundeId' = _alt.id::text
         AND NOT EXISTS (SELECT 1 FROM public.chat_teilnehmer v
                          WHERE v.chat_id = _chat AND v.benutzer_id = t.benutzer_id)
      ON CONFLICT DO NOTHING;
      DELETE FROM public.chat_gruppen z
       WHERE z.id <> _chat AND z.typ = 'kundenkommunikation' AND z.meta->>'kundeId' = _alt.id::text
         AND NOT EXISTS (SELECT 1 FROM public.chat_nachrichten n WHERE n.chat_id = z.id);
    END IF;
  END IF;

  -- -------------------------------------------------------------------------
  -- 3) Portalzugang: uebernommen wird er am neueren entfernt, sonst gaebe es
  --    zwei Kontakte mit demselben Zugang. Haben beide einen eigenen, bleibt
  --    alles, wie es ist, und der Aufrufer bekommt den Konflikt gemeldet.
  -- -------------------------------------------------------------------------
  _neu_meta := coalesce(_neu.meta, '{}'::jsonb);
  IF nullif(_neu_meta->>'authUserId', '') IS NOT NULL THEN
    IF _meta->>'authUserId' = _neu_meta->>'authUserId' THEN
      _neu_meta := _neu_meta - 'authUserId';
    ELSIF nullif(_meta->>'authUserId', '') IS NOT NULL THEN
      _portal_konflikt := true;
    END IF;
  END IF;
  IF nullif(_neu_meta #>> '{person2,authUserId}', '') IS NOT NULL THEN
    IF _meta #>> '{person2,authUserId}' = _neu_meta #>> '{person2,authUserId}' THEN
      _neu_meta := _neu_meta #- '{person2,authUserId}';
    ELSIF nullif(_meta #>> '{person2,authUserId}', '') IS NOT NULL THEN
      _portal_konflikt := true;
    END IF;
  END IF;

  -- -------------------------------------------------------------------------
  -- 4) Notiz im Verlauf des aelteren
  -- -------------------------------------------------------------------------
  IF nullif(btrim(coalesce(_notiz, '')), '') IS NOT NULL THEN
    INSERT INTO public.aktivitaeten (kunde_id, benutzer_id, art, beschreibung, von, datum)
    VALUES (_alt.id::text, _uid, 'notiz', left(_notiz, 8000), coalesce(_name, 'System'), now());
  END IF;

  -- -------------------------------------------------------------------------
  -- 5) Den neueren in den Papierkorb
  -- -------------------------------------------------------------------------
  UPDATE public.kontakte SET
    geloescht = true,
    geloescht_am = now(),
    geloescht_von = _uid,
    geloescht_von_name = _name,
    geloescht_grund = 'zusammengeführt in ' || _alt_nr,
    meta = _neu_meta || jsonb_build_object('zusammengefuehrtIn', _alt.id::text, 'zusammengefuehrtAm', now())
  WHERE id = _neu.id;

  -- Protokoll. Ein Fehler hier darf die Zusammenfuehrung nicht kippen.
  BEGIN
    INSERT INTO public.audit_log (action, entity, entity_id, actor, meta)
    VALUES ('kontakte_zusammengefuehrt', 'kontakt', _alt.id::text, _uid,
            jsonb_build_object('aufgeloest', _neu.id, 'umgehaengt', _umgehaengt,
                               'nicht_umgehaengt', to_jsonb(_nicht), 'portal_konflikt', _portal_konflikt));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'kontakte_zusammenfuehren: Protokoll nicht geschrieben: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'behalten', _alt.id,
    'aufgeloest', _neu.id,
    'umgehaengt', _umgehaengt,
    'nicht_umgehaengt', to_jsonb(_nicht),
    'portal_konflikt', _portal_konflikt
  );
END;
$$;

COMMENT ON FUNCTION public.kontakte_zusammenfuehren(uuid, uuid, jsonb, jsonb, text, jsonb) IS
  'Fuehrt ein Duplikat in den aelteren Kontakt zusammen: Felder und meta laut Browser-Plan, '
  'alle Verknuepfungen umhaengen, Notiz im Verlauf, neueren in den Papierkorb. Eine Transaktion. '
  'Regel vom 26.09.2026.';

REVOKE ALL ON FUNCTION public.kontakte_zusammenfuehren(uuid, uuid, jsonb, jsonb, text, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.kontakte_zusammenfuehren(uuid, uuid, jsonb, jsonb, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.kontakte_zusammenfuehren(uuid, uuid, jsonb, jsonb, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Nachsehen (lesend, aendert nichts)
-- ---------------------------------------------------------------------------
--
--   select to_regprocedure('public.kontakte_zusammenfuehren(uuid,uuid,jsonb,jsonb,text,jsonb)') is not null as da,
--          has_function_privilege('anon',
--            to_regprocedure('public.kontakte_zusammenfuehren(uuid,uuid,jsonb,jsonb,text,jsonb)'), 'EXECUTE') as anon_darf;
--
-- Erwartet: da = true, anon_darf = false.
--
-- Nach einer Zusammenfuehrung zeigt das Protokoll, was gewandert ist:
--
--   select erstellt_am, entity_id, meta
--     from audit_log where action = 'kontakte_zusammengefuehrt'
--    order by erstellt_am desc limit 5;
