-- ===========================================================================
-- Unterschriftsanfragen: Schreiben nur noch serverseitig, Lesen zeilenweise
-- ===========================================================================
--
-- REIHENFOLGE, VERBINDLICH (sonst bricht die Liveseite):
--   1. Push nach main.
--   2. In Lovable ausrollen: signatur-link-erinnern (neu),
--      finalize-aftersales-beratung, send-signature-request,
--      send-reservation-signature, send-vertrag-signature.
--   3. Publish in Lovable.
--   4. Erst dann diese Migration ausfuehren.
-- Laeuft die Migration vor dem Publish, liest die Liveseite noch `token`
-- (Aftersales-Karte, Gegenzeichnungs-Erinnerung) und bekommt "permission
-- denied"; der Aftersales-Dialog der alten Fassung legt Anfragen direkt an
-- und scheitert.
--
-- FREIGABE (GL, 29.09.2026, "ganz wichtig")
--
-- Kein Partner darf Unterschriftsanfragen direkt in der Datenbank anlegen
-- oder aendern, an den vorgesehenen Ablaeufen vorbei. Angelegt und geaendert
-- wird nur fuer eigene Kunden und nur ueber die Ablaeufe selbst:
-- Selbstauskunft, Reservierungsvereinbarung, Aftersales, Partnervertrag.
-- Lesen: Partner nur die Anfragen ihrer eigenen, zugewiesenen Kunden; Rollen,
-- die alle Kunden sehen duerfen, lesen alles; Kunden weiter ihre eigenen;
-- Partnervertraege wie bisher nur im Bewerberbereich. Loeschen unveraendert
-- nur Admin.
--
-- VORHER (Stand der Datenbank am 29.09.2026)
--
--   INSERT  "Interne erstellen Signatur"            is_internal_role
--   INSERT  "Interne erstellen Signatur-Requests"   is_internal_role (doppelt)
--   UPDATE  "Interne bearbeiten Signatur-Requests"  is_internal_role
--   SELECT  "Interne sehen Signatur-Requests"       is_internal_role
--   SELECT  "Kunden sehen eigene Signaturanfragen"  ist_kunde_des_kontakts
--   DELETE  "Admins loeschen Signatur-Requests"     is_admin_role
--   dazu einschraenkend (RESTRICTIVE): Zwei-Faktor, Kundenportal-Sperre,
--   "Partnervertraege nur Bewerberbereich"
--
-- `is_internal_role` schliesst die Rolle `vertriebspartner` mit ein. Jeder
-- Partner konnte also jede Anfrage jedes Kunden lesen, neue anlegen und
-- bestehende aendern, etwa `status = 'signed'` setzen oder `sa_data`
-- nachtraeglich umschreiben, ohne dass eine Function etwas davon mitbekam.
--
-- NACHHER
--
--   INSERT  keine Regel mehr fuer angemeldete Nutzer
--   UPDATE  keine Regel mehr fuer angemeldete Nutzer
--   SELECT  "Interne sehen Signaturanfragen eigener Kunden"  (neu, zeilenweise)
--   SELECT  "Kunden sehen eigene Signaturanfragen"           unveraendert
--   DELETE  "Admins loeschen Signatur-Requests"              unveraendert
--   die drei einschraenkenden Regeln                         unveraendert
--   jede andere erlaubende Regel fuer SELECT, INSERT, UPDATE, ALL: entfernt
--
-- SPALTE `token` (Nachbesserung aus der Gegenpruefung, 29.09.2026)
--
-- Der Token ist der Schluessel zur oeffentlichen Unterschriftsseite. Wer ihn
-- lesen kann, kann ueber `sign_signature_request` im Namen des Kunden
-- unterschreiben. Bisher las jeder Partner die Tokens seiner Kunden (vorher
-- sogar aller Kunden). Deshalb verlieren `anon` und `authenticated` hier das
-- Tabellenrecht zum Lesen, Anlegen und Aendern; `authenticated` bekommt das
-- Lesen spaltenweise zurueck, fuer alle Spalten ausser `token`. Wer den
-- Token braucht, braucht ihn zum Versenden eines Links, und das macht jetzt
-- der Server (Edge Function `signatur-link-erinnern`). Der Kunde bekommt
-- seinen Link wie bisher per Mail. Loeschen bleibt, wie es ist (nur Admin).
--
-- ACHTUNG fuer spaetere Migrationen: Eine neue Spalte ist fuer angemeldete
-- Nutzer erst lesbar, wenn sie hier unten in GRANT SELECT (...) ergaenzt
-- wird. Ein `select('*')` aus dem Browser scheitert ab jetzt, die Stellen im
-- Code nennen ihre Spalten ausdruecklich.
--
-- Geschrieben wird nur noch mit dem Dienstschluessel (Edge Functions, er
-- umgeht die Zeilensicherheit) und ueber SECURITY-DEFINER-Funktionen:
--   Selbstauskunft       send-signature-request, submit-sa-signature,
--                        update-sa-signature-data, finalize-selbstauskunft
--   Reservierung         send-reservation-signature, finalize-reservierung
--   Partnervertrag       send-vertrag-signature, finalize-vertrag
--   Aftersales           NEU aftersales_signatur_anlegen (unten), danach
--                        sign_signature_request und finalize-aftersales-beratung
--   Unterschreiben       sign_signature_request, mark_signature_link_opened,
--                        mark_signature_email_opened (alle SECURITY DEFINER)
--
-- DER EINZIGE DIREKTE SCHREIBWEG IM BROWSER war der Aftersales-Dialog
-- (src/components/kunde/investments/AftersalesBeratungDialog.tsx): zwei
-- INSERT fuer `aftersales_vp` und `aftersales_kunde`, ein UPDATE auf
-- "signed" nach der Unterschrift des Partners. Die INSERT laufen jetzt ueber
-- `aftersales_signatur_anlegen`, das UPDATE ueber das vorhandene
-- `sign_signature_request`. Alle anderen Stellen im Browser lesen nur.
--
-- WER ZAEHLT ALS "EIGENER KUNDE": dieselbe Regel wie bei `investments`
-- (20260916191000_investments_zeilenweise.sql):
--   is_internal_role(uid) AND (darf_alle_kunden_sehen(uid)
--                              OR ist_eigener_kontakt(uid, kontakt_id))
-- `ist_eigener_kontakt` geht ueber `is_vp_owner_of_kontakt`, schliesst also
-- die laufende Vertretung ein. Das ist gewollt: Die Vertretung fuehrt den
-- Vorgang weiter, wenn der Partner im Urlaub ist.
--
-- Partnervertraege (`vertrag`, `vertrag_kurz`) haben keinen Kunden, ihre
-- `kontakt_id` ist die Kennung des Bewerbers. Sie liest der Bewerberbereich
-- (`darf_bewerberbereich`: hr, admin, inhaber, backoffice). Die Rolle `hr`
-- steht nicht in `darf_alle_kunden_sehen`, deshalb ein eigener Zweig. Die
-- einschraenkende Regel "Partnervertraege nur Bewerberbereich" bleibt
-- zusaetzlich stehen.
--
-- FOLGE FUER ROLLEN OHNE BLICK AUF ALLE KUNDEN: hausverwaltung,
-- objektpartner, marketing, hr und versicherungsexperte sehen Anfragen von
-- Kunden nur noch, wenn sie fuer den Kontakt zustaendig sind. Das entspricht
-- `investments` seit dem 16.09.2026.
--
-- AFTERSALES OHNE DUBLETTEN: Wird der Dialog ein zweites Mal ausgefuellt,
-- markiert `aftersales_signatur_anlegen` die noch offenen Aftersales-Anfragen
-- desselben Investments als `ueberholt` (derselbe Status wie bei einer
-- abgeloesten Selbstauskunft). `finalize-aftersales-beratung` findet damit
-- genau eine offene Anfrage je Seite.
--
-- Mehrfach ausfuehrbar. Aendert keine Daten.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Schreibregeln fuer angemeldete Nutzer entfernen
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Interne erstellen Signatur" ON public.signature_requests;
DROP POLICY IF EXISTS "Interne erstellen Signatur-Requests" ON public.signature_requests;
DROP POLICY IF EXISTS "Interne bearbeiten Signatur-Requests" ON public.signature_requests;

