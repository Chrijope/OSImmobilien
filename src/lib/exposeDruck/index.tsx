import type { ExposeInhalt } from "../exposeInhalt";
import type { ExposeAnnahmen } from "../exposeAnnahmen";
import type { ExposeErgebnis } from "../exposeRechner";
import { baueDruckDaten, type DruckOptionen } from "./daten";
import { browserLader, ladeDruckBilder } from "./bilder";
import { registriereHausschrift } from "./baukasten";
import { H3Nachtblau } from "./H3Nachtblau";

export { exposePdfDateiname } from "./daten";

/**
 * Das Exposé als PDF im Browser, Design H3 „Nachtblau“ (seit 01.10.2026 das
 * einzige Exposé-PDF). Alle Einstiege rufen das hier auf: Exposé-Seite und
 * Kundenlink (`exposePdfHerunterladen`), interne Einheitenansicht
 * (`ObjektExpose`), Kundenansicht (`kundenansichtExpose`), Kundenportal und
 * die gespeicherten Wohnungsexposés der Objektverwaltung.
 *
 * Wer das hier importiert, sollte es dynamisch tun (`await import`): So kommt
 * react-pdf erst beim Klick in den Browser.
 */
export async function exposeDruckPdf(
  inhalt: ExposeInhalt,
  annahmen: ExposeAnnahmen,
  ergebnis: ExposeErgebnis,
  optionen: DruckOptionen = {},
): Promise<Blob> {
  const { pdf } = await import("@react-pdf/renderer");
  registriereHausschrift("");
  const bilder = await ladeDruckBilder(inhalt, browserLader);
  const daten = baueDruckDaten(inhalt, annahmen, ergebnis, bilder, optionen);
  return pdf(<H3Nachtblau d={daten} />).toBlob();
}
