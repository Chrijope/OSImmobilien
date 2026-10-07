// Was zählt als Abschluss, was als Abwicklung, was als qualifiziert?
//
// Die Frage wurde an drei Stellen getrennt beantwortet: die Abrechnung zählte
// ab "reservierung", "Mein Team" erst ab "notar", die Gamification nur
// "abgeschlossen" und "faelligkeit". Derselbe Vertriebspartner hatte damit auf
// drei Seiten drei verschiedene Abschlusszahlen. Hier steht die Definition
// einmal.
//
// Ausserdem kursierten Stufennamen, die es in der Pipeline nie gab
// ("qualifiziert", "beratung", "bonitaet"). Sie trafen auf keinen Datensatz zu
// und liessen Kacheln still leer. Die Namen hier sind gegen
// `PIPELINE_STUFEN` geprüft.

import { normalizePipelineStufe, type PipelineStufe } from "@/lib/kontaktPipeline";

/** Der Kunde hat unterschrieben, das Geschäft ist dem Haus sicher. */
export const ABSCHLUSS_STUFEN: readonly PipelineStufe[] = [
  "notar",
  "faelligkeit",
  "abrechnung",
  "abgeschlossen",
];

/**
 * Der Notartermin ist durchlaufen. Christians Definition von "Abschluss"
 * für die Abrechnung, festgelegt am 14.09.2026.
 *
 * Bewusst OHNE die Stufe `notar`: Dort steht der Termin bevor, er hat noch
 * nicht stattgefunden. Der Sprung von `notar` nach `faelligkeit` läuft
 * serverseitig automatisch, sobald Notardatum und Uhrzeit in der
 * Vergangenheit liegen (Migration
 * `20260807180000_bulk_recompute_ohne_verlustautomatik.sql`). "Stufe ab
 * Fälligkeit" heißt deshalb genau "Termin war".
 *
 * Unterschied zu `ABSCHLUSS_STUFEN`: Jene zählt ab `notar` und beantwortet
 * die Frage "ist das Geschäft dem Haus sicher". Diese hier beantwortet "ist
 * es vollzogen". Für eine Abrechnung zählt die zweite.
 */
export const NOTAR_DURCHLAUFEN_STUFEN: readonly PipelineStufe[] = [
  "faelligkeit",
  "abrechnung",
  "abgeschlossen",
];

/**
 * Unterwegs zum Abschluss, aber noch nicht beim Notar.
 *
 * "bonitaetsunterlagen" fehlte hier bis zum 04.10.2026. Die Stufe liegt
 * zwischen Reservierung und Finanzierung; ein Investment dort fiel aus
 * Erwartung und Provisionsprognose. Zusammen mit `ABSCHLUSS_STUFEN` ergibt
 * diese Liste genau die Kaufphase der Datenbank
 * (`pipelinestufe_ist_kaufphase`), geprüft in `abschlussDefinition.test.ts`.
 */
export const ABWICKLUNG_STUFEN: readonly PipelineStufe[] = [
  "reservierung",
  "bonitaetsunterlagen",
  "finanzierung",
];

/**
 * Der Kontakt ist mehr als ein Name: es gab ein Gespräch oder es liegen
 * Unterlagen vor.
 */
export const QUALIFIZIERT_STUFEN: readonly PipelineStufe[] = [
  "erstgespraech_geplant",
  "beratungsgespraech",
  "selbstauskunft",
  "bonitaetsunterlagen",
  "objektauswahl",
  "follow_up_objekt",
];

const ABSCHLUSS_SET = new Set<string>(ABSCHLUSS_STUFEN);
const NOTAR_DURCHLAUFEN_SET = new Set<string>(NOTAR_DURCHLAUFEN_STUFEN);
const ABWICKLUNG_SET = new Set<string>(ABWICKLUNG_STUFEN);
const QUALIFIZIERT_SET = new Set<string>(QUALIFIZIERT_STUFEN);

/** Alles ab Reservierung: die Umsatzerwartung der Abrechnung. */
const PROVISIONSRELEVANT_SET = new Set<string>([...ABWICKLUNG_STUFEN, ...ABSCHLUSS_STUFEN]);

function stufe(wert?: string | null): string | null {
  return normalizePipelineStufe(wert ?? null);
}

export function istAbschluss(wert?: string | null): boolean {
  const s = stufe(wert);
  return !!s && ABSCHLUSS_SET.has(s);
}

/**
 * Hat dieses Geschäft den Notartermin hinter sich?
 *
 * Die Zählung, die in der Abrechnung als "Abschlüsse" erscheint. Vorher stand
 * dort die Zahl aller Kontakte eines Partners, unabhängig von jeder Stufe:
 * Ein frisch importierter Lead zählte wie ein vollzogener Kauf.
 */
export function istNotarDurchlaufen(wert?: string | null): boolean {
  const s = stufe(wert);
  return !!s && NOTAR_DURCHLAUFEN_SET.has(s);
}

export function istInAbwicklung(wert?: string | null): boolean {
  const s = stufe(wert);
  return !!s && ABWICKLUNG_SET.has(s);
}

/**
 * Zählt für die Abrechnung: ab der Reservierung entsteht ein
 * Provisionsanspruch, auch wenn er erst mit dem Notartermin fällig wird.
 */
export function istProvisionsrelevant(wert?: string | null): boolean {
  const s = stufe(wert);
  return !!s && PROVISIONSRELEVANT_SET.has(s);
}

/**
 * Kaufphase, aber der Notartermin steht noch aus: Reservierung bis Notar.
 * Die Provisionskurven buchen solche Geschäfte ohne Notardatum als Prognose.
 */
export function istKaufphaseVorNotar(wert?: string | null): boolean {
  return istProvisionsrelevant(wert) && !istNotarDurchlaufen(wert);
}

/**
 * Qualifiziert ist ein Kontakt entweder über seinen Status oder über eine
 * Pipeline-Stufe ab dem Erstgespräch. Alles ab Reservierung zählt ebenfalls,
 * sonst fiele ein Abschluss aus der Zahl heraus.
 */
export function istQualifiziert(kontakt: {
  status?: string | null;
  pipelineStufe?: string | null;
}): boolean {
  if (kontakt.status === "qualifiziert" || kontakt.status === "kunde") return true;
  const s = stufe(kontakt.pipelineStufe);
  if (!s) return false;
  return QUALIFIZIERT_SET.has(s) || PROVISIONSRELEVANT_SET.has(s);
}

/** Ein storniertes oder verlorenes Geschäft gehört in keine Auswertung. */
export function istStorniert(datensatz: {
  storniert?: boolean | null;
  storno?: boolean | null;
  pipelineStufe?: string | null;
  status?: string | null;
}): boolean {
  if (datensatz.storniert === true || datensatz.storno === true) return true;
  const s = stufe(datensatz.pipelineStufe);
  if (s === "verloren" || s === "archiviert") return true;
  return datensatz.status === "verloren" || datensatz.status === "storniert";
}
