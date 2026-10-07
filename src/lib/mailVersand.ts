/**
 * Eine Mailvorlage aus der Anwendung heraus verschicken, mit geprueften
 * Feldern.
 *
 * Bis hierher rief jede Stelle in `src/` `supabase.functions.invoke
 * ("send-transactional-email", ...)` selbst und schickte ein beliebiges
 * `templateData`-Objekt mit. Zwei Dinge gingen dabei still schief:
 *
 *   1. **Die Feldnamen.** Niemand hat geprueft, ob der Absender dieselben
 *      Felder meint wie die Vorlage. Siehe die Begruendung in
 *      `supabase/functions/_shared/transactional-email-templates/felder.ts`.
 *   2. **Die Antwort.** `invoke` meldet nur ab HTTP 400 einen Fehler.
 *      `send-transactional-email` antwortet bei gesperrter Adresse aber mit
 *      Status 200 und `{ success: false }`. Das sah wie ein gelungener
 *      Versand aus.
 *
 * Punkt 2 war auf der Seite der Edge Functions schon geloest, in
 * `supabase/functions/_shared/transactional-versand.ts`. Diese Datei hat
 * keine Deno-eigenen Importe, deshalb wird sie hier weiterverwendet und nicht
 * ein zweites Mal geschrieben. Punkt 1 kommt mit `MailFelder` dazu.
 *
 * Aufrufstellen werden nach und nach umgestellt, nicht auf einen Schlag. Wer
 * hier nicht auftaucht, laeuft weiter wie bisher.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  sendeVorlage,
  type VersandErgebnis,
} from "../../supabase/functions/_shared/transactional-versand";
import type { MailFelder } from "../../supabase/functions/_shared/transactional-email-templates/felder";

/** Alle Vorlagen, deren Felder festgelegt sind. */
export type MailVorlage = keyof MailFelder;

export interface MailAuftrag<V extends MailVorlage> {
  vorlage: V;
  empfaenger: string;
  /** Verhindert doppelten Versand. Gleicher Schluessel, gleiche Mail. */
  idempotenzSchluessel: string;
  /** Genau die Felder, die diese Vorlage erwartet. */
  felder: MailFelder[V];
  /** Antwortadresse, wenn Antworten nicht bei noreply@ landen sollen. */
  antwortAn?: string;
  /**
   * Der Kontakt, dessen Kundensprache gilt. Der Server ermittelt daraus
   * Deutsch oder Englisch, sofern die Vorlage an Kunden geht.
   */
  kontaktId?: string | null;
  /** Die Sprache, wenn sie schon feststeht, etwa aus der Rückfrage. */
  sprache?: "de" | "en";
}

export type { VersandErgebnis };

/**
 * Verschickt die Vorlage und sagt, ob sie wirklich hinausgegangen ist.
 *
 * Wirft nicht. Ein Fehlschlag kommt als `{ ok: false, grund }` zurueck, damit
 * der Aufrufer entscheiden kann, ob er ihn anzeigt oder nur vermerkt.
 */
export function sendeVorlagenMail<V extends MailVorlage>(
  auftrag: MailAuftrag<V>,
): Promise<VersandErgebnis> {
  return sendeVorlage(supabase, {
    templateName: auftrag.vorlage,
    recipientEmail: auftrag.empfaenger,
    idempotencyKey: auftrag.idempotenzSchluessel,
    templateData: auftrag.felder as Record<string, unknown>,
    ...(auftrag.antwortAn ? { replyTo: auftrag.antwortAn } : {}),
    ...(auftrag.kontaktId ? { kontaktId: auftrag.kontaktId } : {}),
    ...(auftrag.sprache ? { sprache: auftrag.sprache } : {}),
  });
}
