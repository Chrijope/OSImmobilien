-- ===========================================================================
-- Kundenchat eins zu eins: Kunde und genau sein zustaendiger Partner
-- ===========================================================================
--
-- PRUEFUNG VOM 16.10.2026 (Christian: "pruefen, ob die Kommunikation zum
-- Kundenportal und zum Vertriebspartner in seinen Zugang eins zu eins
-- funktioniert")
--
-- Gefunden im Code und in den Regeln:
--
--   1. Wechsel des Zustaendigen. `kontakte.zustaendig_id` aenderte nichts am
--      Chat. Der alte Partner blieb Teilnehmer und las weiter mit, samt
--      Anhaengen. Der neue sah die Gruppe nicht (Leseregel: nur Teilnehmer),
--      und das Kundenprofil legte ihm deshalb eine ZWEITE Gruppe an. Der Kunde
--      sass danach in zwei Gruppen, sein Portal zeigt nur eine davon.
--   2. Leitung, Backoffice, Vertretung. Wer das Profil oeffnen darf, aber
--      nicht in der Gruppe sitzt, sah sie nicht und legte ebenfalls eine
--      zweite Gruppe an, mit sich selbst und dem Kunden, ohne den Partner.
--      Oeffnete die Leitung den Kundenchat als erste, fehlte der Partner
--      von Anfang an.
--   3. Zweite Person am Kontakt. `kundenchat_starten` suchte nur
--      `meta.authUserId` (Person 1). Person 2 bekam "Zu diesem Konto gehoert
--      kein Kunde" und kam nie in den Chat.
--   4. Gesperrtes Portal. `kundenchat_starten` fragte die Portalsperre nicht
--      ab (Restrisiko aus 20261004152000).
--   5. Sicherheit. "Nutzer löschen eigene Chats" liess den Ersteller einer
--      Gruppe sie loeschen, samt allen Nachrichten. Ersteller eines
--      Kundenchats aus dem Portal ist der KUNDE. Er konnte also seinen
--      ganzen Verlauf mit dem Partner loeschen. Die Oberflaeche erlaubt das
--      Loeschen nur Admin und Inhaber.
--      "Nutzer bearbeiten eigene Chats" liess den Ersteller `meta` frei
--      aendern, auch `kundeId`. Ein Kunde haette seinen Chat damit an einen
--      fremden Kontakt haengen koennen. Und "Nutzer erstellen Chats" liess
--      jeden Angemeldeten, auch Kunden, Gruppen vom Typ Kundenkommunikation
--      mit beliebiger `kundeId` anlegen.
--   6. Leere und uebergrosse Nachrichten nahm die Datenbank an.
--
-- WAS DIESE MIGRATION TUT
--
--   A) `kundenchat_teilnehmer_abgleichen(kontakt)`, intern: In jeder
--      Kundengruppe des Kontakts sitzen der zustaendige Partner und die
--      Portalkonten von Person 1 und Person 2. Fehlende werden eingetragen,
--      niemand wird entfernt.
--   B) `kundenchat_starten()`: Person 1 ODER Person 2, Portalsperre
--      beachtet, Gruppe gehoert dem Partner statt dem Kunden.
--   C) `kundenchat_sicherstellen(kontakt)`: der Weg des CRM. Liefert die
--      eine Gruppe des Kunden (die aelteste, wie ueberall) und legt sie nur
--      an, wenn es keine gibt. Aufrufen duerfen Admin, Inhaber und der
--      zustaendige Partner. Die Leitung wird dabei NICHT Teilnehmer: Sie
--      liest ueber ihre Leseregel mit, bekommt aber nicht zu jeder
--      Kundennachricht Glocke und Mail.
--   D) Ausloeser am Kontakt: Wechselt `zustaendig_id`, kommt der neue
--      Partner in den Kundenchat und der alte geht hinaus. Der Verlauf bleibt
--      vollstaendig, der neue sieht die alten Nachrichten. Hat der alte
--      Partner zugleich Admin oder Inhaber, bleibt er (er liest ohnehin mit).
--   E) Regeln an `chat_gruppen`: Loeschen nur Admin und Inhaber (die Regel
--      "Admins loeschen Chats" besteht). Kundengruppen direkt anlegen nur
--      Admin und Inhaber, alle anderen ueber B oder C. Beim Aendern bleiben
--      fuer Nicht-Admins `typ`, `erstellt_von` und in `meta` die Schluessel
--      `kundeId`, `kind` und `typ` unveraendert. Anpinnen, Stummschalten und
--      Archivieren laufen weiter.
--   F) Nachrichten: Text nicht leer und hoechstens 10.000 Zeichen. NOT
--      VALID, der Bestand wird nicht geprueft und nicht angefasst.
--
-- Aendert keine Daten. Bestehende Doppelgruppen und Altpartner in Gruppen
-- bleiben, bis jemand den Chat oeffnet (C traegt dann nach) oder der
-- Zustaendige das naechste Mal wechselt. Zum Nachsehen siehe unten.
-- Wiederholbar.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Teilnehmer einer Kundengruppe abgleichen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kundenchat_teilnehmer_abgleichen(_chat_id uuid, _kontakt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _k public.kontakte;
  _konto uuid;
  _person jsonb;
  _name text;
BEGIN
  SELECT * INTO _k FROM public.kontakte WHERE id = _kontakt_id;
  IF _k.id IS NULL THEN
    RETURN;
  END IF;

  -- Der zustaendige Partner
  IF _k.zustaendig_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.chat_teilnehmer t
                      WHERE t.chat_id = _chat_id AND t.benutzer_id = _k.zustaendig_id) THEN
    SELECT coalesce(nullif(btrim(p.name), ''), 'Dein Ansprechpartner') INTO _name
      FROM public.profiles p WHERE p.id = _k.zustaendig_id;
    _name := coalesce(_name, 'Dein Ansprechpartner');
    INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, meta)
    VALUES (_chat_id, _k.zustaendig_id,
            jsonb_build_object('name', _name,
                               'initials', upper(left(_name, 1)),
                               'role', 'Immobilienberater'));
  END IF;

  -- Die Portalkonten von Person 1 und Person 2, sofern es sie gibt
  FOREACH _person IN ARRAY ARRAY[
    jsonb_build_object('konto', _k.meta ->> 'authUserId',
                       'vorname', _k.vorname, 'nachname', _k.nachname),
    jsonb_build_object('konto', _k.meta -> 'person2' ->> 'authUserId',
                       'vorname', _k.meta -> 'person2' ->> 'vorname',
                       'nachname', _k.meta -> 'person2' ->> 'nachname')
  ] LOOP
    IF coalesce(_person ->> 'konto', '')
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      CONTINUE;
    END IF;
    _konto := (_person ->> 'konto')::uuid;
    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _konto) THEN
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.chat_teilnehmer t
                WHERE t.chat_id = _chat_id AND t.benutzer_id = _konto) THEN
      CONTINUE;
    END IF;
    _name := btrim(concat_ws(' ', _person ->> 'vorname', _person ->> 'nachname'));
    IF _name = '' THEN _name := 'Kunde'; END IF;
    INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, meta)
    VALUES (_chat_id, _konto,
            jsonb_build_object('name', _name,
                               'initials', upper(left(coalesce(_person ->> 'vorname', 'K'), 1)
                                                 || left(coalesce(_person ->> 'nachname', ''), 1)),
                               'role', 'Kunde'));
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.kundenchat_teilnehmer_abgleichen(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Die eine Kundengruppe eines Kontakts: die aelteste, wie im Kundenprofil
-- (KommunikationReiter) und im Zaehler (getUnreadChatCountForKunde).
CREATE OR REPLACE FUNCTION public.kundenchat_gruppe(_kontakt_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id
    FROM public.chat_gruppen g
   WHERE (g.typ = 'kundenkommunikation' OR g.meta ->> 'typ' = 'kundenkommunikation')
     AND g.meta ->> 'kundeId' = _kontakt_id::text
     AND coalesce(g.meta ->> 'kind', '') = ''
   ORDER BY g.erstellt_am, g.id
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.kundenchat_gruppe(uuid) FROM PUBLIC, anon, authenticated;

-- Legt die Gruppe an, falls sie fehlt. Nur aus den beiden Funktionen unten.
CREATE OR REPLACE FUNCTION public.kundenchat_gruppe_anlegen(_k public.kontakte)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _chat_id uuid;
  _kunde_name text;
BEGIN
  _chat_id := public.kundenchat_gruppe(_k.id);
  IF _chat_id IS NOT NULL THEN
    RETURN _chat_id;
  END IF;

  _kunde_name := btrim(concat_ws(' ', _k.vorname, _k.nachname));
  IF _kunde_name = '' THEN _kunde_name := 'Kunde'; END IF;

  -- Die Gruppe gehoert dem Partner, nicht dem Kunden. Der Ersteller darf
  -- an der Gruppe mehr als andere Teilnehmer.
  INSERT INTO public.chat_gruppen (name, typ, erstellt_von, meta)
  VALUES (_kunde_name, 'kundenkommunikation', coalesce(_k.zustaendig_id, auth.uid()),
          jsonb_build_object(
            'kundeId', _k.id::text,
            'kundeName', _kunde_name,
            'kundeStatus', _k.status,
            'erstelltVon', _kunde_name,
            'typ', 'kundenkommunikation'))
  RETURNING id INTO _chat_id;
  RETURN _chat_id;
END $$;

REVOKE ALL ON FUNCTION public.kundenchat_gruppe_anlegen(public.kontakte) FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- B) Der Kunde startet seinen Chat (Person 1 oder Person 2)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kundenchat_starten()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kontakt public.kontakte;
  _chat_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet' USING ERRCODE = '42501';
  END IF;
  IF public.kundenportal_gesperrt_fuer_mich() THEN
    RAISE EXCEPTION 'Dein Zugang ist gerade gesperrt' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _kontakt
    FROM public.kontakte
   WHERE NULLIF(btrim(meta ->> 'authUserId'), '') = auth.uid()::text
      OR NULLIF(btrim(meta -> 'person2' ->> 'authUserId'), '') = auth.uid()::text
   ORDER BY (NULLIF(btrim(meta ->> 'authUserId'), '') = auth.uid()::text) DESC, erstellt_am
   LIMIT 1;

  IF _kontakt.id IS NULL THEN
    RAISE EXCEPTION 'Zu diesem Konto gehoert kein Kunde';
  END IF;
  IF _kontakt.zustaendig_id IS NULL THEN
    RAISE EXCEPTION 'Fuer diesen Kunden ist kein Berater zustaendig';
  END IF;

  _chat_id := public.kundenchat_gruppe_anlegen(_kontakt);
  PERFORM public.kundenchat_teilnehmer_abgleichen(_chat_id, _kontakt.id);
  RETURN _chat_id;
END $$;

REVOKE ALL ON FUNCTION public.kundenchat_starten() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kundenchat_starten() TO authenticated;


-- ---------------------------------------------------------------------------
-- C) Das CRM holt den Kundenchat eines Kontakts
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kundenchat_sicherstellen(p_kontakt_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _kontakt public.kontakte;
  _chat_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _kontakt FROM public.kontakte WHERE id = p_kontakt_id;
  IF _kontakt.id IS NULL THEN
    RAISE EXCEPTION 'Diesen Kontakt gibt es nicht' USING ERRCODE = 'P0002';
  END IF;

  -- Den Kundenchat fuehrt der zustaendige Partner. Die Leitung liest mit.
  IF NOT (public.is_admin_role(_uid) OR _kontakt.zustaendig_id = _uid) THEN
    RAISE EXCEPTION 'Den Kundenchat fuehrt der zustaendige Partner' USING ERRCODE = '42501';
  END IF;

  _chat_id := public.kundenchat_gruppe(_kontakt.id);
  IF _chat_id IS NULL THEN
    IF _kontakt.zustaendig_id IS NULL THEN
      RAISE EXCEPTION 'Fuer diesen Kunden ist kein Partner zustaendig' USING ERRCODE = 'P0001';
    END IF;
    _chat_id := public.kundenchat_gruppe_anlegen(_kontakt);
  END IF;

  PERFORM public.kundenchat_teilnehmer_abgleichen(_chat_id, _kontakt.id);
  RETURN _chat_id;
END $$;

REVOKE ALL ON FUNCTION public.kundenchat_sicherstellen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kundenchat_sicherstellen(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- D) Wechsel des Zustaendigen zieht den Chat nach
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kundenchat_zustaendigen_nachziehen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _chat record;
BEGIN
  FOR _chat IN
    SELECT g.id
      FROM public.chat_gruppen g
     WHERE (g.typ = 'kundenkommunikation' OR g.meta ->> 'typ' = 'kundenkommunikation')
       AND g.meta ->> 'kundeId' = NEW.id::text
       AND coalesce(g.meta ->> 'kind', '') = ''
  LOOP
    IF OLD.zustaendig_id IS NOT NULL
       AND OLD.zustaendig_id IS DISTINCT FROM NEW.zustaendig_id
       AND NOT public.is_admin_role(OLD.zustaendig_id) THEN
      DELETE FROM public.chat_teilnehmer t
       WHERE t.chat_id = _chat.id AND t.benutzer_id = OLD.zustaendig_id;
    END IF;
    PERFORM public.kundenchat_teilnehmer_abgleichen(_chat.id, NEW.id);
  END LOOP;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.kundenchat_zustaendigen_nachziehen() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS kundenchat_zustaendigen_nachziehen ON public.kontakte;
CREATE TRIGGER kundenchat_zustaendigen_nachziehen
  AFTER UPDATE OF zustaendig_id ON public.kontakte
  FOR EACH ROW
  WHEN (OLD.zustaendig_id IS DISTINCT FROM NEW.zustaendig_id)
  EXECUTE FUNCTION public.kundenchat_zustaendigen_nachziehen();


-- ---------------------------------------------------------------------------
-- E) Regeln an chat_gruppen
-- ---------------------------------------------------------------------------