-- Riegel gegen von Hand angelegte Schreibregeln, die hier nicht namentlich
-- stehen ("Interne erstellen Signatur" stand in keiner Migration und lag
-- trotzdem in der Datenbank). Er trifft nur ERLAUBENDE Regeln fuer INSERT,
-- UPDATE oder ALL. Die einschraenkenden Regeln (Zwei-Faktor,
-- Kundenportal-Sperre, Partnervertraege) sind RESTRICTIVE und bleiben.
DO $$
DECLARE
  regel RECORD;
BEGIN
  FOR regel IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'signature_requests'
       AND permissive = 'PERMISSIVE'
       AND cmd IN ('INSERT', 'UPDATE', 'ALL')
       AND (roles && ARRAY['authenticated', 'anon', 'public']::name[])
  LOOP
    RAISE NOTICE 'Schreibregel entfernt: %', regel.policyname;
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.signature_requests', regel.policyname);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 2) Lesen zeilenweise
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Interne sehen Signatur-Requests" ON public.signature_requests;

-- Riegel fuer das Lesen: Ausser den beiden Regeln unten bleibt keine
-- erlaubende SELECT-Regel stehen. Eine vergessene, weitere Leseregel wuerde
-- sonst mit ODER an die neue gehaengt und sie aushebeln.
DO $$
DECLARE
  regel RECORD;
