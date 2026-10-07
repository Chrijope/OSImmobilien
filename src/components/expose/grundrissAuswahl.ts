import { HOECHSTENS_PLAENE_EINHEIT, HOECHSTENS_PLAENE_OBJEKT } from "../../../supabase/functions/_shared/grundriss-erkennung.ts";

/**
 * Wie viele Pläne die Exposé-Seite zeigt.
 *
 * Christian am 24.09.2026: Im Exposé einer Einheit steht genau ein Grundriss,
 * der dieser Einheit. Die Auswahl selbst trifft `grundrisseWaehlen`
 * (`_shared/grundriss-erkennung.ts`), im Browser wie im Server. Diese
 * Kürzung ist die zweite Sicherung für den Kundenlink: Er bekommt seine
 * Pläne vom Server (`get-expose`), und bis die Function neu ausgerollt ist,
 * liefert sie noch bis zu drei.
 *
 * Das Exposé des ganzen Objekts behält seine Obergrenze.
 */
export function grundrisseFuerAnsicht<T>(plaene: readonly T[], ansicht: "einheit" | "objekt" | undefined): T[] {
  return plaene.slice(0, ansicht === "objekt" ? HOECHSTENS_PLAENE_OBJEKT : HOECHSTENS_PLAENE_EINHEIT);
}
