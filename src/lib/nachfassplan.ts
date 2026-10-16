/**
 * Der automatische Nachfassplan nach dem Drive-Prozessstandard (Strategie
 * Vertrieb, Abschnitt 8, seit 16.10.2026).
 *
 * Was es schon gab und hier bewusst nicht noch einmal entsteht:
 *   - der Nachfass-Anruf drei Tage nach dem Erstgespräch
 *     (`nachfassNachErstgespraech.ts`),
 *   - die Aufgabe zwei Tage vor der Objektvorstellung, wenn Ausweis oder
 *     Gehaltsabrechnung fehlen (`useInvestmentInboxTriggers`),
 *   - die Kundenmail am Vortag jedes Termins (send-termin-erinnerungen,
 *     24, 6 und 1 Stunde vorher).
 *
 * Neu sind vier Aufgaben, alle über `addProzessAufgabe` (Empfänger der
 * Zuständige, sonst die Leitung; Duplikatschutz über den Auslöser-Schlüssel):
 *   1. nach Erstgespräch und Beratungspräsentation: Gespräch zusammenfassen,
 *      fällig zwei Stunden nach Gesprächsende,
 *   2. 24 Stunden nach der Beratungspräsentation fehlen Selbstauskunft oder
 *      Unterlagen: Kunden erinnern,
 *   3. 48 Stunden danach fehlt noch immer etwas, und kein Termin steht an:
 *      Kunden anrufen,
 *   4. drei erfolglose Kontaktversuche seit dem letzten Gespräch: letzte
 *      Nachricht senden und pausieren.
 *
 * Die Regeln selbst sind reine Funktionen, die Aufrufer liefern Zeitpunkte
 * und Daten.
 */
import { addProzessAufgabe } from "./prozessAufgabe";
import { mergeKontaktMeta } from "./kundenStore";
import { fehlendeMindestunterlagen, mindestunterlagenText } from "./mindestunterlagen";
import { selbstauskunftErledigt } from "../../supabase/functions/_shared/reservierung-voraussetzungen.ts";
import { istErstgespraech } from "./nachfassNachErstgespraech";
import type { AktivitaetEntry } from "./aktivitaetenStore";

export const ZUSAMMENFASSEN_TITEL = "Gespräch zusammenfassen: Nachfass-Mail innerhalb von 2 Stunden senden";
export const UNTERLAGE_FEHLT_TITEL = "Unterlage fehlt: Kunden erinnern";
export const KEINE_REAKTION_TITEL = "Seit 48 Stunden keine Reaktion: Kunden anrufen";
export const DREI_VERSUCHE_TITEL = "Drei Versuche ohne Erfolg: letzte Nachricht senden und Vorgang pausieren";

/** Wann die letzte Beratungspräsentation endete, in `kontakte.meta`. */
export const BP_ENDE_META = "beratungspraesentationEndeAm";

/** Ohne gepflegte Dauer rechnet der Plan mit einer Stunde. */
const STANDARD_DAUER_MIN = 60;
const STUNDE_MS = 60 * 60 * 1000;

/** Stufen nach der Beratungspräsentation und vor der Reservierung. */
export const STUFEN_NACH_BERATUNG = ["beratungsgespraech", "selbstauskunft", "objektauswahl", "follow_up_objekt"];

export type GespraechsArt = "erstgespraech" | "beratung";

/**
 * Eine Beratungspräsentation: bei Buchungen zählt der Anlass, sonst der
 * Titel. In der Pipeline heißt die Stufe „Beratungspräsentation“, als
 * Terminart oft noch „Beratungsgespräch“.
 */
export function istBeratungspraesentation(titel?: string, anlass?: string): boolean {
  if (anlass) return anlass === "beratung";
  return /beratungs(gespr|präsent|praesent)/i.test(titel || "");
}

/** Erstgespräch, Beratungspräsentation oder keins von beiden. */
export function gespraechsArt(titel?: string, anlass?: string): GespraechsArt | null {
  if (istErstgespraech(titel, anlass)) return "erstgespraech";
  if (istBeratungspraesentation(titel, anlass)) return "beratung";
  return null;
}

