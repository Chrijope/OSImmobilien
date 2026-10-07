-- ===========================================================================
-- signature_requests: kein offener Zugriff mehr, und der Kunde sieht wieder
-- seine eigenen Unterschriften
-- ===========================================================================
--
-- WAS IN DER TABELLE STEHT
--
-- `public.signature_requests` ist die heikelste Tabelle im ganzen System.
-- In ihr liegen:
--   `sa_data`         die vollstaendige Selbstauskunft, also Einkommen,
--                     Vermoegen, Verbindlichkeiten, Arbeitgeber
--   `signature_data`  das Bild der geleisteten Unterschrift
--   `name`, `email`   Klarname und Mailadresse
--   `ip_address`,
--   `user_agent`      die Nachweise fuer den Streitfall
--   `token`           der Schluessel, mit dem ohne Anmeldung unterschrieben
--                     werden kann
-- Sie traegt drei verschiedene Vorgaenge nebeneinander, unterschieden ueber
-- `person_type`: Selbstauskuenfte (`person1`, `person2`, `partner`),
-- Reservierungsvereinbarungen (`rv_%`), Vertriebspartnervertraege
-- (`vertrag`, `vertrag_kurz`) und die Aftersales-Beratung
-- (`aftersales_vp`, `aftersales_kunde`).
--
--
-- DIE GEMELDETE LUECKE, UND WAS DIE AKTENLAGE DAZU SAGT
--
-- Gemeldet wurde am 16.09.2026, dass zwei Regeln aus
-- 20260316201640_6b149c60-edf3-4b3b-9ee6-caf0d49d0c80.sql bis heute aktiv
-- seien:
--
--   CREATE POLICY "Anon lesen per Token" ON public.signature_requests
--   FOR SELECT TO anon, authenticated USING (true);
--
--   CREATE POLICY "Anon aktualisieren per Token" ON public.signature_requests
--   FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
--
-- Waeren sie aktiv, koennte jeder ohne Anmeldung alle Zeilen lesen und
-- aendern. Der Befund wurde damit begruendet, dass keine spaetere Migration
-- diese beiden Namen wieder mit DROP POLICY nennt. Das stimmt, fuehrt aber
-- in die Irre.
--
-- 20260402103925_12b24a80-5ead-44f1-ba95-a0e19838bebd.sql raeumt naemlich
-- nicht nur namentlich auf, sondern haengt danach einen Block an, der ueber
-- `pg_policies` laeuft und jede Regel dieser Tabelle entfernt, deren
-- Bedingung `true` lautet:
--
--   FOR pol IN SELECT policyname FROM pg_policies
--              WHERE tablename = 'signature_requests'
--                AND (qual = 'true' OR with_check = 'true')
--   LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON ...', pol.policyname);
--
-- Beide gemeldeten Regeln fallen darunter, denn beide haben `USING (true)`.
-- Nach Aktenlage sind sie also seit dem 02.04.2026 weg. Dieselbe Aussage
-- steht unabhaengig davon im Kopf von 20260916140000_signaturlink_ablauf.sql:
-- die Tabelle habe seit dem 02.04.2026 keine Lesepolicy fuer `anon` mehr.
--
-- WARUM DIESE MIGRATION TROTZDEM LAEUFT
--
-- Weil "nach Aktenlage" hier nicht genug ist. Migrationen werden in diesem
-- Projekt von Hand im SQL-Editor ausgefuehrt, und in Lovable wird parallel
-- gearbeitet. Ob der Aufraeumblock vom 02.04.2026 wirklich gelaufen ist und
-- ob seither niemand von Hand eine offene Regel nachgelegt hat, entscheidet
-- der tatsaechliche Stand der Datenbank, nicht der Ordner. Diese Migration
-- kostet nichts, wenn nichts da ist, und schliesst die Luecke, wenn doch.
-- Der Pruefteil 1 unten sagt hinterher, was wirklich vorlag.
--
--
-- WAS JETZT GILT
--
-- Teil 1: Die beiden gemeldeten Regeln werden namentlich entfernt, dazu die
--   uebrigen offenen Namen aus der Geschichte dieser Tabelle. Danach laeuft
--   derselbe Riegel wie am 02.04.2026, aber enger gefasst: Er entfernt nur
--   noch Regeln, die tatsaechlich fuer `anon` gelten. Der Block von damals
--   hat ohne diese Einschraenkung auch `Service role full access` und
--   `Service erstellen Signatur` mit weggeraeumt. Das blieb folgenlos, weil
--   der Dienstschluessel die Zeilensicherheit ohnehin umgeht, war aber nicht
--   beabsichtigt.
--
-- Teil 2: Neu ist eine Regel fuer den angemeldeten Kunden im Portal. Sie
--   fehlte bisher, und dadurch war ein berechtigter Weg zu. Begruendung
--   steht unten bei Teil 2.
--
-- AUSDRUECKLICH NICHT GEAENDERT werden die vier internen Regeln aus
-- 20260402103925. Sie bleiben Wort fuer Wort, wie sie sind:
--   "Interne sehen Signatur-Requests"      SELECT  is_internal_role
--   "Interne bearbeiten Signatur-Requests" UPDATE  is_internal_role
--   "Interne erstellen Signatur-Requests"  INSERT  is_internal_role
--   "Admins loeschen Signatur-Requests"    DELETE  is_admin_role
--
--
-- DIE BERECHTIGTEN WEGE, EINZELN NACHGESEHEN
--
-- 1) Ohne Anmeldung, mit Token: `src/pages/SignaturSeite.tsx`.
--    Die Seite fasst die Tabelle nirgends direkt an. Sie arbeitet
--    ausschliesslich ueber `get_signature_request`, `sign_signature_request`
--    und `mark_signature_link_opened`. Alle drei sind SECURITY DEFINER und
--    an `anon` freigegeben, umgehen die Zeilensicherheit also und brauchen
--    keine Regel. Die beiden `supabase.channel(...)` auf der Seite sind
--    reine Broadcast-Kanaele fuer die Unterschrift vom Handy, sie lesen
--    nichts aus der Tabelle. Dieser Weg bleibt unberuehrt.
--
--    Erst dadurch wirken die beiden Absicherungen vom 16.09.2026 aus
--    20260916140000 ueberhaupt: die Ablaufpruefung und das Leeren von
--    `ip_address`, `user_agent`, `meta` und `signature_data`. Wer die
--    Tabelle direkt lesen koennte, braucht die Funktion nicht und umgeht
--    beides.
--
-- 2) Angemeldeter Kunde im Portal: `src/pages/KundeInvestments.tsx`, Zeile
--    2067. Siehe Teil 2.
--
-- 3) Angemeldete Mitarbeiter, alle Direktzugriffe nachgesehen:
--      src/components/kunden/SaVersandZeitpunkt.tsx:37          SELECT
--      src/components/kunden/SaPartialSignaturePill.tsx:78      SELECT
--      src/components/kunde/investments/AftersalesBeratungCard.tsx:59   SELECT
--      src/components/kunde/investments/AftersalesBeratungDialog.tsx:112 INSERT
--      src/components/kunde/investments/AftersalesBeratungDialog.tsx:127 INSERT
--      src/components/kunde/investments/AftersalesBeratungDialog.tsx:156 UPDATE
--      src/components/bewerbung/VertragsTab.tsx:54              SELECT
--      src/components/bewerbung/VertragsTab.tsx:1031            SELECT
--      src/components/selbstauskunft/SelbstauskunftForm.tsx:1209 DELETE
--    Die ersten acht deckt `is_internal_role` ab, sie laufen weiter.
--    `VertragsTab` gehoert zum Bewerberprozess und liest Vertragszeilen,
--    nicht Kundenzeilen; auch das faellt unter dieselbe interne Regel.
--    Der DELETE in `SelbstauskunftForm` ist ein Sonderfall, siehe unten
--    unter OFFEN.
--
-- 4) Edge Functions: nicht betroffen. Alle greifen mit dem Dienstschluessel
--    zu. `send-reservation-signature` und `send-vertrag-signature` bauen
--    zwar zusaetzlich einen Client mit dem anon-Schluessel, benutzen ihn
--    aber ausschliesslich fuer `auth.getUser()`, nie fuer die Tabelle.
--
--
-- OFFEN, NICHT TEIL DIESER MIGRATION
--
-- `src/components/selbstauskunft/SelbstauskunftForm.tsx:1209` loescht beim
-- Entfernen von Person 2 die zugehoerigen Signaturanfragen. Loeschen darf
-- laut Regel nur `is_admin_role`. Fuer einen Vertriebspartner scheitert der
-- Schritt also, und da die Form auch auf der Signaturseite und unter
-- `/sa/:token` eingebettet ist, scheitert er ohne Anmeldung erst recht.
-- Das ist so seit dem 02.04.2026 und keine neue Folge dieser Migration. Wer
-- kuenftig loeschen darf, ist eine fachliche Entscheidung und braucht eine
-- eigene Migration.
--
-- Wiederholbar: DROP POLICY IF EXISTS vor jedem CREATE POLICY, CREATE OR
-- REPLACE bei der Funktion. Ein zweiter Lauf aendert nichts.
--
-- ---------------------------------------------------------------------------
-- SICHERUNG: heutigen Stand vorher festhalten
-- ---------------------------------------------------------------------------
--
--   select policyname, cmd, roles, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and tablename = 'signature_requests'
--    order by cmd, policyname;
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Teil 1: Jeden offenen Zugriff fuer anon entfernen
-- ---------------------------------------------------------------------------

