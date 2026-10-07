-- Kundensprache, Etappe 3: Die Seiten mit persönlichem Link erfahren die
-- Sprache des Kunden vom Server.
--
-- Plan Kundensprache vom 25.09.2026, Abschnitt 3.3 a. Die Sprache steht in
-- `kontakte.meta.kundenSprache` ("de" oder "en"). Fehlt sie, gilt Deutsch.
--
-- WARUM EINE NEUE FUNKTION STATT FÜNF GEÄNDERTER
--
-- Der Plan sah vor, dass `buchung_zugang`, `buchung_ansicht`,
-- `partnertermin_zugang`, `videoraum_ansicht` und `get_mobile_scan_session`
-- zusätzlich `sprache` zurückgeben. Das geht bei `get_mobile_scan_session`
-- nicht ohne Bruch: Sie liefert eine ganze Zeile der Tabelle
-- `mobile_scan_sessions` und kann kein weiteres Feld tragen. Die übrigen vier
-- hätten vollständig neu geschrieben werden müssen, `partnertermin_zugang`
-- allein mit rund 200 Zeilen. Jede Abschrift birgt das Risiko, eine spätere
-- Änderung aus Lovable unbemerkt zurückzudrehen.
--
-- Deshalb eine eigene, kleine Lesefunktion. Die Seiten fragen sie neben ihrem
-- gewohnten Aufruf. Fehlt sie, weil diese Migration noch nicht gelaufen ist,
-- bleibt die Seite auf Deutsch und sonst unverändert.
--
-- Was sie herausgibt: nur "de" oder "en", nie den Kontakt, nie eine Kennung.
-- Unbekannter Schlüssel: NULL. Die Gültigkeit des Links prüft sie bewusst
-- nicht, damit auch der Hinweis „Link nicht mehr gültig“ in der Sprache des
-- Kunden erscheint. Die Sprache ist kein Geheimnis, und ein Schlüssel lässt
-- sich nicht erraten (32 Byte Zufall bzw. UUID).

-- 1) Die Sprache zu einem Kontakt. Nur für andere Funktionen, nicht für Gäste.
CREATE OR REPLACE FUNCTION public.kontakt_sprache(_kontakt_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           WHEN lower(btrim(COALESCE(k.meta ->> 'kundenSprache', ''))) IN ('en', 'english', 'englisch')
             OR lower(btrim(COALESCE(k.meta ->> 'kundenSprache', ''))) LIKE 'en-%'
             OR lower(btrim(COALESCE(k.meta ->> 'kundenSprache', ''))) LIKE 'en\_%'
           THEN 'en'
           ELSE 'de'
         END
  FROM public.kontakte k
  WHERE k.id = _kontakt_id
$$;
COMMENT ON FUNCTION public.kontakt_sprache(uuid) IS
  'Sprache eines Kontakts aus meta.kundenSprache, Rueckfall de. Nur fuer andere Funktionen.';
REVOKE ALL ON FUNCTION public.kontakt_sprache(uuid) FROM public, anon, authenticated;

-- 2) Die Sprache zum Schlüssel einer öffentlichen Kundenseite.
--
--   _art                 Seite            Schlüssel
--   buchung              /termin/:token   buchung_links.token
--   buchung_verwalten    /termin/verwalten/:absageToken  buchungen.absage_token
--   partnertermin        /terminwahl/:token              buchung_links.token
--   videoraum            /raum/:token     videoraeume.token
--   mobile_scan          /mobile-scan/:token             mobile_scan_sessions.token
CREATE OR REPLACE FUNCTION public.kundensprache_zum_link(_art text, _token text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kontakt uuid;
BEGIN
  IF _token IS NULL OR btrim(_token) = '' OR length(_token) > 200 THEN
    RETURN NULL;
  END IF;

  IF _art IN ('buchung', 'partnertermin') THEN
    SELECT l.kontakt_id INTO _kontakt
    FROM public.buchung_links l
    WHERE l.token = _token
    LIMIT 1;
  ELSIF _art = 'buchung_verwalten' THEN
    -- Die Buchung selbst, sonst der Kontakt am Link, über den sie kam.
    SELECT COALESCE(b.kontakt_id, l.kontakt_id) INTO _kontakt
    FROM public.buchungen b
    LEFT JOIN public.buchung_links l ON l.id = b.link_id
    WHERE b.absage_token = _token
    LIMIT 1;
  ELSIF _art = 'videoraum' THEN
    SELECT r.kontakt_id INTO _kontakt
    FROM public.videoraeume r
    WHERE r.token = _token
    LIMIT 1;
  ELSIF _art = 'mobile_scan' THEN
    SELECT s.kontakt_id INTO _kontakt
    FROM public.mobile_scan_sessions s
    WHERE s.token = _token
    LIMIT 1;
  ELSE
    RETURN NULL;
  END IF;

  IF _kontakt IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN COALESCE(public.kontakt_sprache(_kontakt), 'de');
END;
$$;
COMMENT ON FUNCTION public.kundensprache_zum_link(text, text) IS
  'Kundensprache (de/en) zum Schluessel einer oeffentlichen Kundenseite. Gibt nur die Sprache heraus, sonst nichts.';
REVOKE ALL ON FUNCTION public.kundensprache_zum_link(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.kundensprache_zum_link(text, text) TO anon, authenticated;

-- 3) Gegenprobe (ändert nichts)
--
--   select p.oid::regprocedure as funktion,
--          has_function_privilege('anon', p.oid, 'EXECUTE') as anon_darf
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('kontakt_sprache', 'kundensprache_zum_link');
--
-- Erwartet: zwei Zeilen; anon_darf ist false bei kontakt_sprache und true bei
-- kundensprache_zum_link. Mit einem echten Schlüssel liefert
--
--   select public.kundensprache_zum_link('mobile_scan', token)
--     from public.mobile_scan_sessions order by created_at desc limit 1;
--
-- "de" oder "en", mit einem erfundenen NULL.
