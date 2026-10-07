-- ===========================================================================
-- Absicherung: Geld- und Vertragsfelder nur ueber geprüfte Wege
-- ===========================================================================
--
-- CHRISTIANS GRUNDSATZ (29.09.2026)
--
--   Nur Admin und Inhaber schreiben direkt. Alle anderen aendern Unterschrift,
--   Geldeingang, Provision und Zuordnung nur ueber geprüfte Ablaeufe. Was
--   heute funktioniert, funktioniert weiter.
--
-- WER DARF WAS (in allen Teilen gleich)
--
--   Admin und Inhaber (is_admin_role) duerfen alles. Der Server ebenso:
--   Edge Functions mit Dienstschluessel und der SQL-Editor laufen ohne
--   angemeldeten Nutzer (auth.uid() IS NULL). Alle anderen gehen ueber die
--   Datenbankfunktionen unten; direkt geschriebene Werte in geschuetzten
--   Feldern werden still durch den gespeicherten Stand ersetzt, damit das
--   uebrige Speichern nie scheitert (Muster: user_settings_provision_schuetzen
--   aus 20260929140000). Die Waechter brechen nie ab. Die geprueften
--   Funktionen dagegen lehnen mit einem Satz fuer den Nutzer ab (ERRCODE
--   42501), denn wer dort klickt, soll nicht "gespeichert" lesen, wenn nichts
--   gespeichert wurde.
--
-- WAS DIESE MIGRATION TUT
--
--   1. investments: Waechter trg_absicherung_investments auf den
--      Unterschrifts-, Abwicklungs- und Notarschluesseln in meta. Direkte
--      Schreibzugriffe (Rolle authenticated) von Nicht-Admins aendern sie
--      nie. merge_investment_meta laesst fuer Nicht-Admins nur noch das
--      Zuruecksetzen der Schluessel zu, die die Oberflaeche leert. Zwei neue Wege:
--        investment_sa_pdf_vermerken    Selbstauskunft auf Papier hochgeladen
--                                       oder freigegeben (setzt saPdf)
--        investment_abwicklung_speichern Kaufpreiseingang, Grundbuch,
--                                       Provisionsrechnung, Auszahlung
--      confirm_notar_termin bestaetigt nur noch der Kunde, und nur einen
--      freigegebenen Vorschlag.
--   2. investments: Loeschen direkt nur Admin und Inhaber. Partner loeschen
--      ueber investment_loeschen, und zwar nur vor der Reservierung.
--   3. kontakte: setter, erstelltVonName, kontaktTyp (meta) und die Spalte
--      berater aendern Nicht-Admins nicht mehr (berater nur zusammen mit der
--      Zustaendigkeit). erstelltVonId und setterId schuetzt schon
--      trg_kontakt_zuordnung. Endgueltig loeschen nur Admin, Inhaber und
--      Vertriebsleitung, dieselbe Liste wie dsgvo-hard-delete.
--   4. tippgeber: Aendern nur Admin und Inhaber. Anlegen nur fuer sich selbst,
--      ohne Portalkonto.
--   5. empfehlungen: Spalte provision und die Auszahlungsmarke nur Admin und
--      Inhaber. Anlegen durch Partner nur fuer eigene Kunden.
--
-- WARUM DIE INVESTMENTS ANDERS GEPRUEFT WERDEN ALS DIE KONTAKTE
--
-- updateInvestment im Browser schreibt das ganze meta aus dem
-- Zwischenspeicher zurueck. Steht dort ein veralteter Stand ("noch nicht
-- unterschrieben"), wuerde er die gerade vom Server gesetzte Unterschrift
-- ueberschreiben. Deshalb fragt der Waechter nicht nur, wer schreibt, sondern
-- auch wie: Direkt ueber die Schnittstelle (current_user = authenticated)
-- bleibt jeder geschuetzte Schluessel, wie er ist. Geprüfte Funktionen
-- (SECURITY DEFINER, current_user = Besitzer) kommen durch und pruefen
-- selbst. Darum ist der Waechter bewusst SECURITY INVOKER.
--
-- REIHENFOLGE DER TRIGGER AUF investments
--
-- Postgres ruft BEFORE-Trigger in der Reihenfolge ihrer Namen auf.
-- trg_absicherung_investments laeuft vor trg_finanzierungsstand_intern_frei,
-- damit dieser eine vom Browser vorgetaeuschte Unterschrift gar nicht erst
-- sieht, und vor trg_investments_provisionssatz_festschreiben. Mit dem
-- Provisionstrigger teilt er keinen Schluessel.
--
-- Voraussetzung: 20260929140000_provisionssatz_ab_reservierung.sql
-- (pipelinestufe_ist_kaufphase). Die Anwendung laeuft auch ohne diese
-- Migration, dann ueber die alten Wege.
--
-- REIHENFOLGE BEIM AUSROLLEN: Push, invite-user ausrollen, Publish, dann diese
-- Migration. Laeuft sie vor dem Publish, verwirft die Datenbank die alten
-- Direktwege still (Papier-Selbstauskunft, Abwicklungshaken, Loeschen).
-- ===========================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.pipelinestufe_ist_kaufphase(text)') IS NULL
     OR to_regprocedure('public.ist_eigenes_investment(uuid,uuid)') IS NULL
     OR to_regprocedure('public.is_vp_owner_of_kontakt(uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('public.darf_investment_nutzen(uuid,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Voraussetzung fehlt. Zuerst 20260929140000_provisionssatz_ab_reservierung.sql ausfuehren.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1a) Die geschuetzten Schluessel in investments.meta
-- ---------------------------------------------------------------------------
--
-- Unterschriften: schreiben finalize-selbstauskunft, update-sa-signature-data,
--   finalize-reservierung und send-reservation-signature (alle mit
--   Dienstschluessel). Der Browser setzt sie nur beim Zuruecksetzen auf leer.
-- saPdf: zusaetzlich investment_sa_pdf_vermerken (Papier, Freigabe).
-- Abwicklung: nur noch investment_abwicklung_speichern.
-- notarTerminBestaetigt: bestaetigt der Kunde ueber confirm_notar_termin.
-- aftersalesBeratung: schreibt nur finalize-aftersales-beratung.
-- lockedProvisionRate* schuetzt der Provisionstrigger, nicht diese Liste.

CREATE OR REPLACE FUNCTION public.investment_geschuetzte_schluessel()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    'saSigned', 'saSignedAt', 'saSignatures', 'saPdf',
    'rvSigned', 'rvSignedAt', 'rvSignatures', 'rvPdf', 'rvPdfPath', 'rvData',
    'rvVertragsdatum', 'rvWiderrufWahl', 'rvReservierungAb', 'rvReservierungWirksamAm',
    'notarTerminBestaetigt', 'aftersalesBeratung',
    'abwicklung', 'kaufpreisEingegangen', 'kaufpreisEingegangenDatum',
    'kaufpreisfaelligkeitDatum', 'grundbuchEingetragen', 'grundbuchDatum'
  ]::text[];
$$;

COMMENT ON FUNCTION public.investment_geschuetzte_schluessel() IS
  'Schluessel in investments.meta, die nur Admin, Inhaber, der Server und die '
  'geprueften Funktionen setzen. Siehe 20260930110000.';

-- Leer heisst: zuruecksetzen. Das darf der zustaendige Partner bei den
-- Schluesseln, die die Oberflaeche leert (siehe merge_investment_meta).
CREATE OR REPLACE FUNCTION public.investment_wert_leer(_wert jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _wert IS NULL
      OR _wert IN ('null'::jsonb, 'false'::jsonb, '""'::jsonb, '{}'::jsonb, '[]'::jsonb);
$$;

-- ---------------------------------------------------------------------------
-- 1b) Waechter auf investments
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.investments_absicherung()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _schluessel constant text[] := public.investment_geschuetzte_schluessel();
  _neu jsonb;
  _alt jsonb := '{}'::jsonb;
BEGIN
  -- Geprüfte Funktionen (SECURITY DEFINER) und der Dienstschluessel kommen
  -- durch, siehe Kopf. Hier landet nur, was direkt ueber die Schnittstelle kommt.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND public.is_admin_role(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.meta) = 'object' THEN
    SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
      INTO _alt
      FROM jsonb_each(OLD.meta) AS e
     WHERE e.key = ANY(_schluessel);
  END IF;

  -- Kein Objekt (NULL, []) zaehlt wie leer, sonst liesse sich der Schutz
  -- damit umgehen.
  IF NEW.meta IS NULL OR jsonb_typeof(NEW.meta) <> 'object' THEN
    IF _alt = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
    _neu := '{}'::jsonb;
  ELSE
    _neu := NEW.meta;
  END IF;

  IF (_neu - _schluessel) || _alt IS DISTINCT FROM _neu THEN
    RAISE LOG 'investments %: geschuetzte Schluessel nicht geaendert (nur Admin, Inhaber, Server)', NEW.id;
  END IF;
  NEW.meta := (_neu - _schluessel) || _alt;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.investments_absicherung() IS
  'Direkte Schreibzugriffe von Nicht-Admins aendern die Schluessel aus '
  'investment_geschuetzte_schluessel() nie; der gespeicherte Stand bleibt.';

DROP TRIGGER IF EXISTS trg_absicherung_investments ON public.investments;
CREATE TRIGGER trg_absicherung_investments
BEFORE INSERT OR UPDATE OF meta ON public.investments
FOR EACH ROW
EXECUTE FUNCTION public.investments_absicherung();

-- ---------------------------------------------------------------------------
-- 1c) merge_investment_meta: Nicht-Admins nur noch zuruecksetzen
-- ---------------------------------------------------------------------------
--
-- Rumpf aus der Datenbank (Stand 29.09.2026), neu ist nur der Block
-- "Geschuetzte Schluessel". Die Funktion ist SECURITY DEFINER, der Waechter
-- oben laesst sie deshalb durch; hier wird selbst geprueft. Kunden bleiben
-- wie bisher auf marktwertHistorie und steuerCockpit beschraenkt.

