/**
 * Nach dem Senden einer Chatnachricht Glocke und Mail an alle im CRM anstossen.
 *
 * Die Arbeit macht die Edge Function `chat-benachrichtigung`: Sie ermittelt
 * die Empfaenger ueber `chat_teilnehmer`, liest ihre Adressen mit
 * Dienstrechten und schreibt je Empfaenger genau eine Glocke und eine Mail mit
 * Knopf direkt in den Chat. Kunden sind ausgenommen, sie bekommen ihre
 * Meldungen wie bisher aus `ChatVerlauf.tsx`.
 *
 * Diese Funktion wirft nie. Eine fehlgeschlagene Benachrichtigung darf das
 * Senden nicht rueckgaengig aussehen lassen, die Nachricht steht ja.
 */
import { supabase } from "@/integrations/supabase/client";

export type AnstossErgebnis =
  /** Die Function hat die Nachricht angenommen (auch: schon erledigt). */
  | "uebernommen"
  /**
   * Die Function ist nicht erreichbar, etwa weil sie in Lovable noch nicht
   * ausgerollt ist. Dann darf der Browser das Wenige tun, was er bisher tat,
   * die Glocke bei einer @-Erwaehnung.
   */
  | "nicht_erreichbar"
  /** Die Function hat geantwortet, aber mit einem Fehler. */
  | "fehler";

export async function chatBenachrichtigungAnstossen(nachrichtId: string): Promise<AnstossErgebnis> {
  if (!nachrichtId) return "fehler";
  try {
    const { error } = await supabase.functions.invoke("chat-benachrichtigung", {
      body: { nachrichtId },
    });
    if (!error) return "uebernommen";
    return antwortOhneFunction(error) ? "nicht_erreichbar" : "fehler";
  } catch (fehler) {
    console.error("Chat-Benachrichtigung nicht angestossen:", fehler);
    return "nicht_erreichbar";
  }
}

/**
 * Gab es die Function gar nicht? Dann antwortet die Plattform mit 404, oder
 * es kommt ueberhaupt keine Antwort zustande.
 *
 * Nur in diesem Fall springt der Browser fuer die Erwaehnung ein. Hat die
 * Function dagegen gearbeitet und erst spaeter einen Fehler gemeldet, koennte
 * sie die Glocke schon geschrieben haben, und eine zweite waere doppelt.
 */
export function antwortOhneFunction(error: unknown): boolean {
  const status = (error as { context?: { status?: unknown } } | null)?.context?.status;
  if (typeof status !== "number") return true;
  return status === 404;
}
