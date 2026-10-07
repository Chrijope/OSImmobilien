/**
 * Pipelinestufen als eigenständiges Modul.
 *
 * Vorher lagen diese Konstanten in `kontaktPipeline.ts`, das seinerseits den
 * Investment-Speicher lädt. Über `kontaktMetaSchema` entstand daraus ein
 * Kreis: kontaktPipeline lädt investmentsStore lädt kontaktMetaSchema lädt
 * kontaktPipeline. In der Anwendung fiel das nicht auf, weil immer etwas
 * anderes zuerst geladen wurde, beim direkten Import brach es aber ab.
 * Hier gibt es außer zod keine Abhängigkeit, damit ist der Kreis zu.
 */
import { z } from "zod";

export const PIPELINE_STUFEN = [
  { key: "neuer_lead", label: "Neuer Lead" },
  { key: "nicht_erreicht", label: "Nicht erreicht" },
  { key: "erreicht", label: "Erreicht" },
  { key: "follow_up", label: "Follow-Up" },
  /*
   * Eine Stufe fuer das Erstgespraech, so wie es beim Beratungsgespraech
   * schon immer war.
   *
   * Frueher standen hier zwei: "Erstgespraech geplant" und "Erstgespraech
   * gefuehrt". Die Trennung hat nie funktioniert, weil keine Stelle im System
   * nach dem Gespraech von der einen auf die andere geschaltet hat. Gesetzt
   * wurde "gefuehrt" beim Anlegen eines Kontakts und vom Setter-Skript beim
   * BUCHEN eines Termins. Damit trennten die beiden Stufen nicht geplant von
   * gefuehrt, sondern nur, auf welchem Weg der Kontakt entstanden ist, und der
   * Forecast rechnete denselben Sachverhalt einmal mit 15 und einmal mit
   * 20 Prozent.
   *
   * Der Schluessel bleibt "erstgespraech_geplant", weil der Buchungs-Trigger
   * in der Datenbank ihn schreibt. "erstgespraech" wird in
   * `normalizePipelineStufe` auf ihn abgebildet.
   */
  { key: "erstgespraech_geplant", label: "Erstgespräch" },
  { key: "eg_noshow", label: "EG NoShow" },
  { key: "beratungsgespraech", label: "Beratungsgespräch" },
  { key: "bg_noshow", label: "BG NoShow" },
  { key: "selbstauskunft", label: "Selbstauskunft" },
  { key: "objektauswahl", label: "Objektauswahl" },
  /*
   * NUR MANUELL: Diese Stufe setzt ausschliesslich ein Partner von Hand,
   * wenn der Kunde nach der Objektvorstellung noch ueberlegt. Keine Automatik
   * (Auto-Advance in KundenDetail, calculateLogicalPipelineStufe,
   * bulk_recompute_pipeline, Buchungs-Trigger) darf einen Kontakt jemals auf
   * "follow_up_objekt" bewegen. Automatiken duerfen einen manuell hierhin
   * gesetzten Kontakt nur nach VORNE ueberholen (z. B. auf "reservierung",
   * sobald eine Reservierungsvereinbarung eroeffnet ist), nie zurueckziehen.
   * Der Schluessel ist bewusst nicht "follow_up": Das ist die fruehe
   * Wiedervorlage-Stufe nach "Erreicht", die es weiterhin gibt. Beide tragen
   * denselben Anzeigenamen "Follow-Up"; wo beide nebeneinander in einer
   * Auswahl stehen, unterscheidet `stufenFilterLabel` mit dem Zusatz
   * "(nach Objektauswahl)".
   */
  { key: "follow_up_objekt", label: "Follow-Up" },
  { key: "reservierung", label: "Reservierung" },
  { key: "bonitaetsunterlagen", label: "Bonitätsunterlagen" },
  { key: "finanzierung", label: "Finanzierung" },
  { key: "notar", label: "Notar" },
  { key: "faelligkeit", label: "Fälligkeit" },
  { key: "abrechnung", label: "Abrechnung" },
  { key: "abgeschlossen", label: "Abgeschlossen" },
  { key: "bestandsimport", label: "Bestandskunden Import" },
  { key: "archiviert", label: "Archiviert" },
  { key: "verloren", label: "Verloren" },
  // Legacy-Aliase (in UI nicht mehr angezeigt, aber Type-kompatibel für Altcode)
  { key: "zugewiesen", label: "Zugewiesen" },
  { key: "kontaktversuche", label: "Kontaktversuche" },
  { key: "vermoegensaufbau", label: "Vermögensaufbau" },
] as const;

