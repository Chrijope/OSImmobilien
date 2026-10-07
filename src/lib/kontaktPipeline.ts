import { z } from "zod";
// Stufen, Wahrscheinlichkeiten und der Zod-Enum liegen in einem eigenen Modul
// ohne weitere Abhängigkeiten. Sie werden hier weiter exportiert, damit alle
// vorhandenen Importe unverändert funktionieren.
export {
  PIPELINE_STUFEN,
  STUFEN_WAHRSCHEINLICHKEIT,
  wahrscheinlichkeitFuerStufe,
  PipelineStufeZodEnum,
  type PipelineStufeZodType,
} from "@/lib/pipelineStufen";
import { PIPELINE_STUFEN, fortschrittsRang, istEndzustand } from "@/lib/pipelineStufen";
import { pflichtBonitaetDocs } from "@/lib/bonitaetDocs";
// Statischer Import statt require: require existiert im Vite/ESM-Bundle nicht,
// die drei Aufrufstellen weiter unten liefen deshalb immer in ihren catch und
// gaben leere Daten zurueck. dataCache importiert dieses Modul nicht, es
// entsteht also kein Kreis.
import { cacheGet } from "@/lib/dataCache";
import { getInvestmentsByKontakt, getSaSigned, getRvSigned, getSaSignaturePending } from "@/lib/investmentsStore";
import type { KundeData } from "@/lib/kundenStore";





export type PipelineStufe = typeof PIPELINE_STUFEN[number]["key"];
export type ProzessBereich = "bestandsimport" | "leadverwaltung" | "kontakte" | "followup" | "neukunden" | "abwicklung" | "bestandskunden" | "verloren";

const PIPELINE_STAGE_SET = new Set<string>(PIPELINE_STUFEN.map((stufe) => stufe.key));
export const PIPELINE_ORDER = PIPELINE_STUFEN.map((stufe) => stufe.key);


export function normalizePipelineStufe(stufe?: string | null): PipelineStufe | null {
  if (!stufe) return null;
  // Legacy-Mapping: alte/entfernte Stufen auf neue Stufen mappen
  let normalized: string = stufe;
  if (normalized === "after_sales" || normalized === "aftersales") normalized = "faelligkeit";
  if (normalized === "closing") normalized = "objektauswahl";
  /*
   * "Erstgespraech gefuehrt" und "Erstgespraech geplant" sind zu einer Stufe
   * "Erstgespraech" zusammengelegt. Der Schluessel "erstgespraech_geplant"
   * bleibt, weil der Buchungs-Trigger in der Datenbank ihn schreibt. Altdaten
   * mit "erstgespraech" werden hier umgeschrieben, damit sie nicht aus der
   * Zuordnung fallen und der Kontakt in keiner Spalte mehr auftaucht.
   */
  if (normalized === "erstgespraech") normalized = "erstgespraech_geplant";
  // "zugewiesen", "kontaktversuche" und "vermoegensaufbau" wurden hier frueher
  // auf andere Stufen umgeschrieben. Sie sind aber keine Altlasten, sondern
  // Teil des Ablaufs: Der Versicherungsexperte sieht in der Pipeline sogar
  // ausschliesslich die Spalte "Vermoegensaufbau", und solange sie hier
  // umgeschrieben wurde, blieb sie fuer ihn dauerhaft leer. Ein Zug in eine
  // dieser Spalten verpuffte ausserdem sofort wieder. Sie bleiben deshalb
  // eigenstaendige Stufen.
  // "Notar mit GS" und "Notar ohne GS" sind Anzeigevarianten der Stufe Notar,
  // je nachdem ob die Grundschuld schon vorliegt. Sie sind keine eigenen
  // Pipeline-Stufen. Wurden sie versehentlich als Stufe gespeichert, ergaben
  // sie hier null, und ein Investment mit null faellt aus der Zuordnung
  // heraus, der Kunde waere in keiner Spalte mehr sichtbar.
  if (normalized === "notar_mit_gs" || normalized === "notar_ohne_gs") normalized = "notar";
  return PIPELINE_STAGE_SET.has(normalized) ? (normalized as PipelineStufe) : null;
}

