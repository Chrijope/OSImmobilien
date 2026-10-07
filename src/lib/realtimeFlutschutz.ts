/**
 * Flutschutz fuer den Realtime-Kanal des Daten-Caches.
 *
 * Ein Massen-Import schreibt tausende Zeilen in wenigen Sekunden. Jede Zeile
 * loest bei ALLEN angemeldeten Nutzern ein einzelnes Realtime-Ereignis aus,
 * und jedes Ereignis fuehrt zu einem Cache-Update samt Re-Render. Der Import
 * eines Partners friert damit die Oberflaeche der Kollegen ein.
 *
 * Deshalb: Solange wenige Ereignisse je Sekunde eintreffen, bleibt alles wie
 * gewohnt (einzeln anwenden, sofort benachrichtigen). Erst bei einer Flut
 * schaltet die Tabelle in den Sammelmodus: Ereignisse werden verworfen und
 * stattdessen einmal gesammelt neu geladen. Das gilt je Tabelle, nicht
 * global, damit ein Kontakte-Import den Chat nicht verzoegert.
 *
 * Dieses Modul enthaelt nur die reine Entscheidungslogik (Zeitpunkte rein,
 * Entscheidung raus). Timer und das eigentliche Neuladen haengen in
 * `dataCache.ts`, damit die Logik hier ohne Mocks testbar bleibt.
 */

/** Ab mehr als so vielen Ereignissen je Fenster gilt es als Flut. */
export const FLUT_SCHWELLE_PRO_FENSTER = 5;
/** Laenge des Zaehlfensters in Millisekunden. */
export const FLUT_FENSTER_MS = 1000;
/** So lange muss Ruhe herrschen, bevor der Sammelmodus endet. */
export const RUHEPHASE_MS = 2000;
/**
 * Waehrend einer sehr langen Flut hoechstens alle 10 Sekunden ein
 * Zwischen-Refresh, damit die Oberflaeche blockweise waechst statt minutenlang
 * eingefroren zu wirken.
 */
export const ZWISCHEN_REFRESH_MS = 10000;

export interface FlutschutzZustand {
  /** Zeitstempel der Ereignisse innerhalb des aktuellen Zaehlfensters. */
  ereignisZeiten: number[];
  /** true: Ereignisse werden gesammelt statt einzeln angewendet. */
  sammelmodus: boolean;
  /** Zeitpunkt des letzten (Zwischen-)Refresh im Sammelmodus. */
  letzterRefresh: number;
}

export function neuerFlutschutzZustand(): FlutschutzZustand {
  return { ereignisZeiten: [], sammelmodus: false, letzterRefresh: 0 };
}

export interface FlutschutzErgebnis {
  /** Neuer Zustand; der alte wird nicht veraendert. */
  zustand: FlutschutzZustand;
  /** true: Ereignis einzeln in den Cache uebernehmen und sofort melden. */
  einzelnAnwenden: boolean;
  /** true: jetzt sofort ein Zwischen-Refresh der Tabelle. */
  zwischenRefreshJetzt: boolean;
}

/**
 * Verarbeitet ein eingehendes Realtime-Ereignis zum Zeitpunkt `jetzt`.
 *
 * Reine Funktion: gibt einen neuen Zustand plus die Entscheidung zurueck,
 * ob das Ereignis einzeln angewendet werden darf und ob ein Zwischen-Refresh
 * faellig ist.
 */
export function flutschutzEreignis(
  zustand: FlutschutzZustand,
  jetzt: number,
): FlutschutzErgebnis {
  const ereignisZeiten = zustand.ereignisZeiten.filter(
    (t) => jetzt - t < FLUT_FENSTER_MS,
  );
  ereignisZeiten.push(jetzt);

  let sammelmodus = zustand.sammelmodus;
  let letzterRefresh = zustand.letzterRefresh;

  if (!sammelmodus && ereignisZeiten.length > FLUT_SCHWELLE_PRO_FENSTER) {
    sammelmodus = true;
    // Die Uhr fuer den Zwischen-Refresh startet beim Umschalten. Der erste
    // Refresh kommt also entweder nach der Ruhephase oder nach 10 Sekunden
    // anhaltender Flut, je nachdem was zuerst eintritt.
    letzterRefresh = jetzt;
  }

  if (!sammelmodus) {
    return {
      zustand: { ereignisZeiten, sammelmodus, letzterRefresh },
      einzelnAnwenden: true,
      zwischenRefreshJetzt: false,
    };
  }

  const zwischenRefreshJetzt = jetzt - letzterRefresh >= ZWISCHEN_REFRESH_MS;
  if (zwischenRefreshJetzt) letzterRefresh = jetzt;

  return {
    zustand: { ereignisZeiten, sammelmodus, letzterRefresh },
    einzelnAnwenden: false,
    zwischenRefreshJetzt,
  };
}

/**
 * Beendet den Sammelmodus nach einer Ruhephase. Der Aufrufer laedt die
 * Tabelle danach genau einmal neu.
 */
export function flutschutzRuhe(zustand: FlutschutzZustand): FlutschutzZustand {
  return {
    ereignisZeiten: [],
    sammelmodus: false,
    letzterRefresh: zustand.letzterRefresh,
  };
}
