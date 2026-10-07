/**
 * Selbstauskunft als ausfuellbare PDF: Versand an den Kunden und
 * automatisches Auslesen der zurueckgeschickten Datei.
 *
 * Fuer Kunden, denen der Online-Weg nicht liegt. Die leere Formular-PDF
 * liegt als statischer Bestandteil unter public/dokumente/ (erzeugt von
 * scripts/selbstauskunft-formular-pdf.py, dort stehen auch die Feldnamen).
 *
 * Zwei Rueckwege:
 *  - Am Computer ausgefuellt: Die Formularfelder sind maschinenlesbar,
 *    `saDatenAusPdfFormular` liest alle Angaben aus. Sie werden am
 *    Investment abgelegt, denn Zahlen sind immer investmentbezogen. In die
 *    Stammdaten geht nur noch, wer mitkauft, siehe
 *    `uebernehmePerson2InKontakt`.
 *  - Gedruckt und handschriftlich: Handschrift ist nicht zuverlaessig
 *    maschinenlesbar, die Werte muessen manuell in die
 *    Online-Selbstauskunft uebertragen werden.
 */
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { oeffentlicheAdresse } from "@/lib/oeffentlicheBasis";
import { updateKontakt } from "@/lib/kundenStore";
import type { Sprache } from "@/lib/kundenSprache";
import { immobilienVerweis, immobilienVerweisText } from "@/lib/kreditPflichtfelder";
import {
  EMPTY_DATA,
  EMPTY_PERSON,
  type PersonData,
  type SaKredit,
  type SelbstauskunftData,
} from "@/components/selbstauskunft/SelbstauskunftForm";

/*
 * Aufbau der Formular-PDF seit 28.09.2026 (scripts/selbstauskunft-formular-pdf.py):
 *  - Kredite Person 1: 10 Zeilen kredit{n}_… und kreditdetail{n}_…,
 *    Kredite Person 2: 5 eigene Zeilen p2kredit{n}_… und p2kreditdetail{n}_….
 *    Die Spalten _1 bis _5 und _6 heißen wie vorher; neu sind _kategorie,
 *    _restschuld_per, _zinsart, _sondertilgung und _kreditnehmer.
 *  - Immobilien Person 1: im1 bis im4, Person 2: p2im1 und p2im2. „Immobilie
 *    Nr.“ zählt 1 bis 4 für Person 1 und 5 bis 6 für Person 2.
 *  - Je Person „Immobilien schuldenfrei“ als ja/nein.
 *
 * Die Vorlage davor hatte eine gemeinsame Kredittabelle, Kredite von Person 2
 * trugen dort den Vorsatz „P2: “, und vier gemeinsame Immobilien. Solche
 * Dateien liest `saDatenAusPdfFormular` weiter. Der Vorsatz dient heute nur
 * noch als Überlauf, wenn Person 2 mehr als 5 Kredite hat.
 */
const P2_KREDIT_VORSATZ = "P2: ";
const KREDITE_P1 = 10;
const KREDITE_P2 = 5;
const IMMOBILIEN_P1 = 4;
const IMMOBILIEN_P2 = 2;

type AuswahlGruppe = "kategorie" | "zinsart" | "sondertilgung" | "kreditnehmer";

/**
 * Die Auswahlfelder der Formular-PDF: gespeicherter Schlüssel und die Texte
 * der deutschen und englischen Vorlage. Muss zu KREDITARTEN, ZINSARTEN,
 * SONDERTILGUNG und KREDITNEHMER im Python-Skript passen; der Hin- und
 * Rückweg-Test prüft das für beide Sprachen.
 */
const AUSWAHL_TEXTE: Record<AuswahlGruppe, Record<string, readonly [string, string]>> = {
  kategorie: {
    immobilienkredit: ["Immobilienkredit", "Mortgage loan"],
    bauspardarlehen: ["Bauspardarlehen", "Building society loan"],
    kfz_finanzierung: ["KFZ-Finanzierung", "Car loan"],
    kfz_leasing: ["Leasing (Fahrzeug)", "Vehicle leasing"],
    ratenkredit: ["Ratenkredit", "Instalment loan"],
    dispo: ["Dispokredit", "Overdraft"],
    kreditkarte: ["Kreditkarte", "Credit card"],
    privatdarlehen: ["Privatdarlehen", "Private loan"],
    studienkredit: ["Studienkredit", "Student loan"],
    sonstiges: ["Sonstiges", "Other"],
  },
  zinsart: { fest: ["fest", "fixed"], variabel: ["variabel", "variable"] },
  sondertilgung: { ja: ["ja", "yes"], nein: ["nein", "no"], unbekannt: ["unbekannt", "unknown"] },
  kreditnehmer: { person1: ["Person 1", "Person 1"], person2: ["Person 2", "Person 2"], gemeinsam: ["gemeinsam", "jointly"] },
};

/** Der gespeicherte Schlüssel zu einem Text der Auswahl (oder zum Schlüssel selbst). */
function auswahlSchluessel(gruppe: AuswahlGruppe, text: string): string {
  const t = text.trim().toLowerCase();
  if (!t) return "";
  const eintrag = Object.entries(AUSWAHL_TEXTE[gruppe]).find(
    ([schluessel, texte]) => schluessel === t || texte.some((x) => x.toLowerCase() === t),
  );
  return eintrag?.[0] ?? "";
}

/** Die Auswahlgruppe eines Feldnamens, etwa „p2kreditdetail3_zinsart“. */
function auswahlGruppe(name: string): AuswahlGruppe | null {
  const endung = name.slice(name.lastIndexOf("_") + 1);
  return endung in AUSWAHL_TEXTE ? (endung as AuswahlGruppe) : null;
}

/** Verweis im System ("0", "p2:1") zur Nummer in der PDF (1 bis 6), leer ohne Platz. */
function immobilienNrFuerPdf(verweis: string | undefined): string {
  const v = immobilienVerweis(verweis);
  if (!v) return "";
  if (v.person === 1) return v.index < IMMOBILIEN_P1 ? String(v.index + 1) : "";
  return v.index < IMMOBILIEN_P2 ? String(IMMOBILIEN_P1 + v.index + 1) : "";
}

export const SA_FORMULAR_PFAD = "/dokumente/selbstauskunft-formular.pdf";
export const SA_FORMULAR_DATEINAME = "Selbstauskunft-MOREImmo.pdf";