function getHighestInvestmentStufe(kundeId: string): PipelineStufe | null {
  const investments = getInvestmentsByKontakt(kundeId);
  // Wenn es mindestens ein "aktives" (= noch nicht abgeschlossenes/archiviertes) Investment gibt,
  // sollen NUR diese aktiven Investments den Bereich bestimmen. Sonst würde ein bereits
  // abgeschlossener Deal (Stufe "abgeschlossen") den Kunden dauerhaft in "Bestandskunden" halten.
  const aktive = investments.filter(inv => {
    const n = normalizePipelineStufe(inv.pipelineStufe);
    return n && n !== "abgeschlossen" && !istEndzustand(n);
  });
  const pool = aktive.length > 0 ? aktive : investments;

  // IMMER die HÖCHSTE erreichte Stufe gewinnt — der Kunde wird in der weitest fortgeschrittenen
  // Pipeline-Spalte angezeigt. Alte "erstgespraech"-Stub-Investments dürfen einen Kunden NICHT
  // aus "reservierung"/"finanzierung" zurückziehen.
  //
  /*
   * Ab welcher Stufe ein Investment ein echter Vorgang ist und kein Altrest.
   *
   * Frühere Stufen ("erstgespraech", "beratungsgespraech", "eg_noshow",
   * "bg_noshow") an einem Investment sind Legacy-Stubs und dürfen den Kunden
   * nicht aus einer früheren Kontakt-Stufe nach vorne ziehen, etwa nach einer
   * Neuzuweisung als "neuer_lead".
   *
   * Die Grenze lag auf "bonitaetsunterlagen", solange diese Stufe die erste
   * war, an der ein Investment entsteht. Seit die Reihenfolge gedreht ist,
   * steht sie hinter der Reservierung, und die Grenze hätte Investments in
   * "objektauswahl" und "reservierung" verschluckt: Ein Kunde mit
   * unterschriebener Reservierungsvereinbarung wäre aus der Pipeline gefallen.
   *
   * Jetzt "selbstauskunft", und zwar nicht als Zahl, sondern über den Namen:
   * Ab dort hängen echte Daten am Investment, die Selbstauskunft selbst mit
   * ihren Angaben und ihrer Unterschrift.
   */
  /*
   * Rangfolge über `fortschrittsRang` und Endzustände über `istEndzustand`
   * aus `pipelineStufen.ts`, dieselbe Regel wie die Fortschrittsleiste
   * (M20, 04.10.2026). Vorher zählte die Position in PIPELINE_STUFEN, und
   * dort stehen Verloren, Archiviert und die Altstufe Vermögensaufbau ganz
   * hinten: Sie schlugen jeden echten Fortschritt.
   *
   * Ein Endzustand gilt nur, wenn es nichts anderes gibt (alle Investments
   * beendet).
   */
  const MINDESTRANG = fortschrittsRang("selbstauskunft");
  let ergebnis: PipelineStufe | null = null;
  let ergebnisRang = -1;
  let endzustand: PipelineStufe | null = null;
  for (const investment of pool) {
    const normalized = normalizePipelineStufe(investment.pipelineStufe);
    if (!normalized) continue;
    if (istEndzustand(normalized)) {
      endzustand = endzustand ?? normalized;
      continue;
    }
    const rang = fortschrittsRang(normalized);
    if (rang < MINDESTRANG) continue;
    if (rang > ergebnisRang) {
      ergebnisRang = rang;
      ergebnis = normalized;
    }
  }

  return ergebnis ?? endzustand;
}

/**
 * Prüft ob der Notartermin (Datum + Uhrzeit) bereits stattgefunden hat.
 * Erwartetes Format: notarTermin = "YYYY-MM-DD" oder "DD.MM.YYYY", notarUhrzeit = "HH:MM".
 */
