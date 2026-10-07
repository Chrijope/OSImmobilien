/**
 * Die sechs Fragen des Konfigurators in der Sprache der Seite.
 *
 * Deutsch steht in `_shared/handbuch-funnel.ts`, dort liest es auch der
 * Server für Notiz und Felder am Kontakt. Die bleiben deutsch, sie gehen ins
 * CRM. Hier steht nur die englische Fassung der Fragen, Begründungen und
 * Antworten, für Konfigurator, Handbuch und PDF (seit dem 26.09.2026).
 */
import {
  AUSGANG_TEXT,
  FRAGEN,
  UEBERSCHUSS_RECHENHILFE,
  antwortText,
  type Ausgang,
  type FrageSchluessel,
  type HandbuchRahmen,
} from "../../../supabase/functions/_shared/handbuch-funnel.ts";
import type { Sprache } from "../../../supabase/functions/_shared/kunden-sprache.ts";
import { aufbauSprache, euro, inSprache } from "./diagramme";

interface FrageEn {
  frage: string;
  warum: string;
  antworten: Record<string, string>;
}

export const FRAGEN_EN: Record<FrageSchluessel, FrageEn> = {
  ziel: {
    frage: "What should your flat do for you?",
    warum: "This is how we set the focus of your handbook.",
    antworten: {
      vermoegen: "Build wealth",
      alter: "Provide for retirement",
      steuer: "Lower my tax bill",
      verstehen: "First understand how it works",
    },
  },
  beruf: {
    frage: "What best describes your work situation?",
    warum: "Banks assess each occupational group differently. It decides which documents you will need later.",
    antworten: {
      angestellt: "Employed",
      beamter: "Civil servant (Beamter)",
      selbststaendig: "Self-employed or freelance",
      anderes: "Something else",
    },
  },
  brutto: {
    frage: "Roughly what is your gross annual income?",
    warum: "The higher your tax rate, the more the tax office contributes.",
    antworten: {
      unter_50: "under €50,000",
      "50_80": "€50,000 to €80,000",
      "80_120": "€80,000 to €120,000",
      ueber_120: "over €120,000",
    },
  },
  ueberschuss: {
    frage: "How much is left each month after all fixed costs and loan repayments?",
    warum: "For a bank, what counts is not your salary but what is left at the end of the month.",
    antworten: {
      unter_500: "under €500",
      "500_1000": "€500 to €1,000",
      "1000_1500": "€1,000 to €1,500",
      ueber_1500: "over €1,500",
      unbekannt: "I do not know exactly",
    },
  },
  eigenkapital: {
    frage: "How much equity could you put in?",
    warum: "You usually pay the incidental purchase costs from your own funds.",
    antworten: {
      unter_10: "under €10,000",
      "10_30": "€10,000 to €30,000",
      "30_60": "€30,000 to €60,000",
      ueber_60: "over €60,000",
    },
  },
  start: {
    frage: "When would you like to start?",
    warum: "So we know whether you would like to see flats soon or read at your own pace first.",
    antworten: {
      sofort: "As soon as possible",
      drei_monate: "Within the next three months",
      spaeter: "Later this year or next year",
      informieren: "I am just finding out for now",
    },
  },
};

export const UEBERSCHUSS_RECHENHILFE_EN = [
  "Take your monthly net income.",
  "Subtract rent or mortgage, utilities, groceries, insurance, car and ongoing loan repayments.",
  "What is left on average is your surplus. Savings plans you want to keep do not count.",
];

export const AUSGANG_TEXT_EN: Record<Ausgang, string> = {
  passt: "fits",
  vielleicht: "may fit",
  noch_nicht: "does not fit yet",
};

/** Eine Frage in der Sprache der Seite. */
export function frageIn(sprache: Sprache, nr: number) {
  const f = FRAGEN[nr];
  if (sprache !== "en") return { ...f, rechenhilfe: UEBERSCHUSS_RECHENHILFE };
  const en = FRAGEN_EN[f.schluessel];
  return {
    ...f,
    frage: en.frage,
    warum: en.warum,
    antworten: f.antworten.map((a) => ({ ...a, text: en.antworten[a.id] ?? a.text })),
    rechenhilfe: UEBERSCHUSS_RECHENHILFE_EN,
  };
}

/** Der Text einer Antwort. Ohne Sprache gilt die des laufenden Aufbaus (`inSprache`). */
export function antwortTextIn(schluessel: FrageSchluessel, id: string, sprache: Sprache = aufbauSprache()): string {
  if (sprache !== "en") return antwortText(schluessel, id);
  return FRAGEN_EN[schluessel].antworten[id] ?? antwortText(schluessel, id);
}

export function ausgangTextIn(a: Ausgang, sprache: Sprache = aufbauSprache()): string {
  return sprache === "en" ? AUSGANG_TEXT_EN[a] : AUSGANG_TEXT[a];
}

/** „158.000 bis 222.000 €“, englisch „€158,000 to €222,000“. Gleiche Enden: ein Betrag. */
export function rahmenTextIn(r: Pick<HandbuchRahmen, "von" | "bis">, sprache: Sprache = aufbauSprache()): string {
  return inSprache(sprache, () => {
    if (r.von === r.bis) return euro(r.von);
    return sprache === "en" ? `${euro(r.von)} to ${euro(r.bis)}` : `${euro(r.von).replace(" €", "")} bis ${euro(r.bis)}`;
  });
}
