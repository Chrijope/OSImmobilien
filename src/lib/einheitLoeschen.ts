/**
 * Der Mülleimer an einer Einheit, in der Verwaltungsansicht
 * (`pages/ObjektDetail.tsx`) und in der Objektliste (`pages/Objekte.tsx`).
 *
 * Erst prüfen, dann fragen, dann löschen:
 *
 *   1. `pruefeEinheitLoeschen` liest den frischen Stand. Ist die Einheit
 *      gesperrt (reserviert, Kunde, Investment, offener Kundenlink …), sagt
 *      ein Hinweis warum, und es gibt keine Rückfrage.
 *   2. Sonst die Rückfrage, mit dem Hinweis, dass Unterlagen und Bilder der
 *      Einheit mitgehen.
 *   3. `deleteWohnung` prüft unmittelbar vor dem Löschen noch einmal. Lehnt
 *      es ab, steht der Grund wieder im Hinweis.
 *
 * Beide Seiten teilen sich diese Datei, damit Texte und Ablauf nicht
 * auseinanderlaufen.
 */
import { confirmDialog, hinweisDialog } from "@/lib/confirm";
import { deleteWohnung, pruefeEinheitLoeschen } from "@/lib/objekteStore";

const HINWEIS_TITEL = "Einheit nicht gelöscht";

/** Gibt `true` zurück, wenn die Einheit gelöscht wurde. */
export async function einheitLoeschenMitRueckfrage(objektId: string, wohnungId: string, weNr?: string): Promise<boolean> {
  const sperre = await pruefeEinheitLoeschen(wohnungId);
  if (sperre) {
    await hinweisDialog({ title: HINWEIS_TITEL, description: sperre });
    return false;
  }

  const nr = String(weNr ?? "").trim();
  const bestaetigt = await confirmDialog({
    title: nr ? `Einheit „${nr}“ löschen?` : "Einheit löschen?",
    description: "Die Einheit wird aus dem Objekt entfernt. Ihre Unterlagen und Bilder werden dabei mitgelöscht. Das lässt sich nicht rückgängig machen.",
    confirmText: "Einheit löschen",
    cancelText: "Behalten",
    variant: "destructive",
  });
  if (!bestaetigt) return false;

  const ergebnis = await deleteWohnung(objektId, wohnungId);
  if (!ergebnis.geloescht) {
    await hinweisDialog({ title: HINWEIS_TITEL, description: ergebnis.grund ?? "Die Einheit konnte nicht gelöscht werden." });
    return false;
  }
  return true;
}
