import type { Sprache, ZweiSprachen } from "@/lib/seitenSprache";
import { beschriftungDauer } from "@/lib/buchungAuswahl";
import { FESTE_GESPRAECHSDAUER } from "@/lib/eigeneBuchungslinks";

/**
 * Texte der Terminseite des Vertriebspartners `/terminwahl/:token`
 * (`PartnerTermin.tsx`), Deutsch und Englisch.
 *
 * Seit dem 29.09.2026 ist die Seite ausschließlich für den angemeldeten
 * Partner, dem der Link gehört (Christians Freigabe). Es gibt deshalb nur
 * noch eine Anrede, den Partner, per Du. Deutsch ist der Normalfall, `?lang=en`
 * schaltet auf Englisch, etwa wenn der Kunde neben ihm sitzt.
 *
 * `anlaesse`: Bezeichnung und Beschreibung der vier Gesprächsarten. Die
 * Datenbank (`partnertermin_zugang`) schickt sie fest verdrahtet. Die Seite
 * zeigt in beiden Sprachen den Wortlaut von hier, gewählt über den Schlüssel
 * `anlass`. Ein unbekannter Anlass bleibt, wie die Datenbank ihn schickt.
 */
export type PartnerAnlassSchluessel = "erstgespraech" | "beratung" | "objektvorstellung" | "finanzierungsgespraech";

export interface PartnerTerminTexte {
  seitentitel: string;
  kennung: string;
  technischTitel: string;
  ungueltigTitel: string;
  anmeldenTitel: string;
  anmeldenText: string;
  anmelden: string;
  keinKalenderTitel: string;
  keinKalenderText: string;

  terminSteht: string;
  eingetragenMitName: (vorname: string) => string;
  eingetragen: string;
  derTermin: string;
  wann: string;
  dauer: string;
  anliegen: string;
  /** „Dienstag, 30. September 2026, 10:00 Uhr“. */
  zeitpunkt: (datumLang: string, uhrzeit: string) => string;
  eingetragenHinweis: string;
  falschEingetragen: string;
  zeitKorrigieren: string;
  /** Aus der Bestätigung zurück zur Auswahl, für die nächste Gesprächsart. */
  weitererTermin: string;
  /** Unter einer Gesprächsart in der Auswahl, wenn dafür schon ein Termin steht. */
  schonEingetragen: (zeitpunkt: string) => string;
  /** Über dem Knopf, wenn Eintragen den vorhandenen Termin dieser Gesprächsart ändert. */
  aendertTermin: (zeitpunkt: string) => string;

  schrittAnliegen: string;
  schrittZeit: string;
  titelMitName: (vorname: string) => string;
  titel: string;
  einleitung: string;
  worumGehtEs: string;
  kalenderTitel: string;
  iframeTitel: (bezeichnung: string) => string;
  nichtEinbettbarTitel: string;
  nichtEinbettbarText: string;
  kalenderOeffnen: string;
  anderesAnliegen: string;

  bestaetigenTitel: string;
  bestaetigenText: string;
  gehoertZu: string;
  bitteWaehlen: string;
  objektNummer: (nummer: number) => string;
  /**
   * An jede Fehlermeldung gehängt, etwa „Fehlercode: verbindung (PGRST002,
   * HTTP 503)“. Die Technik fehlt bei lesbaren Ablehnungen der Datenbank.
   */
  fehlercode: (code: string, technik?: string) => string;
  gehoertZuHinweis: string;
  datum: string;
  uhrzeit: string;
  gewaehlt: string;
  bestaetigen: string;
  ohneSchritt: string;

  deinKunde: string;
  keineKontaktdaten: string;
  emailKopieren: string;
  telefonKopieren: string;
  kopiert: string;
  impressum: string;
  datenschutz: string;

  anlaesse: Record<PartnerAnlassSchluessel, { bezeichnung: string; beschreibung: string }>;
}

