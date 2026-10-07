/**
 * Der persönliche Handbuch-Link aus der Willkommensmail (seit 30.09.2026).
 *
 * Der Lead ist schon Kontakt. Er beantwortet die sechs Fragen, tippt aber
 * keine Kontaktdaten mehr ein, sondern bestätigt Vorname und gekürzte Mail
 * und setzt den Pflicht-Haken. Der Server (Function `handbuch-einladung`)
 * kennt den Kontakt allein über das Token.
 *
 * Kein Meta Pixel auf diesem Weg: Das Token steht in der Adresse, und ein
 * bekannter Kontakt ist kein neuer Lead.
 */
import { leadFehlermeldung, leadNetzfehlerMeldung, retryAfterSekunden } from "@/lib/leadFehlermeldung";
import { baueHandbuchEinwilligung } from "@/lib/leadEinwilligung";
import { projektUrl, type HandbuchLeadErgebnis } from "./leadAbsenden";
import type { HandbuchAntworten } from "../../../supabase/functions/_shared/handbuch-funnel.ts";
import type { Sprache } from "../../../supabase/functions/_shared/kunden-sprache.ts";

export interface HandbuchEinladungDaten {
  token: string;
  vorname: string;
  emailMaskiert: string;
}

export type EinladungStand =
  | { status: "laden" }
  | { status: "ok"; daten: HandbuchEinladungDaten; beraterSlug: string | null }
  | { status: "abgelaufen" }
  | { status: "unbekannt" };

async function rufe(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${projektUrl()}/handbuch-einladung`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function ladeEinladung(token: string): Promise<EinladungStand> {
  try {
    const res = await rufe({ aktion: "lesen", token });
    if (res.status === 410) return { status: "abgelaufen" };
    if (!res.ok) return { status: "unbekannt" };
    const json = (await res.json()) as Record<string, unknown>;
    return {
      status: "ok",
      daten: {
        token,
        vorname: typeof json.vorname === "string" ? json.vorname : "",
        emailMaskiert: typeof json.emailMaskiert === "string" ? json.emailMaskiert : "",
      },
      beraterSlug: typeof json.beraterSlug === "string" && json.beraterSlug ? json.beraterSlug : null,
    };
  } catch {
    return { status: "unbekannt" };
  }
}

/** Der Rumpf der Anfrage. Eigene Funktion, damit ihn ein Test ohne Netz prüfen kann. */
export function einladungRumpf(args: {
  token: string;
  antworten: HandbuchAntworten;
  einwilligung: boolean;
  sprache?: Sprache;
  jetzt?: string;
}): Record<string, unknown> {
  const sprache: Sprache = args.sprache === "en" ? "en" : "de";
  return {
    aktion: "absenden",
    token: args.token,
    antworten: args.antworten,
    dsgvo_consent: baueHandbuchEinwilligung(args.einwilligung, false, args.jetzt, sprache),
    sprache,
  };
}

export async function sendeEinladung(args: {
  token: string;
  antworten: HandbuchAntworten;
  einwilligung: boolean;
  sprache?: Sprache;
}): Promise<HandbuchLeadErgebnis> {
  const sprache: Sprache = args.sprache === "en" ? "en" : "de";
  try {
    const res = await rufe(einladungRumpf(args));
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      json = {};
    }
    if (!res.ok) {
      return { ok: false, status: res.status, fehler: leadFehlermeldung(res.status, retryAfterSekunden(res.headers), sprache, "sie") };
    }
    return { ok: true, handbuchToken: null, saToken: null, zustellung: json.zustellung === "fehler" ? "fehler" : "ok" };
  } catch {
    return { ok: false, fehler: leadNetzfehlerMeldung(sprache, "sie") };
  }
}

/** Die Texte der Bestätigungskarte und der Seite, gesiezt wie die ganze Handbuch-Strecke. */
export const EINLADUNG_TEXTE = {
  de: {
    titel: (vorname: string) => (vorname ? `Fast geschafft, ${vorname}` : "Fast geschafft"),
    hinweis: "Ihre Kontaktdaten haben wir schon. Ihr Handbuch sehen Sie gleich hier, den Link bekommen Sie zusätzlich per E-Mail an:",
    nichtIch: "Das sind nicht Sie?",
    nichtIchLink: "Zum allgemeinen Fragebogen",
    fehlerAbgelaufen: "Dieser persönliche Link ist abgelaufen. Sie können Ihr Handbuch trotzdem über den allgemeinen Fragebogen anfordern.",
    fehlerUnbekannt: "Diesen persönlichen Link kennen wir nicht. Sie können Ihr Handbuch über den allgemeinen Fragebogen anfordern.",
    zumFragebogen: "Zum Fragebogen",
    laedt: "Einen Moment bitte",
    lead: "Ein Klick pro Frage. Ihre Kontaktdaten haben wir schon.",
  },
  en: {
    titel: (vorname: string) => (vorname ? `Almost done, ${vorname}` : "Almost done"),
    hinweis: "We already have your contact details. You will see your handbook right here, and we will also send the link by email to:",
    nichtIch: "Not you?",
    nichtIchLink: "Go to the general questionnaire",
    fehlerAbgelaufen: "This personal link has expired. You can still request your handbook via the general questionnaire.",
    fehlerUnbekannt: "We do not recognise this personal link. You can request your handbook via the general questionnaire.",
    zumFragebogen: "Go to the questionnaire",
    laedt: "One moment please",
    lead: "One click per question. We already have your contact details.",
  },
} as const;
