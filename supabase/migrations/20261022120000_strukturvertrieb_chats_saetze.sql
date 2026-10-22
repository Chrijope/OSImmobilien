-- ===========================================================================
-- Strukturvertrieb: Chats in der Struktur, Saetze je Ebene
-- ===========================================================================
--
-- CHRISTIANS ENTSCHEIDUNG (22.10.2026)
--
--   Chats
--   - Der Kundenchat bleibt 1:1 zwischen Partner und Kunde (sobald das
--     Kundenportal freigeschaltet ist). Er aendert sich hier nicht.
--   - Eroeffnet ein Vertriebspartner einen internen Chat, sind sein direkter
--     Teamleiter und die Vertriebsleitung automatisch dabei.
--   - Vertriebspartner laden nur Partner aus ihrer Struktur nach unten ein.
--   - Nur die Vertriebsleitung (und Admin, Inhaber) laedt weitere Rollen ein:
--     Backoffice, Buchhaltung, Admin, Inhaber, Finanzierungs-, Objektpartner
--     und alle anderen.
--   Saetze
--   - Kein Partner bekommt mehr als sein direkter Teamleiter. Gleicher Satz:
--     keine Differenz fuer den Teamleiter; niedrigerer Satz: Differenz.
--
-- WAS DIESE MIGRATION TUT
--
--   1. struktur_chat_teilnehmer_ergaenzen(chat, bezugsperson): traegt den
--      direkten Teamleiter und alle Vertriebsleiter ein, wenn der Ersteller
--      eines internen Chats Vertriebspartner ist (ohne Leitungsrolle).
--      Aufgerufen vom neuen Trigger auf chat_gruppen (Anlage). Kundenchats
--      und Tippgeber-Chats bleiben aussen vor.
--   2. chat_teilnehmer_eintragen: neue Grenzen fuer Nicht-Admins, siehe dort.
--   3. struktur_satz_grenzen(partner) und die Pruefung in
--      struktur_satz_setzen und im Schutz-Trigger: hoechstens der Satz des
--      direkten Teamleiters, mindestens der hoechste Satz direkt darunter.
--      Gilt fuer jeden Schreibweg, auch Admin, Inhaber, Server und Einladung,
--      und auch wenn sich der Teamleiter aendert.
--
-- WAS SICH NICHT AENDERT
--
--   Keine Bestandsdaten: Bestehende Chats bekommen niemanden nachgetragen,
--   wer heute in einem Chat sitzt, bleibt drin. Admin und Inhaber duerfen
--   weiter alles. Kundenchats: Abgleich (kundenchat_teilnehmer_abgleichen)
--   unveraendert; eintragen duerfen dort ausser Admin und Inhaber nur die
--   Kundenkonten des Kontakts, damit er 1:1 bleibt.
--
-- Mehrfach ausfuehrbar. Voraussetzungen: 20260930120000, 20261016100000.
-- ===========================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.struktur_unter(uuid)') IS NULL
     OR to_regprocedure('public.struktur_kette(uuid)') IS NULL
     OR to_regprocedure('public.chat_teilnehmer_eintragen(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Voraussetzung fehlt. Zuerst 20260930120000 und 20261016100000 ausfuehren.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 0) Wer ist "nur Vertriebspartner"?
-- ---------------------------------------------------------------------------

-- Vertriebspartner ohne Leitungsrolle. Wer zusaetzlich Vertriebsleiter, Admin
-- oder Inhaber ist, gilt als Leitung: Die RLS fragt alle Rollen einer Person,
-- nicht die gerade aktive, deshalb entscheidet hier die hoechste.
CREATE OR REPLACE FUNCTION public.ist_nur_vertriebspartner(_nutzer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_nutzer, 'vertriebspartner')
     AND NOT public.has_role(_nutzer, 'vertriebsleiter')
     AND NOT public.is_admin_role(_nutzer);
$$;

CREATE OR REPLACE FUNCTION public.ist_vertriebsleitung(_nutzer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_nutzer, 'vertriebsleiter') OR public.is_admin_role(_nutzer);
$$;

-- ---------------------------------------------------------------------------
-- 1) Teamleiter und Vertriebsleitung in Chats eines Vertriebspartners
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.struktur_chat_teilnehmer_ergaenzen(_chat_id uuid, _bezug uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _leiter uuid;
  _id uuid;
  _rolle text;
  _name text;
  _neu integer := 0;
BEGIN
  IF _chat_id IS NULL OR _bezug IS NULL OR NOT public.ist_nur_vertriebspartner(_bezug) THEN
    RETURN 0;
  END IF;

  SELECT k.leiter_id INTO _leiter FROM public.struktur_kette(_bezug) k WHERE k.ebene = 1;

  -- Erst der direkte Teamleiter, dann alle Vertriebsleiter.
  FOR _id, _rolle IN
    SELECT _leiter, 'Teamleiter' WHERE _leiter IS NOT NULL
    UNION ALL
    SELECT DISTINCT r.user_id, 'Vertriebsleitung'
      FROM public.user_roles r
     WHERE r.role = 'vertriebsleiter'
  LOOP
    IF _id = _bezug OR EXISTS (SELECT 1 FROM public.chat_teilnehmer t WHERE t.chat_id = _chat_id AND t.benutzer_id = _id) THEN
      CONTINUE;
    END IF;
    SELECT coalesce(nullif(btrim(p.name), ''), _rolle) INTO _name FROM public.profiles p WHERE p.id = _id;
    _name := coalesce(_name, _rolle);
    INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, meta)
    VALUES (_chat_id, _id, jsonb_build_object('name', _name, 'initials', upper(left(_name, 1)), 'role', _rolle));
    _neu := _neu + 1;
  END LOOP;
  RETURN _neu;
