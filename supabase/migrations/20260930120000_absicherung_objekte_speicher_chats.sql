-- ===========================================================================
-- Absicherung: Objekte, Speicher, Chats, Hausverwaltung
-- ===========================================================================
--
-- REIHENFOLGE, VERBINDLICH (sonst bricht die Liveseite):
--   1. Push nach main.
--   2. In Lovable ausrollen: objekt-texte-ki (schreibt die Objekttexte
--      jetzt mit der Dienstrolle, nach Leseprüfung mit dem Nutzertoken) und
--      save-expose-pdf (legt das Exposé nur noch für Admin, Inhaber und den
--      Objektpartner am eigenen Objekt ab).
--   3. Publish in Lovable. Die neue Fassung der Seite geht die umgestellten
--      Wege (Reservierung aufheben, Belegungsabgleich, Chat beitreten) ueber
--      die neuen Funktionen und faellt ohne sie auf den alten Weg zurueck.
--   4. Erst dann diese Migration ausfuehren.
-- Laeuft die Migration vor dem Publish, schreibt die alte Fassung der Seite
-- beim Aufheben einer Reservierung und beim Anlegen eines Chats direkt in die
-- Tabellen und wird fuer alle ausser Admin und Inhaber abgewiesen. Laeuft sie
-- vor dem Ausrollen von objekt-texte-ki, speichert die alte Function die
-- Objekttexte fuer alle ausser Admin und Inhaber nicht mehr und erzeugt sie
-- beim naechsten Aufruf erneut (kostet KI-Laeufe).
--
-- GRUNDSATZ (Christian, 29.09.2026)
--
-- Nur Admin und Inhaber schreiben direkt. Alle anderen nur ueber gepruefte
-- Ablaeufe. Was heute funktioniert, muss weiter funktionieren.
--
-- VORHER (Stand der Datenbank am 29.09.2026)
--
--   objekte, wohnungen, objekt_bilder, wohnungs_bilder, wohnungs_dokumente,
--   objekt_einreichungen: Anlegen und Aendern fuer jede interne Rolle
--   (`is_internal_role`, also auch jeder Vertriebspartner), Loeschen teils
--   fuer `is_objekt_manager` (Admin, Inhaber, jeder Objektpartner fuer jedes
--   Objekt). Ein Partner konnte damit Preise, Status und Kunden jeder Einheit
--   umschreiben und jede Reservierung aufheben.
--   Eimer `unterlagen`: Ueberschreiben und Loeschen fuer jede interne Rolle,
--   an jedem Pfad, also auch die Unterlagen fremder Kunden.
--   Eimer `praesentation-pdfs`: Schreiben fuer jeden Angemeldeten, auch
--   Kunden. Die Migration 20260918170000 sollte das auf Admin und Inhaber
--   begrenzen, in der Datenbank standen am 29.09.2026 aber noch die alten,
--   offenen Regeln. `objekt-medien`, `ansprechpartner`: jede interne Rolle.
--   chat_teilnehmer: "Nutzer treten bei" liess jeden sich selbst in jeden
--   Chat eintragen und jede interne Rolle jeden in jeden Chat.
--   chat_nachrichten: Teilnehmer durften jede Spalte jeder Nachricht ihres
--   Chats aendern, auch Text und Absender.
--   Hausverwaltung (mieter, eigentuemer, vermietungen, kautionen,
--   versicherungen, zaehlerstaende, betriebskosten, hv_tickets,
--   dienstleister): Anlegen und Aendern fuer jede interne Rolle.
--
-- NACHHER
--
--   1. Objektbereich: Schreiben nur Admin und Inhaber, dazu die Rolle
--      objektpartner fuer eigene Objekte (`objekte.erstellt_von`). Loeschen
--      wie bisher nur dort, wo es heute ueber Admin hinaus erlaubt war.
--      `objekt_dokumente` bekommt dieselbe Eigentumsgrenze (bisher jeder
--      Objektpartner fuer jedes Objekt). Zwei neue Wege fuer den Vertrieb:
--      `einheit_reservierung_aufheben` (eigener Kunde) und
--      `einheit_belegung_abgleichen` (Status aus dem Investment ableiten).
--   2. Speicher: `unterlagen` ueberschreiben und loeschen nur Admin, Inhaber
--      und wer den Kunden des Pfads betreut, Finanzierungsunterlagen dazu die
--      Finanzierungspartner; Hochladen unveraendert.
--      `praesentation-pdfs` schreiben nur Admin und Inhaber, genau wie in
--      20260918170000 beschlossen (dieselben Regeln, wiederholt).
--      `objekt-medien` nur Admin, Inhaber, Objektpartner fuer eigene Objekte
--      und die Objektfotos am Investment. `ansprechpartner` nur Admin und
--      Inhaber.
--   3. Chats: Beitreten nur ueber `chat_teilnehmer_eintragen` (neu),
--      `kundenchat_starten` und `get_or_create_tippgeber_vp_chat`. An
--      Nachrichten aendern Nicht-Admins nur die eigene Lesebestaetigung.
--   4. Hausverwaltung: Anlegen und Aendern nur Rolle hausverwaltung, Admin
--      und Inhaber. Loeschen unveraendert.
--
-- Die Dienstrolle (Edge Functions, Investagon-Import) und die bestehenden
-- SECURITY-DEFINER-Funktionen (Vormerken, Reservieren nach Unterschrift,
-- Dokumenten-Ampel, Kundenchat, Duplikate zusammenfuehren) sind von den
-- Regeln nicht betroffen. Die beiden neuen Ausloeser greifen deshalb nur,
-- wenn die Datenbankrolle `authenticated` oder `anon` selbst schreibt
-- (`current_user`), nicht innerhalb einer geprueften DEFINER-Funktion, auch
-- wenn `auth.uid()` dort den Aufrufer nennt.
--
-- Erlaubende ALL-Regeln auf den betroffenen Tabellen gibt es am 29.09.2026
-- keine. Taucht doch eine auf, bricht die Migration mit Meldung ab, statt sie
-- samt Leserecht blind zu entfernen.
--
-- Pruefzeilen 52.1 bis 52.14 in `99_PRUEFUNG.sql`.

BEGIN;

-- Vorab: Eine erlaubende ALL-Regel wuerde Lesen und Schreiben zugleich
-- erlauben. Sie blind zu entfernen, naehme das Leserecht mit; sie stehen zu
-- lassen, hebelte die neuen Schreibregeln aus. Deshalb Abbruch mit Meldung.
DO $$
DECLARE
  regel RECORD;
