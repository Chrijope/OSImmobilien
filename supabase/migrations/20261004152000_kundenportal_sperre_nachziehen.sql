-- ===========================================================================
-- Kundenportal-Sperre nachziehen (zu 20260923180000_kundenportal_sperre)
-- ===========================================================================
--
-- LIVE GEPRUEFT AM 04.10.2026 (lesend)
--
--   1. 14 Tabellen, die nach dem 23.09.2026 dazukamen, tragen die Sperrregel
--      „Kundenportal-Sperre“ noch nicht (117 von 131), darunter
--      lead_pakete, lead_paket_zuweisungen, lotse_nachrichten,
--      handbuch_anforderungen und bewerbungen. Ein gesperrter Kunde kaeme
--      dort an das heran, was ihm die anderen Regeln geben.
--   2. Live laeuft eine abweichende Fassung von
--      `kundenportal_sperrregeln_anlegen`: Die 117 Regeln fragen
--      `kunde_portal_gesperrt(auth.uid())` direkt statt
--      `kundenportal_gesperrt_fuer_mich()`. Damit das geht, ist
--      `kunde_portal_gesperrt(uuid)` fuer `authenticated` ausfuehrbar, und
--      jeder Angemeldete kann fuer eine fremde Kennung erfragen, ob sie ein
--      gesperrter Kunde ist.
--
-- GRUNDLAGE
--
--   Teil e) baut merge_kontakt_meta auf der Fassung aus
--   20260928160000_glocke_absichern und merge_investment_meta auf der aus
--   20260930110000_absicherung_geld_vertraege auf, jeweils nur um die
--   Sperrpruefung am Anfang ergaenzt.
--
-- WAS DIESE MIGRATION TUT, IN DIESER REIHENFOLGE
--
--   a) Stellt `kundenportal_sperrregeln_anlegen` auf die Fassung im Repo
--      zurueck (Regel fragt `kundenportal_gesperrt_fuer_mich()`).
--   b) Laesst sie laufen: alle Regeln neu, auch an den 14 neueren Tabellen.
--   c) Waechter: Fragt danach noch irgendeine Regel, Sicht oder Funktion
--      ohne SECURITY DEFINER `kunde_portal_gesperrt(` direkt, bricht alles
--      ab und nichts ist geaendert. Sonst wuerde (d) diese Regeln fuer alle
--      Angemeldeten scheitern lassen.
--   d) Nimmt `authenticated` das Recht an `kunde_portal_gesperrt(uuid)`.
--   e) Gesperrte Kunden auch in den Datenbankfunktionen (Pruefung Codex,
--      04.10.2026). SECURITY DEFINER umgeht die Sperrregel an den Tabellen,
--      deshalb fragen jetzt selbst:
--        - merge_kontakt_meta und merge_investment_meta (Fehler statt
--          Rueckgabe),
--        - darf_investment_nutzen und ist_kunde_des_kontakts im Kundenzweig.
--          Darauf stuetzen sich confirm_notar_termin,
--          register_unterlage_upload, unregister_unterlage_upload,
--          einheit_belegung_abgleichen und die Regeln, die sie nutzen.
--      Restrisiko, weil sie authUserId selbst vergleichen und nicht ueber
--      diese Helfer gehen: kundenchat_starten, chat_teilnehmer_eintragen,
--      create_empfehlung_kontakt, eigenfinanzierung_kunde_unterlage,
--      get_kunde_vp_profile.
--   f) Eine Sperre trifft nur Konten, die ausschliesslich die Rolle kunde
--      tragen. Wer zusaetzlich Tippgeber oder intern ist, wird nicht aus der
--      Datenbank ausgesperrt; fuer ihn sperrt nur die Portalseite ueber den
--      Anzeigewert. Gilt auch fuer Person 2.
--
--   Aendert keine Daten, keine Function auszurollen, Reihenfolge egal,
--   wiederholbar.
--
-- OHNE SIE
--
--   Die Sperre wirkt weiter auf Anmeldung und auf die 117 Tabellen, nur die
--   14 neueren bleiben fuer gesperrte Kunden offen. Es stuerzt nichts ab.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.kundenportal_sperrregeln_anlegen()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _t record;
  _anzahl integer := 0;
  _ausgelassen text[] := ARRAY[]::text[];
