/**
 * Test mode guard — blocks all Supabase write operations when the active role is "testaccount".
 * Usage: wrap any insert/update/delete call with `if (isTestMode()) { toast("..."); return; }`
 */

import { toast } from "sonner";

export function isTestMode(): boolean {
  try {
    const raw = localStorage.getItem("mi_current_role");
    return raw === "testaccount";
  } catch {
    return false;
  }
}

/** Call this before any DB write. Returns true if blocked (test mode active). */
export function guardTestWrite(actionLabel?: string): boolean {
  if (!isTestMode()) return false;
  toast.info(
    actionLabel
      ? `Testmodus: „${actionLabel}" wird nur lokal simuliert – keine Daten gespeichert.`
      : "Testmodus: Keine Daten werden in die Datenbank geschrieben.",
    { duration: 3000 }
  );
  return true;
}
