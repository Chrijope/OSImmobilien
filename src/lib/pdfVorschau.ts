/**
 * Vorschaubild der ersten Seite eines PDF.
 *
 * Warum das im Browser beim Hochladen passiert und nicht beim Anzeigen:
 * Die fertige Vorschau liegt danach als gewöhnliches Bild neben dem PDF und
 * erscheint im Chat genauso schnell wie ein Foto. Würde jeder Leser die erste
 * Seite selbst rendern, käme bei jedem Öffnen des Verlaufs eine Wartezeit
 * dazu, und alte Anhänge müssten dafür erst vollständig heruntergeladen
 * werden.
 *
 * Warum nicht einfach das PDF einbetten: Die Seitenrichtlinie in `index.html`
 * und `public/_headers` setzt `object-src 'none'`. Ein `<object>` oder
 * `<embed>` mit einem PDF wird dort still verworfen, der Nutzer sieht nur den
 * Rückfall. Genau das war der Grund, warum im Chat bisher nur ein Symbol
 * stand. Die Richtlinie zu lockern wäre der falsche Weg, denn sie schützt vor
 * eingeschleusten Einbettungen.
 *
 * `pdfjs-dist` liegt bereits im Projekt und wird auch in der
 * Grundrissvorschau und beim Verkleinern von Unterlagen benutzt. Es kommt
 * keine neue Abhängigkeit dazu.
 */

/** Längste Kante des Vorschaubilds in Bildpunkten. */
export const VORSCHAU_KANTE = 800;

/** JPEG-Qualität. Bei einer A4-Seite ergibt das rund 60 bis 120 Kilobyte. */
const VORSCHAU_QUALITAET = 0.72;

/**
 * Zeitgrenze für das Rendern.
 *
 * Ein sehr großes oder ungewöhnliches PDF darf das Absenden der Nachricht
 * nicht aufhalten. Läuft die Zeit ab, gibt es eben keine Vorschau.
 */
const ZEITGRENZE_MS = 12000;

/** Dateiendung des Vorschaubilds, passend zum Inhaltstyp unten. */
export const VORSCHAU_ENDUNG = ".vorschau.jpg";

/** Inhaltstyp des Vorschaubilds. */
export const VORSCHAU_TYP = "image/jpeg";

/**
 * Rendert die erste Seite eines PDF in ein kleines JPEG.
 *
 * Gibt `null` zurück, wenn das nicht geht, also bei einem beschädigten oder
 * passwortgeschützten Dokument, bei fehlender Zeichenfläche oder wenn die
 * Zeitgrenze überschritten wird. Der Aufrufer zeigt dann wie bisher das
 * Symbol. Es gibt bewusst keine Fehlermeldung an den Nutzer: Die Vorschau ist
 * eine Zugabe, das Hochladen selbst ist gelungen.
 */
export async function erzeugePdfVorschau(datei: File | Blob, kante = VORSCHAU_KANTE): Promise<Blob | null> {
  let abbrechen: (() => void) | undefined;
  try {
    const rendern = (async (): Promise<Blob | null> => {
      const [pdfjs, worker] = await Promise.all([
        import("pdfjs-dist"),
        // Der Arbeiter muss aus dem eigenen Paket kommen, sonst holt pdf.js
        // ihn aus dem Netz und scheitert an der Seitenrichtlinie.
        import("pdfjs-dist/build/pdf.worker.mjs?url"),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

      const puffer = await datei.arrayBuffer();
      const auftrag = pdfjs.getDocument({ data: new Uint8Array(puffer) });
      abbrechen = () => void auftrag.destroy();
      const dokument = await auftrag.promise;
      try {
        const seite = await dokument.getPage(1);
        const roh = seite.getViewport({ scale: 1 });
        // `kante`: Das Exposé-PDF braucht für einen Grundriss mehr als die 800 Punkte der Chatvorschau.
        const laengsteKante = Math.max(roh.width, roh.height) || kante;
        const feld = seite.getViewport({ scale: kante / laengsteKante });

        const flaeche = document.createElement("canvas");
        flaeche.width = Math.max(1, Math.round(feld.width));
        flaeche.height = Math.max(1, Math.round(feld.height));
        const stift = flaeche.getContext("2d");
        if (!stift) return null;
        // Eine PDF-Seite hat keinen eigenen Hintergrund. Ohne die weiße
        // Fläche würde aus dem durchsichtigen Grund im JPEG Schwarz.
        stift.fillStyle = "#ffffff";
        stift.fillRect(0, 0, flaeche.width, flaeche.height);
        await seite.render({ canvasContext: stift, viewport: feld }).promise;
        seite.cleanup();

        const bild = await new Promise<Blob | null>((fertig) =>
          flaeche.toBlob(fertig, VORSCHAU_TYP, VORSCHAU_QUALITAET),
        );
        flaeche.width = 0;
        flaeche.height = 0;
        return bild;
      } finally {
        await auftrag.destroy();
        abbrechen = undefined;
      }
    })();

    const zeitgrenze = new Promise<null>((fertig) => setTimeout(() => fertig(null), ZEITGRENZE_MS));
    const ergebnis = await Promise.race([rendern, zeitgrenze]);
    if (!ergebnis) abbrechen?.();
    return ergebnis;
  } catch (fehler) {
    console.warn("[pdfVorschau] Erste Seite konnte nicht gerendert werden:", fehler);
    abbrechen?.();
    return null;
  }
}