/*
 * Die englische Fassung (Plan Kundensprache, Etappe 4, D7). Erzeugt mit
 * `python3 scripts/selbstauskunft-formular-pdf.py en`. Sie hat dieselben
 * Feldnamen und dieselbe Seitenaufteilung wie die deutsche; das automatische
 * Auslesen (`saDatenAusPdfFormular`) kennt damit beide ohne Unterschied. Die
 * Erklärung auf der letzten Seite steht zweisprachig, Deutsch maßgeblich.
 */
export const SA_FORMULAR_PFAD_EN = "/dokumente/selbstauskunft-formular-en.pdf";
export const SA_FORMULAR_DATEINAME_EN = "Self-Disclosure-MOREImmo.pdf";

/** Die Formular-PDF in der Sprache des Kunden. Ohne Angabe die deutsche. */
export function saFormularDatei(sprache?: Sprache | null): { pfad: string; dateiname: string } {
  return sprache === "en"
    ? { pfad: SA_FORMULAR_PFAD_EN, dateiname: SA_FORMULAR_DATEINAME_EN }
    : { pfad: SA_FORMULAR_PFAD, dateiname: SA_FORMULAR_DATEINAME };
}

// ─── Versand ────────────────────────────────────────────────────────────────

function alsBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let binaer = "";
  // Blockweise, sonst sprengt String.fromCharCode(...grosseListe) den Stack.
  const BLOCK = 0x8000;
  for (let i = 0; i < arr.length; i += BLOCK) {
    binaer += String.fromCharCode(...arr.subarray(i, i + BLOCK));
  }
  return btoa(binaer);
}

/** Schickt die Formular-PDF als Mail-Anhang an den Kunden. */
export async function versendeSaFormularPdf(args: {
  kundeEmail: string;
  kundeName: string;
  investmentId: string;
  /** Der Kontakt, dessen Kundensprache die Mail bekommt. */
  kontaktId?: string;
  /** Bewusster erneuter Versand: eigener Schluessel, geht immer hinaus. */
  erneut?: boolean;
  /**
   * Die Sprache des Kunden. Bei Englisch geht die englische Formular-PDF
   * hinaus. Den Text der Mail übersetzt Etappe 2.
   */
  sprache?: Sprache;
  /**
   * Angaben aus dem vorherigen Investment. Sind sie da, geht die PDF
   * ausgefuellt hinaus, mit einem Deckblatt, das die Herkunft nennt.
   */
  vorbelegung?: {
    /** Der Stand, der in die PDF geschrieben wird. */
    data: SelbstauskunftData;
    /** Nummer des Investments, aus dem die Angaben stammen. */
    ausInvestment: number;
    /** Die reinen Angaben von dort, zur Abgrenzung eigener Eingaben. */
    uebernommen?: SelbstauskunftData | null;
  } | null;
}): Promise<void> {
  const datei = saFormularDatei(args.sprache);
  const antwort = await fetch(datei.pfad);
  if (!antwort.ok) throw new Error("Formular-PDF nicht gefunden");
  const leer = await antwort.arrayBuffer();

  /*
   * Ein Fehler beim Vorbelegen darf den Versand nicht verhindern. Dann geht
   * das leere Formular hinaus, und der Kunde traegt alles selbst ein. Das ist
   * unbequem, aber nie falsch.
   */
  let bytes = leer;
  let vorbelegt = false;
  if (args.vorbelegung?.data) {
    try {
      bytes = await fuelleSaFormularPdf(
        leer,
        args.vorbelegung.data,
        args.vorbelegung.ausInvestment,
        args.vorbelegung.uebernommen,
        args.sprache,
      );
      vorbelegt = true;
    } catch (e) {
      console.warn("[SA] Vorbelegung der Formular-PDF fehlgeschlagen, sende leeres Formular", e);
    }
  }
  const inhalt = alsBase64(bytes);

  const { data, error } = await supabase.functions.invoke("send-transactional-email", {
    body: {
      templateName: "selbstauskunft-formular-pdf",
      recipientEmail: args.kundeEmail,
      // Deutsch oder Englisch ermittelt der Server aus dem Kundenprofil.
      ...(args.kontaktId ? { kontaktId: args.kontaktId } : {}),
      // Erstversand: je Minute ein Versand, Doppelklicks laufen ins Leere.
      // Erneut senden ist eine bewusste Entscheidung nach Rueckfrage und
      // bekommt deshalb immer einen frischen Schluessel.
      idempotencyKey: args.erneut
        ? `sa-formular-${args.investmentId}-${Date.now()}`
        : `sa-formular-${args.investmentId}-${new Date().toISOString().slice(0, 16)}`,
      // Der Knopf in der Mail zeigt auf die veroeffentlichte Adresse, dort
      // liegt die PDF als statische Datei. Der Anhang bleibt zusaetzlich
      // dabei; Mailprogramme, bei denen er ankommt, zeigen beides.
      templateData: {
        kundenName: args.kundeName,
        formularUrl: oeffentlicheAdresse(datei.pfad),
        // Der Knopf in der Mail zeigt immer auf das LEERE Formular, das liegt
        // als statische Datei auf der Domain. Ist der Anhang vorbelegt, muss
        // die Mail das sagen, sonst faengt der Kunde am falschen Dokument an.
        vorbelegt,
        vorbelegtAusInvestment: vorbelegt ? args.vorbelegung?.ausInvestment : undefined,
      },
      attachments: [
        { filename: datei.dateiname, content: inhalt, type: "application/pdf" },
      ],
    },
  });
  if (error) throw error;
  if (data && data.success === false) {
    throw new Error(data.reason || data.error || "Versand fehlgeschlagen");
  }
}

// ─── Vorbelegen ─────────────────────────────────────────────────────────────

/** Ein Feldwert der PDF, leere Werte fallen weg. */
type PdfFelder = { texte: Record<string, string>; haken: string[] };

function setzeText(felder: PdfFelder, name: string, wert: unknown): void {
  const text = typeof wert === "string" ? wert.trim() : wert == null ? "" : String(wert);
  if (text) felder.texte[name] = text;
}

