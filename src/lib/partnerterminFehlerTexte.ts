import type { ZweiSprachen } from "@/lib/seitenSprache";

/**
 * Die Fehlersätze der Terminseite `/terminwahl/:token`, Deutsch und Englisch.
 *
 * `bestaetigePartnertermin` liefert neben dem deutschen Satz den Schlüssel
 * (`code`). Die Seite zeigt damit den Satz in der gewählten Sprache und hängt
 * den Fehlercode an, damit der Partner beim Support mehr sagen kann als „ging
 * nicht“. Die Datenbank meldet immer deutsch; welcher Schlüssel zu welcher
 * Meldung gehört, entscheidet der Store.
 *
 * Seit dem 29.09.2026 ist die Seite nur noch für den angemeldeten Partner,
 * dem der Link gehört. Jeder Satz sagt ihm deshalb, wo der Fehler liegt und
 * was er selbst tun kann. Abgeleitet aus den Meldungen von
 * `partnertermin_zugang` und `partnertermin_bestaetigen` (Migrationen
 * 20260929110000 und 20260929130000) und den PostgREST-Codes.
 *
 * Kein Satz darf mehr versprechen, als die Seite tatsächlich tut: Bis zum
 * 29.09.2026 hieß es bei einer fehlenden Funktion, der Termin sei „trotzdem
 * sicher, wir notieren ihn uns selbst“. Gespeichert wurde dabei nichts.
 */
export type PartnerterminFehlerCode =
  | "linkUngueltig"
  | "anlassFehlt"
  | "datumFehlt"
  | "allgemein"
  | "funktionFehlt"
  | "verbindung"
  | "vergangenheit"
  | "zukunft"
  | "unvollstaendig"
  | "bereitsTermin"
  | "gespraechsart"
  | "zuSchnell";

export const PARTNERTERMIN_FEHLER_TEXTE: ZweiSprachen<Record<PartnerterminFehlerCode, string>> = {
  de: {
    linkUngueltig: "Dieser Buchungslink ist abgelaufen, deaktiviert, gehört zu einem anderen Konto oder nicht zur Terminseite. Öffne im Kundenprofil über „Meeting“ die Terminseite neu, dann entsteht ein gültiger Link.",
    anlassFehlt: "Es ist noch keine Gesprächsart gewählt. Wähl zuerst aus, worum es im Termin geht.",
    datumFehlt: "Datum oder Uhrzeit fehlt. Trag beides so ein, wie es in deinem Kalender steht.",
    allgemein: "Beim Eintragen ist ein unbekannter Fehler aufgetreten. Gib bitte dem Support Bescheid und nenn den Fehlercode. Der Termin in deinem Kalender ist davon nicht betroffen.",
    funktionFehlt: "In der Datenbank fehlt die Funktion für die Terminseite, oder sie ist gerade nicht erreichbar. Beheben kannst du das nicht selbst. Gib bitte dem Support Bescheid und nenn den Fehlercode.",
    verbindung: "Die Verbindung zur Datenbank oder dein Internet war gestört, auch nach drei Versuchen. Prüf deine Verbindung und versuch es gleich noch einmal. Ein doppelter Termin entsteht dabei nicht.",
    vergangenheit: "Der eingetragene Zeitpunkt liegt mehr als eine Stunde in der Vergangenheit. Prüf Datum und Uhrzeit mit deinem Kalender.",
    zukunft: "Der Termin liegt mehr als ein Jahr in der Zukunft. Prüf vor allem die Jahreszahl.",
    unvollstaendig: "Datum oder Uhrzeit kam unvollständig an. Trag beides noch einmal vollständig ein.",
    bereitsTermin: "Über diesen Link steht schon ein Termin zu einer anderen Zeit, und der Link lässt nur eine Buchung zu. Ändere den vorhandenen Termin im Kundenprofil oder öffne dort über „Meeting“ die Terminseite neu.",
    gespraechsart: "Für diese Gesprächsart ist in deinem Profil kein Kalenderlink mit https hinterlegt. Trag ihn unter Einstellungen, Profil, Buchungskalender-Links ein und lade die Seite neu.",
    zuSchnell: "Über deine Links sind in der letzten Stunde mehr als 20 Buchungen eingegangen. Zum Schutz vor Missbrauch ist das Eintragen kurz gesperrt. Versuch es in ein paar Minuten noch einmal.",
  },
  en: {
    linkUngueltig: "This booking link has expired, been switched off, belongs to another account or doesn’t belong to the appointment page. Open the appointment page again via “Meeting” in the customer profile to get a valid link.",
    anlassFehlt: "No type of meeting has been chosen yet. First choose what the appointment is about.",
    datumFehlt: "The date or time is missing. Enter both exactly as they appear in your calendar.",
    allgemein: "An unknown error occurred while saving. Please let support know and quote the error code. The appointment in your calendar is not affected.",
    funktionFehlt: "The database function for the appointment page is missing or currently unavailable. You can’t fix this yourself. Please let support know and quote the error code.",
    verbindung: "The connection to the database or your internet connection was interrupted, even after three attempts. Check your connection and try again in a moment. This will not create a duplicate appointment.",
    vergangenheit: "The time you entered is more than an hour in the past. Please check the date and time against your calendar.",
    zukunft: "The appointment is more than a year in the future. Please check the year in particular.",
    unvollstaendig: "The date or time arrived incomplete. Please enter both again in full.",
    bereitsTermin: "An appointment at a different time already exists via this link, and the link only allows one booking. Change the existing appointment in the customer profile or open the appointment page again via “Meeting” there.",
    gespraechsart: "No calendar link starting with https is stored in your profile for this type of meeting. Add it under Settings, Profile, booking calendar links and reload the page.",
    zuSchnell: "More than 20 bookings have come in via your links in the last hour. Entering appointments is briefly blocked to prevent misuse. Please try again in a few minutes.",
  },
};