CREATE OR REPLACE FUNCTION public.merge_investment_meta(_investment_id uuid, _updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _erlaubte_schluessel text[] := ARRAY[
    'marktwertHistorie',
    'steuerCockpit'
  ];
  _result jsonb;
  _kunde_id uuid;
  _kontakt_meta jsonb;
  _inv_meta jsonb;
  _ist_intern boolean;
  _wirksam jsonb;
  _schluessel text;
  _verworfen text[] := ARRAY[]::text[];
BEGIN
  SELECT kunde_id, meta INTO _kunde_id, _inv_meta
  FROM public.investments WHERE id = _investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found';
  END IF;

  SELECT meta INTO _kontakt_meta FROM public.kontakte WHERE id = _kunde_id;

  _ist_intern := auth.uid() IS NULL OR public.is_internal_role(auth.uid());

  IF NOT public.darf_investment_nutzen(auth.uid(), _kunde_id, _kontakt_meta) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  _wirksam := COALESCE(_updates, '{}'::jsonb);

  IF NOT _ist_intern THEN
    _wirksam := '{}'::jsonb;
    FOR _schluessel IN SELECT jsonb_object_keys(COALESCE(_updates, '{}'::jsonb)) LOOP
      IF _schluessel = ANY(_erlaubte_schluessel) THEN
        _wirksam := _wirksam || jsonb_build_object(_schluessel, _updates -> _schluessel);
      ELSE
        _verworfen := _verworfen || _schluessel;
      END IF;
    END LOOP;
  END IF;

  -- Geschuetzte Schluessel (20260930110000): Mitarbeiter ohne Admin-Rolle
  -- setzen sie nie. Zuruecksetzen (leerer Wert) duerfen sie nur die, die die
  -- Oberflaeche heute leert: Selbstauskunft neu unterschreiben lassen
  -- (SelbstauskunftForm), Reservierung zuruecksetzen (clearRvSignatureData,
  -- setInvestmentRvPdf("")) und Notartermin neu freigeben. Alle anderen,
  -- etwa rvReservierungAb, blieben sonst leerbar, und eine Reservierung
  -- gaelte sofort als wirksam.
  IF _ist_intern AND auth.uid() IS NOT NULL AND NOT public.is_admin_role(auth.uid())
     AND jsonb_typeof(_wirksam) = 'object' THEN
    FOR _schluessel IN SELECT jsonb_object_keys(_wirksam) LOOP
      IF _schluessel = ANY(public.investment_geschuetzte_schluessel())
         AND NOT (
           _schluessel = ANY(ARRAY[
             'saSigned', 'saSignedAt', 'saSignatures',
             'rvPdf', 'rvData', 'rvSignatures', 'rvSigned',
             'notarTerminBestaetigt'
           ]::text[])
           AND public.investment_wert_leer(_wirksam -> _schluessel)
         ) THEN
        _wirksam := _wirksam - _schluessel;
        _verworfen := _verworfen || _schluessel;
      END IF;
    END LOOP;
  END IF;

  IF array_length(_verworfen, 1) > 0 THEN
    RAISE LOG 'merge_investment_meta: nicht erlaubte Schluessel verworfen (%)',
      array_to_string(_verworfen, ', ');
  END IF;

  IF _wirksam = '{}'::jsonb THEN
    RETURN COALESCE(_inv_meta, '{}'::jsonb);
  END IF;

  UPDATE public.investments
  SET meta = COALESCE(meta, '{}'::jsonb) || _wirksam
  WHERE id = _investment_id
  RETURNING meta INTO _result;

  RETURN COALESCE(_result, '{}'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 1d) confirm_notar_termin: bestaetigt nur der Kunde, nur einen freigegebenen Termin
-- ---------------------------------------------------------------------------
--
-- Rumpf aus der Datenbank (Stand 29.09.2026). Die Funktion ist SECURITY
-- DEFINER und damit am Waechter vorbei. Bisher konnte jeder, der das
-- Investment nutzen darf, also auch der Partner, einen beliebigen Termin als
-- "vom Kunden bestaetigt" eintragen. Aufgerufen wird sie nur aus dem
-- Kundenportal (NotarterminAuswahlCard) mit einem der freigegebenen
-- Vorschlaege. Neu: Mitarbeiter ausser Admin und Inhaber werden abgewiesen,
-- und der Termin muss unter notarTerminVorschlaegeFreigegeben stehen.

CREATE OR REPLACE FUNCTION public.confirm_notar_termin(_investment_id uuid, _datum text, _uhrzeit text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_row public.investments%ROWTYPE;
  kontakt_row public.kontakte%ROWTYPE;
  current_meta jsonb;
  current_notar_data jsonb;
  bestaetigt jsonb;
BEGIN
  SELECT * INTO inv_row FROM public.investments WHERE id = _investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found';
  END IF;

  SELECT * INTO kontakt_row FROM public.kontakte WHERE id = inv_row.kunde_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontakt not found';
  END IF;

  IF NOT public.darf_investment_nutzen(auth.uid(), inv_row.kunde_id, kontakt_row.meta) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF auth.uid() IS NOT NULL AND public.is_internal_role(auth.uid()) AND NOT public.is_admin_role(auth.uid()) THEN
    RAISE EXCEPTION 'Den Notartermin bestätigt der Kunde im Portal.' USING ERRCODE = '42501';
  END IF;

  current_meta := COALESCE(inv_row.meta, '{}'::jsonb);

  IF NOT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(current_meta -> 'notarTerminVorschlaegeFreigegeben') = 'array'
                  THEN current_meta -> 'notarTerminVorschlaegeFreigegeben' ELSE '[]'::jsonb END) AS v
     WHERE coalesce(v ->> 'datum', '') = coalesce(_datum, '')
       AND coalesce(v ->> 'uhrzeit', '') = coalesce(_uhrzeit, '')
  ) THEN
    RAISE EXCEPTION 'Dieser Termin wurde nicht zur Auswahl freigegeben.' USING ERRCODE = '42501';
  END IF;

  current_notar_data := COALESCE(current_meta -> 'notarData', '{}'::jsonb);
  current_notar_data := jsonb_set(current_notar_data, '{datum}', to_jsonb(_datum), true);
  current_notar_data := jsonb_set(current_notar_data, '{uhrzeit}', to_jsonb(_uhrzeit), true);

  bestaetigt := jsonb_build_object(
    'datum', _datum,
    'uhrzeit', _uhrzeit,
    'bestaetigtAm', to_jsonb(now())
  );

  current_meta := current_meta
    || jsonb_build_object(
      'notarData', current_notar_data,
      'notarTermin', _datum,
      'notarUhrzeit', _uhrzeit,
      'notarTerminBestaetigt', bestaetigt,
      'notarTerminPortalFreigabe', true
    );

  UPDATE public.investments SET meta = current_meta WHERE id = _investment_id;
  RETURN current_meta;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1e) Selbstauskunft vermerken: Papier-Upload oder Freigabe