BEGIN
  FOR regel IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('objekte', 'wohnungen', 'objekt_bilder', 'wohnungs_bilder',
                         'wohnungs_dokumente', 'objekt_dokumente', 'objekt_einreichungen',
                         'chat_teilnehmer', 'chat_nachrichten',
                         'mieter', 'eigentuemer', 'vermietungen', 'kautionen', 'versicherungen',
                         'zaehlerstaende', 'betriebskosten', 'hv_tickets', 'dienstleister')
       AND permissive = 'PERMISSIVE'
       AND cmd = 'ALL'
       AND (roles && ARRAY['authenticated', 'anon', 'public']::name[])
  LOOP
    RAISE EXCEPTION 'Erlaubende ALL-Regel %.% gefunden. Bitte zuerst in eine Lese- und eine Schreibregel aufteilen, dann diese Migration erneut ausfuehren.',
      regel.tablename, regel.policyname;
  END LOOP;
END $$;

-- Vorab ebenso fuer den Speicher. Stand am 29.09.2026, nachzusehen mit:
--
--     select policyname, cmd, permissive, roles, qual, with_check
--       from pg_policies
--      where schemaname = 'storage' and tablename = 'objects'
--        and coalesce(qual, '') || coalesce(with_check, '')
--            ~ '''(unterlagen|praesentation-pdfs|objekt-medien|ansprechpartner)''';
--
-- Unten stehen alle erlaubenden Schreibregeln (INSERT, UPDATE, DELETE, ALL)
-- fuer diese vier Eimer, die es damals gab, dazu die, die diese Migration
-- anlegt (damit ein zweiter Lauf durchgeht). Taucht eine andere auf, etwa
-- eine von Hand angelegte oder eine ALL-Regel, bricht die Migration mit
-- Meldung ab, statt sie stehen zu lassen und die neuen Regeln auszuhebeln.
DO $$
DECLARE
  regel RECORD;
BEGIN
  FOR regel IN
    SELECT policyname, cmd
      FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND permissive = 'PERMISSIVE'
       AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       AND (coalesce(qual, '') || coalesce(with_check, ''))
           ~ '''(unterlagen|praesentation-pdfs|objekt-medien|ansprechpartner)'''
       AND policyname NOT IN (
         -- unterlagen, bleiben
         'Chat participants upload unterlagen', 'Internal upload unterlagen',
         'Kunde upload externe Investments', 'Kunde upload unterlagen',
         'Mobile scan upload by valid token', 'Mobile scan upload via token',
         'Mobile scan update by valid token', 'Mobile scan update via token',
         'Kunde loescht eigenfinanzierung unterlagen', 'Kunde loescht externe Investment Unterlagen',
         'Kunde loescht unterlagen',
         -- unterlagen, fallen unten weg bzw. kommen neu
         'Internal update unterlagen', 'Unterlagen delete intern', 'unterlagen_internal_delete',
         'Unterlagen ueberschreiben nur zustaendig', 'Unterlagen loeschen nur zustaendig',
         -- praesentation-pdfs
         'Praesentation-PDFs auth insert', 'Praesentation-PDFs auth update',
         'Praesentation-PDFs pflege insert', 'Praesentation-PDFs pflege update', 'Praesentation-PDFs pflege delete',
         -- objekt-medien
         'objekt_medien_anon_einreichung_upload', 'objekt_medien_auth_einreichung_upload',
         'objekt_medien_internal_write', 'objekt_medien_internal_update', 'objekt_medien_internal_delete',
         'objekt_medien_geprueft_insert', 'objekt_medien_geprueft_update', 'objekt_medien_geprueft_delete',
         -- ansprechpartner
         'Interne upload Ansprechpartner', 'Interne update Ansprechpartner', 'Interne delete Ansprechpartner',
         'Admins upload Ansprechpartner', 'Admins update Ansprechpartner', 'Admins delete Ansprechpartner'
       )
  LOOP
    RAISE EXCEPTION 'Unerwartete erlaubende Speicherregel "%" (%) fuer unterlagen, praesentation-pdfs, objekt-medien oder ansprechpartner. Bitte ansehen und in diese Liste aufnehmen oder entfernen, dann diese Migration erneut ausfuehren.',
      regel.policyname, regel.cmd;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 0) Hilfsfunktionen
-- ---------------------------------------------------------------------------

-- Darf diese Person an diesem Objekt schreiben? Admin und Inhaber immer, die
-- Rolle objektpartner nur am eigenen Objekt.
CREATE OR REPLACE FUNCTION public.darf_objekt_schreiben(_user_id uuid, _objekt_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    _user_id IS NOT NULL
    AND (
      public.is_admin_role(_user_id)
      OR (
        public.has_role(_user_id, 'objektpartner'::public.app_role)
        AND EXISTS (SELECT 1 FROM public.objekte o
                     WHERE o.id = _objekt_id AND o.erstellt_von = _user_id)
      )
    ),
    false)
$$;

