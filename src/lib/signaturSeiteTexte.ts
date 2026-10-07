/**
 * Die Texte der Unterschriftsseite `/signatur` in beiden Sprachen.
 *
 * Plan Kundensprache vom 25.09.2026, D4 und S9. Übersetzt werden nur die
 * Wege der Kunden: Reservierung, Selbstauskunft und Aftersales-Beratung. Die
 * Verträge der Vertriebspartner (`vertrag`, `vertrag_kurz`, `aftersales_vp`)
 * bleiben deutsch.
 *
 * Die Einwilligung zur elektronischen Unterschrift ist ein Rechtstext. Bei
 * Englisch zeigt die Seite den englischen Wortlaut und den deutschen zum
 * Aufklappen; gespeichert wird beides, mit Sprache und Fassung, siehe
 * `einwilligungsProtokoll`. Der deutsche Wortlaut ist unverändert der
 * bisherige.
 */
import type { Sprache } from "./kundenSprache";
import { datumUhrzeitText } from "./sprachFormat";

/** Die Fassung der englischen Einwilligungstexte dieser Seite. */
export const EINWILLIGUNG_FASSUNG_EN = "2026-09-25-en";

export type SignaturDokument = "reservierung" | "selbstauskunft" | "aftersales";

const DOKUMENT: Record<SignaturDokument, Record<Sprache, string>> = {
  reservierung: { de: "Reservierungsvereinbarung", en: "reservation agreement" },
  selbstauskunft: { de: "Selbstauskunft", en: "self-disclosure (Selbstauskunft)" },
  aftersales: { de: "Aftersales-Beratungsdokument", en: "after-sales advisory document" },
};

/** Der Dokumentname im Satz. */
export function dokumentName(dok: SignaturDokument, sprache: Sprache): string {
  return DOKUMENT[dok][sprache];
}

/** Derselbe Name am Satzanfang oder als Überschrift. */
export function dokumentTitel(dok: SignaturDokument, sprache: Sprache): string {
  const n = DOKUMENT[dok][sprache];
  if (sprache === "de") return n;
  // „self-disclosure (Selbstauskunft)“ wird im Titel kürzer.
  const kurz = dok === "selbstauskunft" ? "Self-disclosure" : n;
  return kurz.charAt(0).toUpperCase() + kurz.slice(1);
}

/**
 * Die Einwilligung am Kästchen vor dem Unterschreiben.
 *
 * Deutsch zeichengleich mit dem bisherigen Text der Seite. `bestaetigung` ist
 * bei der Reservierung der Satz aus `unterschriftBestaetigung` in derselben
 * Sprache.
 */
export function einwilligungText(dok: SignaturDokument, sprache: Sprache, bestaetigung = ""): string {
  if (sprache === "en") {
    if (dok === "reservierung") {
      return `I confirm that the information I have provided in the reservation agreement is correct and complete. ${bestaetigung} I agree that my signature is captured electronically, stored and used to document the reservation. I am aware that this electronic signature constitutes a simple electronic signature within the meaning of the eIDAS Regulation.`;
    }
    if (dok === "aftersales") {
      return "I confirm that the after-sales services recorded in the advisory document correspond to my wishes and agreements. I agree that my signature is captured electronically, stored and used to document the advice. I am aware that this electronic signature constitutes a simple electronic signature within the meaning of the eIDAS Regulation.";
    }
    return "I confirm that the information I have provided in the self-disclosure (Selbstauskunft) is correct and complete. I agree that my signature is captured electronically, stored and used to document the self-disclosure. I am aware that this electronic signature constitutes a simple electronic signature within the meaning of the eIDAS Regulation.";
  }
  if (dok === "reservierung") {
    return `Ich bestätige die Richtigkeit und Vollständigkeit meiner Angaben in der Reservierungsvereinbarung. ${bestaetigung} Ich bin damit einverstanden, dass meine Unterschrift elektronisch erfasst, gespeichert und zur Dokumentation der Reservierung verwendet wird. Mir ist bewusst, dass diese elektronische Unterschrift eine einfache elektronische Signatur (EES) gemäß eIDAS-Verordnung darstellt.`;
  }
  if (dok === "aftersales") {
    return "Ich bestätige, dass die im Beratungsdokument festgehaltenen Aftersales-Leistungen meinen Wünschen und Vereinbarungen entsprechen. Ich bin damit einverstanden, dass meine Unterschrift elektronisch erfasst, gespeichert und zur Dokumentation der Beratung verwendet wird. Mir ist bewusst, dass diese elektronische Unterschrift eine einfache elektronische Signatur (EES) gemäß eIDAS-Verordnung darstellt.";
  }
  return "Ich bestätige die Richtigkeit und Vollständigkeit meiner Angaben in der Selbstauskunft. Ich bin damit einverstanden, dass meine Unterschrift elektronisch erfasst, gespeichert und zur Dokumentation der Selbstauskunft verwendet wird. Mir ist bewusst, dass diese elektronische Unterschrift eine einfache elektronische Signatur (EES) gemäß eIDAS-Verordnung darstellt.";
}

