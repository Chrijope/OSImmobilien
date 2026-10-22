-- ===========================================================================
-- Strukturvertrieb: Kennzahlen je Partner fuer den Strukturbaum
-- ===========================================================================
--
-- CHRISTIANS ENTSCHEIDUNG (22.10.2026)
--
--   Jeder sieht nur nach unten: seine Partner und deren Zahlen. Ein
--   Teamleiter sieht keine Kundenakten seiner Partner, nur Zahlen.
--   Vertriebsleitung, Admin und Inhaber sehen alle Strukturen.
--
-- WAS DIESE MIGRATION TUT
--
--   struktur_kennzahlen(von, bis): je Partner Summen, keine Namen von Kunden.
--     Umfang: Vertriebspartner ihre Struktur (meine_struktur, alle Ebenen),
--     Vertriebsleitung, Admin und Inhaber alle Vertriebspartner. Andere Rollen
--     bekommen nichts. Die RLS auf kontakte bleibt unveraendert: Die Funktion
--     zaehlt als Eigentuemer und gibt nur Zahlen heraus.
--
--     Kunden nach Stufe (heutiger Stand, ohne Archiv, Geloeschte, Testdaten):
--       leads          neuer Lead bis Follow-up (Rang 0 bis 3)
--       beratung       Erstgespraech bis Objekt-Follow-up (4 bis 10)
--       kaufphase      Reservierung bis Notar (11 bis 15)
--       abgeschlossen  Faelligkeit bis Bestand (16 bis 19)
--       verloren       archiviert oder verloren (20, 21)
--     Im Zeitraum:
--       termine          Buchungen des Partners, nicht abgesagt
--       reservierungen   unterschriebene Reservierungen (rvSignedAt)
--       notartermine     Notartermine (notarData.datum, sonst notarTermin)
--     Aktivitaet:
--       letzte_aktivitaet  juengster Eintrag im activity_log des Partners
--       letzter_login      juengste Anmeldung oder Sichtung
--
-- Aendert keine Daten. Mehrfach ausfuehrbar. Voraussetzungen:
-- 20261016100000, 20261016237000, 20261022120000.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.struktur_kennzahlen(_von date DEFAULT (current_date - 30), _bis date DEFAULT current_date)
RETURNS TABLE(
  partner_id uuid,
  ebene integer,
  kunden_gesamt integer,
  leads integer,
  beratung integer,
  kaufphase integer,
  abgeschlossen integer,
  verloren integer,
  termine integer,
  reservierungen integer,
  notartermine integer,
  letzte_aktivitaet timestamptz,
  letzter_login timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH umfang AS (
    -- Vertriebspartner: die eigene Struktur nach unten.
    SELECT m.mitglied_id AS id, m.ebene
      FROM public.meine_struktur() m
     WHERE public.ist_nur_vertriebspartner(auth.uid())
    UNION
    -- Vertriebsleitung, Admin, Inhaber: alle Vertriebspartner.
    SELECT DISTINCT r.user_id, NULL::integer
      FROM public.user_roles r
     WHERE r.role = 'vertriebspartner'
       AND public.ist_vertriebsleitung(auth.uid())
  ),
  kunden AS (
    SELECT k.zustaendig_id AS id,
           public.buchung_pipeline_rang(coalesce(nullif(k.meta ->> 'pipelineStufe', ''), 'neuer_lead')) AS rang
      FROM public.kontakte k
     WHERE k.zustaendig_id IN (SELECT id FROM umfang)
       AND coalesce(k.archiviert, false) = false
       AND coalesce(k.geloescht, false) = false
       AND coalesce(k.meta ->> '_excludeFromStats', '') <> 'true'
       AND coalesce(k.meta ->> '_testData', '') <> 'true'
  ),
  vorgaenge AS (
    SELECT k.zustaendig_id AS id, i.meta
      FROM public.investments i
      JOIN public.kontakte k ON k.id = i.kunde_id
     WHERE k.zustaendig_id IN (SELECT id FROM umfang)
       AND coalesce(i.status, '') NOT IN ('storniert', 'geloescht', 'verloren')
       AND coalesce(i.meta ->> '_excludeFromStats', '') <> 'true'
       AND coalesce(i.meta ->> '_testData', '') <> 'true'
  )
  SELECT
    u.id,
    u.ebene,
    (SELECT count(*) FROM kunden x WHERE x.id = u.id)::integer,
    (SELECT count(*) FROM kunden x WHERE x.id = u.id AND x.rang BETWEEN -1 AND 3)::integer,
    (SELECT count(*) FROM kunden x WHERE x.id = u.id AND x.rang BETWEEN 4 AND 10)::integer,
    (SELECT count(*) FROM kunden x WHERE x.id = u.id AND x.rang BETWEEN 11 AND 15)::integer,
    (SELECT count(*) FROM kunden x WHERE x.id = u.id AND x.rang BETWEEN 16 AND 19)::integer,
    (SELECT count(*) FROM kunden x WHERE x.id = u.id AND x.rang >= 20)::integer,
    (SELECT count(*) FROM public.buchungen b
      WHERE b.mitarbeiter_id = u.id
        AND b.status <> 'abgesagt'
        AND b.start_at >= _von AND b.start_at < _bis + 1)::integer,
    (SELECT count(*) FROM vorgaenge v
      WHERE v.id = u.id
        AND v.meta ->> 'rvSigned' = 'true'
        AND public.kennzahl_datum(v.meta ->> 'rvSignedAt') BETWEEN _von AND _bis)::integer,
    (SELECT count(*) FROM vorgaenge v
      WHERE v.id = u.id
        AND public.kennzahl_datum(coalesce(nullif(v.meta -> 'notarData' ->> 'datum', ''), v.meta ->> 'notarTermin'))
            BETWEEN _von AND _bis)::integer,
    (SELECT max(a.created_at) FROM public.activity_log a WHERE a.actor_id = u.id),
    (SELECT max(greatest(l.logged_in_at, l.last_seen_at)) FROM public.login_sessions l WHERE l.user_id = u.id)
  FROM umfang u;
$$;

COMMENT ON FUNCTION public.struktur_kennzahlen(date, date) IS
  'Zahlen je Partner fuer den Strukturbaum, ohne Kundennamen. Vertriebspartner: '
  'eigene Struktur; Vertriebsleitung, Admin, Inhaber: alle Vertriebspartner.';

REVOKE ALL ON FUNCTION public.struktur_kennzahlen(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.struktur_kennzahlen(date, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