/**
 * Abschlusswahrscheinlichkeit je Pipelinestufe, für den gewichteten Forecast.
 *
 * Lag bisher dreimal im Code, mit drei verschiedenen Wertesätzen. Auf derselben
 * Seite standen dadurch zwei verschiedene Forecast-Zahlen für dieselben Deals.
 * Die Werte hier entsprechen der Tabelle, die in der Pipeline-Übersicht bisher
 * benutzt wurde. Die Stufen, die in keiner der alten Tabellen vorkamen, sind so
 * eingeordnet, dass die Reihenfolge der Pipeline erhalten bleibt.
 */
export const STUFEN_WAHRSCHEINLICHKEIT: Record<string, number> = {
  neuer_lead: 0.05,
  nicht_erreicht: 0.03,
  erreicht: 0.08,
  follow_up: 0.1,
  erstgespraech_geplant: 0.15,
  eg_noshow: 0.08,
  beratungsgespraech: 0.3,
  bg_noshow: 0.12,
  selbstauskunft: 0.32,
  objektauswahl: 0.42,
  // Der Kunde hat Objekte gesehen und ueberlegt noch: etwas mehr als die
  // blosse Objektauswahl, deutlich weniger als eine Reservierung.
  follow_up_objekt: 0.45,
  reservierung: 0.6,
  /*
   * Die Bonitaet steht jetzt hinter der Reservierung, ihre Zahl steigt
   * entsprechend. Der Sprung von 0,60 auf 0,75 ist der groesste im Verlauf,
   * und das ist gewollt: Wer reserviert hat UND die Bonitaet beisammen hat,
   * springt selten wieder ab.
   *
   * Reservierung faellt von 0,70 auf 0,60, weil eine Reservierung ohne
   * geprueft Bonitaet weniger wert ist als vorher, wo die Bonitaet schon
   * dahinter lag.
   */
  bonitaetsunterlagen: 0.75,
  finanzierung: 0.8,
  notar: 0.9,
  faelligkeit: 1,
  abrechnung: 1,
  abgeschlossen: 1,
  // Stufen ohne Abschlusserwartung
  bestandsimport: 0,
  archiviert: 0,
  verloren: 0,
  // Legacy-Aliase, damit Altdaten nicht auf den Standardwert fallen
  // "erstgespraech" ist seit der Zusammenlegung ein Alias auf
  // "erstgespraech_geplant" und traegt deshalb denselben Wert.
  erstgespraech: 0.15,
  zugewiesen: 0.05,
  kontaktversuche: 0.08,
  vermoegensaufbau: 0.12,
  closing: 0.45,
};

/** Wahrscheinlichkeit einer Stufe, mit einheitlichem Standardwert. */
export function wahrscheinlichkeitFuerStufe(stufe: string | null | undefined): number {
  if (!stufe) return 0.05;
  return STUFEN_WAHRSCHEINLICHKEIT[stufe] ?? 0.1;
}

/**
 * Stufen, die in der Fortschrittsleiste im Kundenprofil KEIN eigenes Kästchen
 * bekommen.
 *
 * Zwei Gruppen: Sonderzustände, die gar kein Fortschritt sind
 * ("bestandsimport", "archiviert", "verloren"), und Stufen, die zwar einen
 * Rang haben, aber keinen eigenen Schritt darstellen. Die NoShow-Stufen
 * gehören in die zweite Gruppe: Ein geplatzter Termin ist ein Rückschlag, kein
 * Fortschritt. Die Legacy-Aliase stehen in `PIPELINE_STUFEN` ohnehin am Ende
 * und dürfen die Reihenfolge nicht durcheinanderbringen.
 */
const OHNE_EIGENEN_SCHRITT = new Set<string>([
  "eg_noshow",
  // Seit der Zusammenlegung ein Alias auf "erstgespraech_geplant".
  "erstgespraech",
  "bg_noshow",
  "bestandsimport",
  "archiviert",
  "verloren",
  "zugewiesen",
  "kontaktversuche",
  "vermoegensaufbau",
]);

/**
 * Die Fortschrittsleiste im Kundenprofil, abgeleitet aus `PIPELINE_STUFEN`.
 *
 * Das Kundenprofil führte dafür lange eine eigene, handgepflegte Liste. Sie
 * lief auseinander: Sie kannte die abgeschafften Stufen "zugewiesen" und
 * "kontaktversuche", und ihr fehlten "nicht_erreicht", "erreicht",
 * "erstgespraech_geplant" sowie die beiden NoShow-Stufen. Wer in einer dieser
 * Stufen stand, fiel in der Leiste auf Position null zurück und wurde als
 * frischer Lead angezeigt. Durch die Ableitung kann das nicht mehr passieren.
 */