export interface ProtokollAngaben {
  dok: SignaturDokument;
  sprache: Sprache;
  name: string;
  /** Der Bestätigungssatz der Reservierung, je Sprache. Leer bei den anderen Dokumenten. */
  bestaetigung?: { de: string; en: string };
  /** Der gewählte Beginn der Reservierung, je Sprache. Leer ohne Widerrufsteil. */
  wahl?: { de: string; en: string };
  ort?: string;
  /** Die Fassung des Dokuments, etwa „2026-09-22 (DE, maßgeblich) / 2026-09-25-en (EN)“. */
  fassung?: string;
  jetzt?: Date;
}

/**
 * Der Text, der mit der Unterschrift gespeichert wird (`consent_text`).
 *
 * Deutsch genau wie bisher. Bei Englisch steht vorn in eckigen Klammern,
 * in welcher Sprache und Fassung zugestimmt wurde (Plan Kundensprache,
 * Risiken: „gespeichert werden muss, in welcher Sprache und Fassung
 * zugestimmt wurde“), dann der englische Wortlaut, den der Kunde gesehen hat,
 * und zuletzt der deutsche, maßgebliche. Das Datum steht bei Englisch
 * ausdrücklich in deutscher Zeit, weil der Kunde im Ausland sitzen kann.
 */
export function einwilligungsProtokoll(a: ProtokollAngaben): string {
  const jetzt = a.jetzt ?? new Date();
  const ort = (a.ort ?? "").trim();
  const deutsch = `Ich, ${a.name}, bestätige hiermit die Richtigkeit und Vollständigkeit meiner Angaben in der ${DOKUMENT[a.dok].de}.`
    + `${a.bestaetigung ? ` ${a.bestaetigung.de}` : ""}`
    + `${a.wahl ? ` Gewählter Beginn der Reservierung: ${a.wahl.de}` : ""}`
    + " Ich bin damit einverstanden, dass meine Unterschrift elektronisch erfasst und gespeichert wird."
    + `${ort ? ` Ort: ${ort}.` : ""}`
    + ` Datum: ${jetzt.toLocaleString("de-DE")}`;
  if (a.sprache !== "en") return deutsch;

  const kopf = `[Sprache: en; Einwilligung ${EINWILLIGUNG_FASSUNG_EN}${a.fassung ? `; Fassung ${a.fassung}` : ""}; maßgeblich ist die deutsche Fassung]`;
  const englisch = `I, ${a.name}, hereby confirm that the information I have provided in the ${DOKUMENT[a.dok].en} is correct and complete.`
    + `${a.bestaetigung ? ` ${a.bestaetigung.en}` : ""}`
    + `${a.wahl ? ` Chosen start of the reservation: ${a.wahl.en}` : ""}`
    + " I agree that my signature is captured and stored electronically."
    + `${ort ? ` Place: ${ort}.` : ""}`
    + ` Date: ${datumUhrzeitText(jetzt, "en")} (German time)`;
  return `${kopf} ${englisch} | DE: ${deutsch}`;
}