CREATE OR REPLACE FUNCTION public.darf_wohnung_schreiben(_user_id uuid, _wohnung_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.darf_objekt_schreiben(
    _user_id,
    (SELECT w.objekt_id FROM public.wohnungen w WHERE w.id = _wohnung_id))
$$;

CREATE OR REPLACE FUNCTION public.darf_hausverwaltung_schreiben(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    _user_id IS NOT NULL
    AND (public.is_admin_role(_user_id)
         OR public.has_role(_user_id, 'hausverwaltung'::public.app_role)),
    false)
$$;

-- Zu welchem Kontakt gehoert ein Pfad im Eimer `unterlagen`? NULL, wenn der
-- Pfad an keinen Kontakt gebunden ist (Chat, Mobile-Scan, externe
-- Investments, Arbeitsordner einer Person).
--   <kontakt>/...                          Upload im CRM und im Portal
--   finanzierung/eigen/<kontakt>/...       Eigenfinanzierung
--   finanzierung/<kontakt oder investment>/...
--   kundenordner|selbstauskunft-papier|kaufvertrag|notarfotos|
--   kunde-dokumente|reservierung/<kontakt>/...
CREATE OR REPLACE FUNCTION public.unterlagen_pfad_kontakt(_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  teile text[] := storage.foldername(_name);
  kandidat text;
  treffer uuid;
BEGIN
  IF teile IS NULL OR cardinality(teile) = 0 THEN
    RETURN NULL;
  END IF;

  IF teile[1] IN ('kundenordner', 'selbstauskunft-papier', 'kaufvertrag',
                  'notarfotos', 'kunde-dokumente', 'reservierung') THEN
    kandidat := teile[2];
  ELSIF teile[1] = 'finanzierung' AND teile[2] = 'eigen' THEN
    kandidat := teile[3];
  ELSIF teile[1] = 'finanzierung' THEN
    kandidat := teile[2];
  ELSE
    kandidat := teile[1];
  END IF;

  IF kandidat IS NULL
     OR kandidat !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;

  SELECT k.id INTO treffer FROM public.kontakte k WHERE k.id = kandidat::uuid;
  IF treffer IS NOT NULL THEN
    RETURN treffer;
  END IF;

  -- Finanzierungsangebote liegen unter der Kennung des Investments.
  IF teile[1] = 'finanzierung' THEN
    SELECT i.kunde_id INTO treffer FROM public.investments i WHERE i.id = kandidat::uuid;
    RETURN treffer;
  END IF;

  RETURN NULL;
END;
$$;

-- Darf diese Person die Datei unter diesem Pfad im Eimer `unterlagen`
-- ueberschreiben oder loeschen?
--   Admin und Inhaber: immer.
--   Eigener Arbeitsordner (erster Ordner = eigene Kennung, etwa
--   `<kennung>/analyse-temp/...` der Objektanalyse): ja.
--   An einen Kontakt gebunden: der zustaendige Partner (auch eine laufende
--   Vertretung), dazu Backoffice und Vertriebsleitung, die heute schon jeden
--   Kontakt bearbeiten und Kaufvertrag und Notarfotos nachziehen.
--   Finanzierungsunterlagen (`finanzierung/...`) dazu die
--   Finanzierungspartner, die dort Darlehensvertraege entfernen.
--   Alles andere: nein. Kunden behalten ihre eigenen Loeschregeln.
CREATE OR REPLACE FUNCTION public.darf_unterlage_aendern(_user_id uuid, _name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kontakt uuid;
BEGIN
  IF _user_id IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_admin_role(_user_id) THEN
    RETURN true;
  END IF;
  IF (storage.foldername(_name))[1] = _user_id::text THEN
    RETURN true;
  END IF;

  kontakt := public.unterlagen_pfad_kontakt(_name);
  IF kontakt IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.kontakte k
     WHERE k.id = kontakt
       AND (
         public.is_vp_owner_of_kontakt(_user_id, k.zustaendig_id, k.meta)
         OR public.has_role(_user_id, 'backoffice'::public.app_role)
         OR public.has_role(_user_id, 'vertriebsleiter'::public.app_role)
         OR ((storage.foldername(_name))[1] = 'finanzierung'
             AND public.has_role(_user_id, 'finanzierungspartner'::public.app_role))
       )
  );
END;
$$;

-- Darf diese Person im Eimer `objekt-medien` unter diesem Pfad schreiben
-- (anlegen, ueberschreiben, loeschen)?
--   Admin und Inhaber: immer.
--   objekte/<objekt>/...: Objektpartner fuer das eigene Objekt, auch solange
--   es noch nicht gespeichert ist (die Bilder gehen vor dem Objekt hoch).
--   objektfotos/investment/<investment>/...: wer das Investment bearbeitet
--   (Objekt eintragen im Kundenprofil), nur interne Rollen.
--   Einreichungen haben eigene Regeln, die unveraendert bleiben.
CREATE OR REPLACE FUNCTION public.darf_objekt_medien_schreiben(_user_id uuid, _name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  teile text[] := storage.foldername(_name);
  uuid_muster constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  inv record;
BEGIN
  IF _user_id IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_admin_role(_user_id) THEN
    RETURN true;
  END IF;

  IF teile[1] = 'objekte' AND teile[2] ~* uuid_muster
     AND public.has_role(_user_id, 'objektpartner'::public.app_role) THEN
    RETURN NOT EXISTS (SELECT 1 FROM public.objekte o WHERE o.id = teile[2]::uuid)
        OR EXISTS (SELECT 1 FROM public.objekte o
                    WHERE o.id = teile[2]::uuid AND o.erstellt_von = _user_id);
  END IF;

  IF teile[1] = 'objektfotos' AND teile[2] = 'investment' AND teile[3] ~* uuid_muster
     AND public.is_internal_role(_user_id) THEN
    SELECT i.kunde_id, k.meta INTO inv
      FROM public.investments i
      LEFT JOIN public.kontakte k ON k.id = i.kunde_id
     WHERE i.id = teile[3]::uuid;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    RETURN public.darf_investment_nutzen(_user_id, inv.kunde_id, coalesce(inv.meta, '{}'::jsonb));
  END IF;

  RETURN false;
END;
$$;


-- ---------------------------------------------------------------------------
-- 1) Objektbereich
-- ---------------------------------------------------------------------------

-- Wem gehoert ein Objekt? Beim Anlegen im Browser der Anlegende, danach
-- aendert es nur noch der Server. Ohne diesen Ausloeser blieb
-- `erstellt_von` leer (alle 91 Objekte am 29.09.2026), und ein Objektpartner
-- haette sein eigenes Objekt nach dem Anlegen nicht mehr bearbeiten koennen.
-- SECURITY INVOKER mit Blick auf `current_user`: Er greift nur, wenn der
-- Browser selbst schreibt, nie in Dienstrolle, SQL-Editor oder einer
-- DEFINER-Funktion.
CREATE OR REPLACE FUNCTION public.objekt_ersteller_festhalten()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.erstellt_von IS NULL THEN
      NEW.erstellt_von := auth.uid();
    END IF;
  ELSE
    NEW.erstellt_von := OLD.erstellt_von;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS objekt_ersteller_festhalten ON public.objekte;
CREATE TRIGGER objekt_ersteller_festhalten
  BEFORE INSERT OR UPDATE ON public.objekte
  FOR EACH ROW EXECUTE FUNCTION public.objekt_ersteller_festhalten();

-- Alle erlaubenden Schreibregeln entfernen, auch von Hand angelegte, die in
-- keiner Migration stehen. Die einschraenkenden Regeln (Zwei-Faktor,
-- Kundenportal-Sperre) sind RESTRICTIVE und bleiben, ebenso alle Leseregeln.
DO $$
DECLARE
  regel RECORD;
BEGIN
  FOR regel IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('objekte', 'wohnungen', 'objekt_bilder', 'wohnungs_bilder',
                         'wohnungs_dokumente', 'objekt_dokumente', 'objekt_einreichungen')
       AND permissive = 'PERMISSIVE'
       AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
       AND (roles && ARRAY['authenticated', 'anon', 'public']::name[])
  LOOP
    RAISE NOTICE 'Schreibregel entfernt: %.%', regel.tablename, regel.policyname;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', regel.policyname, regel.tablename);
  END LOOP;
END $$;

-- objekte
CREATE POLICY "Objekte anlegen Admin oder eigener Objektpartner" ON public.objekte
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_role(auth.uid())
    OR (public.has_role(auth.uid(), 'objektpartner'::public.app_role) AND erstellt_von = auth.uid())
  );
CREATE POLICY "Objekte aendern Admin oder eigener Objektpartner" ON public.objekte
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_role(auth.uid())
    OR (public.has_role(auth.uid(), 'objektpartner'::public.app_role) AND erstellt_von = auth.uid())
  )
  WITH CHECK (
    public.is_admin_role(auth.uid())
    OR (public.has_role(auth.uid(), 'objektpartner'::public.app_role) AND erstellt_von = auth.uid())
  );
