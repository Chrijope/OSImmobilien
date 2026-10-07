/**
 * Ansichts-Logik der Investment-Bereiche im Kundenprofil.
 *
 * Abgestimmter Ablauf (18.08.2026, vereinfacht auf Wunsch der
 * Geschaeftsfuehrung):
 *
 * 1. Beratungspraesentation, "Kunde nicht finanzierungsfaehig" und die
 *    Online-Selbstauskunft sind IMMER freigeschaltet. Es gibt keine Sperre
 *    vor dem Beratungsgespraech und keinen Direkt-Abschluss-Knopf mehr.
 * 2. Die Karte "Kunde nicht finanzierungsfaehig" verschwindet, sobald das
 *    Investment die Pipelinestufe Selbstauskunft erreicht oder ueberschreitet
 *    (siehe stufeAbSelbstauskunft).
 * 3. Solange die Selbstauskunft nur VERSCHICKT ist, bleibt die Kachel mit dem
 *    Ausfuell-Fortschritt stehen, auch wenn der Kunde schon tippt oder erst
 *    einer von zwei unterschrieben hat. Die volle Ansicht oeffnet erst mit
 *    vollstaendiger Unterschrift bzw. fertigem PDF. Gemeinsam im Gespraech
 *    ausgefuellte Selbstauskuenfte (Daten ohne Versand) oeffnen wie bisher.
 */

import { fortschrittsRang, stufenFilterLabel } from "./pipelineStufen";

const SA_RANG = fortschrittsRang("selbstauskunft");

/**
 * Hat das Investment die Stufe Selbstauskunft erreicht oder ueberschritten?
 *
 * Grundlage ist der Rang in der Fortschrittsleiste (fortschrittsRang), damit
 * auch Alias-Stufen wie bg_noshow richtig einsortiert werden. Unbekannte oder
 * fehlende Stufen gelten als ganz vorne und damit als "noch nicht erreicht".
 */
export function stufeAbSelbstauskunft(pipelineStufe: string | undefined | null): boolean {
  return fortschrittsRang(pipelineStufe) >= SA_RANG;
}

export interface SaAnsichtEingabe {
  /** Fertiges Selbstauskunft-PDF liegt im Bonitaetscheck. */
  saPdfFilename?: string | null;
  /** Vollstaendig unterschrieben. */
  saSigned?: boolean;
  /** Dokumentstatus der Selbstauskunft im Bonitaetscheck. */
  saStatus?: string | null;
  /** Link wurde an den Kunden verschickt (saInvitationSentAt). */
  saInvitationSentAt?: string | null;
  /** Ausfuellstand vorhanden (investments.meta.saData). */
  saDataVorhanden?: boolean;
  /** Pipelinestufe liegt bereits bei Bonitaetsunterlagen oder dahinter. */
  fortgeschritteneStufe?: boolean;
}

/**
 * Entscheidet, ob die volle Abwicklungsansicht (Bonitaetscheck, Bankpruefung)
 * gezeigt wird. Eine nur verschickte Selbstauskunft haelt die Kachel mit dem
 * Fortschritt offen; ein Zwischenstand des Kunden oder eine Teil-Unterschrift
 * oeffnen die volle Ansicht ausdruecklich NICHT.
 */