function isNotarTerminVorbei(datum?: string, uhrzeit?: string): boolean {
  if (!datum) return false;
  let isoDate = datum;
  // DD.MM.YYYY → YYYY-MM-DD
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(datum)) {
    const [d, m, y] = datum.split(".");
    isoDate = `${y}-${m}-${d}`;
  }
  const time = uhrzeit && /^\d{1,2}:\d{2}$/.test(uhrzeit) ? uhrzeit : "23:59";
  const parsed = new Date(`${isoDate}T${time.length === 4 ? "0" + time : time}:00`);
  if (isNaN(parsed.getTime())) return false;
  return parsed.getTime() < Date.now();
}

/**
 * Einheitliche Fehlermeldung, wenn ein geplanter Termin nicht in der
 * Zukunft liegt. Alle Eingabestellen zeigen denselben Text.
 */
export const TERMIN_ZUKUNFT_MELDUNG = "Der Termin muss in der Zukunft liegen";

/**
 * Heutiges Datum als "YYYY-MM-DD" für das `minDate` der Datumsfelder.
 * Bewusst lokale Zeit, nicht UTC: kurz nach Mitternacht wäre das
 * UTC-Datum noch gestern und heute ließe sich nicht mehr wählen.
 */
export function heuteIso(): string {
  const jetzt = new Date();
  const m = String(jetzt.getMonth() + 1).padStart(2, "0");
  const t = String(jetzt.getDate()).padStart(2, "0");
  return `${jetzt.getFullYear()}-${m}-${t}`;
}

/**
 * Liegt ein Termin (Datum, optional Uhrzeit) in der Zukunft?
 *
 * Gegenstück zu `isNotarTerminVorbei`, mit denselben Formaten: Datum als
 * "YYYY-MM-DD" oder "DD.MM.YYYY", Uhrzeit als "HH:MM". Ohne Uhrzeit zählt
 * der Termin bis zum Tagesende als bevorstehend, genau wie dort. Damit gilt
 * bei reinen Datumsfeldern: heute ist erlaubt, gestern nicht.
 */
export function istTerminInZukunft(datum?: string | null, uhrzeit?: string | null): boolean {
  if (!datum) return false;
  let isoDate = datum;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(datum)) {
    const [d, m, y] = datum.split(".");
    isoDate = `${y}-${m}-${d}`;
  }
  const time = uhrzeit && /^\d{1,2}:\d{2}$/.test(uhrzeit) ? uhrzeit : "23:59";
  const parsed = new Date(`${isoDate}T${time.length === 4 ? "0" + time : time}:00`);
  if (isNaN(parsed.getTime())) return false;
  return parsed.getTime() > Date.now();
}

/**
 * Steht für diesen Kontakt ein Beratungstermin in der Zukunft?
 *
 * Der Beratungstermin liegt je nach Schreibweg in zwei Feldern:
 * `setterTerminDatum`/`setterTerminUhrzeit` (Terminvergabe in der Kundenakte,
 * siehe setterTerminName in kontaktTermine.ts) oder
 * `meta.beratungsgespraechAm`/`meta.beratungsgespraechUhrzeit`
 * (VP-Selbstqualifizierung, Gesprächsprotokoll). Beide zählen.
 */
export function hatKuenftigenBeratungstermin(kunde: KundeData): boolean {
  const meta = ((kunde as { meta?: Record<string, unknown> }).meta || {}) as Record<string, string>;
  return (
    istTerminInZukunft(kunde.setterTerminDatum || meta.setterTerminDatum, kunde.setterTerminUhrzeit || meta.setterTerminUhrzeit) ||
    istTerminInZukunft(meta.beratungsgespraechAm, meta.beratungsgespraechUhrzeit)
  );
}

/**
 * Ermittelt automatisch den Bereich aus dem Investment-Status (SA / Reservierung / Notartermin).
 * Wird nur als Fallback genutzt – manuelle pipelineStufe hat Vorrang.
 */
