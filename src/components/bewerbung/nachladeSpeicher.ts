/**
 * Das Gedaechtnis fuer die Nachlade-Abfragen der Bewerberliste.
 *
 * ## Warum es das gibt
 *
 * Die Liste zeigt mehrere Angaben, die nicht im `dataCache` liegen und deshalb
 * je Seitenaufbau einzeln geholt werden: die Vorab-Scores, den Versand des
 * Kennenlernbogens, die gemessenen Mailoeffnungen und die selbst gebuchten
 * Termine. Seit dem 17.09.2026 wartet die Liste auf diese Antworten, bevor sie
 * erscheint, denn sie entscheiden ueber Reihenfolge und Anzahl der Zeilen
 * (siehe `BewerberArbeitsplatz`).
 *
 * Ohne dieses Gedaechtnis begaenne das Warten bei jedem Oeffnen der Seite von
 * vorn. Aus dem einen Flackern beim ersten Aufruf wuerde dann eine Ladeanzeige
 * bei jedem weiteren, und das waere nur ein anderer Fehler.
 *
 * ## Was gemerkt wird
 *
 * Je Bereich genau eine Antwort, zusammen mit dem Schluessel, fuer den sie
 * gilt. Bei den Bewerberhooks ist das die Liste der angezeigten Kennungen.
 * Die Angaben sind je Bewerber abgelegt, eine aeltere Antwort passt also fuer
 * jeden, den sie schon kannte, und schweigt zu allen anderen.
 *
 * Seit dem 26.09.2026 gilt zusaetzlich die **letzte Antwort ueberhaupt**
 * (`letzterStand`) als Startwert, auch wenn sich die Bewerber seitdem
 * geaendert haben. Christian hatte gemeldet, dass beim Klick auf
 * Bewerberprozess immer wieder die Ladeanzeige erschien. Der Grund: Schon ein
 * einziger neuer Bewerber von der Website aenderte den Schluessel, und die
 * Liste wartete wieder von vorn. Jetzt steht die Liste sofort mit dem letzten
 * Stand da, und nur die Angaben zum neuen Bewerber kommen einen Augenblick
 * spaeter dazu.
 *
 * Es ist ausdruecklich **kein zweiter Datenspeicher neben `dataCache`**. Die
 * Hooks fragen weiterhin bei jedem Aufbau neu; das Gemerkte ueberbrueckt nur
 * die Zeit bis zur neuen Antwort und verschwindet mit dem Neuladen der Seite.
 */

type Eintrag = { schluessel: string; wert: unknown };

const _staende = new Map<string, Eintrag>();
/** Laufende Abfragen, damit Vorladen und Seite nicht doppelt fragen. */
const _laeufe = new Map<string, Promise<unknown>>();

/** Die zuletzt gemerkte Antwort, sofern sie zu diesem Schluessel gehoert. */
export function gemerkterStand<T>(bereich: string, schluessel: string): T | undefined {
  const eintrag = _staende.get(bereich);
  if (!eintrag || eintrag.schluessel !== schluessel) return undefined;
  return eintrag.wert as T;
}

/** Eine fertige Antwort merken. */
export function merkeStand<T>(bereich: string, schluessel: string, wert: T): void {
  _staende.set(bereich, { schluessel, wert });
}

/**
 * Die zuletzt gemerkte Antwort dieses Bereichs, gleich zu welchem Schluessel.
 *
 * Der Startwert, wenn es zur genauen Frage noch nichts gibt. Die Hooks fragen
 * danach sofort neu und ersetzen ihn.
 */
export function letzterStand<T>(bereich: string): T | undefined {
  return _staende.get(bereich)?.wert as T | undefined;
}

/**
 * Eine Abfrage starten oder einer laufenden mit derselben Frage beitreten.
 *
 * Das Vorladen nach dem Login und die Seite selbst stellen dieselbe Frage.
 * Oeffnet jemand die Seite, waehrend das Vorladen noch laeuft, wartet sie auf
 * dessen Antwort, statt eine zweite Abfrage hinterherzuschicken.
 */
export function gemeinsamerLauf<T>(bereich: string, schluessel: string, starte: () => Promise<T>): Promise<T> {
  const kennung = `${bereich}|${schluessel}`;
  const laufend = _laeufe.get(kennung);
  if (laufend) return laufend as Promise<T>;
  const lauf = starte().finally(() => _laeufe.delete(kennung));
  _laeufe.set(kennung, lauf);
  return lauf;
}

/** Nur fuer Tests: das Gedaechtnis leeren. */
export function leereNachladeSpeicher(): void {
  _staende.clear();
  _laeufe.clear();
}