export const PARTNER_TERMIN_TEXTE: ZweiSprachen<PartnerTerminTexte> = {
  de: {
    seitentitel: "Termin eintragen",
    kennung: "Terminvereinbarung",
    technischTitel: "Das hat gerade nicht geklappt",
    ungueltigTitel: "Dieser Link ist nicht gültig",
    anmeldenTitel: "Bitte melde dich an",
    anmeldenText: "Die Terminseite ist nur für den Vertriebspartner, dem der Link gehört. Melde dich im CRM an, danach öffnet sie sich wieder.",
    anmelden: "Zur Anmeldung",
    keinKalenderTitel: "Dein Terminkalender ist noch nicht eingerichtet",
    keinKalenderText: "Hinterleg unter Einstellungen, Profil, Buchungskalender-Links mindestens einen Kalenderlink mit https und lade die Seite danach neu.",

    terminSteht: "Termin steht",
    eingetragenMitName: (vorname) => `Termin mit ${vorname} ist eingetragen.`,
    eingetragen: "Der Termin ist eingetragen.",
    derTermin: "Der Termin",
    wann: "Wann",
    dauer: "Dauer",
    anliegen: "Anliegen",
    zeitpunkt: (datum, uhrzeit) => `${datum}, ${uhrzeit} Uhr`,
    eingetragenHinweis: "Der Termin steht jetzt in der Kundenakte. Die Einladung mit dem Zugang zum Gespräch verschickt dein Kalender wie gewohnt selbst.",
    falschEingetragen: "Hast du die Zeit falsch eingetragen?",
    zeitKorrigieren: "Zeit korrigieren",
    weitererTermin: "Weiteren Termin eintragen",
    schonEingetragen: (zeitpunkt) => `Eingetragen: ${zeitpunkt}`,
    aendertTermin: (zeitpunkt) => `Für dieses Gespräch steht schon ein Termin am ${zeitpunkt}. Wenn du hier einträgst, änderst du ihn.`,

    schrittAnliegen: "Anliegen",
    schrittZeit: "Zeit wählen und eintragen",
    titelMitName: (vorname) => `Termin mit ${vorname}`,
    titel: "Termin eintragen",
    einleitung: "Such die Zeit in deinem Kalender aus und trag sie gleich daneben ein. Damit steht der Termin sofort in der Akte.",
    worumGehtEs: "Worum geht es?",
    kalenderTitel: "Zeit im Kalender aussuchen",
    iframeTitel: (bezeichnung) => `Zeit aussuchen: ${bezeichnung}`,
    nichtEinbettbarTitel: "Dein Kalender lässt sich hier nicht einbetten",
    nichtEinbettbarText: "Dieser Kalenderdienst erlaubt das Anzeigen innerhalb fremder Seiten nicht. Öffne ihn im eigenen Fenster, such die Zeit aus und komm dann hierher zurück, um sie einzutragen.",
    kalenderOeffnen: "Kalender öffnen",
    anderesAnliegen: "Anderes Anliegen",

    bestaetigenTitel: "Termin eintragen",
    bestaetigenText: "Sobald die Zeit im Kalender steht, trag sie hier ein. Dann hängt der Termin sofort an der Akte und am Investment.",
    gehoertZu: "Gehört zu",
    bitteWaehlen: "Bitte wählen",
    objektNummer: (nummer) => `Objekt ${nummer}`,
    fehlercode: (code, technik) => `Fehlercode: ${code}${technik ? ` (${technik})` : ""}`,
    gehoertZuHinweis: "Damit der Termin beim richtigen Objekt steht.",
    datum: "Datum",
    uhrzeit: "Uhrzeit",
    gewaehlt: "Gewählt:",
    bestaetigen: "Termin bestätigen",
    ohneSchritt: "Der Termin im Kalender steht auch ohne diesen Schritt. Er sorgt nur dafür, dass er auch in der Akte auftaucht.",

    deinKunde: "Kunde",
    keineKontaktdaten: "Für diesen Kunden sind weder E-Mail noch Telefon hinterlegt.",
    emailKopieren: "E-Mail kopieren",
    telefonKopieren: "Telefonnummer kopieren",
    kopiert: "Kopiert",
    impressum: "Impressum",
    datenschutz: "Datenschutz",

    anlaesse: {
      erstgespraech: {
        bezeichnung: "Erstgespräch",
        beschreibung: "Kurzes Kennenlernen am Telefon: klären, worum es dem Kunden geht und ob ihr zueinander passt.",
      },
      beratung: {
        bezeichnung: "Beratungsgespräch",
        beschreibung: "Das ausführliche Gespräch zur Situation des Kunden, seinen Zielen und dem passenden Weg dorthin.",
      },
      objektvorstellung: {
        bezeichnung: "Objektgespräch",
        beschreibung: "Ein konkretes Objekt gemeinsam durchgehen, von der Lage bis zur Rechnung.",
      },
      finanzierungsgespraech: {
        bezeichnung: "Finanzierungsgespräch",
        beschreibung: "Alles rund um die Finanzierung: Unterlagen, Ablauf und die nächsten Schritte mit der Bank.",
      },
    },
  },
  en: {
    seitentitel: "Enter an appointment",
    kennung: "Appointment",
    technischTitel: "That didn’t work just now",
    ungueltigTitel: "This link is not valid",
    anmeldenTitel: "Please sign in",
    anmeldenText: "The appointment page is only for the sales partner who owns the link. Sign in to the CRM and it will open again.",
    anmelden: "Go to sign in",
    keinKalenderTitel: "Your appointment calendar hasn’t been set up yet",
    keinKalenderText: "Add at least one calendar link starting with https under Settings, Profile, booking calendar links, then reload the page.",

    terminSteht: "Appointment confirmed",
    eingetragenMitName: (vorname) => `The appointment with ${vorname} has been entered.`,
    eingetragen: "The appointment has been entered.",
    derTermin: "The appointment",
    wann: "When",
    dauer: "Duration",
    anliegen: "Topic",
    zeitpunkt: (datum, uhrzeit) => `${datum}, ${uhrzeit}`,
    eingetragenHinweis: "The appointment is now in the customer file. Your calendar sends the invitation with access to the meeting itself, as usual.",
    falschEingetragen: "Did you enter the wrong time?",
    zeitKorrigieren: "Correct the time",
    weitererTermin: "Enter another appointment",
    schonEingetragen: (zeitpunkt) => `Entered: ${zeitpunkt}`,
    aendertTermin: (zeitpunkt) => `An appointment for this meeting is already set for ${zeitpunkt}. Entering a time here changes it.`,

    schrittAnliegen: "Topic",
    schrittZeit: "Choose and enter a time",
    titelMitName: (vorname) => `Appointment with ${vorname}`,
    titel: "Enter an appointment",
    einleitung: "Choose the time in your calendar and enter it right next to it. That way the appointment is on file straight away.",
    worumGehtEs: "What is it about?",
    kalenderTitel: "Choose a time in the calendar",
    iframeTitel: (bezeichnung) => `Choose a time: ${bezeichnung}`,
    nichtEinbettbarTitel: "Your calendar can’t be embedded here",
    nichtEinbettbarText: "This calendar service doesn’t allow itself to be shown inside other websites. Open it in a separate window, choose the time and then come back here to enter it.",
    kalenderOeffnen: "Open calendar",
    anderesAnliegen: "Different topic",

    bestaetigenTitel: "Enter the appointment",
    bestaetigenText: "As soon as the time is in the calendar, enter it here. The appointment is then linked to the file and the investment straight away.",
    gehoertZu: "Belongs to",
    bitteWaehlen: "Please choose",
    objektNummer: (nummer) => `Property ${nummer}`,
    fehlercode: (code, technik) => `Error code: ${code}${technik ? ` (${technik})` : ""}`,
    gehoertZuHinweis: "So the appointment is linked to the right property.",
    datum: "Date",
    uhrzeit: "Time",
    gewaehlt: "Selected:",
    bestaetigen: "Confirm appointment",
    ohneSchritt: "The appointment in the calendar stands even without this step. It just makes sure it shows up in the file too.",

    deinKunde: "Customer",
    keineKontaktdaten: "Neither an email address nor a phone number is on file for this customer.",
    emailKopieren: "Copy email",
    telefonKopieren: "Copy phone number",
    kopiert: "Copied",
    impressum: "Legal notice",
    datenschutz: "Privacy policy",

    anlaesse: {
      erstgespraech: {
        bezeichnung: "Initial call",
        beschreibung: "A short introductory call by phone. You clarify what matters to the customer and whether you’re a good fit.",
      },
      beratung: {
        bezeichnung: "Consultation",
        beschreibung: "The in-depth conversation about the customer’s situation, goals and the right way to get there.",
      },
      objektvorstellung: {
        bezeichnung: "Property meeting",
        beschreibung: "You go through a specific property together, from its location to the figures.",
      },
      finanzierungsgespraech: {
        bezeichnung: "Financing meeting",
        beschreibung: "Everything about financing: documents, the process and the next steps with the bank.",
      },
    },
  },
};

/** Wahr, wenn der Anlass einer der vier festen ist. */
export function istPartnerAnlass(anlass: string): anlass is PartnerAnlassSchluessel {
  return anlass === "erstgespraech" || anlass === "beratung" || anlass === "objektvorstellung" || anlass === "finanzierungsgespraech";
}

/**
 * Die Dauer, wie die Seite sie zeigt. Erstgespräch und Beratungsgespräch mit
 * festem Text (Christian am 29.09.2026), alles andere aus der Datenbank.
 */
export function dauerAnzeige(anlass: string, minuten: number, sprache: Sprache): string {
  if (anlass === "erstgespraech" || anlass === "beratung") return FESTE_GESPRAECHSDAUER[anlass][sprache];
  return beschriftungDauer(minuten, sprache);
}
