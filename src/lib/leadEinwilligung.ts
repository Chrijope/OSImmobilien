/**
 * Die Einwilligung in den oeffentlichen Lead-Formularen.
 *
 * Eine Datei, zwei Texte, eine Fassungsnummer. Wer den Wortlaut aendert, hebt
 * die Fassung an. Beides geht mit dem Lead an den Server und wird dort am
 * Kontakt gespeichert, siehe `supabase/functions/_shared/lead-einwilligung.ts`.
 * Ohne Zeitpunkt und Wortlaut ist eine Einwilligung im Streitfall nichts wert.
 *
 * Warum zwei Texte und nicht einer: Der Pflichthaken traegt genau das, was
 * ohne ihn nicht geht, also die Auswertung und die Kontaktaufnahme dazu. Alles
 * darueber hinaus, also die werbliche Ansprache zu weiteren Angeboten, ist
 * freiwillig und steht deshalb in einem eigenen Haken. Beides in einen Haken zu
 * packen, macht auch den Pflichtteil angreifbar.
 *
 * HINWEIS: Der Wortlaut ist bewusst schlicht gehalten und noch nicht
 * anwaltlich geprueft.
 */

/** Fassung der Texte, wird je Eintragung mitgespeichert. */
export const LEAD_EINWILLIGUNG_VERSION = "2026-09-v1";

/** Pflichthaken. Ohne ihn laesst sich das Formular nicht absenden. */
export const LEAD_EINWILLIGUNG_TEXT =
  "Ich bin einverstanden, dass MOREImmo meine Angaben speichert und verwendet, " +
  "um meine Auswertung zu erstellen und mich dazu zu kontaktieren. Dafür darf " +
  "MOREImmo meine Angaben an den für mich zuständigen Ansprechpartner " +
  "weitergeben. Ich kann mein Einverständnis jederzeit formlos widerrufen, zum " +
  "Beispiel per Mail an datenschutz@more.immo.";

/** Freiwilliger Haken. Er darf das Absenden nicht blockieren. */
export const LEAD_WERBUNG_TEXT =
  "Zusätzlich und freiwillig: MOREImmo darf mich per E-Mail und Telefon zu " +
  "weiteren Angeboten rund um Kapitalanlage-Immobilien informieren. Diese " +
  "Zustimmung kann ich getrennt und jederzeit widerrufen.";

/** Meldung, wenn der Pflichthaken fehlt. Sie sagt, was fehlt. */
export const LEAD_EINWILLIGUNG_FEHLT =
  "Bitte bestätige die Einwilligung zur Datenverarbeitung, sonst dürfen wir Deine Auswertung nicht erstellen.";

/**
 * Dieselben Einwilligungen auf Englisch, fuer den Steuerrechner kompakt.
 *
 * Die Zielgruppe dort sind Expats in Deutschland. Es gilt trotzdem die DSGVO,
 * die Sprache aendert daran nichts. Wichtig ist nur, dass der gespeicherte
 * Nachweis den Wortlaut traegt, den die Person WIRKLICH gelesen hat. Deshalb
 * gibt es die englische Fassung als eigenen Text und mit eigener
 * Fassungsnummer, statt den deutschen Wortlaut zu einem englischen Haken zu
 * speichern.
 *
 * HINWEIS: Wie beim deutschen Wortlaut ist auch dieser noch nicht anwaltlich
 * geprueft. Er ist eine sinngemaesse Uebertragung, keine beglaubigte
 * Uebersetzung.
 *
 * DURCHSICHT 17.09.2026, als der EXPATS Calculator oeffentlich wurde: Die drei
 * englischen Texte wurden gegen die deutschen Fassungen abgeglichen und sind
 * inhaltlich treu. Sie wurden deshalb NICHT angefasst, und die Fassungsnummer
 * `2026-09-v1-en` bleibt unveraendert. Das ist Absicht: Gespeichert wird je
 * Eintragung der Wortlaut, den die Person gelesen hat, zusammen mit dieser
 * Nummer. Bereits gespeicherte Nachweise liegen am Kontakt und werden von
 * dieser Datei nie rueckwirkend beruehrt, sie enthaelt nur den Text fuer
 * KUENFTIGE Absendungen. Wer den Wortlaut spaeter doch aendert, hebt
 * zwingend die Fassungsnummer mit an, sonst tragen zwei verschiedene Texte
 * dieselbe Nummer und der Nachweis ist im Streitfall wertlos.
 * Anwaltlich geprueft ist weiterhin keine der beiden Sprachen.
 */
