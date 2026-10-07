-- ===========================================================================
-- Offene Gegenzeichnungen: neuer Token, Verweis auf die Unterschrift
-- ===========================================================================
--
-- AUSGANGSLAGE (Codex-Pruefung 27.09.2026, NB-02)
--
-- Bis zum 27.09.2026 gab `finalize-vertrag` den Link der Gegenzeichnung an
-- den Browser des Bewerbers zurueck und legte den Token in
-- `bewerbungen.meta.vertragKurzAnfrageToken` ab. Die Akte liest auch der
-- Bewerber. Mit diesem Token konnte er die Gegenzeichnung selbst leisten.
-- Der Code gibt ihn seither nicht mehr heraus; die schon ausgegebenen Tokens
-- offener Anfragen gelten aber weiter.
--
-- WAS DIESE MIGRATION TUT
--
-- 1. Offene Gegenzeichnungen (`vertrag_kurz`, `pending`) ohne
--    `sa_data.bewerberRequestId` bekommen den Verweis auf die zuletzt
--    unterschriebene echte Vertragsanfrage des Bewerbers (kein Testversand).
--    Ohne diesen Verweis lehnt `finalize-vertrag` seither ab.
-- 2. Jede offene Gegenzeichnung bekommt einen neuen Token
--    (`token` ist text). Der alte Link ist damit tot, auch der in der Glocke
--    an Christian Kurz. Den neuen Link verschickt HR ueber den Knopf
--    „Erneut an Kurz erinnern“ im Vertrags-Reiter; er liest den Token beim
--    Klick frisch. Vermerk `sa_data.tokenErneuertAm`, damit ein zweiter Lauf
--    nichts mehr aendert.
-- 3. `vertragKurzAnfrageToken` verschwindet aus allen Bewerbungen.
--
-- Ohne diese Migration stuerzt nichts ab: Eine alte Gegenzeichnung ohne
-- Verweis wird mit der neutralen Meldung abgelehnt.
-- ===========================================================================

BEGIN;

-- 1. Verweis auf die zuletzt unterschriebene echte Vertragsanfrage.
UPDATE public.signature_requests k
   SET sa_data = coalesce(k.sa_data, '{}'::jsonb) || jsonb_build_object(
         'bewerberRequestId',
         (SELECT v.id::text
            FROM public.signature_requests v
           WHERE v.kontakt_id = k.kontakt_id
             AND v.person_type = 'vertrag'
             AND v.status = 'signed'
             AND coalesce(v.sa_data ->> 'testversand', 'false') <> 'true'
             AND v.signed_at = nullif(k.sa_data ->> 'bewerberSignedAt', '')::timestamptz
           ORDER BY v.signed_at DESC NULLS LAST, v.created_at DESC
           LIMIT 1))
 WHERE k.person_type = 'vertrag_kurz'
   AND k.status = 'pending'
   AND coalesce(k.sa_data ->> 'bewerberRequestId', '') = ''
   AND EXISTS (
         SELECT 1 FROM public.signature_requests v
          WHERE v.kontakt_id = k.kontakt_id
            AND v.person_type = 'vertrag'
            AND v.status = 'signed'
            AND coalesce(v.sa_data ->> 'testversand', 'false') <> 'true'
            AND v.signed_at = nullif(k.sa_data ->> 'bewerberSignedAt', '')::timestamptz);

-- 2. Neuer Token fuer jede offene Gegenzeichnung, einmal.
UPDATE public.signature_requests
   SET token = gen_random_uuid()::text,
       sa_data = coalesce(sa_data, '{}'::jsonb) || jsonb_build_object('tokenErneuertAm', now())
 WHERE person_type = 'vertrag_kurz'
   AND status = 'pending'
   AND coalesce(sa_data ->> 'tokenErneuertAm', '') = '';

-- 3. Kein Gegenzeichnungs-Token mehr in der Akte des Bewerbers.
UPDATE public.bewerbungen
   SET meta = meta - 'vertragKurzAnfrageToken'
 WHERE meta ? 'vertragKurzAnfrageToken';

COMMIT;