-- Die beiden gemeldeten Regeln, namentlich.
DROP POLICY IF EXISTS "Anon lesen per Token" ON public.signature_requests;
DROP POLICY IF EXISTS "Anon aktualisieren per Token" ON public.signature_requests;

-- Die uebrigen offenen Namen aus der Geschichte dieser Tabelle. Sie sind
-- nach Aktenlage alle laengst weg; sie stehen hier, damit ein von Hand
-- wiederhergestellter Altbestand nicht stehen bleibt.
DROP POLICY IF EXISTS "Oeffentlich lesen per Token" ON public.signature_requests;
DROP POLICY IF EXISTS "Oeffentlich aktualisieren Signatur" ON public.signature_requests;
DROP POLICY IF EXISTS "Lesen per Token anon" ON public.signature_requests;
DROP POLICY IF EXISTS "Aktualisieren per Token" ON public.signature_requests;
DROP POLICY IF EXISTS "Token-basiert lesen" ON public.signature_requests;
DROP POLICY IF EXISTS "Token-basiert lesen v2" ON public.signature_requests;
DROP POLICY IF EXISTS "Token-basiert signieren" ON public.signature_requests;
DROP POLICY IF EXISTS "Token-basiert signieren v2" ON public.signature_requests;

-- Der Riegel gegen alles, was hier nicht namentlich steht.
--
-- Anders als der Block vom 02.04.2026 trifft dieser nur Regeln, die
-- tatsaechlich fuer `anon` gelten. `roles` ist ein name[], der Vergleich
-- laeuft deshalb ueber den Array-Operator. `public` steht mit drin, weil
-- eine Regel ohne TO-Angabe fuer alle gilt und damit auch fuer `anon`.
--
-- Die Bedingung prueft `qual` und `with_check` getrennt und faengt beide
-- Schreibweisen ab. Der Vergleich gegen NULL ist bewusst in COALESCE
-- gefasst: `with_check` ist bei einer reinen SELECT-Regel NULL, und
-- `NULL = 'true'` ist weder wahr noch falsch, sondern unbekannt. Ein
-- `unbekannt OR unbekannt` haette die Schleife stillschweigend leer laufen
-- lassen. Genau diese dreiwertige Logik war am 16.09.2026 schon an fuenf
-- Stellen die Ursache, siehe 20260916100000_rpc_sperren_dreiwertige_logik.sql.
DO $$
DECLARE
  regel RECORD;
