-- Beispielkunde Max Mustermann mit komplett befülltem Investment (Christian, 16.10.2026).
--
-- Erfundene Daten, damit sichtbar ist, wie ein Vorgang aussieht, wenn alles
-- vorliegt: Selbstauskunft ausgefüllt und unterschrieben, Objekt gewählt,
-- Reservierung unterschrieben (kostenfrei), Finanzierungsangebot, Notar und
-- Kaufpreisfälligkeit. Quelle der Werte ist src/lib/beispielkunde.ts, dieselben
-- Zahlen zeigt die lokale Vorschau /vorschau/kunde-komplett.
--
-- Kennzeichen: kontakte.meta.beispiel = true, investments.meta.beispiel = true.
-- Entfernen: in „Alle Kontakte“ Max Mustermann löschen. Das Investment geht mit
-- (trg_cascade_delete_investments). Die Finanzierungszeile bleibt dabei stehen,
-- wie heute bei jedem Kunden. Sie hat eine feste Kennung und lässt sich mit
--   DELETE FROM public.finanzierungen WHERE id = 'b7e5a1c0-0000-4000-8000-00000000f001';
-- entfernt werden.
--
-- Die PDF-Namen (Selbstauskunft, Reservierung, Kaufvertragsentwurf) sind nur
-- Platzhalter, es liegen keine Dateien dahinter.
--
-- Wiederholbar: Gibt es den Kontakt schon (feste Kennung), passiert nichts.