export const LEAD_EINWILLIGUNG_VERSION_EN = "2026-09-v1-en";

export const LEAD_EINWILLIGUNG_TEXT_EN =
  "I agree that MOREImmo may store and use the details I provided in order to " +
  "prepare my result and contact me about it, and may pass them on to the " +
  "adviser responsible for me. I can withdraw this consent at any time, " +
  "informally, for example by email to datenschutz@more.immo.";

export const LEAD_WERBUNG_TEXT_EN =
  "Optional: MOREImmo may also contact me by email and phone about further " +
  "offers relating to investment property. I can withdraw this second consent " +
  "separately and at any time.";

export const LEAD_EINWILLIGUNG_FEHLT_EN =
  "Please accept the data protection consent, otherwise we are not allowed to prepare your result.";

/** Sprache des Einwilligungstextes. Ohne Angabe deutsch, wie bisher ueberall. */
export type EinwilligungSprache = "de" | "en";

/** Was der Client an `submit-lead` schickt. */
export interface LeadEinwilligungPayload {
  erteilt: true;
  version: string;
  text: string;
  am: string;
  werbung?: { erteilt: true; version: string; text: string; am: string };
}

/**
 * Baut den Nachweis, der mit dem Lead mitgeht.
 *
 * Gibt `null` zurueck, wenn der Pflichthaken fehlt. Das Formular prueft das
 * vorher selbst, hier ist es die zweite Sicherung: ein Lead ohne Einwilligung
 * soll auch keinen erfundenen Nachweis tragen.
 */
export function baueLeadEinwilligung(
  pflicht: boolean,
  werbung: boolean,
  jetzt: string = new Date().toISOString(),
  /* Die Sprache steht hinten und hat einen Standardwert, damit alle
     bestehenden Aufrufe unveraendert weiterlaufen. */
  sprache: EinwilligungSprache = "de",
): LeadEinwilligungPayload | null {
  if (!pflicht) return null;
  const en = sprache === "en";
  const version = en ? LEAD_EINWILLIGUNG_VERSION_EN : LEAD_EINWILLIGUNG_VERSION;
  const nachweis: LeadEinwilligungPayload = {
    erteilt: true,
    version,
    text: en ? LEAD_EINWILLIGUNG_TEXT_EN : LEAD_EINWILLIGUNG_TEXT,
    am: jetzt,
  };
  if (werbung) {
    nachweis.werbung = {
      erteilt: true,
      version,
      text: en ? LEAD_WERBUNG_TEXT_EN : LEAD_WERBUNG_TEXT,
      am: jetzt,
    };
  }
  return nachweis;
}

/*
 * ─── Handbuch-Seite (seit dem 26.09.2026) ─────────────────────────────
 *
 * Eigener Wortlaut, weil hier mehr passiert als bei einer Auswertung: Das
 * Handbuch geht per E-Mail hinaus, und der zuständige Berater meldet sich.
 * Die Pflichteinwilligung deckt genau das, die Werbung bleibt ein eigener,
 * freiwilliger Haken (Strategie 5.3, „Einwilligungen“). Eigene Fassung,
 * damit der gespeicherte Nachweis eindeutig zu diesem Text gehört.
 *
 * Seit dem 27.09.2026 siezt die Handbuch-Strecke (Entscheidung Christian).
 * Umgestellt sind nur Kurzsatz und Fehlermeldung. Der gespeicherte Wortlaut
 * steht in der Ich-Form und hat sich nicht geändert, deshalb bleibt die
 * Fassungsnummer.
 *
 * HINWEIS: Wie die übrigen Texte noch nicht anwaltlich geprüft.
 */
export const HANDBUCH_EINWILLIGUNG_VERSION = "2026-09-handbuch-v1";