BEGIN
  FOR regel IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'signature_requests'
       AND (roles && ARRAY['anon', 'public']::name[])
       AND COALESCE(
             COALESCE(lower(btrim(qual)),       '') = 'true'
             OR COALESCE(lower(btrim(with_check)), '') = 'true',
             false)
  LOOP
    RAISE NOTICE 'Offene Regel fuer anon entfernt: %', regel.policyname;
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.signature_requests', regel.policyname);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- Teil 2: Der angemeldete Kunde sieht wieder seine eigenen Unterschriften
-- ---------------------------------------------------------------------------
--
-- `src/pages/KundeInvestments.tsx` liest ab Zeile 2067 direkt aus der
-- Tabelle. Die Seite haengt an der Route `/kunde/investments`, das ist das
-- Kundenportal. Wer sie sieht, ist angemeldet, aber er ist kein Mitarbeiter,
-- `is_internal_role` sagt zu ihm falsch. Die Regel "Interne sehen
-- Signatur-Requests" deckt ihn also nicht ab, und eine eigene Regel gab es
-- nie. Damit lief die Abfrage ins Leere, seit die offenen anon-Regeln weg
-- sind.
--
-- Zu sehen ist das im Code selbst: Der Aufruf steckt in einem try-Block, der
-- im Fehlerfall nur eine Zeile auf die Konsole schreibt und dann auf
-- `meta.saSignatures` zurueckfaellt. Der Kunde bekam sein Selbstauskunfts-PDF
-- also weiterhin, nur ohne die bereits geleisteten Unterschriften, und
-- niemand sah eine Fehlermeldung. Genau so sieht eine Luecke in der
-- Abdeckung aus, die lange unbemerkt bleibt.
--
-- Wer gilt als Kunde: derselbe Massstab wie ueberall sonst im Projekt, also
-- `kontakte.meta->>'authUserId'` oder `meta->'person2'->>'authUserId'`, so
-- wie `merge_kontakt_meta` und `darf_investment_nutzen` es halten. Beide
-- Personen eines Haushalts sehen dieselbe Selbstauskunft; das ist gewollt,
-- sie fuellen sie gemeinsam aus und unterschreiben sie gemeinsam.
--
-- Warum eine eigene Funktion und kein EXISTS in der Regel selbst: Ein
-- Unterabfrage-EXISTS auf `kontakte` laeuft mit den Rechten des Abfragenden,
-- die Zeilensicherheit auf `kontakte` gilt dabei also mit. Die Regel haenge
-- dann still von einer zweiten Regel ab. Eine SECURITY DEFINER-Funktion
-- macht die Abhaengigkeit sichtbar und schneidet sie durch. Das entspricht
-- dem Weg, den 20260827220000 und 20260916190000 fuer die uebrigen Tabellen
-- schon gegangen sind.

