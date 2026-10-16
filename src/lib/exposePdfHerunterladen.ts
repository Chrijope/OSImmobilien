import type { ExposeInhalt } from "./exposeInhalt";
import type { DruckOptionen } from "./exposeDruck/daten";
import type { FormatSprache } from "./sprachFormat";

export interface ExposePdfAuftrag {
  /** Der Inhalt so, wie die Seite ihn zeigt (mit ergänzten Objektdaten und den angezeigten Plänen). */
  inhalt: ExposeInhalt;
  sprache: FormatSprache;
  /** Besonderheiten und Merkmale aus Investagon, wie die Seite sie zeigt. */
  zusatz?: DruckOptionen["zusatz"];
}

/**
 * Exposé als PDF-Datei herunterladen (Knopf „Exposé herunterladen“, seit
 * 01.10.2026 statt des Druckdialogs). Für jede Exposé-Seite ohne eigenen
 * PDF-Weg, also auch für den Kundenlink und die Kundenansicht.
 *
 * Das PDF hat das Exposé-Design H3 (`exposeDruck`); react-pdf wird erst
 * beim Klick geladen.
 */
export async function exposePdfHerunterladen(auftrag: ExposePdfAuftrag): Promise<void> {
  const { exposeDruckPdf, exposePdfDateiname } = await import("./exposeDruck");
  const { inhalt, sprache } = auftrag;
  const heute = new Date();
  const blob = await exposeDruckPdf(inhalt, { sprache, erstelltAm: heute, zusatz: auftrag.zusatz });
  dateiAnbieten(blob, exposePdfDateiname(inhalt, heute));
}

/** Blob als Datei speichern lassen. Über einen Link, das klappt auch auf dem Handy. */
export function dateiAnbieten(blob: Blob, dateiname: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Erst später freigeben: Safari liest die Datei erst nach dem Klick.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
