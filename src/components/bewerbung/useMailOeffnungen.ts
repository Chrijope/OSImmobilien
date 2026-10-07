import { useEffect, useMemo, useState } from "react";
import { useVersandRunde } from "@/lib/bewerberVersandRunde";
import {
  ladeMailOeffnungen,
  oeffnungAus,
  type MailOeffnung,
} from "@/lib/bewerberMailTracking";
import { gemeinsamerLauf, gemerkterStand, letzterStand, merkeStand } from "./nachladeSpeicher";

/**
 * Was das Öffnungstracking über die angezeigten Bewerber weiß.
 *
 * Aufgebaut wie `useKennenlernVersand`, aus demselben Grund: Die Tabelle
 * `bewerber_mail_tracking` liegt nicht im `dataCache`, die Liste lädt sie also
 * nicht mit. Die Abfrage selbst steht im Store-Modul `bewerberMailTracking.ts`,
 * hier steht nur das Nachladen.
 *
 * Nach einem Versand wird neu gefragt (`useVersandRunde`), sonst zeigte die
 * Liste den Stand von davor. Eine laufende Verbindung wie im ClosingTab gibt es
 * bewusst nicht: Sie lohnt für eine geöffnete Akte, aber nicht für eine Liste
 * mit hundertfünfzig Zeilen. Wer wissen will, ob gerade eben geöffnet wurde,
 * lädt die Seite neu.
 */

/** Was der Hook zurueckgibt: die Daten und die Auskunft, ob sie schon da sind. */
export type MailOeffnungsStand = {
  /** Die gemessene Oeffnung je Bewerber. Wer fehlt, hat keine gemessene. */
  oeffnungen: Record<string, MailOeffnung>;
  /**
   * Ob ueberhaupt schon eine Antwort vorliegt, notfalls eine aeltere.
   *
   * Die Liste wartet darauf, bevor sie zum ersten Mal erscheint: Der Umschlag
   * in der Zeile haengt daran, und er soll nicht eine Sekunde spaeter
   * nachtraeglich erscheinen. Eine aeltere Antwort genuegt, sie kennt alle
   * bisherigen Bewerber. Siehe `BewerberArbeitsplatz`.
   */
  bereit: boolean;
};

/** Der innere Stand samt Schluessel, fuer den er gilt. */
type Stand = { schluessel: string; oeffnungen: Record<string, MailOeffnung> };

/** Der Bereich im Gedaechtnis ueber den Seitenwechsel hinweg. */
const SPEICHER = "mailOeffnungen";

const LEER: Stand = { schluessel: "", oeffnungen: {} };

/**
 * Die gemessenen Oeffnungen dieser Mailarten fuer diese Bewerber holen.
 *
 * Steht ausserhalb des Hooks, damit das Vorladen nach dem Login dieselbe Frage
 * stellen kann (`bewerberlisteVorladen.ts`). Die Antwort wird gemerkt, eine
 * gleichzeitige zweite Frage tritt der laufenden bei. Wirft nie.
 */
export function ladeMailOeffnungsStand(bewerberIds: string[], kinds: readonly string[]): Promise<Stand> {
  const idSchluessel = [...bewerberIds].sort().join(",");
  const artSchluessel = [...kinds].join(",");
  const speicherSchluessel = `${artSchluessel}|${idSchluessel}`;
  const ids = idSchluessel ? idSchluessel.split(",") : [];
  // Nichts zu holen ist auch eine Antwort, also gilt sie fuer diese Frage.
  if (ids.length === 0) return Promise.resolve({ schluessel: speicherSchluessel, oeffnungen: {} });

  return gemeinsamerLauf(SPEICHER, speicherSchluessel, async () => {
    const ergebnis: Record<string, MailOeffnung> = {};
    try {
      const zeilen = await ladeMailOeffnungen(ids, [...kinds]);
      for (const [id, liste] of Object.entries(zeilen)) {
        const offen = oeffnungAus(liste);
        if (offen) ergebnis[id] = offen;
      }
    } catch (fehler) {
      /*
       * Auch der Fehlschlag ist eine Antwort. Ohne diesen Zweig wartete die
       * Liste ewig auf eine Abfrage, die nie zurueckkommt, und der Nutzer
       * saehe dauerhaft eine Ladeanzeige statt der Bewerber.
       */
      console.error("useMailOeffnungen:", fehler);
    }
    const neu: Stand = { schluessel: speicherSchluessel, oeffnungen: ergebnis };
    merkeStand(SPEICHER, speicherSchluessel, neu);
    return neu;
  });
}

export function useMailOeffnungen(
  bewerberIds: string[],
  kinds: readonly string[],
): MailOeffnungsStand {
  // Die Liste entsteht bei jedem Render neu, der Schlüssel bleibt gleich und
  // löst die Abfrage nur aus, wenn sich die Bewerber wirklich ändern.
  const idSchluessel = [...bewerberIds].sort().join(",");
  const artSchluessel = [...kinds].join(",");
  /*
   * Der gemerkte Schluessel umfasst beides, die Bewerber und die Mailarten:
   * Eine Antwort zu anderen Mailarten sagt nichts ueber die hier gefragten.
   */
  const speicherSchluessel = `${artSchluessel}|${idSchluessel}`;
  /*
   * Startwert ist die zuletzt gemerkte Antwort: zuerst die zu genau dieser
   * Frage, sonst die letzte zu denselben Mailarten. So erscheint beim erneuten
   * Oeffnen der Seite keine Ladeanzeige mehr, auch wenn inzwischen ein
   * Bewerber dazugekommen ist. Gefragt wird trotzdem im Hintergrund.
   */
  const [stand, setStand] = useState<Stand>(() => {
    const genau = gemerkterStand<Stand>(SPEICHER, speicherSchluessel);
    if (genau) return genau;
    const letzter = letzterStand<Stand>(SPEICHER);
    return letzter && letzter.schluessel.startsWith(`${artSchluessel}|`) ? letzter : LEER;
  });
  const runde = useVersandRunde();

  useEffect(() => {
    let abgebrochen = false;
    // Die Antwort wird auch beim Abbruch gemerkt (in `ladeMailOeffnungsStand`):
    // Sie ist gueltig, nur diese Ansicht ist weg.
    const ids = idSchluessel ? idSchluessel.split(",") : [];
    void ladeMailOeffnungsStand(ids, artSchluessel.split(",")).then((neu) => {
      if (!abgebrochen) setStand(neu);
    });
    return () => {
      abgebrochen = true;
    };
  }, [idSchluessel, artSchluessel, runde]);

  return useMemo(
    // Ein leerer Schluessel heisst: noch keine Antwort. Jede andere, auch eine
    // aeltere zu weniger Bewerbern, genuegt fuer die Anzeige.
    () => ({ oeffnungen: stand.oeffnungen, bereit: stand.schluessel !== "" }),
    [stand],
  );
}