END;
$$;

COMMENT ON FUNCTION public.struktur_chat_teilnehmer_ergaenzen(uuid, uuid) IS
  'Traegt den direkten Teamleiter und alle Vertriebsleiter in einen Chat ein, '
  'wenn die Bezugsperson Vertriebspartner ohne Leitungsrolle ist. Nur Server.';

-- Nur interne Chats: Der Kundenchat bleibt 1:1, Tippgeber-Chats haben ihre
-- eigene Funktion.
CREATE OR REPLACE FUNCTION public.chat_gruppe_struktur_ergaenzen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.meta ->> 'kind', '') = 'tippgeber_vp'
     OR coalesce(NEW.typ, '') = 'kundenkommunikation'
     OR coalesce(NEW.meta ->> 'typ', '') = 'kundenkommunikation' THEN
    RETURN NEW;
  END IF;
  -- Ein Fehler hier darf die Anlage eines Chats nie verhindern.
  BEGIN
    PERFORM public.struktur_chat_teilnehmer_ergaenzen(NEW.id, NEW.erstellt_von);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Struktur-Teilnehmer fuer Chat % nicht ergaenzt: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_gruppe_struktur_ergaenzen ON public.chat_gruppen;
CREATE TRIGGER trg_chat_gruppe_struktur_ergaenzen
AFTER INSERT ON public.chat_gruppen
FOR EACH ROW
EXECUTE FUNCTION public.chat_gruppe_struktur_ergaenzen();


