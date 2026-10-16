import { baueExposeInhalt, type ExposeInhalt, type Person } from "@/lib/exposeInhalt";
import { baueObjektExposeInhalt } from "@/lib/exposePublicDaten";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { STANDARD_SPRACHE, type Sprache } from "@/lib/seitenSprache";

/**
 * „Exposé herunterladen“ in der Kundenansicht (Bauplan vom 23.09.2026,
 * Frage 6): eine echte PDF-Datei, nicht der Druckdialog.
 *
 * Inhalt wie im Kundenlink des Exposés, ohne Werte aus der Selbstauskunft,
 * denn die Seite kann weitergeleitet werden. Eine Wirtschaftlichkeitsrechnung
 * enthält das Exposé seit dem 16.10.2026 nicht mehr. Standortzahlen aus der
 * Standortdatenbank fehlen, sie sind ohne Anmeldung nicht lesbar; das gilt im
 * öffentlichen Exposé genauso.
 *
 * Beim Globalobjekt ist der Inhalt der des ganzen Objekts
 * (`baueObjektExposeInhalt`).
 *
 * `sprache` ist die Sprache der Seite, also die des Kunden aus
 * `get-kundenansicht` (Kundensprache, Etappe 3). Inhalt und PDF entstehen in
 * derselben Sprache. Die englischen Objekttexte liefert die Antwort unter
 * `meta.objekttexteKiEn` mit; fehlen sie, bleiben die Texte deutsch mit dem
 * Vermerk „Description available in German only“. Ohne Angabe Deutsch.
 */

export interface KundenExposeGrundlage {
  inhalt: ExposeInhalt;
}

export function kundenExposeGrundlage(
  objekt: ObjektData,
  wohnung: ObjektWohnung | null,
  partner: Person | undefined,
  heute: Date = new Date(),
  sprache: Sprache = STANDARD_SPRACHE,
): KundenExposeGrundlage {
  const inhalt = wohnung
    ? baueExposeInhalt({ objekt, wohnung, ersteller: partner, heute, sprache })
    : baueObjektExposeInhalt({ objekt, ersteller: partner, heute, sprache });
  return { inhalt };
}

/**
 * Das PDF bauen, im Exposé-Design H3 (`exposeDruck`). react-pdf kommt erst
 * hier herein, beim Klick, damit die Seite ohne das schwere Paket startet.
 */
export async function kundenExposePdf(
  objekt: ObjektData,
  wohnung: ObjektWohnung | null,
  partner: Person | undefined,
  heute: Date = new Date(),
  sprache: Sprache = STANDARD_SPRACHE,
): Promise<{ blob: Blob; dateiname: string }> {
  const { exposeDruckPdf, exposePdfDateiname } = await import("@/lib/exposeDruck");
  const g = kundenExposeGrundlage(objekt, wohnung, partner, heute, sprache);
  const blob = await exposeDruckPdf(g.inhalt, { erstelltAm: heute, sprache });
  return { blob, dateiname: exposePdfDateiname(g.inhalt, heute) };
}
