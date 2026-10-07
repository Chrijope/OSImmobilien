-- Feste Verknuepfung Empfehlung -> geworbener Kontakt + Status-Absicherung
--
-- Bisher lebte die Verknuepfung nur als JSON in meta->>'neuerKontaktId' und
-- war je nach Anlagepfad mal gesetzt, mal nicht. Die neue Spalte kontakt_id
-- macht sie zur echten Fremdschluessel-Beziehung. meta.neuerKontaktId bleibt
-- als Zweitschrift bestehen, das Frontend liest beides (Spalte zuerst).
--
-- Ausserdem bekommt empfehlungen.status einen CHECK auf die bekannten Werte
-- (inkl. der neuen Werte in_beratung und in_abwicklung fuer die
-- Status-Automatik) und die RPC create_empfehlung_kontakt setzt kontakt_id
-- kuenftig direkt beim Anlegen.

-- ============================================================
-- 1) Spalte + Index
-- ============================================================

ALTER TABLE public.empfehlungen
  ADD COLUMN IF NOT EXISTS kontakt_id uuid REFERENCES public.kontakte(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_empfehlungen_kontakt_id
  ON public.empfehlungen (kontakt_id);

-- ============================================================
-- 2) Backfill aus meta->>'neuerKontaktId'
--    Nur wenn der Wert eine UUID ist und der Kontakt existiert;
--    sonst wuerde der Fremdschluessel die Migration abbrechen.
-- ============================================================

UPDATE public.empfehlungen e
SET kontakt_id = (e.meta ->> 'neuerKontaktId')::uuid
WHERE e.kontakt_id IS NULL
  AND (e.meta ->> 'neuerKontaktId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE k.id = (e.meta ->> 'neuerKontaktId')::uuid
  );

-- ============================================================
-- 3) Zweitversuch ueber E-Mail-Abgleich (lower/trim), analog der
--    Dublettenpruefung in create_empfehlung_kontakt. Geloeschte Kontakte
--    (Papierkorb) zaehlen nicht. Bei mehreren Treffern gewinnt der aelteste
--    Kontakt, damit das Ergebnis bei Wiederholung stabil bleibt.
-- ============================================================

UPDATE public.empfehlungen e
SET kontakt_id = (
  SELECT k.id
  FROM public.kontakte k
  WHERE COALESCE(k.geloescht, false) = false
    AND lower(trim(k.email)) = lower(trim(e.empfohlen_email))
  ORDER BY k.erstellt_am ASC NULLS LAST, k.id
  LIMIT 1
)
WHERE e.kontakt_id IS NULL
  AND NULLIF(trim(COALESCE(e.empfohlen_email, '')), '') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE COALESCE(k.geloescht, false) = false
      AND lower(trim(k.email)) = lower(trim(e.empfohlen_email))
  );

-- ============================================================
-- 4) Drittversuch ueber Telefon-Abgleich: nur Ziffern, mindestens sechs,
--    Endvergleich (die kuerzere Nummer muss das Ende der laengeren sein,
--    damit +49 171 ... und 0171 ... zueinander finden).
-- ============================================================

UPDATE public.empfehlungen e
SET kontakt_id = (
  SELECT k.id
  FROM public.kontakte k
  WHERE COALESCE(k.geloescht, false) = false
    AND length(regexp_replace(COALESCE(k.telefon, ''), '[^0-9]', '', 'g')) >= 6
    AND right(
          regexp_replace(COALESCE(k.telefon, ''), '[^0-9]', '', 'g'),
          least(
            length(regexp_replace(COALESCE(k.telefon, ''), '[^0-9]', '', 'g')),
            length(regexp_replace(COALESCE(e.empfohlen_telefon, ''), '[^0-9]', '', 'g'))
          )
        ) = right(
          regexp_replace(COALESCE(e.empfohlen_telefon, ''), '[^0-9]', '', 'g'),
          least(
            length(regexp_replace(COALESCE(k.telefon, ''), '[^0-9]', '', 'g')),
            length(regexp_replace(COALESCE(e.empfohlen_telefon, ''), '[^0-9]', '', 'g'))
          )
        )
  ORDER BY k.erstellt_am ASC NULLS LAST, k.id
  LIMIT 1
)
WHERE e.kontakt_id IS NULL
  AND length(regexp_replace(COALESCE(e.empfohlen_telefon, ''), '[^0-9]', '', 'g')) >= 6
  AND EXISTS (
    SELECT 1 FROM public.kontakte k
    WHERE COALESCE(k.geloescht, false) = false
      AND length(regexp_replace(COALESCE(k.telefon, ''), '[^0-9]', '', 'g')) >= 6
      AND right(
            regexp_replace(COALESCE(k.telefon, ''), '[^0-9]', '', 'g'),
            least(
              length(regexp_replace(COALESCE(k.telefon, ''), '[^0-9]', '', 'g')),
              length(regexp_replace(COALESCE(e.empfohlen_telefon, ''), '[^0-9]', '', 'g'))
            )
          ) = right(
            regexp_replace(COALESCE(e.empfohlen_telefon, ''), '[^0-9]', '', 'g'),
            least(
              length(regexp_replace(COALESCE(k.telefon, ''), '[^0-9]', '', 'g')),
              length(regexp_replace(COALESCE(e.empfohlen_telefon, ''), '[^0-9]', '', 'g'))
            )
          )
  );

