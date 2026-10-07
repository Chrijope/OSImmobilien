import { MAX_KONTAKTVERSUCHE } from "@/lib/kontaktversuchSchedule";

/**
 * Was eine Pipelinestufe bedeutet und wodurch sie erreicht wird.
 *
 * Dieselbe Tabelle stand zweimal im Code: als `STUFEN_ERKLAERUNG` in der
 * Pipeline und als `STUFEN_HINWEISE` im Kundenprofil. Beide beschrieben die
 * alte Reihenfolge, in der die Bonität vor der Objektauswahl lag, und beide
 * nannten eine Kontaktversuch-Grenze, die es nie gab. Zwei Kopien laufen immer
 * auseinander, deshalb gibt es jetzt nur noch diese.
 *
 * Abgegrenzt vom Leitfaden in `nextStepsGuide.ts`: Der beantwortet „Was ist
 * jetzt zu tun" für die aktuelle Stufe. Hier steht „Wann ist ein Vorgang in
 * dieser Stufe", und zwar für jede Stufe der Leiste, auch für längst
 * vergangene und noch kommende. Die beiden lassen sich deshalb nicht
 * auseinander speisen.
 *
 * Regel für jeden Eintrag: Es steht nur drin, was in `kontaktPipeline.ts`
 * (`calculateLogicalPipelineStufe`, `getEffectivePipelineStufe`) oder an der
 * jeweils genannten Stelle nachweisbar ist. Ein falscher Hinweis ist schlimmer
 * als gar keiner, genau daran krankte die alte Fassung.
 */
