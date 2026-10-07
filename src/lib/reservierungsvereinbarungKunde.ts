/**
 * Die unterschriebene Reservierungsvereinbarung im Kundenportal öffnen.
 *
 * `finalize-reservierung` legt die Datei unter
 * `reservierung/<kontaktId>/<investmentId>/` im Eimer `unterlagen` ab. Diesen
 * Ordner durfte die Rolle Kunde bis zum 26.09.2026 nicht lesen, der Knopf im
 * Portal tat dann still gar nichts. Die Leseregel dafür bringt die Migration
 * `20260926150000_reservierung_kunde_lesen.sql`.
 *
 * Solange sie nicht gelaufen ist, oder wenn die Datei aus einem anderen Grund
 * nicht erreichbar ist, entsteht das PDF wie früher aus den gespeicherten
 * Angaben und Unterschriften am Investment. Der Kunde bekommt also in jedem
 * Fall sein Dokument, und der Knopf tut nie mehr nichts.
 */
import { unterlageHerunterladen } from "@/lib/storage";

export interface RvPortalMeta {
  docFileUrls?: Record<string, string> | null;
  rvPdfPath?: string | null;
  rvPdf?: string | null;
  rvData?: unknown;
  rvSignatures?: unknown;
}

export type RvOeffnenErgebnis = "abgelegt" | "neu_erzeugt" | "fehlgeschlagen";

export interface RvOeffnenMittel {
  herunterladen: (pfad: string, dateiname: string) => Promise<boolean>;
  erzeugen: (rvData: unknown, unterschriften: unknown, dateiname: string) => Promise<void>;
}

async function pdfAusAngabenErzeugen(rvData: unknown, unterschriften: unknown, dateiname: string): Promise<void> {
  const { generateReservierungPDF } = await import("@/lib/reservierungPdf");
  const doc = await generateReservierungPDF(
    rvData as Parameters<typeof generateReservierungPDF>[0],
    unterschriften as Parameters<typeof generateReservierungPDF>[1],
  );
  doc.save(dateiname);
}

const STANDARD: RvOeffnenMittel = { herunterladen: unterlageHerunterladen, erzeugen: pdfAusAngabenErzeugen };

/** Wo die abgelegte Datei liegt, oder null. */
export function rvAblagePfad(meta: RvPortalMeta | null | undefined): string | null {
  const pfad = meta?.docFileUrls?.["Reservierungsvertrag"] || meta?.rvPdfPath || "";
  return typeof pfad === "string" && pfad.trim() ? pfad.trim() : null;
}

/** Gibt es überhaupt etwas zum Öffnen? */
export function rvZumOeffnen(meta: RvPortalMeta | null | undefined): boolean {
  return !!rvAblagePfad(meta) || !!meta?.rvData;
}

/**
 * Erst die abgelegte Datei, sonst das PDF aus den Angaben. Wirft nicht.
 * „fehlgeschlagen“ heißt: Es ging nichts hinaus, die Oberfläche sagt es.
 */
export async function reservierungsvereinbarungOeffnen(
  meta: RvPortalMeta | null | undefined,
  mittel: RvOeffnenMittel = STANDARD,
): Promise<RvOeffnenErgebnis> {
  const dateiname = (typeof meta?.rvPdf === "string" && meta.rvPdf.trim()) || "Reservierungsvereinbarung.pdf";
  const pfad = rvAblagePfad(meta);
  if (pfad) {
    try {
      if (await mittel.herunterladen(pfad, dateiname)) return "abgelegt";
    } catch (e) {
      console.warn("[Reservierung] abgelegte Datei nicht erreichbar, erzeuge aus den Angaben", e);
    }
  }
  if (!meta?.rvData) return "fehlgeschlagen";
  try {
    await mittel.erzeugen(meta.rvData, meta.rvSignatures, dateiname);
    return "neu_erzeugt";
  } catch (e) {
    console.error("[Reservierung] PDF aus den Angaben fehlgeschlagen", e);
    return "fehlgeschlagen";
  }
}