export function saVollansicht(e: SaAnsichtEingabe): boolean {
  const abgeschlossen =
    !!e.saPdfFilename || !!e.saSigned || e.saStatus === "uploaded" || e.saStatus === "approved";
  if (abgeschlossen) return true;
  if (e.fortgeschritteneStufe) return true;
  if (e.saInvitationSentAt) return false;
  return !!e.saDataVorhanden;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Objektauswahl und Reservierung, 16.09.2026
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Ist die Objektauswahl bedienbar?
 *
 * Bis zum 16.09.2026 wurde die Karte gar nicht erst gebaut, solange keine
 * Selbstauskunft vorlag. Wer den Vorgang ansah, sah zwischen Selbstauskunft
 * und Reservierung schlicht nichts und hielt den Schritt für verschwunden.
 * Jetzt steht die Karte immer da und ist gesperrt, solange weder eine
 * unterschriebene Selbstauskunft vorliegt noch der Vermerk „Kunde finanziert
 * selbst" gesetzt ist.
 */
export function objektauswahlFreigeschaltet(e: {
  /** Unterschriebene Selbstauskunft oder fertiges PDF liegt vor. */
  saLiegtVor?: boolean;
  /** Vermerk „Kunde finanziert selbst, keine Selbstauskunft nötig". */
  saEntfaellt?: boolean;
  /**
   * Der Vorgang steht bereits auf „Objektauswahl" oder weiter.
   *
   * Ergänzt am 16.09.2026: Wer den Vermerk „Kunde finanziert selbst" wieder
   * zurücknimmt, bekam die Objektauswahl erneut gesperrt, obwohl der Vorgang
   * längst dort stand. Die Fortschrittsanzeige sagte „erreicht", die Karte
   * sagte „gesperrt", und das sah aus wie ein Fehler.
   *
   * Eine Rücknahme darf niemanden zurückwerfen. Wer die Stufe erreicht hat,
   * behält die Karte, gleich wie er dorthin kam.
   */
  stufeErreicht?: boolean;
}): boolean {
  return !!e.saLiegtVor || !!e.saEntfaellt || !!e.stufeErreicht;
}

/**
 * Ist die Reservierung bedienbar?
 *
 * Sie hing bis zum 16.09.2026 an der Selbstauskunft und konnte dadurch
 * erscheinen, während die Objektauswahl noch unsichtbar war. Christians
 * Vorgabe: Sie hängt am Objekt. Ohne eingetragenes Objekt gibt es nichts zu
 * reservieren.
 *
 * Der frühere Sonderfall für Investagon-Vorgänge ohne Objekt (Blanko-
 * Reservierung) ist seit dem 29.09.2026 abgeschaltet (Entscheidung
 * Christian). Er lief bis dahin ohnehin ins Leere, weil die Erkennung
 * `inv.meta` las und `fromDb` es nicht mitlieferte.
 *
 * Ein Sonderfall bleibt: Ein Vorgang, den jemand von Hand auf „Reservierung"
 * oder weiter gesetzt hat, ist dort aus gutem Grund. Die Schwelle liegt bewusst bei
 *   „reservierung" und nicht mehr bei „objektauswahl": Auf „objektauswahl"
 *   rückt die Automatik jeden Vorgang, sobald die Selbstauskunft
 *   unterschrieben ist. Diese Schwelle hätte die alte Bindung an die
 *   Selbstauskunft durch die Hintertür beibehalten.
 */
export function reservierungFreigeschaltet(e: {
  /** Objektdaten am Investment sind vollständig (objektDatenFehlen === false). */
  objektGesetzt?: boolean;
  /** Pipelinestufe liegt bei „reservierung" oder dahinter. */
  stufeAbReservierung?: boolean;
}): boolean {
  return !!e.objektGesetzt || !!e.stufeAbReservierung;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Finanzierung im Kundenprofil, 25.09.2026
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Ab welcher Stufe Finanzierung und Notar bedienbar sind.
 *
 * Die Liste stand bis zum 21.09.2026 wortgleich zweimal im Kundenprofil, und
 * in beiden fehlte `bonitaetsunterlagen`. Seit dem 11.09.2026 springt ein
 * Vorgang nach der unterschriebenen Reservierung aber genau dorthin. Deshalb
 * gibt es sie nur noch hier.
 *
 * Christian hat entschieden, dass die Finanzierung während der
 * Bonitätsprüfung offen ist: Der Finanzierungspartner soll das Angebot des
 * Kunden schon hochladen können. Dieselbe Liste steht in der Migration
 * `20260925120000_finanzierung_intern_frei.sql`. Wer sie hier ändert, ändert
 * sie dort mit.
 */
export const FREIGESCHALTET_AB_RESERVIERUNG: readonly string[] = [
  "reservierung",
  "bonitaetsunterlagen",
  "finanzierung",
  "notar",
  "faelligkeit",
  "abrechnung",
  "abgeschlossen",
];

export interface FinanzierungInternEingabe {
  /** Pipelinestufe des Investments (`investments.meta.pipelineStufe`). */
  pipelineStufe?: string | null;
  /** Reservierung vollständig unterschrieben (`investments.meta.rvSigned`). */
  rvSigned?: boolean;
  /** Objektdaten am Investment vollständig, siehe `objektDatenFehlen`. */
  objektGesetzt?: boolean;
  /** Investagon-Vorgang: Die Objektdaten liegen dort und nicht bei uns. */
  istInvestagon?: boolean;
  /**
   * Am Investment liegen schon Finanzierungsdaten (Angebote, Stand oder Bank).
   * Altbestand wird nie weggesperrt, sonst verschwänden vorhandene Angebote
   * aus der Ansicht.
   */
  hatFinanzierungsdaten?: boolean;
}

export interface FinanzierungInternStand {
  offen: boolean;
  /** Der Satz für die gesperrte Karte. Nennt den Grund, nicht nur den Zustand. */
  sperrgrund: string | null;
}

/**
 * Ist die Finanzierung im Kundenprofil bedienbar?
 *
 * Die eine Regel für das Kundenprofil, entschieden von Christian am
 * 25.09.2026: offen ab der Reservierung, sobald sie unterschrieben ist und ein
 * Objekt am Investment steht, ausdrücklich auch während der Stufe
 * „Bonitätsunterlagen". Die Kachel im Kundenprofil und `FinanzierungCard`
 * lesen beide diese Antwort. Vorher sperrte die Karte ein zweites Mal bis zur
 * Stufe Finanzierung und widersprach damit dem Kundenprofil.
 *
 * Bewusst anders ist das Kundenportal (`KundeInvestments.tsx`): Der Kunde
 * sieht die Finanzierung erst, wenn die Bonitätsunterlagen freigegeben sind
 * (`finanzierungIstFrei`). Intern früher, beim Kunden später.
 *
 * Selbstfinanzierer: Die Sonderregel bleibt, wie sie ist. Der Vermerk „Kunde
 * finanziert selbst" lässt die Bonitätsunterlagen entfallen, der Vorgang
 * springt nach der unterschriebenen Reservierung direkt auf Finanzierung
 * (`bonitaetsunterlagenErforderlich` im Kundenprofil). Diese Regel hier fragt
 * die Bonität gar nicht ab, der Vermerk muss sie also weder öffnen noch
 * sperren.
 *
 * Welche Rolle die Karte überhaupt sieht, entscheidet diese Funktion nicht.
 */
export function finanzierungIntern(e: FinanzierungInternEingabe): FinanzierungInternStand {
  if (e.hatFinanzierungsdaten) return { offen: true, sperrgrund: null };

  const objekt = !!e.objektGesetzt || !!e.istInvestagon;
  const stufe = String(e.pipelineStufe || "");
  const stufeOffen = FREIGESCHALTET_AB_RESERVIERUNG.includes(stufe);

  if (objekt && e.rvSigned && stufeOffen) return { offen: true, sperrgrund: null };

  if (!objekt) {
    return {
      offen: false,
      sperrgrund: "Die Finanzierung öffnet sich, sobald ein Objekt eingetragen und die Reservierung unterschrieben ist.",
    };
  }
  if (!e.rvSigned) {
    return {
      offen: false,
      sperrgrund: "Die Finanzierung öffnet sich, sobald die Reservierung unterschrieben ist.",
    };
  }
  return {
    offen: false,
    sperrgrund: `Die Finanzierung öffnet sich ab der Stufe Reservierung. Dieser Vorgang steht auf „${stufenFilterLabel(stufe) || "keiner Stufe"}“.`,
  };
}
