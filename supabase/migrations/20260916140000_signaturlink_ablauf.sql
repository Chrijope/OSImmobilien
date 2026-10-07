-- ===========================================================================
-- Signaturlinks laufen wirklich ab, und geben weniger heraus
-- ===========================================================================
--
-- WARUM
--
-- Ein externes Sicherheitsaudit vom 15.09.2026 hat unter der Kennung F10
-- gemeldet, dass `public.get_signature_request(text)` zu viel und zu lange
-- herausgibt. Am 16.09.2026 wurde der Befund bestaetigt und freigegeben.
--
-- Die zeitlich letzte Fassung steht in
-- 20260517144424_33cb7a07-7133-4cfe-bc34-d6a581d531c0.sql und lautet:
--
--   SELECT * FROM public.signature_requests WHERE token = _token LIMIT 1
--
-- Die Funktion ist SECURITY DEFINER und bewusst fuer `anon` freigegeben,
-- denn der Kunde soll ohne Konto unterschreiben koennen. Die Tabelle selbst
-- hat seit dem 02.04.2026 keine Lesepolicy fuer `anon` mehr, diese Funktion
-- ist also der einzige oeffentliche Weg an die Daten. Umso mehr haengt an
-- ihr.
--
-- ZWEI FEHLER
--
-- 1) Das Ablaufdatum wurde nie nachgesehen. Die Spalte `expires_at` ist
--    NOT NULL und wird beim Anlegen gefuellt, aber die Abfrage fragt nicht
--    danach. Ein Link von vor einem halben Jahr lieferte heute noch die
--    vollstaendige Selbstauskunft.
--
-- 2) `SELECT *` gab die ganze Zeile heraus, auch `ip_address`, `user_agent`
--    und `meta`. Das sind Nachweise fuer den Streitfall beziehungsweise
--    interne Vermerke der Erinnerungs- und Eskalationslaeufe. Sie haben in
--    einer Antwort nichts zu suchen, die jeder mit dem Link abrufen kann.
--    Dasselbe gilt fuer `signature_data`, das Bild der bereits geleisteten
--    Unterschrift.
--
-- WAS SICH AENDERT
--
-- Teil 1: Die Funktion liefert zu einem abgelaufenen Link nichts mehr.
--   Die Bedingung steht als COALESCE(expires_at > now(), false). `expires_at`
--   ist zwar NOT NULL, ein Vergleich koennte also gar nicht unbekannt
--   werden. Die Einfassung steht trotzdem da, weil genau diese dreiwertige
--   Logik am 16.09.2026 schon an drei Stellen die Ursache war, siehe
--   20260916100000_rpc_sperren_dreiwertige_logik.sql. Eine spaetere
--   Aenderung an der Spalte soll die Sperre nicht stillschweigend aushebeln.
--
-- Teil 2: Vier Felder kommen nur noch leer zurueck: `ip_address`,
--   `user_agent`, `meta` und `signature_data`. Der Rueckgabetyp bleibt
--   `public.signature_requests`, die Felder bleiben also vorhanden und
--   tragen NULL.
--
--   Der schaerfere Weg waere ein eigener, zusammengesetzter Rueckgabetyp mit
--   genau den gebrauchten Feldern gewesen. Er wurde verworfen: Er aendert den
--   Vertrag zum Frontend, zwingt zur Neuerzeugung von
--   `src/integrations/supabase/types.ts`, und jede spaetere Spalte muesste an
--   zwei Stellen nachgezogen werden. Das Leeren erreicht dasselbe Ziel, ohne
--   etwas zu zerbrechen: Wer die Felder heute nicht liest, merkt nichts, und
--   wer sie liest, bekaeme ohnehin nur noch NULL.
--
--   Nachgesehen wurde, was `src/pages/SignaturSeite.tsx` als einziger
--   Aufrufer wirklich braucht: id, name, email, status, expires_at,
--   signed_at, sa_data, kontakt_id, investment_id, person_type. `meta`
--   wird dort nirgends gelesen, es dient allein den Edge Functions
--   `signatur-erinnerung` und `send-reservierung-eskalation`, und die
--   arbeiten mit dem Dienstschluessel direkt auf der Tabelle.
--   `signature_data` liest die Seite ebenfalls nicht; die interne Ansicht
--   `src/pages/KundeInvestments.tsx` holt es direkt aus der Tabelle und ist
--   davon nicht betroffen.
--
--   Der Rumpf arbeitet mit %ROWTYPE und setzt die vier Felder namentlich auf
--   NULL, statt eine Spaltenliste in der richtigen Reihenfolge aufzuzaehlen.
--   So kann eine kuenftige Spalte die Funktion nicht durch eine verschobene
--   Reihenfolge zerlegen. Die Sprache wechselt dafuer von `sql` auf
--   `plpgsql`; Name, Signatur, Rueckgabetyp, SECURITY DEFINER und
--   search_path bleiben unveraendert, bestehende GRANTs bleiben stehen.
--
-- Teil 3: Neu ist `public.signature_request_abgelaufen(text)`. Sie gibt
--   keine Daten heraus, sondern nur wahr oder falsch, und sie sagt nur zu
--   einem vorhandenen, abgelaufenen Link wahr. Zu einem unbekannten Token
--   sagt sie falsch, also dasselbe wie zu einem noch gueltigen. Aus ihrer
--   Antwort laesst sich damit nicht ablesen, ob ein unbekannter Token
--   ueberhaupt existiert. Die Unterschriftsseite fragt sie erst, wenn der
--   Hauptaufruf nichts geliefert hat, und kann so einen abgelaufenen von
--   einem unbekannten Link unterscheiden.
--
-- WAS SICH AUSDRUECKLICH NICHT AENDERT
--
-- Die Fristen selbst. Sie sind sehr unterschiedlich:
--   `send-signature-request` (Selbstauskunft)        7 Tage
--   `send-reservation-signature` (Reservierung)     10 Jahre
-- Die zehn Jahre sind so gewollt, weil die Spalte NOT NULL ist und ueber
-- `send-reservierung-eskalation` nachgefasst wird. Welche Frist fuer eine
-- Reservierung fachlich richtig ist, entscheidet Christian. Diese Pruefung
-- wirkt deshalb sofort fuer Selbstauskuenfte und fuer Reservierungen erst
-- dann, wenn dort eine kuerzere Frist gesetzt wird.
--
-- Wiederholbar: CREATE OR REPLACE, ein zweiter Lauf aendert nichts.
--
-- ---------------------------------------------------------------------------
-- SICHERUNG: heutigen Wortlaut vorher festhalten
-- ---------------------------------------------------------------------------
--
--   select pg_get_functiondef(p.oid)
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname = 'get_signature_request';
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Teil 1 und 2: Ablauf pruefen, heikle Felder leeren
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_signature_request(_token text)
RETURNS public.signature_requests
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _zeile public.signature_requests%ROWTYPE;
BEGIN
  SELECT *
    INTO _zeile
    FROM public.signature_requests
   WHERE token = _token
     -- Geaendert am 16.09.2026 (Audit F10): abgelaufene Links geben nichts
     -- mehr heraus. COALESCE, damit aus einem unbekannt kein Durchlass wird.
     AND COALESCE(expires_at > now(), false)
   LIMIT 1;

  IF NOT FOUND THEN
    -- Neutral: keine Auskunft darueber, ob es den Token gibt
    RETURN NULL;
  END IF;

  -- Nachweise fuer den Streitfall und interne Vermerke bleiben drin
  _zeile.ip_address := NULL;
  _zeile.user_agent := NULL;
  _zeile.meta := NULL;
  _zeile.signature_data := NULL;

  RETURN _zeile;
