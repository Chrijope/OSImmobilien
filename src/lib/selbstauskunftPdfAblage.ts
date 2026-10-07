import { supabase } from "@/integrations/supabase/client";
import type { Sprache } from "./kundenSprache";
import { aktuellerSaPdfPfad, saPdfFehlt, type SaPdfMeta } from "../../supabase/functions/_shared/selbstauskunft-pdf-ablage.ts";

export { aktuellerSaPdfPfad, saPdfFehlt };

/**
 * Die unterschriebene Selbstauskunft als echte Datei am Investment.
 *
 * Das PDF entsteht im Browser (Hausschrift und Logo gibt es nur hier) und geht
 * an `finalize-selbstauskunft`, das es prüft, im Eimer `unterlagen` ablegt und
 * am Investment vermerkt. Die Regeln dazu stehen in
 * `supabase/functions/_shared/selbstauskunft-pdf-ablage.ts`.
 *
 * Drei Wege nutzen das:
 *   1. die Signaturseite nach der letzten Unterschrift per Mail-Link,
 *   2. das Formular, wenn der Kunde über seinen Ausfüll-Link direkt
 *      unterschreibt,
 *   3. das Kundenprofil, wenn zu einer unterschriebenen Selbstauskunft die
 *      Datei fehlt (Bestand oder abgebrochene Ablage).
 *
 * Alles hier wirft nicht. Eine fehlende Ablage macht keine Unterschrift
 * ungültig, und das Kundenprofil holt sie beim nächsten Öffnen nach.
 */

/** Unterschriften, wie `finalize-selbstauskunft` sie liefert (je `person_type`). */
type UnterschriftenRoh = Record<string, { signatureData?: string; signedAt?: string; name?: string } | undefined>;

/** Unterschriften in der Form, die `generateSelbstauskunftPDF` erwartet. */
export function unterschriftenFuerPdf(roh: UnterschriftenRoh | null | undefined): {
  person1?: { signatureData?: string; signedAt?: string };
  person2?: { signatureData?: string; signedAt?: string };
} {
  const r = roh || {};
  // "partner" ist die ältere Bezeichnung der zweiten Person, siehe KundeInvestments.
  const p2 = r.person2 || r.partner;
  return {
    ...(r.person1 ? { person1: { signatureData: r.person1.signatureData, signedAt: r.person1.signedAt } } : {}),
    ...(p2 ? { person2: { signatureData: p2.signatureData, signedAt: p2.signedAt } } : {}),
  };
}

export interface SaPdfAblageErgebnis {
  abgelegt: boolean;
  pfad?: string;
  grund?: string;
}

/** Baut das PDF in der gewohnten Gestaltung und gibt es als Base64 zurück. */
async function baueSaPdfBase64(
  saData: unknown,
  kunde: { vorname: string; nachname: string; moreId: string },
  unterschriften: UnterschriftenRoh | null | undefined,
  sprache: Sprache,
): Promise<string> {
  const { generateSelbstauskunftPDF } = await import("@/lib/selbstauskunftPdf");
  const doc = await generateSelbstauskunftPDF(saData as Parameters<typeof generateSelbstauskunftPDF>[0], kunde, unterschriftenFuerPdf(unterschriften), { sprache });
  return doc.output("datauristring").split(",")[1] || "";
}