-- ============================================================
-- 5) Status-CHECK: alle bekannten Werte inkl. der neuen Automatik-Status.
--    NOT VALID, damit die Migration auch bei unerwarteten Altwerten
--    durchlaeuft. Validiert wird danach nur, wenn der Bestand sauber ist;
--    andernfalls bleibt der Check fuer NEUE Zeilen trotzdem aktiv (das ist
--    die Bedeutung von NOT VALID) und eine NOTICE nennt die Altwerte, damit
--    sie von Hand bereinigt und der Check spaeter validiert werden kann.
-- ============================================================

DO $$
DECLARE
  _schmutzige integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'empfehlungen_status_check'
      AND conrelid = 'public.empfehlungen'::regclass
  ) THEN
    ALTER TABLE public.empfehlungen
      ADD CONSTRAINT empfehlungen_status_check
      CHECK (status IN (
        'offen', 'neu', 'kontaktiert', 'termin', 'in_beratung',
        'in_abwicklung', 'abgeschlossen', 'verloren', 'dublette'
      )) NOT VALID;
  END IF;

  SELECT count(*) INTO _schmutzige
  FROM public.empfehlungen
  WHERE status IS NOT NULL
    AND status NOT IN (
      'offen', 'neu', 'kontaktiert', 'termin', 'in_beratung',
      'in_abwicklung', 'abgeschlossen', 'verloren', 'dublette'
    );

  IF _schmutzige = 0 THEN
    ALTER TABLE public.empfehlungen VALIDATE CONSTRAINT empfehlungen_status_check;
  ELSE
    RAISE NOTICE 'empfehlungen_status_check bleibt NOT VALID: % Zeile(n) mit unbekanntem Status. Bitte bereinigen und danach VALIDATE CONSTRAINT ausfuehren.', _schmutzige;
  END IF;
END $$;