DO $$
DECLARE
  _kontakt uuid := 'b7e5a1c0-0000-4000-8000-000000000001';
  _zustaendig uuid;
  _berater text;
  _investment uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.kontakte WHERE id = _kontakt) THEN
    RETURN;
  END IF;

  -- Zuständig: der Inhaber, sonst ein Admin.
  SELECT ur.user_id, p.name
    INTO _zustaendig, _berater
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id = ur.user_id
   WHERE ur.role::text IN ('inhaber', 'admin')
   ORDER BY (ur.role::text = 'inhaber') DESC
   LIMIT 1;

  INSERT INTO public.kontakte (id, anrede, vorname, nachname, email, telefon, strasse, hausnummer, plz, ort,
                               status, quelle, zustaendig_id, berater, notizen, meta)
  VALUES (_kontakt, 'Herr', 'Max', 'Mustermann', 'max.mustermann@example.com', '+49 30 0000000',
          'Beispielweg', '1', '10115', 'Berlin', 'kunde', 'Beispiel', _zustaendig, _berater,
          'Beispielkunde mit erfundenen Daten, kein echter Kunde. Kann jederzeit gelöscht werden.',
          jsonb_build_object('beispiel', true, 'pipelineStufe', 'faelligkeit'));

  -- Investment 1 legt der Trigger trg_auto_create_investment an; hier wird es befüllt.
  SELECT id INTO _investment FROM public.investments WHERE kunde_id = _kontakt ORDER BY erstellt_am LIMIT 1;
  IF _investment IS NULL THEN
    INSERT INTO public.investments (kunde_id, meta) VALUES (_kontakt, '{}'::jsonb) RETURNING id INTO _investment;
  END IF;

  UPDATE public.investments
     SET kaufpreis = 249000,
         meta = $json${"beispiel":true,"nummer":1,"label":"Investment 1","pipelineStufe":"faelligkeit","saData":{"wuenscheZiele":["vermoegen","rente","steuer"],"person2":true,"anrede":"Herr","vorname":"Max","nachname":"Mustermann","geburtsdatum":"1986-04-12","steuerId":"","strasse":"Beispielweg","hausnummer":"1","plz":"10115","ort":"Berlin","telefon":"+49 30 0000000","email":"max.mustermann@example.com","familienstand":"verheiratet","wohnhaftSeit":"2018","kinder":[{"name":"Mia Mustermann","geburtsdatum":"2017-09-01","imHaushalt":true}],"beschaeftigungsart":"angestellt","anstellung":{"branche":"IT","firma":"Beispiel GmbH","berufsbezeichnung":"Projektleiter","angestelltSeit":"2015-01-01","probezeit":"nein"},"bankkonten":[{"konto":"Girokonto","institut":"Beispielbank","iban":""}],"einkommen":{"netto":"3.850,50","gewerbe":"","miet":"650","zinsen":"12,34","rente":"","kindergeld":"255","sonstige":"200"},"bruttoJahr":"72.000","monatsgehaelter":"13","arbeitsvertragArt":"unbefristet","steuerklasse":"3","mietart":"Zur Miete","mieteWarm":"950","lebenshaltungskosten":"700","privateKV":"0","sonstigeAusgaben":"80","sonstigeAusgabenWofuer":"Kita","nebenkosten":"210","unterhalt":"0","kfzAnzahl":"1","kfzKosten":"180","versBU":"65","versRiester":"","versAV":"100","versWeitere":"45,50","kredite":[{"art":"VW Bank","kategorie":"kfz_finanzierung","rate":"249","restschuld":"8.400","laufzeitEnde":"2028-06-30","bank":"VW Bank GmbH"},{"art":"Wohnung Leipzig","kategorie":"immobilienkredit","rate":"610","restschuld":"142.000","laufzeitEnde":"2048-12-31","bank":"Beispielbank","immobilie":"0"}],"vermoegenswerte":[{"art":"Bank- & Sparguthaben","institut":"Beispielbank","betrag":"45.000"},{"art":"Wertpapiere","institut":"Depot","betrag":"18.500"}],"buergschaften":[{"art":"Mietbürgschaft Tochter","betrag":"3.000"}],"immobilien":[{"eigentuemer":"Max Mustermann","art":"ETW","adresse":"Beispielstraße 5, 04109 Leipzig","baujahr":"1998","grundstueckM2":"","wohnflaecheM2":"62","nutzung":"fremdvermietet","marktwert":"210.000","kaltmieteIst":"650","kaltmieteZukunft":""}],"mahnverfahren":"nein","schufaBekannt":"nein","schufaScore":"","hinweise":"Beispieldaten, kein echter Kunde.","abgeschlossen":true,"person2Data":{"anrede":"Frau","vorname":"Erika","nachname":"Mustermann","geburtsdatum":"1988-02-03","beschaeftigungsart":"angestellt","einkommen":{"netto":"2.400","gewerbe":"","miet":"","zinsen":"","rente":"","kindergeld":"0","sonstige":""},"mietart":"Zur Miete","mieteWarm":"","lebenshaltungskosten":"300","privateKV":"0","sonstigeAusgaben":"","nebenkosten":"","kfzKosten":"","versBU":"40","kredite":[{"art":"Möbel","kategorie":"ratenkredit","rate":"120","restschuld":"2.100","laufzeitEnde":"2027-12-31"}],"vermoegenswerte":[{"art":"Bank- & Sparguthaben","institut":"Tagesgeld","betrag":"12.000"}],"buergschaften":[],"mahnverfahren":"nein","schufaBekannt":"nein","schufaScore":""}},"saSigned":true,"saSignedAt":"2026-08-05T10:00:00Z","saPdf":"Selbstauskunft_Mustermann_Beispiel.pdf","saPdfPath":"beispiel/selbstauskunft.pdf","docStatuses":{"Personalausweis":"approved","Letzter Gehaltsnachweis":"approved"},"objektTitel":"Beispielobjekt (fiktiv), Musterallee 12, 04109 Leipzig","weNr":"5","kaufpreis":249000,"rvVirtualWohnung":{"objAdresse":"Musterallee 12","objPlz":"04109","objOrt":"Leipzig","weNr":"5","kaufpreis":249000,"groesse":62,"objektart":"neubau","miete":760,"hausgeld":240,"zimmer":2,"etage":"2. OG","baujahr":2024},"hausgeldMonat":240,"hausgeldNichtUmlage":70,"grundstueckAnteil":18,"objektVerkaeufer":{"art":"firma","name":"Bauträger Beispiel GmbH","strasse":"Musterallee 1","plz":"04109","ort":"Leipzig","email":"verkauf@example.com","telefon":"+49 341 1111111","handelsregister":"HRB 00000 (fiktiv)"},"objektGrundbuch":{"amtsgericht":"Leipzig","gemarkung":"Beispielgemarkung","blatt":"0000","flurstueck":"0/0","miteigentumsanteil":45,"wohnungsnummer":"5"},"rvData":{"vorname":"Max","nachname":"Mustermann","objAdresse":"Musterallee 12","objPlz":"04109","objOrt":"Leipzig","weNr":"5","kaufpreis":249000,"reservierungsgebuehr":0,"kostenfrei":true},"rvPdf":"Reservierung_Mustermann_Beispiel.pdf","rvSigned":true,"rvSignedAt":"2026-08-10T10:00:00Z","rvUnterschriftVerarbeitetAm":"2026-08-10T10:00:00Z","finanzierungsStatus":"bestaetigt","finanzierungsBank":"Beispielbank AG (fiktiv)","notarData":{"datum":"2026-10-01","uhrzeit":"10:00","name":"Notarin Dr. Beispiel (fiktiv)","adresse":"Am Markt 1, 04109 Leipzig","telefon":"+49 341 0000000","vertretung":"Bauträger Beispiel GmbH"},"notarTermin":"2026-10-01","notarUhrzeit":"10:00","notarName":"Notarin Dr. Beispiel (fiktiv)","notarAdresse":"Am Markt 1, 04109 Leipzig","notarTelefon":"+49 341 0000000","notarTerminModus":"gesetzt","notarEmail":"notarin@example.com","notarGesendet":true,"notarGesendetAt":"2026-09-10T10:00:00Z","notarterminEingetragenAt":"2026-09-08T10:00:00Z","kaufvertragData":{"vk_art":"firma","vk_name":"Bauträger Beispiel GmbH","k_vorname":"Max","k_name":"Mustermann","obj_adresse":"Musterallee 12, 04109 Leipzig","we_nr":"5","kaufpreis":"249000"},"kaufvertragPdf":"Kaufvertragsentwurf_Beispiel.pdf","kaufvertragUpdatedAt":"2026-09-12T10:00:00Z","abwicklung":{"kaufpreisfaelligkeitDatum":"2026-10-20","grundbuchDatum":"2026-10-25","uebergabeDatum":"2026-11-01"}}$json$::jsonb
   WHERE id = _investment;

  INSERT INTO public.finanzierungen (id, kunde_id, angebote)
  VALUES ('b7e5a1c0-0000-4000-8000-00000000f001', _investment::text,
          $json$[{"id":"beispiel-angebot-1","label":"Angebot 1","bank":"Beispielbank AG (fiktiv)","summe":224000,"zins":"3,4","tilgung":"2","laufzeit":"10","anmerkungen":"Zinsbindung 10 Jahre, 5 % Sondertilgung p. a.","gesendet":true,"akzeptiert":true,"bankFinal":true,"dokumente":[{"id":"beispiel-dok-1","name":"Finanzierungsangebot","status":"signed","isDefault":true}]}]$json$::jsonb)
  ON CONFLICT (id) DO NOTHING;
END $$;