/** Die übrigen Texte der Seite. */
export interface SignaturSeitenTexte {
  linkPruefen: string;
  verarbeiten: string;
  keinToken: string;
  unbekannt: string;
  speicherFehler: string;
  abgelaufenTitel: string;
  abgelaufenText: string;
  /** Anfrage zu einer abgelösten Fassung der Selbstauskunft (Befund HB-004). */
  ueberholtTitel: string;
  ueberholtText: string;
  /** Reservierung aufgehoben (05.10.2026): der Link gehört zur alten Vereinbarung. */
  rvAufgehobenTitel: string;
  rvAufgehobenText: string;
  fehlerTitel: string;
  bereitsTitel: string;
  bereitsText: (dok: SignaturDokument) => string;
  herunterladen: (titel: string) => string;
  audit: string;
  auditName: string;
  auditZeit: string;
  auditMethode: string;
  auditMethodeWert: string;
  dankeTitel: string;
  dankeText: string;
  alleEingegangen: string;
  unterschriftenStand: (n: number, gesamt: number) => string;
  sobaldAlle: string;
  schliessen: string;
  vorschauTitel: (dok: SignaturDokument) => string;
  vorschauHinweis: (dok: SignaturDokument) => string;
  vorschauTitelIframe: (dok: SignaturDokument) => string;
  vorschauNichtUnterstuetzt: string;
  pdfHerunterladenAnsehen: string;
  pdfNeuerTab: string;
  zusammenfassung: string;
  feldName: string;
  feldGeburtsdatum: string;
  feldAdresse: string;
  feldEmail: string;
  feldTelefon: string;
  person2: string;
  vorschauFehlt: string;
  korrekturTitel: string;
  korrekturText: string;
  abbrechen: string;
  korrekturFehler: string;
  korrekturUebernommenZurueckgesetzt: string;
  korrekturUebernommen: string;
  stimmtEtwasNicht: string;
  stimmtEtwasNichtText: string;
  saBearbeiten: string;
  unterschreibenTitel: (dok: SignaturDokument) => string;
  rolleKaeufer: string;
  rolleKunde: string;
  rollePerson: (nr: 1 | 2) => string;
  gesendetAn: string;
  gueltigBis: string;
  unterschrift: string;
  loeschen: string;
  bitteUnterschreiben: string;
  vomHandy: string;
  handyTitel: string;
  handyText: string;
  ort: string;
  freiwillig: string;
  ortBeispiel: string;
  wirdGespeichert: string;
  bestaetigen: string;
  datenschutzFuss: string;
  // Handy-Ansicht
  mobilKopf: string;
  mobilUnterschreiben: (titel: string) => string;
  mobilFuer: string;
  mobilHinweis: string;
  mobilFinger: string;
  mobilWirdUebertragen: string;
  mobilSenden: string;
  mobilGesendetTitel: string;
  mobilGesendetText: string;
  mobilFuss: string;
  // Zweisprachigkeit
  deutschesOriginal: string;
}