CREATE POLICY "Objekte loeschen Admin oder eigener Objektpartner" ON public.objekte
  FOR DELETE TO authenticated
  USING (
    public.is_admin_role(auth.uid())
    OR (public.has_role(auth.uid(), 'objektpartner'::public.app_role) AND erstellt_von = auth.uid())
  );

-- wohnungen (Loeschen war heute schon auf Objekt-Manager begrenzt)
CREATE POLICY "Wohnungen anlegen Admin oder eigener Objektpartner" ON public.wohnungen
  FOR INSERT TO authenticated
  WITH CHECK (public.darf_objekt_schreiben(auth.uid(), objekt_id));
CREATE POLICY "Wohnungen aendern Admin oder eigener Objektpartner" ON public.wohnungen
  FOR UPDATE TO authenticated
  USING (public.darf_objekt_schreiben(auth.uid(), objekt_id))
  WITH CHECK (public.darf_objekt_schreiben(auth.uid(), objekt_id));
CREATE POLICY "Wohnungen loeschen Admin oder eigener Objektpartner" ON public.wohnungen
  FOR DELETE TO authenticated
  USING (public.darf_objekt_schreiben(auth.uid(), objekt_id));

-- objekt_bilder (Loeschen war heute fuer jede interne Rolle offen)
CREATE POLICY "Objektbilder anlegen Admin oder eigener Objektpartner" ON public.objekt_bilder
  FOR INSERT TO authenticated
  WITH CHECK (public.darf_objekt_schreiben(auth.uid(), objekt_id));
CREATE POLICY "Objektbilder aendern Admin oder eigener Objektpartner" ON public.objekt_bilder
  FOR UPDATE TO authenticated
  USING (public.darf_objekt_schreiben(auth.uid(), objekt_id))
  WITH CHECK (public.darf_objekt_schreiben(auth.uid(), objekt_id));
CREATE POLICY "Objektbilder loeschen Admin oder eigener Objektpartner" ON public.objekt_bilder
  FOR DELETE TO authenticated
  USING (public.darf_objekt_schreiben(auth.uid(), objekt_id));

-- objekt_dokumente (bisher jeder Objektpartner fuer jedes Objekt)
CREATE POLICY "Objektunterlagen anlegen Admin oder eigener Objektpartner" ON public.objekt_dokumente
  FOR INSERT TO authenticated
  WITH CHECK (public.darf_objekt_schreiben(auth.uid(), objekt_id));
CREATE POLICY "Objektunterlagen aendern Admin oder eigener Objektpartner" ON public.objekt_dokumente
  FOR UPDATE TO authenticated
  USING (public.darf_objekt_schreiben(auth.uid(), objekt_id))
  WITH CHECK (public.darf_objekt_schreiben(auth.uid(), objekt_id));
CREATE POLICY "Objektunterlagen loeschen Admin oder eigener Objektpartner" ON public.objekt_dokumente
  FOR DELETE TO authenticated
  USING (public.darf_objekt_schreiben(auth.uid(), objekt_id));

-- wohnungs_bilder (Loeschen bleibt Admin und Inhaber)
CREATE POLICY "Wohnungsbilder anlegen Admin oder eigener Objektpartner" ON public.wohnungs_bilder
  FOR INSERT TO authenticated
  WITH CHECK (public.darf_wohnung_schreiben(auth.uid(), wohnung_id));
CREATE POLICY "Wohnungsbilder aendern Admin oder eigener Objektpartner" ON public.wohnungs_bilder
  FOR UPDATE TO authenticated
  USING (public.darf_wohnung_schreiben(auth.uid(), wohnung_id))
  WITH CHECK (public.darf_wohnung_schreiben(auth.uid(), wohnung_id));
CREATE POLICY "Admins loeschen WBilder" ON public.wohnungs_bilder
  FOR DELETE TO authenticated
  USING (public.is_admin_role(auth.uid()));

-- wohnungs_dokumente (Loeschen bleibt Admin und Inhaber; die Freigabe fuer
-- Kunden laeuft weiter ueber `setze_kunden_freigabe`)
CREATE POLICY "Wohnungsunterlagen anlegen Admin oder eigener Objektpartner" ON public.wohnungs_dokumente
  FOR INSERT TO authenticated
  WITH CHECK (public.darf_wohnung_schreiben(auth.uid(), wohnung_id));
CREATE POLICY "Wohnungsunterlagen aendern Admin oder eigener Objektpartner" ON public.wohnungs_dokumente
  FOR UPDATE TO authenticated
  USING (public.darf_wohnung_schreiben(auth.uid(), wohnung_id))
  WITH CHECK (public.darf_wohnung_schreiben(auth.uid(), wohnung_id));
CREATE POLICY "Admins loeschen WDokumente" ON public.wohnungs_dokumente
  FOR DELETE TO authenticated
  USING (public.is_admin_role(auth.uid()));

-- objekt_einreichungen: Eingang laeuft ueber `submit-objekt-einreichung`
-- (Dienstrolle). Bewerten und Uebernehmen nur Admin und Inhaber, die eigene
-- Einreichung darf der Objektpartner nachbessern. Loeschen bleibt Admin.
CREATE POLICY "Einreichungen anlegen Admin oder eigener Objektpartner" ON public.objekt_einreichungen
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_role(auth.uid())
    OR (public.has_role(auth.uid(), 'objektpartner'::public.app_role) AND benutzer_id = auth.uid())
  );
CREATE POLICY "Einreichungen aendern Admin oder eigener Objektpartner" ON public.objekt_einreichungen
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_role(auth.uid())
    OR (public.has_role(auth.uid(), 'objektpartner'::public.app_role) AND benutzer_id = auth.uid())
  )
  WITH CHECK (
    public.is_admin_role(auth.uid())
    OR (public.has_role(auth.uid(), 'objektpartner'::public.app_role) AND benutzer_id = auth.uid())
  );
CREATE POLICY "Admins loeschen Einreichungen" ON public.objekt_einreichungen
  FOR DELETE TO authenticated
  USING (public.is_admin_role(auth.uid()));


