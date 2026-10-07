import type { ExposeInhalt } from "./exposeInhalt";
import type { ExposeAnnahmen } from "./exposeAnnahmen";
import type { AnnahmenHerkunftKarte } from "@/components/expose/ExposeRechner";
import type { DruckOptionen } from "./exposeDruck/daten";
import type { FormatSprache } from "./sprachFormat";

export interface ExposePdfAuftrag {
  /** Der Inhalt so, wie die Seite ihn zeigt (mit ergänzten Objektdaten und den angezeigten Plänen). */
  inhalt: ExposeInhalt;
  /** Die Annahmen, die gerade auf der Seite eingestellt sind. */
  annahmen: ExposeAnnahmen;
  herkunft?: AnnahmenHerkunftKarte;
  eigenkapitalEuro?: number;
  sprache: FormatSprache;
  /** Besonderheiten und Merkmale aus Investagon, wie die Seite sie zeigt. */
  zusatz?: DruckOptionen["zusatz"];
}

/**
 * Exposé als PDF-Datei herunterladen (Knopf „Exposé herunterladen“, seit
 * 01.10.2026 statt des Druckdialogs). Für jede Exposé-Seite ohne eigenen
 * PDF-Weg, also auch für den Kundenlink und die Kundenansicht.
 *
 * Das Ergebnis wird hier aus denselben Annahmen gerechnet wie im Rechner auf
 * der Seite (`berechneExpose`), so zeigen Seite und PDF dieselben Zahlen,
 * auch wenn der Rechner wegen fehlenden Kaufpreises gar nicht angezeigt wird.
 * Das PDF hat das Exposé-Design H3 (`exposeDruck`); react-pdf und der
 * Rechenkern werden erst beim Klick geladen.
 */
export async function exposePdfHerunterladen(auftrag: ExposePdfAuftrag): Promise<void> {
  const [{ exposeDruckPdf, exposePdfDateiname }, { berechneExpose }] = await Promise.all([
    import("./exposeDruck"),
    import("./exposeRechner"),
  ]);
  const { inhalt, annahmen, sprache } = auftrag;
  const heute = new Date();
  const ergebnis = berechneExpose(inhalt.wirtschaftlichkeit.objektdaten, annahmen);
  const blob = await exposeDruckPdf(inhalt, annahmen, ergebnis, {
    sprache,
    herkunft: auftrag.herkunft,
    eigenkapitalEuro: auftrag.eigenkapitalEuro,
    erstelltAm: heute,
    zusatz: auftrag.zusatz,
  });
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
