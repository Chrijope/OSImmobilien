import { isTestAccount } from "../dbStoreHelper";
import { istKonfiguratorQuelle } from "../../../supabase/functions/_shared/handbuch-funnel.ts";
import {
  schliesseVorstellungsAufgabe,
  stelleVorstellungsAufgabeSicher,
} from "../../../supabase/functions/_shared/handbuch-vorstellung.ts";

/**
 * Nach einer Zuweisung im CRM: Hat ein Handbuch-Lead seine Selbstauskunft
 * schon unterschrieben, bekommt der neue Partner die Aufgabe
 * „Objekt-Vorstellungstermin vereinbaren“, oder die offene wird auf ihn
 * umgehängt. Regeln in supabase/functions/_shared/handbuch-vorstellung.ts.
 *
 * Für alle anderen Leads passiert nichts, nicht einmal eine Abfrage. Wirft
 * nie: Die Zuweisung steht zu diesem Zeitpunkt schon.
 */
export async function vorstellungsAufgabeNachZuweisung(
  kontakt: { id: string; quelle?: string | null } | null | undefined,
  partnerId: string | null | undefined,
  erstellerId?: string | null,
): Promise<void> {
  if (!kontakt?.id || !partnerId || !istKonfiguratorQuelle(kontakt.quelle)) return;
  if (isTestAccount()) return;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await stelleVorstellungsAufgabeSicher(supabase, kontakt.id, partnerId, erstellerId);
  } catch (e) {
    console.warn("Objekt-Vorstellung nach Zuweisung fehlgeschlagen", e);
  }
}

/**
 * Lead zurück im Pool, egal über welchen Weg (`releaseBeraterToPool`): Die
 * offene Aufgabe wird als „abgesagt“ geschlossen. Bei der nächsten Zuteilung
 * entsteht sie neu. Für andere Leads keine Abfrage. Wirft nie.
 */
export async function vorstellungsAufgabeNachPoolRueckgabe(
  kontakt: { id: string; quelle?: string | null } | null | undefined,
): Promise<void> {
  if (!kontakt?.id || !istKonfiguratorQuelle(kontakt.quelle)) return;
  if (isTestAccount()) return;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await schliesseVorstellungsAufgabe(supabase, kontakt.id);
  } catch (e) {
    console.warn("Objekt-Vorstellung nach Rückgabe in den Pool nicht geschlossen", e);
  }
}
