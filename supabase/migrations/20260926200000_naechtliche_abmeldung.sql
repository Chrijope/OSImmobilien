-- ===========================================================================
-- Nächtliche Abmeldung und Sitzungen beenden, die wirklich enden
-- ===========================================================================
--
-- Christian am 26.09.2026, alle fünf Punkte freigegeben:
--
-- 1. Jede Nacht um 03:30 Uhr deutscher Zeit werden alle Konten abgemeldet,
--    außer Kunden und Bewerbern. Also auch Admin, Inhaber und Testkonten.
-- 2. Kunden und Bewerber bleiben nachts angemeldet. Ihre Sitzungen enden erst,
--    wenn sie älter als 30 Tage sind; das erledigt derselbe Lauf.
-- 5. Sperren beendet die Sitzungen wirklich. Bisher rief die Edge Function
--    `manage-sessions` `auth.admin.signOut(<Nutzerkennung>)` auf. Diese
--    Methode erwartet aber das Zugangstoken der Sitzung, keine Kennung; der
--    Aufruf scheiterte jedes Mal, und ein gesperrter Nutzer arbeitete im
--    offenen Fenster weiter. Die Function ruft ab jetzt
--    `public.sitzungen_beenden(<Nutzerkennung>)` aus dieser Migration.
--
-- Wie eine Abmeldung technisch geht: Jede Anmeldung ist eine Zeile in
-- `auth.sessions`. Das Erneuerungstoken (`auth.refresh_tokens`) hängt per
-- Fremdschlüssel mit ON DELETE CASCADE an dieser Zeile, verschwindet also mit.
-- Ohne Sitzung scheitert die nächste Erneuerung im Browser, und die Seite
-- schickt zur Anmeldung. Das Zugangstoken, das der Browser schon in der Hand
-- hat, gilt bis zu seinem Ablauf weiter (höchstens eine Stunde). Prüfzeile
-- 16.5 in `99_PRUEFUNG.sql` sieht nach, ob der Fremdschlüssel wirklich
-- mitlöscht.
--
-- Wer nachts abgemeldet wird: Jedes Konto, das mindestens eine Rolle außer
-- `kunde` und `bewerber` trägt, und jedes Konto ohne Rolle. Wer also Kunde
-- UND Vertriebspartner ist, wird nachts abgemeldet. Ein Konto ohne Rolle gilt
-- als intern und nicht als Kunde, damit im Zweifel die strengere Regel greift.
--
-- Zeitplan: pg_cron rechnet in UTC. 03:30 deutscher Zeit ist im Sommer 01:30
-- UTC und im Winter 02:30 UTC. Der Job läuft deshalb stündlich zur halben
-- Stunde, und die Funktion arbeitet nur, wenn es in Berlin zwischen 03:30 und
-- 03:59 Uhr ist und für diesen Tag noch kein Lauf im Protokoll steht. So
-- stimmt die Uhrzeit an beiden Umstellungstagen, und es spielt keine Rolle,
-- auf welche Zeitzone pg_cron eingestellt ist. Die übrigen 23 Aufrufe am Tag
-- kehren sofort zurück.
--
-- Protokoll: `public.naechtliche_abmeldung_laeufe`, eine Zeile je Nacht mit
-- der Zahl der beendeten Sitzungen. Lesen nur im SQL-Editor, im Browser ist
-- die Tabelle für niemanden sichtbar.
--
-- Mehrfach ausführbar. Ohne diese Migration bleibt alles wie heute; das
-- Beenden fremder Sitzungen meldet dann „Migration ausstehend“.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Protokoll der nächtlichen Läufe
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.naechtliche_abmeldung_laeufe (
  lauf_tag          date PRIMARY KEY,
  gelaufen_am       timestamptz NOT NULL DEFAULT now(),
  sitzungen_nacht   integer NOT NULL DEFAULT 0,
  sitzungen_30_tage integer NOT NULL DEFAULT 0
);

ALTER TABLE public.naechtliche_abmeldung_laeufe ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.naechtliche_abmeldung_laeufe FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.naechtliche_abmeldung_laeufe IS
  'Eine Zeile je Nacht (deutsches Datum): wie viele Sitzungen die naechtliche Abmeldung beendet hat. '
  'sitzungen_nacht = alle Konten ausser Kunde und Bewerber, sitzungen_30_tage = Kunden und Bewerber mit Sitzungen aelter als 30 Tage.';

