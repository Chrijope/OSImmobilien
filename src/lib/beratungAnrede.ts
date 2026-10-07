// Kundenanrede der Beratungspräsentation.
//
// Die Wahl zwischen Du und Sie trifft der Setter im Erstgesprächsskript
// (Schritt 2, "Anrede klären"). Sie liegt im gespeicherten Skript-Snapshot
// unter meta.setterSkript.anrede, je Investment, mit Rückfall auf den
// Kontakt. Die Präsentation liest genau diese Quelle und baut kein eigenes
// Speichersystem daneben.
//
// Ohne gespeicherte Wahl, ohne Kundenkontext oder bei unbrauchbaren Werten
// gilt seit dem 15.09.2026 die Du-Form: Christian will die Präsentation
// durchgehend per Du, egal ob sie aus der Seitenleiste, den Unterlagen oder
// dem Kundenprofil geöffnet wird. Nur eine ausdrücklich gespeicherte
// Sie-Wahl aus dem Erstgespräch bleibt Sie.

export type Anrede = "sie" | "du";

/** Liest die Anrede aus einem gespeicherten Erstgesprächsskript-Snapshot. */
export function anredeAusSkript(skript: unknown): Anrede {
  if (
    skript !== null &&
    typeof skript === "object" &&
    (skript as { anrede?: unknown }).anrede === "sie"
  ) {
    return "sie";
  }
  return "du";
}