export const HANDBUCH_EINWILLIGUNG_TEXT =
  "Ich möchte mein persönliches Immobilienhandbuch erhalten. MOREImmo darf meine Angaben " +
  "speichern und verwenden, um das Handbuch zu erstellen, es mir per E-Mail zu schicken und " +
  "mich dazu per E-Mail oder Telefon zu kontaktieren. Dafür darf MOREImmo meine Angaben an " +
  "den für mich zuständigen Immobilienberater weitergeben. Ich kann mein Einverständnis " +
  "jederzeit formlos widerrufen, zum Beispiel per Mail an datenschutz@more.immo.";

/** Der freiwillige Haken, wortgleich mit den übrigen Formularen. */
export const HANDBUCH_WERBUNG_TEXT = LEAD_WERBUNG_TEXT;

export const HANDBUCH_EINWILLIGUNG_FEHLT =
  "Bitte bestätigen Sie die Einwilligung, sonst dürfen wir Ihnen Ihr Handbuch nicht schicken.";

/**
 * Der sichtbare Kurzsatz über dem Haken (Westmont-Analyse, Punkt 5). Er sagt
 * in einem Satz, worum es geht; der volle Wortlaut oben steht aufklappbar
 * direkt darunter und bleibt der Text, der gespeichert wird.
 */
export const HANDBUCH_EINWILLIGUNG_KURZ =
  "Ja, schicken Sie mir mein Handbuch per E-Mail, und MOREImmo oder mein Berater dürfen mich dazu kontaktieren. Jederzeit widerrufbar.";

/*
 * Die offene Selbstauskunft der Handbuch-Seite (seit dem 26.09.2026). Eigener
 * Wortlaut und eigene Fassung, weil hier kein Handbuch verschickt wird: Wer
 * das Formular abschickt, will die Selbstauskunft ausfüllen und darf dazu
 * kontaktiert werden. Aufbau wortgleich mit dem Handbuch-Text, nur der Zweck
 * ist ein anderer.
 *
 * HINWEIS: Wie die übrigen Texte noch nicht anwaltlich geprüft.
 */
export const HANDBUCH_SA_EINWILLIGUNG_VERSION = "2026-09-handbuch-sa-v1";

export const HANDBUCH_SA_EINWILLIGUNG_TEXT =
  "Ich möchte meine Selbstauskunft ausfüllen. MOREImmo darf meine Angaben speichern und " +
  "verwenden, um mir den Zugang zur Selbstauskunft zu geben und mich dazu per E-Mail oder " +
  "Telefon zu kontaktieren. Dafür darf MOREImmo meine Angaben an den für mich zuständigen " +
  "Immobilienberater weitergeben. Ich kann mein Einverständnis jederzeit formlos widerrufen, " +
  "zum Beispiel per Mail an datenschutz@more.immo.";

export const HANDBUCH_SA_EINWILLIGUNG_KURZ =
  "Ja, MOREImmo oder mein Berater dürfen mich zu meiner Selbstauskunft kontaktieren. Jederzeit widerrufbar.";

export const HANDBUCH_SA_EINWILLIGUNG_FEHLT =
  "Bitte bestätigen Sie die Einwilligung, sonst dürfen wir Ihre Selbstauskunft nicht anlegen.";

/*
 * Englische Fassungen der beiden Handbuch-Einwilligungen (seit dem
 * 26.09.2026, englische Handbuch-Seite). Gleicher Inhalt, eigene
 * Fassungsnummer mit „-en“ am Ende: Daran erkennt `submit-lead` zusätzlich
 * die Sprache, und der gespeicherte Nachweis trägt genau den Wortlaut, den
 * die Person gelesen hat. Wie die deutschen Texte nicht anwaltlich geprüft.
 */
export const HANDBUCH_EINWILLIGUNG_VERSION_EN = "2026-09-handbuch-v1-en";

export const HANDBUCH_EINWILLIGUNG_TEXT_EN =
  "I would like to receive my personal property handbook. MOREImmo may store and use my details " +
  "to prepare the handbook, send it to me by email and contact me about it by email or phone. For " +
  "this purpose, MOREImmo may pass my details on to the contact person responsible for me. I can " +
  "withdraw this consent at any time, informally, for example by email to datenschutz@more.immo.";

export const HANDBUCH_EINWILLIGUNG_KURZ_EN =
  "Yes, send me my handbook by email, and MOREImmo or my contact person may get in touch with me about it. Can be withdrawn at any time.";

