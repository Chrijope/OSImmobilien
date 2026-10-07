-- Verlustgründe: Freitext wird zum festen Katalog
--
-- Bisher war der Verlustgrund ein Freitextfeld. Jeder hat etwas anderes
-- geschrieben, in der Auswertung wurde aus jeder Formulierung eine eigene
-- Zeile. Ab jetzt speichert die Anwendung eine Katalog-ID aus
-- src/lib/verlustgruende.ts.
--
-- Diese Migration macht zwei Dinge:
--   1. Bestehende Freitexte, die sich sicher zuordnen lassen, werden auf die
--      passende Katalog-ID umgestellt. Alles, was unklar ist, bleibt
--      unverändert stehen. Die Auswertung erkennt solche Altfälle und weist
--      sie getrennt aus, statt sie stillschweigend einzusortieren.
--   2. Der nächtliche Job schreibt seinen Automatikgrund ebenfalls als
--      Katalog-ID.
--
-- Der Originaltext geht nicht verloren: Er wird vorher nach
-- meta.verlorenGrundAlt gesichert.

-- ── 1. Altbestand sichern und zuordnen ──────────────────────────────────────

UPDATE public.kontakte
SET meta = meta || jsonb_build_object('verlorenGrundAlt', meta ->> 'verlorenGrund')
WHERE meta ->> 'verlorenGrund' IS NOT NULL
  AND meta ->> 'verlorenGrund' <> ''
  AND meta -> 'verlorenGrundAlt' IS NULL;

UPDATE public.kontakte
SET meta = meta || jsonb_build_object('verlorenGrund', neu.grund_id)
FROM (
  SELECT
    k.id,
    CASE
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'nicht erreicht|nicht erreichbar'          THEN 'ne_mehrfach'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'kontaktdaten falsch|falsche (nummer|daten)' THEN 'ne_daten_falsch'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'kein interesse|keine lust|will nicht'      THEN 'kb_kein_interesse'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'nur info|wollte sich nur informieren'      THEN 'kb_nur_infos'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'bereits investiert'                        THEN 'kb_bereits_investiert'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'bonität|bonitaet|schufa'                   THEN 'nf_bonitaet'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'eigenkapital'                              THEN 'nf_eigenkapital'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'einkommen zu (niedrig|gering)'             THEN 'nf_einkommen'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'bank.*(abgelehnt|absage)|finanzierung abgelehnt|nicht finanzierbar|finanzierungsf' THEN 'nf_bank_abgelehnt'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'später|spaeter|melde mich wieder'          THEN 'ti_spaeter'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'jobwechsel|arbeitslos|beruflich'           THEN 'ti_beruflich'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'schwanger|trennung|scheidung|privat'       THEN 'ti_privat'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'vermögensaufbau|vermoegensaufbau'          THEN 'pn_vermoegensaufbau'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'selbst (ein|be)ziehen|eigennutz'           THEN 'pn_selbstnutzung'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'zielgruppe|passt nicht'                    THEN 'pn_zielgruppe'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'wettbewerb|konkurrenz|woanders gekauft|ander\w* anbieter|ander\w* vertrieb' THEN 'we_wettbewerber'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'etf|aktien|fonds|andere anlage'            THEN 'we_andere_anlage'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'mitentscheider|(frau|mann|partner|eltern).*(dagegen|nicht einverstanden)' THEN 'pv_mitentscheider'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'steuerberater'                             THEN 'pv_steuerberater'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'kein.*objekt|nichts passendes'             THEN 'pv_kein_objekt'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'zu teuer|preis'                            THEN 'pv_preis'
      WHEN lower(k.meta ->> 'verlorenGrund') ~ 'reservierung.*(zurück|zurueck|storn)'      THEN 'pv_reservierung_zurueck'
      ELSE NULL
    END AS grund_id
  FROM public.kontakte k
  WHERE k.meta ->> 'verlorenGrund' IS NOT NULL
    AND k.meta ->> 'verlorenGrund' <> ''
) AS neu
WHERE public.kontakte.id = neu.id
  AND neu.grund_id IS NOT NULL;

-- ── 2. Nächtlicher Job schreibt die Katalog-ID ──────────────────────────────