BEGIN
  FOR regel IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'signature_requests'
       AND permissive = 'PERMISSIVE'
       AND cmd = 'SELECT'
       AND policyname NOT IN ('Interne sehen Signaturanfragen eigener Kunden',
                              'Kunden sehen eigene Signaturanfragen')
  LOOP
    RAISE NOTICE 'Leseregel entfernt: %', regel.policyname;
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.signature_requests', regel.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Interne sehen Signaturanfragen eigener Kunden" ON public.signature_requests;
CREATE POLICY "Interne sehen Signaturanfragen eigener Kunden"
  ON public.signature_requests
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(
      (
        (select public.is_internal_role(auth.uid()))
        AND (
          (select public.darf_alle_kunden_sehen(auth.uid()))
          OR public.ist_eigener_kontakt(auth.uid(), signature_requests.kontakt_id::text)
        )
      )
      OR (
        signature_requests.person_type IN ('vertrag', 'vertrag_kurz')
        AND (select public.darf_bewerberbereich(auth.uid()))
      ),
      false)
  );


-- ---------------------------------------------------------------------------
-- 3) Tabellenrechte: kein Schreiben, kein Token fuer den Browser
-- ---------------------------------------------------------------------------

-- `anon` hat hier nichts zu suchen, der oeffentliche Weg laeuft ueber die
-- SECURITY-DEFINER-Funktionen. TRUNCATE, REFERENCES und TRIGGER standen
-- ebenfalls offen (Supabase-Grundeinstellung); TRUNCATE umgeht die
-- Zeilensicherheit. DELETE bleibt fuer `authenticated`, die Regel laesst nur
-- den Admin durch.
REVOKE ALL ON public.signature_requests FROM anon;
REVOKE SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER
  ON public.signature_requests FROM authenticated;
GRANT SELECT (
  id, kontakt_id, investment_id, person_type, email, name, status,
  expires_at, created_at, signed_at, signature_data, ip_address, user_agent,
  consent_text, sa_data, email_opened_at, link_opened_at, meta
) ON public.signature_requests TO authenticated;


-- ---------------------------------------------------------------------------
-- 4) Aftersales: beide Anfragen serverseitig anlegen
-- ---------------------------------------------------------------------------
--
-- Der Kontakt kommt aus dem Investment, nicht aus dem Aufruf, Name und
-- Mailadresse des Kunden aus dem Kontakt. So kann niemand eine Anfrage an
-- einen fremden Kunden oder eine fremde Adresse haengen. Zurueck kommt der
-- Token der Partner-Anfrage, der Dialog zeigt ihn als QR-Code.

