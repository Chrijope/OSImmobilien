-- ===========================================================================
-- Leadpakete: welcher Lead aus welchem Paket geliefert wurde
-- ===========================================================================
--
-- GL-Auftrag vom 29.09.2026. Bisher lag ein Leadpaket nur als
-- { betrag, anzahl } in bewerbungen.meta, kein Kontakt war einem Paket
-- zugeordnet. Im Streit muss die Gesellschaft belegen, welche Leads aus
-- welchem Paket geliefert wurden, wann gezahlt und wann freigeschaltet wurde
-- (Vertragsfassung 2026-09-29, Anlage 3 § 1a; Hauptvertrag § 5 Abs. 3).
--
--   1) lead_pakete: ein gebuchtes Paket je Zeile, mit Zahlungseingang und
--      Freischaltung. Ein Partner kann mehrere Pakete nacheinander haben.
--   2) lead_paket_zuweisungen: je gelieferter Lead eine Zeile, mit
--      Zeitpunkt, Zuweisendem, Reklamation und Ersatzbezug. Eine Spalte am
--      Kontakt reichte nicht: Reklamation und Ersatz brauchen je Lieferung
--      eigene Angaben, und der Nachweis soll bleiben, auch wenn der Lead
--      spaeter umgehaengt wird.
--   3) Lesen: Admin, Inhaber, Vertriebsleitung alles, Partner nur die
--      eigenen Pakete. Schreiben nur ueber die Funktionen unten
--      (GL-Grundsatz: direkt schreiben nur Admin und Inhaber, hier
--      nicht einmal die, damit jede Aenderung durch dieselbe Pruefung geht).
--      Wer selbst Partner eines Pakets ist, vermerkt und reklamiert darin
--      nichts, ausser er ist Admin oder Inhaber.
--   4) Paket aus der Bewerbung (GL-Entscheidung vom 29.09.2026):
--      Mit dem bestaetigten Zahlungseingang entsteht das Paket automatisch,
--      sobald das Nutzerkonto verknuepft ist und seine E-Mail zur Bewerbung
--      passt; sonst beim Anlegen des Nutzers. Nie doppelt (bewerbung_id
--      eindeutig). Einen Bestandsnachtrag gibt es bewusst nicht: Beim
--      Ausfuehren soll keine vorbereitete Bewerbung still uebernommen werden.
--
-- Zaehlung (dieselbe Regel wie in src/lib/leadPaketStore.ts):
--   geliefert  = Zuweisungen ohne Reklamation (Ersatzleads zaehlen mit)
--   reklamiert = Zuweisungen mit Reklamation, sie zaehlen nicht
--   ersetzt    = reklamierte, auf die eine spaetere Zuweisung verweist
--   offen      = anzahl minus geliefert, nie unter null
--
-- Wiederholbar: ein zweiter Lauf aendert nichts. Ohne diese Migration zeigt
-- das CRM kein Paketfeld, die Zuweisung laeuft wie bisher.
-- ===========================================================================

BEGIN;


-- ---------------------------------------------------------------------------
-- 1) Tabellen
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_pakete (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Bewusst ohne Fremdschluessel: Der Nachweis soll auch bleiben, wenn das
  -- Konto spaeter entfernt wird.
  partner_id        uuid NOT NULL,
  anzahl            integer NOT NULL CHECK (anzahl > 0),
  paketpreis        numeric(12, 2) NOT NULL CHECK (paketpreis >= 0),
  bezahlt_am        date,
  freigeschaltet_am date,
  status            text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'erfuellt', 'beendet')),
  bemerkung         text,
  -- Herkunft, wenn das Paket aus einer Bewerbung uebernommen wurde.
  bewerbung_id      uuid UNIQUE,
  erstellt_am       timestamptz NOT NULL DEFAULT now(),
  erstellt_von      uuid,
  geaendert_am      timestamptz,
  geaendert_von     uuid
);

CREATE INDEX IF NOT EXISTS lead_pakete_partner_idx ON public.lead_pakete (partner_id);

