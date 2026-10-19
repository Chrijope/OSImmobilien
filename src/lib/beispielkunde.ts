/**
 * Der Beispielkunde „Max Mustermann“ (Christian, 16.10.2026).
 *
 * Zeigt, wie ein Vorgang aussieht, wenn alles vorliegt. Alle Angaben sind
 * erfunden. Die Selbstauskunft ist absichtlich vollständig und mit krummen
 * Beträgen gefüllt, damit der Test `beispielkunde.test.ts` jede Position
 * einzeln gegen die Anzeige im Investment prüfen kann.
 */
import type { SelbstauskunftData } from "@/components/selbstauskunft/SelbstauskunftForm";

// Nur der Typ: Die Formular-Komponente selbst zieht Supabase nach.
export const BEISPIEL_SA = {
  wuenscheZiele: ["vermoegen", "rente", "steuer"],
  person2: true,
  anrede: "Herr", vorname: "Max", nachname: "Mustermann",
  geburtsdatum: "1986-04-12", steuerId: "",
  strasse: "Beispielweg", hausnummer: "1", plz: "10115", ort: "Berlin",
  telefon: "+49 30 0000000", email: "max.mustermann@example.com",
  familienstand: "verheiratet", wohnhaftSeit: "2018",
  kinder: [{ name: "Mia Mustermann", geburtsdatum: "2017-09-01", imHaushalt: true }],
  beschaeftigungsart: "angestellt",
  anstellung: { branche: "IT", firma: "Beispiel GmbH", berufsbezeichnung: "Projektleiter", angestelltSeit: "2015-01-01", probezeit: "nein" },
  bankkonten: [{ konto: "Girokonto", institut: "Beispielbank", iban: "" }],
  einkommen: { netto: "3.850,50", gewerbe: "", miet: "650", zinsen: "12,34", rente: "", kindergeld: "255", sonstige: "200" },
  bruttoJahr: "72.000", monatsgehaelter: "13", arbeitsvertragArt: "unbefristet", steuerklasse: "3",
  mietart: "Zur Miete", mieteWarm: "950",
  // Unter dem Bankansatz (30 % von 3.850,50 = 1.155), damit der Unterschied sichtbar ist.
  lebenshaltungskosten: "700",
  privateKV: "0",
  sonstigeAusgaben: "80", sonstigeAusgabenWofuer: "Kita",
  nebenkosten: "210", unterhalt: "0", kfzAnzahl: "1", kfzKosten: "180",
  versBU: "65", versRiester: "", versAV: "100", versWeitere: "45,50",
  kredite: [
    { art: "VW Bank", kategorie: "kfz_finanzierung", rate: "249", restschuld: "8.400", laufzeitEnde: "2028-06-30", bank: "VW Bank GmbH" },
    { art: "Wohnung Leipzig", kategorie: "immobilienkredit", rate: "610", restschuld: "142.000", laufzeitEnde: "2048-12-31", bank: "Beispielbank", immobilie: "0" },
  ],
  vermoegenswerte: [
    { art: "Bank- & Sparguthaben", institut: "Beispielbank", betrag: "45.000" },
    { art: "Wertpapiere", institut: "Depot", betrag: "18.500" },
  ],
  // Verbürgte Gesamtsumme, keine Monatsrate.
  buergschaften: [{ art: "Mietbürgschaft Tochter", betrag: "3.000" }],
  immobilien: [{
    eigentuemer: "Max Mustermann", art: "ETW", adresse: "Beispielstraße 5, 04109 Leipzig", baujahr: "1998",
    grundstueckM2: "", wohnflaecheM2: "62", nutzung: "fremdvermietet", marktwert: "210.000", kaltmieteIst: "650", kaltmieteZukunft: "",
  }],
  mahnverfahren: "nein", schufaBekannt: "nein", schufaScore: "",
  hinweise: "Beispieldaten, kein echter Kunde.",
  abgeschlossen: true,
  person2Data: {
    anrede: "Frau", vorname: "Erika", nachname: "Mustermann",
    geburtsdatum: "1988-02-03",
    beschaeftigungsart: "angestellt",
    einkommen: { netto: "2.400", gewerbe: "", miet: "", zinsen: "", rente: "", kindergeld: "0", sonstige: "" },
    mietart: "Zur Miete", mieteWarm: "",
    lebenshaltungskosten: "300", privateKV: "0", sonstigeAusgaben: "",
    nebenkosten: "", kfzKosten: "", versBU: "40",
    kredite: [{ art: "Möbel", kategorie: "ratenkredit", rate: "120", restschuld: "2.100", laufzeitEnde: "2027-12-31" }],
    vermoegenswerte: [{ art: "Bank- & Sparguthaben", institut: "Tagesgeld", betrag: "12.000" }],
    buergschaften: [],
    mahnverfahren: "nein", schufaBekannt: "nein", schufaScore: "",
  },
} satisfies Partial<Omit<SelbstauskunftData, "person2Data">> & { person2Data: Partial<SelbstauskunftData["person2Data"]> };

