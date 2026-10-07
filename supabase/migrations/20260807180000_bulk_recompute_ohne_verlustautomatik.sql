-- ===========================================================================
-- `bulk_recompute_pipeline`: die stille Falle im Verlust-Zweig entschärfen
-- ===========================================================================
--
-- In `20260727090000_verlustgruende_katalog.sql` steckt ein zweiter Zweig, der
-- Leads automatisch auf "verloren" setzt:
--
--     nach 4 Kontaktversuchen und 3 Tagen Ruhe  →  verloren, Grund ne_mehrfach
--
-- Die maßgebliche Grenze ist aber 15, sie steht in
-- `src/lib/kontaktversuchSchedule.ts` als `MAX_KONTAKTVERSUCHE` und die
-- Wartestaffel dazu läuft über zwei Wochen. Vier ist ein Wert aus einer Zeit,
-- an die sich niemand mehr erinnert.
--
-- Der Zweig ist heute doppelt wirkungslos, und das ist der Grund, warum die
-- falsche Zahl nie aufgefallen ist:
--
--   1. Er zählt `meta->'kontaktversuche'`, ein JSON-Array. Für Kontakte wird
--      das nirgends geschrieben. Die Anwendung führt `nichtErreichtCount`,
--      eine schlichte Zahl. Das Array gibt es nur bei Bewerbern.
--   2. Sein Filter greift nur auf `pipelineStufe IN ('neuer_lead',
--      'kontaktversuche')`. Die Stufe, die heute tatsächlich geschrieben wird,
--      heißt `nicht_erreicht` und fehlt.
--
-- Genau das macht ihn gefährlich. Er sieht aus, als täte er etwas. Repariert
-- jemand später den Filter oder das Feld, ohne die Zahl anzufassen, werden
-- schlagartig alle Leads mit vier erfolglosen Anrufen auf verloren gesetzt,
-- rückwirkend über den gesamten Bestand, in einem einzigen nächtlichen Lauf.
--
-- ── Die Entscheidung: der Zweig kommt raus ─────────────────────────────────
--
-- Nicht die Zahl wird korrigiert, sondern die Regel entfernt. Drei Gründe:
--
--   Die Anwendung erledigt die Aufgabe bereits vollständig.
--   `src/components/setter/SetterSkript.tsx` setzt beim 15. erfolglosen
--   Versuch auf `verloren` mit Grund `ne_mehrfach`, im selben Klick, der den
--   Zähler hochsetzt. Der Zähler kann gar nicht anders wachsen. Ein
--   nachlaufender SQL-Zweig hätte deshalb nie etwas zu tun.
--
--   Zwei Stellen, die dasselbe tun, sind der Ursprung dieses ganzen Problems.
--   Solange die Regel doppelt liegt, muss jede künftige Änderung an beiden
--   Stellen ankommen, und beim ersten Mal, wo das nicht passiert, entsteht
--   genau wieder eine Falle wie diese.
--
--   Der Fall, den der Zweig eigentlich abdecken wollte, hat inzwischen einen
--   eigenen Dienst. Ein Lead, der in `nicht_erreicht` liegenbleibt, wird von
--   `lead-eskalation-check` überwacht (orange nach 1 Tag, rot nach 3, finale
--   Entscheidung nach 10). Der meldet ihn dem Zuständigen, statt ihn
--   ungefragt zu verlieren. Ein Lead wegzuwerfen ist nichts, was nachts von
--   selbst passieren sollte.
--
-- Zweig A, das Weiterschalten nach dem Notartermin, bleibt unverändert. Er
-- funktioniert, er liest echte Felder und er verliert niemanden.
--
-- `lost_advanced` bleibt im Rückgabewert stehen und ist ab jetzt fest 0. Die
-- Function wird von `supabase/functions/recompute-pipeline` aufgerufen; ein
-- fehlendes Feld dort wäre eine überflüssige zweite Änderung.

CREATE OR REPLACE FUNCTION public.bulk_recompute_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _inv_row RECORD;
  _notar_dt timestamptz;
  _notar_advanced int := 0;
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

  -- B) Der Zweig "nach X Kontaktversuchen automatisch verloren" ist bewusst
  --    entfernt. Die Regel liegt einzig in der Anwendung
  --    (SetterSkript.tsx, MAX_KONTAKTVERSUCHE = 15). Wer sie hier wieder
  --    einbaut, hat wieder zwei Wahrheiten. Die Begründung steht im Kopf
  --    dieser Migration.

  RETURN jsonb_build_object(
    'notar_advanced', _notar_advanced,
    'lost_advanced', 0,
    'run_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_recompute_pipeline() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.bulk_recompute_pipeline() TO authenticated, service_role;

COMMENT ON FUNCTION public.bulk_recompute_pipeline() IS
  'Naechtliche Korrektur der Pipeline. Schaltet Investments nach einem '
  'vergangenen Notartermin auf faelligkeit. Setzt bewusst KEINE Leads mehr '
  'automatisch auf verloren: Die Grenze von 15 erfolglosen Kontaktversuchen '
  'liegt einzig in der Anwendung (MAX_KONTAKTVERSUCHE), liegengebliebene '
  'Leads meldet lead-eskalation-check.';
