/**
 * Fotos der Einheit und des Objekts für den Bereich „Bilder" im Rechner.
 *
 * Der Reiter „Investmentkalkulation" auf der Einheitsseite startet seit dem
 * 23.09.2026 nicht mehr ohne Fotos: Bis zu sechs Bilder aus der Objektanlage
 * stehen schon im Bereich „Bilder" und damit in der Berechnungs-PDF, ohne dass
 * jemand sie von Hand hochlädt.
 *
 * Zwei Schritte, bewusst getrennt:
 *
 *   1. `rechnerBildAdressen` legt fest, welche Bilder in welcher Reihenfolge
 *      in Frage kommen, rein und ohne Netzzugriff: erst die Fotos der
 *      Einheit, dann die des Objekts mit dem Titelbild vorn. Grundrisse
 *      bleiben draußen, wie im Exposé (`baueExposeInhalt`), doppelte Adressen
 *      fallen weg.
 *   2. `ladeRechnerBilder` holt die Bilder und macht daraus Data-URLs, also
 *      denselben Stoff, den das Hochladen per Dateidialog erzeugt. Ein
 *      vorbelegtes Foto verhält sich im Rechner damit genau wie ein
 *      hochgeladenes: umsortieren, entfernen, Titelbild.
 *
 * Warum Data-URLs und nicht die Adresse selbst: Die PDF entsteht über den
 * Druckdialog aus einem Bereich, der auf dem Bildschirm unsichtbar ist. Das
 * Titelbild steht dort als CSS-Hintergrund, und den lädt der Browser erst,
 * wenn gedruckt wird. Kommt es zu spät, fehlt es in der PDF. Eine befristete
 * Adresse aus einem geschützten Eimer wäre außerdem nach einer Stunde tot.
 * Eine Data-URL steht sofort und bleibt.
 */

import type { ObjektBild, ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { resolveImageUrl } from "@/lib/objekteImages";
import { investagonDokumentPfad, objektDokumentPfad, resolveUnterlagenUrl } from "@/lib/storage";

/** Mehr zeigt die Berechnungs-PDF nicht, und mehr nimmt auch das Hochladen nicht an. */
export const MAX_RECHNER_BILDER = 6;

/** Ein Grundriss ist kein Objektfoto, er gehört nicht auf die Seite „Objekteindrücke". */
const GRUNDRISS = /grundriss/i;

/** Längste Kante nach dem Verkleinern. Reicht für eine A4-Seite und hält die PDF klein. */
const MAX_KANTE = 1600;

function nachReihenfolge(bilder: ObjektBild[] | undefined): ObjektBild[] {
  return [...(bilder ?? [])].sort((a, b) => (a?.reihenfolge || 0) - (b?.reihenfolge || 0));
}

/**
 * Die Bildadressen für den Rechner, in der Reihenfolge, in der sie dort
 * stehen sollen. Das erste Bild wird im Rechner zum Titelbild der PDF.
 *
 * Zurück kommen alle brauchbaren Adressen, nicht nur sechs: Lässt sich eines
 * nicht laden, rückt beim Laden das nächste nach.
 */
export function rechnerBildAdressen(
  objekt: Pick<ObjektData, "bildUrl" | "bilder">,
  wohnung: Pick<ObjektWohnung, "bilder">,
): string[] {
  const kandidaten: Array<{ url?: string; alt?: string }> = [
    ...nachReihenfolge(wohnung.bilder),
    ...(objekt.bildUrl ? [{ url: objekt.bildUrl }] : []),
    ...nachReihenfolge(objekt.bilder),
  ];
  const adressen: string[] = [];
  for (const bild of kandidaten) {
    const url = typeof bild?.url === "string" ? bild.url.trim() : "";
    if (!url || GRUNDRISS.test(bild.alt || "") || adressen.includes(url)) continue;
    adressen.push(url);
  }
  return adressen;
}

/** Lädt ein Bild und gibt es anzeigefertig zurück, oder null, wenn es nicht geht. */
export type BildLader = (adresse: string) => Promise<string | null>;

/**
 * Bis zu `max` Bilder laden, in der Reihenfolge der Adressen.
 *
 * Geladen wird in Stapeln, nur so viele, wie noch Platz ist. Scheitert ein
 * Bild, rückt das nächste nach. Zwei inhaltsgleiche Bilder unter
 * verschiedenen Adressen zählen nur einmal.
 */
export async function ladeRechnerBilder(
  adressen: readonly string[],
  laden: BildLader = bildAlsDataUrl,
  max = MAX_RECHNER_BILDER,
): Promise<string[]> {
  const bilder: string[] = [];
  let rest = [...new Set(adressen)];
  while (bilder.length < max && rest.length > 0) {
    const stapel = rest.slice(0, max - bilder.length);
    rest = rest.slice(stapel.length);
    const geladen = await Promise.all(stapel.map((adresse) => laden(adresse).catch(() => null)));
    for (const bild of geladen) {
      if (bild && bilder.length < max && !bilder.includes(bild)) bilder.push(bild);
    }
  }
  return bilder;
}

/**
 * Die Adresse, unter der sich das Bild abrufen lässt.
 *
 * Objektfotos liegen im öffentlichen Eimer. Sollte doch einmal ein Zeiger auf
 * einen geschützten Eimer darunter sein, braucht er erst eine befristete
 * Adresse, siehe `resolveUnterlagenUrl`. Die Musterbilder der Beispielobjekte
 * stehen als Kürzel in der Datenbank, `resolveImageUrl` macht daraus die Datei.
 */
async function abrufbareAdresse(adresse: string): Promise<string | null> {
  if (objektDokumentPfad(adresse) || investagonDokumentPfad(adresse)) return resolveUnterlagenUrl(adresse);
  return resolveImageUrl(adresse);
}

const BILDTYP_NACH_ENDUNG: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
};

