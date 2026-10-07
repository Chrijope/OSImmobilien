import type { ZweiSprachen } from "@/lib/seitenSprache";

/**
 * Texte des Hinweises „Link nicht mehr gültig“ (`LinkNichtMehrGueltig`),
 * Deutsch und Englisch. Plan Kundensprache, Etappe 3 (S1, S2, S11).
 *
 * Englisch nach dem Glossar (`kundenspracheGlossar.ts`): der Berater heißt
 * „your contact“, nie „advisor“.
 */
export interface LinkNichtMehrGueltigTexte {
  objektvorstellungTitel: string;
  objektvorstellungSatz: string;
  abgelaufenTitel: string;
  abgelaufenSatzObjektuebersicht: string;
  abgelaufenSatzExpose: string;
  ansprechpartner: string;
  laedt: string;
}

export const LINK_NICHT_MEHR_GUELTIG_TEXTE: ZweiSprachen<LinkNichtMehrGueltigTexte> = {
  de: {
    objektvorstellungTitel: "Diese Objektvorstellung ist nicht mehr verfügbar",
    objektvorstellungSatz: "Dein Ansprechpartner schickt dir gern die aktuelle Objektübersicht.",
    abgelaufenTitel: "Dieser Link ist nicht mehr gültig",
    abgelaufenSatzObjektuebersicht: "Der persönliche Link zu deiner Objektübersicht ist abgelaufen. Melde dich gern, dann bekommst du einen neuen.",
    abgelaufenSatzExpose: "Der persönliche Link zu deinem Exposé ist abgelaufen. Melde dich gern, dann bekommst du einen neuen.",
    ansprechpartner: "Dein Ansprechpartner",
    laedt: "Wird geladen",
  },
  en: {
    objektvorstellungTitel: "This property presentation is no longer available",
    objektvorstellungSatz: "Your contact will be happy to send you the current property overview.",
    abgelaufenTitel: "This link is no longer valid",
    abgelaufenSatzObjektuebersicht: "The personal link to your property overview has expired. Just get in touch and you’ll receive a new one.",
    abgelaufenSatzExpose: "The personal link to your exposé has expired. Just get in touch and you’ll receive a new one.",
    ansprechpartner: "Your contact",
    laedt: "Loading",
  },
};
