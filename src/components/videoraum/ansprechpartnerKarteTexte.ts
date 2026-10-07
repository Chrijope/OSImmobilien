import type { ZweiSprachen } from "@/lib/seitenSprache";

/**
 * Texte der Ansprechpartnerkarte (`AnsprechpartnerKarte` in `Warteraum.tsx`),
 * Deutsch und Englisch. Plan Kundensprache, Etappe 3.
 *
 * Die Karte steht im Videoraum und auf den Buchungsseiten (S3, S4, S5).
 * Englisch nach dem Glossar: „your contact“, nie „advisor“.
 */
export interface AnsprechpartnerKarteTexte {
  titel: string;
  mailOhneName: string;
  anrufenOhneName: string;
  mailAn: (name: string) => string;
  anrufen: (name: string) => string;
}

export const ANSPRECHPARTNER_KARTE_TEXTE: ZweiSprachen<AnsprechpartnerKarteTexte> = {
  de: {
    titel: "Dein Ansprechpartner",
    mailOhneName: "E-Mail schreiben",
    anrufenOhneName: "Anrufen",
    mailAn: (name) => `E-Mail an ${name} schreiben`,
    anrufen: (name) => `${name} anrufen`,
  },
  en: {
    titel: "Your contact",
    mailOhneName: "Send an email",
    anrufenOhneName: "Call",
    mailAn: (name) => `Send an email to ${name}`,
    anrufen: (name) => `Call ${name}`,
  },
};