/**
 * Der Bildtyp einer Antwort. Manche Ablagen liefern Bilder als
 * `application/octet-stream`, dann entscheidet die Dateiendung. Eine
 * HTML-Fehlerseite ist kein Bild und ergibt null.
 */
function bildtyp(blob: Blob, url: string): string | null {
  if (blob.type.startsWith("image/")) return blob.type;
  const endung = url.split(/[?#]/)[0].split(".").pop()?.toLowerCase() || "";
  return BILDTYP_NACH_ENDUNG[endung] ?? null;
}

function blobAlsDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const leser = new FileReader();
    leser.onload = () => resolve(typeof leser.result === "string" ? leser.result : null);
    leser.onerror = () => resolve(null);
    leser.readAsDataURL(blob);
  });
}

/**
 * Große Fotos auf höchstens `MAX_KANTE` Pixel verkleinern.
 *
 * Sechs Kamerabilder zu je mehreren Megabyte würden die PDF aufblähen, und
 * sie liegen im Rechner dreifach im Speicher (Eingabe, Vorschau, Druck).
 * Kann der Browser das Bild nicht darstellen, kommt null zurück, dann fällt
 * es heraus, statt in der PDF als leeres Feld zu stehen. Ohne Leinwand, etwa
 * in Tests, bleibt das Bild, wie es ist.
 */
function verkleinern(daten: string): Promise<string | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return Promise.resolve(daten);
  return new Promise((resolve) => {
    // Lädt ein Bild nicht in wenigen Sekunden, bleibt es unverkleinert.
    const notbremse = setTimeout(() => resolve(daten), 5000);
    const bild = new Image();
    bild.onload = () => {
      clearTimeout(notbremse);
      const faktor = MAX_KANTE / Math.max(bild.naturalWidth, bild.naturalHeight);
      // Auch ohne messbare Größe (etwa SVG) bleibt das Original.
      if (!(faktor < 1)) {
        resolve(daten);
        return;
      }
      try {
        const leinwand = document.createElement("canvas");
        leinwand.width = Math.max(1, Math.round(bild.naturalWidth * faktor));
        leinwand.height = Math.max(1, Math.round(bild.naturalHeight * faktor));
        const ctx = leinwand.getContext("2d");
        if (!ctx) {
          resolve(daten);
          return;
        }
        // Transparente Flächen werden weiß, nicht schwarz.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, leinwand.width, leinwand.height);
        ctx.drawImage(bild, 0, 0, leinwand.width, leinwand.height);
        resolve(leinwand.toDataURL("image/jpeg", 0.85));
      } catch {
        resolve(daten);
      }
    };
    bild.onerror = () => {
      clearTimeout(notbremse);
      resolve(null);
    };
    bild.src = daten;
  });
}

/**
 * Ein Bild aus der Objektanlage als Data-URL.
 *
 * Lässt der fremde Server den Abruf aus dem Browser nicht zu (CORS), kommt
 * die Adresse selbst zurück: Als Bild angezeigt und gedruckt wird es dann
 * trotzdem, es lässt sich nur nicht einlesen. Die Objektfotos im eigenen
 * Supabase-Eimer erlauben den Abruf, dort greift das nicht.
 */
export async function bildAlsDataUrl(adresse: string): Promise<string | null> {
  if (adresse.startsWith("data:image/")) return adresse;
  const url = await abrufbareAdresse(adresse);
  if (!url) return null;
  let antwort: Response;
  try {
    antwort = await fetch(url, { credentials: "omit" });
  } catch {
    return url;
  }
  if (!antwort.ok) return null;
  const blob = await antwort.blob();
  const typ = bildtyp(blob, url);
  if (!typ) return null;
  const daten = await blobAlsDataUrl(typ === blob.type ? blob : new Blob([blob], { type: typ }));
  return daten ? verkleinern(daten) : null;
}
