/**
 * Welche Pipelinestufen VOR einer bestimmten Stufe liegen.
 *
 * WARUM DIESE DATEI EXISTIERT
 *
 * Eine Edge Function, die einen Vorgang vorrücken lässt, muss wissen, ob sie
 * ihn damit vorwärts oder rückwärts schiebt. Bis zum 21.09.2026 hatte jede
 * Function dafür ihre eigene, von Hand abgetippte Liste. Genau daran ist der
 * Umbau vom 06.08.2026 gescheitert, bei dem Objektauswahl und Reservierung vor
 * die Bonität gezogen wurden:
 *
 *   - `send-signature-request` wurde nachgezogen, am selben Tag.
 *   - `SelbstauskunftPage.tsx` wurde nachgezogen, am selben Tag.
 *   - `finalize-selbstauskunft` wurde ÜBERSEHEN und schob sechs Wochen lang
 *     jeden Kunden beim Unterschreiben auf "bonitaetsunterlagen", also an
 *     Objektauswahl und Reservierung vorbei.
 *
 * Der Commit, der die ersten beiden reparierte, heißt "Drei Folgefehler der
 * gedrehten Reihenfolge" und beschreibt genau das Problem, das er an der
 * dritten Stelle stehen ließ.
 *
 * Deshalb steht die Reihenfolge jetzt einmal hier, und die Listen werden
 * daraus abgeleitet statt abgetippt.
 *
 * WICHTIG BEIM ÄNDERN
 *
 * Maßgeblich ist `src/lib/pipelineStufen.ts`, genauer `FORTSCHRITT_STUFEN`
 * (die Stufenliste ohne die Sonderfälle) und `RANG_ALIAS` (die Stufen ohne
 * eigenen Schritt). Deno und Vite teilen sich keinen Code, deshalb steht das
 * hier ein zweites Mal. Eine Änderung dort gehört auch hierher.
 */

/**
 * Die Stufen mit eigenem Schritt, in ihrer Reihenfolge.
 *
 * Entspricht `FORTSCHRITT_STUFEN` in src/lib/pipelineStufen.ts, also
 * `PIPELINE_STUFEN` ohne die Stufen aus `OHNE_EIGENEN_SCHRITT`. Nicht
 * enthalten sind absichtlich `bestandsimport`, `archiviert` und `verloren`:
 * Das sind keine Fortschrittsstufen, sondern Zustände daneben.
 */
export const FORTSCHRITT_REIHENFOLGE = [
  "neuer_lead",
  "nicht_erreicht",
  "erreicht",
  "follow_up",
  "erstgespraech_geplant",
  "beratungsgespraech",
  "selbstauskunft",
  "objektauswahl",
  "follow_up_objekt",
  "reservierung",
  "bonitaetsunterlagen",
  "finanzierung",
  "notar",
  "faelligkeit",
  "abrechnung",
  "abgeschlossen",
] as const;

/**
 * Stufen ohne eigenen Schritt und die Stufe, deren Rang sie teilen.
 *
 * Entspricht `RANG_ALIAS` in src/lib/pipelineStufen.ts.
 *
 * `closing` steht zusätzlich hier. Die Stufe kommt in `pipelineStufen.ts`
 * nicht mehr vor, aber die bisherigen Listen in den Edge Functions führen sie,
 * und Altdaten können sie noch tragen. Sie liegt vor der Selbstauskunft.
 */
const RANG_ALIAS: Record<string, string> = {
  eg_noshow: "erstgespraech_geplant",
  erstgespraech: "erstgespraech_geplant",
  bg_noshow: "beratungsgespraech",
  zugewiesen: "neuer_lead",
  kontaktversuche: "nicht_erreicht",
  vermoegensaufbau: "follow_up",
  closing: "beratungsgespraech",
};

/** Die Stufe, deren Rang gilt. Unbekanntes bleibt, wie es ist. */
function rangStufe(stufe: string): string {
  return RANG_ALIAS[stufe] ?? stufe;
}

/**
 * Alle Stufen, die vor `ziel` liegen, samt ihrer Aliasnamen.
 *
 * Aus dieser Menge heraus darf eine Function auf `ziel` vorrücken.
 */
export function vorstufenVon(ziel: string): Set<string> {
  const index = FORTSCHRITT_REIHENFOLGE.indexOf(rangStufe(ziel) as never);
  if (index < 0) return new Set();

  const davor = new Set<string>(FORTSCHRITT_REIHENFOLGE.slice(0, index));
  // Die Aliasnamen gehören dazu, sonst bliebe ein Vorgang auf "bg_noshow"
  // liegen, obwohl "beratungsgespraech" in der Menge steht.
  for (const [alias, ziel2] of Object.entries(RANG_ALIAS)) {
    if (davor.has(ziel2)) davor.add(alias);
  }
  return davor;
}

/**
 * Die neue Stufe nach einem Ereignis, oder die bisherige, wenn der Vorgang
 * schon weiter ist.
 *
 * Zwei Fälle, die bewusst so entschieden sind:
 *
 *   - Eine leere Stufe zählt als ganz am Anfang und bekommt das Ziel. Eine
 *     fehlende Stufe ist keine weiter fortgeschrittene.
 *   - Eine unbekannte Stufe bleibt unangetastet. Eine Function, die nicht
 *     weiß, wo ein Vorgang steht, schiebt ihn nicht. Das trifft auch
 *     "verloren" und "archiviert", und genau so soll es sein.
 */
export function stufeNachEreignis(aktuell: string | null | undefined, ziel: string): string {
  const jetzt = String(aktuell || "").trim();
  if (!jetzt) return ziel;
  return vorstufenVon(ziel).has(jetzt) ? ziel : jetzt;
}