-- ---------------------------------------------------------------------------
-- 2) Wer darf wen eintragen
-- ---------------------------------------------------------------------------
--
-- Admin und Inhaber: jeden in jeden Chat (unveraendert).
-- Alle anderen nur in einen Chat, den sie angelegt haben oder in dem sie
-- schon sind, nie in Tippgeber-Chats, in Kundenchats nur mit Recht am
-- Kontakt (unveraendert). Neu ist, wen:
--   sich selbst          nur in den eigenen Chat (Wiedereintritt);
--   Kunde                nur in den Kundenchat seines eigenen Kontakts;
--   Kundenchat           sonst niemand: er bleibt 1:1 (Partner und Kunde);
--   ohne Konto           ja (Ansprechpartner ohne Zugang);
--   Vertriebsleitung     jede interne Rolle;
--   Vertriebspartner     nur Partner aus seiner Struktur nach unten, auch im
--                        Ansprechpartner-Chat (weitere Rollen holt dort die
--                        Vertriebsleitung dazu, die schon im Chat ist);
--   andere Rollen        interne Rollen wie bisher, ausser in Chats eines
--                        Vertriebspartners: dort laedt nur die Leitung ein.
CREATE OR REPLACE FUNCTION public.chat_teilnehmer_eintragen(p_chat_id uuid, p_teilnehmer jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  uuid_muster constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_gruppe public.chat_gruppen%ROWTYPE;
  v_admin boolean;
  v_leitung boolean;
  v_partner boolean;
  v_partnerchat boolean;
  v_kundenchat boolean;
  v_kontakt uuid;
  v_eintrag jsonb;
  v_ziel_text text;
  v_ziel uuid;
  v_neu integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet' USING ERRCODE = '42501';
  END IF;
  IF p_teilnehmer IS NULL OR jsonb_typeof(p_teilnehmer) <> 'array' THEN
    RAISE EXCEPTION 'Teilnehmer fehlen' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_gruppe FROM public.chat_gruppen WHERE id = p_chat_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Diesen Chat gibt es nicht' USING ERRCODE = 'P0002';
  END IF;

  v_admin := public.is_admin_role(v_uid);
  v_leitung := public.ist_vertriebsleitung(v_uid);
  v_partner := public.ist_nur_vertriebspartner(v_uid);
  v_kundenchat := coalesce(v_gruppe.typ, '') = 'kundenkommunikation'
               OR coalesce(v_gruppe.meta ->> 'typ', '') = 'kundenkommunikation';
  IF coalesce(v_gruppe.meta ->> 'kundeId', '') ~* uuid_muster THEN
    v_kontakt := (v_gruppe.meta ->> 'kundeId')::uuid;
  END IF;
  -- Interner Chat, den ein Vertriebspartner angelegt hat.
  v_partnerchat := public.ist_nur_vertriebspartner(v_gruppe.erstellt_von);

  IF NOT v_admin THEN
    IF NOT public.is_internal_role(v_uid) THEN
      RAISE EXCEPTION 'In diesen Chat kannst du niemanden eintragen' USING ERRCODE = '42501';
    END IF;
    IF v_gruppe.erstellt_von IS DISTINCT FROM v_uid
       AND NOT public.is_chat_participant(v_uid, p_chat_id) THEN
      RAISE EXCEPTION 'In diesen Chat kannst du niemanden eintragen' USING ERRCODE = '42501';
    END IF;
    IF coalesce(v_gruppe.meta ->> 'kind', '') = 'tippgeber_vp' THEN
      RAISE EXCEPTION 'In diesen Chat kannst du niemanden eintragen' USING ERRCODE = '42501';
    END IF;
    IF v_kundenchat AND (v_kontakt IS NULL OR NOT public.darf_kontakt_bearbeiten(v_uid, v_kontakt)) THEN
      RAISE EXCEPTION 'In diesen Chat kannst du niemanden eintragen' USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR v_eintrag IN SELECT e FROM jsonb_array_elements(p_teilnehmer) AS t(e) LOOP
    v_ziel_text := coalesce(v_eintrag ->> 'benutzer_id', '');
    IF v_ziel_text !~* uuid_muster THEN
      RAISE EXCEPTION 'Ungueltige Kennung: %', v_ziel_text USING ERRCODE = '22023';
    END IF;
    v_ziel := v_ziel_text::uuid;

    IF EXISTS (SELECT 1 FROM public.chat_teilnehmer t
                WHERE t.chat_id = p_chat_id AND t.benutzer_id = v_ziel) THEN
      CONTINUE;
    END IF;

    IF NOT v_admin THEN
      IF v_ziel = v_uid THEN
        IF v_gruppe.erstellt_von IS DISTINCT FROM v_uid THEN
          RAISE EXCEPTION 'In diesen Chat kannst du dich nicht selbst eintragen' USING ERRCODE = '42501';
        END IF;
      ELSIF v_kundenchat AND EXISTS (
              SELECT 1 FROM public.kontakte k
               WHERE k.id = v_kontakt
                 AND ((k.meta ->> 'authUserId') = v_ziel::text
                      OR ((k.meta -> 'person2') ->> 'authUserId') = v_ziel::text)) THEN
        NULL;
      ELSIF v_kundenchat THEN
        RAISE EXCEPTION 'Der Kundenchat bleibt zwischen Partner und Kunde.' USING ERRCODE = '42501';
      ELSIF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_ziel) THEN
        NULL;
      ELSIF NOT public.is_internal_role(v_ziel) THEN
        RAISE EXCEPTION 'Diese Person kann nicht in diesen Chat eingetragen werden' USING ERRCODE = '42501';
      ELSIF v_leitung THEN
        NULL;
      ELSIF v_partner THEN
        IF EXISTS (SELECT 1 FROM public.struktur_unter(v_uid) u WHERE u.mitglied_id = v_ziel) THEN
          NULL;
        ELSE
          RAISE EXCEPTION 'Du kannst nur Partner aus deiner eigenen Struktur einladen. Weitere Personen laedt die Vertriebsleitung ein.' USING ERRCODE = '42501';
        END IF;
      ELSIF v_partnerchat THEN
        RAISE EXCEPTION 'In diesen Chat laedt nur die Vertriebsleitung weitere Personen ein.' USING ERRCODE = '42501';
      END IF;
    END IF;

    INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, meta)
    VALUES (p_chat_id, v_ziel,
            CASE WHEN jsonb_typeof(v_eintrag -> 'meta') = 'object' THEN v_eintrag -> 'meta' ELSE '{}'::jsonb END);
    v_neu := v_neu + 1;
  END LOOP;

  RETURN v_neu;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Saetze je Ebene
