/**
 * Glocken- und Pushtexte an Kunden, Deutsch und Englisch.
 *
 * Plan Kundensprache vom 25.09.2026, P18, K1 und K2: Die Tabelle
 * `benachrichtigungen` speichert fertigen Text, keine Schlüssel. Deshalb wird
 * der Text gleich beim Anlegen in der Sprache aus dem Kundenprofil
 * geschrieben. Der Push (Trigger auf `benachrichtigungen` → `send-web-push`)
 * übernimmt Titel und Text und ist damit automatisch in derselben Sprache.
 * Alte Einträge bleiben deutsch (Entscheidung 18).
 *
 * Nur Texte an KUNDEN stehen hier. Meldungen an Mitarbeiter bleiben deutsch
 * und stehen weiter bei ihren Aufrufern.
 *
 * Fachbegriffe nach `kundenspracheGlossar.ts`. Keine Gedankenstriche.
 */
import type { Sprache } from "../../supabase/functions/_shared/kunden-sprache.ts";
import { datumText } from "./sprachFormat";
import { dokumentAnzeigeName } from "./dokumentAnzeigeName";

export interface GlockenText {
  titel: string;
  nachricht: string;
}

type Texte<A extends unknown[] = []> = Record<Sprache, (...args: A) => GlockenText>;

/** Datum wie „25.09.2026“ oder „25 Sep 2026“; nicht lesbare Angaben bleiben, wie sie sind. */
function datum(wert: string, sprache: Sprache): string {
  return datumText(wert, sprache) || wert;
}

const EMPFEHLUNGSPROGRAMM: Texte = {
  de: () => ({
    titel: "Empfehlungsprogramm freigeschaltet 🎁",
    nachricht: "Du kannst jetzt über dein Kundenportal Empfehlungen senden und eine Tippgeberprovision erhalten.",
  }),
  en: () => ({
    titel: "Referral programme unlocked 🎁",
    nachricht: "You can now send referrals through your customer portal and receive a referral commission.",
  }),
};

const BONITAET_FREIGEGEBEN: Texte = {
  de: () => ({
    titel: "Bonitätsunterlagen freigegeben ✓",
    nachricht: "Alle eingereichten Bonitätsunterlagen wurden geprüft und freigegeben.",
  }),
  en: () => ({
    titel: "Credit documents approved ✓",
    nachricht: "All the credit documents you submitted have been reviewed and approved.",
  }),
};

const RESERVIERUNG_ABGELEGT: Texte = {
  de: () => ({
    titel: "Reservierungsvereinbarung abgelegt 📄",
    nachricht: "Deine Reservierungsvereinbarung wurde erstellt und liegt in deinem Kundenportal bereit.",
  }),
  en: () => ({
    titel: "Reservation agreement filed 📄",
    nachricht: "Your reservation agreement has been created and is ready in your customer portal.",
  }),
};

const FINANZIERUNG_DOKUMENT: Texte<[string]> = {
  de: (doc) => ({
    titel: "Finanzierungsdokument freigegeben ✓",
    nachricht: `Das Dokument "${doc}" wurde freigegeben und ist jetzt in deinem Kundenportal verfügbar.`,
  }),
  en: (doc) => ({
    titel: "Financing document approved ✓",
    nachricht: `The document "${dokumentAnzeigeName(doc, "en")}" has been approved and is now available in your customer portal.`,
  }),
};

const NOTARTERMIN: Texte<[string, string]> = {
  de: (d, uhrzeit) => ({
    titel: "Notartermin steht fest 📅",
    nachricht: `Dein Notartermin wurde für den ${datum(d, "de")} um ${uhrzeit} Uhr festgelegt. Alle Details findest du in deinem Kundenportal.`,
  }),
  en: (d, uhrzeit) => ({
    titel: "Notary appointment confirmed 📅",
    nachricht: `Your notary appointment (Notartermin) has been set for ${datum(d, "en")} at ${uhrzeit}. You can find all the details in your customer portal.`,
  }),
};

