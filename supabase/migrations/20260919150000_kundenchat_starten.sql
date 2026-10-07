-- ===========================================================================
-- Der Kunde kann seinen Chat selbst starten
-- ===========================================================================
--
-- WAS PASSIERT IST
--
-- Otto Hans bekam in seinem Portal beim Klick auf "Chat mit Christian
-- starten" die Meldung:
--
--     new row violates row-level security policy for table "chat_teilnehmer"
--
-- WARUM
--
-- Die Portalseite legt zuerst die Chatgruppe an und traegt dann ZWEI
-- Teilnehmer in einem Rutsch ein: den Kunden und seinen Berater. Die
-- Eintrittsregel lautet aber sinngemaess "Du darfst Dich selbst eintragen,
-- oder Du hast eine interne Rolle". Ein Kunde hat keine interne Rolle. Er darf
-- sich also selbst eintragen, seinen Berater jedoch nicht.
--
-- Weil beide Zeilen in einem Befehl stehen, scheitert der ganze Befehl. Die
-- Gruppe ist zu dem Zeitpunkt schon da. Zurueck bleibt eine Chatgruppe ohne
-- einen einzigen Teilnehmer, und in so einer Gruppe kann niemand mehr
-- schreiben, auch der Berater nicht.
--
-- Das erklaert die sechs leeren Kundenchats, die am 19.09.2026 gemessen
-- wurden, besser als die zunaechst vermutete Reihenfolge beim Anlegen. Jene
-- war ebenfalls falsch und ist behoben, aber DIESER Fehler schlaegt
-- zuverlaessig zu, und zwar jedes Mal, wenn ein Kunde den Knopf drueckt.
--
-- WARUM EINE FUNKTION UND NICHT EINE WEITERE REGEL
--
-- Man koennte die Eintrittsregel aufweichen. Das hiesse aber: Kunden duerfen
-- fremde Konten in Chats eintragen. Eine solche Regel laesst sich nicht so
-- formulieren, dass sie genau den einen erlaubten Fall trifft und sonst
-- nichts.
--
-- Diese Funktion laeuft stattdessen mit erhoehten Rechten und prueft selbst,
-- was erlaubt ist:
--   1. Der Aufrufer muss ein Kunde mit Portalzugang sein.
--   2. Eingetragen wird ausschliesslich er selbst und der fuer ihn
--      zustaendige Berater aus `kontakte.zustaendig_id`.
--   3. Wen er eintraegt, bestimmt er nicht, das bestimmt die Zuordnung.
--
-- NEBENBEI BEHOBEN: DIE ZWEITE GRUPPE
--
-- Bisher legte jeder Klick eine neue Gruppe an. Wer zweimal klickte, hatte
-- zwei Kundenchats, und das Kundenprofil zeigte irgendeinen davon. Die
-- Funktion gibt eine vorhandene Gruppe zurueck und traegt dort nur die
-- fehlenden Teilnehmer nach.
--
-- Der Berater wird ueber die KENNUNG `zustaendig_id` bestimmt, nicht ueber
-- den Freitext `kontakte.berater`. Im Projekt wurden an vier Stellen Personen
-- ueber ihren Namen gesucht, und dahinter lagen zwei Konten mit demselben
-- Namen.
--
-- Wiederholbar: ein zweiter Lauf aendert nichts.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.kundenchat_starten()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kontakt public.kontakte;
  _chat_id uuid;
  _kunde_name text;
  _berater_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;

  -- Der Kontakt, der zu diesem Portalkonto gehoert. Die Verknuepfung steht im
  -- `meta` der Kontaktzeile und wird beim Freischalten des Portals gesetzt.
  SELECT * INTO _kontakt
    FROM public.kontakte
   WHERE NULLIF(btrim(meta->>'authUserId'), '') = auth.uid()::text
   LIMIT 1;

  IF _kontakt.id IS NULL THEN
    RAISE EXCEPTION 'Zu diesem Konto gehoert kein Kunde';
  END IF;

  IF _kontakt.zustaendig_id IS NULL THEN
    -- Ohne zustaendigen Berater gaebe es niemanden, an den der Chat ginge.
    -- Eine Gruppe mit nur einem Teilnehmer waere genau das Problem von vorher.
    RAISE EXCEPTION 'Fuer diesen Kunden ist kein Berater zustaendig';
  END IF;

  _kunde_name := btrim(concat_ws(' ', _kontakt.vorname, _kontakt.nachname));
  IF _kunde_name = '' THEN _kunde_name := 'Kunde'; END IF;
  SELECT coalesce(p.name, 'Dein Ansprechpartner') INTO _berater_name
    FROM public.profiles p WHERE p.id = _kontakt.zustaendig_id;

  -- Gibt es die Gruppe schon? Dann keine zweite anlegen.
  SELECT g.id INTO _chat_id
    FROM public.chat_gruppen g
   WHERE g.typ = 'kundenkommunikation'
     AND g.meta->>'kundeId' = _kontakt.id::text
   ORDER BY g.erstellt_am
   LIMIT 1;

  IF _chat_id IS NULL THEN
    INSERT INTO public.chat_gruppen (name, typ, erstellt_von, meta)
    VALUES (_kunde_name, 'kundenkommunikation', auth.uid(),
      jsonb_build_object(
        'kundeId', _kontakt.id::text,
        'kundeName', _kunde_name,
        'kundeStatus', _kontakt.status,
        'erstelltVon', _kunde_name,
        'typ', 'kundenkommunikation'))
    RETURNING id INTO _chat_id;
  END IF;

  -- Teilnehmer nachtragen, beide einzeln und nur falls sie fehlen. Damit
  -- repariert derselbe Aufruf auch eine Gruppe, die frueher leer geblieben ist.
  INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, meta)
  SELECT _chat_id, auth.uid(),
         jsonb_build_object('name', _kunde_name,
           'initials', upper(left(coalesce(_kontakt.vorname, 'K'), 1) || left(coalesce(_kontakt.nachname, ''), 1)),
           'role', 'Kunde')
   WHERE NOT EXISTS (SELECT 1 FROM public.chat_teilnehmer t
                      WHERE t.chat_id = _chat_id AND t.benutzer_id = auth.uid());

  INSERT INTO public.chat_teilnehmer (chat_id, benutzer_id, meta)
  SELECT _chat_id, _kontakt.zustaendig_id,
         jsonb_build_object('name', _berater_name,
           'initials', upper(left(coalesce(_berater_name, 'B'), 1)),
           'role', 'Immobilienberater')
   WHERE NOT EXISTS (SELECT 1 FROM public.chat_teilnehmer t
                      WHERE t.chat_id = _chat_id AND t.benutzer_id = _kontakt.zustaendig_id);

  RETURN _chat_id;
END $$;

REVOKE ALL ON FUNCTION public.kundenchat_starten() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kundenchat_starten() TO authenticated;


-- ---------------------------------------------------------------------------
-- Nachsehen
-- ---------------------------------------------------------------------------
--
-- Nach einem Klick auf "Chat starten" im Kundenportal:
--
--     select g.id, g.name, count(t.*) as teilnehmer
--       from chat_gruppen g
--       left join chat_teilnehmer t on t.chat_id = g.id
--      where g.typ = 'kundenkommunikation'
--      group by g.id, g.name
--      order by teilnehmer;
--
-- Erwartet werden zwei Teilnehmer je Gruppe. Eine Null bedeutet, dass die
-- Funktion nicht benutzt wurde.
