import { supabase } from "@/integrations/supabase/client";
import { executeRecaptcha } from "@/lib/recaptcha";

/**
 * Das Absenden einer öffentlichen Partnerbewerbung, für die Landingpage und
 * die Stellenanzeige.
 *
 * Bewusst über die Edge Function und nicht über `createBewerber`: Ein direkter
 * Schreibzugriff aus dem Browser scheitert hier, weil nicht angemeldeten
 * Besuchern das Einfügerecht auf `bewerbungen` entzogen ist. Die Function
 * schreibt mit der Service-Rolle, meldet intern und bestätigt dem Bewerber.
 */

export type PartnerBewerbungDaten = {
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  ort: string;
  erfahrung: string;
  motivation: string;
  /** Eingangsweg ins CRM, etwa „Website Karriereseite". */
  quelle: string;
  /** Die Antwort des Bewerbers auf „Wie bist du auf uns aufmerksam geworden?". */
  aufmerksamDurch: string;
  stelleId: string;
  stelleTitel: string;
  beschaeftigungsart: string;
  lebenslaufUrl: string;
  lebenslaufName: string;
  /** Honigtopf, muss leer bleiben. */
  hp: string;
  /**
   * Nur die Stellenanzeige setzt das: Dann gibt die Function den Schlüssel
   * des gerade angelegten Kennenlernbogens zurück, für die Überleitung.
   */
  kennenlernLink?: boolean;
  /**
   * Nur die Stellenanzeige setzt das. Der Server erkennt den Weg an diesem
   * festen Feld, nicht am Titeltext:
   *   tippgeber            kein Lebenslauf, keine Kennenlern-Einladung, keine Bewerberseite
   *   finanzdienstleister  wie der Berater, dazu ein Kennzeichen für das Gespräch zum zweiten Produkt
   */
  stelle?: "tippgeber" | "finanzdienstleister";
};

export type PartnerBewerbungAntwort = {
  /** Schlüssel der persönlichen Bewerberseite, leer wenn es keine gibt. */
  seiteToken: string;
  /** Schlüssel des Kennenlernbogens, nur auf Anforderung und nur wenn es ihn gibt. */
  kennenlernenToken: string;
};

/**
 * So sieht ein Schlüssel aus `bewerber_formular` aus: 32 Byte Zufall,
 * hexadezimal (Migration 20260819180000). Dasselbe Muster prüft
 * `submit-bewerbung`, bevor es den Schlüssel herausgibt.
 */
export const KENNENLERN_TOKEN_MUSTER = /^[0-9a-f]{64}$/;

/**
 * Wohin die Stellenanzeige nach dem Absenden weiterleitet.
 *
 * Nur ein Schlüssel in genau der erwarteten Form wird zur Adresse. Alles
 * andere, auch eine leere oder verbogene Antwort, ergibt `null`, und die
 * Seite zeigt den Rückfall „Schau bitte in dein Postfach".
 */
export function kennenlernUeberleitung(
  antwort: Pick<PartnerBewerbungAntwort, "kennenlernenToken"> | null | undefined,
  /**
   * Ein Weg, den der Bogen beim ersten Öffnen vorauswählt, etwa `weg2`
   * („Ich berate zu Geld") für Finanzdienstleister. Der Bewerber kann ihn
   * dort ändern. Nur Buchstaben und Ziffern gehen durch.
   */
  vorbelegterWeg?: string,
): string | null {
  const token = antwort?.kennenlernenToken;
  if (typeof token !== "string" || !KENNENLERN_TOKEN_MUSTER.test(token)) return null;
  const weg = vorbelegterWeg && /^[a-z0-9]{1,20}$/.test(vorbelegterWeg) ? `?weg=${vorbelegterWeg}` : "";
  return `/kennenlernen/${token}${weg}`;
}

/**
 * Schickt die Bewerbung ab. Wirft bei einem Fehler mit einer lesbaren
 * Meldung, damit das Formular sie als Hinweis zeigen kann.
 *
 * Die Antwort wird nicht protokolliert: Sie kann den Schlüssel zum
 * Kennenlernbogen enthalten.
 */
export async function sendePartnerBewerbung(daten: PartnerBewerbungDaten): Promise<PartnerBewerbungAntwort> {
  const recaptchaToken = await executeRecaptcha();
  const { stelle, ...rest } = daten;
  const { data, error } = await supabase.functions.invoke("submit-bewerbung", {
    body: {
      action: "submit",
      ...rest,
      kennenlernLink: daten.kennenlernLink === true,
      // Nur wenn gesetzt: Landingpage und Karriereseite schicken das Feld nicht.
      ...(stelle === "tippgeber" || stelle === "finanzdienstleister" ? { stelle } : {}),
      recaptchaToken,
    },
  });
  if (error) throw error;
  const antwort = (data || {}) as { error?: string; seiteToken?: unknown; kennenlernenToken?: unknown };
  if (antwort.error) throw new Error(antwort.error);
  return {
    seiteToken: typeof antwort.seiteToken === "string" ? antwort.seiteToken : "",
    kennenlernenToken: typeof antwort.kennenlernenToken === "string" ? antwort.kennenlernenToken : "",
  };
}