/**
 * Erfundene Unterschriften (gezeichneter Linienzug, kein echter Namenszug),
 * damit die Selbstauskunft des Beispielkunden als unterschrieben erscheint.
 */
const BEISPIEL_UNTERSCHRIFT_MAX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAABICAYAAADIzHiKAAACEUlEQVR42u3dOXLDMBBFQR1CsU/i+18Lzp2oWMIyf9BBx5QIPJLiptf75/cFZLISQMCAgAEBg4ABAQMCBgQMAgYEDAgYBAwIGBAwIGAQMCBgQMCAgEHAgIABAf8zPjD4CDgwXCEj4CbxpoZs45QxrwQ8aSV3Oay+YeOUugM4NgadV/w3sXebWALdF+vWsbgt3rSQn04GIa+NddbyBDxp5VSd7N9OgNsjrrKXXL6Mm+OtOtlnfp6bIq7882LZ8m+Pt9pkX/EZOkecdC5gyefqMmjVNw6nl90x4tSTd1M/q3hrTPYdy+wScYez7lcGvHOgxuGNxQj/Xm6Pff59BBw22UfjvX36hu7E92odcLffpacnY0oMrms3DTj5zHCVyZh8E4u7yYICrjzZR/iErBqIeJsEnDDZR/hhYId1LGCHzlMvYaQ9ZNDlKEfAJlXUvbZd1rd4LwjYrXw9IxbuhoArXL5xnbJXTPa6TQM2oP0jFu/BgIdD56ufpxWvgO19L4xYuIUCHuIVsdshs85CC1jITyL0sr3iAQ/xivjtLZlR14F3vTHC4PQM2forcCPHjrOSBqdXyNZX4YCHeCHrVspVrzw1KBAQsEMtOPwww+y/njAgsPlppFkPtxsMOPQ44bd/vGUgoGDALi9A0AP94oXwN3KIF4ID9nsXGgQMCBgQMAgYEDAgYEDAIGBAwICAQcBAgD8khSLMrs9KogAAAABJRU5ErkJggg==";
const BEISPIEL_UNTERSCHRIFT_ERIKA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAABICAYAAADIzHiKAAABkElEQVR42u3bu3XDMBREQRXh2JW4/7boDhzIgLCLN8GEPqIBXH4g6vX1/fMCOhkEEDAgYEDAIGBAwICAAQGDgAEBAwIGAQMCBgQMCBgEDAgYEDAgYBAwIGBAwCBgQMCAgAEBg4CZ4XmDcRMwZdFODzlmnCzg/0+YeO8P+UkdK3GGn2EP/n87/356uMvGSqzzrkYrj/fGiHfM8ba1kjRITRPWGPHO45xyV/Js/JzYgFOvYhVn2LJn+MaIT81ddMCpD/2f+Jy0RXx6YbbekVTcObQ+9K++Oq6esJSFcfLzE8O4bic9dWASTwRNizhlcaafyOo33RomqS3a00G1XfncJh8KOH3zqWkj6Rnw7PnJ4xvzwsnUrwxu2xFumo/nwBhcuz6d0boXceucrIpt/Lvarrp9X2XctFibNyivCFiEeYvYGPg54Z8DLLpZb6y1jIPfAzPuvVwEDAgYEDAIGBAwIGBAwCBgQMCAgEHABgEEDAgYEDAIGBAwIGBAwCBgQMCAgEHAgIABAQMCBgEDAgZW+wWwXW5yWdQEcwAAAABJRU5ErkJggg==";

