/**
 * Farbe einer Pipeline-Kachel.
 *
 * Die Regel in drei Sätzen:
 *
 *   1. Steht ein Termin in der Zukunft, ist der nächste Schritt geplant. Die
 *      Kachel bleibt farblos.
 *   2. Läuft gerade eine Wartephase aus einem "Nicht erreicht", ist der Lead
 *      bewusst geparkt. Die Kachel bleibt ebenfalls farblos.
 *   3. Ist ein vereinbarter Termin fällig und vorbei, ist die Kachel rot. In
 *      jeder Stufe, ohne Staffelung.
 *   4. Sonst entscheidet, wie lange am Kontakt nichts passiert ist, gemessen
 *      an den Schwellen der jeweiligen Stufe.
 *
 * Zu Regel 2 und 3: Eine Wartephase ist kein Termin.
 *
 * Gemeldet von Julian Meyer: Er ruft einen Lead an, protokolliert "nicht
 * erreicht", und wenige Stunden später steht auf der Kachel "Termin 4h
 * überfällig" und sie ist rot. Es gab nie einen Termin. Was da ablief, war das
 * `verstecktBis` aus dem Kontaktversuch, also die Sperrfrist, nach der der Lead
 * wieder auftauchen soll.
 *
 * Diese Sperrfrist wurde bisher unterschiedlich behandelt, je nachdem, welche
 * Regel gerade fragte: für Regel 1 zählte sie ausdrücklich nicht als Termin,
 * für die Rot-Regel dagegen schon. Solange sie lief, passierte deshalb nichts,
 * und in der Sekunde, in der sie ablief, wurde die Kachel rot. Sie zählt jetzt
 * nirgends als Termin. Ein Lead, den man nicht erreicht hat, faellt damit in
 * die Inaktivitätsregel, und die ist für genau diesen Fall gedacht: in der
 * Stufe "Nicht erreicht" orange nach einem Tag, rot nach dreien.
 *
 * Die Regel lag lange mitten in der Pipeline-Seite und war dadurch weder
 * prüfbar noch nachvollziehbar. Zweimal ist genau hier ein Fehler unbemerkt
 * geblieben: einmal fehlten ganze Stufen in der Schwellentabelle, einmal
 * wurde ein längst verstrichener Termin gar nicht betrachtet.
 */

import { INACTIVITY_THRESHOLDS } from "./inactivityThresholds";
import type { PipelineStufe } from "./kontaktPipeline";

export type AmpelFarbe = "orange" | "red" | null;

export interface AmpelEingabe {
  stufe: PipelineStufe;
  /** Tage seit der letzten Änderung am Kontakt. */
  tageSeitAenderung: number;
  /**
   * Zeitpunkt des nächsten geplanten Kontakts, falls es einen gibt.
   * Liegt er in der Zukunft, ist der Lead eingeplant und die Kachel bleibt
   * farblos. Liegt er in der Vergangenheit, zählt er als versäumt.
   */
  naechsterKontakt?: {
    zeitpunkt: string;
    ueberfaellig: boolean;
    /**
     * Woher der Zeitpunkt stammt. "wartephase" ist die Sperrfrist nach einem
     * Kontaktversuch und gilt ausdrücklich nicht als Termin.
     */
    quelle?: string;
    /**
     * Wie der Termin heisst, etwa "Erstgespräch" oder der Titel der Aufgabe.
     *
     * Steht nur "Termin 6d überfällig" auf der Kachel, sucht man den Termin
     * anschliessend im ganzen Profil. Julian Meyer wusste bei David Botzem
     * nicht, worauf sich die Meldung bezog. Mit dem Namen ist es in einem
     * Blick klar.
     */
    bezeichnung?: string;
  } | null;
  /** Ein fest vereinbarter Termin in der Zukunft, keine bloße Wartephase. */
  hatZukuenftigenTermin: boolean;
  jetzt?: number;
}

export interface AmpelErgebnis {
  farbe: AmpelFarbe;
  /** Kurzer Text für die Kachel. */
  text: string | null;
  /** Woraus die Farbe entstanden ist. */
  grund: "termin_versaeumt" | "inaktiv" | "eingeplant" | "wartephase" | "keine_regel";
}

const TAG = 1000 * 60 * 60 * 24;
const STUNDE = 1000 * 60 * 60;

