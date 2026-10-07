import type { ZweiSprachen } from "@/lib/seitenSprache";

/**
 * Texte der Terminverwaltung `/termin/verwalten/:absageToken`
 * (`BuchungVerwalten.tsx`), Deutsch und Englisch. Plan Kundensprache,
 * Etappe 3 (S4).
 *
 * Nicht hier, weil sie aus der Datenbank kommen und frei gepflegt sind: Name
 * des Kunden und des Ansprechpartners, Bezeichnung der Terminart.
 *
 * Englisch nach dem Glossar (`kundenspracheGlossar.ts`): der Berater heißt
 * „your contact“, nie „advisor“.
 */
export interface BuchungVerwaltenTexte {
  seitentitel: string;
  kennung: string;
  fehltTitel: string;
  fehltText: string;
  ansprechpartnerErsatz: string;
  terminErsatz: string;

  titelAbgesagt: string;
  gruss: (vorname: string) => string;
  einleitungAbgesagt: string;
  einleitungOffen: string;
  einleitungVorbei: string;

  deinTermin: string;
  abgesagterTermin: string;
  wann: string;
  dauer: string;
  anliegen: string;
  gebuchtAuf: string;
  absagen: string;
  verschieben: string;
  keinVerschieben: string;

  absageErklaerung: string;
  grund: string;
  grundPlatzhalter: string;
  dochNicht: string;
  absageBestaetigen: string;
  absageFehler: string;
  abgesagtErfolg: string;

  neueZeit: string;
  neu: string;
  zurueck: string;
  aufDieseZeit: string;
  verschobenErfolg: string;

  anrufHinweis: string;
}

export const BUCHUNG_VERWALTEN_TEXTE: ZweiSprachen<BuchungVerwaltenTexte> = {
  de: {
    seitentitel: "Dein Termin",
    kennung: "Dein Termin",
    fehltTitel: "Dieser Link gehört zu keinem Termin.",
    fehltText: "Der Link ist unvollständig oder den Termin gibt es nicht mehr. Bitte melde dich bei deinem Ansprechpartner.",
    ansprechpartnerErsatz: "Dein Ansprechpartner",
    terminErsatz: "Termin",

    titelAbgesagt: "Dieser Termin ist abgesagt.",
    gruss: (vorname) => `Guten Tag, ${vorname}.`,
    einleitungAbgesagt: "Wenn du doch noch sprechen möchtest, melde dich einfach bei deinem Ansprechpartner. Er findet einen neuen Termin für dich.",
    einleitungOffen: "Hier siehst du deinen Termin. Du kannst ihn jederzeit absagen oder auf eine andere Zeit verschieben.",
    einleitungVorbei: "Dieser Termin liegt bereits hinter dir. Für einen weiteren melde dich einfach bei deinem Ansprechpartner.",

    deinTermin: "Dein Termin",
    abgesagterTermin: "Der abgesagte Termin",
    wann: "Wann",
    dauer: "Dauer",
    anliegen: "Anliegen",
    gebuchtAuf: "Gebucht auf",
    absagen: "Termin absagen",
    verschieben: "Termin verschieben",
    keinVerschieben: "Zum Verschieben fehlt diesem Link die Verbindung zum Buchungskalender. Sag den Termin ab und buche über deinen ursprünglichen Buchungslink neu, oder melde dich kurz bei deinem Ansprechpartner.",

    absageErklaerung: "Der Termin wird abgesagt und die Zeit wird wieder frei. Ein Grund hilft deinem Ansprechpartner, ist aber nicht nötig.",
    grund: "Grund",
    grundPlatzhalter: "Zum Beispiel: Mir ist etwas dazwischengekommen",
    dochNicht: "Doch nicht",
    absageBestaetigen: "Absage bestätigen",
    absageFehler: "Dieser Termin lässt sich nicht mehr absagen. Bitte melde dich bei deinem Ansprechpartner.",
    abgesagtErfolg: "Dein Termin ist abgesagt. Die Zeit ist wieder frei. Eine Bestätigung geht dir per Mail zu, dein Ansprechpartner ist informiert.",

    neueZeit: "Neue Zeit wählen",
    neu: "Neu:",
    zurueck: "Zurück",
    aufDieseZeit: "Auf diese Zeit verschieben",
    verschobenErfolg: "Dein Termin steht jetzt zur neuen Zeit. Der Zugang zum Gespräch bleibt derselbe, die neue Bestätigung geht dir per Mail zu.",

    anrufHinweis: "Kurzfristig etwas dazwischengekommen? Ein Anruf genügt.",
  },
  en: {
    seitentitel: "Your appointment",
    kennung: "Your appointment",
    fehltTitel: "This link doesn’t belong to an appointment.",
    fehltText: "The link is incomplete or the appointment no longer exists. Please get in touch with your contact.",
    ansprechpartnerErsatz: "Your contact",
    terminErsatz: "Appointment",

    titelAbgesagt: "This appointment has been cancelled.",
    gruss: (vorname) => `Hello ${vorname}.`,
    einleitungAbgesagt: "If you’d still like to talk, just get in touch with your contact, who’ll find a new time for you.",
    einleitungOffen: "Here’s your appointment. You can cancel it or move it to a different time whenever you like.",
    einleitungVorbei: "This appointment has already taken place. If you’d like another one, just get in touch with your contact.",

    deinTermin: "Your appointment",
    abgesagterTermin: "The cancelled appointment",
    wann: "When",
    dauer: "Duration",
    anliegen: "Topic",
    gebuchtAuf: "Booked for",
    absagen: "Cancel appointment",
    verschieben: "Reschedule",
    keinVerschieben: "This link isn’t connected to the booking calendar, so it can’t be used to reschedule. Cancel the appointment and book again using your original booking link, or get in touch with your contact.",

    absageErklaerung: "The appointment will be cancelled and the time becomes free again. A reason helps your contact, but it isn’t required.",
    grund: "Reason",
    grundPlatzhalter: "For example: something has come up",
    dochNicht: "Keep appointment",
    absageBestaetigen: "Confirm cancellation",
    absageFehler: "This appointment can no longer be cancelled. Please get in touch with your contact.",
    abgesagtErfolg: "Your appointment has been cancelled and the time is free again. You’ll receive a confirmation by email, and your contact has been informed.",

    neueZeit: "Choose a new time",
    neu: "New:",
    zurueck: "Back",
    aufDieseZeit: "Move to this time",
    verschobenErfolg: "Your appointment is now at the new time. Your access to the meeting stays the same, and you’ll receive the new confirmation by email.",

    anrufHinweis: "Something come up at short notice? A quick call is all it takes.",
  },
};
