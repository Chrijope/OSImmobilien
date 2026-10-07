import { supabase } from "@/integrations/supabase/client";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { hinweisDialog } from "@/lib/confirm";

/**
 * Meldet ein fremdes Konto auf allen Geräten ab (nur Admin und Inhaber, das
 * prüft die Edge Function `manage-sessions`).
 *
 * Wirft bei jedem Fehlschlag einen Fehler mit dem Grund aus der Antwort,
 * etwa „Migration ausstehend …“. Früher verschluckte das Sperren diesen
 * Fehler, und der gesperrte Nutzer arbeitete im offenen Fenster weiter.
 */
export async function beendeSitzungenVon(targetUserId: string, reason?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("manage-sessions", {
    body: { action: "admin-force-logout", targetUserId, reason },
  });
  if (error) {
    const mitGrund = await edgeFehlerMitGrund(error, { functionName: "manage-sessions" });
    throw mitGrund instanceof Error ? mitGrund : new Error("Die Sitzungen konnten nicht beendet werden.");
  }
  const grund = (data as { error?: unknown } | null)?.error;
  if (grund) throw new Error(String(grund));
}

/**
 * Nach dem Sperren: Sitzungen beenden, und wenn das scheitert, einen Hinweis
 * zeigen. Die Sperre selbst steht dann schon und wird nicht zurückgenommen.
 * Gibt zurück, ob das Beenden geklappt hat.
 */
export async function sitzungenNachSperreBeenden(targetUserId: string, name: string): Promise<boolean> {
  try {
    await beendeSitzungenVon(targetUserId, "Konto gesperrt");
    return true;
  } catch (e) {
    console.warn("Sitzungen konnten nicht beendet werden:", e);
    // Nicht abwarten: Der Abschaltdialog darunter soll sich schließen können.
    void hinweisDialog({
      title: "Gesperrt, aber noch nicht abgemeldet",
      description:
        `Das Konto von ${name} ist gesperrt. Die laufenden Sitzungen konnten aber nicht beendet werden:\n\n` +
        `${e instanceof Error ? e.message : String(e)}\n\n` +
        "In einem schon offenen Fenster kann die Person weiterarbeiten, bis sie die Seite neu lädt. " +
        "Versuch es später über „Alle Sessions beenden“ im Menü des Nutzers noch einmal.",
    });
    return false;
  }
}
