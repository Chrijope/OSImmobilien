-- ===========================================================================
-- Meta Pixel nur mit Anlage 4 oder Bestandsschutz
-- ===========================================================================
--
-- AUSGANGSLAGE
--
-- Christians Entscheidung vom 26.09.2026 (Variante A): Ein eigenes Meta Pixel
-- auf den Partnerseiten setzt Anlage 4 zum Vertriebspartnervertrag voraus
-- (gemeinsame Verantwortlichkeit nach Art. 26 DSGVO, Vertragsfassung
-- 2026-09-26). Bestandspartner bekommen keine Zusatzvereinbarung. Wer vor
-- dieser Aenderung schon eine Pixel-ID oder ein Conversions-API-Token
-- hinterlegt hatte, behaelt sie.
--
-- Die Pixel-ID steht in user_settings, und diese Zeile schreibt der Partner
-- selbst. Der Bestandsschutz braucht deshalb eine Liste, die er nicht
-- schreiben kann. Gelesen wird sie nur von den Edge Functions
-- (get-vp-microsite, submit-lead, meta-lead, vp-marketing) mit dem
-- Dienstschluessel, siehe supabase/functions/_shared/meta-pixel-freigabe.ts.
--
-- WAS DIESE MIGRATION TUT
--
-- 1. Tabelle meta_pixel_berechtigung, je Nutzer hoechstens eine Zeile:
--      bestandsschutz            Pixel-ID oder Token am Tag der Migration
--      bestandsschutz_beendet_am gesetzt, sobald die Pixel-ID entfernt wird
--      gesperrt_am, gesperrt_grund  Sperre durch die Verwaltung (Anlage 4
--                                § 10 Absatz 3), wirkt auch gegen Vertrag
--                                und Bestandsschutz
--    Kein Zugriff fuer anon und angemeldete Nutzer, nur die Service-Rolle.
-- 2. Einmalige Befuellung aus dem heutigen Datenstand: alle Nutzer mit einer
--    nicht leeren metaPixelId oder einem nicht leeren meta_capi_token.
--    Die Befuellung laeuft nur beim Anlegen der Tabelle. Ein zweiter Lauf
--    aendert nichts, auch nicht, wenn inzwischen jemand eine Pixel-ID
--    eingetragen hat. Genau das soll kein Bestandsschutz werden.
-- 3. Funktion meta_pixel_entfernen(user_id), nur Service-Rolle, fuer die
--    Aktion "entfernen" der Edge Function vp-marketing (Einstellungen,
--    Knopf "Entfernen"). In einer Transaktion:
--      a) Pixel-ID in user_settings leeren,
--      b) Conversions-API-Token loeschen, denn ohne Pixel hat die
--         Gesellschaft keinen Grund mehr, es zu verwahren (Anlage 4 § 6
--         Absatz 2),
--      c) einen Bestandsschutz beenden. Wer spaeter wieder eine Pixel-ID
--         eintraegt, braucht dann den Vertrag mit Anlage 4.
--    Scheitert ein Schritt, scheitert alles, und die Oberflaeche zeigt den
--    Fehler (Codex-Pruefung 27.09.2026, A4-07).
--    Fuer Neupartner aendert das nichts: Ihr Vertrag gilt weiter, sie
--    koennen jederzeit wieder eine Pixel-ID eintragen.
-- 4. Ausloeser auf user_settings als Sicherheitsnetz fuer jeden anderen Weg,
--    auf dem eine nicht leere Pixel-ID geleert wird (oder die Zeile
--    verschwindet): dieselben Schritte b) und c). Ein Fehler darin bricht
--    das Speichern ab, statt still verschluckt zu werden.
--
-- Sperren und Entsperren durch die Verwaltung, im SQL-Editor:
--   insert into public.meta_pixel_berechtigung (user_id, gesperrt_am, gesperrt_grund)
--   values ('<Kennung>', now(), '<Grund>')
--   on conflict (user_id) do update set gesperrt_am = now(), gesperrt_grund = excluded.gesperrt_grund;
--   update public.meta_pixel_berechtigung set gesperrt_am = null, gesperrt_grund = null where user_id = '<Kennung>';
--
-- Wiederholbar: Alles ist mit IF NOT EXISTS, CREATE OR REPLACE und
-- DROP ... IF EXISTS geschrieben.
-- ===========================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.meta_pixel_berechtigung') IS NULL THEN
    CREATE TABLE public.meta_pixel_berechtigung (
      user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      bestandsschutz boolean NOT NULL DEFAULT false,
      bestandsschutz_beendet_am timestamptz,
      gesperrt_am timestamptz,
      gesperrt_grund text,
      erfasst_am timestamptz NOT NULL DEFAULT now()
    );

    -- Einmalige Befuellung, nur hier beim Anlegen.
    INSERT INTO public.meta_pixel_berechtigung (user_id, bestandsschutz)
    SELECT us.user_id, true
      FROM public.user_settings us
     WHERE coalesce(btrim(us.einstellungen -> 'marketing' ->> 'metaPixelId'), '') <> ''
       AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = us.user_id)
    ON CONFLICT (user_id) DO NOTHING;

    IF to_regclass('public.vp_marketing_einstellungen') IS NOT NULL THEN
      INSERT INTO public.meta_pixel_berechtigung (user_id, bestandsschutz)
      SELECT v.user_id, true
        FROM public.vp_marketing_einstellungen v
       WHERE coalesce(btrim(v.meta_capi_token), '') <> ''
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  END IF;
END $$;