CREATE TABLE IF NOT EXISTS public.lead_paket_zuweisungen (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paket_id          uuid NOT NULL REFERENCES public.lead_pakete(id) ON DELETE RESTRICT,
  -- Ohne Fremdschluessel: Ein endgueltig geloeschter Kontakt soll den
  -- Liefernachweis nicht mitnehmen und auch nicht am Loeschen scheitern.
  kontakt_id        uuid NOT NULL,
  zugewiesen_am     timestamptz NOT NULL DEFAULT now(),
  zugewiesen_von    uuid,
  reklamiert_am     timestamptz,
  reklamationsgrund text,
  reklamiert_von    uuid,
  -- Die reklamierte Zuweisung, die diese Lieferung ersetzt. Jede nur einmal.
  ersatz_fuer       uuid UNIQUE REFERENCES public.lead_paket_zuweisungen(id) ON DELETE RESTRICT,
  UNIQUE (paket_id, kontakt_id)
);

CREATE INDEX IF NOT EXISTS lead_paket_zuweisungen_paket_idx ON public.lead_paket_zuweisungen (paket_id);
CREATE INDEX IF NOT EXISTS lead_paket_zuweisungen_kontakt_idx ON public.lead_paket_zuweisungen (kontakt_id);
-- Ein Lead zaehlt paketuebergreifend nur einmal gueltig. Die Funktion unten
-- prueft das vorher mit verstaendlicher Meldung, der Index haelt es auch bei
-- zwei gleichzeitigen Aufrufen.
CREATE UNIQUE INDEX IF NOT EXISTS lead_paket_zuweisungen_einmal_gueltig
  ON public.lead_paket_zuweisungen (kontakt_id) WHERE reklamiert_am IS NULL;


-- ---------------------------------------------------------------------------
-- 2) Lesen per RLS, Schreiben nur ueber die Funktionen
-- ---------------------------------------------------------------------------
ALTER TABLE public.lead_pakete ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_paket_zuweisungen ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.lead_pakete FROM anon, public;
REVOKE ALL ON public.lead_paket_zuweisungen FROM anon, public;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.lead_pakete FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.lead_paket_zuweisungen FROM authenticated;
GRANT SELECT ON public.lead_pakete TO authenticated;
GRANT SELECT ON public.lead_paket_zuweisungen TO authenticated;

DROP POLICY IF EXISTS "Leitung und eigener Partner lesen Leadpakete" ON public.lead_pakete;
CREATE POLICY "Leitung und eigener Partner lesen Leadpakete"
  ON public.lead_pakete FOR SELECT TO authenticated
  USING (
    partner_id = (select auth.uid())
    OR (select public.has_role(auth.uid(), 'admin'))
    OR (select public.has_role(auth.uid(), 'inhaber'))
    OR (select public.has_role(auth.uid(), 'vertriebsleiter'))
  );

DROP POLICY IF EXISTS "Leitung und eigener Partner lesen Paketzuweisungen" ON public.lead_paket_zuweisungen;
CREATE POLICY "Leitung und eigener Partner lesen Paketzuweisungen"
  ON public.lead_paket_zuweisungen FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.lead_pakete p
             WHERE p.id = paket_id AND p.partner_id = (select auth.uid()))
    OR (select public.has_role(auth.uid(), 'admin'))
    OR (select public.has_role(auth.uid(), 'inhaber'))
    OR (select public.has_role(auth.uid(), 'vertriebsleiter'))
  );


-- ---------------------------------------------------------------------------
-- 3) Funktionen
-- ---------------------------------------------------------------------------

