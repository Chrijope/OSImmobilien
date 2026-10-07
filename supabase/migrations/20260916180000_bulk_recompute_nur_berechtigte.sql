-- ===========================================================================
-- bulk_recompute_pipeline darf nur noch der Dienst aufrufen
-- ===========================================================================
--
-- WARUM
--
-- `public.bulk_recompute_pipeline()` ist die naechtliche Korrekturroutine der
-- Pipeline. Sie laeuft ueber saemtliche Investments mit der Stufe `notar`,
-- rechnet aus Datum und Uhrzeit den Notartermin zusammen und schaltet jedes
-- Investment, dessen Termin vorbei ist, auf `faelligkeit`. Denselben Wert
-- schreibt sie zusaetzlich in den zugehoerigen Kontakt.
--
-- Die Funktion ist `SECURITY DEFINER`. Sie umgeht damit die Zugriffsregeln
-- der Tabellen `investments` und `kontakte` vollstaendig und schreibt mit den
-- Rechten ihres Eigentuemers. Im Rumpf steht keine einzige Pruefung, wer sie
-- gerade aufruft: kein `auth.uid()`, kein `is_admin_role`, kein
-- `is_internal_role`. Sie tut, was sie tut, fuer jeden gleich.
--
-- Das Ausfuehrungsrecht liegt seit
-- `20260525080225_a1232b25-4faf-45d2-8c9f-9707de15d974.sql:79` bei
-- `authenticated`, und die letzte Fassung der Funktion
-- (`20260807180000_bulk_recompute_ohne_verlustautomatik.sql:121`) hat es
-- unveraendert mitgeschrieben. `authenticated` meint in Supabase jeden
-- angemeldeten Nutzer, also nicht nur Mitarbeiter, sondern auch jeden Kunden
-- im Portal. Jeder von ihnen konnte damit einen vollstaendigen Durchlauf
-- ueber die gesamte Pipeline anstossen, so oft er wollte.
--
-- Das ist kein Datenleck: Die Funktion gibt nur Stueckzahlen zurueck, keine
-- Zeilen. Es ist eine Last- und Integritaetsfrage. Wiederholtes Aufrufen
-- erzeugt vollstaendige Durchlaeufe ueber zwei grosse Tabellen samt
-- Schreibvorgaengen, und die Stufenwechsel landen in einem Moment im System,
-- den niemand im Haus veranlasst hat.
--
-- WARUM DER ENTZUG NICHTS ABSCHNEIDET
--
-- Es gibt genau einen Aufrufer, und der ruft mit dem Service-Key:
--
--   supabase/functions/recompute-pipeline/index.ts:279
--     const supabase = createClient(supabaseUrl, serviceRoleKey);
--     const { data, error } = await supabase.rpc("bulk_recompute_pipeline");
--
-- Diese Edge Function haengt an pg_cron (taeglich 03:00) und ist zusaetzlich
-- durch `_shared/automatik-schutz.ts` abgeschirmt. Sie arbeitet als
-- `service_role`, das Recht bleibt ihr also erhalten.
--
-- Kein Aufruf aus dem Browser: In `src/` gibt es keinen einzigen
-- `rpc("bulk_recompute_pipeline")`. Der einzige Treffer dort ist der
-- generierte Typ in `src/integrations/supabase/types.ts`, also eine
-- Beschreibung, kein Aufruf. Auch keine andere Datenbankfunktion und kein
-- Trigger ruft sie. Die Erwaehnungen in `src/lib/pipelineStufen.ts`,
-- `src/lib/abschlussDefinition.ts` und `src/pages/KundenDetail.tsx` sind
-- Kommentare.
--
-- WARUM ENTZUG UND NICHT EINE PRUEFUNG IM RUMPF
--
-- Eine Rollenpruefung nach dem Muster von `dsgvo_hard_delete_kontakt` waere
-- die richtige Wahl, wenn eine berechtigte Stelle die Funktion aus dem
-- Browser riefe. Das tut niemand. Eine Pruefung im Rumpf wuerde hier also
-- eine Tuer bewachen, die gar nicht benutzt wird, und dabei die Illusion
-- erzeugen, der Aufruf aus dem Browser sei ein vorgesehener Weg. Der
-- Entzug ist die einfachere und die ehrlichere Loesung: die Routine gehoert
-- der Automatik.
--
-- Soll spaeter ein Knopf im CRM einen Lauf von Hand ausloesen, ist der Weg
-- nicht, dieses Recht zurueckzugeben, sondern die Edge Function
-- `recompute-pipeline` aufzurufen und dort zu pruefen, wer klickt.
--
-- WAS SICH AENDERT
--
-- `authenticated` verliert das Ausfuehrungsrecht. `service_role` behaelt es.
-- Fuer `anon` und `public` wird der Entzug sicherheitshalber wiederholt,
-- damit die Funktion nach diesem Lauf nachweislich nur noch dem Dienst
-- offensteht. Der Rumpf der Funktion bleibt unveraendert.
--
-- Wiederholbar: REVOKE, GRANT und COMMENT sind wiederholbar, ein zweiter
-- Lauf aendert nichts.
-- ===========================================================================