-- Reservierung einer Einheit aufheben.
--
-- Der gepruefte Weg fuer den Vertrieb: Bisher schrieb der Knopf
-- "Aufheben" (Objektuebersicht, Kundenprofil beim Wechsel oder Abbruch der
-- Reservierung) direkt in `wohnungen`, und jede interne Rolle konnte so die
-- Reservierung jedes Kunden aufheben. Jetzt:
--   Admin, Inhaber, Objektpartner am eigenen Objekt: immer.
--   Wer reservieren darf (`darf_reservieren`): nur fuer einen Kunden, den er
--   bearbeiten darf (`darf_kontakt_bearbeiten`, dieselbe Regel wie beim
--   Vormerken), oder wenn er die Reservierung selbst ausgeloest hat. Eine
--   verkaufte Einheit gibt nur die Leitung frei.
CREATE OR REPLACE FUNCTION public.einheit_reservierung_aufheben(p_wohnung_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_einheit record;
  v_kunde text;
  v_kontakt uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  END IF;

  SELECT w.id, w.objekt_id, w.status, w.kunde_id, w.reserviert_von
    INTO v_einheit
    FROM public.wohnungen w
   WHERE w.id = p_wohnung_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'nicht_gefunden');
  END IF;

  v_kunde := nullif(trim(coalesce(v_einheit.kunde_id::text, '')), '');
  IF lower(trim(coalesce(v_einheit.status, ''))) NOT IN ('reserviert', 'gesetzt', 'verkauft')
     AND v_kunde IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'grund', 'bereits_frei');
  END IF;

  IF NOT public.darf_objekt_schreiben(v_uid, v_einheit.objekt_id) THEN
    IF NOT public.darf_reservieren(v_uid)
       OR lower(trim(coalesce(v_einheit.status, ''))) = 'verkauft' THEN
      RETURN jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
    END IF;
    IF v_kunde ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_kontakt := v_kunde::uuid;
    END IF;
    -- coalesce: Ein leeres `reserviert_von` darf nicht als "erlaubt" durchrutschen.
    IF NOT (
         coalesce(v_einheit.reserviert_von = v_uid, false)
         OR (v_kontakt IS NOT NULL AND public.darf_kontakt_bearbeiten(v_uid, v_kontakt))
       ) THEN
      RETURN jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
    END IF;
  END IF;

  -- Vormerkung und Ausloeser raeumt `wohnung_reservierung_pruefen` ab.
  UPDATE public.wohnungen w
     SET status = 'frei',
         kunde_id = NULL,
         kunde_name = NULL,
         reserviert_am = NULL,
         gesetzt_am = NULL,
         gesetzt_bis = NULL,
         meta = CASE WHEN jsonb_typeof(w.meta) = 'object'
                     THEN w.meta || jsonb_build_object('beraterName', NULL)
                     ELSE w.meta END
   WHERE w.id = p_wohnung_id;

  RETURN jsonb_build_object('ok', true, 'grund', 'aufgehoben');
END;
$$;

