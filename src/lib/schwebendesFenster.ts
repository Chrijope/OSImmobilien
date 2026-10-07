/**
 * Das schwebende Fenster auf dem Schreibtisch.
 *
 * Wer seinen Bildschirm teilt oder im CRM weiterarbeitet, verliert den Kunden
 * aus dem Blick: Das Gespraech liegt dann hinter allem anderen. Chrome kann
 * dafuer ein eigenes kleines Fenster oeffnen, das ueber allen Anwendungen
 * bleibt, verschiebbar und in der Groesse veraenderbar. Dieselbe Technik steckt
 * hinter dem schwebenden Fenster von Google Meet.
 *
 * Drei Dinge sind dabei wichtig und stehen deshalb hier an einer Stelle:
 *
 * 1. Es ist ein **eigenes Dokument**. Es erbt die Stilvorlage der Seite nicht.
 *    Ohne `uebertrageStile` wirkt dort keine einzige Tailwind-Klasse, die
 *    Kacheln stuenden als nackte Kaesten untereinander.
 * 2. Es geht **nur nach einer echten Nutzergeste** auf. Ein Aufruf aus einem
 *    Zeitgeber oder nach einem langen `await` wird abgelehnt. Deshalb oeffnet
 *    es der Klick auf "Teilen" beziehungsweise "Kleiner" selbst, noch bevor
 *    der Browser seine Auswahl zeigt.
 * 3. **Safari und Firefox koennen es nicht.** `kannSchweben` fragt das ab.
 *    Fehlt es, bleibt alles wie bisher, ohne Hinweis und ohne toten Knopf.
 */

/** Der Ausschnitt der Browser-Schnittstelle, den wir brauchen. */
interface SchwebeSchnittstelle {
  requestWindow: (optionen?: { width?: number; height?: number }) => Promise<Window>;
  /** Das offene Fenster, oder null. Es kann immer nur eines geben. */
  window: Window | null;
}

function schnittstelle(): SchwebeSchnittstelle | null {
  if (typeof window === "undefined") return null;
  const traeger = window as unknown as { documentPictureInPicture?: SchwebeSchnittstelle };
  const api = traeger.documentPictureInPicture;
  if (!api || typeof api.requestWindow !== "function") return null;
  return api;
}

/** Kann dieser Browser ein schwebendes Fenster? */
export function kannSchweben(): boolean {
  return schnittstelle() !== null;
}

/**
 * Die Stilvorlage in das neue Dokument kopieren.
 *
 * Zwei Wege, weil es zwei Arten von Stilblaettern gibt. Eigene Blaetter
 * (Vite haengt sie in der Entwicklung als `<style>` ein, im Bau als `<link>`
 * derselben Herkunft) lassen sich Regel fuer Regel auslesen und als ein
 * einziger `<style>`-Block uebernehmen. Das ist der bessere Weg, denn er wirkt
 * sofort. Bei fremder Herkunft, etwa einer Schriftart von aussen, sperrt der
 * Browser `cssRules`; dann bleibt nur, dieselbe Adresse noch einmal zu
 * verlinken.
 *
 * `adoptedStyleSheets` kommt zum Schluss dazu. Diesen Weg gehen Bibliotheken,
 * die ihre Stile zur Laufzeit erzeugen.
 */
export function uebertrageStile(ziel: Document, quelle: Document = document): void {
  for (const blatt of Array.from(quelle.styleSheets)) {
    const medium = blatt.media?.mediaText ?? "";
    try {
      const regeln = Array.from(blatt.cssRules).map((regel) => regel.cssText).join("\n");
      const stil = ziel.createElement("style");
      stil.textContent = regeln;
      if (medium) stil.media = medium;
      ziel.head.appendChild(stil);
    } catch {
      // Fremde Herkunft: die Regeln sind gesperrt, die Adresse nicht.
      const adresse = blatt.href;
      if (!adresse) continue;
      const verweis = ziel.createElement("link");
      verweis.rel = "stylesheet";
      verweis.href = adresse;
      if (medium) verweis.media = medium;
      ziel.head.appendChild(verweis);
    }
  }

  const uebernommen = (quelle as Document & { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets;
  if (uebernommen?.length) {
    const zielDoc = ziel as Document & { adoptedStyleSheets?: CSSStyleSheet[] };
    try {
      zielDoc.adoptedStyleSheets = [...(zielDoc.adoptedStyleSheets ?? []), ...uebernommen];
    } catch {
      // Ein Blatt aus einem anderen Dokument darf nicht ueberall uebernommen
      // werden. Dann fehlt hoechstens ein Randfall, nicht die ganze Vorlage.
    }
  }
}

/**
 * Der Grundstil des neuen Dokuments.
 *
 * Er steht hier und nicht in einer Tailwind-Klasse, weil er das Dokument
 * selbst betrifft: Ein neues Fenster bringt weisse Flaeche und einen Rand von
 * acht Pixeln mit. Beides faellt im dunklen Gespraech sofort auf.
 */
const GRUNDSTIL = `
  html, body { margin: 0; padding: 0; height: 100%; background: #0B1119; color: #fff; overflow: hidden; }
  body { font-family: inherit; }
  * { box-sizing: border-box; }
`;

/**
 * Das Fenster oeffnen. Gibt `null` zurueck, wenn der Browser es nicht kann
 * oder nicht will, etwa weil die Nutzergeste schon verbraucht ist.
 *
 * Wichtig fuer den Aufrufer: Das Ergebnis ist ein Versprechen, der Aufruf
 * selbst muss aber **im Klickpfad** stehen. Wer erst auf etwas anderes wartet
 * und dann hier hereinkommt, bekommt verlaesslich `null`.
 */
export async function oeffneSchwebendesFenster(
  { breite = 420, hoehe = 340 }: { breite?: number; hoehe?: number } = {},
): Promise<Window | null> {
  const api = schnittstelle();
  if (!api) return null;
  // Es kann nur eines geben. Ein zweiter Aufruf soll das vorhandene liefern,
  // statt zu scheitern.
  if (api.window) return api.window;
  try {
    const fenster = await api.requestWindow({ width: breite, height: hoehe });
    fenster.document.title = "OS Immobilien Videogespräch";
    const grund = fenster.document.createElement("style");
    grund.textContent = GRUNDSTIL;
    fenster.document.head.appendChild(grund);
    uebertrageStile(fenster.document);
    return fenster;
  } catch (fehler) {
    // Kein Hinweis an den Nutzer: Es bleibt einfach beim heutigen Verhalten.
    console.warn("Schwebendes Fenster nicht geöffnet:", fehler);
    return null;
  }
}

/** Das Fenster schliessen, falls es noch steht. */
export function schliesseSchwebendesFenster(fenster: Window | null): void {
  try {
    if (fenster && !fenster.closed) fenster.close();
  } catch {
    // Ein bereits geschlossenes Fenster ist kein Fehler.
  }
}