CREATE OR REPLACE FUNCTION public.ist_kunde_des_kontakts(
  _user_id uuid, _kontakt_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- COALESCE aussen: Traegt `meta` kein `authUserId`, liefert der Vergleich
  -- nicht falsch, sondern unbekannt. Unbekannt in einer Zugriffsregel ist
  -- kein Durchlass, aber auch keine saubere Sperre, deshalb wird es hier zu
  -- falsch. Dasselbe gilt fuer `_user_id IS NULL`, also einen nicht
  -- angemeldeten Aufrufer: Er bekommt falsch, nicht unbekannt.
  SELECT COALESCE(
    (
      SELECT (k.meta ->> 'authUserId') = _user_id::text
          OR ((k.meta -> 'person2') ->> 'authUserId') = _user_id::text
        FROM public.kontakte k
       WHERE k.id = _kontakt_id
       LIMIT 1
    ),
    false)
$$;

COMMENT ON FUNCTION public.ist_kunde_des_kontakts(uuid, uuid) IS
  'Ist dieser Nutzer der Kunde hinter diesem Kontakt, als Person 1 oder als '
  'Person 2? Antwortet zu einer leeren Kennung und zu einem unbekannten '
  'Kontakt mit falsch, nie mit unbekannt.';

REVOKE ALL ON FUNCTION public.ist_kunde_des_kontakts(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.ist_kunde_des_kontakts(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ist_kunde_des_kontakts(uuid, uuid) TO authenticated;


-- Nur SELECT, und nur auf die eigenen Zeilen.
--
-- Kein UPDATE fuer den Kunden: Unterschrieben wird ueber
-- `sign_signature_request`, und diese Funktion setzt Status, Zeitpunkt und
-- Bild selbst. Eine Schreibregel waere ein zweiter Weg an derselben Stelle
-- vorbei und koennte `sa_data` nachtraeglich veraendern, nachdem
-- unterschrieben wurde.
--
-- Dass der Kunde damit auch seinen eigenen `token` sieht, ist unbedenklich:
-- Den hat er ohnehin, er steht in der Mail, mit der er zur Unterschrift
-- gebeten wurde.
DROP POLICY IF EXISTS "Kunden sehen eigene Signaturanfragen" ON public.signature_requests;
CREATE POLICY "Kunden sehen eigene Signaturanfragen"
  ON public.signature_requests
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(
      public.ist_kunde_des_kontakts(auth.uid(), signature_requests.kontakt_id),
      false)
  );


-- ===========================================================================
-- PRUEFLAUF NACH DEM AUSFUEHREN (aendert nichts)
-- ===========================================================================
--
-- 1) Lag die gemeldete Luecke wirklich vor?
--
--    Diese Abfrage nur dann aussagekraeftig, wenn sie VOR der Migration
--    lief. Danach beantwortet sie die Frage ueber die Meldungen, die der
--    DO-Block ausgegeben hat: Stand dort "Offene Regel fuer anon entfernt",
--    war etwas da. Kam keine Meldung, war die Tabelle schon dicht, und diese
--    Migration hat nur den Riegel vorgelegt.
--
--
-- 2) Alle Regeln dieser Tabelle mit Rolle und Bedingung.
--
--   select policyname                          as regel,
--          cmd                                 as befehl,
--          array_to_string(roles, ', ')        as rollen,
--          qual                                as bedingung_using,
--          with_check                          as bedingung_with_check
--     from pg_policies
--    where schemaname = 'public'
--      and tablename  = 'signature_requests'
--    order by cmd, policyname;
--
--   Erwartet werden genau fuenf Zeilen, keine davon fuer anon:
--     Admins loeschen Signatur-Requests      DELETE  authenticated
--     Interne erstellen Signatur-Requests    INSERT  authenticated
--     Interne sehen Signatur-Requests        SELECT  authenticated
--     Kunden sehen eigene Signaturanfragen   SELECT  authenticated
--     Interne bearbeiten Signatur-Requests   UPDATE  authenticated
--
--
-- 3) Die Gegenprobe, kurz und hart: gibt es noch irgendeine Regel fuer anon?
--
--   select policyname, cmd, array_to_string(roles, ', ') as rollen, qual
--     from pg_policies
--    where schemaname = 'public'
--      and tablename  = 'signature_requests'
--      and (roles && array['anon', 'public']::name[]);
--
--   Erwartet: keine Zeile.
--
--
-- 4) Ist die Zeilensicherheit auf der Tabelle ueberhaupt eingeschaltet?
--    Ohne sie waere jede Regel wirkungslos.
--
--   select relname, relrowsecurity, relforcerowsecurity
--     from pg_class
--    where oid = 'public.signature_requests'::regclass;
--
--   Erwartet: relrowsecurity = true.
--
--
-- 5) Der oeffentliche Weg geht weiter. Mit einem gueltigen Token aus
--    einer offenen Anfrage:
--
--   select token from public.signature_requests
--    where status = 'pending' and expires_at > now() limit 1;
--
--   select id, name, status from public.get_signature_request('<token>');
--   -- erwartet: eine Zeile, also unveraendert erreichbar
--
--
-- 6) Die neue Funktion antwortet sauber, auch auf Unsinn.
--
--   select public.ist_kunde_des_kontakts(null, null)              as leer_leer;
--   -- erwartet: false, nicht null
--   select public.ist_kunde_des_kontakts(gen_random_uuid(),
--                                        gen_random_uuid())       as fremd;
--   -- erwartet: false
--
--   Und mit einem echten Paar aus der Datenbank, das true ergeben muss:
--
--   select k.id,
--          public.ist_kunde_des_kontakts((k.meta ->> 'authUserId')::uuid, k.id)
--     from public.kontakte k
--    where k.meta ->> 'authUserId' is not null
--    limit 3;
--   -- erwartet: ueberall true
--
--
-- 7) Sieht der Kunde jetzt seine eigenen Zeilen, und nur die? Am besten im
--    Portal selbst: als Kunde anmelden, unter /kunde/investments das
--    Selbstauskunfts-PDF herunterladen und pruefen, ob die bereits
--    geleisteten Unterschriften darin stehen. Vorher fehlten sie.
-- ===========================================================================