function getAutomatischerBereich(kundeId: string): ProzessBereich | null {
  const allInvestments = getInvestmentsByKontakt(kundeId);
  if (allInvestments.length === 0) return null;
  // Abgeschlossene Investments ignorieren, damit ein frisches Folge-Investment den Kunden
  // nicht automatisch wieder in "bestandskunden" zwingt.
  const aktive = allInvestments.filter(inv => {
    const n = normalizePipelineStufe(inv.pipelineStufe);
    return !n || (n !== "abgeschlossen" && n !== "archiviert" && n !== "verloren");
  });
  const investments = aktive.length > 0 ? aktive : allInvestments;

  let anySaSigned = false;
  let anyRvSigned = false;
  let anyNotarVorbei = false;

  for (const inv of investments) {
    if (getSaSigned(inv.id)) anySaSigned = true;
    if (getRvSigned(inv.id)) anyRvSigned = true;
    if (isNotarTerminVorbei(inv.notarTermin, inv.notarUhrzeit)) anyNotarVorbei = true;
  }

  if (anyNotarVorbei) return "bestandskunden";
  if (anyRvSigned) return "abwicklung";
  if (anySaSigned) return "neukunden";
  return null;
}

// Pflicht-Listen werden zentral in src/lib/bonitaetDocs.ts gepflegt.

function getDocStatuses(investmentId: string): Record<string, string> {
  const row = (cacheGet("investments") || []).find((r: any) => r.id === investmentId);
  return (row?.meta?.docStatuses as Record<string, string>) || {};
}

export function hasMinReservierungsDocs(kundeId: string): boolean {
  // Kein separater Zwischenschritt mehr: SA unterschrieben ⇒ Reservierung freigeschaltet.
  const investments = getInvestmentsByKontakt(kundeId);
  return investments.some((inv) => getSaSigned(inv.id));
}

/**
 * Bereit für Objektauswahl: Die Selbstauskunft ist unterschrieben.
 *
 * Der alte Name `areBonitaetsDocsApprovedAndReleased` versprach mehr, als die
 * Funktion hielt: Sie prüfte nie die Bonitätsunterlagen, sondern allein die
 * unterschriebene Selbstauskunft. Solange die Bonität vor der Objektauswahl
 * lag, fiel das nicht auf, weil beides ungefähr zur selben Zeit geschah.
 *
 * Seit die Reihenfolge gedreht ist, wäre es ein Fehler: Ein Kunde mit
 * unterschriebener Selbstauskunft käme sonst direkt auf "Finanzierung", ohne
 * je Unterlagen abgegeben zu haben. Der alte Name bleibt als Weiterleitung
 * bestehen, weil er an mehreren Stellen aufgerufen wird.
 */
export function istBereitFuerObjektauswahl(kunde: KundeData): boolean {
  const investments = getInvestmentsByKontakt(kunde.id);
  if (investments.length === 0) return false;
  return investments.some((inv) => getSaSigned(inv.id));
}

/** @deprecated Irreführender Name, siehe istBereitFuerObjektauswahl. */
export const areBonitaetsDocsApprovedAndReleased = istBereitFuerObjektauswahl;

/**
 * Sind die Bonitätsunterlagen wirklich vollständig und freigegeben?
 *
 * Das ist die Bedingung für den Sprung auf "Finanzierung" und für die Meldung
 * an den Finanzierungspartner. Geprüft wird, was der Name sagt: Jedes
 * Pflichtdokument aus `REQUIRED_BONITAET_DOCS` muss den Status "approved"
 * tragen, also vom Vertriebspartner angesehen und freigegeben sein.
 *
 * Hochgeladen allein reicht nicht. "uploaded" heißt, dass eine Datei da ist,
 * nicht dass jemand hineingeschaut hat.
 */
export function sindBonitaetsunterlagenFreigegeben(kunde: KundeData): boolean {
  const investments = getInvestmentsByKontakt(kunde.id);
  if (investments.length === 0) return false;

  return investments.some((inv) => {
    const row = (cacheGet("investments") || []).find((r: any) => r.id === inv.id);
    // Kunde finanziert selbst: Nach der unterschriebenen Reservierung gibt es
    // keine Unterlagen, auf die gewartet wird. Vorher nicht, sonst übersprünge
    // der Vorgang die Reservierung.
    if (row?.meta?.selbstauskunftEntfaellt?.aktiv && getRvSigned(inv.id)) return true;
    return sindDokumenteFreigegeben(row?.meta?.docStatuses, (row?.meta?.saData || row?.meta?.saSnapshot)?.beschaeftigungsart);
  });
}

