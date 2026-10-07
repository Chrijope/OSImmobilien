import type { KundeData } from "@/lib/kundenStore";
import { PIPELINE_STUFEN, getEffectivePipelineStufe, type PipelineStufe } from "@/lib/kontaktPipeline";
import { getFollowUpsByKunde } from "@/lib/followUpStore";

/**
 * Schwellen für die Inaktivitäts-Ampel, eine Tabelle für das ganze Projekt.
 *
 * Es gab lange zwei davon: diese hier und eine zweite in der Pipeline-Seite.
 * Die zweite kannte weder Beratungsgespräch noch die beiden NoShow-Stufen und
 * auch nicht Selbstauskunft. Kacheln in diesen Stufen wurden deshalb nie
 * eingefärbt, egal wie lange nichts passiert war. Genau die Stufen, in denen
 * ein liegengebliebener Lead am meisten kostet.
 * Werte = [orangeAbTagen, rotAbTagen]. Stufen ohne Eintrag haben keine Ampel
 * (z. B. abgeschlossen / verloren / archiviert / kontaktversuche – eigene Logik).
 * Follow-Up wird in Stunden ab `verstecktBis` gemessen (24h orange, 48h rot).
 */
export const INACTIVITY_THRESHOLDS: Partial<Record<PipelineStufe, [number, number]>> = {
  neuer_lead: [2, 4],
  nicht_erreicht: [1, 3],
  erreicht: [1, 3],
  erstgespraech_geplant: [3, 7],
  eg_noshow: [1, 3],
  beratungsgespraech: [3, 7],
  bg_noshow: [1, 3],
  selbstauskunft: [3, 7],
  bonitaetsunterlagen: [7, 10],
  objektauswahl: [7, 10],
  // Manuelle Follow-Up-Stufe nach der Objektvorstellung: dieselben Schwellen
  // wie die Objektauswahl, der Kunde soll nicht wochenlang "überlegen".
  follow_up_objekt: [7, 10],
  reservierung: [10, 20],
  finanzierung: [10, 20],
  notar: [10, 20],
  faelligkeit: [10, 20],
  abrechnung: [10, 20],
  // Legacy-Stufen, die in Altbeständen noch vorkommen.
  zugewiesen: [1, 3],
  vermoegensaufbau: [7, 14],
};

export type AmpelColor = "green" | "orange" | "red" | "gray";

export interface InactivityInfo {
  color: AmpelColor;
  days: number;          // ganze Tage seit letzter Aktualisierung (Follow-Up: Stunden seit Fälligkeit / 24)
  hours?: number;        // nur Follow-Up
  thresholds: [number, number] | null;
  stufe: PipelineStufe;
  stufeLabel: string;
  reason: string;        // Erklärtext für Tooltip
  isFollowUp?: boolean;
}