-- Status einer Einheit aus dem Investment ableiten.
--
-- Die Verwaltungsansicht eines Objekts glich bisher im Browser jedes
-- Betrachters ab: Stufe "abgeschlossen" setzt die Einheit auf verkauft, eine
-- wirksame Reservierung (unterschrieben, nicht entfallen, nicht aufgeschoben)
-- oder eine spaetere Stufe auf reserviert. Das schrieb direkt in `wohnungen`,
-- auch fuer Vertriebspartner. Jetzt leitet die Datenbank den Stand selbst
-- aus dem Investment ab; der Aufrufer nennt nur das Investment. Regeln:
--   Der Aufrufer muss das Investment nutzen duerfen (`darf_investment_nutzen`).
--   Reserviert setzt nur, wer `darf_reservieren` besteht; verkauft dazu das
--   Backoffice, das die Abwicklung heute schon nachzieht.
--   Verkauft nur auf der Stufe "abgeschlossen" (Kaufphase beendet).
--   Unterschrift: Es muss zum Investment eine unterschriebene
--   Reservierungsanfrage geben (`signature_requests`, `rv_*`, `signed`),
--   fuer reserviert immer, fuer verkauft, solange die Einheit noch frei ist
--   (sonst setzte ein selbst gesetztes "abgeschlossen" eine freie Einheit auf
--   verkauft). Admin und Inhaber sind ausgenommen, damit Reservierungen auf
--   Papier weiter nachgezogen werden. Auf der Stufe Reservierung zusaetzlich
--   wirksam (nicht entfallen, nicht aufgeschoben), wie `rvWirksamAusMeta`.
--   Wie `vormerke_einheit`: Exklusivzuweisung an Einheit und Objekt gilt fuer
--   alle ausser Admin und Inhaber, eine laufende Vormerkung fuer einen anderen
--   Kunden wird nicht uebergangen.
--   Kein fremder Kunde wird ueberschrieben, keine Einheit eines
--   Globalobjekts einzeln belegt.
--   Als Ausloeser (`reserviert_von`) steht der zustaendige Partner des
--   Kunden, ersatzweise der Anleger des Investments, nicht wer zufaellig die
--   Seite geoeffnet hat. Fehlen beide, setzt `wohnung_reservierung_pruefen`
--   wie bisher den Aufrufer.
CREATE OR REPLACE FUNCTION public.einheit_belegung_abgleichen(p_investment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  uuid_muster constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_inv record;
  v_kontakt record;
  v_meta jsonb;
  v_stufe text;
  v_wohnung_text text;
  v_einheit record;
  v_status text;
  v_eigener boolean;
  v_admin boolean;
  v_rv_unterschrieben boolean;
BEGIN
  IF v_uid IS NULL OR NOT public.is_internal_role(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  END IF;
  v_admin := public.is_admin_role(v_uid);

  SELECT i.kunde_id, i.meta, i.benutzer_id INTO v_inv FROM public.investments i WHERE i.id = p_investment_id;
  IF NOT FOUND OR v_inv.kunde_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'nicht_gefunden');
  END IF;

  SELECT nullif(trim(concat_ws(' ', k.vorname, k.nachname)), '') AS name,
         nullif(trim(k.berater), '') AS berater,
         k.zustaendig_id,
         coalesce(k.meta, '{}'::jsonb) AS meta
    INTO v_kontakt
    FROM public.kontakte k WHERE k.id = v_inv.kunde_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'nicht_gefunden');
  END IF;

  IF NOT public.darf_investment_nutzen(v_uid, v_inv.kunde_id, v_kontakt.meta) THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  END IF;

  v_meta := CASE WHEN jsonb_typeof(v_inv.meta) = 'object' THEN v_inv.meta ELSE '{}'::jsonb END;
  v_stufe := coalesce(v_meta ->> 'pipelineStufe', '');
  IF v_stufe NOT IN ('abgeschlossen', 'reservierung', 'finanzierung', 'notar', 'faelligkeit', 'abrechnung') THEN
    RETURN jsonb_build_object('ok', true, 'grund', 'unveraendert');
  END IF;
  -- Reserviert: wer reservieren darf. Verkauft: dazu das Backoffice.
  IF NOT (public.darf_reservieren(v_uid)
          OR (v_stufe = 'abgeschlossen' AND public.has_role(v_uid, 'backoffice'::public.app_role))) THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'keine_berechtigung');
  END IF;
  v_rv_unterschrieben := EXISTS (
    SELECT 1 FROM public.signature_requests s
     WHERE s.investment_id = p_investment_id::text
       AND s.person_type LIKE 'rv\_%'
       AND s.status = 'signed'
  );
  v_wohnung_text := coalesce(v_meta ->> 'wohnungId', '');
  IF v_wohnung_text !~* uuid_muster THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'nicht_gefunden');
  END IF;

  SELECT w.id, w.status, w.kunde_id, w.kunde_name, w.meta,
         w.vorgemerkt_bis, w.vorgemerkt_kunde_id,
         coalesce(o.global_objekt, false) AS global_objekt, o.exklusiv_partner
    INTO v_einheit
    FROM public.wohnungen w
    JOIN public.objekte o ON o.id = w.objekt_id
   WHERE w.id = v_wohnung_text::uuid
     AND w.objekt_id::text = coalesce(v_meta ->> 'objektId', '')
   FOR UPDATE OF w;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'nicht_gefunden');
  END IF;

  v_status := lower(trim(coalesce(v_einheit.status, '')));
  IF (v_stufe = 'abgeschlossen' AND v_status = 'verkauft')
     OR (v_stufe <> 'abgeschlossen' AND v_status <> 'frei') THEN
    RETURN jsonb_build_object('ok', true, 'grund', 'unveraendert');
  END IF;

  IF v_einheit.global_objekt THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'globalobjekt');
  END IF;

  v_eigener := nullif(trim(coalesce(v_einheit.kunde_id::text, '')), '') IS NULL
            OR v_einheit.kunde_id::text = v_inv.kunde_id::text;
  IF NOT v_eigener THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'vergeben');
  END IF;

  -- Laufende Vormerkung fuer einen anderen Kunden, wie `vormerke_einheit`.
  IF v_einheit.vorgemerkt_bis IS NOT NULL AND v_einheit.vorgemerkt_bis > now()
     AND v_einheit.vorgemerkt_kunde_id IS DISTINCT FROM v_inv.kunde_id THEN
    RETURN jsonb_build_object('ok', false, 'grund', 'vorgemerkt_von_anderem');
  END IF;

  -- Exklusivzuweisung, wie `vormerke_einheit`: an der Einheit Kennungen, am
  -- Objekt (noch) Namen. Admin und Inhaber sind ausgenommen.
  IF NOT v_admin THEN
    IF jsonb_typeof(v_einheit.meta -> 'exklusivNutzer') = 'array'
       AND jsonb_array_length(v_einheit.meta -> 'exklusivNutzer') > 0
       AND NOT EXISTS (
         SELECT 1
           FROM jsonb_array_elements_text(v_einheit.meta -> 'exklusivNutzer') AS e(nutzer_id)
          WHERE e.nutzer_id = v_uid::text
       ) THEN
      RETURN jsonb_build_object('ok', false, 'grund', 'exklusiv');
    END IF;
    IF coalesce(cardinality(v_einheit.exklusiv_partner), 0) > 0
       AND NOT EXISTS (
         SELECT 1
           FROM public.profiles p, unnest(v_einheit.exklusiv_partner) AS n(partner_name)
          WHERE p.id = v_uid
            AND lower(trim(n.partner_name)) = lower(trim(coalesce(p.name, '')))
       ) THEN
      RETURN jsonb_build_object('ok', false, 'grund', 'exklusiv');
    END IF;
  END IF;

  IF v_stufe = 'abgeschlossen' THEN
    -- Eine noch freie Einheit verkauft ohne Leitung nur, wer eine
    -- unterschriebene Reservierung vorweisen kann.
    IF v_status = 'frei' AND NOT v_admin AND NOT v_rv_unterschrieben THEN
      RETURN jsonb_build_object('ok', true, 'grund', 'ohne_unterschrift');
    END IF;
    UPDATE public.wohnungen w
       SET status = 'verkauft',
           kunde_id = v_inv.kunde_id::text,
           kunde_name = coalesce(v_kontakt.name, w.kunde_name),
           reserviert_von = coalesce(v_kontakt.zustaendig_id, v_inv.benutzer_id, w.reserviert_von),
           meta = CASE WHEN v_kontakt.berater IS NOT NULL AND jsonb_typeof(w.meta) = 'object'
                       THEN w.meta || jsonb_build_object('beraterName', v_kontakt.berater)
                       ELSE w.meta END
     WHERE w.id = v_einheit.id;
    RETURN jsonb_build_object('ok', true, 'grund', 'verkauft');
  END IF;

  -- Reserviert nur mit unterschriebener Reservierungsanfrage, serverseitig.
  -- Admin und Inhaber ziehen auch Reservierungen auf Papier nach.
  IF NOT v_admin AND NOT v_rv_unterschrieben THEN
    RETURN jsonb_build_object('ok', true, 'grund', 'ohne_unterschrift');
  END IF;
  -- Auf der Stufe Reservierung zusaetzlich wirksam, wie `rvWirksamAusMeta`.
  IF v_stufe = 'reservierung' AND NOT (
       coalesce((v_meta -> 'rvSigned') = 'true'::jsonb, false)
       AND coalesce(v_meta ->> 'rvReservierungEntfallenAm', '') = ''
       AND (coalesce(v_meta ->> 'rvReservierungAb', '') = ''
            OR coalesce(v_meta ->> 'rvReservierungWirksamAm', '') <> '')
     ) THEN
    RETURN jsonb_build_object('ok', true, 'grund', 'unveraendert');
  END IF;

  UPDATE public.wohnungen w
     SET status = 'reserviert',
         kunde_id = v_inv.kunde_id::text,
         kunde_name = coalesce(v_kontakt.name, w.kunde_name),
         reserviert_am = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         reserviert_von = coalesce(v_kontakt.zustaendig_id, v_inv.benutzer_id),
         meta = CASE WHEN v_kontakt.berater IS NOT NULL AND jsonb_typeof(w.meta) = 'object'
                     THEN w.meta || jsonb_build_object('beraterName', v_kontakt.berater)
                     ELSE w.meta END
   WHERE w.id = v_einheit.id;
  RETURN jsonb_build_object('ok', true, 'grund', 'reserviert');
END;
$$;


-- ---------------------------------------------------------------------------
-- 2) Speicher
-- ---------------------------------------------------------------------------

-- unterlagen: Ueberschreiben und Loeschen an den Kontakt des Pfads binden.
-- Hochladen (INSERT) bleibt unveraendert, ebenso die Regeln fuer Kunden,
-- Person 2, externe Investments, Chat-Anhaenge und Mobile-Scans.
DROP POLICY IF EXISTS "Internal update unterlagen" ON storage.objects;
DROP POLICY IF EXISTS "Unterlagen delete intern" ON storage.objects;
DROP POLICY IF EXISTS "unterlagen_internal_delete" ON storage.objects;

