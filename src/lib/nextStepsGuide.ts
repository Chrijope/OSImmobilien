import type { PipelineStufe } from "@/lib/kontaktPipeline";
import { normalizePipelineStufe } from "@/lib/kontaktPipeline";
import { MAX_KONTAKTVERSUCHE } from "@/lib/kontaktversuchSchedule";

export interface NextStepAction {
  text: string;
  /** true = nur Admin/Inhaber/Vertriebsleiter sehen diesen Schritt */
  adminOnly?: boolean;
}

export interface NextStepsGuide {
  titel: string;
  aktionen: NextStepAction[];
  hinweis?: string;
}

/**
 * Der Leitfaden je Pipelinestufe.
 *
 * Die Reihenfolge der Einträge folgt `FORTSCHRITT_STUFEN` aus
 * `pipelineStufen.ts`. Das ist kein Selbstzweck: Der Leitfaden beschrieb bis
 * zuletzt die alte Reihenfolge, in der die Bonität vor der Objektauswahl lag,
 * und schickte Vertriebspartner damit in die falsche Richtung. Wer hier etwas
 * ergänzt, sortiert es an die Stelle, an der die Stufe auch in der Pipeline
 * steht.
 *
 * Ein `hinweis` beschreibt ausschließlich, was das System von selbst tut. Steht
 * dort etwas, das im Code nicht nachweisbar ist, ist der Hinweis schlimmer als
 * gar keiner.
 *
 * "zugewiesen", "kontaktversuche" und "vermoegensaufbau" sind eigene Stufen
 * des Ablaufs und haben deshalb eigene Einträge. Nur echte Altwerte wie
 * "closing" löst `getNextSteps` über `normalizePipelineStufe` auf ihre heutige
 * Entsprechung auf.
 */