BEGIN
  FOR _t IN
    SELECT n.nspname::text AS schema_name, c.relname::text AS tabelle
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND c.relrowsecurity
       AND c.relname NOT IN ('profiles', 'user_roles', 'user_settings')
    UNION ALL
    SELECT 'storage', 'objects'
  LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
        'Kundenportal-Sperre', _t.schema_name, _t.tabelle);
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated '
        || 'USING (NOT (SELECT public.kundenportal_gesperrt_fuer_mich())) '
        || 'WITH CHECK (NOT (SELECT public.kundenportal_gesperrt_fuer_mich()))',
        'Kundenportal-Sperre', _t.schema_name, _t.tabelle);
      _anzahl := _anzahl + 1;
    EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
      _ausgelassen := _ausgelassen || (_t.schema_name || '.' || _t.tabelle);
    END;
  END LOOP;

  RAISE NOTICE 'Kundenportal-Sperre an % Tabellen gesetzt', _anzahl;
  IF array_length(_ausgelassen, 1) > 0 THEN
    RAISE WARNING 'Kundenportal-Sperre nicht gesetzt (keine Rechte): %',
      array_to_string(_ausgelassen, ', ');
  END IF;
  RETURN _anzahl;
END;
$$;

REVOKE ALL ON FUNCTION public.kundenportal_sperrregeln_anlegen() FROM public, anon, authenticated, service_role;

SELECT public.kundenportal_sperrregeln_anlegen();

DO $$
DECLARE
  _rest text;
BEGIN
  SELECT string_agg(wo, ', ') INTO _rest FROM (
    SELECT schemaname || '.' || tablename || ' ' || policyname AS wo
      FROM pg_policies
     WHERE (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%kunde_portal_gesperrt(%'
    UNION ALL
    SELECT 'Sicht ' || schemaname || '.' || viewname
      FROM pg_views
     WHERE definition LIKE '%kunde_portal_gesperrt(%'
    UNION ALL
    SELECT 'Funktion ' || p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND NOT p.prosecdef
       AND p.prosrc LIKE '%kunde_portal_gesperrt(%'
  ) x;
  IF _rest IS NOT NULL THEN
    RAISE EXCEPTION 'Abbruch, nichts geaendert: kunde_portal_gesperrt wird noch direkt gefragt von %', _rest;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.kunde_portal_gesperrt(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kunde_portal_gesperrt(uuid) TO service_role;

-- f) Nur Konten mit ausschliesslich der Rolle kunde.
CREATE OR REPLACE FUNCTION public.kunde_portal_gesperrt(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    _user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.kundenportal_sperren s
        JOIN public.kontakte k ON k.id = s.kontakt_id
       WHERE s.gesperrt
         AND (   (k.meta ->> 'authUserId') = _user_id::text
              OR ((k.meta -> 'person2') ->> 'authUserId') = _user_id::text)
    )
    AND NOT public.is_internal_role(_user_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = _user_id AND ur.role::text <> 'kunde'
    ),
    false)
$$;

-- e) Kundenzweig der beiden Helfer.
CREATE OR REPLACE FUNCTION public.darf_investment_nutzen(_user_id uuid, _kunde_id uuid, _kontakt_meta jsonb)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NULL
      OR COALESCE(
           public.darf_alle_kunden_sehen(_user_id)
           OR public.ist_eigenes_investment(_user_id, _kunde_id)
           OR (
             (   (_kontakt_meta ->> 'authUserId') = _user_id::text
              OR ((_kontakt_meta -> 'person2') ->> 'authUserId') = _user_id::text)
             AND NOT public.kunde_portal_gesperrt(_user_id)
           ),
           false)
$$;

CREATE OR REPLACE FUNCTION public.ist_kunde_des_kontakts(_user_id uuid, _kontakt_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (k.meta ->> 'authUserId') = _user_id::text
          OR ((k.meta -> 'person2') ->> 'authUserId') = _user_id::text
        FROM public.kontakte k
       WHERE k.id = _kontakt_id
       LIMIT 1
    ),
    false)
    AND NOT public.kunde_portal_gesperrt(_user_id)
$$;

-- e) Die beiden Zusammenfuehr-Funktionen, bisherige Fassung plus
--    Sperrpruefung am Anfang.
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
  _zustaendig uuid;
  _ist_intern boolean;
  _wirksam jsonb;
  _schluessel text;
  _verworfen text[] := ARRAY[]::text[];
  _result jsonb;