function setzeJaNein(felder: PdfFelder, basis: string, wert: string | undefined): void {
  if (wert === "ja") felder.haken.push(`${basis}_ja`);
  else if (wert === "nein") felder.haken.push(`${basis}_nein`);
}

/** Die Felder einer Person, also alles mit dem Praefix p1_ oder p2_. */
function personInFelder(felder: PdfFelder, person: PersonData, p: "p1" | "p2", hausnummer: string): void {
  const s = (key: string, wert: unknown) => setzeText(felder, `${p}_${key}`, wert);

  s("anrede", person.anrede);
  s("titel", person.titel);
  s("vorname", person.vorname);
  s("nachname", person.nachname);
  s("geburtsname", person.geburtsname);
  s("geburtsdatum", person.geburtsdatum);
  s("steuerid", person.steuerId);
  s("staat", person.staatsangehoerigkeit === "andere" ? person.staatsangehoerigkeitAndere : person.staatsangehoerigkeit);
  s("familienstand", person.familienstand);
  s("wohnhaft_seit", person.wohnhaftSeit);
  // Die PDF hat ein Feld fuer Strasse und Hausnummer, das Formular zwei.
  s("strasse", [person.strasse, hausnummer].filter(Boolean).join(" "));
  s("plz", person.plz);
  s("ort", person.ort);
  s("telefon", person.telefon);
  s("mobil", person.mobilfunk);
  s("email", person.email);
  s("steuerklasse", person.steuerklasse);
  setzeJaNein(felder, `${p}_kirche`, person.kirchensteuer);

  // Beschaeftigung. Die Gegenrichtung steht in personAusFeldern.
  s("beschart", person.beschaeftigungsart);
  if (person.beschaeftigungsart === "selbstaendig") {
    s("branche", person.selbstaendigkeit?.branche);
    s("firma", person.selbstaendigkeit?.firma);
    s("seit", person.selbstaendigkeit?.selbstaendigSeit);
    s("mitarbeiter", person.selbstaendigkeit?.anzahlMitarbeiter);
  } else {
    s("branche", person.anstellung?.branche);
    s("firma", person.anstellung?.firma);
    s("beruf", person.anstellung?.berufsbezeichnung);
    s("seit", person.anstellung?.angestelltSeit);
    setzeJaNein(felder, `${p}_probezeit`, person.anstellung?.probezeit);
  }
  s("arbeitsverh", person.arbeitsvertragArt);
  s("befristet", person.befristetBis);
  s("brutto", person.bruttoJahr);
  s("zve", person.zvEJahr);
  s("gehaelter", person.monatsgehaelter);

  // Einnahmen
  s("netto", person.einkommen?.netto);
  s("gewerbe", person.einkommen?.gewerbe);
  s("miete_ein", person.einkommen?.miet);
  s("zinsen", person.einkommen?.zinsen);
  s("rente", person.einkommen?.rente);
  s("kindergeld", person.einkommen?.kindergeld);
  s("sonst_ein", person.einkommen?.sonstige);

  // Ausgaben. mieteWarm traegt seit der Umstellung die Kaltmiete.
  s("wohnsituation", person.mietart);
  s("kaltmiete", person.mieteWarm);
  s("nebenkosten", person.nebenkosten);
  s("lebenshaltung", person.lebenshaltungskosten);
  s("pkv", person.privateKV);
  s("unterhalt", person.unterhalt);
  s("kfz_anzahl", person.kfzAnzahl);
  s("kfz_kosten", person.kfzKosten);
  s("bu", person.versBU);
  s("riester", person.versRiester);
  s("av", person.versAV);
  s("vers_weitere", person.versWeitere);
  s("sonst_aus", person.sonstigeAusgaben);
  s("sonst_aus_wofuer", person.sonstigeAusgabenWofuer);

  // Sonstiges
  setzeJaNein(felder, `${p}_mahnverfahren`, person.mahnverfahren);
  setzeJaNein(felder, `${p}_schufa`, person.schufaBekannt);
  s("schufa_score", person.schufaScore);
  // true = „schuldenfrei“ geantwortet, false = ausdrücklich nein, sonst offen.
  const schuldenfrei = person.immobilienSchuldenfrei;
  setzeJaNein(felder, `${p}_immo_schuldenfrei`, schuldenfrei === true ? "ja" : schuldenfrei === false ? "nein" : undefined);
}

/** Ein Kredit in eine Zeile der Tabellen E (Grundzeile und Details). */
function kreditInFelder(felder: PdfFelder, kredit: SaKredit | undefined, zeile: string, detail: string, vorsatz = ""): void {
  const s = (name: string, wert: unknown) => setzeText(felder, name, wert);
  s(`${zeile}_kategorie`, kredit?.kategorie);
  s(`${zeile}_1`, `${vorsatz}${kredit?.art || ""}`);
  s(`${zeile}_2`, kredit?.bank);
  s(`${zeile}_3`, kredit?.rate);
  s(`${zeile}_4`, kredit?.restschuld);
  s(`${zeile}_restschuld_per`, kredit?.restschuldPer);
  s(`${zeile}_5`, kredit?.laufzeitEnde);
  s(`${detail}_1`, kredit?.ursprung);
  s(`${detail}_2`, kredit?.zinssatz);
  s(`${detail}_zinsart`, kredit?.zinsart);
  s(`${detail}_3`, kredit?.vertragsbeginn);
  s(`${detail}_4`, kredit?.zinsbindungBis);
  s(`${detail}_sondertilgung`, kredit?.sondertilgung);
  s(`${detail}_5`, kredit?.zweck);
  s(`${detail}_kreditnehmer`, kredit?.kreditnehmer);
  s(`${detail}_6`, immobilienNrFuerPdf(kredit?.immobilie));
}

type SaImmobilie = NonNullable<SelbstauskunftData["immobilien"]>[number];

function immobilieInFelder(felder: PdfFelder, immo: SaImmobilie | undefined, pr: string): void {
  setzeText(felder, `${pr}_eigentuemer`, immo?.eigentuemer);
  setzeText(felder, `${pr}_art`, immo?.art);
  setzeText(felder, `${pr}_adresse`, immo?.adresse);
  setzeText(felder, `${pr}_baujahr`, immo?.baujahr);
  setzeText(felder, `${pr}_grund`, immo?.grundstueckM2);
  setzeText(felder, `${pr}_wohnflaeche`, immo?.wohnflaecheM2);
  setzeText(felder, `${pr}_nutzung`, immo?.nutzung === "eigen" ? "eigengenutzt" : "vermietet");
  setzeText(felder, `${pr}_marktwert`, immo?.marktwert);
  setzeText(felder, `${pr}_miete_ist`, immo?.kaltmieteIst);
  setzeText(felder, `${pr}_miete_zukunft`, immo?.kaltmieteZukunft);
  setzeText(felder, `${pr}_details`, immo?.vermietungsdetails);
}

