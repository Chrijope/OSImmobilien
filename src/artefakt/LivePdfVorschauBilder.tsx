import { useEffect, useRef, useState } from "react";
import type jsPDF from "jspdf";
import * as pdfjs from "pdfjs-dist";
import * as pdfjsArbeiter from "pdfjs-dist/build/pdf.worker.mjs";

/*
 * Ersatz für `@/components/pdf/LivePdfVorschau` in der Artefakt-Fassung
 * (vite.artefakt.config.ts, Alias). Gleiche Schnittstelle.
 *
 * Warum: Auf claude.ai läuft die Seite in einem Sandbox-iframe mit strenger
 * Content-Security-Policy. Ein PDF als blob:-Adresse in einem <iframe> wird
 * dort blockiert (frame-src), und Chromes PDF-Ansicht startet in Sandbox-
 * Rahmen ohnehin nicht. Die Vorschau blieb deshalb leer. Hier zeichnet pdf.js
 * jede Seite auf ein <canvas>, ohne Rahmen, ohne Netz und ohne Web Worker.
 */

// pdf.js rechnet im Hauptthread: Ein Worker bräuchte worker-src bzw. eine
// eigene Herkunft, beides ist im Sandbox-iframe nicht sicher.
(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = pdfjsArbeiter;

export function LivePdfVorschau({ erzeuge, schluessel, titel = "PDF-Vorschau", hoehe = "min(calc(100vh - 8rem), 141vw)" }: {
  erzeuge: () => Promise<jsPDF>;
  schluessel: string;
  titel?: string;
  hoehe?: string;
}) {
  const [zustand, setZustand] = useState<"laeuft" | "fertig" | "fehler">("laeuft");
  const seitenRef = useRef<HTMLDivElement>(null);
  const erzeugeRef = useRef(erzeuge);
  erzeugeRef.current = erzeuge;

  useEffect(() => {
    let abgebrochen = false;
    const timer = setTimeout(async () => {
      try {
        const doc = await erzeugeRef.current();
        const pdf = await pdfjs.getDocument({ data: doc.output("arraybuffer"), isEvalSupported: false }).promise;
        const breite = (seitenRef.current?.clientWidth || 800) * (window.devicePixelRatio || 1);
        const flaechen: HTMLCanvasElement[] = [];
        for (let nr = 1; nr <= pdf.numPages && !abgebrochen; nr++) {
          const seite = await pdf.getPage(nr);
          const ansicht = seite.getViewport({ scale: breite / seite.getViewport({ scale: 1 }).width });
          const flaeche = document.createElement("canvas");
          flaeche.width = Math.floor(ansicht.width);
          flaeche.height = Math.floor(ansicht.height);
          flaeche.className = "block w-full h-auto bg-white shadow-sm";
          flaeche.setAttribute("aria-label", `${titel}, Seite ${nr} von ${pdf.numPages}`);
          await seite.render({ canvasContext: flaeche.getContext("2d")!, viewport: ansicht }).promise;
          flaechen.push(flaeche);
        }
        void pdf.destroy();
        if (abgebrochen || !seitenRef.current) return;
        // Erst tauschen, wenn alle Seiten fertig sind: kein Flackern beim Tippen.
        seitenRef.current.replaceChildren(...flaechen);
        setZustand("fertig");
      } catch (e) {
        console.error(e);
        if (!abgebrochen) setZustand("fehler");
      }
    }, 400);
    return () => { abgebrochen = true; clearTimeout(timer); };
  }, [schluessel, titel]);

  return (
    <section className="min-w-0 space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{titel}</h3>
      <div className="relative rounded-lg border bg-muted/30 overflow-y-auto" style={{ height: hoehe }}>
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