REVOKE EXECUTE ON FUNCTION public.bulk_recompute_pipeline()
  FROM authenticated, anon, public;

GRANT EXECUTE ON FUNCTION public.bulk_recompute_pipeline()
  TO service_role;

COMMENT ON FUNCTION public.bulk_recompute_pipeline() IS
  'Naechtliche Korrektur der Pipeline. Schaltet Investments nach einem '
  'vergangenen Notartermin auf faelligkeit. Setzt bewusst KEINE Leads mehr '
  'automatisch auf verloren: Die Grenze von 15 erfolglosen Kontaktversuchen '
  'liegt einzig in der Anwendung (MAX_KONTAKTVERSUCHE), liegengebliebene '
  'Leads meldet lead-eskalation-check. Nur fuer service_role: Einziger '
  'Aufrufer ist die Edge Function recompute-pipeline (pg_cron, taeglich '
  '03:00). Seit 16.09.2026 hat authenticated das Recht nicht mehr, die '
  'Funktion ist SECURITY DEFINER und hat keine Pruefung im Rumpf.';

-- ===========================================================================
-- PRUEFLAUF fuer den SQL-Editor
-- ===========================================================================
--
-- 1. Wer darf bulk_recompute_pipeline jetzt noch ausfuehren? Erwartet wird
--    genau eine Zeile mit service_role. Kein authenticated, kein anon, kein
--    PUBLIC.
--
--   select r.rolname as empfaenger
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    cross join lateral aclexplode(p.proacl) a
--     join pg_roles r on r.oid = a.grantee
--    where n.nspname = 'public'
--      and p.proname = 'bulk_recompute_pipeline'
--      and a.privilege_type = 'EXECUTE'
--    order by r.rolname;
--
-- 2. Gegenprobe: Der Rumpf ist unveraendert geblieben. Der Text soll den
--    Notar-Zweig enthalten und keine Rollenpruefung.
--
--   select pg_get_functiondef(p.oid)
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname = 'bulk_recompute_pipeline';
--
-- 3. Laeuft die naechtliche Routine weiter? Die Tabelle `investments` fuehrt
--    keinen Zeitpunkt der letzten Aenderung, deshalb prueft man am besten das
--    Ergebnis: Hier stehen die Investments, die auf `notar` liegengeblieben
--    sind, obwohl der Termin schon vorbei ist. Nach dem naechsten Lauf um
--    03:00 soll diese Abfrage keine Zeile mehr liefern.
--
--   select id, kunde_id,
--          meta ->> 'notarTermin'  as termin,
--          meta ->> 'notarUhrzeit' as uhrzeit
--     from public.investments
--    where (meta ->> 'pipelineStufe') = 'notar'
--      and (meta ->> 'notarTermin')  ~ '^\d{4}-\d{2}-\d{2}$'
--      and (meta ->> 'notarUhrzeit') is not null
--      and ((meta ->> 'notarTermin') || 'T' ||
--           (meta ->> 'notarUhrzeit') || ':00')::timestamptz < now()
--    order by termin
--    limit 20;
-- ===========================================================================