/**
 * Die reine Prüfung, ohne Zugriff auf Zwischenspeicher oder Stores.
 *
 * Ausgelagert, damit sie sich prüfen lässt: Die Funktion darüber holt ihre
 * Daten aus dem Zwischenspeicher, und der ist im Test leer.
 */
export function sindDokumenteFreigegeben(
  docStatuses?: Record<string, string> | null,
  /** Beschaeftigungsart aus der Selbstauskunft: Selbststaendige haben keine Gehaltsnachweise. */
  beschaeftigungsart?: string | null,
): boolean {
  const status = docStatuses || {};
  return pflichtBonitaetDocs(beschaeftigungsart).every((name) => status[name] === "approved");
}

export function hasOpenReservierung(kundeId: string): boolean {
  const investments = getInvestmentsByKontakt(kundeId);
  return investments.some((inv) => {
    const row = (cacheGet("investments") || []).find((r: any) => r.id === inv.id);
    const meta = row?.meta || {};
    const rvOpened = !!(meta.rvPdfFilename || meta.reservierungEroeffnetAm || meta.reservierungData);
    return rvOpened && !getRvSigned(inv.id);
  });
}

export function hasNotarTerminSet(kundeId: string): boolean {
  const investments = getInvestmentsByKontakt(kundeId);
  return investments.some((inv) => !!inv.notarTermin || !!(inv as any)?.notarTerminPortalFreigabe);
}

/**
 * Berechnet die "logisch korrekte" Pipeline-Stufe basierend auf realen Daten.
 * Wird von Auto-Triggern verwendet — manuelle pipelineStufe hat in der UI weiterhin Vorrang.
 */
export function calculateLogicalPipelineStufe(kunde: KundeData): PipelineStufe | null {
  if (kunde.archiviert) return "archiviert";
  if (kunde.status === "verloren" || kunde.status === "inaktiv") return "verloren";

  // Reverse-Order: höchste Stufe zuerst prüfen
  const investments = getInvestmentsByKontakt(kunde.id);

  // Notartermin vorbei → faelligkeit
  if (investments.some((i) => isNotarTerminVorbei(i.notarTermin, i.notarUhrzeit))) {
    return "faelligkeit";
  }
  // Notartermin gesetzt oder portal-bestätigt → notar
  if (hasNotarTerminSet(kunde.id)) return "notar";
  /*
   * Reihenfolge seit 06.08.2026 gedreht.
   *
   * Vorher lag die Bonitaetspruefung vor der Objektauswahl: Erst wissen, was
   * der Kunde tragen kann, dann Objekte zeigen. Das bremste genau in dem
   * Moment, in dem der Kunde nach dem Beratungsgespraech am heissesten ist.
   *
   * Jetzt gilt: Objekt zeigen, reservieren, und erst dann die Unterlagen
   * einsammeln. Ein konkretes Objekt motiviert dazu deutlich mehr als eine
   * abstrakte Anforderung.
   *
   * Der Preis dafuer: Eine Einheit ist reserviert, bevor die Finanzierbarkeit
   * feststeht. Dagegen meldet der Nachtwaechter Reservierungen, die laenger
   * als vierzehn Tage ohne freigegebene Bonitaet stehen.
   *
   * Geprueft wird von hinten nach vorne, die hoechste erreichte Stufe gewinnt.
   */
  // Bonitaet vollstaendig und freigegeben → finanzierung
  if (sindBonitaetsunterlagenFreigegeben(kunde)) return "finanzierung";
  // RV unterschrieben → bonitaetsunterlagen (jetzt der Schritt danach)
  const rvSigned = investments.some((i) => getRvSigned(i.id));
  if (rvSigned) return "bonitaetsunterlagen";
  // RV eröffnet, noch nicht unterschrieben → reservierung
  if (hasOpenReservierung(kunde.id)) return "reservierung";
  // SA unterschrieben → objektauswahl
  if (istBereitFuerObjektauswahl(kunde)) return "objektauswahl";
  /*
   * SA verschickt, Unterschrift steht aus → selbstauskunft.
   *
   * Diese Stufe leitete sich bisher gar nicht aus den Daten ab, sie liess
   * sich nur von Hand setzen. Wer auf eine Unterschrift wartete, stand
   * deshalb weiter unter "Beratungsgespraech", und niemand sah, dass an dem
   * Vorgang etwas laeuft.
   */
  if (investments.some((i) => getSaSignaturePending(i.id))) return "selbstauskunft";

  return null;
}