BEGIN
  -- Gesperrter Kunde: keine Rueckgabe, kein Schreiben (04.10.2026).
  IF auth.uid() IS NOT NULL AND public.kunde_portal_gesperrt(auth.uid()) THEN
    RAISE EXCEPTION 'Dein Zugang ist gerade gesperrt.' USING ERRCODE = '42501';
  END IF;
  SELECT meta, zustaendig_id INTO _kontakt_meta, _zustaendig FROM public.kontakte WHERE id = _kontakt_id;
  IF NOT FOUND THEN
    -- Neutrale Meldung: keine Auskunft darueber, ob die UUID existiert
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- auth.uid() IS NULL = Service-Role (Edge Functions), anon hat kein EXECUTE
  _ist_intern := auth.uid() IS NULL OR public.is_internal_role(auth.uid());

  -- Neu am 28.09.2026: Interne Rollen ohne Blick auf alle Kunden nur am
  -- Kontakt, den sie betreuen (wie die Bearbeiten-Regel auf kontakte).
  IF auth.uid() IS NOT NULL AND COALESCE(_ist_intern, false)
     AND NOT COALESCE(public.darf_alle_kunden_sehen(auth.uid()), false)
     AND NOT COALESCE(public.is_vp_owner_of_kontakt(auth.uid(), _zustaendig, _kontakt_meta), false) THEN
    _ist_intern := false;
  END IF;

  -- Geaendert am 16.09.2026 (Audit F01): Jeder Vergleich einzeln in COALESCE,
  -- sonst wird aus einem fehlenden Schluessel ein unbekannt und die Sperre
  -- wird stillschweigend uebersprungen.
  IF NOT (
    COALESCE(_ist_intern, false)
    OR COALESCE((_kontakt_meta ->> 'authUserId') = auth.uid()::text, false)
    OR COALESCE(((_kontakt_meta -> 'person2') ->> 'authUserId') = auth.uid()::text, false)
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

CREATE OR REPLACE FUNCTION public.merge_investment_meta(_investment_id uuid, _updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _erlaubte_schluessel text[] := ARRAY[
    'marktwertHistorie',
    'steuerCockpit'
  ];
  _result jsonb;
  _kunde_id uuid;
  _kontakt_meta jsonb;
  _inv_meta jsonb;
  _ist_intern boolean;
  _wirksam jsonb;
  _schluessel text;
  _verworfen text[] := ARRAY[]::text[];
BEGIN
  -- Gesperrter Kunde: keine Rueckgabe, kein Schreiben (04.10.2026).
  IF auth.uid() IS NOT NULL AND public.kunde_portal_gesperrt(auth.uid()) THEN
    RAISE EXCEPTION 'Dein Zugang ist gerade gesperrt.' USING ERRCODE = '42501';
  END IF;
  SELECT kunde_id, meta INTO _kunde_id, _inv_meta
  FROM public.investments WHERE id = _investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found';
  END IF;

  SELECT meta INTO _kontakt_meta FROM public.kontakte WHERE id = _kunde_id;

  _ist_intern := auth.uid() IS NULL OR public.is_internal_role(auth.uid());

  IF NOT public.darf_investment_nutzen(auth.uid(), _kunde_id, _kontakt_meta) THEN
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
  END IF;

  -- Geschuetzte Schluessel (20260930110000): Mitarbeiter ohne Admin-Rolle
  -- setzen sie nie. Zuruecksetzen (leerer Wert) duerfen sie nur die, die die
  -- Oberflaeche heute leert: Selbstauskunft neu unterschreiben lassen
  -- (SelbstauskunftForm), Reservierung zuruecksetzen (clearRvSignatureData,
  -- setInvestmentRvPdf("")) und Notartermin neu freigeben. Alle anderen,
  -- etwa rvReservierungAb, blieben sonst leerbar, und eine Reservierung
  -- gaelte sofort als wirksam.
  IF _ist_intern AND auth.uid() IS NOT NULL AND NOT public.is_admin_role(auth.uid())
     AND jsonb_typeof(_wirksam) = 'object' THEN
    FOR _schluessel IN SELECT jsonb_object_keys(_wirksam) LOOP
      IF _schluessel = ANY(public.investment_geschuetzte_schluessel())
         AND NOT (
           _schluessel = ANY(ARRAY[
             'saSigned', 'saSignedAt', 'saSignatures',
             'rvPdf', 'rvData', 'rvSignatures', 'rvSigned',
             'notarTerminBestaetigt'
           ]::text[])
           AND public.investment_wert_leer(_wirksam -> _schluessel)
         ) THEN
        _wirksam := _wirksam - _schluessel;
        _verworfen := _verworfen || _schluessel;
      END IF;
    END LOOP;
  END IF;

  IF array_length(_verworfen, 1) > 0 THEN
    RAISE LOG 'merge_investment_meta: nicht erlaubte Schluessel verworfen (%)',
      array_to_string(_verworfen, ', ');
  END IF;

  IF _wirksam = '{}'::jsonb THEN
    RETURN COALESCE(_inv_meta, '{}'::jsonb);
  END IF;

  UPDATE public.investments
  SET meta = COALESCE(meta, '{}'::jsonb) || _wirksam
  WHERE id = _investment_id
  RETURNING meta INTO _result;

  RETURN COALESCE(_result, '{}'::jsonb);
END;
$$;

COMMIT;