-- ---------------------------------------------------------------------------

-- Grenzen fuer den Satz eines Partners: hoechstens der Eigen-Satz seines
-- direkten Teamleiters, mindestens der hoechste Satz direkt unter ihm
-- (sonst bekaeme der Teamleiter eine negative Differenz). NULL = keine Grenze.
CREATE OR REPLACE FUNCTION public.struktur_satz_grenzen(_partner uuid, OUT obergrenze numeric, OUT untergrenze numeric)
RETURNS record
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT public.provisions_obergrenze(k.leiter_id) FROM public.struktur_kette(_partner) k WHERE k.ebene = 1),
    (SELECT max(public.provisions_obergrenze(u.mitglied_id)) FROM public.struktur_unter(_partner) u WHERE u.ebene = 1);
$$;

COMMENT ON FUNCTION public.struktur_satz_grenzen(uuid) IS
  'Erlaubter Bereich fuer den Satz eines Partners: hoechstens der Satz seines '
  'direkten Teamleiters, mindestens der hoechste Satz direkt darunter. Nur Server.';

CREATE OR REPLACE FUNCTION public.struktur_satz_setzen(_partner uuid, _satz numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _grenze numeric;
  _g record;
  _e jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet.';
  END IF;
  IF _satz IS NULL OR _satz <= 0 OR _satz > 100 THEN
    RAISE EXCEPTION 'Bitte trag einen Provisionssatz zwischen 0 und 100 Prozent ein.';
  END IF;
  IF NOT public.is_admin_role(_uid) THEN
    IF NOT EXISTS (SELECT 1 FROM public.struktur_unter(_uid) u WHERE u.mitglied_id = _partner) THEN
      RAISE EXCEPTION 'Dieser Partner gehoert nicht zu deiner Struktur.';
    END IF;
    _grenze := public.provisions_obergrenze(_uid);
    IF _grenze IS NULL THEN
      RAISE EXCEPTION 'Fuer dich ist noch kein Provisionssatz hinterlegt. Bitte wende dich an die Geschaeftsleitung.';
    END IF;
    IF _satz > _grenze THEN
      RAISE EXCEPTION 'Hoechstens dein Eigen-Satz: % Prozent.', _grenze;
    END IF;
  END IF;
  -- Seit 20261022120000 fuer alle, auch Admin und Inhaber: nie ueber dem
  -- direkten Teamleiter des Partners, nie unter einem Partner direkt darunter.
  SELECT * INTO _g FROM public.struktur_satz_grenzen(_partner);
  IF _g.obergrenze IS NOT NULL AND _satz > _g.obergrenze THEN
    RAISE EXCEPTION 'Hoechstens der Satz des direkten Teamleiters: % Prozent.', _g.obergrenze;
  END IF;
  IF _g.untergrenze IS NOT NULL AND _satz < _g.untergrenze THEN
    RAISE EXCEPTION 'Mindestens % Prozent: So viel hat bereits ein Partner direkt darunter.', _g.untergrenze;
  END IF;

  INSERT INTO public.user_settings (user_id, einstellungen)
  VALUES (_partner, jsonb_build_object('custom_provision_rate_setter', _satz, 'custom_provision_rate_eigen', _satz))
  ON CONFLICT (user_id) DO UPDATE
    SET einstellungen = (CASE WHEN jsonb_typeof(public.user_settings.einstellungen) = 'object'
                              THEN public.user_settings.einstellungen ELSE '{}'::jsonb END)
                        || jsonb_build_object('custom_provision_rate_setter', _satz, 'custom_provision_rate_eigen', _satz),
        updated_at = now();

  -- Gegenprobe: Der Schutz-Trigger verwirft still; dann soll es laut scheitern.
  SELECT einstellungen INTO _e FROM public.user_settings WHERE user_id = _partner;
  IF public.einstellung_zahl(_e, 'custom_provision_rate_eigen') IS DISTINCT FROM _satz
     OR public.einstellung_zahl(_e, 'custom_provision_rate_setter') IS DISTINCT FROM _satz THEN
    RAISE EXCEPTION 'Der Provisionssatz wurde nicht gespeichert.';
  END IF;
  RETURN _satz;
END;
$$;

-- Schutz-Trigger: wie 20261016100000, die Strukturgrenze kommt dazu. Ein
-- Satz ausserhalb der Grenzen faellt still auf den alten zurueck; der Weg aus
-- dem Browser (struktur_satz_setzen) meldet es vorher laut.
CREATE OR REPLACE FUNCTION public.user_settings_provision_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _schluessel constant text[] := ARRAY[
    'custom_provision_rate', 'custom_provision_rate_eigen', 'custom_provision_rate_setter',
    'karriere_override', 'provision_locked', 'provision_locked_at',
    'teamleader_id', 'geworben_von_user_id'
  ];
  _struktur_saetze constant text[] := ARRAY['custom_provision_rate_setter', 'custom_provision_rate_eigen'];
  _neu jsonb;
  _alt jsonb := '{}'::jsonb;
  _leiter_neu uuid;
  _leiter_alt uuid;
  _grenze numeric;
  _g record;
  _wert numeric;
  _k text;
BEGIN
  IF NEW.einstellungen IS NULL OR jsonb_typeof(NEW.einstellungen) <> 'object' THEN
    _neu := '{}'::jsonb;
  ELSE
    _neu := NEW.einstellungen;
  END IF;

  -- Kein Kreis: der neue Teamleiter darf nicht der Nutzer selbst oder jemand
  -- aus seiner Struktur sein. Gilt fuer jeden, auch fuer Admin und Server.
  _leiter_neu := public.teamleiter_aus(_neu, NEW.user_id);
  IF TG_OP = 'UPDATE' THEN
    _leiter_alt := public.teamleiter_aus(OLD.einstellungen, OLD.user_id);
  END IF;
  IF _leiter_neu IS NOT NULL AND _leiter_neu IS DISTINCT FROM _leiter_alt
     AND EXISTS (SELECT 1 FROM public.struktur_unter(NEW.user_id) u WHERE u.mitglied_id = _leiter_neu) THEN
    RAISE EXCEPTION 'Diese Zuordnung ergaebe einen Kreis in der Struktur: Der Teamleiter steht schon unter diesem Partner.';
  END IF;

  -- Seit 20261022120000 fuer JEDEN Schreibweg (auch Admin, Inhaber, Server,
  -- Einladung): Aendern sich Satz oder Teamleiter, darf der Satz nicht ueber
  -- dem des Teamleiters liegen und nicht unter dem hoechsten Satz direkt
  -- darunter. Sonst entstuende eine negative Differenz in der Struktur.
  IF TG_OP = 'INSERT'
     OR _leiter_neu IS DISTINCT FROM _leiter_alt
     OR public.einstellung_zahl(_neu, 'custom_provision_rate_eigen') IS DISTINCT FROM public.einstellung_zahl(OLD.einstellungen, 'custom_provision_rate_eigen')
     OR public.einstellung_zahl(_neu, 'custom_provision_rate') IS DISTINCT FROM public.einstellung_zahl(OLD.einstellungen, 'custom_provision_rate') THEN
    _wert := coalesce(public.einstellung_zahl(_neu, 'custom_provision_rate_eigen'), public.einstellung_zahl(_neu, 'custom_provision_rate'));
    IF _wert IS NOT NULL THEN
      _grenze := public.provisions_obergrenze(_leiter_neu);
      IF _leiter_neu IS NOT NULL AND _grenze IS NOT NULL AND _wert > _grenze THEN
        RAISE EXCEPTION 'Der Satz (% Prozent) liegt ueber dem Satz des Teamleiters (% Prozent).', _wert, _grenze;
      END IF;
      SELECT max(public.provisions_obergrenze(u.mitglied_id)) INTO _grenze
        FROM public.struktur_unter(NEW.user_id) u WHERE u.ebene = 1;
      IF _grenze IS NOT NULL AND _wert < _grenze THEN
        RAISE EXCEPTION 'Der Satz (% Prozent) liegt unter dem eines Partners direkt darunter (% Prozent).', _wert, _grenze;
      END IF;
    END IF;
  END IF;

  IF auth.uid() IS NULL OR public.is_admin_role(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.einstellungen) = 'object' THEN
    SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
      INTO _alt
      FROM jsonb_each(OLD.einstellungen) AS e
     WHERE e.key = ANY(_schluessel);
  END IF;

  -- Wer in der Struktur ueber dem Nutzer steht, darf Lead- und Eigen-Satz
  -- setzen: hoechstens bis zu seinem eigenen Eigen-Satz und seit
  -- 20261022120000 innerhalb der Grenzen der Ebene.
  IF NEW.user_id IS DISTINCT FROM auth.uid()
     AND EXISTS (SELECT 1 FROM public.struktur_unter(auth.uid()) u WHERE u.mitglied_id = NEW.user_id) THEN
    _grenze := public.provisions_obergrenze(auth.uid());
    SELECT * INTO _g FROM public.struktur_satz_grenzen(NEW.user_id);
    FOREACH _k IN ARRAY _struktur_saetze LOOP
      IF _grenze IS NOT NULL AND jsonb_typeof(_neu -> _k) = 'number' THEN
        _wert := (_neu ->> _k)::numeric;
        IF _wert > 0 AND _wert <= _grenze
           AND (_g.obergrenze IS NULL OR _wert <= _g.obergrenze)
           AND (_g.untergrenze IS NULL OR _wert >= _g.untergrenze) THEN
          _alt := (_alt - _k) || jsonb_build_object(_k, _neu -> _k);
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF (_neu - _schluessel) || _alt IS DISTINCT FROM _neu THEN
    RAISE WARNING 'Provisions- oder Struktureinstellungen von Nutzer % nicht geaendert', NEW.user_id;
  END IF;
  NEW.einstellungen := (_neu - _schluessel) || _alt;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Rechte
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.ist_nur_vertriebspartner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ist_nur_vertriebspartner(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ist_vertriebsleitung(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ist_vertriebsleitung(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.struktur_chat_teilnehmer_ergaenzen(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.struktur_chat_teilnehmer_ergaenzen(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.chat_gruppe_struktur_ergaenzen() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.struktur_satz_grenzen(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.struktur_satz_grenzen(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.chat_teilnehmer_eintragen(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_teilnehmer_eintragen(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.struktur_satz_setzen(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.struktur_satz_setzen(uuid, numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_settings_provision_schuetzen() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