DROP POLICY IF EXISTS "Unterlagen ueberschreiben nur zustaendig" ON storage.objects;
CREATE POLICY "Unterlagen ueberschreiben nur zustaendig" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'unterlagen' AND public.darf_unterlage_aendern(auth.uid(), name))
  WITH CHECK (bucket_id = 'unterlagen' AND public.darf_unterlage_aendern(auth.uid(), name));

DROP POLICY IF EXISTS "Unterlagen loeschen nur zustaendig" ON storage.objects;
CREATE POLICY "Unterlagen loeschen nur zustaendig" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'unterlagen' AND public.darf_unterlage_aendern(auth.uid(), name));

-- praesentation-pdfs: Schreiben nur Admin und Inhaber (Vorlagenpflege), Lesen
-- unveraendert. Wortgleich mit 20260918170000; beschlossen war das schon am
-- 18.09.2026, in der Datenbank standen aber noch die offenen Regeln. Die
-- Seite kommt damit zurecht: Wer nicht pflegt, laedt die PDF lokal herunter,
-- nur der Zwischenspeicher wird nicht gefuellt.
DROP POLICY IF EXISTS "Praesentation-PDFs auth insert" ON storage.objects;
DROP POLICY IF EXISTS "Praesentation-PDFs auth update" ON storage.objects;
DROP POLICY IF EXISTS "Praesentation-PDFs pflege insert" ON storage.objects;
CREATE POLICY "Praesentation-PDFs pflege insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'praesentation-pdfs'
    AND (select public.is_admin_role(auth.uid()))
  );
DROP POLICY IF EXISTS "Praesentation-PDFs pflege update" ON storage.objects;
CREATE POLICY "Praesentation-PDFs pflege update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'praesentation-pdfs'
    AND (select public.is_admin_role(auth.uid()))
  )
  WITH CHECK (
    bucket_id = 'praesentation-pdfs'
    AND (select public.is_admin_role(auth.uid()))
  );
DROP POLICY IF EXISTS "Praesentation-PDFs pflege delete" ON storage.objects;
CREATE POLICY "Praesentation-PDFs pflege delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'praesentation-pdfs'
    AND (select public.is_admin_role(auth.uid()))
  );

-- objekt-medien: Admin, Inhaber, Objektpartner eigene Objekte, Objektfotos am
-- Investment. Die beiden Einreichungsregeln (anon und angemeldet) bleiben.
DROP POLICY IF EXISTS "objekt_medien_internal_write" ON storage.objects;
DROP POLICY IF EXISTS "objekt_medien_internal_update" ON storage.objects;
DROP POLICY IF EXISTS "objekt_medien_internal_delete" ON storage.objects;
DROP POLICY IF EXISTS "objekt_medien_geprueft_insert" ON storage.objects;
CREATE POLICY "objekt_medien_geprueft_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'objekt-medien' AND public.darf_objekt_medien_schreiben(auth.uid(), name));
DROP POLICY IF EXISTS "objekt_medien_geprueft_update" ON storage.objects;
CREATE POLICY "objekt_medien_geprueft_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'objekt-medien' AND public.darf_objekt_medien_schreiben(auth.uid(), name))
  WITH CHECK (bucket_id = 'objekt-medien' AND public.darf_objekt_medien_schreiben(auth.uid(), name));
DROP POLICY IF EXISTS "objekt_medien_geprueft_delete" ON storage.objects;
CREATE POLICY "objekt_medien_geprueft_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'objekt-medien' AND public.darf_objekt_medien_schreiben(auth.uid(), name));

-- ansprechpartner: Die Bilder gehoeren zur Seite "Ansprechpartner", deren
-- Stand nur Admin und Inhaber speichern koennen (`app_config`).
DROP POLICY IF EXISTS "Interne upload Ansprechpartner" ON storage.objects;
DROP POLICY IF EXISTS "Interne update Ansprechpartner" ON storage.objects;
DROP POLICY IF EXISTS "Interne delete Ansprechpartner" ON storage.objects;
DROP POLICY IF EXISTS "Admins upload Ansprechpartner" ON storage.objects;
CREATE POLICY "Admins upload Ansprechpartner" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ansprechpartner' AND public.is_admin_role(auth.uid()));
DROP POLICY IF EXISTS "Admins update Ansprechpartner" ON storage.objects;
CREATE POLICY "Admins update Ansprechpartner" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'ansprechpartner' AND public.is_admin_role(auth.uid()))
  WITH CHECK (bucket_id = 'ansprechpartner' AND public.is_admin_role(auth.uid()));
DROP POLICY IF EXISTS "Admins delete Ansprechpartner" ON storage.objects;
CREATE POLICY "Admins delete Ansprechpartner" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'ansprechpartner' AND public.is_admin_role(auth.uid()));


-- ---------------------------------------------------------------------------
-- 3) Chats
-- ---------------------------------------------------------------------------

-- Teilnehmer eintragen, der einzige Weg neben `kundenchat_starten` und
-- `get_or_create_tippgeber_vp_chat`.
--
-- `p_teilnehmer` ist eine Liste aus {benutzer_id, meta}. `meta` traegt nur
-- die Anzeige (Name, Kuerzel, Rolle). Bereits Eingetragene werden
-- uebersprungen. Admin und Inhaber duerfen jeden in jeden Chat eintragen.
-- Alle anderen nur in einen Chat, den sie angelegt haben oder in dem sie
-- schon sind, und nur als interne Rolle:
--   sich selbst    nur in den eigenen Chat (Wiedereintritt);
--   interne Rolle  ja (Einladen, Admins beim Anlegen, Ansprechpartner);
--   Kunde          nur in den Kundenchat seines eigenen Kontakts;
--   ohne Konto     ja (Ansprechpartner ohne Zugang, wie bisher);
--   sonst          nein.
-- In einen Kundenchat traegt nur ein, wer den Kontakt bearbeiten darf.
-- Tippgeber-Chats entstehen nur ueber ihre eigene Funktion.
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
  v_kundenchat := coalesce(v_gruppe.typ, '') = 'kundenkommunikation'
               OR coalesce(v_gruppe.meta ->> 'typ', '') = 'kundenkommunikation';
  IF coalesce(v_gruppe.meta ->> 'kundeId', '') ~* uuid_muster THEN
    v_kontakt := (v_gruppe.meta ->> 'kundeId')::uuid;
  END IF;

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
      ELSIF public.is_internal_role(v_ziel) THEN
        NULL;
      ELSIF v_kundenchat AND EXISTS (
              SELECT 1 FROM public.kontakte k
               WHERE k.id = v_kontakt
                 AND ((k.meta ->> 'authUserId') = v_ziel::text
                      OR ((k.meta -> 'person2') ->> 'authUserId') = v_ziel::text)) THEN
        NULL;
      ELSIF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_ziel) THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'Diese Person kann nicht in diesen Chat eingetragen werden' USING ERRCODE = '42501';
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