const GUETERSTAND_TEXT: Record<string, string> = {
  gesetzlich: "gesetzlicher Güterstand (Zugewinngemeinschaft)",
  guetertrennung: "Gütertrennung",
  guetergemeinschaft: "Gütergemeinschaft",
};

/**
 * Uebersetzt eine Selbstauskunft in die Feldnamen der Formular-PDF.
 *
 * Das ist die Gegenrichtung zu `saDatenAusPdfFormular`. Beide muessen
 * zusammenpassen, sonst kommt aus einer vorbelegten und zurueckgeschickten
 * PDF etwas anderes heraus, als hineingeschrieben wurde. Ein Test schickt
 * deshalb dieselben Daten hin und wieder zurueck.
 */
export function pdfFelderAusSaDaten(data: SelbstauskunftData): PdfFelder {
  const felder: PdfFelder = { texte: {}, haken: [] };

  personInFelder(felder, data as unknown as PersonData, "p1", data.hausnummer || "");
  if (data.person2 && data.person2Data?.vorname) {
    personInFelder(felder, data.person2Data, "p2", "");
  }

  setzeText(felder, "gueterstand", GUETERSTAND_TEXT[data.gueterstand || ""] || "");

  (data.kinder || []).slice(0, 4).forEach((kind, i) => {
    setzeText(felder, `kind${i + 1}_1`, kind?.name);
    setzeText(felder, `kind${i + 1}_2`, kind?.geburtsdatum);
    // imHaushalt fehlt bei Altbestand und gilt dann als ja.
    setzeText(felder, `kind${i + 1}_3`, kind?.imHaushalt === false ? "nein" : "ja");
  });

  (data.bankkonten || []).slice(0, 3).forEach((konto, i) => {
    setzeText(felder, `bank${i + 1}_1`, konto?.konto);
    setzeText(felder, `bank${i + 1}_2`, konto?.institut);
    setzeText(felder, `bank${i + 1}_3`, konto?.iban);
  });

  const p2 = data.person2 && data.person2Data?.vorname ? data.person2Data : null;
  // Person 2 hat eigene Zeilen. Nur was dort keinen Platz hat, rückt mit dem
  // alten Vorsatz in freie Zeilen von Person 1 und kommt beim Auslesen zurück.
  const p2Kredite = p2?.kredite || [];
  const zeilenP1 = [
    ...(data.kredite || []).map((kredit) => ({ kredit, vorsatz: "" })),
    ...p2Kredite.slice(KREDITE_P2).map((kredit) => ({ kredit, vorsatz: P2_KREDIT_VORSATZ })),
  ];
  // ponytail: mehr als 10 Kredite (bzw. 15 mit Person 2) passen nicht aufs Blatt, der Rest fehlt in der PDF.
  zeilenP1.slice(0, KREDITE_P1).forEach(({ kredit, vorsatz }, i) => kreditInFelder(felder, kredit, `kredit${i + 1}`, `kreditdetail${i + 1}`, vorsatz));
  p2Kredite.slice(0, KREDITE_P2).forEach((kredit, i) => kreditInFelder(felder, kredit, `p2kredit${i + 1}`, `p2kreditdetail${i + 1}`));

  (data.vermoegenswerte || []).slice(0, 8).forEach((wert, i) => {
    setzeText(felder, `verm${i + 1}_1`, wert?.art);
    setzeText(felder, `verm${i + 1}_2`, wert?.institut);
    setzeText(felder, `verm${i + 1}_3`, wert?.betrag);
  });

  (data.buergschaften || []).slice(0, 3).forEach((buerg, i) => {
    setzeText(felder, `buerg${i + 1}_1`, buerg?.art);
    setzeText(felder, `buerg${i + 1}_2`, buerg?.betrag);
  });

  (data.immobilien || []).slice(0, IMMOBILIEN_P1).forEach((immo, i) => immobilieInFelder(felder, immo, `im${i + 1}`));
  (p2?.immobilien || []).slice(0, IMMOBILIEN_P2).forEach((immo, i) => immobilieInFelder(felder, immo, `p2im${i + 1}`));

  setzeText(felder, "hinweise", data.hinweise);

  return felder;
}

/** Hellgelb, damit ein uebernommenes Feld auch im Ausdruck auffaellt. */
const UEBERNOMMEN_GELB = [1, 0.949, 0.741];

/**
 * Der Text des Deckblatts.
 *
 * Getrennt vom Zeichnen, damit ein Test den Wortlaut pruefen kann. In einer
 * PDF gibt es keine Markierung, die verschwindet, sobald jemand ein Feld
 * bestaetigt. Deshalb muss dieser Text unmissverstaendlich sagen, dass die
 * Zahlen aus einem frueheren Vorgang stammen und erst die Unterschrift sie zu
 * heutigen Angaben macht. Das Dokument geht unterschrieben zur Bank.
 */