export function getDaysSinceUpdate(kunde: KundeData): number {
  const ref = kunde.aktualisiert_am || kunde.erstellt_am;
  if (!ref) return 0;
  const diff = Date.now() - new Date(ref).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Prüft ob für den Kontakt ein verbindlicher Termin oder offener Follow-Up
 * in der Zukunft geplant ist. Wenn ja, gilt der Lead als „aktiv gemanaged“
 * und die Inaktivitäts-Ampel wird auf grün zurückgesetzt.
 */
export function getNextPlannedActivity(kunde: KundeData): { date: Date; source: string } | null {
  const now = Date.now();
  const meta: any = (kunde as any).meta || {};
  const candidates: Array<{ raw: any; source: string }> = [
    { raw: (kunde as any).setterTerminDatum, source: "Erstgespräch-Termin" },
    { raw: meta.setterTerminDatum, source: "Erstgespräch-Termin" },
    { raw: meta.beratungsgespraechAm, source: "Beratungsgespräch-Termin" },
    { raw: meta.erstgespraechAm, source: "Erstgespräch-Termin" },
    { raw: (kunde as any).verstecktBis, source: "Follow-Up-Datum" },
  ];

  let next: { date: Date; source: string } | null = null;
  const consider = (d: Date, source: string) => {
    if (isNaN(d.getTime()) || d.getTime() <= now) return;
    if (!next || d.getTime() < next.date.getTime()) next = { date: d, source };
  };

  for (const c of candidates) {
    if (!c.raw) continue;
    const d = new Date(c.raw);
    consider(d, c.source);
  }

  // Offene Follow-Ups mit zukünftigem Fälligkeitsdatum
  try {
    const fus = getFollowUpsByKunde(kunde.id) || [];
    for (const fu of fus) {
      if (fu.status !== "offen" || !fu.faelligAm) continue;
      const d = new Date(fu.faelligAm);
      consider(d, "Follow-Up");
    }
  } catch { /* store noch nicht bereit */ }

  return next;
}

function stufeLabel(stufe: PipelineStufe): string {
  return PIPELINE_STUFEN.find((s) => s.key === stufe)?.label || stufe;
}

export function getInactivityInfo(kunde: KundeData, stufeOverride?: PipelineStufe): InactivityInfo {
  const stufe = stufeOverride || getEffectivePipelineStufe(kunde);
  const label = stufeLabel(stufe);

  // Follow-Up: Stunden ab geplantem Wiedervorlage-Datum
  if (stufe === "follow_up") {
    const fuDate = (kunde as any).verstecktBis ? new Date((kunde as any).verstecktBis) : null;
    if (!fuDate || isNaN(fuDate.getTime())) {
      return { color: "gray", days: 0, thresholds: null, stufe, stufeLabel: label, reason: "Kein Follow-Up-Datum gesetzt.", isFollowUp: true };
    }
    const hoursSince = Math.floor((Date.now() - fuDate.getTime()) / (1000 * 60 * 60));
    // Wenn der Follow-Up-Termin in der Vergangenheit liegt UND kein offener
    // Follow-Up mehr ansteht (also der Kontakt weiter bearbeitet wurde),
    // verlassen wir die Follow-Up-Stunden-Logik und behandeln den Lead wie
    // in seiner regulären Stufe (Basis: aktualisiert_am).
    let hasOpenFu = false;
    try {
      const fus = getFollowUpsByKunde(kunde.id) || [];
      hasOpenFu = fus.some((fu) => fu.status === "offen");
    } catch { /* store noch nicht bereit */ }
    if (hoursSince > 0 && !hasOpenFu) {
      const fallbackStufe: PipelineStufe = "erstgespraech_geplant";
      const fbThresholds = INACTIVITY_THRESHOLDS[fallbackStufe] ?? [3, 7];
      const days = getDaysSinceUpdate(kunde);
      const planned = getNextPlannedActivity(kunde);
      if (planned) {
        const dateStr = planned.date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
        return { color: "green", days, thresholds: fbThresholds, stufe: fallbackStufe, stufeLabel: stufeLabel(fallbackStufe), reason: `${planned.source} am ${dateStr} geplant – Ampel pausiert.` };
      }
      let c: AmpelColor = "green";
      if (days >= fbThresholds[1]) c = "red";
      else if (days >= fbThresholds[0]) c = "orange";
      return { color: c, days, thresholds: fbThresholds, stufe: fallbackStufe, stufeLabel: stufeLabel(fallbackStufe), reason: `Follow-Up vom ${fuDate.toLocaleDateString("de-DE")} ist abgelaufen und kein neuer geplant – zurück zur Standard-Ampel (${days} Tage seit letzter Aktivität).` };
    }
    let color: AmpelColor = "green";
    if (hoursSince > 48) color = "red";
    else if (hoursSince > 24) color = "orange";
    const reason =
      color === "red" ? `Follow-Up seit ${hoursSince}h überfällig (rot ab 48h).`
      : color === "orange" ? `Follow-Up seit ${hoursSince}h überfällig (orange ab 24h, rot ab 48h).`
      : hoursSince > 0 ? `Follow-Up seit ${hoursSince}h fällig – noch im grünen Bereich.`
      : `Follow-Up noch nicht fällig.`;
    return { color, days: Math.floor(hoursSince / 24), hours: hoursSince, thresholds: [24, 48], stufe, stufeLabel: label, reason, isFollowUp: true };
  }

  const thresholds = INACTIVITY_THRESHOLDS[stufe] ?? null;
  const days = getDaysSinceUpdate(kunde);

  if (!thresholds) {
    return {
      color: "gray",
      days,
      thresholds: null,
      stufe,
      stufeLabel: label,
      reason: `Für Stufe "${label}" wird keine Inaktivitäts-Ampel angezeigt.`,
    };
  }

  // Zukünftiger Termin / offener Follow-Up → Lead ist aktiv gemanaged → grün
  const planned = getNextPlannedActivity(kunde);
  if (planned) {
    const dateStr = planned.date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    return {
      color: "green",
      days,
      thresholds,
      stufe,
      stufeLabel: label,
      reason: `${planned.source} am ${dateStr} geplant – Ampel pausiert bis Termin/Follow-Up fällig wird.`,
    };
  }

  let color: AmpelColor = "green";
  if (days >= thresholds[1]) color = "red";
  else if (days >= thresholds[0]) color = "orange";

  const reason =
    color === "red"
      ? `Seit ${days} Tagen keine Aktivität – kritisch (rot ab ${thresholds[1]} Tagen in "${label}").`
      : color === "orange"
      ? `Seit ${days} Tagen keine Aktivität – Warnung (orange ab ${thresholds[0]} Tagen, rot ab ${thresholds[1]} in "${label}").`
      : `Seit ${days} Tagen aktiv – im grünen Bereich (Warnung ab ${thresholds[0]} Tagen in "${label}").`;

  return { color, days, thresholds, stufe, stufeLabel: label, reason };
}