const DE: SignaturSeitenTexte = {
  linkPruefen: "Link wird überprüft…",
  verarbeiten: "Unterschrift wird verarbeitet…",
  keinToken: "Kein Token angegeben.",
  unbekannt: "Dieser Link ist uns nicht bekannt. Bitte prüfen Sie, ob Sie die Adresse vollständig aus der E-Mail übernommen haben.",
  speicherFehler: "Fehler beim Speichern. Bitte versuchen Sie es erneut.",
  abgelaufenTitel: "Link abgelaufen",
  abgelaufenText: "Dieser Signatur-Link ist abgelaufen und lässt sich nicht mehr öffnen. Falls Sie bereits unterschrieben haben, ist für Sie nichts weiter zu tun. Andernfalls wenden Sie sich bitte an Ihren Berater, er schickt Ihnen einen neuen Link.",
  ueberholtTitel: "Diese Anfrage ist überholt",
  ueberholtText: "Die Selbstauskunft wurde inzwischen mit geänderten Angaben neu abgeschickt. Diese Anfrage gehört zu einer älteren Fassung und kann nicht mehr unterschrieben werden. Wird Ihre Unterschrift für die aktuelle Fassung gebraucht, erhalten Sie dafür automatisch eine eigene E-Mail mit einem neuen Link. Bitte unterschreiben Sie dort. Finden Sie diese E-Mail nicht, wenden Sie sich bitte an Ihren Berater.",
  rvAufgehobenTitel: "Reservierung aufgehoben",
  rvAufgehobenText: "Diese Reservierung wurde aufgehoben, der Link ist nicht mehr gültig. Bei Fragen wenden Sie sich bitte an Ihren Berater.",
  fehlerTitel: "Fehler",
  bereitsTitel: "Bereits unterschrieben",
  bereitsText: (dok) => dok === "reservierung"
    ? "Diese Reservierungsvereinbarung wurde bereits von Ihnen unterschrieben. Sie können dieses Fenster schließen."
    : "Diese Selbstauskunft wurde bereits von Ihnen unterschrieben. Sie können dieses Fenster schließen.",
  herunterladen: (titel) => `${titel} als PDF herunterladen`,
  audit: "Audit-Protokoll:",
  auditName: "Name",
  auditZeit: "Zeitpunkt",
  auditMethode: "Methode",
  auditMethodeWert: "Einfache elektronische Signatur (EES)",
  dankeTitel: "Vielen Dank!",
  dankeText: "Ihre Unterschrift wurde erfolgreich erfasst und gespeichert.",
  alleEingegangen: "Alle Unterschriften eingegangen. Das PDF wird erstellt.",
  unterschriftenStand: (n, g) => `Unterschriften: ${n}/${g}`,
  sobaldAlle: "Sobald alle Personen unterschrieben haben, wird das PDF automatisch erstellt und gespeichert.",
  schliessen: "Sie können dieses Fenster jetzt schließen.",
  vorschauTitel: (dok) => dok === "reservierung"
    ? "Ihre Reservierungsvereinbarung zur Kontrolle"
    : dok === "aftersales" ? "Ihr Aftersales-Beratungsdokument" : "Ihre Selbstauskunft zur Kontrolle",
  vorschauHinweis: (dok) => dok === "aftersales"
    ? "Ihr Vertriebspartner hat das Beratungsdokument bereits unterzeichnet. Bitte überprüfen Sie die vereinbarten Leistungen und unterschreiben Sie unten."
    : "Bitte überprüfen Sie Ihre Angaben sorgfältig, bevor Sie unten unterschreiben.",
  vorschauTitelIframe: (dok) => dok === "reservierung" ? "Reservierungsvereinbarung Vorschau" : "Selbstauskunft Vorschau",
  vorschauNichtUnterstuetzt: "PDF-Vorschau wird auf Ihrem Gerät nicht unterstützt.",
  pdfHerunterladenAnsehen: "PDF herunterladen & ansehen",
  pdfNeuerTab: "PDF in neuem Tab öffnen",
  zusammenfassung: "Zusammenfassung Ihrer Angaben:",
  feldName: "Name:",
  feldGeburtsdatum: "Geburtsdatum:",
  feldAdresse: "Adresse:",
  feldEmail: "E-Mail:",
  feldTelefon: "Telefon:",
  person2: "Person 2:",
  vorschauFehlt: "Die vollständige PDF-Vorschau konnte nicht geladen werden. Oben sehen Sie eine Zusammenfassung.",
  korrekturTitel: "Angaben korrigieren",
  korrekturText: "Bitte passen Sie an, was nicht stimmt. Am Ende übernehmen Sie die Korrekturen und unterschreiben die neue Fassung.",
  abbrechen: "Abbrechen",
  korrekturFehler: "Die Änderungen konnten nicht gespeichert werden. Bitte versuchen Sie es erneut oder wenden Sie sich an Ihren Ansprechpartner.",
  korrekturUebernommenZurueckgesetzt: "Ihre Korrekturen wurden übernommen. Bereits geleistete Unterschriften wurden zurückgesetzt, die betroffenen Personen wurden automatisch erneut eingeladen. Bitte prüfen Sie die neue Fassung unten und unterschreiben Sie.",
  korrekturUebernommen: "Ihre Korrekturen wurden übernommen. Bitte prüfen Sie die neue Fassung unten und unterschreiben Sie.",
  stimmtEtwasNicht: "Stimmt etwas nicht?",
  stimmtEtwasNichtText: "Bitte korrigieren Sie Ihre Angaben vor der Unterschrift. Danach unterschreiben Sie die aktualisierte Fassung.",
  saBearbeiten: "Selbstauskunft bearbeiten",
  unterschreibenTitel: (dok) => dok === "reservierung"
    ? "Reservierungsvereinbarung unterschreiben"
    : dok === "aftersales" ? "Aftersales-Beratungsdokument unterschreiben" : "Selbstauskunft unterschreiben",
  rolleKaeufer: "Käufer",
  rolleKunde: "Kunde",
  rollePerson: (nr) => `Person ${nr}`,
  gesendetAn: "Gesendet an",
  gueltigBis: "Gültig bis",
  unterschrift: "Unterschrift",
  loeschen: "Löschen",
  bitteUnterschreiben: "Bitte unterschreiben Sie im Feld oben (Maus oder Finger)",
  vomHandy: "Unterschrift vom Handy übernommen",
  handyTitel: "Lieber per Handy unterschreiben?",
  handyText: "Scannen Sie diesen QR-Code mit Ihrer Handy-Kamera. Sie unterschreiben dann bequem mit dem Finger. Die Unterschrift erscheint hier automatisch.",
  ort: "Ort",
  freiwillig: "(freiwillig)",
  ortBeispiel: "z. B. Rosenheim",
  wirdGespeichert: "Wird gespeichert…",
  bestaetigen: "✍️ Unterschrift bestätigen",
  datenschutzFuss: "Ihre Daten werden verschlüsselt übertragen und DSGVO-konform gespeichert. IP-Adresse und Zeitstempel werden als Nachweis protokolliert.",
  mobilKopf: "OS Immobilien · Mobile Unterschrift",
  mobilUnterschreiben: (titel) => `${titel} unterschreiben`,
  mobilFuer: "Für",
  mobilHinweis: "Unterschreiben Sie unten mit dem Finger. Ihre Unterschrift wird sofort an den Computer übertragen, an dem Sie den QR-Code gescannt haben.",
  mobilFinger: "Bitte hier mit dem Finger unterschreiben",
  mobilWirdUebertragen: "Wird übertragen…",
  mobilSenden: "📲 Unterschrift an Computer senden",
  mobilGesendetTitel: "Unterschrift gesendet!",
  mobilGesendetText: "Ihre Unterschrift wurde an Ihren Computer übertragen. Bitte schließen Sie dort den Vorgang ab. Sie können dieses Fenster jetzt schließen.",
  mobilFuss: "Verschlüsselte Übertragung · DSGVO-konform · Einfache elektronische Signatur (EES)",
  deutschesOriginal: "Deutscher Wortlaut",
};