export const FORTSCHRITT_STUFEN = PIPELINE_STUFEN.filter(
  (stufe) => !OHNE_EIGENEN_SCHRITT.has(stufe.key),
);

/**
 * Stufen ohne eigenes Kästchen, die trotzdem einen Rang in der Leiste haben.
 *
 * Ohne diese Zuordnung fiele jeder betroffene Datensatz auf Position null und
 * würde als frischer Lead angezeigt.
 *
 * Die NoShow-Stufen bleiben beim zugehörigen Gespräch stehen, denn der Termin
 * war angesetzt und der Prozess ist genau dort. "vermoegensaufbau" liegt in
 * `STUFEN_WAHRSCHEINLICHKEIT` bei 0,12 und damit zwischen "follow_up" (0,10)
 * und "erstgespraech_geplant" (0,15). Gewählt ist die niedrigere der beiden,
 * weil eine zu weit vorne angezeigte Stufe mehr Schaden anrichtet als eine zu
 * weit hinten. `normalizePipelineStufe` bildet die Stufe ebenso ab.
 */
const RANG_ALIAS: Record<string, string> = {
  eg_noshow: "erstgespraech_geplant",
  erstgespraech: "erstgespraech_geplant",
  bg_noshow: "beratungsgespraech",
  zugewiesen: "neuer_lead",
  kontaktversuche: "nicht_erreicht",
  vermoegensaufbau: "follow_up",
};

/** Der Schlüssel, dessen Kästchen die Leiste für diese Stufe hervorhebt. */
export function fortschrittsStufe(stufe?: string | null): string {
  const key = stufe || "";
  return RANG_ALIAS[key] ?? key;
}

/**
 * Position einer Stufe in der Fortschrittsleiste.
 *
 * Eine unbekannte Stufe gilt bewusst als ganz vorne. Das ist die sichere
 * Richtung: Lieber wird ein Vorgang als weniger weit angezeigt, als dass ein
 * Fortschritt vorgegaukelt wird, den es nicht gibt.
 */
export function fortschrittsRang(stufe?: string | null): number {
  const key = fortschrittsStufe(stufe);
  const i = FORTSCHRITT_STUFEN.findIndex((s) => s.key === key);
  return i < 0 ? 0 : i;
}

/** Stufen, in denen ein angesetzter Termin geplatzt ist. */
export function istNoShowStufe(stufe?: string | null): boolean {
  return stufe === "eg_noshow" || stufe === "bg_noshow";
}

/**
 * Endzustände: kein Fortschritt, sondern das Ende eines Vorgangs.
 *
 * Sie haben bewusst keinen Rang. `fortschrittsRang` liefert für sie null,
 * weil sie in `FORTSCHRITT_STUFEN` gar nicht vorkommen, und genau daraus
 * entstünde ein Fehler: Wer nur nach dem Rang fragt, hält einen verlorenen
 * Kunden für einen frischen Lead und schiebt ihn beim nächsten Anlass wieder
 * in eine aktive Stufe. Deshalb wird vor jedem Rangvergleich zuerst gefragt,
 * ob überhaupt ein laufender Vorgang vorliegt.
 */
const ENDZUSTAND_STUFEN = new Set<string>([
  "verloren",
  "archiviert",
  "bestandsimport",
]);

/** Ist der Vorgang beendet, also weder Fortschritt noch Rückschritt sinnvoll? */
export function istEndzustand(stufe?: string | null): boolean {
  return ENDZUSTAND_STUFEN.has(String(stufe || ""));
}

/**
 * Wird der ganze Kontakt verloren, wenn dieses Investment verloren geht?
 *
 * Nur wenn kein anderes Investment mehr läuft. Ein abgeschlossenes zählt
 * mit: Wer schon gekauft hat, ist Bestandskunde und kein verlorener Kontakt.
 * Ohne Investment (Kachel des Kontakts selbst) gilt es für den Kontakt.
 */
export function kontaktGanzVerloren(
  investments: ReadonlyArray<{ id: string; pipelineStufe?: string | null }>,
  verlorenesInvestmentId?: string | null,
): boolean {
  if (!verlorenesInvestmentId) return true;
  return !investments.some((inv) => inv.id !== verlorenesInvestmentId && !istEndzustand(inv.pipelineStufe));
}

