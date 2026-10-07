import type { LizenzPaketId } from "./lizenzPakete";
import { vertragsAnlagen, type VertragsFassung } from "./vertragKlauseln";

/**
 * Liste der Anlagen, die im generierten Handelsvertretervertrag enthalten sind.
 * Wird sowohl im Vertrags-Tab (Anzeige) als auch im Dokumente-Tab (Ablage nach
 * Unterschrift) verwendet, damit Vertrag + Anlagen einzeln aufgeführt werden.
 *
 * Die Quelle ist `vertragsAnlagen` in vertragKlauseln.ts, aus der auch das
 * Anlagenverzeichnis im Hauptvertrag und die gedruckten Anlagen des PDFs
 * gespeist werden. So kann das Verzeichnis nie etwas anderes nennen als das,
 * was im Vertrag steht.
 *
 * `hatLeadPaket` entspricht `hatLeadpaketAnlage(bewerber)`: Nur dann enthält
 * der generierte Vertrag die Leadpaket-Vereinbarung. `fassung` entspricht
 * vertragsFassungVon(bewerber): Bestandspartner der Altfassung haben sechs
 * bis acht Anlagen, die kompakte Fassung zwei bis vier.
 * `mitMetaPixelAnlage` entspricht hatMetaPixelAnlage(bewerber) für genau
 * das Dokument, um das es geht (Anlage 4 ab Fassung 2026-09-26).
 */
export function getVertragsAnhaenge(
  paketId: LizenzPaketId | string | "",
  individuelleVertragsFassung: boolean = false,
  hatLeadPaket: boolean = false,
  fassung: VertragsFassung = "neu",
  mitMetaPixelAnlage: boolean = false,
) {
  return vertragsAnlagen(paketId, individuelleVertragsFassung, hatLeadPaket, fassung, mitMetaPixelAnlage).map(
    (a) => `Anlage ${a.nummer} – ${a.titel}`,
  );
}