/*
 * Kennungen bewusst NICHT im UUID-Format: Jede Datenbankabfrage oder
 * -änderung mit diesen Kennungen scheitert sofort (Postgres 22P02), kann also
 * nie einen echten Datensatz treffen, und der Abgleich im Kundenprofil lässt
 * den Zwischenspeicher dann stehen.
 */
export const BEISPIEL_KONTAKT_ID = "beispiel-max-mustermann";
export const BEISPIEL_INVESTMENT_ID = "beispiel-investment-1";
export const BEISPIEL_FINANZIERUNGSPARTNER_ID = "beispiel-finanzierungspartner";

const OBJEKT = {
  titel: "Beispielobjekt (fiktiv), Musterallee 12, 04109 Leipzig",
  adresse: "Musterallee 12", plz: "04109", ort: "Leipzig", weNr: "5",
  kaufpreis: 249000, groesse: 62,
};

/** Die Zeilen, wie sie aus der Datenbank kämen, für den Zwischenspeicher. */
export function beispielkundeZeilen(eigeneNutzerId: string) {
  const angelegt = "2026-08-01T10:00:00Z";
  const kontakt = {
    id: BEISPIEL_KONTAKT_ID, vorname: "Max", nachname: "Mustermann",
    email: "max.mustermann@example.com", telefon: "+49 30 0000000", status: "kunde",
    archiviert: false, geloescht: false, erstellt_am: angelegt, aktualisiert_am: angelegt,
    zustaendig_id: eigeneNutzerId, berater: "Beispiel Partner", quelle: "Beispiel",
    meta: { pipelineStufe: "faelligkeit", beispiel: true },
  };
  const notar = {
    datum: "2026-10-01", uhrzeit: "10:00", name: "Notarin Dr. Beispiel (fiktiv)",
    adresse: "Am Markt 1, 04109 Leipzig", telefon: "+49 341 0000000", vertretung: "Bauträger Beispiel GmbH",
  };
  const investment = {
    id: BEISPIEL_INVESTMENT_ID, kunde_id: BEISPIEL_KONTAKT_ID, kaufpreis: OBJEKT.kaufpreis, erstellt_am: angelegt,
    meta: {
      beispiel: true, nummer: 1, label: "Investment 1", pipelineStufe: "faelligkeit",
      // Selbstauskunft ausgefüllt und unterschrieben
      saData: BEISPIEL_SA, saSigned: true, saSignedAt: "2026-08-05T10:00:00Z",
      /*
       * Bewusst ohne saPdfPath: Eine abgelegte Datei gibt es fuer den
       * Beispielkunden nicht. Jeder Weg, der die unterschriebene
       * Selbstauskunft oeffnet, erzeugt sie deshalb aus BEISPIEL_SA mit dem
       * aktuellen Generator, samt der erfundenen Unterschriften unten.
       */
      saPdf: "Selbstauskunft_Mustermann_Beispiel.pdf",
      saSignatures: {
        person1: { signatureData: BEISPIEL_UNTERSCHRIFT_MAX, signedAt: "2026-08-05T09:50:00Z", name: "Max Mustermann" },
        person2: { signatureData: BEISPIEL_UNTERSCHRIFT_ERIKA, signedAt: "2026-08-05T10:00:00Z", name: "Erika Mustermann" },
      },
      docStatuses: { "Personalausweis": "approved", "Letzter Gehaltsnachweis": "approved" },
      // Objekt gewählt
      objektTitel: OBJEKT.titel, weNr: OBJEKT.weNr, kaufpreis: OBJEKT.kaufpreis,
      rvVirtualWohnung: {
        objAdresse: OBJEKT.adresse, objPlz: OBJEKT.plz, objOrt: OBJEKT.ort, weNr: OBJEKT.weNr, kaufpreis: OBJEKT.kaufpreis, groesse: OBJEKT.groesse,
        objektart: "neubau", miete: 760, hausgeld: 240, zimmer: 2, etage: "2. OG", baujahr: 2024,
      },
      hausgeldMonat: 240, hausgeldNichtUmlage: 70, grundstueckAnteil: 18,
      objektVerkaeufer: {
        art: "firma", name: "Bauträger Beispiel GmbH", strasse: "Musterallee 1", plz: "04109", ort: "Leipzig",
        email: "verkauf@example.com", telefon: "+49 341 1111111", handelsregister: "HRB 00000 (fiktiv)",
      },
      objektGrundbuch: { amtsgericht: "Leipzig", gemarkung: "Beispielgemarkung", blatt: "0000", flurstueck: "0/0", miteigentumsanteil: 45, wohnungsnummer: "5" },
      // Reservierung ausgefüllt und unterschrieben, kostenfrei
      rvData: {
        vorname: "Max", nachname: "Mustermann", objAdresse: OBJEKT.adresse, objPlz: OBJEKT.plz, objOrt: OBJEKT.ort,
        weNr: OBJEKT.weNr, kaufpreis: OBJEKT.kaufpreis, reservierungsgebuehr: 0, kostenfrei: true,
      },
      rvPdf: "Reservierung_Mustermann_Beispiel.pdf", rvSigned: true, rvSignedAt: "2026-08-10T10:00:00Z",
      rvUnterschriftVerarbeitetAm: "2026-08-10T10:00:00Z",
      // Finanzierung
      finanzierungspartnerIds: [BEISPIEL_FINANZIERUNGSPARTNER_ID],
      finanzierungPartnerMeldungen: [{ userId: BEISPIEL_FINANZIERUNGSPARTNER_ID, am: "2026-08-20T10:00:00Z" }],
      finanzierungsStatus: "bestaetigt", finanzierungsBank: "Beispielbank AG (fiktiv)",
      // Notar
      notarData: notar, notarTermin: notar.datum, notarUhrzeit: notar.uhrzeit, notarName: notar.name,
      notarAdresse: notar.adresse, notarTelefon: notar.telefon, notarTerminModus: "gesetzt",
      notarEmail: "notarin@example.com", notarGesendet: true, notarGesendetAt: "2026-09-10T10:00:00Z",
      notarterminEingetragenAt: "2026-09-08T10:00:00Z",
      kaufvertragData: {
        vk_art: "firma", vk_name: "Bauträger Beispiel GmbH", k_vorname: "Max", k_name: "Mustermann",
        obj_adresse: `${OBJEKT.adresse}, ${OBJEKT.plz} ${OBJEKT.ort}`, we_nr: OBJEKT.weNr, kaufpreis: String(OBJEKT.kaufpreis),
      },
      kaufvertragPdf: "Kaufvertragsentwurf_Beispiel.pdf", kaufvertragUpdatedAt: "2026-09-12T10:00:00Z",
      abwicklung: { kaufpreisfaelligkeitDatum: "2026-10-20", grundbuchDatum: "2026-10-25", uebergabeDatum: "2026-11-01" },
    },
  };
  const finanzierung = {
    id: "beispiel-finanzierung-1", kunde_id: BEISPIEL_INVESTMENT_ID,
    angebote: [{
      id: "beispiel-angebot-1", label: "Angebot 1", bank: "Beispielbank AG (fiktiv)", summe: 224000,
      zins: "3,4", tilgung: "2", laufzeit: "10", anmerkungen: "Zinsbindung 10 Jahre, 5 % Sondertilgung p. a.",
      gesendet: true, akzeptiert: true, bankFinal: true,
      dokumente: [{ id: "beispiel-dok-1", name: "Finanzierungsangebot", status: "signed", isDefault: true }],
    }],
  };
  const termin = (id: string, beschreibung: string, tag: string) => ({
    id, kunde_id: BEISPIEL_KONTAKT_ID, art: "meeting", beschreibung, von: "Beispiel Partner",
    datum: `${tag}T09:00:00Z`, faellig_am: tag, uhrzeit: "14:00", erledigt_am: `${tag}T15:00:00Z`,
  });
  return {
    kontakte: [kontakt],
    investments: [investment],
    finanzierungen: [finanzierung],
    aktivitaeten: [termin("beispiel-akt-1", "Besichtigung", "2026-08-15"), termin("beispiel-akt-2", "Termin Bankgutachter", "2026-08-25")],
    profiles: [{ id: BEISPIEL_FINANZIERUNGSPARTNER_ID, name: "Finanzierungspartner (Beispiel)", email: "finanzierung@example.com" }],
    user_roles: [{ id: "beispiel-rolle-1", user_id: BEISPIEL_FINANZIERUNGSPARTNER_ID, role: "finanzierungspartner" }],
  };
}