const KUNDENORDNER_DOKUMENT: Texte<[string]> = {
  de: (doc) => ({
    titel: "Neues Dokument im Kundenordner 📁",
    nachricht: `Das Dokument "${doc}" wurde für dich freigegeben und ist jetzt in deinem Kundenordner verfügbar.`,
  }),
  en: (doc) => ({
    titel: "New document in your customer folder 📁",
    nachricht: `The document "${dokumentAnzeigeName(doc, "en")}" has been released to you and is now available in your customer folder.`,
  }),
};

const SELBSTAUSKUNFT_FREIGEGEBEN: Texte = {
  de: () => ({
    titel: "Selbstauskunft freigegeben ✓",
    nachricht: "Deine Selbstauskunft wurde geprüft und freigegeben.",
  }),
  en: () => ({
    titel: "Self-disclosure approved ✓",
    nachricht: "Your self-disclosure (Selbstauskunft) has been reviewed and approved.",
  }),
};

/** Die Stufen, bei deren Wechsel der Kunde eine Glocke bekommt. */
const PIPELINE_STUFEN: Record<string, Record<Sprache, GlockenText>> = {
  reservierung: {
    de: {
      titel: "Reservierung bestätigt 🎉",
      nachricht: "Glückwunsch! Deine Wohnung ist jetzt für dich reserviert. Im Kundenportal siehst du alle Details.",
    },
    en: {
      titel: "Reservation confirmed 🎉",
      nachricht: "Congratulations! Your apartment is now reserved for you. You can see all the details in your customer portal.",
    },
  },
  finanzierung: {
    de: {
      titel: "Finanzierungsphase gestartet 🏦",
      nachricht: "Dein Investment ist in die Finanzierungsphase gewechselt. Wir halten dich über den Fortschritt informiert.",
    },
    en: {
      titel: "Financing phase started 🏦",
      nachricht: "Your investment has moved into the financing phase. We'll keep you updated on the progress.",
    },
  },
  notar: {
    de: {
      titel: "Notarphase gestartet 📜",
      nachricht: "Dein Investment ist jetzt in der Notarphase. Sobald ein Termin feststeht, erhältst du eine Benachrichtigung.",
    },
    en: {
      titel: "Notary phase started 📜",
      nachricht: "Your investment is now in the notary phase. As soon as an appointment is set, you'll receive a notification.",
    },
  },
  faelligkeit: {
    de: {
      titel: "Kaufpreisfälligkeit aktiv ⏳",
      nachricht: "Die Kaufpreisfälligkeit ist eingetragen. Alle Termine und Unterlagen findest du im Kundenportal.",
    },
    en: {
      titel: "Purchase price now due ⏳",
      nachricht: "The purchase price due date (Kaufpreisfälligkeit) has been recorded. You can find all dates and documents in your customer portal.",
    },
  },
  abgeschlossen: {
    de: {
      titel: "Investment abgeschlossen ✓",
      nachricht: "Herzlichen Glückwunsch! Dein Investment wurde erfolgreich abgeschlossen.",
    },
    en: {
      titel: "Investment completed ✓",
      nachricht: "Congratulations! Your investment has been successfully completed.",
    },
  },
};

const UNTERLAGEN_PRUEFUNG: Texte<[number]> = {
  de: (abgelehnt) =>
    abgelehnt > 0
      ? {
        titel: "Unterlagen: Nachreichung erforderlich",
        nachricht: `${abgelehnt} Dokument(e) wurden nicht akzeptiert. Bitte lade neue, gut leserliche PDF-Versionen in deinem Kundenportal hoch.`,
      }
      : {
        titel: "Alle Unterlagen freigegeben ✓",
        nachricht: "Alle eingereichten Bonitäts- und Bankunterlagen wurden geprüft und freigegeben.",
      },
  en: (abgelehnt) =>
    abgelehnt > 0
      ? {
        titel: "Documents: please upload again",
        nachricht: abgelehnt === 1
          ? "1 document was not accepted. Please upload a new, clearly legible PDF version in your customer portal."
          : `${abgelehnt} documents were not accepted. Please upload new, clearly legible PDF versions in your customer portal.`,
      }
      : {
        titel: "All documents approved ✓",
        nachricht: "All the credit and bank documents you submitted have been reviewed and approved.",
      },
};