export function getEffectivePipelineStufe(kunde: KundeData): PipelineStufe {
  // Archived contacts go to "archiviert" column
  if (kunde.archiviert) return "archiviert";

  // „Verloren"/„inaktiv" (Top-Level-Status) hat IMMER Vorrang – sonst können
  // Auto-Trigger, die meta.pipelineStufe überschreiben, einen als verloren
  // markierten Lead wieder in eine aktive Stufe zurückholen.
  if (kunde.status === "verloren" || kunde.status === "inaktiv") return "verloren";

  // Die Investment-Stufe ist die alleinige Wahrheit, sobald mindestens ein
  // Investment existiert. Die am Kontakt gespeicherte Stufe (Legacy /
  // Setter-Workflow) wird nur genutzt, wenn kein Investment vorhanden ist.
  const investmentStufe = getHighestInvestmentStufe(kunde.id);
  if (investmentStufe) {
    return investmentStufe;
  }

  const direkteStufe = normalizePipelineStufe(kunde.pipelineStufe);
  if (direkteStufe) {
    /*
     * BG NoShow heilt sich selbst, sobald wieder ein Beratungstermin in der
     * Zukunft steht: Der geplatzte Termin ist dann neu vereinbart, der Kunde
     * gehört zurück in die Spalte "Beratungsgespräch". Ohne diese Regel lief
     * die Pipeline auseinander, je nachdem, über welchen Weg der neue Termin
     * eingetragen wurde: Einige Wege setzen die Kontakt-Stufe mit, andere
     * (etwa das Verschieben-Dialogfeld) schrieben nur den Termin. Automatik
     * wiegt hier wie überall schwerer als die gespeicherte Stufe.
     */
    if (direkteStufe === "bg_noshow" && hatKuenftigenBeratungstermin(kunde)) {
      return "beratungsgespraech";
    }
    return direkteStufe;
  }

  // Status-basierter Fallback (kein Investment, keine manuelle Stufe)
  if (kunde.status === "kunde" && kunde.objekt) return "abgeschlossen";
  if (kunde.status === "kunde") return "faelligkeit";
  if (kunde.status === "qualifiziert") return "bonitaetsunterlagen";
  // Neue Fallback-Logik: „kontaktiert" allein ist nicht mehr aussagekräftig,
  // seit der `status`-Wert offiziell entfernt ist. Wir stützen uns auf reale
  // Signale — Kontaktversuche und geplante Termine.
  const meta: any = (kunde as any).meta || {};
  const nichtErreichtCount = Number(meta.nichtErreichtCount || (kunde as any).nichtErreichtCount || 0);
  const hasFutureTermin = !!(kunde as any).setterTerminDatum || !!meta.setterTerminDatum || !!meta.beratungsgespraechAm;
  if (hasFutureTermin) return "erstgespraech_geplant";
  if (nichtErreichtCount > 0) return "nicht_erreicht";
  if (kunde.status === "kontaktiert") return "erreicht";
  return "neuer_lead";
}

