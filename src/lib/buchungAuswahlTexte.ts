import type { ZweiSprachen } from "@/lib/seitenSprache";

/**
 * Texte der Beschriftungen in `buchungAuswahl.ts`, Deutsch und Englisch.
 * Plan Kundensprache, Etappe 3 (S3, S4, S5).
 *
 * Die kurzen Tages- und Monatsnamen der Wochenansicht stehen hier als Liste,
 * weil `sprachFormat.ts` kein Datum ohne Jahr kennt. Das lange Datum kommt im
 * Englischen aus `datumLangText`, im Deutschen bleibt es bei der Liste in
 * `buchungAuswahl.ts`, damit sich an der deutschen Anzeige nichts ändert.
 *
 * Die Fehlertexte gehören zu `deuteBuchungsfehler`: Die Datenbank meldet auf
 * Deutsch, die Seite zeigt den passenden Satz in der Sprache des Kunden.
 */
export interface BuchungAuswahlTexte {
  /** Sonntag zuerst, wie `Date.getUTCDay`. */
  wochentageKurz: string[];
  monateKurz: string[];
  tageszeiten: { vormittag: string; nachmittag: string; abend: string };
  /** Kopf einer Tagesspalte, etwa „4. Aug.“ oder „4 Aug“. */
  tagesdatum: (tag: number, monatKurz: string) => string;
  /** „Montag, 4. August 2026, 09:30 bis 10:30 Uhr“. */
  zeitraum: (datumLang: string, von: string, bis: string) => string;
  /** „Montag, 4. August 2026, 09:30 Uhr“. */
  zeitpunkt: (datumLang: string, uhrzeit: string) => string;
  /** „1 Stunde 30 Minuten“. */
  dauer: (minuten: number) => string;
  fehler: {
    vergeben: string;
    keinTerminMoeglich: string;
    kurzfristig: string;
    zuWeit: string;
    linkUngueltig: string;
    terminart: string;
    email: string;
    name: string;
    zuViele: string;
    absagen: string;
    verschieben: string;
    allgemein: string;
  };
}

export const BUCHUNG_AUSWAHL_TEXTE: ZweiSprachen<BuchungAuswahlTexte> = {
  de: {
    wochentageKurz: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
    monateKurz: [
      "Jan.", "Feb.", "März", "Apr.", "Mai", "Juni",
      "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez.",
    ],
    tageszeiten: { vormittag: "Vormittag", nachmittag: "Nachmittag", abend: "Abend" },
    tagesdatum: (tag, monat) => `${tag}. ${monat}`,
    zeitraum: (datum, von, bis) => `${datum}, ${von} bis ${bis} Uhr`,
    zeitpunkt: (datum, uhrzeit) => `${datum}, ${uhrzeit} Uhr`,
    dauer: (minuten) => {
      if (minuten < 60) return `${minuten} Minuten`;
      const stunden = Math.floor(minuten / 60);
      const rest = minuten % 60;
      const stundenText = stunden === 1 ? "1 Stunde" : `${stunden} Stunden`;
      return rest === 0 ? stundenText : `${stundenText} ${rest} Minuten`;
    },
    fehler: {
      vergeben: "Diese Zeit wurde gerade eben von jemand anderem gebucht. Wir haben die freien Zeiten für dich aktualisiert, bitte wähle eine andere.",
      keinTerminMoeglich: "Zu dieser Zeit ist kein Termin mehr möglich. Bitte wähle eine der aktualisierten Zeiten.",
      kurzfristig: "Dieser Termin liegt zu kurzfristig. Bitte wähle eine spätere Zeit.",
      zuWeit: "Dieser Termin liegt zu weit in der Zukunft. Bitte wähle eine frühere Zeit.",
      linkUngueltig: "Dieser Buchungslink ist nicht mehr gültig. Bitte melde dich bei deinem Ansprechpartner.",
      terminart: "Dieses Anliegen steht gerade nicht zur Auswahl. Bitte lade die Seite neu.",
      email: "Bitte gib eine gültige E-Mail-Adresse an.",
      name: "Bitte gib deinen Namen an.",
      zuViele: "Gerade sind sehr viele Buchungen eingegangen. Bitte versuch es in einer Stunde noch einmal.",
      absagen: "Dieser Termin lässt sich nicht mehr absagen.",
      verschieben: "Dieser Termin lässt sich nicht mehr verschieben.",
      allgemein: "Die Buchung hat leider nicht geklappt. Bitte versuch es noch einmal.",
    },
  },
  en: {
    wochentageKurz: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    monateKurz: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    // Weiche Trennstellen (­): In schmalen Spalten trennt der Browser
    // englische Großbuchstaben sonst nicht und bricht mitten im Wort um.
    tageszeiten: { vormittag: "Morn­ing", nachmittag: "After­noon", abend: "Evening" },
    tagesdatum: (tag, monat) => `${tag} ${monat}`,
    zeitraum: (datum, von, bis) => `${datum}, ${von} to ${bis}`,
    zeitpunkt: (datum, uhrzeit) => `${datum}, ${uhrzeit}`,
    dauer: (minuten) => {
      if (minuten < 60) return `${minuten} ${minuten === 1 ? "minute" : "minutes"}`;
      const stunden = Math.floor(minuten / 60);
      const rest = minuten % 60;
      const stundenText = stunden === 1 ? "1 hour" : `${stunden} hours`;
      return rest === 0 ? stundenText : `${stundenText} ${rest} minutes`;
    },
    fehler: {
      vergeben: "Someone else has just booked this time. We’ve updated the available times for you, please choose another one.",
      keinTerminMoeglich: "An appointment is no longer possible at this time. Please choose one of the updated times.",
      kurzfristig: "This appointment is too soon. Please choose a later time.",
      zuWeit: "This appointment is too far in the future. Please choose an earlier time.",
      linkUngueltig: "This booking link is no longer valid. Please get in touch with your contact.",
      terminart: "This topic isn’t available right now. Please reload the page.",
      email: "Please enter a valid email address.",
      name: "Please enter your name.",
      zuViele: "We’ve just received a lot of bookings. Please try again in an hour.",
      absagen: "This appointment can no longer be cancelled.",
      verschieben: "This appointment can no longer be rescheduled.",
      allgemein: "Unfortunately the booking didn’t go through. Please try again.",
    },
  },
};