CREATE OR REPLACE FUNCTION public.aftersales_signatur_anlegen(
  _investment_id uuid,
  _formular jsonb,
  _vp_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _kontakt_id uuid;
  _vp_unterschrieben text;
  _kunde_name text;
  _kunde_email text;
  _vp_token text := gen_random_uuid()::text;
  _ablauf timestamptz := now() + interval '14 days';
  _daten jsonb := jsonb_build_object('aftersalesBeratung', COALESCE(_formular, '{}'::jsonb));
BEGIN
  -- Obergrenze: Das Formular sind ein paar Textfelder und Haken. 32 KB
  -- reichen weit, alles darueber ist kein Formular mehr.
  IF octet_length(COALESCE(_formular, '{}'::jsonb)::text) > 32768
     OR octet_length(COALESCE(_vp_name, '')) > 200 THEN
    RAISE EXCEPTION 'Das Aftersales-Formular ist zu gross.'
      USING ERRCODE = '22023';
  END IF;

  -- FOR UPDATE: Zwei gleichzeitige Aufrufe fuer dasselbe Investment laufen
  -- nacheinander, sonst entstuenden doch zwei offene Paare.
  SELECT i.kunde_id, NULLIF(btrim(i.meta -> 'aftersalesBeratung' ->> 'vpSignedAt'), '')
    INTO _kontakt_id, _vp_unterschrieben
    FROM public.investments i
   WHERE i.id = _investment_id
     FOR UPDATE;

  -- COALESCE: Jede Rollenfunktion kann NULL liefern, NULL ist hier "nein".
  IF _uid IS NULL OR _kontakt_id IS NULL OR NOT COALESCE(
       public.is_internal_role(_uid)
       AND (public.darf_alle_kunden_sehen(_uid)
            OR public.ist_eigener_kontakt(_uid, _kontakt_id::text)),
       false)
  THEN
    RAISE EXCEPTION 'Fuer dieses Investment darf keine Aftersales-Unterschrift angelegt werden.'
      USING ERRCODE = '42501';
  END IF;

  -- Hat der Partner schon unterschrieben, laeuft der Vorgang beim Kunden.
  -- Ein neuer Durchgang wuerde dessen offenen Link abloesen.
  IF _vp_unterschrieben IS NOT NULL THEN
    RAISE EXCEPTION 'Das Aftersales-Beratungsdokument ist vom Partner schon unterschrieben.'
      USING ERRCODE = '55000';
  END IF;

  SELECT NULLIF(btrim(concat_ws(' ', k.vorname, k.nachname)), ''),
         NULLIF(btrim(k.email), '')
    INTO _kunde_name, _kunde_email
    FROM public.kontakte k
   WHERE k.id = _kontakt_id;

  -- Noch offene Anfragen eines frueheren Durchgangs abloesen, damit
  -- `finalize-aftersales-beratung` genau eine offene Anfrage findet.
  -- Unterschriebene bleiben, wie sie sind.
  UPDATE public.signature_requests
     SET status = 'ueberholt'
   WHERE investment_id = _investment_id::text
     AND person_type IN ('aftersales_vp', 'aftersales_kunde')
     AND status = 'pending';

  -- Die Adressen der Partner-Zeile wie bisher im Dialog: sie wird nie
  -- angeschrieben, die Spalte ist nur Pflicht.
  INSERT INTO public.signature_requests
    (token, kontakt_id, investment_id, person_type, name, email, status, expires_at, sa_data)
  VALUES
    (_vp_token, _kontakt_id, _investment_id::text, 'aftersales_vp',
     COALESCE(NULLIF(btrim(_vp_name), ''), 'Vertriebspartner'),
     COALESCE(_kunde_email, 'vp@internal.local'),
     'pending', _ablauf, _daten),
    (gen_random_uuid()::text, _kontakt_id, _investment_id::text, 'aftersales_kunde',
     COALESCE(_kunde_name, 'Kunde'),
     COALESCE(_kunde_email, 'kunde@unknown.local'),
     'pending', _ablauf, _daten);

  RETURN _vp_token;
END;
$$;

COMMENT ON FUNCTION public.aftersales_signatur_anlegen(uuid, jsonb, text) IS
  'Legt die beiden Aftersales-Unterschriftsanfragen (Partner und Kunde) an. '
  'Nur fuer interne Rollen mit Blick auf alle Kunden oder den Zustaendigen '
  'des Kunden. Gibt den Token der Partner-Anfrage zurueck.';

REVOKE ALL ON FUNCTION public.aftersales_signatur_anlegen(uuid, jsonb, text) FROM public;
REVOKE ALL ON FUNCTION public.aftersales_signatur_anlegen(uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.aftersales_signatur_anlegen(uuid, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeilen 48.1 bis 48.6 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
