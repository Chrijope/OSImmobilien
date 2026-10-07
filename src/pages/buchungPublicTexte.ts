import type { ZweiSprachen } from "@/lib/seitenSprache";

/**
 * Texte der öffentlichen Buchungsseite `/termin/:token` (`BuchungPublic.tsx`),
 * Deutsch und Englisch. Plan Kundensprache, Etappe 3 (S3).
 *
 * Nicht hier, weil Mitarbeiter sie frei schreiben: Begrüßung, Hinweis,
 * Bezeichnung und Beschreibung der Terminart, Name des Ansprechpartners.
 * Die bleiben, wie sie gepflegt sind.
 *
 * Englisch nach dem Glossar (`kundenspracheGlossar.ts`): der Berater heißt
 * „your contact“, nie „advisor“. Du wird zu einem freundlichen, direkten „you“.
 */

/** Was auf der Dankeseite steht, je Anlass. */
export interface DankeTexte {
  vorbereitung: string[];
  ablauf: string[];
}

export interface BuchungPublicTexte {
  seitentitel: string;
  seitentitelFertig: string;
  kennung: string;
  fehltTitel: string;
  fehltText: string;
  leerTitel: string;
  leerText: string;
  ansprechpartnerErsatz: string;
  terminErsatz: string;

  begruessungErsatz: string;
  einleitung: string;
  schrittAnliegen: string;
  schrittZeit: string;
  schrittKontakt: string;
  worumGehtEs: string;
  wannPasstEs: string;
  gewaehlt: string;
  zurueck: string;
  weiter: string;

  wieErreichen: string;
  deinTermin: string;
  name: string;
  namePlatzhalter: string;
  email: string;
  emailPlatzhalter: string;
  telefon: string;
  telefonPlatzhalter: string;
  nachricht: string;
  nachrichtPlatzhalter: string;
  begleitungHinzufuegen: string;
  deineBegleitperson: string;
  begleitungEntfernen: string;
  begleitungErklaerung: string;
  begleitungName: string;
  begleitungEmail: string;
  andereZeit: string;
  buchen: string;

  fehlerName: string;
  fehlerEmail: string;
  fehlerBegleitungName: string;
  fehlerBegleitungEmail: string;
  buchungFehlgeschlagen: string;

  terminSteht: string;
  danke: (vorname: string) => string;
  dankeText: string;
  wann: string;
  dauer: string;
  anliegen: string;
  deineEmail: string;
  begleitung: string;
  begleitungBestaetigung: (name: string) => string;
  videoraumHinweis: string;
  zumVideoraum: string;
  selbstAendern: string;
  terminVerwalten: string;
  wasJetzt: string;
  vorbereitet: string;
  impressum: string;
  datenschutz: string;

  /**
   * Was auf der Dankeseite steht, hängt vom Anlass ab.
   *
   * Ein telefonisches Erstgespräch braucht keine Vorbereitung, nur Ruhe. Ein
   * Beratungsgespräch wird deutlich konkreter, wenn die Gehaltsabrechnung
   * daneben liegt. Eine Objektvorstellung lebt davon, dass der Kunde die
   * Unterlagen offen hat. Ein Satz, der für alle gilt, hilft bei keinem.
   */
  dankeJeAnlass: {
    erstgespraech: DankeTexte;
    beratung: DankeTexte;
    objektvorstellung: DankeTexte;
    finanzierungsgespraech: DankeTexte;
    sonstiges: DankeTexte;
  };
}

const BESTAETIGUNG_DE = "Du bekommst die Bestätigung per E-Mail, mit dem Zugang zum Gespräch.";
const BESTAETIGUNG_EN = "You’ll receive the confirmation by email, with access to the meeting.";
const RUHIGER_ORT_DE = "Such dir einen ruhigen Ort, an dem du ungestört sprechen kannst.";
const RUHIGER_ORT_EN = "Find a quiet place where you can talk without being disturbed.";
const VOLLE_ZEIT_DE = "Plane die volle Zeit ein und sorge für eine ruhige Umgebung.";
const VOLLE_ZEIT_EN = "Set aside the full time and make sure you’re somewhere quiet.";