-- ---------------------------------------------------------------------------
--
-- Vorher schrieb der Browser saPdf direkt (KundenDetail: "Neue Fassung
-- hochladen" und "Freigeben"). Jetzt prueft die Datenbank:
--   - wer: Admin, Inhaber, Vertriebsleitung und der zustaendige
--     Vertriebspartner, wie in der Oberflaeche
--   - mit Papierpfad: Die Datei liegt wirklich im Eimer unterlagen, unter
--     selbstauskunft-papier/<Kontakt>/<Investment>/
--   - ohne Papierpfad (Freigabe): Die Selbstauskunft ist unterschrieben oder
--     es liegt schon eine vor. Ein leeres Formular laesst sich so nicht als
--     "liegt vor" markieren.

CREATE OR REPLACE FUNCTION public.investment_sa_pdf_vermerken(
  _investment_id uuid,
  _dateiname text,
  _papier_pfad text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _inv public.investments%ROWTYPE;
  _meta jsonb;
  _name text := nullif(btrim(coalesce(_dateiname, '')), '');
  _pfad text := nullif(btrim(coalesce(_papier_pfad, '')), '');
  _praefix text;
  _neu jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet.' USING ERRCODE = '42501';
  END IF;
  IF _name IS NULL OR length(_name) > 300 THEN
    RAISE EXCEPTION 'Dateiname fehlt.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _inv FROM public.investments WHERE id = _investment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment nicht gefunden.' USING ERRCODE = 'P0002';
  END IF;

  -- Rollen wie in der Oberflaeche (KundenDetail: darfPdfSelbstauskunft,
  -- Papierweg und Freigabe): Admin, Inhaber, Vertriebsleitung, und der
  -- Vertriebspartner nur beim eigenen Kunden.
  IF NOT (
    public.is_admin_role(_uid)
    OR public.has_role(_uid, 'vertriebsleiter'::public.app_role)
    OR (public.has_role(_uid, 'vertriebspartner'::public.app_role)
        AND public.ist_eigenes_investment(_uid, _inv.kunde_id))
  ) THEN
    RAISE EXCEPTION 'Diese Selbstauskunft darfst du nicht bearbeiten.' USING ERRCODE = '42501';
  END IF;

  _meta := CASE WHEN jsonb_typeof(_inv.meta) = 'object' THEN _inv.meta ELSE '{}'::jsonb END;

  IF _pfad IS NOT NULL THEN
    _praefix := 'selbstauskunft-papier/' || _inv.kunde_id::text || '/' || _inv.id::text || '/';
    IF left(_pfad, length(_praefix)) <> _praefix OR position('..' IN _pfad) > 0
       OR NOT EXISTS (SELECT 1 FROM storage.objects o
                       WHERE o.bucket_id = 'unterlagen' AND o.name = _pfad) THEN
      RAISE EXCEPTION 'Die hochgeladene Datei wurde nicht gefunden.' USING ERRCODE = '42501';
    END IF;
    _neu := jsonb_build_object('saPdf', _name, 'saPapierUploadPfad', _pfad);
  ELSE
    IF NOT (coalesce(_meta ->> 'saSigned', '') = 'true'
            OR nullif(_meta ->> 'saPdf', '') IS NOT NULL) THEN
      RAISE EXCEPTION 'Die Selbstauskunft ist noch nicht unterschrieben.' USING ERRCODE = '42501';
    END IF;
    _neu := jsonb_build_object('saPdf', _name);
  END IF;

  UPDATE public.investments
     SET meta = _meta || _neu
   WHERE id = _investment_id
  RETURNING meta INTO _meta;

  RETURN _meta;
END;
$$;

COMMENT ON FUNCTION public.investment_sa_pdf_vermerken(uuid, text, text) IS
  'Setzt saPdf (und saPapierUploadPfad) nach Pruefung: Papier-Upload liegt im '
  'Eimer unterlagen, oder die Selbstauskunft ist unterschrieben.';

-- ---------------------------------------------------------------------------
-- 1f) Abwicklung speichern: Kaufpreiseingang bis Auszahlung
-- ---------------------------------------------------------------------------
--
-- Bisher im Browser (abwicklungStore.saveAbwicklungDaten). Wer darf, ist die
-- Regel aus KundenDetail, jetzt in der Datenbank: Admin, Inhaber und
-- Backoffice immer, der zustaendige Vertriebspartner ab dem Notartermin.
-- Kaufpreiseingang, Provisionsrechnung und Auszahlung (je Haken und Datum)
-- setzen nur Admin, Inhaber und Backoffice (Christians Entscheidung vom
-- 30.09.2026); vom Partner bleibt dort der gespeicherte Stand. Faelligkeit,
-- Grundbuch, Uebergabe und Anmerkungen pflegt er weiter. Nur die bekannten
-- Felder werden uebernommen; fuenf davon stehen zusaetzlich flach im meta,
-- weil das Kundenportal sie dort liest.

CREATE OR REPLACE FUNCTION public.investment_abwicklung_speichern(
  _investment_id uuid,
  _daten jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _inv public.investments%ROWTYPE;
  _meta jsonb;
  _sauber jsonb;
  _felder constant text[] := ARRAY[
    'kaufpreisfaelligkeitDatum', 'kaufpreisEingegangen', 'kaufpreisEingegangenDatum',
    'grundbuchDatum', 'grundbuchEingetragen', 'provisionsRechnungGestellt',
    'provisionsRechnungDatum', 'auszahlungDatum', 'auszahlungBestaetigt',
    'uebergabeDatum', 'anmerkungen'
  ];
  -- Dieselbe Liste wie ABWICKLUNG_GELD_FELDER in src/lib/abwicklungStore.ts.
  _geldfelder constant text[] := ARRAY[
    'kaufpreisEingegangen', 'kaufpreisEingegangenDatum',
    'provisionsRechnungGestellt', 'provisionsRechnungDatum',
    'auszahlungBestaetigt', 'auszahlungDatum'
  ];
  _darf_geld boolean;
  _alt jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet.' USING ERRCODE = '42501';
  END IF;
  IF _daten IS NULL OR jsonb_typeof(_daten) <> 'object' THEN
    RAISE EXCEPTION 'Abwicklungsdaten fehlen.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _inv FROM public.investments WHERE id = _investment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment nicht gefunden.' USING ERRCODE = 'P0002';
  END IF;
  _meta := CASE WHEN jsonb_typeof(_inv.meta) = 'object' THEN _inv.meta ELSE '{}'::jsonb END;

  _darf_geld := public.is_admin_role(_uid) OR public.has_role(_uid, 'backoffice'::public.app_role);

  IF NOT (
    _darf_geld
    OR (public.has_role(_uid, 'vertriebspartner'::public.app_role)
        AND public.ist_eigenes_investment(_uid, _inv.kunde_id)
        AND coalesce(_meta ->> 'pipelineStufe', '') IN (
          'notar', 'notar_ohne_gs', 'notar_mit_gs', 'faelligkeit', 'abrechnung', 'abgeschlossen'))
  ) THEN
    RAISE EXCEPTION 'Die Abwicklung pflegen Admin, Inhaber, Backoffice und der zuständige Partner ab dem Notartermin.'
      USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    INTO _sauber
    FROM jsonb_each(_daten) AS e
   WHERE e.key = ANY(_felder);

  IF NOT _darf_geld THEN
    _alt := CASE WHEN jsonb_typeof(_meta -> 'abwicklung') = 'object' THEN _meta -> 'abwicklung' ELSE '{}'::jsonb END;
    SELECT (_sauber - _geldfelder) || coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
      INTO _sauber
      FROM jsonb_each(_alt) AS e
     WHERE e.key = ANY(_geldfelder);
  END IF;

  UPDATE public.investments
     SET meta = _meta || jsonb_build_object(
           'abwicklung', _sauber,
           'kaufpreisfaelligkeitDatum', _sauber -> 'kaufpreisfaelligkeitDatum',
           'grundbuchDatum', _sauber -> 'grundbuchDatum',
           'kaufpreisEingegangen', _sauber -> 'kaufpreisEingegangen',
           'kaufpreisEingegangenDatum', _sauber -> 'kaufpreisEingegangenDatum',
           'grundbuchEingetragen', _sauber -> 'grundbuchEingetragen'
         )
   WHERE id = _investment_id
  RETURNING meta INTO _meta;

  RETURN _meta;
END;
$$;

COMMENT ON FUNCTION public.investment_abwicklung_speichern(uuid, jsonb) IS
  'Abwicklung (Kaufpreiseingang, Grundbuch, Provisionsrechnung, Auszahlung): '
  'Admin, Inhaber, Backoffice oder zustaendiger Vertriebspartner ab Notartermin; '
  'Kaufpreiseingang, Provisionsrechnung und Auszahlung nur Admin, Inhaber, Backoffice.';

-- ---------------------------------------------------------------------------
-- 2) Investments loeschen
-- ---------------------------------------------------------------------------
--
-- Bisher durfte der zustaendige Partner jedes eigene Investment direkt
-- loeschen, auch ein reserviertes. Damit waeren Reservierung, festgeschriebener
-- Provisionssatz und Unterschriften weg gewesen. Jetzt:
--   - direkt (Regel auf der Tabelle): nur Admin und Inhaber
--   - investment_loeschen: Admin und Inhaber immer; wer das Investment
--     bearbeiten darf, solange es vor der Reservierung steht und keine
--     unterschriebene Reservierung hat. Hier wird abgebrochen statt still
--     nichts zu tun: Sonst meldete die Oberflaeche "geloescht", und beim
--     naechsten Laden waere das Investment wieder da.

CREATE OR REPLACE FUNCTION public.investment_loeschen(_investment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _inv public.investments%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _inv FROM public.investments WHERE id = _investment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT public.is_admin_role(_uid) THEN
    IF NOT (public.is_internal_role(_uid) AND public.ist_eigenes_investment(_uid, _inv.kunde_id)) THEN
      RAISE EXCEPTION 'Dieses Investment darfst du nicht löschen.' USING ERRCODE = '42501';
    END IF;
    IF public.pipelinestufe_ist_kaufphase(_inv.meta ->> 'pipelineStufe')
       OR coalesce(_inv.meta ->> 'rvSigned', '') = 'true' THEN
      RAISE EXCEPTION 'Ab der Reservierung löschen nur Admin und Inhaber ein Investment. Bitte gib der Verwaltung Bescheid.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM public.investments WHERE id = _investment_id;
END;
$$;

COMMENT ON FUNCTION public.investment_loeschen(uuid) IS
  'Loescht ein Investment. Admin und Inhaber immer, der zustaendige Partner '
  'nur vor der Reservierung.';

DROP POLICY IF EXISTS "Admins und zustaendige VP loeschen Investments" ON public.investments;
DROP POLICY IF EXISTS "Admin und Inhaber loeschen Investments" ON public.investments;
CREATE POLICY "Admin und Inhaber loeschen Investments"
ON public.investments
FOR DELETE
TO authenticated
USING ((SELECT public.is_admin_role(auth.uid())));

-- ---------------------------------------------------------------------------
-- 3) kontakte: Zuordnung, die ueber eigen oder zugewiesen entscheidet
-- ---------------------------------------------------------------------------
--
-- provisionssatz_ermitteln (20260929140000) nimmt "eigen" (hoeherer Satz),
-- wenn kein setter eingetragen ist und erstelltVonId, notfalls der Name
-- erstelltVonName gegen die Spalte berater, auf den Partner zeigt. Ein
-- Partner haette bei einem zugewiesenen Lead ohne erstelltVonId den Namen
-- auf sich setzen oder den setter entfernen koennen. kontaktTyp steuert die
-- Anzeige eigen/zugewiesen.
--
-- Nur UPDATE: Beim Anlegen traegt der Anlegende sich selbst ein, das
-- regelt fuer erstelltVonId und setterId bereits trg_kontakt_zuordnung (nur
-- die eigene Kennung oder die des Zustaendigen).
--
-- berater ist der Anzeigename des Zustaendigen. Er aendert sich mit der
-- Zustaendigkeit (Weitergeben, Zuweisen, Rueckgabe an die Zentrale,
-- Wiederherstellen), deren Regeln trg_kontakt_zustaendigkeit_schuetzen
-- durchsetzt. Ohne Wechsel der Zustaendigkeit bleibt er stehen.
--
-- Geprueft wird ueber auth.uid() wie bei trg_kontakt_zuordnung, damit auch
-- merge_kontakt_meta (SECURITY DEFINER) erfasst ist. Der Name des Triggers
-- sortiert ihn direkt hinter trg_kontakt_zuordnung.

CREATE OR REPLACE FUNCTION public.kontakt_zuordnung_namen_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _schluessel constant text[] := ARRAY['setter', 'erstelltVonName', 'kontaktTyp'];
  _k text;
  _alt jsonb := '{}'::jsonb;
  _neu jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin_role(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.berater IS DISTINCT FROM OLD.berater
     AND NEW.zustaendig_id IS NOT DISTINCT FROM OLD.zustaendig_id THEN
    NEW.berater := OLD.berater;
  END IF;

  IF jsonb_typeof(OLD.meta) = 'object' THEN
    _alt := OLD.meta;
  END IF;

  IF NEW.meta IS NULL OR jsonb_typeof(NEW.meta) <> 'object' THEN
    IF _alt ?| _schluessel THEN
      NEW.meta := OLD.meta;
    END IF;
    RETURN NEW;
  END IF;

  _neu := NEW.meta;
  FOREACH _k IN ARRAY _schluessel LOOP
    CONTINUE WHEN nullif(_alt ->> _k, '') IS NOT DISTINCT FROM nullif(_neu ->> _k, '');
    IF _alt ? _k THEN
      _neu := jsonb_set(_neu, ARRAY[_k], _alt -> _k, true);
    ELSE
      _neu := _neu - _k;
    END IF;
  END LOOP;
  NEW.meta := _neu;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.kontakt_zuordnung_namen_schuetzen() IS
  'setter, erstelltVonName, kontaktTyp und berater (ohne Zustaendigkeitswechsel) '
  'aendern nur Admin, Inhaber und der Server; sonst bleibt der alte Wert.';

DROP TRIGGER IF EXISTS trg_kontakt_zuordnung_namen ON public.kontakte;
CREATE TRIGGER trg_kontakt_zuordnung_namen
BEFORE UPDATE OF meta, berater ON public.kontakte
FOR EACH ROW
EXECUTE FUNCTION public.kontakt_zuordnung_namen_schuetzen();

-- Endgueltig loeschen: Admin, Inhaber, Vertriebsleitung (Christians
-- Entscheidung vom 26.09.2026, dieselbe Liste wie dsgvo-hard-delete und
-- darfEndgueltigLoeschen im Frontend). Alle anderen verschieben in den
-- Papierkorb (UPDATE geloescht) oder beantragen die Loeschung.

DROP POLICY IF EXISTS "Admin und interne Rollen loeschen Kontakte" ON public.kontakte;
DROP POLICY IF EXISTS "Vertriebspartner loeschen eigene Kontakte" ON public.kontakte;
DROP POLICY IF EXISTS "Endgueltig loeschen Admin Inhaber Vertriebsleitung" ON public.kontakte;
CREATE POLICY "Endgueltig loeschen Admin Inhaber Vertriebsleitung"
ON public.kontakte
FOR DELETE
TO authenticated
USING (
  (SELECT public.is_admin_role(auth.uid()))
  OR (SELECT public.has_role(auth.uid(), 'vertriebsleiter'::public.app_role))
);

-- ---------------------------------------------------------------------------
-- 4) tippgeber
-- ---------------------------------------------------------------------------
--
-- Bisher durfte jede interne Rolle jeden Tippgeber aendern, auch
-- provisionswert und benutzer_id (damit liesse sich ein Portalkonto an einen
-- fremden Tippgeber haengen). Die Oberflaeche aendert Tippgeber nie direkt,
-- das Portalkonto verknuepft invite-user mit dem Dienstschluessel.
-- Anlegen bleibt fuer Mitarbeiter moeglich, aber nur mit sich selbst als
-- zugeordnetem Partner und ohne Portalkonto.

DROP POLICY IF EXISTS "Interne bearbeiten Tippgeber" ON public.tippgeber;
DROP POLICY IF EXISTS "Admin und Inhaber bearbeiten Tippgeber" ON public.tippgeber;
CREATE POLICY "Admin und Inhaber bearbeiten Tippgeber"
ON public.tippgeber
FOR UPDATE
TO authenticated
USING ((SELECT public.is_admin_role(auth.uid())))
WITH CHECK ((SELECT public.is_admin_role(auth.uid())));

DROP POLICY IF EXISTS "Interne erstellen Tippgeber" ON public.tippgeber;
DROP POLICY IF EXISTS "Interne erstellen eigene Tippgeber" ON public.tippgeber;
CREATE POLICY "Interne erstellen eigene Tippgeber"
ON public.tippgeber
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.is_admin_role(auth.uid()))
  OR (
    (SELECT public.is_internal_role(auth.uid()))
    AND zugeordnet_id = auth.uid()
    AND benutzer_id IS NULL
    AND NOT coalesce(portal_aktiv, false)
  )
);

