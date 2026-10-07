-- ===========================================================================
-- Kundenportal-Sperre: wirkt auf dem Server, nicht nur im Browser
-- ===========================================================================
--
-- WARUM (Christians Freigabe vom 23.09.2026, drei Sicherheitsbefunde)
--
--   1. „Portal sperren“ wirkte nur im Browser. Gespeichert wurde
--      `kontakte.meta.portalGesperrt`, und nur die Portalseite des Kunden
--      hat darauf geachtet. Die Anmeldung blieb gueltig, ueber die
--      Schnittstelle kam ein gesperrter Kunde weiter an Kontakt, Investments,
--      Finanzierung, Unterlagen und Chat.
--   2. Sperren und Entsperren konnte jeder interne Nutzer, denn
--      `merge_kontakt_meta` laesst jede interne Rolle jeden Schluessel setzen.
--      Erlaubt sein sollen nur Admin, Inhaber und der zustaendige
--      Vertriebspartner.
--   3. (ohne Datenbankteil) `invite-user` prueft seit heute ebenfalls die
--      Zustaendigkeit, siehe unten.
--
-- WIE ES JETZT ZUSAMMENSPIELT
--
--   Browser    → Edge Function `kundenportal-sperre`
--                  prueft das Recht (Admin, Inhaber, zustaendiger Partner,
--                  Regel in `supabase/functions/_shared/kundenportal-recht.ts`),
--                  ruft `kundenportal_sperre_schreiben` auf (Teil 4) und
--                  sperrt die Anmeldekonten von Person 1 und Person 2
--                  (`ban_duration`). Konten mit interner Rolle fasst sie
--                  nicht an.
--   Datenbank  → Sperrregel auf allen Tabellen (Teil 6). Sie greift sofort,
--                  auch fuer den Zugriffsschluessel, den der Kunde noch in
--                  der Hand hat, bis er ablaeuft (hoechstens eine Stunde).
--   Anmeldung  → `secure-login` meldet `zugang_gesperrt`, die Anmeldeseite
--                  zeigt „Dein Zugang ist gerade gesperrt. Bitte wende dich
--                  an deinen Ansprechpartner.“
--
-- WAS DIESE MIGRATION TUT
--
--   1. Tabelle `kundenportal_sperren`: je Kontakt eine Zeile, `gesperrt`
--      ist die Wahrheit. Kein Zugriff aus dem Browser, weder lesend noch
--      schreibend, nur ueber die Funktionen unten.
--      Bestand: Jeder Kontakt, dessen `meta.portalGesperrt` heute true ist,
--      wird als gesperrt uebernommen. Seine Anmeldekonten sind damit noch
--      nicht gesperrt, das geschieht erst beim naechsten Sperren ueber die
--      Function. Hinein kommt er trotzdem nicht mehr: `secure-login` fragt
--      nach erfolgreicher Anmeldung `kunde_portal_gesperrt` und beendet die
--      Sitzung gleich wieder, und die Datenbanksperre (Teil 6) gilt sofort.
--
--   2. `kunde_portal_gesperrt(_user_id)`: Ist dieser Nutzer Kunde (Person 1
--      oder 2) eines gesperrten Kontakts und hat keine interne Rolle? Nie
--      unbekannt, immer true oder false. Wer eine interne Rolle hat
--      (Mitarbeiter, Partner), wird nie ausgesperrt, auch wenn er selbst bei
--      uns gekauft hat. Nur fuer den Dienstschluessel (`secure-login`), damit
--      niemand aus dem Browser fremde Kennungen abfragen kann.
--
--   3. `kundenportal_gesperrt_fuer_mich()`: dieselbe Frage fuer den
--      angemeldeten Nutzer. Die Sperrregel (Teil 6) und die Portalseite
--      fragen so, denn den eigenen Kontakt darf ein gesperrter Kunde nicht
--      mehr lesen.
--
--   4. `kundenportal_sperre_schreiben(_kontakt_id, _gesperrt, _von)`: der
--      einzige Weg, die Sperre zu setzen oder aufzuheben. Schreibt die
--      Tabelle und den Anzeigewert am Kontakt (`portalGesperrt`,
--      `portalGesperrtAt` beziehungsweise `portalEntsperrtAt`) in einem
--      Zug. Nur mit dem Dienstschluessel aufrufbar, also nur von der Edge
--      Function, die vorher das Recht geprueft hat.
--
--   5. Ausloeser `kontakt_portalsperre_spiegeln` an `kontakte`: Der
--      Anzeigewert `meta.portalGesperrt` folgt immer der Tabelle. Wer ihn an
--      der Function vorbei aendert (etwa ueber `merge_kontakt_meta` oder
--      beim Speichern eines Kontakts mit veraltetem Zwischenspeicher), aendert
--      ihn nicht. Still, ohne Fehler, wie bei
--      `dokument_kundenfreigabe_schuetzen`: Ein Speichern, das das ganze
--      `meta` schickt, soll nicht scheitern. Im Datenbanklog steht ein
--      Vermerk.
--
--   6. Sperrregel „Kundenportal-Sperre“ als RESTRICTIVE Regel an jeder
--      Tabelle in `public` mit Zeilensicherheit, dazu `storage.objects`
--      (Unterlagen, Selbstauskunft-PDFs). Eine RESTRICTIVE Regel wird mit
--      allen anderen Regeln UND-verknuepft: Sie gibt nichts frei, sie nimmt
--      nur weg. Fuer alle, die nicht gesperrt sind, aendert sich nichts.
--      Ausgenommen sind `profiles`, `user_roles` und `user_settings`. Ohne
--      sie laedt die Anwendung nicht, und der gesperrte Kunde saehe einen
--      endlosen Ladekreis statt des Sperrhinweises. Dort liegen nur Name,
--      Rolle und Einstellungen, keine Kundendaten.
--
--      Warum an allen Tabellen und nicht nur an den Kundenregeln: Die
--      Regeln, die Kunden Zugriff geben, stehen verstreut ueber viele
--      Migrationen und haben unterschiedliche Formen (Vergleich mit
--      `meta->>'authUserId'`, `ist_kunde_des_kontakts`, Chatteilnahme,
--      eigene `user_id`). Jede einzeln umzuschreiben hiesse, ihren heutigen
--      Wortlaut in der Datenbank zu kennen, und eine vergessene Regel waere
--      ein offenes Loch. Die zusaetzliche Regel dagegen braucht keine der
--      vorhandenen anzufassen und deckt auch Tabellen ab, die spaeter in
--      Lovable dazukommen, sobald Teil 6 dort noch einmal laeuft.
--      Stand 23.09.2026 geben Kunden unter anderem diese Regeln Zugriff:
--        kontakte            „Kunden sehen eigenen Kontakt“
--        investments         „Kunden sehen eigene Investments“
--        finanzierungen      „Kunden sehen eigene Finanzierungen“
--        kunde_dokumente     kunde_dokumente_select_kunde
--        kunden_bewertungen  „Kunden sehen/erstellen eigene Bewertungen“
--        empfehlungen        „Kunden sehen/erstellen eigene Empfehlungen“
--        signature_requests  „Kunden sehen eigene Signaturanfragen“
--        storage.objects     „Kunde read/upload/loescht unterlagen“,
--                            „SA-PDFs: internal or owner read/insert“,
--                            „Kunde loescht eigenfinanzierung unterlagen“
--        dazu Chats, Nachrichten, Benachrichtigungen und alle Tabellen mit
--        eigener `user_id` des Kunden.
--
--      Neue Tabelle spaeter? Dann einmal im SQL-Editor:
--        select public.kundenportal_sperrregeln_anlegen();
--
-- WAS OHNE SIE PASSIERT
--
--   Die Function `kundenportal-sperre` findet `kundenportal_sperre_schreiben`
--   nicht und schreibt wie bisher nur den Anzeigewert, jetzt aber erst nach
--   der Rechtepruefung und mit dem Dienstschluessel. Die Anmeldung wird
--   trotzdem gesperrt, die Portalseite zeigt den Sperrhinweis wie bisher
--   anhand des Anzeigewerts. Es fehlt die Datenbanksperre: Mit einem noch
--   gueltigen Zugriffsschluessel kaeme ein Kunde bis zu dessen Ablauf an
--   seine Daten, und ein interner Nutzer koennte den Anzeigewert ueber
--   `merge_kontakt_meta` noch umstellen (die Anmeldesperre bliebe davon
--   unberuehrt). Es stuerzt nichts ab.
--
-- WIEDERHOLBAR
--
--   CREATE TABLE IF NOT EXISTS, Bestand mit ON CONFLICT DO NOTHING, CREATE
--   OR REPLACE, DROP TRIGGER IF EXISTS, DROP POLICY IF EXISTS vor jeder
--   Sperrregel. Ein zweiter Lauf schadet nicht und hebt keine spaetere
--   Entsperrung auf.
--
-- PRUEFEN (lesend, aendert nichts; nach dem Ausfuehren im SQL-Editor):
--
--   select
--     to_regclass('public.kundenportal_sperren') is not null
--       as tabelle_da,
--     (select count(*) from public.kundenportal_sperren where gesperrt)
--       as gesperrt_laut_tabelle,
--     (select count(*) from public.kontakte where meta ->> 'portalGesperrt' = 'true')
--       as gesperrt_laut_anzeige,
--     (select count(*) from pg_policies
--       where policyname = 'Kundenportal-Sperre' and permissive = 'RESTRICTIVE')
--       as sperrregeln,
--     (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
--       where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
--         and c.relname not in ('profiles', 'user_roles', 'user_settings')) + 1
--       as sperrregeln_erwartet,
--     exists (select 1 from pg_trigger
--       where tgname = 'kontakt_portalsperre_spiegeln' and not tgisinternal)
--       as ausloeser_da,
--     has_function_privilege('authenticated',
--       to_regprocedure('public.kundenportal_sperre_schreiben(uuid,boolean,uuid)'), 'EXECUTE')
--       as browser_darf_schreiben,        -- erwartet: false
--     has_function_privilege('authenticated',
--       to_regprocedure('public.kunde_portal_gesperrt(uuid)'), 'EXECUTE')
--       as browser_darf_fremde_fragen,    -- erwartet: false
--     has_function_privilege('authenticated',
--       to_regprocedure('public.kundenportal_gesperrt_fuer_mich()'), 'EXECUTE')
--       as portal_darf_fragen;             -- erwartet: true
--
--   Erwartet: tabelle_da und ausloeser_da true, die beiden „gesperrt“-Zahlen
--   gleich, sperrregeln gleich sperrregeln_erwartet, browser_darf_schreiben
--   und browser_darf_fremde_fragen false, portal_darf_fragen true.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Die Tabelle und der Bestand
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.kundenportal_sperren (
  kontakt_id    uuid PRIMARY KEY REFERENCES public.kontakte(id) ON DELETE CASCADE,
  gesperrt      boolean NOT NULL DEFAULT true,
  gesperrt_am   timestamptz,
  entsperrt_am  timestamptz,
  -- Wer zuletzt gesperrt oder entsperrt hat. Leer beim uebernommenen Bestand.
  geaendert_von uuid,
  geaendert_am  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.kundenportal_sperren IS
  'Kundenportal-Sperre je Kontakt. Massgeblich fuer die Sperrregel '
  '„Kundenportal-Sperre“. Schreiben nur ueber kundenportal_sperre_schreiben '
  '(Edge Function kundenportal-sperre). meta.portalGesperrt am Kontakt ist '
  'nur die Anzeige davon.';

ALTER TABLE public.kundenportal_sperren ENABLE ROW LEVEL SECURITY;
-- Keine Regel fuer Browserrollen: Lesen und Schreiben nur ueber die
-- Funktionen dieser Migration.
REVOKE ALL ON public.kundenportal_sperren FROM anon, authenticated;
GRANT ALL ON public.kundenportal_sperren TO service_role;

INSERT INTO public.kundenportal_sperren (kontakt_id, gesperrt, geaendert_am)
SELECT k.id, true, now()
  FROM public.kontakte k
 WHERE (k.meta ->> 'portalGesperrt') = 'true'
ON CONFLICT (kontakt_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2) Ist dieser Nutzer ein gesperrter Kunde?
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kunde_portal_gesperrt(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Von der kleinen Sperrtabelle aus gesucht, nicht von allen Kontakten.
  -- Solange niemand gesperrt ist, kostet die Frage praktisch nichts.
  -- COALESCE aussen: nie unbekannt, siehe 20260916100000.
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
    AND NOT public.is_internal_role(_user_id),
    false)
$$;

COMMENT ON FUNCTION public.kunde_portal_gesperrt(uuid) IS
  'Wahr, wenn der Nutzer Kunde (Person 1 oder 2) eines gesperrten Kontakts ist '
  'und keine interne Rolle hat. Grundlage der Sperrregel „Kundenportal-Sperre“.';

-- Nicht fuer den Browser: Mit einer fremden Kennung liesse sich sonst
-- erfragen, ob jemand ein gesperrter Kunde ist. Die Sperrregel fragt ueber
-- kundenportal_gesperrt_fuer_mich (Teil 3), die nur den Angemeldeten kennt.
REVOKE ALL ON FUNCTION public.kunde_portal_gesperrt(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kunde_portal_gesperrt(uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- 3) Dieselbe Frage fuer den Angemeldeten, fuer Portal und Anmeldeseite
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kundenportal_gesperrt_fuer_mich()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.kunde_portal_gesperrt(auth.uid())
$$;

REVOKE ALL ON FUNCTION public.kundenportal_gesperrt_fuer_mich() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.kundenportal_gesperrt_fuer_mich() TO authenticated;


-- ---------------------------------------------------------------------------
-- 4) Sperre setzen oder aufheben, nur mit dem Dienstschluessel
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kundenportal_sperre_schreiben(
  _kontakt_id uuid, _gesperrt boolean, _von uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _jetzt timestamptz := now();
  _jetzt_text text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  _meta jsonb;
BEGIN
  -- Doppelt gesichert: Das Ausfuehrungsrecht hat nur service_role, und ein
  -- angemeldeter Nutzer wird hier noch einmal abgewiesen. Die Rechtepruefung
  -- (Admin, Inhaber, zustaendiger Partner) macht die Edge Function vorher.
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _kontakt_id IS NULL OR _gesperrt IS NULL THEN
    RAISE EXCEPTION 'Kontakt und Sperrstand sind Pflicht';
  END IF;

  -- Zeile festhalten, damit zwei gleichzeitige Klicks sich nicht kreuzen.
  PERFORM 1 FROM public.kontakte WHERE id = _kontakt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontakt nicht gefunden';
  END IF;

  -- Erst die Wahrheit, dann die Anzeige. Der Ausloeser aus Teil 5 prueft
  -- die Anzeige gegen die Tabelle und laesst sie nur so durch.
  INSERT INTO public.kundenportal_sperren AS s
         (kontakt_id, gesperrt, gesperrt_am, entsperrt_am, geaendert_von, geaendert_am)
  VALUES (_kontakt_id, _gesperrt,
          CASE WHEN _gesperrt THEN _jetzt END,
          CASE WHEN _gesperrt THEN NULL ELSE _jetzt END,
          _von, _jetzt)
  ON CONFLICT (kontakt_id) DO UPDATE
     SET gesperrt      = EXCLUDED.gesperrt,
         gesperrt_am   = CASE WHEN EXCLUDED.gesperrt THEN _jetzt ELSE s.gesperrt_am END,
         entsperrt_am  = CASE WHEN EXCLUDED.gesperrt THEN s.entsperrt_am ELSE _jetzt END,
         geaendert_von = EXCLUDED.geaendert_von,
         geaendert_am  = _jetzt;

  UPDATE public.kontakte
     SET meta = COALESCE(meta, '{}'::jsonb) || CASE
                  WHEN _gesperrt THEN jsonb_build_object('portalGesperrt', true, 'portalGesperrtAt', _jetzt_text)
                  ELSE jsonb_build_object('portalGesperrt', false, 'portalEntsperrtAt', _jetzt_text)
                END,
         aktualisiert_am = now()
   WHERE id = _kontakt_id
  RETURNING meta INTO _meta;

  RETURN COALESCE(_meta, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.kundenportal_sperre_schreiben(uuid, boolean, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kundenportal_sperre_schreiben(uuid, boolean, uuid) TO service_role;


-- ---------------------------------------------------------------------------
-- 5) Der Anzeigewert folgt immer der Tabelle
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kontakt_portalsperre_spiegeln()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wahr boolean;
BEGIN
  -- Frueh aussteigen: Der haeufige Fall beruehrt den Wert gar nicht.
  -- Verschachtelt, weil OLD beim Anlegen nicht belegt ist.
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.meta -> 'portalGesperrt') IS NOT DISTINCT FROM (OLD.meta -> 'portalGesperrt') THEN
      RETURN NEW;
    END IF;
  ELSIF (NEW.meta ->> 'portalGesperrt') IS DISTINCT FROM 'true' THEN
    -- Neuer Kontakt ohne behauptete Sperre: nichts zu tun.
    RETURN NEW;
  END IF;
  IF NEW.meta IS NULL OR jsonb_typeof(NEW.meta) <> 'object' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.kundenportal_sperren
     WHERE kontakt_id = NEW.id AND gesperrt
  ) INTO _wahr;

  IF (NEW.meta ->> 'portalGesperrt') IS NOT DISTINCT FROM (CASE WHEN _wahr THEN 'true' ELSE 'false' END) THEN
    RETURN NEW;
  END IF;

  RAISE LOG 'kontakt_portalsperre_spiegeln: portalGesperrt an Kontakt % auf % zurueckgesetzt (Aenderung an der Function kundenportal-sperre vorbei)',
    NEW.id, _wahr;
  NEW.meta := jsonb_set(NEW.meta, '{portalGesperrt}', to_jsonb(_wahr), true);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.kontakt_portalsperre_spiegeln() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS kontakt_portalsperre_spiegeln ON public.kontakte;
CREATE TRIGGER kontakt_portalsperre_spiegeln
  BEFORE INSERT OR UPDATE OF meta ON public.kontakte
  FOR EACH ROW
  EXECUTE FUNCTION public.kontakt_portalsperre_spiegeln();


-- ---------------------------------------------------------------------------
-- 6) Die Sperrregel an allen Tabellen
-- ---------------------------------------------------------------------------
--
-- Als Funktion, damit sie nach einer neuen Tabelle noch einmal laufen kann:
--   select public.kundenportal_sperrregeln_anlegen();
-- Nur im SQL-Editor aufrufbar, nicht aus dem Browser.

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
       -- Ohne diese drei laedt die Anwendung nicht, siehe Kopf, Teil 6.
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
      -- Eine Tabelle, die dieser Rolle nicht gehoert, bricht nicht den
      -- ganzen Lauf ab. Sie wird unten genannt.
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
