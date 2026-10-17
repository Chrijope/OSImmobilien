import { supabase } from "@/integrations/supabase/client";
import { edgeFehlerMitGrund } from "./edgeFehler";
import { leseExcel, type Blatt, type Zelle } from "./excelLesen";

/*
 * Eine Liste lesen, egal ob Excel oder PDF (17.10.2026). Excel liest das CRM
 * selbst; ein PDF liest die Edge Function `liste-aus-pdf` mit KI und gibt
 * Spaltenköpfe und Zeilen zurück. Beides wird zu denselben Blättern, damit
 * Import, Prüfvorschau und Objektanlage für beide Wege gleich bleiben.
 */

export const LISTEN_DATEITYPEN = ".xlsx,.pdf";

export function istPdf(datei: File): boolean {
  return datei.type === "application/pdf" || /\.pdf$/i.test(datei.name);
}

function alsBase64(datei: File): Promise<string> {
  return new Promise((ok, fehler) => {
    const leser = new FileReader();
    leser.onload = () => ok(String(leser.result).replace(/^data:[^,]*,/, ""));
    leser.onerror = () => fehler(leser.error);
    leser.readAsDataURL(datei);
  });
}

/** Antwort der Funktion in Blätter wandeln: Kopfzeile oben, dann die Zeilen. */
export function blaetterAusAntwort(antwort: unknown): Blatt[] {
  const blaetter = (antwort as { blaetter?: Array<{ name?: unknown; kopf?: unknown; zeilen?: unknown }> } | null)?.blaetter;
  if (!Array.isArray(blaetter)) return [];
  return blaetter
    .filter((b) => Array.isArray(b.kopf) && Array.isArray(b.zeilen))
    .map((b, i) => ({
      name: typeof b.name === "string" && b.name.trim() ? b.name.trim() : `Tabelle ${i + 1}`,
      zeilen: [b.kopf as Zelle[], ...(b.zeilen as Zelle[][]).filter(Array.isArray)].map((z) => z.map((w) => (typeof w === "number" || typeof w === "string" ? w : null))),
    }));
}

export async function leseListe(datei: File): Promise<Blatt[]> {
  if (!istPdf(datei)) return leseExcel(datei);
  const { data, error } = await supabase.functions.invoke("liste-aus-pdf", { body: { pdfBase64: await alsBase64(datei), dateiname: datei.name } });
  if (error) {
    const grund = await edgeFehlerMitGrund(error, { functionName: "liste-aus-pdf" });
    throw grund instanceof Error ? grund : new Error("Das PDF ließ sich nicht auslesen.");
  }
  const blaetter = blaetterAusAntwort(data);
  if (!blaetter.length) throw new Error("Im PDF wurde keine Tabelle gefunden.");
  return blaetter;
}