export function getProzessBereich(kunde: KundeData): ProzessBereich {
  // Sonderfälle bleiben wie bisher
  if (kunde.archiviert) return "verloren";

  const stufe = getEffectivePipelineStufe(kunde);
  if (stufe === "verloren" || stufe === "archiviert") return "verloren";

  // Automatik basierend auf SA / Reservierung / Notartermin
  // (greift nur, wenn keine manuelle Stufe gesetzt wurde, die einen späteren Bereich ergibt)
  const automatisch = getAutomatischerBereich(kunde.id);

  // Bereich aus manueller Stufe ableiten
  let manuellerBereich: ProzessBereich;
  if (stufe === "bestandsimport") manuellerBereich = "bestandsimport";
  else if (["neuer_lead", "nicht_erreicht", "erreicht"].includes(stufe)) manuellerBereich = "leadverwaltung";
  else if (stufe === "follow_up") manuellerBereich = "followup";
  // "zugewiesen" gehoert zu "kontakte", siehe getProzessBereichForStufe.
  else if (["zugewiesen", "erstgespraech_geplant", "erstgespraech", "eg_noshow", "beratungsgespraech", "bg_noshow"].includes(stufe)) manuellerBereich = "kontakte";
  // "follow_up_objekt" gehoert zur Objektauswahl-Phase (nur manuell gesetzt,
  // siehe pipelineStufen.ts), deshalb derselbe Bereich wie "objektauswahl".
  else if (["selbstauskunft", "bonitaetsunterlagen", "objektauswahl", "follow_up_objekt"].includes(stufe)) manuellerBereich = "neukunden";
  else if (["reservierung", "finanzierung", "notar", "faelligkeit", "abrechnung"].includes(stufe)) manuellerBereich = "abwicklung";
  else manuellerBereich = "bestandskunden";

  // Wenn die Automatik einen "späteren" Bereich ergibt als die manuelle Stufe,
  // gewinnt die Automatik (z. B. SA wurde unterschrieben, manuell steht aber noch auf "erstgespraech").
  // Andernfalls bleibt die manuelle Stufe (= "Manuell hat Vorrang" für Rückwärtsschritte).
  if (!automatisch) return manuellerBereich;

  const RANG: Record<ProzessBereich, number> = {
    bestandsimport: -2,
    leadverwaltung: 0,
    kontakte: 1,
    followup: 1,
    neukunden: 2,
    abwicklung: 3,
    bestandskunden: 4,
    verloren: -1,
  };

  return RANG[automatisch] > RANG[manuellerBereich] ? automatisch : manuellerBereich;
}

export function isLeadverwaltungKontakt(kunde: KundeData): boolean {
  return getProzessBereich(kunde) === "leadverwaltung";
}

/* =====================================================================
 * INVESTMENT-ZENTRISCHE BUCKET-DARSTELLUNG
 *
 * Ein Kontakt kann mehrere Investments in unterschiedlichen Pipeline-
 * Stufen haben (z. B. Frank Otto: ein Investment in "objektauswahl",
 * eines in "notar", eines "abgeschlossen"). Die Bucket-Pages
 * (Kontakte / Neukunden / Abwicklung / Bestandskunden) sollen den
 * Kunden in JEDEM Bucket anzeigen, in dem mindestens ein Investment
 * liegt — mit einer eigenen Zeile pro Investment.
 * ===================================================================== */

/** Mappt eine einzelne Pipeline-Stufe auf den zugehörigen Prozess-Bereich. */
export function getProzessBereichForStufe(stufe: string | null | undefined): ProzessBereich {
  const s = normalizePipelineStufe(stufe);
  if (!s) return "leadverwaltung";
  if (s === "verloren" || s === "archiviert") return "verloren";
  if (s === "bestandsimport") return "bestandsimport";
  if (["neuer_lead", "nicht_erreicht", "erreicht"].includes(s)) return "leadverwaltung";
  if (s === "follow_up") return "followup";
  /*
   * "zugewiesen" heisst: Ein Partner ist zustaendig, der erste Anruf steht noch
   * aus. Der Bereich dafuer ist "kontakte".
   *
   * Die Stufe fehlte in dieser Aufzaehlung und fiel deshalb bis ans Ende der
   * Funktion durch, also in "bestandskunden". Ein frischer Lead von einer
   * Partnerseite stand damit unter den Bestandskunden. Aufgefallen ist das
   * lange nicht, weil nur die Microseiten-Leads diese Stufe bekamen. Seit die
   * Stufe an der Partnerzuordnung haengt (siehe `lead-zuordnung.ts` in den Edge
   * Functions), betrifft es alle Leads eines Partners.
   */
  if (["zugewiesen", "erstgespraech_geplant", "erstgespraech", "eg_noshow", "beratungsgespraech", "bg_noshow"].includes(s)) return "kontakte";
  // "follow_up_objekt" liegt in der Objektauswahl-Phase, siehe getProzessBereich.
  if (["selbstauskunft", "bonitaetsunterlagen", "objektauswahl", "follow_up_objekt"].includes(s)) return "neukunden";
  if (["reservierung", "finanzierung", "notar", "faelligkeit", "abrechnung"].includes(s)) return "abwicklung";
  return "bestandskunden";
}

