/**
 * Prüft nach, was aus einer eben abgeschickten E-Mail geworden ist.
 *
 * Anlass: Die Oberfläche meldete "Einladung versendet", der Kunde bekam aber
 * nichts. Der Versand läuft über eine Warteschlange, die ein Hintergrundjob
 * abarbeitet. Ob die Mail wirklich raus ist, steht im Versandprotokoll, und
 * genau dort schaut diese Funktion nach, statt es zu vermuten.
 *
 * Ohne Leserecht auf das Protokoll, also für alle außer Admin und Inhaber,
 * kommt "unbekannt" zurück. Dann bleibt die neutrale Aussage "ist im Versand".
 */
import { supabase } from "@/integrations/supabase/client";

export type MailStatus =
  | "zugestellt"
  | "wartet"
  | "abgemeldet"
  | "fehlgeschlagen"
  | "nichts_gefunden"
  | "unbekannt";

export interface MailBefund {
  status: MailStatus;
  /** Ein Satz, der dem Nutzer sagt, was passiert ist. */
  text: string;
  fehler?: string;
}

const TEXT: Record<MailStatus, string> = {
  zugestellt: "Die Einladung wurde an den Mailanbieter übergeben.",
  wartet: "Die Einladung steht in der Warteschlange und geht in den nächsten Minuten raus.",
  abgemeldet: "Der Empfänger hat sich vom Mailversand abgemeldet, deshalb wurde nichts verschickt.",
  fehlgeschlagen: "Der Versand ist fehlgeschlagen.",
  nichts_gefunden: "Es wurde keine E-Mail abgeschickt.",
  unbekannt: "Der Versandstatus lässt sich hier nicht prüfen.",
};

/**
 * @param empfaenger E-Mail-Adresse.
 * @param sekunden   Wie weit zurück geschaut wird.
 */
export async function pruefeMailStatus(empfaenger: string, sekunden = 120): Promise<MailBefund> {
  if (!empfaenger) return { status: "unbekannt", text: TEXT.unbekannt };
  const seit = new Date(Date.now() - sekunden * 1000).toISOString();

  try {
    const { data, error } = await supabase
      .from("email_send_log")
      .select("status, error_message, created_at")
      .eq("recipient_email", empfaenger.toLowerCase())
      .gte("created_at", seit)
      .order("created_at", { ascending: false })
      .limit(1);

    // Kein Leserecht oder Tabelle nicht erreichbar: nicht raten.
    if (error) return { status: "unbekannt", text: TEXT.unbekannt };

    const eintrag = (data || [])[0] as { status?: string; error_message?: string } | undefined;
    if (!eintrag) return { status: "nichts_gefunden", text: TEXT.nichts_gefunden };

    switch (eintrag.status) {
      case "sent":
        return { status: "zugestellt", text: TEXT.zugestellt };
      case "pending":
        return { status: "wartet", text: TEXT.wartet };
      case "suppressed":
        return { status: "abgemeldet", text: TEXT.abgemeldet };
      default:
        return {
          status: "fehlgeschlagen",
          text: TEXT.fehlgeschlagen,
          fehler: eintrag.error_message || undefined,
        };
    }
  } catch {
    return { status: "unbekannt", text: TEXT.unbekannt };
  }
}