export function saDeckblattText(ausInvestment: number, sprache: Sprache = "de"): { titel: string; absaetze: string[] } {
  if (sprache === "en") {
    return {
      titel: "Please check: we have pre-filled some details for you",
      absaetze: [
        `This self-disclosure already contains values. They are taken from your self-disclosure for investment ${ausInvestment} and are highlighted in light yellow. We have copied them so that you do not have to write everything again.`,
        "These values have not yet been checked. They describe your situation at that time, not today.",
        "Please go through every page and change anything that is no longer correct today: income, expenses, current loans, assets and your personal details. On paper, please cross out the old value and write today's value next to it.",
        "Please cross out anything that no longer applies and add anything that is missing.",
        "Only with your signature on the last page do you confirm that all details in this document are correct and complete today. Your bank assesses the financing on this basis.",
        "If you are unsure, we will be happy to complete the self-disclosure together with you. Simply contact your contact person at MOREImmo.",
      ],
    };
  }
  return {
    titel: "Bitte prüfen: Wir haben Angaben für Sie vorausgefüllt",
    absaetze: [
      `In dieser Selbstauskunft stehen bereits Werte. Sie stammen aus Ihrer Selbstauskunft zu Investment ${ausInvestment} und sind hellgelb hinterlegt. Wir haben sie übernommen, damit Sie nicht alles noch einmal schreiben müssen.`,
      "Diese Werte sind noch nicht geprüft. Sie beschreiben Ihre Lage von damals, nicht die von heute.",
      "Bitte gehen Sie jede Seite durch und ändern Sie alles, was heute nicht mehr stimmt: Einkommen, Ausgaben, laufende Kredite, Vermögen und Ihre persönlichen Angaben. Auf Papier streichen Sie den alten Wert bitte durch und schreiben den heutigen daneben.",
      "Was nicht mehr zutrifft, streichen Sie bitte. Was fehlt, ergänzen Sie bitte.",
      "Erst mit Ihrer Unterschrift auf der letzten Seite bestätigen Sie, dass alle Angaben in diesem Dokument heute richtig und vollständig sind. Ihre Bank prüft die Finanzierung auf dieser Grundlage.",
      "Wenn Sie unsicher sind, füllen wir die Selbstauskunft gerne gemeinsam mit Ihnen aus. Melden Sie sich einfach bei Ihrem Berater.",
    ],
  };
}

/** Bricht einen Absatz auf die verfuegbare Breite um. */
function umbrechen(text: string, maxBreite: number, groesse: number, schrift: { widthOfTextAtSize: (t: string, s: number) => number }): string[] {
  const zeilen: string[] = [];
  let aktuell = "";
  for (const wort of text.split(" ")) {
    const versuch = aktuell ? `${aktuell} ${wort}` : wort;
    if (schrift.widthOfTextAtSize(versuch, groesse) > maxBreite && aktuell) {
      zeilen.push(aktuell);
      aktuell = wort;
    } else {
      aktuell = versuch;
    }
  }
  if (aktuell) zeilen.push(aktuell);
  return zeilen;
}

/**
 * Fuellt die Formular-PDF mit den uebernommenen Angaben und stellt ein
 * Deckblatt davor.
 *
 * Zwei Markierungen, weil eine in einer PDF nicht reicht:
 *  1. Das Deckblatt sagt in Worten, woher die Werte stammen und dass erst die
 *     Unterschrift sie bestaetigt.
 *  2. Jedes vorbelegte Feld ist hellgelb hinterlegt, damit man auf jeder
 *     Seite sieht, welche Zahl von uns kommt und welche vom Kunden.
 */
export async function fuelleSaFormularPdf(
  leereBytes: ArrayBuffer | Uint8Array,
  data: SelbstauskunftData,
  ausInvestment: number,
  /**
   * Die Angaben des vorherigen Investments. Nur Felder, die genau so
   * dastehen, werden hellgelb hinterlegt. Was der Vertriebspartner inzwischen
   * selbst geaendert hat, bleibt weiss, denn es ist nicht uebernommen.
   * Fehlt der Wert, gilt alles Geschriebene als uebernommen.
   */
  uebernommen?: SelbstauskunftData | null,
  /** Die Sprache des Deckblatts. Ohne Angabe Deutsch. */
  sprache: Sprache = "de",
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.load(leereBytes, { ignoreEncryption: true });
  const form = doc.getForm();
  const { texte, haken } = pdfFelderAusSaDaten(data);
  const quelle = uebernommen ? pdfFelderAusSaDaten(uebernommen) : null;
  const istUebernommen = (name: string, wert?: string) => {
    if (!quelle) return true;
    return wert === undefined ? quelle.haken.includes(name) : quelle.texte[name] === wert;
  };

  const gelb = (feld: PDFTextField | PDFCheckBox | PDFDropdown) => {
    for (const widget of feld.acroField.getWidgets()) {
      widget.getOrCreateAppearanceCharacteristics().setBackgroundColor(UEBERNOMMEN_GELB);
    }
  };

  for (const [name, wert] of Object.entries(texte)) {
    try {
      const feld = form.getField(name);
      if (feld instanceof PDFDropdown) {
        // Auswahlfelder tragen den Text der Vorlagensprache, gespeichert ist der Schlüssel.
        const gruppe = auswahlGruppe(name);
        const option = gruppe ? feld.getOptions().find((o) => auswahlSchluessel(gruppe, o) === wert) : undefined;
        if (!option) continue;
        feld.select(option);
        if (istUebernommen(name, wert)) gelb(feld);
        continue;
      }
      if (!(feld instanceof PDFTextField)) continue;
      feld.setText(wert);
      if (istUebernommen(name, wert)) gelb(feld);
    } catch {
      // Ein Feld, das es in der PDF nicht (mehr) gibt, wird uebersprungen.
      // Ein fehlendes Feld darf nie den ganzen Versand kippen.
    }
  }
  for (const name of haken) {
    try {
      const feld = form.getCheckBox(name);
      feld.check();
      if (istUebernommen(name)) gelb(feld);
    } catch { /* siehe oben */ }
  }

  // Deckblatt davor. Eine eigene Seite kann mit nichts ueberlappen, anders als
  // ein Kasten, den man in eine fertige Seite hineinzeichnet.
  const { titel, absaetze } = saDeckblattText(ausInvestment, sprache);
  const seite = doc.insertPage(0, [595.28, 841.89]);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const navy = rgb(0.06, 0.16, 0.31);
  const rand = 56;
  const breite = 595.28 - 2 * rand;
  let y = 760;

  seite.drawRectangle({ x: 0, y: 800, width: 595.28, height: 42, color: navy });
  seite.drawText("MOREImmo", { x: rand, y: 814, size: 14, font: fett, color: rgb(1, 1, 1) });

  seite.drawText(titel, { x: rand, y, size: 15, font: fett, color: navy });
  y -= 32;

  for (const absatz of absaetze) {
    for (const zeile of umbrechen(absatz, breite, 10.5, normal)) {
      seite.drawText(zeile, { x: rand, y, size: 10.5, font: normal, color: rgb(0.1, 0.1, 0.1) });
      y -= 15;
    }
    y -= 10;
  }

  // Eine Farbprobe, damit "hellgelb hinterlegt" nicht erraten werden muss.
  y -= 6;
  seite.drawRectangle({
    x: rand, y: y - 4, width: 190, height: 20,
    color: rgb(UEBERNOMMEN_GELB[0], UEBERNOMMEN_GELB[1], UEBERNOMMEN_GELB[2]),
  });
  seite.drawText("So sehen übernommene Felder aus", {
    x: rand + 8, y: y + 2, size: 9.5, font: normal, color: rgb(0.1, 0.1, 0.1),
  });

  seite.drawText("MOREImmo, Wendelsteinstraße 19, 83075 Bad Feilnbach", {
    x: rand, y: 42, size: 6.5, font: normal, color: rgb(0.45, 0.45, 0.45),
  });

  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// ─── Auslesen ───────────────────────────────────────────────────────────────

function zahl(text: string): string {
  return text.trim();
}

function tief<T>(wert: T): T {
  return JSON.parse(JSON.stringify(wert)) as T;
}

/**
 * Alle Feldwerte der PDF als Name-zu-Wert-Tabelle. Auswahlfelder stehen
 * darin schon als gespeicherter Schlüssel. `neueVorlage` heißt: die Datei
 * stammt aus der Vorlage ab 28.09.2026 mit eigenen Feldern für Person 2.
 */
async function felderLesen(bytes: ArrayBuffer): Promise<{ werte: Map<string, string>; neueVorlage: boolean }> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  const werte = new Map<string, string>();
  for (const feld of form.getFields()) {
    const name = feld.getName();
    if (feld instanceof PDFTextField) {
      const wert = (feld.getText() || "").trim();
      if (wert) werte.set(name, wert);
    } else if (feld instanceof PDFCheckBox) {
      if (feld.isChecked()) werte.set(name, "x");
    } else if (feld instanceof PDFDropdown) {
      const text = (feld.getSelected()[0] || "").trim();
      const gruppe = auswahlGruppe(name);
      // Ein unbekannter Text bleibt stehen, statt still zu verschwinden.
      if (text) werte.set(name, (gruppe && auswahlSchluessel(gruppe, text)) || text);
    }
  }
  return { werte, neueVorlage: !!form.getFieldMaybe("p2im1_adresse") };
}