-- Loeschen nur noch "Admins loeschen Chats" (20260321141014).
DROP POLICY IF EXISTS "Nutzer löschen eigene Chats" ON public.chat_gruppen;

DROP POLICY IF EXISTS "Nutzer erstellen Chats" ON public.chat_gruppen;
CREATE POLICY "Nutzer erstellen Chats" ON public.chat_gruppen
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = erstellt_von
    AND (
      (coalesce(typ, '') <> 'kundenkommunikation'
       AND coalesce(meta ->> 'typ', '') <> 'kundenkommunikation')
      OR (select public.is_admin_role(auth.uid()))
    )
  );

-- Zuordnung einer Gruppe bleibt, wie sie ist. Gleiche Bauart wie
-- `chat_nachricht_nur_lesebestaetigung`: greift nur, wenn der Browser selbst
-- schreibt, nie in einer DEFINER-Funktion oder mit dem Dienstschluessel.
CREATE OR REPLACE FUNCTION public.chat_gruppe_zuordnung_festhalten()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _fest jsonb;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon')
     OR auth.uid() IS NULL OR public.is_admin_role(auth.uid()) THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO _fest
    FROM jsonb_each(CASE WHEN jsonb_typeof(OLD.meta) = 'object' THEN OLD.meta ELSE '{}'::jsonb END) AS e
   WHERE e.key IN ('kundeId', 'kind', 'typ');

  NEW.id := OLD.id;
  NEW.typ := OLD.typ;
  NEW.erstellt_von := OLD.erstellt_von;
  NEW.erstellt_am := OLD.erstellt_am;
  NEW.meta := (CASE WHEN jsonb_typeof(NEW.meta) = 'object' THEN NEW.meta ELSE '{}'::jsonb END
               - 'kundeId' - 'kind' - 'typ') || _fest;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.chat_gruppe_zuordnung_festhalten() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_gruppe_zuordnung_festhalten ON public.chat_gruppen;