const GUIDE: Partial<Record<PipelineStufe, NextStepsGuide>> = {
  zugewiesen: {
    titel: "Zugewiesenen Lead annehmen",
    aktionen: [
      { text: "Der Lead ist dir zugewiesen, aber noch nicht angefasst. Innerhalb von fünf Minuten anrufen." },
      { text: "Nach dem ersten Kontakt die Stufe weiterziehen, damit sichtbar wird, wo er steht." },
    ],
  },
  kontaktversuche: {
    titel: "Kontaktversuche laufen",
    aktionen: [
      { text: "Zu unterschiedlichen Tageszeiten anrufen, nicht immer zur selben Stunde." },
      { text: "Nach dem dritten erfolglosen Versuch zusätzlich eine Nachricht hinterlassen." },
      { text: "Wer sich meldet, gehört sofort in Erreicht oder direkt in einen Termin." },
    ],
  },
  vermoegensaufbau: {
    titel: "Vermögensaufbau prüfen",
    aktionen: [
      { text: "Der Kontakt ist für den Vermögensaufbau vorgemerkt und liegt beim Versicherungsexperten." },
      { text: "Bedarf klären und entscheiden, ob eine Immobilie oder ein anderer Weg passt." },
    ],
    hinweis: "Der Versicherungsexperte sieht in der Pipeline ausschließlich diese Stufe.",
  },
  neuer_lead: {
    titel: "Lead qualifizieren & Beratungsgespräch vereinbaren",
    aktionen: [
      { text: "Lead wurde dir direkt zugewiesen, Kontakt schnellstmöglich aufnehmen (Speed-to-Lead < 5 Min.)" },
      { text: "Lead mittels Erstgesprächsskript qualifizieren und Beratungsgespräch vereinbaren" },
    ],
    hinweis: 'Sobald ein Beratungsgespräch gebucht ist, rückt der Kontakt automatisch in „Beratungsgespräch".',
  },
  nicht_erreicht: {
    titel: "Weiter dranbleiben, bis du den Lead erreichst",
    aktionen: [
      { text: 'Jeden Anrufversuch über den Gesprächsausgang „Nicht erreicht" dokumentieren' },
      { text: "Wartezeit abwarten: Der Lead ist so lange ausgeblendet und taucht danach von selbst wieder auf" },
      { text: "Sobald du ihn erreichst: Erstgesprächsskript durchgehen und Termin vereinbaren" },
    ],
    // Alle drei Aussagen stehen im Code: die Mails in nichtErreichtMails.ts
    // (1., 4. und 10. Versuch, Absender ist der zuständige Partner), die
    // Wiedervorlage in useKontaktversuchInboxReminder, die Grenze in
    // kontaktversuchSchedule.
    hinweis:
      `Nach dem 1., 4. und 10. Versuch geht automatisch eine kurze E-Mail des zuständigen Partners an den Lead, mit Terminlink und der Möglichkeit, einfach zu antworten. ` +
      `Nach Ablauf der Wartezeit legt das System eine Wiedervorlage in deine Inbox. ` +
      `Nach ${MAX_KONTAKTVERSUCHE} erfolglosen Versuchen wird der Lead automatisch auf „Verloren" gesetzt.`,
  },
  erreicht: {
    titel: "Termin vereinbaren",
    aktionen: [
      { text: "Erstgesprächsskript zu Ende führen und den Bedarf qualifizieren" },
      { text: "Vertriebspartner, Datum und Uhrzeit eintragen und den Termin buchen" },
      { text: "Wenn der Lead jetzt nicht kann: Follow-Up mit Wiedervorlage setzen, statt ihn offen zu lassen" },
    ],
    hinweis:
      "Mit dem Buchen über das Erstgesprächsskript wird der Lead zugleich dem gewählten Vertriebspartner " +
      "zugewiesen und dieser bekommt eine Benachrichtigung.",
  },
  follow_up: {
    titel: "Follow-Up durchführen",
    aktionen: [
      { text: "Wiedervorlage prüfen und Kunde erneut kontaktieren" },
      { text: "Neuen Termin vereinbaren" },
    ],
  },
  erstgespraech_geplant: {
    titel: "Erstgespräch führen & Lead an den Berater übergeben",
    aktionen: [
      { text: "Termin gegenüber dem Lead bestätigen und kurz vorher an ihn erinnern" },
      { text: "Erstgesprächsskript und Unterlagen für den Termin vorbereiten" },
      { text: "Im Gespräch das Skript durchgehen und den Bedarf qualifizieren" },
      { text: "Nach dem Termin das Ergebnis eintragen: erschienen, verschoben oder No-Show" },
      { text: "Beratungsgespräch vereinbaren" },
    ],
    hinweis: 'Die Knöpfe für das Termin-Ergebnis erscheinen erst, wenn der Termin-Zeitpunkt erreicht ist. Sobald das Erstgesprächsskript gespeichert und das Beratungsgespräch eingebucht wurde, springt die Pipeline-Stufe automatisch auf „Beratungsgespräch".',
  },
  eg_noshow: {
    titel: "Neuen Erstgesprächstermin vereinbaren",
    aktionen: [
      { text: "Lead anrufen und den geplatzten Termin offen ansprechen" },
      { text: "Neuen Erstgesprächstermin mit Datum und Uhrzeit eintragen" },
      { text: 'Reagiert der Lead nicht mehr: Gesprächsausgang „Nicht erreicht" nutzen, damit die Versuche gezählt werden' },
    ],
    hinweis: "Der No-Show-Hinweis im Kundenprofil verschwindet automatisch, sobald ein neuer Erstgesprächstermin gebucht ist.",
  },
  beratungsgespraech: {
    titel: "Beratungsgespräch vorbereiten & durchführen",
    aktionen: [
      { text: "Beratungspräsentation öffnen und auf den Kunden vorbereiten" },
      { text: "Beratungsgespräch führen, Bedarf & Bonität gemeinsam qualifizieren" },
      { text: "Selbstauskunft direkt im Gespräch gemeinsam mit dem Kunden ausfüllen" },
    ],
    // Geprüft in kontaktPipeline.calculateLogicalPipelineStufe: Sobald die
    // Selbstauskunft beim Kunden liegt und die Unterschrift aussteht, ist die
    // Stufe "Selbstauskunft". Die Unterschrift selbst führt auf
    // "Objektauswahl", nicht auf "Bonitätsunterlagen".
    hinweis: 'Sobald die Selbstauskunft beim Kunden ist, rückt der Deal auf „Selbstauskunft".',
  },
  bg_noshow: {
    titel: "Neuen Beratungstermin vereinbaren",
    aktionen: [
      { text: "Kunde anrufen und einen neuen Beratungstermin abstimmen" },
      { text: "Neuen Termin unter Stammdaten mit Datum und Uhrzeit eintragen" },
      { text: "Verbindlichkeit ansprechen, damit der Termin diesmal steht" },
    ],
    hinweis:
      "Der Lead bleibt bei dir. Das System legt sofort eine Aufgabe in deine Inbox und erinnert nach 24 und " +
      "nach 48 Stunden erneut, solange kein neuer Beratungstermin eingetragen ist.",
  },
  selbstauskunft: {
    titel: "Selbstauskunft unterschreiben lassen",
    aktionen: [
      { text: "Selbstauskunft an den Kunden senden oder gemeinsam im Gespräch ausfüllen" },
      { text: "Nachfassen, solange die Unterschrift aussteht" },
      { text: "Parallel schon freie Wohnungen sichten, damit du direkt nach der Unterschrift Objekte zeigen kannst" },
    ],
    // Zwei Wege laufen parallel. An dich: 48 h / 96 h aus
    // bellNotifications.scheduleSaFollowUpReminders. An den Kunden: Tag 3 / 7 /
    // 11, geplant in der Edge Function send-sa-invitation, dazu die Aufgabe an
    // Tag 14. Beides bricht ab, sobald die Selbstauskunft ausgefüllt oder
    // unterschrieben ist oder der Kunde als verloren gilt. Der Sprung auf
    // "Objektauswahl" steht in kontaktPipeline.calculateLogicalPipelineStufe.
    hinweis:
      "Der Kunde wird nach 3, 7 und 11 Tagen automatisch per E-Mail erinnert, jeweils mit dir als " +
      "Ansprechpartner. Füllt er sie bis Tag 14 nicht aus, landet eine Aufgabe in deiner Inbox. " +
      'Sobald der Kunde unterschreibt, springt der Deal automatisch auf „Objektauswahl".',
  },
  objektauswahl: {
    titel: "Passende Wohnung vorschlagen",
    aktionen: [
      { text: "Freie Wohnungen im System und in Investagon prüfen und passende Einheiten vorschlagen" },
      { text: "Kunde Objekte / Einheiten vorstellen" },
      { text: "Reservierung vorbereiten, sobald Kunde sich entschieden hat" },
    ],
  },
  follow_up_objekt: {
    titel: "Follow-Up nach der Objektvorstellung",
    aktionen: [
      { text: "Kunde überlegt noch. Dranbleiben und Follow-Up-Termin vereinbaren" },
      { text: "Offene Fragen zum Objekt klären und fehlende Unterlagen nachreichen" },
    ],
    // Nur manuell erreichbar (siehe pipelineStufen.ts). Der Sprung nach vorne
    // steht im Auto-Advance in KundenDetail: RV eröffnet → "reservierung".
    hinweis:
      "Diese Stufe wird nur von Hand gesetzt, keine Automatik führt hierher. " +
      'Sobald eine Reservierungsvereinbarung erstellt ist, rückt der Deal automatisch auf „Reservierung".',
  },
  reservierung: {
    titel: "Reservierung abschließen",
    aktionen: [
      { text: "Warte auf Kundenunterschrift (digitale Signatur)" },
      { text: "Empfehlungsprogramm aktiv ansprechen" },
    ],
    hinweis: 'Mit der digitalen Gegenzeichnung durch den Kunden ist die Reservierung abgeschlossen und der Deal rückt automatisch auf „Bonitätsunterlagen". Eine zusätzliche Admin-Bestätigung ist nicht nötig.',
  },
  bonitaetsunterlagen: {
    titel: "Bonität vervollständigen",
    aktionen: [
      { text: "Kundenportal für den Kunden freischalten (optional: alle Unterlagen freischalten)" },
      { text: "Bonitätscheck / Bankprüfungs-Unterlagen" },
      { text: 'Unterlagen prüfen und über den „Finale Prüfung"-Button freigeben, sobald Kunde oder du sie hochgeladen hast' },
    ],
    // Geprüft in kontaktPipeline: sindBonitaetsunterlagenFreigegeben führt auf
    // "finanzierung". Hochgeladen allein reicht nicht, jedes Pflichtdokument
    // muss auf "approved" stehen.
    hinweis: 'Die Freigabe erfolgt durch den Vertriebspartner direkt im Kundenordner. Sobald jedes Pflichtdokument freigegeben ist, springt der Deal automatisch in „Finanzierung".',
  },
  finanzierung: {
    titel: "Finanzierung aufgleisen",
    aktionen: [
      { text: "Finanzierungspartner prüft mit Banken Finanzierbarkeit und bewirkt Angebote" },
      { text: "Mit Finanzierungspartner Kunde Angebote vorstellen" },
      { text: 'Finanzierungspartner lädt finales Darlehensangebot und Vertrag in Finanzierungs-Tab hoch. Stufe rückt dann automatisch auf „Notar".' },
    ],
    hinweis: "Der Finanzierungspartner lädt das Angebot hoch, der VP koordiniert. Ein separater Admin-Freigabeschritt ist nicht nötig.",
  },
  notar: {
    titel: "Notartermin organisieren",
    aktionen: [
      { text: "Notaraufnahme Bogen ausfüllen" },
      { text: "Notartermin in Absprache mit Backoffice/Christian Kurz abstimmen" },
      { text: "Notartermin durchführen und Notarfoto im Anschluss nicht vergessen und im Notar-Tab hochladen" },
    ],
  },
  faelligkeit: {
    titel: "Kaufpreis-Fälligkeit überwachen",
    aktionen: [
      { text: "Fälligstellungsschreiben des Notars im Investment-Tab hinterlegen", adminOnly: true },
      { text: "Zahlungseingang des Kaufpreises überwachen", adminOnly: true },
      { text: "Bei Verzug Mahnung über das Rechnungs-Modul erzeugen", adminOnly: true },
    ],
    hinweis: 'Sobald der Kaufpreis fließt, rückt der Deal automatisch in „Abrechnung", eine manuelle Bestätigung ist nicht nötig.',
  },
  abrechnung: {
    titel: "Provision abrechnen & Übergang in Bestand",
    aktionen: [
      { text: "Provisionsabrechnung im Abrechnungs-Modul erstellen und an den Partner versenden", adminOnly: true },
      { text: "Zahlung der Provision überwachen", adminOnly: true },
      { text: "Kunde geht nach Abschluss automatisch in den Bestand über und kann für After-Sales / Empfehlungen angesprochen werden", adminOnly: true },
    ],
    hinweis: "Die Provisionsabrechnung läuft ausschließlich über das Backoffice/Admin. Der VP hat hier keine Aktion mehr.",
  },
  abgeschlossen: {
    titel: "Deal erfolgreich abgeschlossen",
    aktionen: [
      { text: "Kunde in After-Sales-Betreuung weiterführen", adminOnly: true },
    ],
  },
};

/**
 * Leitfaden zu einer Stufe, oder null, wenn es dafür keinen gibt.
 *
 * Der Schlüssel wird vor dem Nachschlagen normalisiert. Sonst müsste der
 * Leitfaden Einträge für abgeschaffte Stufen mitschleppen, und die liefen
 * genauso auseinander wie zuletzt: Altdaten tragen noch "zugewiesen",
 * "kontaktversuche" oder "closing", und der Setter schreibt "kontaktversuche"
 * bis heute aktiv in den Datensatz.
 */
export function getNextSteps(stufe: string, isAdmin: boolean): NextStepsGuide | null {
  const key = normalizePipelineStufe(stufe) ?? (stufe as PipelineStufe);
  const guide = GUIDE[key];
  if (!guide) return null;
  return {
    titel: guide.titel,
    aktionen: guide.aktionen.filter((a) => isAdmin || !a.adminOnly),
    hinweis: guide.hinweis,
  };
}