END;
$$;

COMMENT ON FUNCTION public.get_signature_request(text) IS
  'Oeffentlicher Lesezugriff auf eine Signaturanfrage per Token. Gibt zu abgelaufenen Links nichts heraus und liefert ip_address, user_agent, meta und signature_data immer leer. Audit-Befund F10 vom 15.09.2026.';


-- ---------------------------------------------------------------------------
-- Teil 3: Ist dieser Link abgelaufen? Ja oder nein, sonst nichts
-- ---------------------------------------------------------------------------
--
-- Wahr nur dann, wenn es den Token gibt UND seine Frist vorbei ist.
-- Falsch in jedem anderen Fall, also auch bei einem unbekannten Token.
CREATE OR REPLACE FUNCTION public.signature_request_abgelaufen(_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT COALESCE(sr.expires_at <= now(), false)
        FROM public.signature_requests sr
       WHERE sr.token = _token
       LIMIT 1
    ),
    false
  )
$$;

COMMENT ON FUNCTION public.signature_request_abgelaufen(text) IS
  'Meldet nur, ob ein vorhandener Signaturlink abgelaufen ist. Gibt keine Daten heraus und antwortet zu einem unbekannten Token wie zu einem gueltigen mit falsch.';

REVOKE ALL ON FUNCTION public.signature_request_abgelaufen(text) FROM public;
GRANT EXECUTE ON FUNCTION public.signature_request_abgelaufen(text) TO anon, authenticated;


-- ===========================================================================
-- PRUEFLAUF NACH DEM AUSFUEHREN (aendert nichts)
-- ===========================================================================
--
-- 1) Traegt die Funktion jetzt die Ablaufpruefung?
--
--   select p.proname,
--          (p.prosrc like '%COALESCE(expires_at > now(), false)%') as prueft_ablauf,
--          (p.prosrc like '%_zeile.ip_address := NULL%')           as leert_nachweise
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname = 'get_signature_request';
--
-- 2) Gibt es die neue Funktion, und darf anon sie ausfuehren?
--
--   select p.proname,
--          has_function_privilege('anon', p.oid, 'EXECUTE') as anon_darf
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname = 'signature_request_abgelaufen';
--
-- 3) Ein abgelaufener Link gibt nichts mehr heraus, meldet sich aber als
--    abgelaufen. Ein noch gueltiger Link kommt weiter durch.
--
--   select token, expires_at from public.signature_requests
--    where expires_at < now() order by expires_at desc limit 1;
--
--   select * from public.get_signature_request('<abgelaufener Token>');
--   -- erwartet: keine Zeile beziehungsweise nur NULL-Felder
--   select public.signature_request_abgelaufen('<abgelaufener Token>');
--   -- erwartet: true
--   select public.signature_request_abgelaufen('gibt-es-nicht');
--   -- erwartet: false
--
-- 4) Bei einem gueltigen Link sind die vier Felder leer, der Rest ist da.
--
--   select id, name, email, status, expires_at, sa_data is not null as hat_daten,
--          ip_address, user_agent, meta, signature_data
--     from public.get_signature_request('<gueltiger Token>');
-- ===========================================================================
