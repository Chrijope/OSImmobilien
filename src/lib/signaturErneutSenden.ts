/**
 * Einen neuen Unterschriftslink erzeugen und zusenden.
 *
 * Christian hat am 16.09.2026 entschieden, dass Selbstauskunft und
 * Reservierungsvereinbarung beide vierzehn Tage gelten und danach neu
 * versendet werden können. Beide Wege führen über dieselbe Stelle, damit sie
 * sich gleich verhalten: gleicher Ablauf, gleiche Fehlertexte.
 *
 * Wichtig ist dabei die ehrliche Rückmeldung. Ein Fehlschlag kommt auf drei
 * Wegen zurück (siehe `@/lib/versandErgebnis`), und die Edge Functions legen
 * ihren Grund in den Antwortrumpf, den `functions.invoke` nicht liest. Ohne
 * `edgeFehlerMitGrund` stünde in der Meldung nur „Edge Function returned a
 * non-2xx status code“, und eine fehlende Berechtigung sähe aus wie ein
 * Netzproblem.
 *
 * Die alten Links werden hier nicht abgeräumt. Das erledigen die Functions
 * selbst: Beide löschen zu Beginn die offenen Anfragen des Kontakts und legen
 * danach neue an. Erwischt der Kunde die alte Mail, läuft sie ins Leere.
 */

import { supabase } from "@/integrations/supabase/client";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { versandErgebnisLesen, type VersandErgebnis } from "@/lib/versandErgebnis";

/** Um welche Unterschrift es geht. */
export type SignaturArt = "selbstauskunft" | "reservierung";

export interface ErneutSendenAuftrag {
  art: SignaturArt;
  kontaktId: string;
  investmentId?: string | null;
  /** `saData` bei der Selbstauskunft, `rvData` bei der Reservierung. */
  daten: unknown;
  /**
   * Wer unterschreiben soll. `personType` ist maßgeblich
   * (person1/person2 beziehungsweise kaeufer1/kaeufer2), der Name dient in der
   * Function nur noch als Rückfall. Die Adresse holt sie sich selbst aus dem
   * Kontakt (Audit-Befund F03A).
   */
  personen: { name: string; personType: string }[];
}

/**
 * Der Satz, mit dem die Functions eine fehlende Berechtigung ablehnen.
 * Wortgleich mit `ZUGRIFF_ABGELEHNT` in
 * `supabase/functions/_shared/kontakt-signatur-zugriff.ts`.
 */
const ABLEHNUNG_SERVER = "Fuer diesen Kontakt darf keine Unterschrift angefordert werden.";

/**
 * Derselbe Sachverhalt, aber so formuliert, dass der Partner damit etwas
 * anfangen kann. Der Servertext nennt bewusst keinen Grund, damit er nichts
 * über fremde Kontakte verrät; die Oberfläche darf erklären, wen es angeht.
 */
export const ABLEHNUNG_TEXT =
  "Für diesen Kunden darfst du keine Unterschrift anfordern. "
  + "Das kann nur, wer den Kontakt betreut, oder eine Vertretung. "
  + "Bitte wende dich an das Backoffice, wenn du hier zuständig sein solltest.";

/**
 * Die Function selbst hat den Nutzer nicht erkannt (401 „Nicht autorisiert“).
 * Dann hilft nur eine neue Anmeldung, und genau das soll die Meldung sagen
 * statt eines Fachbegriffs. Eine 401 aus dem Mailversand dahinter kommt
 * nicht hier an, sondern mit Status 200 im Feld `results`.
 */
export const ANMELDUNG_ABGELAUFEN_TEXT =
  "Deine Anmeldung ist abgelaufen. Bitte melde dich neu an und sende den Link danach noch einmal.";

/** Erkennt die Ablehnung, egal ob sie als Fehler oder im Rumpf ankommt. */
function istAblehnung(text: string, fehler: unknown): boolean {
  if (text.includes(ABLEHNUNG_SERVER)) return true;
  const status = (fehler as { context?: { status?: number } } | null)?.context?.status;
  return status === 403;
}

/**
 * Sendet die Anfrage und sagt, was dabei herauskam.
 *
 * Wirft nie. Ein Netzfehler kommt als `{ art: "fehler" }` zurück, damit der
 * Aufrufer nur einen Weg zu behandeln hat.
 */
export async function signaturErneutSenden(
  auftrag: ErneutSendenAuftrag,
): Promise<VersandErgebnis> {
  const funktion = auftrag.art === "reservierung"
    ? "send-reservation-signature"
    : "send-signature-request";

  const rumpf: Record<string, unknown> = {
    kontaktId: auftrag.kontaktId,
    investmentId: auftrag.investmentId || undefined,
    persons: auftrag.personen,
  };
  if (auftrag.art === "reservierung") rumpf.rvData = auftrag.daten;
  else rumpf.saData = auftrag.daten;

  let ergebnis: VersandErgebnis;
  try {
    const { data, error } = await supabase.functions.invoke(funktion, { body: rumpf });
    const mitGrund = error ? await edgeFehlerMitGrund(error) : null;
    ergebnis = versandErgebnisLesen(data, mitGrund);
    if (ergebnis.art === "fehler" && istAblehnung(ergebnis.text, mitGrund)) {
      return { art: "fehler", text: ABLEHNUNG_TEXT };
    }
    const status = (mitGrund as { context?: { status?: number } } | null)?.context?.status;
    if (ergebnis.art === "fehler" && status === 401) {
      return { art: "fehler", text: ANMELDUNG_ABGELAUFEN_TEXT };
    }
  } catch (e) {
    console.error(`${funktion}: Versand fehlgeschlagen`, e);
    ergebnis = versandErgebnisLesen(null, e);
  }
  return ergebnis;
}
