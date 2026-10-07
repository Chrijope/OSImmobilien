/**
 * Große Unterlagen automatisch auf eine hochladbare Größe bringen.
 *
 * Vorher wies das Formular alles über 20 MB ab. Für den Partner hieß das:
 * Fehlermeldung, und dann steht er da. Ein Ausweisfoto einer modernen
 * Handykamera hat schnell 12 MB, ein eingescanntes Amtsdokument auch mal 40.
 * Wer dann selbst ein Bildbearbeitungsprogramm suchen muss, lädt gar nichts
 * mehr hoch.
 *
 * Jetzt verkleinert das System selbst, in mehreren Anläufen, bis es passt.
 *
 * Bilder und PDFs brauchen dafür verschiedene Wege:
 *
 *   Bilder  werden über ein Canvas neu gezeichnet: erst kleinere Kantenlänge,
 *           dann geringere Qualität. Verlustbehaftet, aber für ein Ausweisfoto
 *           unerheblich, solange die Schrift lesbar bleibt.
 *
 *   PDFs    lassen sich im Browser nicht wirklich komprimieren. Ein PDF ist
 *           ein Behälter, und das Gewicht steckt in den Bildern darin. Der
 *           einzige gangbare Weg ist, jede Seite zu rendern und daraus ein
 *           neues PDF zu bauen. Das kostet die Textebene: Danach lässt sich
 *           im Dokument nicht mehr suchen und nichts mehr herauskopieren.
 *           Deshalb geschieht es nur, wenn es sein muss.
 */

/** Ziel: deutlich unter dem Limit des Speichers von 20 MB. */
export const ZIELGROESSE = 18 * 1024 * 1024;

export interface VerkleinerErgebnis {
  datei: File;
  /** Wurde überhaupt etwas verändert? */
  verkleinert: boolean;
  /** Größe vorher, in Bytes. */
  vorher: number;
  /** Bei PDFs: Die Textebene ist weg. Das muss dem Nutzer gesagt werden. */
  textEbeneVerloren?: boolean;
  /**
   * Das Verkleinern ist mit einem Fehler abgebrochen, `datei` ist dann das
   * Original. Gesetzt, damit der Aufrufer es dem Nutzer sagen kann, statt
   * still die Originaldatei zu nehmen. Bis zum 26.09.2026 scheiterte so das
   * PDF-Verkleinern, ohne dass es jemand merkte.
   */
  fehler?: string;
}