-- Keine erlaubende INSERT-Regel mehr fuer angemeldete Nutzer. Das Verlassen
-- eines Chats (DELETE) und das Lesen bleiben unveraendert.
DO $$
DECLARE
  regel RECORD;
BEGIN
  FOR regel IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'chat_teilnehmer'
       AND permissive = 'PERMISSIVE'
       AND cmd IN ('INSERT', 'UPDATE')
       AND (roles && ARRAY['authenticated', 'anon', 'public']::name[])
  LOOP
    RAISE NOTICE 'Schreibregel entfernt: chat_teilnehmer.%', regel.policyname;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.chat_teilnehmer', regel.policyname);
  END LOOP;
END $$;

-- Nachrichten: Nicht-Admins aendern nur ihre eigene Lesebestaetigung. Alle
-- anderen Spalten bleiben, wie sie waren, und aus `gelesen_von` kann jeder
-- nur die eigene Kennung setzen oder entfernen. Nebenbei verschwindet damit
-- ein Wettlauf: Zwei Leser, die gleichzeitig ihre Liste schickten,
-- ueberschrieben sich bisher gegenseitig.
--
-- SECURITY INVOKER mit Blick auf `current_user`: Er greift nur, wenn der
-- Browser selbst schreibt. Gepruefte DEFINER-Funktionen wie
-- `kontakte_zusammenfuehren` (setzt `chat_id` um) laufen als Eigentuemer
-- und bleiben unberuehrt, obwohl `auth.uid()` dort den Aufrufer nennt.
CREATE OR REPLACE FUNCTION public.chat_nachricht_nur_lesebestaetigung()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ich jsonb;
  v_andere jsonb;
  v_neu_gelesen boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon')
     OR v_uid IS NULL OR public.is_admin_role(v_uid) THEN
    RETURN NEW;
  END IF;

  v_ich := to_jsonb(v_uid::text);
  v_neu_gelesen := jsonb_typeof(NEW.gelesen_von) = 'array'
                   AND NEW.gelesen_von @> jsonb_build_array(v_uid::text);
  SELECT coalesce(jsonb_agg(e), '[]'::jsonb) INTO v_andere
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(OLD.gelesen_von) = 'array' THEN OLD.gelesen_von ELSE '[]'::jsonb END
         ) AS t(e)
   WHERE e <> v_ich;

  NEW.id := OLD.id;
  NEW.chat_id := OLD.chat_id;
  NEW.absender_id := OLD.absender_id;
  NEW.inhalt := OLD.inhalt;
  NEW.gesendet_am := OLD.gesendet_am;
  NEW.gelesen := OLD.gelesen;
  NEW.meta := OLD.meta;
  NEW.gelesen_von := CASE WHEN v_neu_gelesen THEN v_andere || jsonb_build_array(v_uid::text) ELSE v_andere END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_nachricht_nur_lesebestaetigung ON public.chat_nachrichten;
CREATE TRIGGER chat_nachricht_nur_lesebestaetigung
  BEFORE UPDATE ON public.chat_nachrichten
  FOR EACH ROW EXECUTE FUNCTION public.chat_nachricht_nur_lesebestaetigung();


-- ---------------------------------------------------------------------------
-- 4) Hausverwaltung
-- ---------------------------------------------------------------------------

-- Anlegen und Aendern nur Rolle hausverwaltung, Admin und Inhaber. Die
-- Seiten dazu sind nur fuer die Hausverwaltung freigegeben; andere Rollen
-- schreiben dort nirgends. Loeschen bleibt, wie es ist (Admin, teils gar
-- nicht), Lesen ebenso.
DO $$
DECLARE
  regel RECORD;
  tabelle text;
BEGIN
  FOR regel IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('mieter', 'eigentuemer', 'vermietungen', 'kautionen', 'versicherungen',
                         'zaehlerstaende', 'betriebskosten', 'hv_tickets', 'dienstleister')
       AND permissive = 'PERMISSIVE'
       AND cmd IN ('INSERT', 'UPDATE')
       AND (roles && ARRAY['authenticated', 'anon', 'public']::name[])
  LOOP
    RAISE NOTICE 'Schreibregel entfernt: %.%', regel.tablename, regel.policyname;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', regel.policyname, regel.tablename);
  END LOOP;

  FOREACH tabelle IN ARRAY ARRAY['mieter', 'eigentuemer', 'vermietungen', 'kautionen', 'versicherungen',
                                 'zaehlerstaende', 'betriebskosten', 'hv_tickets', 'dienstleister'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated '
      'WITH CHECK (public.darf_hausverwaltung_schreiben(auth.uid()))',
      'Hausverwaltung legt an', tabelle);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
      'USING (public.darf_hausverwaltung_schreiben(auth.uid())) '
      'WITH CHECK (public.darf_hausverwaltung_schreiben(auth.uid()))',
      'Hausverwaltung aendert', tabelle);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 5) Rechte
-- ---------------------------------------------------------------------------

-- Hilfsfunktionen: in Regeln gebraucht, also fuer Angemeldete ausfuehrbar.
REVOKE ALL ON FUNCTION public.darf_objekt_schreiben(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.darf_objekt_schreiben(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.darf_wohnung_schreiben(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.darf_wohnung_schreiben(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.darf_hausverwaltung_schreiben(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.darf_hausverwaltung_schreiben(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.unterlagen_pfad_kontakt(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unterlagen_pfad_kontakt(text) TO authenticated;
REVOKE ALL ON FUNCTION public.darf_unterlage_aendern(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.darf_unterlage_aendern(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.darf_objekt_medien_schreiben(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.darf_objekt_medien_schreiben(uuid, text) TO authenticated;

-- Die Wege selbst: nur fuer Angemeldete.
REVOKE ALL ON FUNCTION public.einheit_reservierung_aufheben(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.einheit_reservierung_aufheben(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.einheit_belegung_abgleichen(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.einheit_belegung_abgleichen(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.chat_teilnehmer_eintragen(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.chat_teilnehmer_eintragen(uuid, jsonb) TO authenticated;

-- Ausloeser-Funktionen ruft niemand direkt auf.
REVOKE ALL ON FUNCTION public.objekt_ersteller_festhalten() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_nachricht_nur_lesebestaetigung() FROM public, anon, authenticated;

-- Die Schnittstelle soll die neuen Funktionen sofort kennen.
NOTIFY pgrst, 'reload schema';

COMMIT;