/**
 * Ist der Vorgang mindestens bei dieser Stufe angekommen?
 *
 * Ersetzt die handgepflegten Aufzählungen, die im Kundenprofil und in der
 * Objektauswahl nebeneinander lagen. Jede von ihnen hatte eine andere Lücke:
 * Mal fehlte "bonitaetsunterlagen", mal "faelligkeit", und eine führte die
 * Bonität sogar noch vor der Objektauswahl, was seit dem 06.08.2026 falsch
 * ist. Wer eine Stufe einfügt oder verschiebt, soll nichts nachpflegen müssen.
 */
export function stufeErreicht(stufe: string | null | undefined, mindestens: string): boolean {
  if (istEndzustand(stufe)) return false;
  return fortschrittsRang(stufe) >= fortschrittsRang(mindestens);
}

/**
 * Darf eine Automatik den Vorgang von `aktuell` auf `ziel` heben?
 *
 * Zwei Ebenen, in dieser Reihenfolge:
 *
 * 1. Endzustand: Ein verlorener, archivierter oder importierter Vorgang wird
 *    nie angefasst. Ohne Vergleich, ohne Rangfolge.
 * 2. Rang: Gehoben wird nur nach vorn. Wer beim Notar steht, fällt nicht auf
 *    Objektauswahl zurück, nur weil jemand eine Adresse nachträgt.
 *
 * Ein Vorgang ohne Stufe hat Rang null und rückt damit vor, das ist gewollt.
 */
export function darfVorruecken(aktuell: string | null | undefined, ziel: string): boolean {
  if (istEndzustand(aktuell)) return false;
  if (istEndzustand(ziel)) return false;
  return fortschrittsRang(aktuell) < fortschrittsRang(ziel);
}

/**
 * Anzeigename fuer Auswahllisten, in denen mehrere Stufen nebeneinander
 * stehen (Filter-Dropdowns, Import-Zielstufe, Berichts-Auswahl).
 *
 * "follow_up" und "follow_up_objekt" heissen beide "Follow-Up". In der
 * Pipeline-Leiste ist das gewollt, in einer Auswahlliste waeren zwei
 * gleichnamige Eintraege nicht unterscheidbar. Nur dort bekommt die spaete
 * Stufe den Zusatz.
 */
export function stufenFilterLabel(key: string): string {
  if (key === "follow_up_objekt") return "Follow-Up (nach Objektauswahl)";
  return PIPELINE_STUFEN.find((s) => s.key === key)?.label ?? key;
}

/** Zentraler Zod-Enum für pipelineStufe – einzige Quelle der Wahrheit. */
export const PipelineStufeZodEnum = z.enum([
  "bestandsimport", "neuer_lead", "nicht_erreicht", "erreicht",
  "follow_up", "erstgespraech_geplant", "eg_noshow",
  "beratungsgespraech", "bg_noshow", "selbstauskunft", "objektauswahl",
  "follow_up_objekt", "reservierung", "bonitaetsunterlagen", "finanzierung", "notar", "faelligkeit",
  "abrechnung", "abgeschlossen", "archiviert", "verloren",
  // Legacy — bleiben im Enum für Altdaten
  "erstgespraech", "zugewiesen", "kontaktversuche", "vermoegensaufbau",
]);

/**
 * Stufen, die es nur noch in gespeicherten Daten gibt.
 *
 * Sie duerfen im Zod-Enum stehen, damit ein Altdatensatz die Pruefung besteht,
 * haben aber keine Spalte mehr. `normalizePipelineStufe` schreibt sie auf ihre
 * heutige Entsprechung um.
 */
const NUR_ALTDATEN = new Set<string>(["erstgespraech"]);
export type PipelineStufeZodType = z.infer<typeof PipelineStufeZodEnum>;

// Runtime-Guard: Zod-Optionen müssen 1:1 mit PIPELINE_STUFEN übereinstimmen
const zodSet = new Set<string>(PipelineStufeZodEnum.options);
const nurInZod = PipelineStufeZodEnum.options.filter(
  (key) => !PIPELINE_STUFEN.some((s) => s.key === key),
);
if (
  !PIPELINE_STUFEN.every((s) => zodSet.has(s.key)) ||
  !nurInZod.every((key) => NUR_ALTDATEN.has(key))
) {
  throw new Error("PipelineStufeZodEnum ist nicht synchron mit PIPELINE_STUFEN");
}
