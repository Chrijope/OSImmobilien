-- ===========================================================================
-- Aufgaben aus dem Kundenportal legt die Datenbank an (15.10.2026)
-- ===========================================================================
--
-- Bisher legte der Browser des Kunden diese Aufgaben an. Ohne Zustaendigen
-- landeten sie beim Kunden selbst, die Leitung kann der Kunde nicht
-- bestimmen, und fremde Aufgaben sieht er nicht. Nach einem Wechsel des
-- Zustaendigen gab es deshalb zwei offene Pruefaufgaben.
--
-- 1. unterlagen_pruefaufgabe_sichern(investment, beschreibung, tage)
--    Je Investment genau eine Pruefaufgabe "Neue Unterlagen im Portal:
--    pruefen und freigeben" je Sollempfaenger (der Zustaendige, ohne ihn jede
--    Person der Leitung). Gleicht unter einer Sperre je Investment alle
--    offenen Pruefaufgaben ab, mit neuem Schluessel
--    portal:unterlagen_pruefen:{kontakt}:{investment} und mit dem alten der
--    Einreichung portal:bonitaet:{kontakt}:{investment}: je Sollempfaenger
--    bleibt eine (neuer Schluessel bevorzugt, sonst die aelteste), weitere
--    gehen an noch freie Sollempfaenger, der Rest wird mit Vermerk abgesagt,
--    fehlende werden angelegt.
--
-- 2. empfehlung_aufgabe_anlegen(kontakt, empfehlung, beschreibung)
--    "Empfehlung erhalten: Empfohlenen anrufen" fuer den Zustaendigen, ohne
--    ihn fuer jede Person der Leitung, je Empfehlung genau einmal, auch nach
--    dem Abhaken.
--
-- Beide SECURITY DEFINER, nur fuer angemeldete Nutzer. Ohne diese Migration
-- legt der Browser die Aufgaben selbst an, nur mit Zustaendigem
-- (src/lib/unterlagenMitteilung.ts, src/lib/empfehlungAufgabe.ts).
--
-- Steht fuer sich, Reihenfolge egal, keine Function auszurollen, aendert
-- beim Ausfuehren keine Daten, wiederholbar.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.unterlagen_pruefaufgabe_sichern(
  _investment_id uuid,
  _beschreibung text,
  _tage_bis_faellig integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _inv public.investments%ROWTYPE;
  _k public.kontakte%ROWTYPE;
  _neu text;
  _alt text;
  _soll uuid[];
  _belegt uuid[] := ARRAY[]::uuid[];
  _rest uuid[] := ARRAY[]::uuid[];
  _frei uuid;
  _a record;
  _id uuid;
  _faellig timestamptz;
  _angelegt int := 0;
  _umgehaengt int := 0;
  _geschlossen int := 0;
  _zeilen int;
  _vermerk text := 'Automatisch zusammengeführt: Je Investment gibt es eine Prüfaufgabe für neue Unterlagen aus dem Portal.';
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _inv FROM public.investments WHERE id = _investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nicht berechtigt' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _k FROM public.kontakte WHERE id = _inv.kunde_id;
  IF NOT FOUND OR NOT public.darf_investment_nutzen(_uid, _inv.kunde_id, _k.meta) THEN
    RAISE EXCEPTION 'Nicht berechtigt' USING ERRCODE = '42501';
  END IF;

  _neu := 'portal:unterlagen_pruefen:' || _k.id::text || ':' || _inv.id::text;
  _alt := 'portal:bonitaet:' || _k.id::text || ':' || _inv.id::text;
  PERFORM pg_advisory_xact_lock(hashtext('unterlagen_pruefen:' || _inv.id::text));

  -- Sollempfaenger: der Zustaendige, ohne ihn jede Person der Leitung.
  IF _k.zustaendig_id IS NOT NULL THEN
    _soll := ARRAY[_k.zustaendig_id];
  ELSE
    SELECT COALESCE(array_agg(DISTINCT ur.user_id), ARRAY[]::uuid[]) INTO _soll
      FROM public.user_roles ur
     WHERE ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role, 'vertriebsleiter'::public.app_role);
  END IF;
  IF coalesce(array_length(_soll, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Kein Empfänger für die Prüfaufgabe gefunden';
  END IF;

  -- Durchgang 1: je Sollempfaenger eine behalten, neuer Schluessel zuerst,
  -- sonst die aelteste. Alles andere merken.
  FOR _a IN
    SELECT a.id, a.zugewiesen_an
      FROM public.aufgaben a
     WHERE a.kontakt_id = _k.id
       AND a.ausloeser_schluessel IN (_neu, _alt)
       AND a.status::text IN ('offen', 'in_bearbeitung')
     ORDER BY (a.ausloeser_schluessel = _neu) DESC, a.erstellt_am ASC, a.id
  LOOP
    IF _a.zugewiesen_an = ANY(_soll) AND NOT (_a.zugewiesen_an = ANY(_belegt)) THEN
      _belegt := _belegt || _a.zugewiesen_an;
    ELSE
      _rest := _rest || _a.id;
    END IF;
  END LOOP;

  -- Durchgang 2: die uebrigen an noch freie Sollempfaenger, sonst absagen.
  -- Das deckt den Wechsel des Zustaendigen und die Rueckgabe an die Leitung ab.
  FOREACH _id IN ARRAY _rest LOOP
    SELECT s INTO _frei FROM unnest(_soll) s WHERE NOT (s = ANY(_belegt)) LIMIT 1;
    IF _frei IS NOT NULL THEN
      UPDATE public.aufgaben SET zugewiesen_an = _frei WHERE id = _id;
      _belegt := _belegt || _frei;
      _umgehaengt := _umgehaengt + 1;
    ELSE
      UPDATE public.aufgaben
         SET status = 'abgesagt',
             beschreibung = CASE WHEN COALESCE(btrim(beschreibung), '') = '' THEN _vermerk
                                 ELSE beschreibung || E'\n\n' || _vermerk END
       WHERE id = _id;
      _geschlossen := _geschlossen + 1;
    END IF;
    _frei := NULL;
  END LOOP;

  -- Fehlende anlegen: heute plus 0 bis hoechstens 30 Tage, 09:00 deutscher Zeit.
  _faellig := (((now() AT TIME ZONE 'Europe/Berlin')::date
                + LEAST(GREATEST(COALESCE(_tage_bis_faellig, 0), 0), 30))::timestamp
               + time '09:00') AT TIME ZONE 'Europe/Berlin';
  FOREACH _frei IN ARRAY _soll LOOP
    CONTINUE WHEN _frei = ANY(_belegt);
    INSERT INTO public.aufgaben (
      benutzer_id, zugewiesen_an, kontakt_id, investment_id, titel, beschreibung, typ, prioritaet, status,
      faellig_am, uhrzeit, erstellt_von_name, ausloeser_schluessel
    )
    VALUES (
      _frei, _frei, _k.id, _inv.id, 'Neue Unterlagen im Portal: prüfen und freigeben', left(COALESCE(_beschreibung, ''), 2000),
      'aufgabe', 'hoch', 'offen', _faellig, time '09:00', 'Kundenportal', _neu
    )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS _zeilen = ROW_COUNT;
    _angelegt := _angelegt + _zeilen;
  END LOOP;

  RETURN jsonb_build_object('angelegt', _angelegt, 'umgehaengt', _umgehaengt, 'geschlossen', _geschlossen);
END;
$$;

CREATE OR REPLACE FUNCTION public.empfehlung_aufgabe_anlegen(
  _kontakt_id uuid,
  _empfehlung_id text,
  _beschreibung text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _k public.kontakte%ROWTYPE;
  _schluessel text;
  _empfaenger uuid;
  _faellig timestamptz;
  _anzahl int := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet' USING ERRCODE = '42501';
  END IF;
  -- Nur der Kunde dieses Kontakts, gesperrte Portale nicht.
  IF NOT public.ist_kunde_des_kontakts(_uid, _kontakt_id) THEN
    RAISE EXCEPTION 'Nicht berechtigt' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _k FROM public.kontakte WHERE id = _kontakt_id;

  _schluessel := 'empfehlung_erhalten:' || _k.id::text || ':'
    || COALESCE(NULLIF(btrim(_empfehlung_id), ''), md5(COALESCE(_beschreibung, '')));
  PERFORM pg_advisory_xact_lock(hashtext(_schluessel));

  -- Ohne Statusfilter: Jede Empfehlung erzeugt genau einmal eine Aufgabe,
  -- auch nachdem sie abgehakt ist.
  IF EXISTS (SELECT 1 FROM public.aufgaben a WHERE a.ausloeser_schluessel = _schluessel) THEN
    RETURN jsonb_build_object('vorhanden', true, 'angelegt', 0);
  END IF;

  _faellig := (((now() AT TIME ZONE 'Europe/Berlin')::date + 1)::timestamp + time '09:00') AT TIME ZONE 'Europe/Berlin';
  FOR _empfaenger IN
    SELECT _k.zustaendig_id WHERE _k.zustaendig_id IS NOT NULL
    UNION
    SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
     WHERE _k.zustaendig_id IS NULL
       AND ur.role IN ('admin'::public.app_role, 'inhaber'::public.app_role, 'vertriebsleiter'::public.app_role)
  LOOP
    INSERT INTO public.aufgaben (
      benutzer_id, zugewiesen_an, kontakt_id, titel, beschreibung, typ, prioritaet, status,
      faellig_am, uhrzeit, erstellt_von_name, ausloeser_schluessel
    )
    VALUES (
      _empfaenger, _empfaenger, _k.id, 'Empfehlung erhalten: Empfohlenen anrufen', left(COALESCE(_beschreibung, ''), 2000),
      'anruf', 'hoch', 'offen', _faellig, time '09:00', 'Kundenportal', _schluessel
    )
    ON CONFLICT DO NOTHING;
    _anzahl := _anzahl + 1;
  END LOOP;

  IF _anzahl = 0 THEN
    RAISE EXCEPTION 'Kein Empfänger für die Empfehlung gefunden';
  END IF;

  RETURN jsonb_build_object('vorhanden', false, 'angelegt', _anzahl);
END;
$$;

REVOKE ALL ON FUNCTION public.unterlagen_pruefaufgabe_sichern(uuid, text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unterlagen_pruefaufgabe_sichern(uuid, text, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.empfehlung_aufgabe_anlegen(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empfehlung_aufgabe_anlegen(uuid, text, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