const CHAT_NACHRICHT: Texte<[string, string]> = {
  de: (absender, vorschau) => ({ titel: `Neue Nachricht von ${absender}`, nachricht: vorschau }),
  en: (absender, vorschau) => ({ titel: `New message from ${absender}`, nachricht: vorschau }),
};

const EIGENFINANZIERUNG_AN: Texte = {
  de: () => ({
    titel: "Eigenfinanzierung freigeschaltet",
    nachricht: "Bitte lade dein Finanzierungsangebot deiner Bank in deinem Kundenportal hoch.",
  }),
  en: () => ({
    titel: "Own financing enabled",
    nachricht: "Please upload your bank's financing offer in your customer portal.",
  }),
};

const EIGENFINANZIERUNG_AUS: Texte = {
  de: () => ({
    titel: "Eigenfinanzierung aufgehoben",
    nachricht: "Der Eigenfinanzierungs-Modus wurde aufgehoben. Die Finanzierung läuft wieder über osimmobilien.netlify.app.",
  }),
  en: () => ({
    titel: "Own financing cancelled",
    nachricht: "Own financing has been cancelled. Your financing will be arranged through OS Immobilien again.",
  }),
};

const GEGENANGEBOT: Texte<[string]> = {
  de: (label) => ({
    titel: `Gegenangebot ${label} von osimmobilien.netlify.app`,
    nachricht: `Wir haben dir ein Gegenangebot (${label}) zur Finanzierung bereitgestellt. Bitte prüfe es in deinem Kundenportal.`,
  }),
  // `label` ist „Darlehensvertrag“ oder „Finanzierungsangebot“.
  en: (label) => {
    const art = dokumentAnzeigeName(label, "en");
    return {
      titel: `Counter-offer from OS Immobilien: ${art}`,
      nachricht: `We've provided a counter-offer (${art.toLowerCase()}) for your financing. Please review it in your customer portal.`,
    };
  },
};

const FINANZIERUNG_BESTAETIGT: Texte = {
  de: () => ({
    titel: "Finanzierung bestätigt",
    nachricht: "Deine Finanzierung wurde bestätigt. Es geht weiter mit dem Notartermin.",
  }),
  en: () => ({
    titel: "Financing confirmed",
    nachricht: "Your financing has been confirmed. The next step is the notary appointment.",
  }),
};

/**
 * Alle Kundentexte der Glocke. Aufruf mit der Sprache aus dem Kundenprofil:
 *
 *   KUNDEN_GLOCKE.notartermin[sprache](datum, uhrzeit)
 */
export const KUNDEN_GLOCKE = {
  empfehlungsprogramm: EMPFEHLUNGSPROGRAMM,
  bonitaetFreigegeben: BONITAET_FREIGEGEBEN,
  reservierungAbgelegt: RESERVIERUNG_ABGELEGT,
  finanzierungDokument: FINANZIERUNG_DOKUMENT,
  notartermin: NOTARTERMIN,
  kundenordnerDokument: KUNDENORDNER_DOKUMENT,
  selbstauskunftFreigegeben: SELBSTAUSKUNFT_FREIGEGEBEN,
  unterlagenPruefung: UNTERLAGEN_PRUEFUNG,
  chatNachricht: CHAT_NACHRICHT,
  eigenfinanzierungAn: EIGENFINANZIERUNG_AN,
  eigenfinanzierungAus: EIGENFINANZIERUNG_AUS,
  gegenangebot: GEGENANGEBOT,
  finanzierungBestaetigt: FINANZIERUNG_BESTAETIGT,
} as const;

/** Text zum Wechsel in eine Pipelinestufe, oder `null`, wenn der Kunde dazu nichts bekommt. */
export function pipelineStufeText(stufe: string, sprache: Sprache): GlockenText | null {
  return PIPELINE_STUFEN[stufe]?.[sprache] ?? null;
}