/** Schickt das fertige PDF zur Ablage. */
export async function sendeSaPdfZurAblage(args: {
  investmentId: string;
  kontaktId: string;
  pdfBase64: string;
  signatureToken?: string;
  saFillToken?: string;
}): Promise<SaPdfAblageErgebnis> {
  if (!args.pdfBase64) return { abgelegt: false, grund: "Leeres PDF" };
  try {
    const { data, error } = await supabase.functions.invoke("finalize-selbstauskunft", {
      body: {
        investmentId: args.investmentId,
        kontaktId: args.kontaktId,
        pdfBase64: args.pdfBase64,
        ...(args.signatureToken ? { signatureToken: args.signatureToken } : {}),
        ...(args.saFillToken ? { saFillToken: args.saFillToken } : {}),
      },
    });
    if (error) return { abgelegt: false, grund: error.message };
    const antwort = (data || {}) as { pdfAbgelegt?: boolean; pfad?: string; grund?: string; error?: string };
    return antwort.pdfAbgelegt
      ? { abgelegt: true, pfad: antwort.pfad }
      : { abgelegt: false, grund: antwort.grund || antwort.error || "Unbekannt" };
  } catch (e) {
    return { abgelegt: false, grund: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Nach der letzten Unterschrift, mit dem Link des Unterschreibenden als
 * Nachweis. Auf der Signaturseite hat `finalize-selbstauskunft` gerade alle
 * Unterschriften und die Angaben zurückgegeben.
 */
export async function legeSaPdfNachSignaturAb(args: {
  investmentId: string;
  kontaktId: string;
  signatureToken?: string;
  saFillToken?: string;
  saData: unknown;
  unterschriften: UnterschriftenRoh | null | undefined;
  sprache: Sprache;
}): Promise<SaPdfAblageErgebnis> {
  try {
    const d = (args.saData || {}) as { vorname?: string; nachname?: string };
    const pdfBase64 = await baueSaPdfBase64(
      args.saData,
      { vorname: d.vorname || "", nachname: d.nachname || "", moreId: "" },
      args.unterschriften,
      args.sprache,
    );
    return await sendeSaPdfZurAblage({
      investmentId: args.investmentId,
      kontaktId: args.kontaktId,
      pdfBase64,
      signatureToken: args.signatureToken,
      saFillToken: args.saFillToken,
    });
  } catch (e) {
    return { abgelegt: false, grund: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Nach der Unterschrift im Formular über den Ausfüll-Link. Die Antwort von
 * `submit-sa-signature` enthält die Unterschriften nicht, deshalb werden sie
 * mit demselben Link bei `finalize-selbstauskunft` abgeholt. Das ist ohne
 * Nebenwirkung: Die Selbstauskunft ist dann schon abgeschlossen, und die
 * Function meldet nur den Stand.
 */
export async function legeSaPdfNachFormularAb(args: {
  investmentId: string;
  kontaktId: string;
  saFillToken: string;
  sprache: Sprache;
}): Promise<SaPdfAblageErgebnis> {
  try {
    const { data, error } = await supabase.functions.invoke("finalize-selbstauskunft", {
      body: { investmentId: args.investmentId, kontaktId: args.kontaktId, saFillToken: args.saFillToken },
    });
    const stand = (data || {}) as { allSigned?: boolean; signatures?: UnterschriftenRoh; saData?: unknown };
    if (error || !stand.allSigned || !stand.saData) {
      return { abgelegt: false, grund: error?.message || "Noch nicht vollständig unterschrieben" };
    }
    return await legeSaPdfNachSignaturAb({
      investmentId: args.investmentId,
      kontaktId: args.kontaktId,
      saFillToken: args.saFillToken,
      saData: stand.saData,
      unterschriften: stand.signatures,
      sprache: args.sprache,
    });
  } catch (e) {
    return { abgelegt: false, grund: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Aus dem Kundenprofil: Zur unterschriebenen Selbstauskunft fehlt die Datei.
 * Angaben und Unterschriften kommen aus dem Investment selbst. Die Function
 * prüft, dass der Mitarbeiter das Investment sehen darf.
 */
export async function holeSaPdfNach(args: {
  investmentId: string;
  kontaktId: string;
  meta: SaPdfMeta & { saData?: unknown; saSignatures?: UnterschriftenRoh };
  saData: unknown;
  kunde: { vorname: string; nachname: string; moreId: string };
  sprache: Sprache;
}): Promise<SaPdfAblageErgebnis> {
  if (!saPdfFehlt(args.meta)) return { abgelegt: false, grund: "Nichts nachzuholen" };
  if (!args.saData) return { abgelegt: false, grund: "Keine Angaben am Investment" };
  try {
    const pdfBase64 = await baueSaPdfBase64(args.saData, args.kunde, args.meta.saSignatures, args.sprache);
    return await sendeSaPdfZurAblage({ investmentId: args.investmentId, kontaktId: args.kontaktId, pdfBase64 });
  } catch (e) {
    return { abgelegt: false, grund: e instanceof Error ? e.message : String(e) };
  }
}
