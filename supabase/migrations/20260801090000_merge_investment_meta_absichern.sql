-- merge_investment_meta: Schluessel-Positivliste fuer nicht-interne Aufrufer
--
-- Befund: Die RPC public.merge_investment_meta (definiert in Migration
-- 20260522125029) laeuft als SECURITY DEFINER. EXECUTE ist an "authenticated"
-- vergeben, fuer anon und public ist es entzogen (20260525080225,
-- 20260601141419). Die Funktion prueft zwar die Eigentuemerschaft (interne
-- Rolle ODER meta->>'authUserId' des zugehoerigen Kontakts ODER
-- person2.authUserId), aber sie schraenkt NICHT ein, WELCHE Schluessel
-- geschrieben werden duerfen.
--
-- In investments.meta liegen unter anderem saSigned, saSignedAt, saSignatures,
-- saSignaturePending, saSignaturePartial, saEditStatus, saData, dokumente und
-- direktAbschluss. Ein eingeloggter Kunde konnte damit am EIGENEN Investment
-- die Selbstauskunft als unterschrieben markieren, den Inhalt der
-- Selbstauskunft nachtraeglich aendern oder Dokumentenfreigaben verschieben.
-- Die Tabelle investments hat fuer Kunden nur eine SELECT-Policy
-- (20260517094425), der Schreibweg lief also ausschliesslich ueber diese RPC.
--
-- Diese Migration ersetzt die Funktion nach dem Muster von
-- 20260731090200_merge_kontakt_meta_absichern.sql. Name, Signatur und
-- Rueckgabetyp bleiben unveraendert, die GRANTs werden nicht angefasst. Der
-- bestehende Eigentuemer-Check bleibt erhalten, ergaenzt wird nur eine zweite
-- Stufe:
--
-- 1. Service-Role: Aufrufe ohne auth.uid() gelten als intern. Das ist
--    eindeutig, weil EXECUTE fuer anon und public widerrufen ist und ein
--    authenticated-JWT immer eine User-ID traegt. Bisher waeren solche Aufrufe
--    an der Eigentuemerpruefung gescheitert; heute ruft keine Edge Function
--    diese RPC auf, kuenftige laufen damit unveraendert weiter.
--
-- 2. Positivliste fuer nicht-interne Aufrufer. Interne Rollen und die
--    Service-Role behalten den vollen Merge. Ein Kunde darf an seinem EIGENEN
--    Investment nur noch die Felder setzen, die das Portal wirklich schreibt:
--      marktwertHistorie   src/components/kunde/eigene/MarktwertCard.tsx:49,
--                          gerendert in src/pages/KundeSteuerCockpit.tsx:396
--                          (Route /kunde/steuer-cockpit, fuer die Rolle kunde
--                          freigegeben in src/lib/sidebarPermissions.ts:33).
--                          Der Kunde traegt dort eine eigene Marktwert-
--                          Schaetzung seiner Immobilie ein.
--      steuerCockpit       src/components/kunde/eigene/SteuerCockpitEigen.tsx:70,
--                          gereicht ueber onPersist in
--                          src/components/kunde/MoreImmoInvestCards.tsx:118.
--                          Eigene Steuer-Annahmen des Kunden (Anlage V).
--                          Hinweis: MoreImmoInvestCards ist derzeit in keiner
--                          Seite eingebunden, der Schluessel ist also aktuell
--                          nicht erreichbar. Er steht vorsorglich in der Liste,
--                          weil die Karte zum Kundenportal gehoert und sonst
--                          beim Wiedereinbinden still nichts mehr speichern
--                          wuerde.
--    Alle anderen Schluessel werden verworfen und im Serverlog vermerkt.
--
-- Bewusst NICHT in der Positivliste:
--   notarTerminBestaetigt   src/components/kunde/NotarterminAuswahlCard.tsx:70
--     Die Karte schreibt den bestaetigten Notartermin bereits ueber die eigene
--     RPC confirm_notar_termin (20260517094425), die den Termin gegen die
--     freigegebenen Vorschlaege prueft. Der Aufruf von
--     setNotarTerminBestaetigt() danach zieht nur den lokalen Cache nach und
--     schreibt denselben Wert ein zweites Mal. Dieser zweite Schreibvorgang
--     wird jetzt verworfen, der Termin steht durch confirm_notar_termin aber
--     schon in der Datenbank. Wuerde man den Schluessel freigeben, koennte ein
--     Kunde die Pruefung in confirm_notar_termin umgehen und einen beliebigen
--     Termin eintragen.
--
-- Alle uebrigen Schreibwege in investments.meta laufen ueber interne Seiten
-- (KundenDetail, Kundenprofilseite, Pipeline, SelbstauskunftPage,
-- ReservierungsForm, EigenfinanzierungSection, SetterErstgespraechsSkript)
-- oder ueber eigene RPCs und Edge Functions (register_unterlage_upload,
-- confirm_notar_termin, update_sa_fill_token_data, update-sa-signature-data,
-- finalize-selbstauskunft, finalize-vertrag). Sie sind nicht betroffen.
--
-- Die Positivliste ist bewusst als Liste am Anfang der Funktion gehalten,
-- damit neue Portal-Felder dort ergaenzt werden koennen.

CREATE OR REPLACE FUNCTION public.merge_investment_meta(_investment_id uuid, _updates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  -- Schluessel, die ein Kunde an seinem eigenen Investment setzen darf
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
  -- Berechtigungs-Check: Caller muss internal sein ODER Eigentümer des Kontakts
  SELECT kunde_id, meta INTO _kunde_id, _inv_meta
  FROM public.investments WHERE id = _investment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investment not found';
  END IF;

  SELECT meta INTO _kontakt_meta FROM public.kontakte WHERE id = _kunde_id;

  -- auth.uid() IS NULL = Service-Role, anon hat kein EXECUTE
  _ist_intern := auth.uid() IS NULL OR public.is_internal_role(auth.uid());

  IF NOT (
    _ist_intern
    OR (_kontakt_meta ->> 'authUserId') = auth.uid()::text
    OR ((_kontakt_meta -> 'person2') ->> 'authUserId') = auth.uid()::text
  ) THEN
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

    IF array_length(_verworfen, 1) > 0 THEN
      RAISE LOG 'merge_investment_meta: nicht erlaubte Schluessel verworfen (%)',
        array_to_string(_verworfen, ', ');
    END IF;
  END IF;

  -- Nichts Erlaubtes uebrig: unveraenderten Stand zurueckgeben, nicht schreiben
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