-- ---------------------------------------------------------------------------
-- 2) Alle Sitzungen eines Kontos beenden (Sperren, „Sitzungen beenden“)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sitzungen_beenden(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _anzahl integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'sitzungen_beenden: Nutzerkennung fehlt';
  END IF;

  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS _anzahl = ROW_COUNT;
  RETURN _anzahl;
END;
$$;

REVOKE ALL ON FUNCTION public.sitzungen_beenden(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sitzungen_beenden(uuid) TO service_role;

COMMENT ON FUNCTION public.sitzungen_beenden(uuid) IS
  'Loescht alle Sitzungen eines Kontos in auth.sessions (Erneuerungstoken gehen per Fremdschluessel mit). '
  'Nur fuer die Edge Function manage-sessions mit Service-Rolle; die Pruefung, wer wen abmelden darf, macht die Function.';

-- ---------------------------------------------------------------------------
-- 3) Der nächtliche Lauf
-- ---------------------------------------------------------------------------
--
-- p_jetzt ist nur für Tests da. Der Zeitplan ruft die Funktion ohne Argument.

CREATE OR REPLACE FUNCTION public.naechtliche_abmeldung(p_jetzt timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _ortszeit timestamp := p_jetzt AT TIME ZONE 'Europe/Berlin';
  _nacht    integer;
  _alt      integer;
BEGIN
  IF _ortszeit::time < time '03:30' OR _ortszeit::time >= time '04:00' THEN
    RETURN format('Uebersprungen: in Berlin ist es %s, gearbeitet wird nur 03:30 bis 03:59.',
                  to_char(_ortszeit, 'HH24:MI'));
  END IF;

  -- Der Eintrag ist zugleich die Sperre gegen einen zweiten Lauf am selben
  -- Tag. Scheitert unten etwas, rollt er mit zurück.
  INSERT INTO public.naechtliche_abmeldung_laeufe (lauf_tag, gelaufen_am)
  VALUES (_ortszeit::date, p_jetzt)
  ON CONFLICT (lauf_tag) DO NOTHING;
  IF NOT FOUND THEN
    RETURN format('Uebersprungen: fuer den %s steht schon ein Lauf im Protokoll.',
                  to_char(_ortszeit::date, 'DD.MM.YYYY'));
  END IF;

  -- Kunden und Bewerber: Konten, deren Rollen ausnahmslos kunde oder bewerber
  -- sind. Alle anderen, auch Konten ohne Rolle, werden nachts abgemeldet.
  DELETE FROM auth.sessions s
   WHERE NOT EXISTS (
     SELECT 1 FROM public.user_roles r
      WHERE r.user_id = s.user_id
      GROUP BY r.user_id
     HAVING bool_and(r.role::text IN ('kunde', 'bewerber'))
   );
  GET DIAGNOSTICS _nacht = ROW_COUNT;

  DELETE FROM auth.sessions s
   WHERE s.created_at < p_jetzt - interval '30 days'
     AND EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.user_id = s.user_id
        GROUP BY r.user_id
       HAVING bool_and(r.role::text IN ('kunde', 'bewerber'))
     );
  GET DIAGNOSTICS _alt = ROW_COUNT;

  UPDATE public.naechtliche_abmeldung_laeufe
     SET sitzungen_nacht = _nacht, sitzungen_30_tage = _alt
   WHERE lauf_tag = _ortszeit::date;

  -- Die eigene Liste „Aktive Sitzungen“ in den Einstellungen nachziehen. Sie
  -- ist nur Anzeige; scheitert das, bleibt die Abmeldung trotzdem bestehen.
  BEGIN
    UPDATE public.login_sessions l
       SET aktiv = false
     WHERE l.aktiv
       AND NOT EXISTS (
         SELECT 1 FROM public.user_roles r
          WHERE r.user_id = l.user_id
          GROUP BY r.user_id
         HAVING bool_and(r.role::text IN ('kunde', 'bewerber'))
       );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'login_sessions nicht nachgezogen: %', SQLERRM;
  END;

  RETURN format('Gelaufen: %s Sitzungen nachts beendet, %s Kunden- und Bewerbersitzungen aelter als 30 Tage.',
                _nacht, _alt);
END;
$$;

REVOKE ALL ON FUNCTION public.naechtliche_abmeldung(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.naechtliche_abmeldung(timestamptz) TO service_role;

COMMENT ON FUNCTION public.naechtliche_abmeldung(timestamptz) IS
  'Naechtliche Abmeldung um 03:30 Uhr deutscher Zeit, Aufruf stuendlich durch pg_cron (Job naechtliche-abmeldung). '
  'Arbeitet nur im Berliner Zeitfenster 03:30 bis 03:59 und hoechstens einmal je Tag.';

COMMIT;

-- ---------------------------------------------------------------------------
-- 4) Zeitplan: stündlich zur halben Stunde
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron ist nicht installiert, der Zeitplan wurde nicht gesetzt.';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'naechtliche-abmeldung') THEN
    PERFORM cron.unschedule('naechtliche-abmeldung');
  END IF;
  PERFORM cron.schedule(
    'naechtliche-abmeldung',
    '30 * * * *',
    'SELECT public.naechtliche_abmeldung();'
  );
  RAISE NOTICE 'Zeitplan "naechtliche-abmeldung" gesetzt: stuendlich zur halben Stunde, wirksam nur um 03:30 Uhr deutscher Zeit.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Zeitplan fuer die naechtliche Abmeldung nicht gesetzt: %. Bitte von Hand anlegen.', SQLERRM;
END $$;

-- Nachsehen, erwartet wird eine Zeile mit '30 * * * *':
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'naechtliche-abmeldung';