export const HANDBUCH_EINWILLIGUNG_FEHLT_EN =
  "Please confirm your consent, otherwise we are not allowed to send you your handbook.";

export const HANDBUCH_SA_EINWILLIGUNG_VERSION_EN = "2026-09-handbuch-sa-v1-en";

export const HANDBUCH_SA_EINWILLIGUNG_TEXT_EN =
  "I would like to complete my self-disclosure. MOREImmo may store and use my details to give me " +
  "access to the self-disclosure and to contact me about it by email or phone. For this purpose, " +
  "MOREImmo may pass my details on to the contact person responsible for me. I can withdraw this " +
  "consent at any time, informally, for example by email to datenschutz@more.immo.";

export const HANDBUCH_SA_EINWILLIGUNG_KURZ_EN =
  "Yes, MOREImmo or my contact person may get in touch with me about my self-disclosure. Can be withdrawn at any time.";

export const HANDBUCH_SA_EINWILLIGUNG_FEHLT_EN =
  "Please confirm your consent, otherwise we are not allowed to set up your self-disclosure.";

/** Die Texte der Handbuch-Seite je Sprache, für Formular und Nachweis. */
export function handbuchEinwilligungTexte(sprache: EinwilligungSprache, art: "handbuch" | "sa") {
  const en = sprache === "en";
  if (art === "sa") {
    return {
      version: en ? HANDBUCH_SA_EINWILLIGUNG_VERSION_EN : HANDBUCH_SA_EINWILLIGUNG_VERSION,
      text: en ? HANDBUCH_SA_EINWILLIGUNG_TEXT_EN : HANDBUCH_SA_EINWILLIGUNG_TEXT,
      kurz: en ? HANDBUCH_SA_EINWILLIGUNG_KURZ_EN : HANDBUCH_SA_EINWILLIGUNG_KURZ,
      fehlt: en ? HANDBUCH_SA_EINWILLIGUNG_FEHLT_EN : HANDBUCH_SA_EINWILLIGUNG_FEHLT,
      werbung: en ? LEAD_WERBUNG_TEXT_EN : HANDBUCH_WERBUNG_TEXT,
    };
  }
  return {
    version: en ? HANDBUCH_EINWILLIGUNG_VERSION_EN : HANDBUCH_EINWILLIGUNG_VERSION,
    text: en ? HANDBUCH_EINWILLIGUNG_TEXT_EN : HANDBUCH_EINWILLIGUNG_TEXT,
    kurz: en ? HANDBUCH_EINWILLIGUNG_KURZ_EN : HANDBUCH_EINWILLIGUNG_KURZ,
    fehlt: en ? HANDBUCH_EINWILLIGUNG_FEHLT_EN : HANDBUCH_EINWILLIGUNG_FEHLT,
    werbung: en ? LEAD_WERBUNG_TEXT_EN : HANDBUCH_WERBUNG_TEXT,
  };
}

function baueNachweis(t: { version: string; text: string; werbung: string }, werbung: boolean, jetzt: string): LeadEinwilligungPayload {
  const nachweis: LeadEinwilligungPayload = { erteilt: true, version: t.version, text: t.text, am: jetzt };
  if (werbung) nachweis.werbung = { erteilt: true, version: t.version, text: t.werbung, am: jetzt };
  return nachweis;
}

export function baueHandbuchSaEinwilligung(
  pflicht: boolean,
  werbung: boolean,
  jetzt: string = new Date().toISOString(),
  sprache: EinwilligungSprache = "de",
): LeadEinwilligungPayload | null {
  if (!pflicht) return null;
  return baueNachweis(handbuchEinwilligungTexte(sprache, "sa"), werbung, jetzt);
}

/** Der Nachweis für die Handbuch-Seite, gleiche Form wie `baueLeadEinwilligung`. */
export function baueHandbuchEinwilligung(
  pflicht: boolean,
  werbung: boolean,
  jetzt: string = new Date().toISOString(),
  sprache: EinwilligungSprache = "de",
): LeadEinwilligungPayload | null {
  if (!pflicht) return null;
  return baueNachweis(handbuchEinwilligungTexte(sprache, "handbuch"), werbung, jetzt);
}
