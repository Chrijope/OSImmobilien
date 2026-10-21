/**
 * Sie-Fassung der Texte, die die Beratungspräsentation aus den gemeinsamen
 * Texten (`beratungspraesentationTexte.ts`) übernimmt. Seit dem 21.10.2026
 * siezt die Präsentation (Christian); die gemeinsamen Texte nutzt auch die
 * WG-Präsentation, die bleibt unverändert. Darum stehen die Abweichungen hier.
 */
import { BERATUNG_TEXTE } from "@/lib/beratungspraesentationTexte";

const DE = BERATUNG_TEXTE.de;

export const BERATUNG_TEXTE_SIE = {
  ...DE,
  arbeitsweise: {
    ...DE.arbeitsweise,
    erfahrungFrage: "Welche Erfahrungen haben Sie bereits mit Immobilien gemacht?",
    erwartungFrage: "Was ist Ihre Erwartungshaltung an das heutige Gespräch?",
    rahmenErklaerung: "Gerechnet mit 80 Prozent des Überschusses als tragbarer Rate, einer Annuität aus Zins und Tilgung von 6 Prozent und Ihrem Eigenkapital obendrauf.",
  },
  rueckblick: {
    ...DE.rueckblick,
    beitrag: "Ihr monatlicher Beitrag",
    erfahrung: "Ihre Erfahrung mit Immobilien",
    erwartung: "Ihre Erwartung an das heutige Gespräch",
    nummer: "Ihre Angaben",
    rahmen: "Ihr Finanzierungsrahmen",
    titel: "Was [[Sie]] heute gesagt haben",
    vorspann: "Kurz zusammengefasst, damit wir beide sicher sind, dass ich Sie richtig verstanden habe.",
    wichtig: "Das ist Ihnen besonders wichtig",
    ziel: "Ihr wichtigstes Ziel",
    ziele: "Ihre Ziele",
  },
  ueberUns: {
    ...DE.ueberUns,
    ansprechpartner: "Ihr persönlicher Ansprechpartner",
    fest: "Sie haben ab heute einen festen Ansprechpartner, nicht eine Hotline.",
  },
} as typeof DE;