/** Ein Eintrag in einer Bucket-Liste — entweder per Kontakt (kein Investment) oder per Investment. */
export interface KundeBucketEntry {
  kunde: KundeData;
  bucket: ProzessBereich;
  stufe: PipelineStufe;
  /** Wenn gesetzt → Eintrag stammt aus einem konkreten Investment. */
  investmentId?: string;
  investmentNummer?: number;
  objektLabel?: string;
}

/**
 * Liefert pro Kontakt ein Array von Bucket-Einträgen.
 * - Kontakt ohne Investments → genau 1 Eintrag (klassische Bucket-Logik).
 * - Kontakt mit Investments  → 1 Eintrag pro aktivem Investment + ggf. 1 Eintrag
 *   für abgeschlossene/Bestand-Investments (Bestandskunden-Bucket).
 * - Archivierte / verlorene Kontakte → 1 Eintrag im "verloren"-Bucket.
 */
export function getBucketEntriesForKunde(kunde: KundeData): KundeBucketEntry[] {
  if (kunde.archiviert) {
    return [{ kunde, bucket: "verloren", stufe: "archiviert" }];
  }
  if (kunde.status === "verloren" || kunde.status === "inaktiv") {
    return [{ kunde, bucket: "verloren", stufe: "verloren" }];
  }

  const investments = getInvestmentsByKontakt(kunde.id);
  if (investments.length === 0) {
    return [{ kunde, bucket: getProzessBereich(kunde), stufe: getEffectivePipelineStufe(kunde) }];
  }

  const entries: KundeBucketEntry[] = [];
  for (const inv of investments) {
    const stufe = normalizePipelineStufe(inv.pipelineStufe) || "neuer_lead";
    // Verlorene/archivierte Investments tauchen nicht in den aktiven Buckets auf.
    if (stufe === "verloren" || stufe === "archiviert") continue;
    entries.push({
      kunde,
      investmentId: inv.id,
      investmentNummer: inv.nummer,
      objektLabel: inv.objektTitel || inv.label,
      bucket: getProzessBereichForStufe(stufe),
      stufe,
    });
  }

  if (entries.length === 0) {
    // Alle Investments sind verloren/archiviert → klassischer Fallback
    return [{ kunde, bucket: getProzessBereich(kunde), stufe: getEffectivePipelineStufe(kunde) }];
  }
  return entries;
}

/** Liefert alle Buckets, in denen ein Kontakt erscheinen muss (de-dupliziert). */
export function getBucketsForKunde(kunde: KundeData): ProzessBereich[] {
  const set = new Set<ProzessBereich>();
  for (const e of getBucketEntriesForKunde(kunde)) set.add(e.bucket);
  return Array.from(set);
}

/** Convenience: filtert eine Kontaktliste auf alle, die in einem bestimmten Bucket erscheinen sollen,
 *  und expandiert sie auf Investment-Ebene (1 Eintrag pro Investment im Bucket). */
export function buildBucketEntries(kontakte: KundeData[], bucket: ProzessBereich): KundeBucketEntry[] {
  const out: KundeBucketEntry[] = [];
  for (const k of kontakte) {
    for (const e of getBucketEntriesForKunde(k)) {
      if (e.bucket === bucket) out.push(e);
    }
  }
  return out;
}
