import type { ObjektUnterlagenQuelle } from "./objektUnterlagen";
/**
 * Aufruf der Edge Function `investmentrechner-unterlagen`.
 *
 * Hier steht nur der Datenverkehr: Unterlagen einpacken, Function rufen,
 * Fehler in eine verständliche Meldung übersetzen. Prüfung und Abbildung der
 * Antwort macht unterlagenKiFelder.ts, damit das ohne Supabase testbar ist.
 */

import type { UnterlagenDokument } from "./unterlagenAuslesen";
import { anfrageDokument, hatText, kiAntwortAufGesamtkaufpreis, type AnfrageDokument, type KiAntwort } from "./unterlagenKiFelder";

/** Scans gehen als ganze PDF mit, aber nur bis zu dieser Größe und Anzahl. */
const MAX_SCAN_BYTES = 4 * 1024 * 1024;
const MAX_SCANS = 2;

/** Fehler mit einer Meldung, die so in der Oberfläche stehen kann. */
export class UnterlagenKiFehler extends Error {}

function alsBase64(bytes: Uint8Array): string {
  let binaer = "";
  // Stückweise, sonst sprengt String.fromCharCode bei großen Dateien den Stapel.
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binaer += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binaer);
}

/**
 * Unterlagen für die Anfrage einpacken. Scans ohne Textebene werden als PDF
 * mitgeschickt, damit die KI sie selbst lesen kann.
 */
export async function anfrageZusammenstellen(documents: readonly UnterlagenDokument[]): Promise<AnfrageDokument[]> {
  const dokumente: AnfrageDokument[] = [];
  let scans = 0;
  for (const original of documents) {
    const dokument = anfrageDokument(original);
    if (!dokument) continue;
    if (!hatText(dokument)) {
      const datei = original.datei;
      const istPdf = datei
        ? datei.type === "application/pdf" || datei.name.toLowerCase().endsWith(".pdf")
        : false;
      // Was weder Text noch eine passende PDF hat, bringt der KI nichts.
      if (!datei || !istPdf || scans >= MAX_SCANS || datei.size > MAX_SCAN_BYTES) continue;
      dokument.pdfBase64 = alsBase64(new Uint8Array(await datei.arrayBuffer()));
      scans += 1;
    }
    dokumente.push(dokument);
  }
  return dokumente;
}

/**
 * Die Rechnerfelder aus den Unterlagen auslesen lassen. Wirft
 * UnterlagenKiFehler mit einer Meldung für die Oberfläche.
 */
export async function felderAusUnterlagenAuslesen(documents: readonly UnterlagenDokument[], kontext?: Omit<ObjektUnterlagenQuelle, "dokumente">): Promise<KiAntwort> {
  const dokumente = await anfrageZusammenstellen(documents);
  if (dokumente.length === 0) {
    throw new UnterlagenKiFehler("Keine der Unterlagen enthält auslesbaren Text.");
  }
  // Erst hier laden, damit der Rechner und seine Tests ohne Supabase auskommen.
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.functions.invoke("investmentrechner-unterlagen", {
    body: { dokumente, kontext },
  });
  if (error) {
    // Die Function antwortet mit einer deutschen Meldung im Body, wenn sie
    // selbst den Fehler erkannt hat, etwa beim Tageslimit.
    const meldung = await meldungAusFehler(error);
    console.error("investmentrechner-unterlagen Fehler:", error);
    throw new UnterlagenKiFehler(meldung);
  }
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
    throw new UnterlagenKiFehler(data.error);
  }
  // Eine noch nicht neu ausgerollte Function liefert den Kaufpreis ohne Möbel.
  return kiAntwortAufGesamtkaufpreis(data as KiAntwort);
}

async function meldungAusFehler(error: unknown): Promise<string> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (body && typeof body.error === "string") return body.error;
    } catch {
      // Kein JSON im Body, dann gilt die allgemeine Meldung.
    }
  }
  return "Die Unterlagen konnten nicht ausgelesen werden. Bitte später erneut versuchen.";
}
