import { useEffect, useRef, useState } from "react";
import type jsPDF from "jspdf";
import { ExternalLink } from "lucide-react";

/**
 * PDF, das bei jeder Eingabe neu gezeichnet wird (17.10.2026).
 * Gemeinsam für Beratungsprotokoll, Mietzuzahlung, Reservierung und
 * Selbstauskunft; das Muster stammt aus der Rechnungsvorlage.
 *
 * Seit dem 30.10.2026 in Echtzeit (Christian: „direkt in Echtzeit, nicht
 * erst neu laden“): Statt einen Rahmen mit neuer blob-Adresse zu laden, der
 * dabei kurz leer aufblitzt, zeichnet pdf.js jede Seite auf ein <canvas>.
 * Die neue Fassung entsteht unsichtbar und ersetzt die alte erst, wenn alle
 * Seiten fertig sind. Kommt während des Zeichnens eine neue Eingabe, wird
 * danach sofort der neueste Stand gezeichnet, Zwischenstände fallen weg.
 *
 * `schluessel` ändert sich mit jeder Eingabe (etwa JSON der Formulardaten);
 * nur dann wird neu gezeichnet. `erzeuge` darf sich bei jedem Rendern ändern.
 */

type PdfJs = typeof import("pdfjs-dist");
let pdfjsLaden: Promise<PdfJs> | null = null;
/** pdf.js einmal laden, mit Web Worker wie in `GrundrissVorschau`. */
function pdfjsHolen(): Promise<PdfJs> {
  // Die Moduldatei direkt: Über "pdfjs-dist" verpackt Vites Entwicklungsserver das Modul so, dass alles fehlt.
  pdfjsLaden ??= Promise.all([import("pdfjs-dist/build/pdf.mjs") as Promise<PdfJs>, import("pdfjs-dist/build/pdf.worker.mjs?url")]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsLaden;
}

export function LivePdfVorschau({ erzeuge, schluessel, titel = "PDF-Vorschau", hoehe = "min(calc(100vh - 8rem), 141vw)" }: {
  erzeuge: () => Promise<jsPDF>;
  schluessel: string;
  titel?: string;
  hoehe?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [zustand, setZustand] = useState<"laeuft" | "fertig" | "fehler">("laeuft");
  const seitenRef = useRef<HTMLDivElement>(null);
  const urlRef = useRef<string | null>(null);
  const erzeugeRef = useRef(erzeuge);
  erzeugeRef.current = erzeuge;
  const titelRef = useRef(titel);
  titelRef.current = titel;
  // Zeichnet gerade? Dann nur vormerken, damit nie zwei Läufe gleichzeitig zeichnen.
  const laeuftRef = useRef(false);
  const nochmalRef = useRef(false);
  const abgebautRef = useRef(false);

  useEffect(() => {
    abgebautRef.current = false;
    return () => {
      abgebautRef.current = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  useEffect(() => {
    const zeichnen = async () => {
      if (laeuftRef.current) { nochmalRef.current = true; return; }
      laeuftRef.current = true;
      try {
        do {
          nochmalRef.current = false;
          const doc = await erzeugeRef.current();
          if (nochmalRef.current) continue;
          const daten = doc.output("arraybuffer");
          const pdfjs = await pdfjsHolen();
          const pdf = await pdfjs.getDocument({ data: daten.slice(0), isEvalSupported: false }).promise;
          // 1,25-fache Auflösung genügt für scharfe Schrift und hält das Zeichnen kurz.
          const breite = (seitenRef.current?.clientWidth || 800) * Math.min(1.25, window.devicePixelRatio || 1);
          const behaelter = seitenRef.current;
          if (!behaelter) break;
          // Jede Seite tauscht, sobald sie fertig ist: Seite 1 steht sofort, die
          // übrigen folgen. Die alte Seite bleibt bis dahin stehen, nichts blitzt leer auf.
          for (let nr = 1; nr <= pdf.numPages && !nochmalRef.current; nr++) {
            const seite = await pdf.getPage(nr);
            const ansicht = seite.getViewport({ scale: breite / seite.getViewport({ scale: 1 }).width });
            const flaeche = document.createElement("canvas");
            flaeche.width = Math.floor(ansicht.width);
            flaeche.height = Math.floor(ansicht.height);
            flaeche.className = "block w-full h-auto bg-white shadow-sm";
            flaeche.setAttribute("role", "img");
            flaeche.setAttribute("aria-label", `${titelRef.current}, Seite ${nr} von ${pdf.numPages}`);
            await seite.render({ canvasContext: flaeche.getContext("2d")!, viewport: ansicht }).promise;
            if (nochmalRef.current || abgebautRef.current) break;
            const alt = behaelter.children[nr - 1];
            if (alt) alt.replaceWith(flaeche); else behaelter.appendChild(flaeche);
            if (nr === 1) setZustand("fertig");
          }
          // Hat das Dokument Seiten verloren, die überzähligen entfernen.
          if (!nochmalRef.current) while (behaelter.children.length > pdf.numPages) behaelter.lastElementChild?.remove();
          void pdf.destroy();
          if (nochmalRef.current || abgebautRef.current) continue;
          const neu = URL.createObjectURL(new Blob([daten], { type: "application/pdf" }));
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = neu;
          setUrl(neu);
        } while (nochmalRef.current && !abgebautRef.current);
      } catch (e) {
        console.error(e);
        if (!abgebautRef.current) setZustand((z) => (z === "fertig" ? z : "fehler"));
      } finally {
        laeuftRef.current = false;
      }
    };
    // Kurze Pause nur, damit nicht jeder einzelne Tastendruck einen Lauf startet.
    const timer = setTimeout(() => void zeichnen(), 60);
    return () => clearTimeout(timer);
  }, [schluessel]);

  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{titel}</h3>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ExternalLink className="h-3.5 w-3.5" /> In neuem Tab öffnen
          </a>
        )}
      </div>
      <div className="relative rounded-lg border bg-muted/30 overflow-y-auto" style={{ height: hoehe }} data-testid="live-pdf-vorschau">
        <div ref={seitenRef} className="space-y-3 p-3" />
        {zustand !== "fertig" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground p-6">
            {zustand === "fehler" ? "Vorschau konnte nicht erstellt werden." : "Vorschau wird erstellt …"}
          </div>
        )}
      </div>
    </section>
  );
}
