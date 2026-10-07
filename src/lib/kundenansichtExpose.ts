import { annahmenVorbelegen, baueExposeInhalt, type ExposeInhalt, type Person } from "@/lib/exposeInhalt";
import { baueObjektExposeInhalt, objektExposeRecheneinheit } from "@/lib/exposePublicDaten";
import { berechneExpose, type ExposeErgebnis } from "@/lib/exposeRechner";
import type { ExposeAnnahmen } from "@/lib/exposeAnnahmen";
import type { AnnahmenHerkunftKarte } from "@/components/expose/ExposeRechner";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { STANDARD_SPRACHE, type Sprache } from "@/lib/seitenSprache";

/**
 * „Exposé herunterladen“ in der Kundenansicht (Bauplan vom 23.09.2026,
 * Frage 6): eine echte PDF-Datei, nicht der Druckdialog.
 *
 * Gerechnet wird wie im Kundenlink des Exposés: neutrale Standardannahmen,
 * dazu nur, was am Objekt steht (AfA-Satz, Erhaltungsaufwand). Nie Werte aus
 * der Selbstauskunft (`annahmenVorbelegen(…, null)`), denn die Seite kann
 * weitergeleitet werden. Standortzahlen aus der Standortdatenbank fehlen, sie
 * sind ohne Anmeldung nicht lesbar; das gilt im öffentlichen Exposé genauso.
 *
 * Beim Globalobjekt ist die Recheneinheit das ganze Haus
 * (`objektExposeRecheneinheit`), der Inhalt der des ganzen Objekts
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
  annahmen: ExposeAnnahmen;
  ergebnis: ExposeErgebnis;
  herkunft: AnnahmenHerkunftKarte;
}

export function kundenExposeGrundlage(
  objekt: ObjektData,
  wohnung: ObjektWohnung | null,
  partner: Person | undefined,
  heute: Date = new Date(),
  sprache: Sprache = STANDARD_SPRACHE,
): KundenExposeGrundlage {
  const einheit = wohnung ?? objektExposeRecheneinheit(objekt);
  const inhalt = wohnung
    ? baueExposeInhalt({ objekt, wohnung, ersteller: partner, heute, sprache })
    : baueObjektExposeInhalt({ objekt, ersteller: partner, heute, sprache });
  const vorbelegung = annahmenVorbelegen(objekt, einheit, null, heute);
  // Dieselben Zahlen wie der Rechner im Exposé: Er rechnet mit genau diesen Objektdaten.
  const ergebnis = berechneExpose(inhalt.wirtschaftlichkeit.objektdaten, vorbelegung.annahmen);
  const herkunft: AnnahmenHerkunftKarte = {};
  for (const k of vorbelegung.ausObjekt) herkunft[k] = "objekt";
  return { inhalt, annahmen: vorbelegung.annahmen, ergebnis, herkunft };
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
  const blob = await exposeDruckPdf(g.inhalt, g.annahmen, g.ergebnis, { herkunft: g.herkunft, erstelltAm: heute, sprache });
  return { blob, dateiname: exposePdfDateiname(g.inhalt, heute) };
}
