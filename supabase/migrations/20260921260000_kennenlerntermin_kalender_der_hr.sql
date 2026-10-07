-- Die Bewerberseite zeigt den Kalender der zuständigen HR-Person
--
-- Bisher stand die Kalenderadresse als feste Zeile im Quelltext der Seite
-- (`KOOPERATION_KALENDER_URL`). Wechselt die Person, die die Kennenlerngespräche
-- führt, müsste jemand den Quelltext ändern und neu ausrollen. GL hat am
-- 21.09.2026 entschieden: Es soll der persönliche Buchungslink derjenigen sein,
-- die den Bewerberprozess tatsächlich betreut.
--
-- ## Wer ist gemeint
--
-- Genau die Person, die auch unter den Bewerbermails steht. Sie ist in
-- `app_config` unter dem Schlüssel `bewerber_ansprechpartner` festgelegt, und
-- zwar über ihre **Kennung** und nicht über ihren Namen. Zwei Konten mit
-- demselben Namen gab es hier schon, und drei Stellen im Programm haben deshalb
-- einmal die falsche Person gefunden. Derselbe Weg steht in
-- `supabase/functions/_shared/hr-ansprechpartner.ts`, diese Funktion bildet ihn
-- in SQL nach.
--
-- Fehlt der Eintrag, gilt wie dort die Rolle `hr`, sortiert nach `user_id`.
-- Willkürlich, aber stabil: Derselbe Bewerber sieht bei jedem Aufruf denselben
-- Kalender.
--
-- ## Welche der vier Spalten
--
-- Ein Profil hat vier Buchungslinks: `buchungslink` (Erstgespräch),
-- `beratungslink`, `objektlink` und `finanzierungslink`. Die letzten drei
-- gehören zum Kundenweg, ein Bewerber hat damit nichts zu tun. Das
-- Kennenlerngespräch ist das erste Gespräch überhaupt, also `buchungslink`.
--
-- ## Was bewusst NICHT herausgegeben wird
--
-- Die Funktion ist ohne Anmeldung erreichbar, jeder mit einem Token ruft sie
-- auf. Herausgegeben wird deshalb ausschliesslich die Kalenderadresse. Sie ist
-- ohnehin öffentlich, man bucht dort ohne Anmeldung. Name, Telefonnummer und
-- Mailadresse der HR-Person bleiben drin: Sie stehen bereits in der
-- Einladungsmail, und eine öffentliche Funktion ist nicht der Ort, sie ein
-- zweites Mal auszuliefern.
--
-- Nur `https` wird durchgelassen. Was in einem Profilfeld steht, hat niemand
-- geprüft, und die Adresse landet in einem eingebetteten Rahmen.

-- ── Der Kalender für das Kennenlerngespräch ───────────────────────────────
CREATE OR REPLACE FUNCTION public.bewerber_kennenlern_kalender()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kennung_text text;
  _kennung uuid;
  _link text;
BEGIN
  -- Zuerst die ausdrückliche Wahl, dann die Rolle. Sie steht vorn, weil sie
  -- eine Entscheidung ist und die Rolle nur eine Näherung.
  SELECT c.wert ->> 'userId' INTO _kennung_text
    FROM public.app_config c
   WHERE c.schluessel = 'bewerber_ansprechpartner'
   LIMIT 1;

  /*
   * Die Form wird geprüft, bevor umgewandelt wird. Am 21.09.2026 stand in
   * dieser Einstellung der Platzhalter aus einer Anleitung statt einer echten
   * Kennung; ohne diese Prüfung bricht die Umwandlung ab und reisst die ganze
   * Antwort mit, obwohl die Rolle die Frage beantworten könnte.
   */
  IF _kennung_text IS NOT NULL
     AND btrim(_kennung_text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    _kennung := btrim(_kennung_text)::uuid;
    SELECT NULLIF(btrim(COALESCE(p.buchungslink, '')), '')
      INTO _link
      FROM public.profiles p
     WHERE p.id = _kennung;
    IF _link IS NOT NULL THEN
      RETURN CASE WHEN _link ~* '^https://' THEN _link ELSE NULL END;
    END IF;
  END IF;

  -- Kein Eintrag, oder die eingetragene Person hat keinen Kalender hinterlegt:
  -- dann gilt die Rolle.
  SELECT NULLIF(btrim(COALESCE(p.buchungslink, '')), '')
    INTO _link
    FROM public.user_roles r
    JOIN public.profiles p ON p.id = r.user_id
   WHERE r.role = 'hr'
     AND btrim(COALESCE(p.buchungslink, '')) ~* '^https://'
   ORDER BY r.user_id
   LIMIT 1;

  RETURN _link;
END;
$$;

COMMENT ON FUNCTION public.bewerber_kennenlern_kalender() IS
  'Der Buchungslink der fuer Bewerber zustaendigen HR-Person, ueber app_config.bewerber_ansprechpartner, ersatzweise ueber die Rolle hr.';

REVOKE ALL ON FUNCTION public.bewerber_kennenlern_kalender() FROM public;
-- Bewusst kein GRANT an anon oder authenticated: Diese Funktion wird
-- ausschliesslich aus der Zugangsfunktion darunter heraus aufgerufen, und die
-- prueft vorher das Token.

-- ── Wer bin ich, wo buche ich, und steht mein Termin schon? ───────────────
--
-- Gegenüber 20260921140000 kommt genau ein Feld dazu: `kalender`. Alles andere
-- bleibt Wort für Wort, damit ein Vergleich der beiden Fassungen zeigt, was
-- sich geändert hat.
CREATE OR REPLACE FUNCTION public.bewerber_kennenlerntermin_zugang(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bewerbung_id uuid;
  _vorname text;
  _meta jsonb;
BEGIN
  IF _token IS NULL OR btrim(_token) = '' THEN
    RETURN NULL;
  END IF;

  SELECT f.bewerbung_id INTO _bewerbung_id
    FROM public.bewerber_formular f
   WHERE f.token = _token
     AND f.status = 'eingereicht'
   ORDER BY f.created_at DESC
   LIMIT 1;

  IF _bewerbung_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT b.vorname, COALESCE(b.meta, '{}'::jsonb)
    INTO _vorname, _meta
    FROM public.bewerbungen b
   WHERE b.id = _bewerbung_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'vorname', COALESCE(_vorname, ''),
    'datum', COALESCE(_meta->>'erstgespraechDatum', ''),
    'uhrzeit', COALESCE(_meta->>'erstgespraechUhrzeit', ''),
    'quelle', COALESCE(_meta->>'erstgespraechQuelle', ''),
    -- Leerer Text und nicht NULL: Die Seite unterscheidet "das Feld gibt es
    -- noch nicht" (Migration offen) von "es ist keine Adresse hinterlegt".
    'kalender', COALESCE(public.bewerber_kennenlern_kalender(), '')
  );
END;
$$;

COMMENT ON FUNCTION public.bewerber_kennenlerntermin_zugang(text) IS
  'Oeffentlicher Zugang der Bewerber-Terminseite: Vorname, eigener Termin und die Kalenderadresse der zustaendigen HR-Person. Mehr nicht.';

REVOKE ALL ON FUNCTION public.bewerber_kennenlerntermin_zugang(text) FROM public;
GRANT EXECUTE ON FUNCTION public.bewerber_kennenlerntermin_zugang(text) TO anon, authenticated;