export const BUCHUNG_PUBLIC_TEXTE: ZweiSprachen<BuchungPublicTexte> = {
  de: {
    seitentitel: "Termin buchen",
    seitentitelFertig: "Termin bestätigt",
    kennung: "Terminbuchung",
    fehltTitel: "Dieser Buchungslink ist nicht mehr gültig.",
    fehltText: "Der Link ist abgelaufen, wurde bereits verwendet oder abgeschaltet. Bitte melde dich bei deinem Ansprechpartner, dann bekommst du einen neuen.",
    leerTitel: "Zurzeit sind keine Termine buchbar.",
    leerText: "Dein Ansprechpartner hat gerade kein Anliegen zur Auswahl gestellt. Bitte melde dich direkt bei ihm, dann findet sich ein Termin.",
    ansprechpartnerErsatz: "Dein Ansprechpartner",
    terminErsatz: "Termin",

    begruessungErsatz: "Such dir einen Termin aus.",
    einleitung: "Wähle eine Zeit, die dir passt. Du siehst die Bestätigung sofort und kannst den Termin jederzeit selbst ändern.",
    schrittAnliegen: "Anliegen",
    schrittZeit: "Zeit wählen",
    schrittKontakt: "Kontaktdaten",
    worumGehtEs: "Worum geht es?",
    wannPasstEs: "Wann passt es dir?",
    gewaehlt: "Gewählt:",
    zurueck: "Zurück",
    weiter: "Weiter",

    wieErreichen: "Wie erreichen wir dich?",
    deinTermin: "Dein Termin",
    name: "Dein Name",
    namePlatzhalter: "Vor- und Nachname",
    email: "E-Mail",
    emailPlatzhalter: "name@beispiel.de",
    telefon: "Telefon",
    telefonPlatzhalter: "Für den Fall der Fälle",
    nachricht: "Deine Nachricht",
    nachrichtPlatzhalter: "Worüber möchtest du sprechen?",
    begleitungHinzufuegen: "Begleitperson hinzufügen",
    deineBegleitperson: "Deine Begleitperson",
    begleitungEntfernen: "Begleitperson entfernen",
    begleitungErklaerung: "Nimmt jemand mit dir am Termin teil, zum Beispiel dein Ehepartner? Deine Begleitperson erhält dieselbe Einladung mit dem Zugangslink per E-Mail.",
    begleitungName: "Name der Begleitperson",
    begleitungEmail: "E-Mail der Begleitperson",
    andereZeit: "Andere Zeit",
    buchen: "Termin verbindlich buchen",

    fehlerName: "Bitte gib deinen Namen an.",
    fehlerEmail: "Bitte gib eine gültige E-Mail-Adresse an.",
    fehlerBegleitungName: "Bitte gib den Namen der Begleitperson an.",
    fehlerBegleitungEmail: "Bitte gib eine gültige E-Mail-Adresse der Begleitperson an.",
    buchungFehlgeschlagen: "Die Buchung hat leider nicht geklappt. Bitte versuch es noch einmal.",

    terminSteht: "Termin steht",
    danke: (vorname) => `Vielen Dank, ${vorname}.`,
    dankeText: "Dein Termin ist verbindlich eingetragen. Bitte speichere dir den Link unten, damit du den Termin jederzeit selbst ändern kannst.",
    wann: "Wann",
    dauer: "Dauer",
    anliegen: "Anliegen",
    deineEmail: "Deine E-Mail",
    begleitung: "Begleitung",
    begleitungBestaetigung: (name) => `${name} erhält die Bestätigung ebenfalls per E-Mail.`,
    videoraumHinweis: "Am Tag des Gesprächs betrittst du den Videoraum über diesen Link. Du brauchst kein Konto und kein Programm.",
    zumVideoraum: "Zum Videoraum",
    selbstAendern: "Du kannst den Termin jederzeit selbst absagen oder verschieben.",
    terminVerwalten: "Termin verwalten",
    wasJetzt: "Was jetzt passiert",
    vorbereitet: "So bist du gut vorbereitet",
    impressum: "Impressum",
    datenschutz: "Datenschutz",

    dankeJeAnlass: {
      erstgespraech: {
        vorbereitung: [
          RUHIGER_ORT_DE,
          "Mehr braucht es nicht. Es geht um ein erstes Kennenlernen, nicht um Zahlen.",
        ],
        ablauf: [
          BESTAETIGUNG_DE,
          "Kurz vorher erinnern wir dich noch einmal.",
          "Im Gespräch klären wir, ob und wie es für dich sinnvoll weitergeht.",
        ],
      },
      beratung: {
        vorbereitung: [
          "Leg deine letzte Gehaltsabrechnung bereit. Damit wird die Rechnung sofort konkret statt ungefähr.",
          "Falls vorhanden: ein Überblick über bestehende Sparverträge oder Anlagen.",
          VOLLE_ZEIT_DE,
        ],
        ablauf: [
          BESTAETIGUNG_DE,
          "Wir sehen uns deine Ausgangslage an und rechnen deinen Rahmen gemeinsam durch.",
          "Du entscheidest danach in Ruhe, ob und wie es weitergeht.",
        ],
      },
      objektvorstellung: {
        vorbereitung: [
          "Halte die Unterlagen bereit, die du zum Objekt bekommen hast.",
          "Notiere dir vorab, was du unbedingt geklärt haben willst.",
          "Ein größerer Bildschirm hilft, wir schauen uns Bilder und Zahlen gemeinsam an.",
        ],
        ablauf: [
          BESTAETIGUNG_DE,
          "Wir gehen das Objekt durch: Lage, Zustand, Vermietung und deine Berechnung.",
          "Danach weißt du, ob dieses Objekt zu dir passt.",
        ],
      },
      finanzierungsgespraech: {
        vorbereitung: [
          "Leg deine letzte Gehaltsabrechnung und deine Selbstauskunft bereit, falls vorhanden.",
          "Falls schon vorhanden: Unterlagen zu bestehenden Krediten und Eigenkapital.",
          VOLLE_ZEIT_DE,
        ],
        ablauf: [
          BESTAETIGUNG_DE,
          "Wir besprechen Rahmen, Konditionen und die Unterlagen für die Bank.",
          "Danach stehen die nächsten Schritte bis zur Zusage fest.",
        ],
      },
      sonstiges: {
        vorbereitung: [RUHIGER_ORT_DE],
        ablauf: [BESTAETIGUNG_DE, "Kurz vorher erinnern wir dich noch einmal."],
      },
    },
  },
  en: {
    seitentitel: "Book an appointment",
    seitentitelFertig: "Appointment confirmed",
    kennung: "Appointment booking",
    fehltTitel: "This booking link is no longer valid.",
    fehltText: "The link has expired, has already been used or has been switched off. Please get in touch with your contact and you’ll receive a new one.",
    leerTitel: "No appointments are available at the moment.",
    leerText: "Your contact hasn’t made any topics available right now. Please get in touch with them directly and you’ll find a time together.",
    ansprechpartnerErsatz: "Your contact",
    terminErsatz: "Appointment",

    begruessungErsatz: "Choose a time for your appointment.",
    einleitung: "Choose a time that suits you. You’ll see the confirmation straight away and can change the appointment yourself at any time.",
    schrittAnliegen: "Topic",
    schrittZeit: "Choose a time",
    schrittKontakt: "Your details",
    worumGehtEs: "What would you like to talk about?",
    wannPasstEs: "When suits you?",
    gewaehlt: "Selected:",
    zurueck: "Back",
    weiter: "Continue",

    wieErreichen: "How can we reach you?",
    deinTermin: "Your appointment",
    name: "Your name",
    namePlatzhalter: "First and last name",
    email: "Email",
    emailPlatzhalter: "name@example.com",
    telefon: "Phone",
    telefonPlatzhalter: "Just in case",
    nachricht: "Your message",
    nachrichtPlatzhalter: "What would you like to talk about?",
    begleitungHinzufuegen: "Add a companion",
    deineBegleitperson: "Your companion",
    begleitungEntfernen: "Remove companion",
    begleitungErklaerung: "Is someone joining you for the appointment, your spouse for example? Your companion will receive the same invitation with the access link by email.",
    begleitungName: "Companion’s name",
    begleitungEmail: "Companion’s email",
    andereZeit: "Different time",
    buchen: "Confirm booking",

    fehlerName: "Please enter your name.",
    fehlerEmail: "Please enter a valid email address.",
    fehlerBegleitungName: "Please enter your companion’s name.",
    fehlerBegleitungEmail: "Please enter a valid email address for your companion.",
    buchungFehlgeschlagen: "Unfortunately the booking didn’t go through. Please try again.",

    terminSteht: "Appointment confirmed",
    danke: (vorname) => `Thank you, ${vorname}.`,
    dankeText: "Your appointment is confirmed. Please save the link below so you can change the appointment yourself at any time.",
    wann: "When",
    dauer: "Duration",
    anliegen: "Topic",
    deineEmail: "Your email",
    begleitung: "Companion",
    begleitungBestaetigung: (name) => `${name} will also receive the confirmation by email.`,
    videoraumHinweis: "On the day of the meeting, you join the video room using this link. You don’t need an account or any software.",
    zumVideoraum: "Go to the video room",
    selbstAendern: "You can cancel or reschedule the appointment yourself at any time.",
    terminVerwalten: "Manage appointment",
    wasJetzt: "What happens next",
    vorbereitet: "How to prepare",
    impressum: "Legal notice",
    datenschutz: "Privacy policy",

    dankeJeAnlass: {
      erstgespraech: {
        vorbereitung: [
          RUHIGER_ORT_EN,
          "That’s all you need. This is about getting to know each other, not about numbers.",
        ],
        ablauf: [
          BESTAETIGUNG_EN,
          "We’ll send you a reminder shortly beforehand.",
          "In the meeting, we’ll work out whether and how it makes sense for you to take things further.",
        ],
      },
      beratung: {
        vorbereitung: [
          "Have your latest payslip to hand. That way the calculation is specific straight away rather than approximate.",
          "If you have one: an overview of existing savings plans or investments.",
          VOLLE_ZEIT_EN,
        ],
        ablauf: [
          BESTAETIGUNG_EN,
          "We’ll look at your starting position and work out your budget together.",
          "Afterwards, you decide in your own time whether and how to go ahead.",
        ],
      },
      objektvorstellung: {
        vorbereitung: [
          "Have the documents you received about the property to hand.",
          "Note down beforehand what you definitely want to clarify.",
          "A larger screen helps, as we’ll look at pictures and figures together.",
        ],
        ablauf: [
          BESTAETIGUNG_EN,
          "We’ll go through the property: location, condition, letting and your calculation.",
          "Afterwards, you’ll know whether this property is right for you.",
        ],
      },
      finanzierungsgespraech: {
        vorbereitung: [
          "Have your latest payslip and your self-disclosure (Selbstauskunft) to hand, if you have them.",
          "If you already have them: documents on existing loans and your equity.",
          VOLLE_ZEIT_EN,
        ],
        ablauf: [
          BESTAETIGUNG_EN,
          "We’ll discuss the framework, terms and the documents for the bank.",
          "Afterwards, the next steps up to the loan approval are clear.",
        ],
      },
      sonstiges: {
        vorbereitung: [RUHIGER_ORT_EN],
        ablauf: [BESTAETIGUNG_EN, "We’ll send you a reminder shortly beforehand."],
      },
    },
  },
};
