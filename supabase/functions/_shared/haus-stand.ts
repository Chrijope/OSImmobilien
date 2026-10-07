/**
 * Der Stand eines ganzen Hauses (Globalobjekt), eine Regel für Browser und Functions.
 *
 * Christians Entscheidung vom 05.10.2026 (Option A): Ein Globalobjekt ist
 * nicht mehr frei, sobald mindestens eine Einheit reserviert oder verkauft
 * ist, auch wenn der Stand nur aus Investagon kommt und im CRM kein Kunde
 * daran hängt und `objekte.belegung` noch „frei“ sagt. Dann gilt das Haus als
 * „teilweise reserviert, nicht verfügbar“ und wird nicht als frei angeboten.
 *
 * Reine Funktion ohne Deno- oder Browser-API. Geprüft in
 * `src/lib/hausStand.test.ts`.
 */

export type HausGesamtStand = "frei" | "teilweise_reserviert" | "reserviert" | "verkauft";

/** Dieselbe Einordnung wie `verkaufsstand` in `objektdaten.ts` und `einheitStatus` im Browser. */
function einheitStand(roh: unknown): "frei" | "reserviert" | "verkauft" {
  const status = String(roh ?? "").trim().toLowerCase();
  if (status === "reserviert" || status === "gesetzt") return "reserviert";
  if (status === "verkauft") return "verkauft";
  return "frei";
}

/**
 * Der Stand des ganzen Hauses.
 *
 *   1. Die Belegung des Hauses im CRM zuerst: verkauft oder reserviert.
 *   2. Sonst nach den Einheiten: alle verkauft heißt verkauft, alle
 *      reserviert oder verkauft heißt reserviert, mindestens eine heißt
 *      teilweise reserviert.
 *   3. Sonst frei.
 *
 * `einheitenStatus` sind die rohen Werte aus `wohnungen.status`, gleich ob
 * im Angebot oder nicht.
 */
export function hausGesamtStand(e: { belegung?: unknown; einheitenStatus: readonly unknown[] }): HausGesamtStand {
  const belegung = typeof e.belegung === "string" ? e.belegung.trim().toLowerCase() : "";
  if (belegung === "verkauft") return "verkauft";
  if (belegung === "reserviert") return "reserviert";
  const staende = e.einheitenStatus.map(einheitStand);
  const belegt = staende.filter((s) => s !== "frei").length;
  if (!staende.length || !belegt) return "frei";
  if (staende.every((s) => s === "verkauft")) return "verkauft";
  if (belegt === staende.length) return "reserviert";
  return "teilweise_reserviert";
}

/** Die Bezeichnung für Nutzer, ohne Gedankenstriche. */
export const HAUS_STAND_TEXT: Record<HausGesamtStand, string> = {
  frei: "frei",
  teilweise_reserviert: "teilweise reserviert, nicht verfügbar",
  reserviert: "reserviert",
  verkauft: "verkauft",
};

/** Darf das Haus als Ganzes noch angeboten und reserviert werden? */
export const hausFrei = (stand: HausGesamtStand) => stand === "frei";