function janein(w: Map<string, string>, basis: string): string {
  if (w.has(`${basis}_ja`)) return "ja";
  if (w.has(`${basis}_nein`)) return "nein";
  return "";
}

function personAusFeldern(w: Map<string, string>, p: "p1" | "p2"): PersonData {
  const g = (key: string) => w.get(`${p}_${key}`) || "";
  const person: PersonData = tief(EMPTY_PERSON);

  person.anrede = g("anrede") || person.anrede;
  person.titel = g("titel");
  person.vorname = g("vorname");
  person.nachname = g("nachname");
  person.geburtsname = g("geburtsname");
  person.geburtsdatum = g("geburtsdatum");
  person.steuerId = g("steuerid");
  const staat = g("staat");
  if (staat && !/deutsch/i.test(staat)) {
    person.staatsangehoerigkeit = "andere";
    person.staatsangehoerigkeitAndere = staat;
  }
  person.familienstand = g("familienstand");
  person.wohnhaftSeit = g("wohnhaft_seit");
  person.strasse = g("strasse");
  person.plz = g("plz");
  person.ort = g("ort");
  person.telefon = g("telefon");
  person.mobilfunk = g("mobil");
  person.email = g("email");
  person.steuerklasse = g("steuerklasse").replace(/\D/g, "").slice(0, 1) || undefined;
  person.kirchensteuer = janein(w, `${p}_kirche`) || undefined;

  // Beschaeftigung
  const beschart = g("beschart").toLowerCase();
  if (/selbst/.test(beschart)) person.beschaeftigungsart = "selbstaendig";
  else if (/haus/.test(beschart)) person.beschaeftigungsart = "hausfrau";
  else if (beschart || g("firma") || g("beruf")) person.beschaeftigungsart = "angestellt";
  if (person.beschaeftigungsart === "selbstaendig") {
    person.selbstaendigkeit = {
      branche: g("branche"), firma: g("firma"),
      selbstaendigSeit: g("seit"), anzahlMitarbeiter: g("mitarbeiter"),
    };
  } else {
    person.anstellung = {
      branche: g("branche"), firma: g("firma"), berufsbezeichnung: g("beruf"),
      angestelltSeit: g("seit"),
      probezeit: janein(w, `${p}_probezeit`) || "nein",
    };
  }
  const arbeitsverh = g("arbeitsverh").toLowerCase();
  if (/unbefristet/.test(arbeitsverh)) person.arbeitsvertragArt = "unbefristet";
  else if (/befristet/.test(arbeitsverh)) person.arbeitsvertragArt = "befristet";
  else if (/probe/.test(arbeitsverh)) person.arbeitsvertragArt = "probezeit";
  person.befristetBis = g("befristet") || undefined;
  // Das Jahresbrutto der Bank-Ergaenzung. Derselbe Schluessel wie im
  // Online-Formular, damit getBruttoFromSA (steuerHelper.ts) es findet und der
  // Investmentrechner es uebernehmen kann.
  person.bruttoJahr = zahl(g("brutto")) || undefined;
  // Das zu versteuernde Jahreseinkommen (seit 05.10.2026), Schlüssel wie im
  // Online-Formular. Eine eingetragene 0 bleibt stehen, sie ist eine Angabe.
  person.zvEJahr = zahl(g("zve")) || undefined;
  person.monatsgehaelter = g("gehaelter").replace(/\D/g, "") || undefined;

  // Einnahmen
  person.einkommen = {
    netto: zahl(g("netto")), gewerbe: zahl(g("gewerbe")), miet: zahl(g("miete_ein")),
    zinsen: zahl(g("zinsen")), rente: zahl(g("rente")),
    kindergeld: zahl(g("kindergeld")) || "0",
    sonstige: zahl(g("sonst_ein")),
  };

  // Ausgaben. Das Feld heisst im System historisch mieteWarm, traegt aber
  // seit der Kaltmiete-Umstellung die Kaltmiete.
  const wohnsituation = g("wohnsituation").toLowerCase();
  if (/eigentum/.test(wohnsituation)) person.mietart = "Eigentum";
  else if (/frei/.test(wohnsituation)) person.mietart = "Mietfrei";
  else if (wohnsituation || g("kaltmiete")) person.mietart = "Zur Miete";
  person.mieteWarm = zahl(g("kaltmiete"));
  person.nebenkosten = zahl(g("nebenkosten")) || undefined;
  person.lebenshaltungskosten = zahl(g("lebenshaltung"));
  person.privateKV = zahl(g("pkv")) || "0";
  person.unterhalt = zahl(g("unterhalt")) || undefined;
  person.kfzAnzahl = g("kfz_anzahl").replace(/\D/g, "") || undefined;
  person.kfzKosten = zahl(g("kfz_kosten")) || undefined;
  person.versBU = zahl(g("bu")) || undefined;
  person.versRiester = zahl(g("riester")) || undefined;
  person.versAV = zahl(g("av")) || undefined;
  person.versWeitere = zahl(g("vers_weitere")) || undefined;
  person.sonstigeAusgaben = zahl(g("sonst_aus"));
  person.sonstigeAusgabenWofuer = g("sonst_aus_wofuer") || undefined;

  // Sonstiges
  // Kein Haken heißt keine Antwort, nicht „Nein“ (29.09.2026).
  person.mahnverfahren = janein(w, `${p}_mahnverfahren`);
  person.schufaBekannt = janein(w, `${p}_schufa`);
  person.schufaScore = g("schufa_score");
  const schuldenfrei = janein(w, `${p}_immo_schuldenfrei`);
  person.immobilienSchuldenfrei = schuldenfrei === "ja" ? true : schuldenfrei === "nein" ? false : undefined;

  return person;
}