-- Intern: Status nach Lieferung oder Reklamation nachziehen. "beendet" bleibt.
CREATE OR REPLACE FUNCTION public.lead_paket_status_nachziehen(_paket_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.lead_pakete p
     SET status = CASE
           WHEN (SELECT count(*) FROM public.lead_paket_zuweisungen z
                  WHERE z.paket_id = p.id AND z.reklamiert_am IS NULL) >= p.anzahl
           THEN 'erfuellt' ELSE 'offen' END
   WHERE p.id = _paket_id
     AND p.status <> 'beendet';
$$;

REVOKE EXECUTE ON FUNCTION public.lead_paket_status_nachziehen(uuid) FROM anon, authenticated, public;


-- Paket anlegen: nur Admin und Inhaber.
CREATE OR REPLACE FUNCTION public.lead_paket_anlegen(
  _partner_id uuid,
  _anzahl integer,
  _paketpreis numeric,
  _bezahlt_am date DEFAULT NULL,
  _freigeschaltet_am date DEFAULT NULL,
  _bemerkung text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'inhaber')) THEN
    RAISE EXCEPTION 'Nur Admin und Inhaber legen Leadpakete an.' USING ERRCODE = '42501';
  END IF;
  IF _partner_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _partner_id AND role IN ('vertriebspartner', 'vertriebsleiter')
  ) THEN
    RAISE EXCEPTION 'Leadpakete gibt es nur für Konten mit Partnerrolle.';
  END IF;
  IF _anzahl IS NULL OR _anzahl <= 0 THEN
    RAISE EXCEPTION 'Die Anzahl der Leads muss größer als null sein.';
  END IF;
  IF _paketpreis IS NULL OR _paketpreis < 0 THEN
    RAISE EXCEPTION 'Der Paketpreis darf nicht negativ sein.';
  END IF;

  INSERT INTO public.lead_pakete (partner_id, anzahl, paketpreis, bezahlt_am, freigeschaltet_am, bemerkung, erstellt_von)
  VALUES (_partner_id, _anzahl, _paketpreis, _bezahlt_am, _freigeschaltet_am, NULLIF(btrim(_bemerkung), ''), v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lead_paket_anlegen(uuid, integer, numeric, date, date, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lead_paket_anlegen(uuid, integer, numeric, date, date, text) TO authenticated;


-- Zahlungseingang, Freischaltung, Bemerkung und Beenden: nur Admin und Inhaber.
CREATE OR REPLACE FUNCTION public.lead_paket_aendern(
  _paket_id uuid,
  _bezahlt_am date,
  _freigeschaltet_am date,
  _beendet boolean,
  _bemerkung text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'inhaber')) THEN
    RAISE EXCEPTION 'Nur Admin und Inhaber ändern Leadpakete.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.lead_pakete
     SET bezahlt_am = _bezahlt_am,
         freigeschaltet_am = _freigeschaltet_am,
         bemerkung = NULLIF(btrim(_bemerkung), ''),
         status = CASE WHEN COALESCE(_beendet, false) THEN 'beendet' ELSE 'offen' END,
         geaendert_am = now(),
         geaendert_von = v_uid
   WHERE id = _paket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dieses Leadpaket gibt es nicht.';
  END IF;

  -- Aus "offen" ergibt sich gegebenenfalls wieder "erfuellt".
  PERFORM public.lead_paket_status_nachziehen(_paket_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lead_paket_aendern(uuid, date, date, boolean, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lead_paket_aendern(uuid, date, date, boolean, text) TO authenticated;


-- Lieferung vermerken: Admin, Inhaber, Vertriebsleitung. Der Lead muss dem
-- Partner des Pakets gehoeren, das Paket muss noch offen sein. Liegt im
-- Paket eine reklamierte Lieferung ohne Ersatz, gilt die neue als ihr
-- Ersatz (die aelteste zuerst).
--
-- Nur Leads der Gesellschaft, keine Eigenkontakte. Dieselbe Regel wie
-- getKontaktTyp in src/lib/kontaktTypHelper.ts: Kontakte aus Schnittstellen
-- und Kampagnen (quelle) sind immer Leads; sonst ist Eigenkontakt, was ohne
-- Setter vom Partner selbst angelegt wurde (meta.erstelltVonId). Der
-- Namensvergleich ohne Kennung aus dem Browser fehlt hier bewusst: ohne
-- Kennung gilt der Kontakt als Lead, wie dort bei mehrdeutigem Namen.
--
-- Ein reklamierter Lead zaehlt nicht erneut auf dasselbe Paket, er kann
-- nicht sein eigener Ersatz sein. Auf ein anderes Paket darf er.
CREATE OR REPLACE FUNCTION public.lead_paket_zuweisung_vermerken(_paket_id uuid, _kontakt_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_paket public.lead_pakete%ROWTYPE;
  v_kontakt public.kontakte%ROWTYPE;
  v_geliefert integer;
  v_ersatz uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'inhaber')
                           OR public.has_role(v_uid, 'vertriebsleiter')) THEN
    RAISE EXCEPTION 'Nur Admin, Inhaber und Vertriebsleitung vermerken Paketlieferungen.' USING ERRCODE = '42501';
  END IF;

  -- Sperre je Paket: zwei gleichzeitige Zuweisungen duerfen es nicht ueberfuellen.
  SELECT * INTO v_paket FROM public.lead_pakete WHERE id = _paket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dieses Leadpaket gibt es nicht.';
  END IF;
  IF v_paket.status = 'beendet' THEN
    RAISE EXCEPTION 'Dieses Leadpaket ist beendet.';
  END IF;
  IF v_paket.partner_id = v_uid AND NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'inhaber')) THEN
    RAISE EXCEPTION 'Im eigenen Leadpaket vermerken und reklamieren nur Admin und Inhaber.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_kontakt FROM public.kontakte WHERE id = _kontakt_id;
  IF NOT FOUND OR v_kontakt.zustaendig_id IS DISTINCT FROM v_paket.partner_id THEN
    RAISE EXCEPTION 'Der Lead gehört nicht dem Partner dieses Pakets.';
  END IF;
  IF COALESCE(v_kontakt.geloescht, false) THEN
    RAISE EXCEPTION 'Dieser Lead ist gelöscht und zählt nicht auf ein Paket.';
  END IF;
  IF lower(COALESCE(v_kontakt.quelle, '')) !~ '(zapier|analysetool|webhook|api|webform|extern|lead|meta|facebook|instagram|tiktok|google|landing)'
     AND btrim(COALESCE(v_kontakt.meta->>'setter', '')) = ''
     AND v_kontakt.meta->>'erstelltVonId' = v_paket.partner_id::text THEN
    RAISE EXCEPTION 'Das ist ein Eigenkontakt des Partners und kein Lead der Gesellschaft.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lead_paket_zuweisungen
              WHERE kontakt_id = _kontakt_id AND reklamiert_am IS NULL) THEN
    RAISE EXCEPTION 'Dieser Lead zählt schon für ein Leadpaket.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lead_paket_zuweisungen
              WHERE kontakt_id = _kontakt_id AND paket_id = _paket_id) THEN
    RAISE EXCEPTION 'Dieser Lead wurde aus diesem Paket schon reklamiert und zählt nicht erneut darauf.';
  END IF;

  SELECT count(*) INTO v_geliefert FROM public.lead_paket_zuweisungen
   WHERE paket_id = _paket_id AND reklamiert_am IS NULL;
  IF v_geliefert >= v_paket.anzahl THEN
    RAISE EXCEPTION 'Dieses Leadpaket ist vollständig geliefert.';
  END IF;

  SELECT r.id INTO v_ersatz
    FROM public.lead_paket_zuweisungen r
   WHERE r.paket_id = _paket_id
     AND r.reklamiert_am IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.lead_paket_zuweisungen e WHERE e.ersatz_fuer = r.id)
   ORDER BY r.reklamiert_am, r.id
   LIMIT 1;

  BEGIN
    INSERT INTO public.lead_paket_zuweisungen (paket_id, kontakt_id, zugewiesen_von, ersatz_fuer)
    VALUES (_paket_id, _kontakt_id, v_uid, v_ersatz)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- Nur bei gleichzeitigem Aufruf, die Pruefungen oben fangen den Rest.
    RAISE EXCEPTION 'Dieser Lead zählt schon für ein Leadpaket.';
  END;

  PERFORM public.lead_paket_status_nachziehen(_paket_id);
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lead_paket_zuweisung_vermerken(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lead_paket_zuweisung_vermerken(uuid, uuid) TO authenticated;


-- Reklamation erfassen: Admin, Inhaber, Vertriebsleitung. Nur einmal je Lieferung.
CREATE OR REPLACE FUNCTION public.lead_paket_reklamation(_zuweisung_id uuid, _grund text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_paket uuid;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'inhaber')
                           OR public.has_role(v_uid, 'vertriebsleiter')) THEN
    RAISE EXCEPTION 'Nur Admin, Inhaber und Vertriebsleitung erfassen Reklamationen.' USING ERRCODE = '42501';
  END IF;
  IF _grund IS NULL OR btrim(_grund) = '' THEN
    RAISE EXCEPTION 'Bitte einen Reklamationsgrund angeben.';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'inhaber'))
     AND EXISTS (SELECT 1 FROM public.lead_paket_zuweisungen z
                   JOIN public.lead_pakete p ON p.id = z.paket_id
                  WHERE z.id = _zuweisung_id AND p.partner_id = v_uid) THEN
    RAISE EXCEPTION 'Im eigenen Leadpaket vermerken und reklamieren nur Admin und Inhaber.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.lead_paket_zuweisungen
     SET reklamiert_am = now(),
         reklamationsgrund = btrim(_grund),
         reklamiert_von = v_uid
   WHERE id = _zuweisung_id
     AND reklamiert_am IS NULL
  RETURNING paket_id INTO v_paket;
  IF v_paket IS NULL THEN
    RAISE EXCEPTION 'Diese Lieferung gibt es nicht oder sie ist schon reklamiert.';
  END IF;

  PERFORM public.lead_paket_status_nachziehen(v_paket);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lead_paket_reklamation(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lead_paket_reklamation(uuid, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4) Paket aus der Bewerbung
-- ---------------------------------------------------------------------------

-- Intern: Kalendertag aus Freitext, ungueltig ergibt NULL statt eines
-- Abbruchs. Ein reines Datum JJJJ-MM-TT gilt wie geschrieben. Ein
-- Zeitpunkt (der Browser speichert UTC, etwa 2026-09-28T22:00:00.000Z fuer
-- Mitternacht deutscher Zeit) wird auf den Tag in Europe/Berlin
-- umgerechnet, sonst laege das Datum einen Tag zu frueh.
CREATE OR REPLACE FUNCTION public.lead_paket_datum(_text text)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF _text ~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN _text::date;
  END IF;
  IF _text ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}' THEN
    RETURN (_text::timestamptz AT TIME ZONE 'Europe/Berlin')::date;
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lead_paket_datum(text) FROM anon, authenticated, public;