/** Menschenlesbare Größe, etwa "12,4 MB". */
export function groesseText(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * Ein Bild so lange verkleinern, bis es unter die Zielgröße passt.
 *
 * Erst die Kantenlänge, dann die Qualität. In dieser Reihenfolge, weil eine
 * halbierte Kantenlänge ein Viertel der Datenmenge bringt, eine halbierte
 * Qualität aber sichtbare Artefakte. Erst wenn die Auflösung am unteren Ende
 * ist, wird an der Qualität gedreht.
 */
async function verkleinereBild(datei: File): Promise<VerkleinerErgebnis> {
  const vorher = datei.size;
  const bitmap = await createImageBitmap(datei).catch(() => null);
  if (!bitmap) {
    return { datei, verkleinert: false, vorher, fehler: "Das Bild ließ sich im Browser nicht öffnen." };
  }

  // Von großzügig nach sparsam. 2400 Pixel reichen, um einen Ausweis in
  // Originalgröße lesbar abzubilden.
  const stufen: Array<{ kante: number; qualitaet: number }> = [
    { kante: 2400, qualitaet: 0.85 },
    { kante: 2000, qualitaet: 0.8 },
    { kante: 1600, qualitaet: 0.75 },
    { kante: 1600, qualitaet: 0.6 },
    { kante: 1200, qualitaet: 0.6 },
    { kante: 1000, qualitaet: 0.5 },
  ];

  for (const { kante, qualitaet } of stufen) {
    const faktor = Math.min(1, kante / Math.max(bitmap.width, bitmap.height));
    const b = Math.max(1, Math.round(bitmap.width * faktor));
    const h = Math.max(1, Math.round(bitmap.height * faktor));

    const flaeche = document.createElement("canvas");
    flaeche.width = b;
    flaeche.height = h;
    const stift = flaeche.getContext("2d");
    if (!stift) break;
    // Weißer Grund: Ein PNG mit Durchsichtigkeit würde als JPEG sonst schwarz.
    stift.fillStyle = "#ffffff";
    stift.fillRect(0, 0, b, h);
    stift.drawImage(bitmap, 0, 0, b, h);

    const blob: Blob | null = await new Promise((r) =>
      flaeche.toBlob(r, "image/jpeg", qualitaet),
    );
    if (!blob) continue;

    if (blob.size <= ZIELGROESSE) {
      bitmap.close?.();
      const name = (datei.name || "dokument").replace(/\.[^.]+$/, "") + ".jpg";
      return {
        datei: new File([blob], name, { type: "image/jpeg" }),
        verkleinert: blob.size < vorher,
        vorher,
      };
    }
  }

  bitmap.close?.();
  // Auch die kleinste Stufe war zu groß. Das schafft praktisch kein Foto,
  // aber die Datei unverändert zurückzugeben ist ehrlicher als zu behaupten,
  // es hätte geklappt.
  return { datei, verkleinert: false, vorher };
}

/**
 * Ein PDF verkleinern, indem jede Seite neu gezeichnet wird.
 *
 * Der Preis ist hoch: Die Textebene geht verloren, das Ergebnis ist eine
 * Folge von Bildern. Für einen eingescannten Ausweis oder eine
 * Gewerbeerlaubnis ist das verschmerzbar, denn die sind ohnehin Scans.
 */
async function verkleinerePdf(datei: File): Promise<VerkleinerErgebnis> {
  const vorher = datei.size;
  try {
    const [{ default: jsPDF }, pdfjs] = await Promise.all([
      import("jspdf"),
      import("pdfjs-dist"),
    ]);
    // Der Arbeiter muss aus dem eigenen Paket kommen, sonst holt pdf.js ihn
    // aus dem Netz und scheitert ohne Verbindung.
    const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
    (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } })
      .GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;

    const puffer = await datei.arrayBuffer();
    const dokument = await (pdfjs as unknown as {
      getDocument: (o: unknown) => { promise: Promise<any> };
    }).getDocument({ data: puffer }).promise;

    for (const massstab of [1.5, 1.2, 1.0, 0.8]) {
      const ziel = new jsPDF({ unit: "pt", compress: true });
      let erste = true;

      for (let nr = 1; nr <= dokument.numPages; nr++) {
        const seite = await dokument.getPage(nr);
        const feld = seite.getViewport({ scale: massstab });
        const flaeche = document.createElement("canvas");
        flaeche.width = Math.round(feld.width);
        flaeche.height = Math.round(feld.height);
        const stift = flaeche.getContext("2d");
        if (!stift) break;
        stift.fillStyle = "#ffffff";
        stift.fillRect(0, 0, flaeche.width, flaeche.height);
        await seite.render({ canvasContext: stift, viewport: feld }).promise;

        const bild = flaeche.toDataURL("image/jpeg", 0.7);
        const breitePt = feld.width / massstab;
        const hoehePt = feld.height / massstab;
        if (!erste) ziel.addPage([breitePt, hoehePt]);
        else {
          ziel.deletePage(1);
          ziel.addPage([breitePt, hoehePt]);
          erste = false;
        }
        ziel.addImage(bild, "JPEG", 0, 0, breitePt, hoehePt);
      }

      const blob = ziel.output("blob");
      if (blob.size <= ZIELGROESSE) {
        return {
          datei: new File([blob], datei.name, { type: "application/pdf" }),
          verkleinert: blob.size < vorher,
          vorher,
          textEbeneVerloren: true,
        };
      }
    }
  } catch (e) {
    console.error("[unterlagenVerkleinern] PDF:", e);
    return { datei, verkleinert: false, vorher, fehler: "Das PDF ließ sich im Browser nicht verkleinern." };
  }
  return { datei, verkleinert: false, vorher };
}

/**
 * Bringt eine Datei auf hochladbare Größe, falls nötig.
 *
 * Passt sie schon, wird sie unangetastet zurückgegeben: Ein bereits kleines
 * PDF durch den Bildwolf zu drehen und dabei die Textebene zu verlieren, wäre
 * ein Schaden ohne Nutzen.
 */
export async function aufHochladbareGroesse(datei: File): Promise<VerkleinerErgebnis> {
  if (datei.size <= ZIELGROESSE) {
    return { datei, verkleinert: false, vorher: datei.size };
  }
  const istPdf = datei.type === "application/pdf" || /\.pdf$/i.test(datei.name);
  return istPdf ? verkleinerePdf(datei) : verkleinereBild(datei);
}