/**
 * Eine Kreditzeile. `immoVerweis` übersetzt die Nummer aus „Immobilie Nr.“
 * in den Verweis des Systems; die Nummerierung hängt an der Vorlage.
 */
function kreditAusFeldern(
  w: Map<string, string>,
  zeile: string,
  detail: string,
  immoVerweis: (nr: number) => string | undefined,
): SaKredit | null {
  const g = (name: string) => w.get(name) || "";
  const art = g(`${zeile}_1`);
  const kategorie = g(`${zeile}_kategorie`);
  const bank = g(`${zeile}_2`);
  const rate = g(`${zeile}_3`);
  const restschuld = g(`${zeile}_4`);
  if (!art && !kategorie && !bank && !rate && !restschuld) return null;
  const immoNr = parseInt(g(`${detail}_6`).replace(/\D/g, ""), 10);
  const kredit: SaKredit = {
    art,
    bank: bank || undefined,
    rate,
    restschuld,
    laufzeitEnde: g(`${zeile}_5`),
    ursprung: g(`${detail}_1`) || undefined,
    zinssatz: g(`${detail}_2`) || undefined,
    vertragsbeginn: g(`${detail}_3`) || undefined,
    zinsbindungBis: g(`${detail}_4`) || undefined,
    zweck: g(`${detail}_5`) || undefined,
    immobilie: Number.isNaN(immoNr) ? undefined : immoVerweis(immoNr),
  };
  // Die Felder der Vorlage ab 28.09.2026; alte Dateien haben sie nicht.
  const neu: Partial<SaKredit> = {
    kategorie,
    restschuldPer: g(`${zeile}_restschuld_per`),
    zinsart: g(`${detail}_zinsart`),
    sondertilgung: g(`${detail}_sondertilgung`),
    kreditnehmer: g(`${detail}_kreditnehmer`),
  };
  for (const [feld, wert] of Object.entries(neu)) if (wert) (kredit as Record<string, unknown>)[feld] = wert;
  return kredit;
}

function immobilieAusFeldern(w: Map<string, string>, pr: string): SaImmobilie | null {
  const g = (key: string) => w.get(`${pr}_${key}`) || "";
  if (!g("eigentuemer") && !g("adresse") && !g("marktwert")) return null;
  const nutzung = g("nutzung").toLowerCase();
  return {
    eigentuemer: g("eigentuemer"),
    art: g("art"),
    adresse: g("adresse"),
    baujahr: g("baujahr"),
    grundstueckM2: g("grund"),
    wohnflaecheM2: g("wohnflaeche"),
    nutzung: /eigen/.test(nutzung) && !/fremd|vermiet/.test(nutzung) ? "eigen" : "fremd",
    marktwert: g("marktwert"),
    kaltmieteIst: g("miete_ist"),
    kaltmieteZukunft: g("miete_zukunft"),
    vermietungsdetails: g("details") || undefined,
  };
}

export interface SaPdfAusleseErgebnis {
  data: SelbstauskunftData;
  /** Wie viele befuellte Formularfelder gefunden wurden. 0 = Scan/leer. */
  felderGefunden: number;
}

/**
 * Liest eine am Computer ausgefuellte Formular-PDF vollstaendig aus.
 *
 * Wirft bei kaputten Dateien; ein Scan ohne Formularfelder liefert
 * `felderGefunden: 0`, dann bleibt nur das manuelle Uebertragen.
 */