-- ---------------------------------------------------------------------------
-- 5) empfehlungen
-- ---------------------------------------------------------------------------
--
-- provision ist die Praemie fuer den Empfehlenden. Die Empfehlungsseite traegt
-- beim Anlegen 500 ein, das Kundenportal nichts (0). Mehr als diese
-- Standardpraemie setzen nur Admin und Inhaber, aendern ebenso. Die Marke
-- praemieStatus = 'ausgezahlt' setzt und nimmt nur Admin und Inhaber; die
-- Automatik "berechtigt" beim Abschluss laeuft weiter.

CREATE OR REPLACE FUNCTION public.empfehlungen_praemie_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _standardpraemie constant numeric := 500;
  _alt_status text;
  _neu_status text;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin_role(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.provision := least(greatest(coalesce(NEW.provision, 0), 0), _standardpraemie);
    IF jsonb_typeof(NEW.meta) = 'object' AND NEW.meta ->> 'praemieStatus' = 'ausgezahlt' THEN
      NEW.meta := jsonb_set(NEW.meta, '{praemieStatus}', '"ausstehend"'::jsonb);
    END IF;
    RETURN NEW;
  END IF;

  NEW.provision := OLD.provision;

  _alt_status := CASE WHEN jsonb_typeof(OLD.meta) = 'object' THEN OLD.meta ->> 'praemieStatus' END;
  _neu_status := CASE WHEN jsonb_typeof(NEW.meta) = 'object' THEN NEW.meta ->> 'praemieStatus' END;
  IF 'ausgezahlt' IN (coalesce(_alt_status, ''), coalesce(_neu_status, ''))
     AND _alt_status IS DISTINCT FROM _neu_status THEN
    IF jsonb_typeof(NEW.meta) <> 'object' THEN
      NEW.meta := OLD.meta;
    ELSIF _alt_status IS NULL THEN
      NEW.meta := NEW.meta - 'praemieStatus';
    ELSE
      NEW.meta := jsonb_set(NEW.meta, '{praemieStatus}', to_jsonb(_alt_status));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.empfehlungen_praemie_schuetzen() IS
  'Praemie (provision) und Auszahlungsmarke an Empfehlungen aendern nur Admin, '
  'Inhaber und der Server; beim Anlegen hoechstens die Standardpraemie 500.';

DROP TRIGGER IF EXISTS trg_absicherung_empfehlungen ON public.empfehlungen;
CREATE TRIGGER trg_absicherung_empfehlungen
BEFORE INSERT OR UPDATE ON public.empfehlungen
FOR EACH ROW
EXECUTE FUNCTION public.empfehlungen_praemie_schuetzen();

-- Anlegen: Wer alle Kunden sieht, wie bisher. Ein Partner nur fuer einen
-- eigenen Kunden als Empfehlenden und mit sich selbst als Anleger
-- (Empfehlungen.tsx setzt beides). Kunden legen weiter ueber ihre eigene
-- Regel oder create_empfehlung_kontakt an.

DROP POLICY IF EXISTS "Interne erstellen Empfehlungen" ON public.empfehlungen;
DROP POLICY IF EXISTS "Interne erstellen Empfehlungen im eigenen Bereich" ON public.empfehlungen;
CREATE POLICY "Interne erstellen Empfehlungen im eigenen Bereich"
ON public.empfehlungen
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.is_internal_role(auth.uid()))
  AND (
    (SELECT public.darf_alle_kunden_sehen(auth.uid()))
    OR (
      benutzer_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.kontakte k
         WHERE k.id::text = (empfehlungen.meta ->> 'empfehlenderKundeId')
           AND public.is_vp_owner_of_kontakt(auth.uid(), k.zustaendig_id, k.meta)
      )
    )
  )
);

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
--
-- Die drei Wege sind fuer Angemeldete, sie pruefen selbst. Der Waechter auf
-- investments ist SECURITY INVOKER und ruft investment_geschuetzte_schluessel
-- und is_admin_role als authenticated auf, deshalb brauchen die das
-- Ausfuehrungsrecht; die beiden Hilfsfunktionen rechnen nur auf ihrer Eingabe.

REVOKE ALL ON FUNCTION public.investment_sa_pdf_vermerken(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.investment_sa_pdf_vermerken(uuid, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.investment_abwicklung_speichern(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.investment_abwicklung_speichern(uuid, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.investment_loeschen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.investment_loeschen(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.investment_geschuetzte_schluessel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.investment_geschuetzte_schluessel() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.investment_wert_leer(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.investment_wert_leer(jsonb) TO authenticated, service_role;

-- Triggerfunktionen ruft Postgres ohne Rechtepruefung auf; niemand soll sie
-- direkt aufrufen.
REVOKE ALL ON FUNCTION public.investments_absicherung() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kontakt_zuordnung_namen_schuetzen() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.empfehlungen_praemie_schuetzen() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Nachsehen (aendert nichts): Pruefzeilen 51.1 bis 51.10 in
-- supabase/migrations-inbox/99_PRUEFUNG.sql.
