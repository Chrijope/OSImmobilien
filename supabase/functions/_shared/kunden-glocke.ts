/**
 * Glockentexte an Kunden aus Edge Functions, Deutsch und Englisch.
 *
 * Plan Kundensprache vom 25.09.2026, P18/K1: `benachrichtigungen` speichert
 * fertigen Text. Deshalb schreibt jede Function den Text gleich in der
 * Sprache aus dem Kundenprofil (`kunden-sprache.ts`). Der Push übernimmt
 * Titel und Text aus der Zeile (K2). Die Browser-Gegenstücke stehen in
 * `src/lib/kundenGlocke.ts`.
 *
 * Nur Texte an KUNDEN. Meldungen an Mitarbeiter bleiben deutsch.
 * Keine Gedankenstriche, Fachbegriffe nach `src/lib/kundenspracheGlossar.ts`.
 */
import type { Sprache } from "./kunden-sprache.ts";
import { euroText } from "./sprach-format.ts";

export interface GlockenText {
  titel: string;
  nachricht: string;
}

/** check-document-reminders: Bonitätsunterlagen fehlen noch. */
export function unterlagenErinnerungText(sprache: Sprache): GlockenText {
  return sprache === "en"
    ? {
      titel: "Reminder: upload your documents",
      nachricht: "Please upload your credit documents in the customer portal. The process can't continue until your documents are complete.",
    }
    : {
      titel: "Erinnerung: Unterlagen hochladen",
      nachricht: "Bitte lade deine Bonitätsunterlagen im Kundenportal hoch. Ohne vollständige Unterlagen kann der Prozess nicht fortgesetzt werden.",
    };
}

/** eigene-investments-reminders: die fünf Anlässe zu eigenen Immobilien. */
export const EIGENE_INVESTMENTS_TEXTE = {
  anschlussfinanzierung(sprache: Sprache, bezeichnung: string, monate: number): GlockenText {
    return sprache === "en"
      ? {
        titel: `Follow-up financing in ${monate} months`,
        nachricht: `The fixed-interest period for “${bezeichnung}” ends in ${monate} months. Now is a good time to review your terms.`,
      }
      : {
        titel: `Anschlussfinanzierung in ${monate} Monaten`,
        nachricht: `Bei „${bezeichnung}" läuft die Zinsbindung in ${monate} Monaten aus. Jetzt Konditionen prüfen.`,
      };
  },
  reinvest(sprache: Sprache, monate: number): GlockenText {
    return sprache === "en"
      ? {
        titel: "Ready for your next property?",
        nachricht: `Your last purchase was ${monate} months ago. Ask your contact at MOREImmo about new properties.`,
      }
      : {
        titel: "Bereit für die nächste Immobilie?",
        nachricht: `Dein letzter Kauf liegt ${monate} Monate zurück. Sprich Deinen Berater auf neue Objekte an.`,
      };
  },
  marktwert(sprache: Sprache, bezeichnung: string): GlockenText {
    return sprache === "en"
      ? {
        titel: "Update the market value",
        nachricht: `Update the market value of “${bezeichnung}” to keep your asset overview accurate.`,
      }
      : {
        titel: "Marktwert aktualisieren",
        nachricht: `Aktualisiere den Marktwert von „${bezeichnung}" für eine genaue Vermögensübersicht.`,
      };
  },
  steuer(sprache: Sprache, bezeichnung: string): GlockenText {
    return sprache === "en"
      ? {
        titel: "Data for your tax return",
        nachricht: `Download the tax cockpit for “${bezeichnung}” as a CSV file and pass it on to your tax advisor.`,
      }
      : {
        titel: "Daten für die Steuererklärung",
        nachricht: `Lade Dir das Steuer-Cockpit für „${bezeichnung}" als CSV herunter und gib es Deinem Steuerberater.`,
      };
  },
  sondertilgung(sprache: Sprache, bezeichnung: string, betragJahr: number): GlockenText {
    return sprache === "en"
      ? {
        titel: "Special repayment possible",
        nachricht: `Plan a special repayment for “${bezeichnung}” now: up to ${euroText(betragJahr, "en")} a year.`,
      }
      : {
        titel: "Sondertilgung möglich",
        // Früher mit Gedankenstrich; Hausregel: keine Gedankenstriche in Kundentexten.
        nachricht: `Jetzt Sondertilgung für „${bezeichnung}" planen, bis zu ${euroText(betragJahr, "de")} jährlich.`,
      };
  },
};

/**
 * Sperrschlüssel der Glocken aus eigene-investments-reminders, je Anlass.
 *
 * Bis zum 04.10.2026 (M11) prüfte die Function nur "heute schon dieselbe
 * Glocke?". Ein Anlass wie "Zinsbindung endet in 12 Monaten" gilt aber einen
 * ganzen Monat lang, und der Kunde bekam ihn jeden Tag. Der Schlüssel steht in
 * `benachrichtigungen.meta.sperre`; derselbe Schlüssel kommt nie zweimal.
 * Wiederkehrende Anlässe tragen deshalb ihr Jahr oder Quartal im Schlüssel.
 */
export const EIGENE_INVESTMENTS_SPERRE = {
  /** Mit dem Zinsbindungsende: Nach einer Anschlussfinanzierung beginnt die Staffel neu. */
  anschlussfinanzierung: (invId: string, zinsbindungBis: string, monate: number) =>
    `anschluss-${invId}-${zinsbindungBis}-${monate}`,
  reinvest: (invId: string, monate: number) => `reinvest-${invId}-${monate}`,
  /** Einmal je Quartal: Monat 0, 3, 6 oder 9. */
  marktwert: (invId: string, heute: Date) => `marktwert-${invId}-${heute.getFullYear()}-${heute.getMonth()}`,
  steuer: (invId: string, heute: Date) => `steuer-${invId}-${heute.getFullYear()}`,
  sondertilgung: (invId: string, heute: Date) => `sond-${invId}-${heute.getFullYear()}`,
};