export async function saDatenAusPdfFormular(bytes: ArrayBuffer): Promise<SaPdfAusleseErgebnis> {
  const { werte: w, neueVorlage } = await felderLesen(bytes);

  const p1 = personAusFeldern(w, "p1");
  const p2 = personAusFeldern(w, "p2");
  // p2_… sind die Angaben zur Person, p2kredit… und p2im… ihre Kredite und Immobilien.
  const p2Befuellt = [...w.keys()].some((k) => k.startsWith("p2"));

  const data: SelbstauskunftData = {
    ...tief(EMPTY_DATA),
    ...p1,
    kinder: [],
    person2: p2Befuellt,
    person2Data: p2Befuellt ? p2 : tief(EMPTY_PERSON),
  };

  const gs = (w.get("gueterstand") || "").toLowerCase();
  if (/trennung/.test(gs)) data.gueterstand = "guetertrennung";
  else if (/zugewinn|gesetzlich/.test(gs)) data.gueterstand = "gesetzlich";
  else if (/gemeinschaft/.test(gs)) data.gueterstand = "guetergemeinschaft";

  for (let i = 1; i <= 4; i++) {
    const name = w.get(`kind${i}_1`) || "";
    if (!name) continue;
    const haushalt = (w.get(`kind${i}_3`) || "").toLowerCase();
    data.kinder.push({
      name,
      geburtsdatum: w.get(`kind${i}_2`) || "",
      imHaushalt: !/nein/.test(haushalt),
    });
  }

  data.bankkonten = [];
  for (let i = 1; i <= 3; i++) {
    const konto = w.get(`bank${i}_1`) || "";
    const institut = w.get(`bank${i}_2`) || "";
    const iban = w.get(`bank${i}_3`) || "";
    if (konto || institut || iban) {
      data.bankkonten.push({ konto: konto || "Girokonto", institut, iban });
    }
  }
  if (data.bankkonten.length === 0) data.bankkonten = tief(EMPTY_DATA.bankkonten);

  /*
   * „Immobilie Nr.“ zum Verweis im System. Neue Vorlage: 1 bis 4 Person 1,
   * 5 bis 6 Person 2. Alte Vorlage: 1 bis 4 in einer gemeinsamen Liste, die
   * beim Auslesen ganz bei Person 1 landet.
   */
  const immoVerweis = (nr: number): string | undefined => {
    if (nr < 1) return undefined;
    if (!neueVorlage || nr <= IMMOBILIEN_P1) return immobilienVerweisText(1, nr - 1);
    return nr <= IMMOBILIEN_P1 + IMMOBILIEN_P2 ? immobilienVerweisText(2, nr - IMMOBILIEN_P1 - 1) : undefined;
  };

  data.kredite = [];
  const p2Kredite: SaKredit[] = [];
  for (let i = 1; i <= KREDITE_P1; i++) {
    const kredit = kreditAusFeldern(w, `kredit${i}`, `kreditdetail${i}`, immoVerweis);
    if (!kredit) continue;
    // Mit Vorsatz gehoert der Kredit Person 2 (alte Vorlage, oder Überlauf).
    const vonP2 = p2Befuellt && kredit.art.startsWith(P2_KREDIT_VORSATZ.trim());
    if (vonP2) kredit.art = kredit.art.slice(P2_KREDIT_VORSATZ.trim().length).trim();
    (vonP2 ? p2Kredite : data.kredite).push(kredit);
  }
  // Eigene Zeilen von Person 2 zuerst, der Überlauf stand dahinter.
  const eigeneP2: SaKredit[] = [];
  for (let i = 1; i <= KREDITE_P2; i++) {
    const kredit = kreditAusFeldern(w, `p2kredit${i}`, `p2kreditdetail${i}`, immoVerweis);
    if (kredit) eigeneP2.push(kredit);
  }
  data.person2Data.kredite = [...eigeneP2, ...p2Kredite];

  data.vermoegenswerte = [];
  for (let i = 1; i <= 8; i++) {
    const art = w.get(`verm${i}_1`) || "";
    const institut = w.get(`verm${i}_2`) || "";
    const betrag = w.get(`verm${i}_3`) || "";
    if (art || institut || betrag) {
      data.vermoegenswerte.push({ art: art || "Sonstige", institut, betrag });
    }
  }
  if (data.vermoegenswerte.length === 0) data.vermoegenswerte = tief(EMPTY_DATA.vermoegenswerte);

  data.buergschaften = [];
  for (let i = 1; i <= 3; i++) {
    const art = w.get(`buerg${i}_1`) || "";
    const betrag = w.get(`buerg${i}_2`) || "";
    if (art || betrag) data.buergschaften.push({ art, betrag });
  }
  if (data.buergschaften.length === 0) data.buergschaften = tief(EMPTY_DATA.buergschaften);

  /*
   * Leere Blöcke werden übersprungen. Damit ein Kredit dann nicht auf die
   * falsche Immobilie zeigt, wird sein Verweis auf die neue Position
   * umgeschrieben (Block 3 von 4, davor ein leerer: Verweis "1" statt "2").
   */
  const neuePosition = new Map<string, string>();
  const liesImmobilien = (person: 1 | 2, praefix: string, anzahl: number) => {
    const liste: SaImmobilie[] = [];
    for (let n = 1; n <= anzahl; n++) {
      const immo = immobilieAusFeldern(w, `${praefix}${n}`);
      if (!immo) continue;
      neuePosition.set(immobilienVerweisText(person, n - 1), immobilienVerweisText(person, liste.length));
      liste.push(immo);
    }
    return liste;
  };
  data.immobilien = liesImmobilien(1, "im", IMMOBILIEN_P1);
  data.person2Data.immobilien = neueVorlage ? liesImmobilien(2, "p2im", IMMOBILIEN_P2) : [];
  for (const k of [...data.kredite, ...data.person2Data.kredite]) {
    if (k.immobilie !== undefined) k.immobilie = neuePosition.get(k.immobilie);
  }

  data.hinweise = w.get("hinweise") || "";

  return { data, felderGefunden: w.size };
}

// ─── Uebernahme in die Stammdaten ───────────────────────────────────────────

/**
 * Uebernimmt aus der ausgelesenen Selbstauskunft nur die zweite Person in die
 * Stammdaten, also wer mitkauft und wie er zu erreichen ist.
 *
 * Zahlen werden bewusst NICHT mehr an den Kontakt kopiert (Entscheidung
 * Christian, 10.09.2026). Einkuenfte und Ausgaben gehoeren zum Vorgang und
 * liegen am Investment, dort legt sie `setSaData` ab. Am Kontakt haetten sie
 * kein Datum und keinen Bezug, und bei einem zweiten Kauf haette die
 * Kalkulation mit den Zahlen des ersten gerechnet.
 *
 * Name und Anschrift von Person 1 bleiben ebenfalls unangetastet, die fuehrt
 * das CRM.
 */
export function uebernehmePerson2InKontakt(kundeId: string, data: SelbstauskunftData): void {
  const p2 = data.person2 ? data.person2Data : null;
  if (!p2 || !p2.vorname) return;

  updateKontakt(kundeId, {
    person2: {
      anrede: p2.anrede,
      vorname: p2.vorname,
      nachname: p2.nachname,
      geburtsdatum: p2.geburtsdatum,
      email: p2.email,
      telefon: p2.telefon || p2.mobilfunk,
      strasse: p2.strasse,
      hausnummer: "",
      plz: p2.plz,
      ort: p2.ort,
      steuerId: p2.steuerId || "",
    },
  } as Parameters<typeof updateKontakt>[1]);
}