-- Intern: legt das Paket einer Bewerbung an oder ergaenzt es. Alle Werte
-- kommen aus der Bewerbung, nichts vom Aufrufer. Angelegt wird nur, wenn
--   - ein Leadpaket gebucht ist (Betrag und Anzahl positiv, vernuenftig gross),
--   - der Zahlungseingang bestaetigt ist (rechnungBezahltAm),
--   - das Nutzerkonto verknuepft ist und eine Partnerrolle traegt,
--   - die E-Mail des Kontos zur E-Mail der Bewerbung passt; so landet ein
--     Paket nie bei einem falsch verknuepften Konto.
-- Zahlungseingang: rechnungZahlungsdatum, sonst der Tag der Bestaetigung.
-- Freischaltung: der Tag der Kontoanlage (userInviteSentAt), nie vor dem
-- Zahlungseingang. Gibt es das Paket schon, werden nur fehlende Daten
-- ergaenzt, nie ueberschrieben. Jede Umwandlung steht hinter CASE oder
-- lead_paket_datum: ein Freitext darf nie in eine Zahl oder Kennung laufen.
--
-- Rueckgabe {status, paket_id, anzahl}; status ist angelegt, ergaenzt,
-- vorhanden, kein_paket, nicht_bezahlt, kein_konto oder email_abweichend.
CREATE OR REPLACE FUNCTION public.lead_paket_aus_bewerbung_intern(_bewerbung_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta jsonb;
  v_email text;
  v_partner uuid;
  v_anzahl numeric;
  v_betrag numeric;
  v_bezahlt date;
  v_konto date;
  v_vorhanden public.lead_pakete%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT meta, email INTO v_meta, v_email FROM public.bewerbungen WHERE id = _bewerbung_id;
  IF v_meta IS NULL THEN
    RETURN jsonb_build_object('status', 'kein_paket');
  END IF;

  v_anzahl := CASE WHEN jsonb_typeof(v_meta->'leadPaket'->'anzahl') = 'number'
                   THEN (v_meta->'leadPaket'->>'anzahl')::numeric END;
  v_betrag := CASE WHEN jsonb_typeof(v_meta->'leadPaket'->'betrag') = 'number'
                   THEN (v_meta->'leadPaket'->>'betrag')::numeric END;
  IF v_anzahl IS NULL OR v_anzahl < 1 OR v_anzahl > 10000
     OR v_betrag IS NULL OR v_betrag <= 0 OR v_betrag >= 1000000 THEN
    RETURN jsonb_build_object('status', 'kein_paket');
  END IF;

  IF public.lead_paket_datum(v_meta->>'rechnungBezahltAm') IS NULL THEN
    RETURN jsonb_build_object('status', 'nicht_bezahlt');
  END IF;
  v_bezahlt := COALESCE(public.lead_paket_datum(v_meta->>'rechnungZahlungsdatum'),
                        public.lead_paket_datum(v_meta->>'rechnungBezahltAm'));

  v_partner := CASE WHEN v_meta->>'userAccountId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    THEN (v_meta->>'userAccountId')::uuid END;
  IF v_partner IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = v_partner AND role IN ('vertriebspartner', 'vertriebsleiter')
  ) THEN
    RETURN jsonb_build_object('status', 'kein_konto');
  END IF;

  IF NULLIF(lower(btrim(COALESCE(v_email, ''))), '') IS NULL
     OR NOT EXISTS (SELECT 1 FROM auth.users u
                     WHERE u.id = v_partner
                       AND lower(btrim(COALESCE(u.email, ''))) = lower(btrim(v_email))) THEN
    RETURN jsonb_build_object('status', 'email_abweichend');
  END IF;

  -- Rohwert: Tag der Kontoanlage. Die Freischaltung liegt nie vor der Zahlung.
  v_konto := public.lead_paket_datum(v_meta->>'userInviteSentAt');

  SELECT * INTO v_vorhanden FROM public.lead_pakete WHERE bewerbung_id = _bewerbung_id FOR UPDATE;
  IF FOUND THEN
    UPDATE public.lead_pakete lp
       SET bezahlt_am = COALESCE(lp.bezahlt_am, v_bezahlt),
           freigeschaltet_am = COALESCE(lp.freigeschaltet_am,
             CASE WHEN v_konto IS NULL THEN NULL
                  ELSE GREATEST(v_konto, COALESCE(lp.bezahlt_am, v_bezahlt)) END),
           geaendert_am = now(),
           geaendert_von = auth.uid()
     WHERE lp.id = v_vorhanden.id
       AND ((lp.bezahlt_am IS NULL AND v_bezahlt IS NOT NULL)
            OR (lp.freigeschaltet_am IS NULL AND v_konto IS NOT NULL));
    RETURN jsonb_build_object('status', CASE WHEN FOUND THEN 'ergaenzt' ELSE 'vorhanden' END,
                              'paket_id', v_vorhanden.id, 'anzahl', v_vorhanden.anzahl);
  END IF;

  INSERT INTO public.lead_pakete (partner_id, anzahl, paketpreis, bezahlt_am, freigeschaltet_am, bemerkung, bewerbung_id, erstellt_von)
  VALUES (v_partner, round(v_anzahl)::integer, round(v_betrag, 2), v_bezahlt,
          CASE WHEN v_konto IS NULL THEN NULL ELSE GREATEST(v_konto, v_bezahlt) END,
          'Aus der Bewerbung angelegt', _bewerbung_id, auth.uid())
  ON CONFLICT (bewerbung_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    -- Gleichzeitig schon angelegt.
    SELECT id INTO v_id FROM public.lead_pakete WHERE bewerbung_id = _bewerbung_id;
    RETURN jsonb_build_object('status', 'vorhanden', 'paket_id', v_id, 'anzahl', round(v_anzahl)::integer);
  END IF;
  RETURN jsonb_build_object('status', 'angelegt', 'paket_id', v_id, 'anzahl', round(v_anzahl)::integer);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lead_paket_aus_bewerbung_intern(uuid) FROM anon, authenticated, public;


-- Aufruf aus dem Browser nach Zahlungsbestaetigung und Nutzeranlage.
-- Rechte wie beim Bearbeiten von Bewerbungen (darf_bewerberbereich: HR,
-- Admin, Inhaber, Backoffice; GL-Entscheidung vom 29.09.2026). Das
-- ist vertretbar, weil der Aufrufer nur die Bewerbung nennt: Alle Werte
-- liest die Funktion selbst aus der Bewerbung, dazu die E-Mail-Pruefung.
--
-- Legt jemand ausser Admin und Inhaber ein Paket neu an, bekommen alle mit
-- Rolle admin oder inhaber eine Glocke (GL-Entscheidung vom
-- 29.09.2026, Variante b: keine Kontobindung an die Einladung, dafuer
-- Nachkontrolle). Nicht an den Ausloeser selbst. Namen ueber die Kennung
-- aus profiles, nie ueber eine Namenssuche.
CREATE OR REPLACE FUNCTION public.lead_paket_aus_bewerbung(_bewerbung_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ergebnis jsonb;
  v_partner_name text;
  v_ausloeser_name text;
  v_empfaenger uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.darf_bewerberbereich(v_uid) THEN
    RAISE EXCEPTION 'Leadpakete aus der Bewerbung legen nur HR, Admin, Inhaber und Backoffice an.' USING ERRCODE = '42501';
  END IF;
  v_ergebnis := public.lead_paket_aus_bewerbung_intern(_bewerbung_id);

  IF v_ergebnis->>'status' = 'angelegt'
     AND NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'inhaber')) THEN
    SELECT COALESCE(NULLIF(btrim(pr.name), ''), 'Ohne Namen') INTO v_partner_name
      FROM public.lead_pakete lp
      LEFT JOIN public.profiles pr ON pr.id = lp.partner_id
     WHERE lp.id = (v_ergebnis->>'paket_id')::uuid;
    SELECT COALESCE(NULLIF(btrim(name), ''), 'Ohne Namen') INTO v_ausloeser_name
      FROM public.profiles WHERE id = v_uid;

    FOR v_empfaenger IN
      SELECT DISTINCT ur.user_id
        FROM public.user_roles ur
       WHERE ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role)
         AND ur.user_id <> v_uid
    LOOP
      INSERT INTO public.benachrichtigungen (benutzer_id, titel, nachricht, link)
      VALUES (
        v_empfaenger,
        'Leadpaket angelegt, bitte prüfen',
        'Leadpaket angelegt: ' || (v_ergebnis->>'anzahl') || ' Leads für '
          || COALESCE(v_partner_name, 'Ohne Namen') || ', ausgelöst von '
          || COALESCE(v_ausloeser_name, 'Ohne Namen') || '. Bitte prüfen.',
        '/statistiken?tab=leadzuweisung'
      );
    END LOOP;
  END IF;

  RETURN v_ergebnis;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lead_paket_aus_bewerbung(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lead_paket_aus_bewerbung(uuid) TO authenticated;

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeilen 53.1 bis 53.9 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
