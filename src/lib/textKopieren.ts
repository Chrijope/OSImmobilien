/**
 * Text in die Zwischenablage legen, ohne dass ein Klick ins Leere laufen kann.
 *
 * Der Anlass, Christian am 18.09.2026: Ein Klick auf „Kundenlink" hat ihm den
 * Browser haengen lassen. Der schlichte Aufruf
 * `navigator.clipboard.writeText(...)` hat naemlich drei Stellen, an denen er
 * still stehenbleibt:
 *
 *   1. `navigator.clipboard` gibt es nur in einem sicheren Zusammenhang
 *      (https oder localhost). Sonst ist es `undefined`, und der Zugriff auf
 *      `.writeText` wirft mitten im Klickbehandler. Was danach kommt, etwa ein
 *      Toast, geschieht nie.
 *   2. In einem eingebetteten Rahmen ohne die Erlaubnis `clipboard-write`
 *      lehnt der Browser ab. Genau so steht die Lovable-Vorschau im Rahmen.
 *   3. Chrome darf nachfragen, bevor es schreibt. Solange die Nachfrage offen
 *      ist, bleibt das Versprechen offen: es loest weder ein noch scheitert
 *      es. Ein `.then(erfolg, fehler)` bekommt dann von beidem nichts, und auf
 *      dem Bildschirm passiert gar nichts. Genau das sah aus wie ein haengender
 *      Browser.
 *
 * Deshalb hier: Zugriff in `try`, ein Wettlauf gegen eine Zeitgrenze, danach
 * der alte Weg ueber ein unsichtbares Textfeld, und am Ende eine ehrliche
 * Antwort. Wer sie bekommt, zeigt den Text zum Markieren an. Ein
 * Browser-Dialog kommt hier nicht vor, siehe `confirm.tsx`.
 */

export type KopierErgebnis = "kopiert" | "gescheitert";

/**
 * Wie lange auf die Zwischenablage gewartet wird.
 *
 * Gelingt das Schreiben, ist es in wenigen Millisekunden vorbei. Eine Sekunde
 * ist also reichlich und trotzdem kurz genug, dass ein Nutzer sie nicht als
 * Haenger empfindet.
 */
export const KOPIER_ZEITGRENZE_MS = 1000;

/** Ein Versprechen, das nach der Zeitgrenze aufgibt statt ewig zu warten. */
function mitZeitgrenze(versprechen: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise<boolean>((aufloesen) => {
    const uhr = setTimeout(() => aufloesen(false), ms);
    versprechen.then(
      () => { clearTimeout(uhr); aufloesen(true); },
      () => { clearTimeout(uhr); aufloesen(false); },
    );
  });
}

/**
 * Der alte Weg: ein unsichtbares Textfeld, markieren, kopieren.
 *
 * `document.execCommand` gilt als veraltet, ist aber genau dort noch da, wo
 * die moderne Zwischenablage fehlt oder gesperrt ist. Er verlangt ein Feld,
 * das wirklich im Dokument steht, deshalb wird es angehaengt und gleich wieder
 * entfernt.
 */
function kopiereUeberTextfeld(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  const feld = document.createElement("textarea");
  feld.value = text;
  // Nicht `display:none`: Ein verstecktes Feld laesst sich nicht markieren.
  feld.setAttribute("readonly", "");
  feld.style.position = "fixed";
  feld.style.top = "-1000px";
  feld.style.opacity = "0";
  document.body.appendChild(feld);
  try {
    feld.select();
    feld.setSelectionRange(0, text.length);
    return document.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    feld.remove();
  }
}

/**
 * Text kopieren. Gibt „gescheitert" zurueck, statt stillzustehen.
 *
 * Der Aufrufer muss den Fall behandeln: Toast reicht nicht, der Nutzer braucht
 * den Text dann zum Markieren vor Augen.
 */
export async function kopiereText(
  text: string,
  zeitgrenzeMs = KOPIER_ZEITGRENZE_MS,
): Promise<KopierErgebnis> {
  if (!text) return "gescheitert";

  try {
    const schreiben = navigator?.clipboard?.writeText;
    if (typeof schreiben === "function") {
      const geschafft = await mitZeitgrenze(schreiben.call(navigator.clipboard, text), zeitgrenzeMs);
      if (geschafft) return "kopiert";
    }
  } catch {
    // Kein sicherer Zusammenhang, gesperrter Rahmen, alter Browser: weiter unten.
  }

  return kopiereUeberTextfeld(text) ? "kopiert" : "gescheitert";
}