const EN: SignaturSeitenTexte = {
  linkPruefen: "Checking your link…",
  verarbeiten: "Processing your signature…",
  keinToken: "No link token was provided.",
  unbekannt: "We do not recognise this link. Please check that you have copied the complete address from the email.",
  speicherFehler: "Your signature could not be saved. Please try again.",
  abgelaufenTitel: "Link expired",
  abgelaufenText: "This signature link has expired and can no longer be opened. If you have already signed, there is nothing further for you to do. Otherwise, please contact your contact person at OS Immobilien, who will send you a new link.",
  ueberholtTitel: "This request has been superseded",
  ueberholtText: "The self-disclosure has since been resubmitted with changed details. This request belongs to an earlier version and can no longer be signed. If your signature is needed for the current version, you will automatically receive a separate email with a new link. Please sign there. If you cannot find this email, please contact your contact person at OS Immobilien.",
  rvAufgehobenTitel: "Reservation cancelled",
  rvAufgehobenText: "This reservation has been cancelled, the link is no longer valid. If you have any questions, please contact your contact person at OS Immobilien.",
  fehlerTitel: "Error",
  bereitsTitel: "Already signed",
  bereitsText: (dok) => dok === "reservierung"
    ? "You have already signed this reservation agreement. You may close this window."
    : "You have already signed this self-disclosure. You may close this window.",
  herunterladen: (titel) => `Download ${titel} as PDF`,
  audit: "Audit record:",
  auditName: "Name",
  auditZeit: "Time",
  auditMethode: "Method",
  auditMethodeWert: "Simple electronic signature (eIDAS)",
  dankeTitel: "Thank you!",
  dankeText: "Your signature has been captured and saved successfully.",
  alleEingegangen: "All signatures have been received. The PDF is being created.",
  unterschriftenStand: (n, g) => `Signatures: ${n}/${g}`,
  sobaldAlle: "As soon as everyone has signed, the PDF will be created and saved automatically.",
  schliessen: "You may now close this window.",
  vorschauTitel: (dok) => dok === "reservierung"
    ? "Your reservation agreement for review"
    : dok === "aftersales" ? "Your after-sales advisory document" : "Your self-disclosure for review",
  vorschauHinweis: (dok) => dok === "aftersales"
    ? "Your sales partner has already signed the advisory document. Please check the agreed services and sign below."
    : dok === "reservierung"
    ? "Please read the agreement carefully before you sign below. It is written in German and English; the German version prevails."
    : "Please check your details carefully before you sign below.",
  vorschauTitelIframe: (dok) => dok === "reservierung" ? "Reservation agreement preview" : "Self-disclosure preview",
  vorschauNichtUnterstuetzt: "Your device does not support the PDF preview.",
  pdfHerunterladenAnsehen: "Download and view PDF",
  pdfNeuerTab: "Open PDF in a new tab",
  zusammenfassung: "Summary of your details:",
  feldName: "Name:",
  feldGeburtsdatum: "Date of birth:",
  feldAdresse: "Address:",
  feldEmail: "Email:",
  feldTelefon: "Telephone:",
  person2: "Person 2:",
  vorschauFehlt: "The full PDF preview could not be loaded. A summary is shown above.",
  korrekturTitel: "Correct your details",
  korrekturText: "Please change anything that is not correct. At the end, you apply the corrections and sign the new version.",
  abbrechen: "Cancel",
  korrekturFehler: "Your changes could not be saved. Please try again or contact your contact person at OS Immobilien.",
  korrekturUebernommenZurueckgesetzt: "Your corrections have been applied. Signatures already given have been reset, and the persons concerned have automatically been invited to sign again. Please check the new version below and sign.",
  korrekturUebernommen: "Your corrections have been applied. Please check the new version below and sign.",
  stimmtEtwasNicht: "Is something not correct?",
  stimmtEtwasNichtText: "Please correct your details before signing. You then sign the updated version.",
  saBearbeiten: "Edit self-disclosure",
  unterschreibenTitel: (dok) => dok === "reservierung"
    ? "Sign the reservation agreement"
    : dok === "aftersales" ? "Sign the after-sales advisory document" : "Sign the self-disclosure",
  rolleKaeufer: "Buyer",
  rolleKunde: "Customer",
  rollePerson: (nr) => `Person ${nr}`,
  gesendetAn: "Sent to",
  gueltigBis: "Valid until",
  unterschrift: "Signature",
  loeschen: "Clear",
  bitteUnterschreiben: "Please sign in the box above (mouse or finger)",
  vomHandy: "Signature received from your phone",
  handyTitel: "Would you rather sign on your phone?",
  handyText: "Scan this QR code with your phone camera. You can then sign comfortably with your finger, and the signature appears here automatically.",
  ort: "Place",
  freiwillig: "(optional)",
  ortBeispiel: "e.g. Munich",
  wirdGespeichert: "Saving…",
  bestaetigen: "✍️ Confirm signature",
  datenschutzFuss: "Your data is transmitted in encrypted form and stored in compliance with the GDPR. IP address and time stamp are recorded as evidence.",
  mobilKopf: "OS Immobilien · Mobile signature",
  mobilUnterschreiben: (titel) => `Sign the ${titel.charAt(0).toLowerCase()}${titel.slice(1)}`,
  mobilFuer: "For",
  mobilHinweis: "Sign below with your finger. Your signature is transferred immediately to the computer on which you scanned the QR code.",
  mobilFinger: "Please sign here with your finger",
  mobilWirdUebertragen: "Transferring…",
  mobilSenden: "📲 Send signature to computer",
  mobilGesendetTitel: "Signature sent!",
  mobilGesendetText: "Your signature has been transferred to your computer. Please complete the process there. You may now close this window.",
  mobilFuss: "Encrypted transfer · GDPR compliant · Simple electronic signature",
  deutschesOriginal: "Show German original (legally binding)",
};

export const SIGNATUR_SEITE_TEXTE: Record<Sprache, SignaturSeitenTexte> = { de: DE, en: EN };

/** Datum und Uhrzeit für die Seite: Deutsch wie bisher, Englisch über `sprachFormat`. */
export function seitenZeit(wert: string | number | Date, sprache: Sprache): string {
  const d = new Date(wert);
  if (sprache === "en") return datumUhrzeitText(d, "en");
  return d.toLocaleString("de-DE");
}
