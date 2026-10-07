-- merge_kontakt_meta: Rechteausweitung schliessen
--
-- Befund: Die RPC public.merge_kontakt_meta (zuletzt definiert in Migration
-- 20260611201747, erstmals in 20260323080708) laeuft als SECURITY DEFINER und
-- hatte KEINE Autorisierungspruefung. EXECUTE ist an "authenticated" vergeben
-- (20260525080225, 20260601141419). Damit konnte jeder eingeloggte Nutzer, auch
-- mit Rolle kunde oder tippgeber, das meta JEDES Kontakts ueberschreiben, wenn
-- er die UUID kannte. Weil die RLS-Policies von kontakte, investments und
-- finanzierungen die Eigentuemerschaft an meta->>'authUserId' festmachen, liess
-- sich darueber Lesezugriff auf fremde Kundendaten erschleichen.
--
-- Diese Migration ersetzt die Funktion (Name, Signatur und Rueckgabetyp bleiben
-- unveraendert, die GRANTs bleiben wie sie sind) und ergaenzt zwei Stufen:
--
-- 1. Autorisierung, nach dem Muster von public.merge_investment_meta
--    (Migration 20260522125029): erlaubt sind interne Rollen und der
--    Eigentuemer des Kontakts (Person 1 oder Person 2).
--    Aufrufe ohne auth.uid() gelten als Service-Role. Das ist eindeutig, weil
--    EXECUTE fuer anon und public widerrufen ist (20260517104512,
--    20260525080225, 20260601141419) und ein authenticated-JWT immer eine
--    User-ID hat. Die Edge Functions (follow-up-eskalation,
--    send-erstgespraech-reminders, finalize-selbstauskunft,
--    send-followup-overdue-nudges) laufen so weiter wie bisher.
--
-- 2. Schluessel-Whitelist fuer nicht-interne Aufrufer. Interne Rollen und die
--    Service-Role behalten den vollen Deep-Merge. Ein Kunde darf am EIGENEN
--    Kontakt nur noch die Felder setzen, die das Portal wirklich schreibt:
--      steuersatzManuell                      src/components/kunde/SteuerCockpitCard.tsx
--      deletionRequestedAt, deletionRequestedBy  src/pages/KundeEinstellungen.tsx
--      portalErstLogin                        src/components/kunde/KundenMfaGuard.tsx
--      portalAktiv, portalFreigeschalten,
--      portalAktivAt                          src/pages/ResetPassword.tsx
--    Alle anderen Schluessel werden verworfen (im Log vermerkt), insbesondere
--    authUserId, person2, pipelineStufe und unterlagenFreigeschaltet.
--    Bewusst NICHT in der Whitelist: portalGesperrt. ResetPassword.tsx setzt es
--    heute auf false; das ist die Portal-Sperre des Vertriebspartners, ein Kunde
--    soll sie nicht selbst aufheben koennen. Bei einer normalen Aktivierung ist
--    der Schluessel ohnehin nicht gesetzt, der Ablauf bleibt also unveraendert.
--
-- Die Whitelist ist bewusst als Liste am Anfang der Funktion gehalten, damit
-- neue Portal-Felder dort ergaenzt werden koennen.

CREATE OR REPLACE FUNCTION public.merge_kontakt_meta(_kontakt_id uuid, _updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Schluessel, die ein Kunde an seinem eigenen Kontakt setzen darf
  _erlaubte_schluessel text[] := ARRAY[
    'steuersatzManuell',
    'deletionRequestedAt',
    'deletionRequestedBy',
    'portalErstLogin',
    'portalAktiv',
    'portalFreigeschalten',
    'portalAktivAt'
  ];
  _kontakt_meta jsonb;
  _ist_intern boolean;
  _wirksam jsonb;
  _schluessel text;
  _verworfen text[] := ARRAY[]::text[];
  _result jsonb;
BEGIN
  SELECT meta INTO _kontakt_meta FROM public.kontakte WHERE id = _kontakt_id;
  IF NOT FOUND THEN
    -- Neutrale Meldung: keine Auskunft darueber, ob die UUID existiert
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- auth.uid() IS NULL = Service-Role (Edge Functions), anon hat kein EXECUTE
  _ist_intern := auth.uid() IS NULL OR public.is_internal_role(auth.uid());

  IF NOT (
    _ist_intern
    OR (_kontakt_meta ->> 'authUserId') = auth.uid()::text
    OR ((_kontakt_meta -> 'person2') ->> 'authUserId') = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  _wirksam := COALESCE(_updates, '{}'::jsonb);

  IF NOT _ist_intern THEN
    _wirksam := '{}'::jsonb;
    FOR _schluessel IN SELECT jsonb_object_keys(COALESCE(_updates, '{}'::jsonb)) LOOP
      IF _schluessel = ANY(_erlaubte_schluessel) THEN
        _wirksam := _wirksam || jsonb_build_object(_schluessel, _updates -> _schluessel);
      ELSE
        _verworfen := _verworfen || _schluessel;
      END IF;
    END LOOP;

    IF array_length(_verworfen, 1) > 0 THEN
      RAISE LOG 'merge_kontakt_meta: nicht erlaubte Schluessel verworfen (%)',
        array_to_string(_verworfen, ', ');
    END IF;
  END IF;

  -- Nichts Erlaubtes uebrig: unveraenderten Stand zurueckgeben, nicht schreiben
  IF _wirksam = '{}'::jsonb THEN
    RETURN COALESCE(_kontakt_meta, '{}'::jsonb);
  END IF;

  UPDATE kontakte
  SET meta = public.jsonb_deep_merge(COALESCE(meta, '{}'::jsonb), _wirksam),
      aktualisiert_am = now()
  WHERE id = _kontakt_id
  RETURNING meta INTO _result;

  RETURN COALESCE(_result, '{}'::jsonb);
END;
$$;