export function bewertePipelineKachel(e: AmpelEingabe): AmpelErgebnis {
  const jetzt = e.jetzt ?? Date.now();

  // 1. Steht ein Termin in der Zukunft, ist der nächste Schritt geplant.
  //    Dann bleibt die Kachel farblos, in jeder Stufe.
  //
  //    Die Beschriftung nennt die Quelle. Vorher stand hier immer "Termin
  //    geplant", auch wenn der nächste Schritt nur eine Aufgabe war. Wer dann
  //    im Profil nach dem Termin suchte, fand keinen, denn es gab nie einen.
  if (e.hatZukuenftigenTermin) {
    const quelle = e.naechsterKontakt && !e.naechsterKontakt.ueberfaellig
      ? e.naechsterKontakt.quelle
      : undefined;
    // Gebuchte Videocalls heissen beim Namen: "Beratungsgespräch gebucht"
    // statt "Videomeeting geplant". Erkannt an der Terminbezeichnung, die
    // bei einer Buchung die Terminart traegt. Freitext-Meetings mit langen
    // Beschreibungen fallen durch und behalten den allgemeinen Text.
    const gebuchterName = (() => {
      if (quelle !== "videotermin" && quelle !== "termin") return null;
      const name = e.naechsterKontakt?.bezeichnung?.trim() || "";
      const bekannt = ["Beratungsgespräch", "Objektvorstellung", "Finanzierungsgespräch", "Erstgespräch"];
      const treffer = bekannt.find((b) => name.toLowerCase().startsWith(b.toLowerCase()));
      return treffer ? `${treffer} gebucht` : null;
    })();
    const text =
      quelle === "aufgabe" ? "Aufgabe geplant"
      : quelle === "follow_up" ? "Follow-Up geplant"
      // Ein Termin mit Videoraum oder Videolink heisst beim Namen, was er ist.
      // Vorher stand auch beim Videogespräch nur "Termin geplant", und wer das
      // las, rechnete mit einem Termin vor Ort.
      : gebuchterName ? gebuchterName
      : quelle === "videotermin" ? "Videomeeting geplant"
      : "Termin geplant";
    return { farbe: null, text, grund: "eingeplant" };
  }

  // 2. Läuft die Sperrfrist aus einem Kontaktversuch noch, ist der Lead
  //    bewusst geparkt. Er soll erst wieder auftauchen, wenn sie abgelaufen
  //    ist, und bis dahin weder rot noch orange werden.
  const istWartephase = e.naechsterKontakt?.quelle === "wartephase";
  if (istWartephase && e.naechsterKontakt && !e.naechsterKontakt.ueberfaellig) {
    const verbleibend = new Date(e.naechsterKontakt.zeitpunkt).getTime() - jetzt;
    const stunden = Math.ceil(verbleibend / STUNDE);
    const tage = Math.floor(verbleibend / TAG);
    return {
      farbe: null,
      text: tage >= 1 ? `Wiedervorlage in ${tage}d` : `Wiedervorlage in ${Math.max(stunden, 1)}h`,
      grund: "wartephase",
    };
  }

  // 3. Ist ein vereinbarter Termin fällig und vorbei, ist die Kachel rot. Ohne
  //    Staffelung und ohne Rücksicht auf die Stufe: Ein versäumter Termin ist
  //    ein versäumter Termin, egal ob er im Erstgespräch oder in der
  //    Reservierung stand. Vorher musste ein überfälliger Termin erst die
  //    Tagesschwelle seiner Stufe überschreiten, im Beratungsgespräch also
  //    sieben Tage, bevor überhaupt etwas zu sehen war.
  //
  //    Eine abgelaufene Sperrfrist ist kein versäumter Termin. Sie faellt
  //    durch auf Regel 4.
  if (e.naechsterKontakt?.ueberfaellig && !istWartephase) {
    const vergangen = jetzt - new Date(e.naechsterKontakt.zeitpunkt).getTime();
    const stunden = Math.floor(vergangen / STUNDE);
    const tage = Math.floor(vergangen / TAG);
    const was = e.naechsterKontakt.bezeichnung?.trim() || "Termin";
    return {
      farbe: "red",
      text: tage >= 1 ? `${was} ${tage}d überfällig` : `${was} ${Math.max(stunden, 1)}h überfällig`,
      grund: "termin_versaeumt",
    };
  }

  // 4. Kein Termin vorhanden: Es zählt, wie lange nichts passiert ist.
  const schwellen = INACTIVITY_THRESHOLDS[e.stufe];
  if (!schwellen) {
    return { farbe: null, text: null, grund: "keine_regel" };
  }

  const tage = e.tageSeitAenderung;
  const farbe: AmpelFarbe = tage >= schwellen[1] ? "red" : tage >= schwellen[0] ? "orange" : null;

  return {
    farbe,
    text: farbe ? `${tage}d inaktiv` : null,
    grund: farbe ? "inaktiv" : "inaktiv",
  };
}