CREATE OR REPLACE FUNCTION public.bulk_recompute_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _inv_row RECORD;
  _k_row RECORD;
  _notar_dt timestamptz;
  _notar_advanced int := 0;
  _lost_advanced int := 0;
  _versuche int;
  _last_versuch timestamptz;
BEGIN
  -- A) Notartermin vorbei → faelligkeit
  FOR _inv_row IN
    SELECT id, kunde_id, meta
    FROM public.investments
    WHERE (meta ->> 'pipelineStufe') = 'notar'
      AND (meta ->> 'notarTermin') IS NOT NULL
      AND (meta ->> 'notarUhrzeit') IS NOT NULL
  LOOP
    BEGIN
      _notar_dt := (
        CASE
          WHEN (_inv_row.meta ->> 'notarTermin') ~ '^\d{4}-\d{2}-\d{2}$'
            THEN ((_inv_row.meta ->> 'notarTermin') || 'T' || (_inv_row.meta ->> 'notarUhrzeit') || ':00')::timestamptz
          WHEN (_inv_row.meta ->> 'notarTermin') ~ '^\d{2}\.\d{2}\.\d{4}$'
            THEN to_timestamp(
              (_inv_row.meta ->> 'notarTermin') || ' ' || (_inv_row.meta ->> 'notarUhrzeit'),
              'DD.MM.YYYY HH24:MI'
            )
          ELSE NULL
        END
      );
    EXCEPTION WHEN OTHERS THEN
      _notar_dt := NULL;
    END;

    IF _notar_dt IS NOT NULL AND _notar_dt < now() THEN
      UPDATE public.investments
      SET meta = meta || jsonb_build_object('pipelineStufe', 'faelligkeit')
      WHERE id = _inv_row.id;
      UPDATE public.kontakte
      SET meta = meta || jsonb_build_object('pipelineStufe', 'faelligkeit')
      WHERE id = _inv_row.kunde_id;
      _notar_advanced := _notar_advanced + 1;
    END IF;
  END LOOP;

  -- B) 4+ Kontaktversuche & letzter Versuch > 3 Tage her → verloren
  FOR _k_row IN
    SELECT id, vorname, nachname, meta
    FROM public.kontakte
    WHERE (meta ->> 'pipelineStufe') IN ('neuer_lead', 'kontaktversuche')
      AND NOT COALESCE((meta ->> 'archiviert')::boolean, false)
      AND COALESCE(meta -> 'kontaktversuche', '[]'::jsonb) <> '[]'::jsonb
      AND jsonb_array_length(COALESCE(meta -> 'kontaktversuche', '[]'::jsonb)) >= 4
  LOOP
    BEGIN
      _versuche := jsonb_array_length(_k_row.meta -> 'kontaktversuche');
      _last_versuch := ((_k_row.meta -> 'kontaktversuche' -> (_versuche - 1)) ->> 'zeitpunkt')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      _last_versuch := NULL;
    END;

    IF _last_versuch IS NOT NULL AND _last_versuch < now() - interval '3 days' THEN
      -- 'ne_mehrfach' ist die Katalog-ID für "Mehrfach nicht erreicht".
      UPDATE public.kontakte
      SET meta = meta || jsonb_build_object(
        'pipelineStufe', 'verloren',
        'verlorenAm', to_jsonb(now()),
        'verlorenGrund', 'ne_mehrfach'
      ),
      status = 'verloren'
      WHERE id = _k_row.id;

      -- Benachrichtigung an Setter (falls bekannt)
      IF (_k_row.meta ->> 'setterId') IS NOT NULL THEN
        BEGIN
          INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
          VALUES (
            ((_k_row.meta ->> 'setterId')::uuid),
            'Lead automatisch verloren',
            _k_row.vorname || ' ' || _k_row.nachname || ' wurde nach 4 Kontaktversuchen automatisch als verloren markiert.',
            '/kunden/' || _k_row.id::text
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;

      _lost_advanced := _lost_advanced + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'notar_advanced', _notar_advanced,
    'lost_advanced', _lost_advanced,
    'run_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_recompute_pipeline() FROM anon, public;