export const STUFEN_ERKLAERUNG: Record<string, string> = {
  neuer_lead:
    "Neu erfasster Lead, noch kein Kontaktversuch dokumentiert. " +
    "Sobald ein erfolgloser Versuch eingetragen ist, rückt der Lead auf „Nicht erreicht\".",
  // Die Grenze kommt aus der Konstante, nicht als getippte Zahl. In der
  // Pipeline stand „4", im Kundenprofil „5", tatsächlich sind es 15.
  nicht_erreicht:
    "Mindestens ein Kontaktversuch blieb erfolglos. Zwischen den Versuchen ist der Lead für eine " +
    `gestaffelte Wartezeit ausgeblendet. Nach ${MAX_KONTAKTVERSUCHE} erfolglosen Versuchen wird er ` +
    "automatisch auf „Verloren\" gesetzt.",
  erreicht: "Der Lead wurde erreicht, ein Termin steht aber noch nicht.",
  follow_up:
    "Der Lead liegt auf Wiedervorlage. Bis zum vereinbarten Zeitpunkt ist er ausgeblendet, danach " +
    "meldet er sich über die Inbox zurück.",
  erstgespraech_geplant: "Ein Erstgesprächstermin ist eingetragen, das Gespräch hat noch nicht stattgefunden.",
  // Geprüft in SetterSkript.handleErstgespraechUndZuweisen: Die Buchung setzt
  // Stufe, Vertriebspartner und Zuständigkeit in einem Vorgang.
  erstgespraech:
    "Der Erstgesprächstermin ist gebucht. Mit der Buchung über das Setter-Skript geht der Lead " +
    "zugleich an den gewählten Vertriebspartner über.",
  // Siehe KundenDetail: Der NoShow-Knopf im Beratungsgespräch setzt immer
  // „BG NoShow". EG NoShow wird ausschließlich von Hand gesetzt.
  eg_noshow: "Der Lead ist zum Erstgespräch nicht erschienen. Diese Stufe wird von Hand gesetzt, ein neuer Termin ist nötig.",
  // Geprüft in calculateLogicalPipelineStufe: Die verschickte Selbstauskunft
  // führt auf „Selbstauskunft", die Unterschrift danach auf „Objektauswahl".
  // Hier stand bis zuletzt „Bonitätsunterlagen", eine Stufe aus der alten
  // Reihenfolge, die heute drei Schritte weiter hinten liegt.
  beratungsgespraech:
    "Der Lead ist beim Vertriebspartner, das Beratungsgespräch läuft. Sobald die Selbstauskunft beim " +
    "Kunden zur Unterschrift liegt, rückt der Vorgang auf „Selbstauskunft\".",
  bg_noshow: "Der Kunde ist zum Beratungstermin nicht erschienen. Der Lead bleibt beim Vertriebspartner, ein neuer Termin ist nötig.",
  selbstauskunft:
    "Die Selbstauskunft liegt beim Kunden, die Unterschrift steht aus. " +
    "Mit der Unterschrift rückt der Vorgang auf „Objektauswahl\".",
  // Der alte Text beschrieb hier die Reservierung („RV-PDF erzeugt").
  objektauswahl:
    "Die Selbstauskunft ist unterschrieben, jetzt werden passende Einheiten vorgestellt. " +
    "Sobald eine Reservierungsvereinbarung erstellt ist, rückt der Vorgang auf „Reservierung\".",
  // Nur manuell, siehe pipelineStufen.ts: Keine Automatik setzt diese Stufe.
  follow_up_objekt:
    "Der Kunde hat Objekte gesehen und überlegt noch. Diese Stufe wird ausschließlich von Hand " +
    "gesetzt, keine Automatik führt hierher. Sobald eine Reservierungsvereinbarung erstellt ist, " +
    "rückt der Vorgang auf „Reservierung\".",
  reservierung:
    "Eine Reservierungsvereinbarung ist erstellt, die Unterschrift des Kunden steht aus. " +
    "Mit der Unterschrift rückt der Vorgang auf „Bonitätsunterlagen\".",
  // Geprüft in sindBonitaetsunterlagenFreigegeben: Jedes Pflichtdokument muss
  // auf „approved" stehen, hochgeladen allein reicht nicht.
  bonitaetsunterlagen:
    "Die Reservierung ist unterschrieben, jetzt werden die Bonitätsunterlagen eingesammelt. " +
    "Erst wenn jedes Pflichtdokument freigegeben ist, rückt der Vorgang auf „Finanzierung\". " +
    "Hochgeladen allein genügt nicht.",
  finanzierung: "Alle Pflicht-Bonitätsunterlagen sind freigegeben. Der Finanzierungspartner erstellt jetzt das Darlehensangebot.",
  notar: "Ein Notartermin ist im Investment hinterlegt oder vom Kunden im Portal bestätigt.",
  faelligkeit: "Der Notartermin liegt in der Vergangenheit, Kaufpreisfälligkeit und Übergabe laufen.",
  // Geprüft in KundenDetail, Karte „Abwicklung": Erst die gestellte
  // Provisionsrechnung setzt diese Stufe, der Kaufpreiseingang allein nicht.
  abrechnung: "Die Provisionsrechnung ist gestellt. Die Abrechnung mit dem Partner läuft im Backoffice.",
  abgeschlossen: "Die Auszahlung ist bestätigt, der Deal ist abgeschlossen. Der Kunde geht in den Bestand über.",
  // Virtuelle Spalte der Pipeline, keine eigene Stufe. Geprüft in
  // getProzessBereichForStufe: In diesen Bereich fällt allein „Abgeschlossen".
  bestandskunden: "Sammelspalte für abgeschlossene Vorgänge. Ein Kunde erscheint hier, sobald ein Investment auf „Abgeschlossen\" steht.",
  // Geprüft in investmentsStore.createInvestment.
  bestandsimport:
    "Importierte Bestandskunden. Sie bleiben getrennt, bis das erste Investment angelegt wird, " +
    "dann rücken sie auf „Beratungsgespräch\".",
  archiviert: "Manuell archivierter Kontakt. Bleibt im System, ist aber aus der aktiven Pipeline ausgeblendet.",
  verloren:
    `Status „verloren" oder „inaktiv", etwa nach ${MAX_KONTAKTVERSUCHE} erfolglosen Kontaktversuchen, ` +
    "bei falschen Kontaktdaten oder auf Wunsch des Leads.",
  // Abgeschaffte Stufen. Sie stehen nur noch in Altdaten und werden von
  // normalizePipelineStufe auf ihre heutige Entsprechung abgebildet.
  zugewiesen: "Abgeschaffte Stufe aus Altdaten. Sie wird überall wie „Neuer Lead\" behandelt.",
  kontaktversuche: "Abgeschaffte Stufe aus Altdaten. Sie wird überall wie „Nicht erreicht\" behandelt.",
  vermoegensaufbau: "Abgeschaffte Stufe aus Altdaten. Sie wird überall wie „Follow-Up\" behandelt.",
};

/** Erklärung zu einer Stufe, oder undefined, wenn es dafür keine gibt. */
export function stufenErklaerung(stufe: string | null | undefined): string | undefined {
  if (!stufe) return undefined;
  return STUFEN_ERKLAERUNG[stufe];
}