-- ============================================================
-- 6) RPC create_empfehlung_kontakt: setzt kontakt_id direkt beim Anlegen.
--    Einzige Aenderung gegenueber der Fassung vom 23.06.: die Spalte
--    kontakt_id im INSERT der Empfehlung (auch im Dubletten-Fall zeigt sie
--    auf den gefundenen Bestandskontakt, wie es meta.neuerKontaktId schon
--    tat). Alles andere ist unveraendert.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_empfehlung_kontakt(
  _referrer_kontakt_id uuid,
  _vorname text,
  _nachname text,
  _email text,
  _telefon text,
  _quelle text,
  _berater text,
  _beziehung text,
  _anmerkungen text DEFAULT ''::text,
  _programm_id text DEFAULT ''::text,
  _investment_id text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _referrer public.kontakte%ROWTYPE;
  _kontakt_id uuid;
  _emp_id uuid;
  _vp_id uuid;
  _vp_name text;
  _referrer_name text;
  _duplicate_id uuid;
  _duplicate_name text;
  _norm_tel text;
  _fallback_user uuid;
  _notify_msg text;
BEGIN
  SELECT * INTO _referrer
  FROM public.kontakte
  WHERE id = _referrer_kontakt_id
    AND (
      (meta ->> 'authUserId') = auth.uid()::text
      OR ((meta -> 'person2') ->> 'authUserId') = auth.uid()::text
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  _vp_id := _referrer.zustaendig_id;
  _vp_name := COALESCE(NULLIF(_referrer.berater, ''), NULLIF(_berater, ''));
  _referrer_name := trim(_referrer.vorname || ' ' || _referrer.nachname);

  IF _vp_id IS NULL AND _vp_name IS NOT NULL THEN
    SELECT p.id INTO _vp_id
    FROM public.profiles p
    WHERE lower(trim(p.name)) = lower(trim(_vp_name))
    ORDER BY p.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  _norm_tel := regexp_replace(COALESCE(_telefon, ''), '[^0-9]', '', 'g');

  SELECT id, trim(vorname || ' ' || nachname) INTO _duplicate_id, _duplicate_name
  FROM public.kontakte
  WHERE (
      (NULLIF(_email, '') IS NOT NULL AND lower(email) = lower(_email))
      OR (length(_norm_tel) >= 6 AND regexp_replace(COALESCE(telefon, ''), '[^0-9]', '', 'g') = _norm_tel)
    )
  LIMIT 1;

  _kontakt_id := gen_random_uuid();
  _emp_id := gen_random_uuid();

  IF _duplicate_id IS NOT NULL THEN
    _kontakt_id := _duplicate_id;
  ELSE
    INSERT INTO public.kontakte (id, vorname, nachname, email, telefon, quelle, berater, zustaendig_id, status, meta)
    VALUES (
      _kontakt_id,
      NULLIF(_vorname, ''),
      NULLIF(_nachname, ''),
      NULLIF(_email, ''),
      NULLIF(_telefon, ''),
      COALESCE(NULLIF(_quelle, ''), 'Empfehlung von ' || _referrer_name),
      _vp_name,
      _vp_id,
      'kontaktiert',
      jsonb_build_object(
        'pipelineStufe', 'erstgespraech',
        'leadTyp', 'empfehlung',
        'zugewiesenAm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'empfehlungsgeber', true,
        'empfehlungsgeberName', _referrer_name,
        'empfehlungsgeberKontaktId', _referrer_kontakt_id::text,
        'empfehlungsgeberBeziehung', COALESCE(_beziehung, ''),
        'empfehlungsgeberVpId', COALESCE(_vp_id::text, ''),
        'empfehlungId', _emp_id::text,
        'empfehlungAnmerkungen', COALESCE(_anmerkungen, ''),
        'empfehlungEmail', COALESCE(_email, ''),
        'empfehlungTelefon', COALESCE(_telefon, '')
      )
    );
  END IF;

  INSERT INTO public.empfehlungen (id, empfohlen_name, empfohlen_email, empfohlen_telefon, empfohlen_von, status, kontakt_id, meta)
  VALUES (
    _emp_id,
    trim(_vorname || ' ' || _nachname),
    NULLIF(_email, ''),
    NULLIF(_telefon, ''),
    _referrer_name,
    CASE WHEN _duplicate_id IS NOT NULL THEN 'dublette' ELSE 'neu' END,
    _kontakt_id,
    jsonb_build_object(
      'programmId', COALESCE(_programm_id, ''),
      'investmentId', COALESCE(_investment_id, ''),
      'kontaktId', _referrer_kontakt_id::text,
      'kontaktName', _referrer_name,
      'empfehlenderKundeId', _referrer_kontakt_id::text,
      'empfehlenderName', _referrer_name,
      'beziehung', COALESCE(_beziehung, ''),
      'anmerkungen', COALESCE(_anmerkungen, ''),
      'berater', COALESCE(_vp_name, ''),
      'vpId', COALESCE(_vp_id::text, ''),
      'praemieStatus', 'ausstehend',
      'neuerKontaktId', _kontakt_id::text,
      'dublette', (_duplicate_id IS NOT NULL),
      'dubletteVon', COALESCE(_duplicate_name, '')
    )
  );

  _notify_msg := 'Ihr Kunde ' || _referrer_name || ' hat eine neue Empfehlung gesendet: '
    || trim(_vorname || ' ' || _nachname)
    || COALESCE(' (' || NULLIF(_telefon, '') || ')', '')
    || CASE WHEN _duplicate_id IS NOT NULL
            THEN ' — ACHTUNG: Dublette zu bestehendem Kontakt "' || COALESCE(_duplicate_name, '') || '". Bitte prüfen.'
            ELSE '. Der Kontakt wurde automatisch in Kontakte angelegt.'
       END;

  IF _vp_id IS NOT NULL THEN
    INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
    VALUES (
      _vp_id,
      'Neue Empfehlung von ' || _referrer_name,
      _notify_msg,
      '/kunden/' || _kontakt_id::text
    );
  ELSE
    FOR _fallback_user IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role)
    LOOP
      INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
      VALUES (
        _fallback_user,
        'Neue Empfehlung ohne Zuständigkeit',
        _notify_msg,
        '/kunden/' || _kontakt_id::text
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'kontakt_id', _kontakt_id,
    'empfehlung_id', _emp_id,
    'vp_id', _vp_id,
    'duplicate', (_duplicate_id IS NOT NULL),
    'duplicate_name', COALESCE(_duplicate_name, '')
  );
END;
$$;