/** Ende des Gesprächs aus Beginn und Dauer. */
export function gespraechsEnde(beginn: Date, dauerMinuten?: number): Date {
  const minuten = Number(dauerMinuten) > 0 ? Number(dauerMinuten) : STANDARD_DAUER_MIN;
  return new Date(beginn.getTime() + minuten * 60 * 1000);
}

function lokalerTag(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lokaleUhrzeit(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Fällig zwei Stunden nach Gesprächsende, als Tag und Uhrzeit (Ortszeit). */
export function zusammenfassungFaellig(ende: Date): { tag: string; uhrzeit: string } {
  const faellig = new Date(ende.getTime() + 2 * STUNDE_MS);
  return { tag: lokalerTag(faellig), uhrzeit: lokaleUhrzeit(faellig) };
}

export function zusammenfassungSchluessel(kontaktId: string, art: GespraechsArt, beginn: Date): string {
  return `gespraech_zusammenfassen:${kontaktId}:${art}:${lokalerTag(beginn)}`;
}

export interface GespraechAnlass {
  kontaktId: string;
  kundeName: string;
  art: GespraechsArt;
  beginn: Date;
  dauerMinuten?: number;
  rueckfallZustaendig?: string;
  erstelltVonName?: string;
  investmentId?: string;
}

/**
 * Nach einem stattgefundenen Erstgespräch oder einer Beratungspräsentation:
 * die Aufgabe „Gespräch zusammenfassen“. Bei der Beratungspräsentation merkt
 * sich der Kontakt zusätzlich ihr Ende, daran messen sich die 24- und
 * 48-Stunden-Regel. Fehler bleiben still: das Terminergebnis ist schon
 * gespeichert und darf daran nicht scheitern.
 */
export async function legeZusammenfassungAn(a: GespraechAnlass): Promise<boolean> {
  if (Number.isNaN(a.beginn.getTime())) return false;
  const ende = gespraechsEnde(a.beginn, a.dauerMinuten);
  const { tag, uhrzeit } = zusammenfassungFaellig(ende);
  const gespraech = a.art === "beratung" ? "der Beratungspräsentation" : "dem Erstgespräch";
  if (a.art === "beratung") {
    try {
      await mergeKontaktMeta(a.kontaktId, { [BP_ENDE_META]: ende.toISOString() });
    } catch (fehler) {
      console.error("Nachfassplan: Ende der Beratungspräsentation nicht gemerkt:", fehler);
    }
  }
  try {
    return await addProzessAufgabe({
      titel: ZUSAMMENFASSEN_TITEL,
      beschreibung: `Nach ${gespraech} mit ${a.kundeName}: Ziel in den Worten des Kunden, was ihm wichtig ist, offene Fragen und nächste Schritte zusammenfassen und als Mail senden (Vorlage „Nachfass-Mail: Zusammenfassung“).`,
      prioritaet: "hoch",
      typ: "follow_up",
      faellig_am: tag,
      uhrzeit,
      kundeId: a.kontaktId,
      kundeName: a.kundeName,
      erstelltVonName: a.erstelltVonName,
      investmentId: a.investmentId,
      ausloeserSchluessel: zusammenfassungSchluessel(a.kontaktId, a.art, a.beginn),
    }, a.rueckfallZustaendig);
  } catch (fehler) {
    console.error("Nachfassplan: Zusammenfassung nicht angelegt:", fehler);
    return false;
  }
}

/** Was nach der Beratungspräsentation noch fehlt, lesbar. Leer heißt: alles da. */
export function offenNachBeratung(meta: Record<string, unknown> | null | undefined): string[] {
  const offen: string[] = [];
  if (!selbstauskunftErledigt(meta)) offen.push("Selbstauskunft");
  const unterlagen = fehlendeMindestunterlagen(meta);
  if (unterlagen.length > 0) offen.push(mindestunterlagenText(unterlagen));
  return offen;
}

export type BeratungsNachfass = "unterlage_fehlt" | "keine_reaktion";

/**
 * Welche Aufgaben nach der Beratungspräsentation fällig sind.
 *
 * 24 Stunden danach und noch etwas offen: erinnern. 48 Stunden danach, noch
 * immer offen und kein Termin geplant: anrufen. Ein geplanter Termin (etwa die
 * Objektvorstellung) ist eine Reaktion.
 */
export function nachfassNachBeratung(e: {
  endeMs: number;
  jetztMs: number;
  stufe: string | null | undefined;
  offen: string[];
  hatKuenftigenTermin: boolean;
}): BeratungsNachfass[] {
  if (!Number.isFinite(e.endeMs) || e.offen.length === 0) return [];
  if (!STUFEN_NACH_BERATUNG.includes(String(e.stufe || ""))) return [];
  const seit = e.jetztMs - e.endeMs;
  const faellig: BeratungsNachfass[] = [];
  if (seit >= 24 * STUNDE_MS) faellig.push("unterlage_fehlt");
  if (seit >= 48 * STUNDE_MS && !e.hatKuenftigenTermin) faellig.push("keine_reaktion");
  return faellig;
}

export function beratungsNachfassSchluessel(art: BeratungsNachfass, kontaktId: string, endeIso: string): string {
  return `${art}_nach_beratung:${kontaktId}:${endeIso.slice(0, 10)}`;
}

export function beratungsNachfassTexte(art: BeratungsNachfass, kundeName: string, offen: string[]) {
  return art === "unterlage_fehlt"
    ? {
        titel: UNTERLAGE_FEHLT_TITEL,
        beschreibung: `Seit der Beratungspräsentation sind 24 Stunden vergangen. Von ${kundeName} fehlt noch: ${offen.join(", ")}. Bitte freundlich erinnern.`,
        typ: "follow_up" as const,
      }
    : {
        titel: KEINE_REAKTION_TITEL,
        beschreibung: `Seit der Beratungspräsentation sind 48 Stunden vergangen, ${kundeName} hat noch nicht reagiert. Offen: ${offen.join(", ")}. Bitte anrufen.`,
        typ: "anruf" as const,
      };
}

/** Ab so vielen Fehlversuchen seit dem letzten Gespräch: letzte Nachricht. */
export const DREI_VERSUCHE = 3;

/** Ein „Nicht erreicht“ ab der Beratungspräsentation, wie es das Kundenprofil vermerkt. */
const FEHLVERSUCH = /Nicht erreicht \(Stufe/;
/** Ein stattgefundenes Gespräch, wie es die Terminergebnisse vermerken. */
const GESPRAECH = /(erschienen|stattgefunden) ✓$/;

/**
 * Wie viele Kontaktversuche seit dem letzten stattgefundenen Gespräch
 * gescheitert sind.
 *
 * Gezählt werden die Vermerke „Kontaktversuch N – Nicht erreicht (Stufe …)“,
 * die das Kundenprofil bei jedem gescheiterten Anruf ab der
 * Beratungspräsentation schreibt. Der Gesamtzähler `nichtErreichtCount`
 * taugt dafür nicht allein: Er zählt auch die Versuche aus der Leadphase und
 * wird nie zurückgesetzt, ein Kunde mit fünf alten Versuchen hätte die Grenze
 * schon beim ersten neuen Anruf überschritten.
 */
export function fehlversucheSeitGespraech(aktivitaeten: AktivitaetEntry[]): { anzahl: number; seit: string } {
  const gespraeche = aktivitaeten
    .filter((a) => a.art === "meeting" && GESPRAECH.test(a.beschreibung || "") && !/nicht (erschienen|stattgefunden)/i.test(a.beschreibung || ""))
    .map((a) => a.datum)
    .sort();
  const seit = gespraeche[gespraeche.length - 1] || "";
  const anzahl = aktivitaeten.filter((a) => a.art === "anruf" && FEHLVERSUCH.test(a.beschreibung || "") && (!seit || a.datum > seit)).length;
  return { anzahl, seit };
}

export function dreiVersucheSchluessel(kontaktId: string, seit: string): string {
  return `drei_versuche:${kontaktId}:${seit.slice(0, 10) || "ohne_gespraech"}`;
}
