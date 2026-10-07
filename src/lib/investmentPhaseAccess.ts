/**
 * getPhaseAccess(investment)
 *
 * Foundation-Helper für den Phasenleisten-Refactor in KundenDetail.tsx.
 * Ziel: Alle Phasenkacheln werden IMMER gerendert (wie im Kundenportal),
 * Lock-State entscheidet, ob die Kachel interaktiv ist.
 *
 * Diese Datei ist die single source of truth für die Freischalt-Logik.
 * Die visuelle Integration in der 8500+ LOC KundenDetail-Datei erfolgt
 * in einer eigenen, isolierten Session.
 */

export type PhaseKey =
  | "selbstauskunft"
  | "objektauswahl"
  | "reservierung"
  | "bonitaetsunterlagen"
  | "finanzierung"
  | "notar"
  | "aftersalesBeratung"
  | "faelligkeit"
  | "abrechnung"
  | "abgeschlossen";

export type PhaseAccess =
  | { state: "locked"; reason: string }
  | { state: "active" }
  | { state: "done" };

interface InvestmentLike {
  pipelineStufe?: string;
  notarTermin?: string | null;
  notarUhrzeit?: string | null;
  meta?: Record<string, any> | null;
  // Zusätzliche projektspezifische Felder werden über meta abgebildet.
}

/*
 * Die Reihenfolge IST die Freischaltlogik: Eine Phase gilt als gesperrt,
 * solange sie hier weiter hinten steht als die aktuelle Stufe.
 *
 * Seit 06.08.2026 stehen Objektauswahl und Reservierung vor der Bonitaet.
 * Vorher war es umgekehrt, und der Kunde musste seine Unterlagen abgeben,
 * bevor er ueberhaupt ein Objekt gesehen hatte.
 */
const STAGE_ORDER: PhaseKey[] = [
  "selbstauskunft",
  "objektauswahl",
  "reservierung",
  "bonitaetsunterlagen",
  "finanzierung",
  "notar",
  "aftersalesBeratung",
  "faelligkeit",
  "abrechnung",
  "abgeschlossen",
];

function parseDeDate(s?: string | null): Date | null {
  if (!s) return null;
  if (/^\d{2}\.\d{2}\.\d{4}/.test(s)) {
    const [d, m, y] = s.split(".").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Ermittelt den Lock-/Active-/Done-State einer Phasenkachel relativ zum
 * aktuellen Investment-Stand.
 */
export function getPhaseAccess(phase: PhaseKey, inv: InvestmentLike): PhaseAccess {
  // "follow_up_objekt" hat keine eigene Phasenkachel: Die manuelle
  // Follow-Up-Stufe nach der Objektvorstellung zaehlt wie "objektauswahl".
  const roheStufe = inv.pipelineStufe === "follow_up_objekt" ? "objektauswahl" : inv.pipelineStufe;
  const stufe = (roheStufe || "") as PhaseKey | string;
  const meta = (inv.meta || {}) as Record<string, any>;
  const ab = (meta.aftersalesBeratung as Record<string, any>) || {};

  // Spezialfall: Aftersales-Beratung wird am Tag des Notartermins freigeschaltet.
  if (phase === "aftersalesBeratung") {
    if (ab.kundeSignedAt || ab.status === "abgeschlossen") return { state: "done" };
    const notar = parseDeDate(inv.notarTermin) || parseDeDate(meta.notartermin_bestaetigt_am);
    if (!notar) return { state: "locked", reason: "Wird am Notartermin freigeschaltet" };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    notar.setHours(0, 0, 0, 0);
    return notar.getTime() <= today.getTime()
      ? { state: "active" }
      : { state: "locked", reason: "Wird am Notartermin freigeschaltet" };
  }

  // Stage-basierte Standardlogik
  const currentIdx = STAGE_ORDER.indexOf(stufe as PhaseKey);
  const phaseIdx = STAGE_ORDER.indexOf(phase);
  if (currentIdx === -1 || phaseIdx === -1) {
    return { state: "locked", reason: "Vorherige Phase noch nicht abgeschlossen" };
  }
  if (phaseIdx < currentIdx) return { state: "done" };
  if (phaseIdx === currentIdx) return { state: "active" };
  return { state: "locked", reason: "Vorherige Phase noch nicht abgeschlossen" };
}

export const PHASE_ORDER = STAGE_ORDER;