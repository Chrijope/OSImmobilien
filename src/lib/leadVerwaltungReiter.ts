import type { KampagnenKennung } from "@/lib/kampagnenKennung";
import { kanalText } from "@/lib/handbuch/wege";
import type { KundeData } from "@/lib/kundenStore";

/**
 * Die Lead-Verwaltung hat seit dem 01.10.2026 zwei Reiter: „Leads“ mit allen
 * offenen Leads außer Rückläufern, und „Rückläufer“ (`istRuecklaeufer`).
 * Hier steht nur, wie der Quellen-Filter im Reiter „Leads“ gruppiert.
 */

/**
 * Kommt der Lead aus einer Meta-Kampagne, nach der Quelle?
 *
 * Dieselbe Regel wie `formatMetaQuelle` in `supabase/functions/submit-lead`:
 * Was dort als Meta erkannt wird, heißt danach „Meta Ads: <Stadt>“ oder
 * behält seinen Namen („Meta Kampagne“ aus dem Anlegen-Dialog). Ändert sich
 * die Regel dort, muss sie hier mit.
 */
export function istMetaQuelle(quelle: string | null | undefined): boolean {
  const q = (quelle || "").toLowerCase();
  return q.includes("meta") || q.includes("facebook") || q.includes("lead form");
}

export type QuellenGruppe = "meta" | "handbuch" | "rechner" | "website" | "sonstige";

/** Die Auswahl im Quellen-Filter, in dieser Reihenfolge. */
export const QUELLEN_GRUPPEN: { wert: QuellenGruppe; text: string }[] = [
  { wert: "meta", text: "Meta-Kampagnen" },
  { wert: "handbuch", text: "Handbuch-Seite" },
  { wert: "rechner", text: "Rechner und Tools" },
  { wert: "website", text: "Website" },
  { wert: "sonstige", text: "Sonstige" },
];

/**
 * Zu welcher Gruppe gehört der Lead im Quellen-Filter?
 *
 * Die Muster für Rechner und Website folgen `HERKUNFT_MUSTER` in
 * `supabase/functions/_shared/lead-zuordnung.ts`. Meta zählt auch über die
 * Kampagnenkennung (Zapier liefert die Plattform fb oder ig mit, auch wenn
 * die Quelle fehlt).
 */
export function quellenGruppe(
  k: Pick<KundeData, "quelle" | "leadTyp">,
  angaben: { ausHandbuch: boolean; kampagne?: KampagnenKennung | null },
): QuellenGruppe {
  if (angaben.ausHandbuch) return "handbuch";
  if (istMetaQuelle(k.quelle)) return "meta";
  if (angaben.kampagne && kanalText(angaben.kampagne).startsWith("Meta")) return "meta";
  const q = k.quelle || "";
  if (/analyse|steuer|expats|rechner/i.test(q)) return "rechner";
  if (/website|microseite|landingpage|beraterseite/i.test(q) || k.leadTyp === "website") return "website";
  return "sonstige";
}