COMMENT ON TABLE public.meta_pixel_berechtigung IS
  'Meta Pixel der Partner: Bestandsschutz (Stand 27.09.2026) und Sperre durch '
  'die Verwaltung. Nur Service-Rolle. Siehe _shared/meta-pixel-freigabe.ts.';

ALTER TABLE public.meta_pixel_berechtigung ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meta_pixel_berechtigung FROM anon, authenticated, public;
GRANT ALL ON public.meta_pixel_berechtigung TO service_role;

CREATE OR REPLACE FUNCTION public.meta_pixel_entfernt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alt text := coalesce(btrim(OLD.einstellungen -> 'marketing' ->> 'metaPixelId'), '');
  neu text := '';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    neu := coalesce(btrim(NEW.einstellungen -> 'marketing' ->> 'metaPixelId'), '');
  END IF;
  IF alt = '' OR neu <> '' THEN
    RETURN NULL;
  END IF;

  -- Kein Abfangen: Scheitert ein Schritt, scheitert das Speichern, und der
  -- Fehler ist sichtbar (A4-07).
  IF to_regclass('public.vp_marketing_einstellungen') IS NOT NULL THEN
    EXECUTE 'UPDATE public.vp_marketing_einstellungen
                SET meta_capi_token = NULL, updated_at = now()
              WHERE user_id = $1 AND meta_capi_token IS NOT NULL'
      USING OLD.user_id;
  END IF;
  UPDATE public.meta_pixel_berechtigung
     SET bestandsschutz_beendet_am = now()
   WHERE user_id = OLD.user_id
     AND bestandsschutz
     AND bestandsschutz_beendet_am IS NULL;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.meta_pixel_entfernt() FROM public, anon, authenticated;

-- Die Aktion "entfernen": Pixel-ID leeren, Token loeschen, Bestandsschutz
-- beenden, alles in einer Transaktion. Das Leeren loest zusaetzlich den
-- Ausloeser unten aus; der findet dann nichts mehr zu tun.
CREATE OR REPLACE FUNCTION public.meta_pixel_entfernen(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'meta_pixel_entfernen: keine Nutzerkennung';
  END IF;
  UPDATE public.user_settings
     SET einstellungen = jsonb_set(
           coalesce(einstellungen, '{}'::jsonb),
           '{marketing}',
           coalesce(einstellungen -> 'marketing', '{}'::jsonb) || '{"metaPixelId": ""}'::jsonb),
         updated_at = now()
   WHERE user_id = p_user_id
     AND coalesce(btrim(einstellungen -> 'marketing' ->> 'metaPixelId'), '') <> '';
  IF to_regclass('public.vp_marketing_einstellungen') IS NOT NULL THEN
    EXECUTE 'UPDATE public.vp_marketing_einstellungen
                SET meta_capi_token = NULL, updated_at = now()
              WHERE user_id = $1 AND meta_capi_token IS NOT NULL'
      USING p_user_id;
  END IF;
  UPDATE public.meta_pixel_berechtigung
     SET bestandsschutz_beendet_am = now()
   WHERE user_id = p_user_id
     AND bestandsschutz
     AND bestandsschutz_beendet_am IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.meta_pixel_entfernen(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meta_pixel_entfernen(uuid) TO service_role;

DROP TRIGGER IF EXISTS trg_meta_pixel_entfernt ON public.user_settings;
CREATE TRIGGER trg_meta_pixel_entfernt
  AFTER UPDATE OR DELETE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.meta_pixel_entfernt();

COMMIT;
