-- ===========================================================================
-- Einmalige Datenkorrektur: Provisionssaetze festschreiben und 3-%-Kollision
-- ===========================================================================
--
-- Zwei Aufraeumarbeiten in fester Reihenfolge:
--
-- (b) ZUERST die vom Kollisionsfehler betroffenen Investments: Beim Anlegen
--     im Browser wurde fuer Partner mit karriere_override 'vertriebspartner'
--     (= Lead Partner, 4 %) faelschlich 3 % eingefroren, weil die alte
--     Aufloesung den Wert ueber den gleichnamigen TITEL der ersten Stufe
--     aufloeste oder die user_settings des Partners im anlegenden Browser
--     (RLS) gar nicht lesbar waren. Korrigiert werden NUR die eindeutigen
--     Faelle: karriere_override exakt 'vertriebspartner', eingefrorene 3 %,
--     kein individueller Satz gepflegt. Jede Korrektur hinterlaesst eine
--     Protokoll-Notiz im meta.
--
--     BEWUSST AUSGENOMMEN: Investments in den Stufen 'abrechnung' und
--     'abgeschlossen'. Dort ist die Provision bereits abgerechnet oder der
--     Vorgang zu; eine stille nachtraegliche Aenderung wuerde Abrechnung und
--     Buchhaltung von den historischen Zahlen wegdrehen. Solche Faelle werden
--     nur manuell und mit Wissen der Buchhaltung korrigiert.
--
-- (a) DANACH die user_settings: Fuer alle Partner mit karriere_override und
--     OHNE gepflegten custom_provision_rate wird der Stufensatz (Kennung
--     zuerst!) als custom_provision_rate/_setter/_eigen eingeschrieben und
--     provision_locked gesetzt. Damit aendert sich nie wieder etwas von
--     selbst, egal was spaeter an Stufenlogik oder Automatiken passiert.
--     _setter/_eigen werden nur gefuellt, wenn sie fehlen; ein gepflegter
--     individueller Wert bleibt unangetastet.
--
-- Die Reihenfolge (b) vor (a) ist zwingend: (a) schreibt genau den
-- custom_provision_rate ein, dessen FEHLEN in (b) das Erkennungsmerkmal der
-- betroffenen Faelle ist.
--
-- Voraussetzung: 20260818140000_provisionssatz_serverseitig_festschreiben.sql
-- (liefert karriere_stufen, karriere_stufe_rate, einstellung_zahl und
-- investment_partner_id).

DO $$
BEGIN
  IF to_regprocedure('public.karriere_stufe_rate(text)') IS NULL
     OR to_regprocedure('public.einstellung_zahl(jsonb,text)') IS NULL THEN
    RAISE EXCEPTION
      'Zuerst 20260818140000_provisionssatz_serverseitig_festschreiben.sql ausfuehren, diese Migration braucht deren Funktionen.';
  END IF;
  IF to_regprocedure('public.investment_partner_id(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'Zuerst 20260818150000_investment_partner_id_uuid.sql ausfuehren, investments.kunde_id ist uuid.';
  END IF;
END;
$$;

DO $$
DECLARE
  _lead_partner_satz numeric := public.karriere_stufe_rate('vertriebspartner'); -- 4
  _jetzt_iso text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  _anzahl_investments integer := 0;
  _anzahl_settings integer := 0;
BEGIN
  IF _lead_partner_satz IS NULL THEN
    RAISE EXCEPTION 'karriere_stufen ist nicht befuellt, Stufensatz fuer vertriebspartner fehlt.';
  END IF;

  -- ── (b) Falsch eingefrorene 3 % auf den Stufensatz des Lead Partners heben ─
  WITH betroffen AS (
    SELECT i.id
      FROM public.investments i
      JOIN public.user_settings s
        ON s.user_id = public.investment_partner_id(i.kunde_id)
     WHERE jsonb_typeof(i.meta -> 'lockedProvisionRate') = 'number'
       AND (i.meta ->> 'lockedProvisionRate')::numeric = 3
       AND coalesce(i.meta ->> 'pipelineStufe', '') NOT IN ('abrechnung', 'abgeschlossen')
       AND trim(coalesce(s.einstellungen ->> 'karriere_override', '')) = 'vertriebspartner'
       AND public.einstellung_zahl(s.einstellungen, 'custom_provision_rate') IS NULL
       AND public.einstellung_zahl(s.einstellungen, 'custom_provision_rate_setter') IS NULL
       AND public.einstellung_zahl(s.einstellungen, 'custom_provision_rate_eigen') IS NULL
  )
  UPDATE public.investments i
     SET meta = coalesce(i.meta, '{}'::jsonb) || jsonb_build_object(
           'lockedProvisionRate', _lead_partner_satz,
           'lockedProvisionRateVorher', 3,
           'lockedProvisionRateKorrigiertAm', _jetzt_iso,
           'lockedProvisionRateKorrekturGrund',
             'Datenkorrektur 20260818: 3 Prozent durch Titel-Kennung-Kollision bzw. fehlende Leserechte eingefroren, Stufe Lead Partner'
         )
    FROM betroffen b
   WHERE i.id = b.id;

  GET DIAGNOSTICS _anzahl_investments = ROW_COUNT;

  -- ── (a) Stufensatz einschreiben und festschreiben ──────────────────────────
  UPDATE public.user_settings s
     SET einstellungen = coalesce(s.einstellungen, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
           'custom_provision_rate',
             public.karriere_stufe_rate(s.einstellungen ->> 'karriere_override'),
           'custom_provision_rate_setter',
             CASE WHEN public.einstellung_zahl(s.einstellungen, 'custom_provision_rate_setter') IS NULL
                  THEN public.karriere_stufe_rate(s.einstellungen ->> 'karriere_override') END,
           'custom_provision_rate_eigen',
             CASE WHEN public.einstellung_zahl(s.einstellungen, 'custom_provision_rate_eigen') IS NULL
                  THEN public.karriere_stufe_rate(s.einstellungen ->> 'karriere_override') END,
           'provision_locked', true,
           'provision_locked_at',
             CASE WHEN nullif(trim(coalesce(s.einstellungen ->> 'provision_locked_at', '')), '') IS NULL
                  THEN _jetzt_iso END,
           'provision_locked_datenkorrektur_am', _jetzt_iso
         )),
         updated_at = now()
   WHERE trim(coalesce(s.einstellungen ->> 'karriere_override', '')) <> ''
     AND public.karriere_stufe_rate(s.einstellungen ->> 'karriere_override') IS NOT NULL
     AND public.einstellung_zahl(s.einstellungen, 'custom_provision_rate') IS NULL;

  GET DIAGNOSTICS _anzahl_settings = ROW_COUNT;

  -- Audit-Spur, gleiche Stelle wie merge_user_settings sie nutzt.
  INSERT INTO public.aktivitaeten (art, kunde_id, beschreibung, details, von)
  VALUES (
    'system',
    'user_settings_audit',
    'Datenkorrektur Provisionssaetze (Migration 20260818141000)',
    jsonb_build_object(
      'investments_korrigiert', _anzahl_investments,
      'user_settings_festgeschrieben', _anzahl_settings,
      'ausgenommen', 'Investments in abrechnung/abgeschlossen'
    )::text,
    'migration'
  );

  RAISE NOTICE 'Datenkorrektur: % Investments von 3 auf % Prozent korrigiert, % user_settings festgeschrieben.',
    _anzahl_investments, _lead_partner_satz, _anzahl_settings;
END;
$$;