CREATE TRIGGER chat_gruppe_zuordnung_festhalten
  BEFORE UPDATE ON public.chat_gruppen
  FOR EACH ROW EXECUTE FUNCTION public.chat_gruppe_zuordnung_festhalten();


-- ---------------------------------------------------------------------------
-- F) Nachrichten: nicht leer, nicht uebergross
-- ---------------------------------------------------------------------------

ALTER TABLE public.chat_nachrichten DROP CONSTRAINT IF EXISTS chat_nachrichten_inhalt_laenge;
ALTER TABLE public.chat_nachrichten
  ADD CONSTRAINT chat_nachrichten_inhalt_laenge
  CHECK (char_length(btrim(inhalt)) BETWEEN 1 AND 10000) NOT VALID;

COMMIT;


-- ---------------------------------------------------------------------------
-- Nachsehen (lesend)
-- ---------------------------------------------------------------------------
--
-- Kunden mit mehr als einer Kundengruppe:
--
--     select g.meta->>'kundeId' as kontakt, count(*) as gruppen
--       from chat_gruppen g
--      where g.typ = 'kundenkommunikation' and coalesce(g.meta->>'kind','') = ''
--      group by 1 having count(*) > 1;
--
-- Partner, die in einem Kundenchat sitzen, aber nicht mehr zustaendig sind:
--
--     select g.id, k.vorname, k.nachname, t.benutzer_id
--       from chat_gruppen g
--       join kontakte k on k.id::text = g.meta->>'kundeId'
--       join chat_teilnehmer t on t.chat_id = g.id
--      where g.typ = 'kundenkommunikation'
--        and t.benutzer_id <> coalesce(k.zustaendig_id, '00000000-0000-0000-0000-000000000000')
--        and t.benutzer_id::text not in (coalesce(k.meta->>'authUserId',''),
--                                        coalesce(k.meta->'person2'->>'authUserId',''))
--        and not public.is_admin_role(t.benutzer_id);
