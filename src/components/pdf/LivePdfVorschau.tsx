import { useEffect, useRef, useState } from "react";
import type jsPDF from "jspdf";
import { ExternalLink } from "lucide-react";

/**
 * PDF, das kurz nach jeder Eingabe neu gezeichnet wird (17.10.2026).
 * Gemeinsam für Beratungsprotokoll, Reservierung und Selbstauskunft; das
 * Muster stammt aus der Rechnungsvorlage.
 *
 * `schluessel` ändert sich mit jeder Eingabe (etwa JSON der Formulardaten);
 * nur dann wird neu gezeichnet. `erzeuge` darf sich bei jedem Rendern ändern.
 */
export function LivePdfVorschau({ erzeuge, schluessel, titel = "PDF-Vorschau", hoehe = "min(calc(100vh - 8rem), 141vw)" }: {
  erzeuge: () => Promise<jsPDF>;
  schluessel: string;
  titel?: string;
  hoehe?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [fehler, setFehler] = useState(false);
  const urlRef = useRef<string | null>(null);
  const erzeugeRef = useRef(erzeuge);
  erzeugeRef.current = erzeuge;

  useEffect(() => {
    let abgebrochen = false;
    const timer = setTimeout(async () => {
      try {
        const doc = await erzeugeRef.current();
        if (abgebrochen) return;
        const neu = URL.createObjectURL(doc.output("blob"));
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = neu;
        setUrl(neu);
        setFehler(false);
      } catch (e) {
        console.error(e);
        if (!abgebrochen) setFehler(true);
      }
    }, 400);
    return () => { abgebrochen = true; clearTimeout(timer); };
  }, [schluessel]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

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
      <div className="rounded-lg border bg-muted/30 overflow-hidden">
        {url ? (
          // key: neues iframe je Vorschau, sonst zeigt Chrome nach dem Adresswechsel eine graue Fläche.
          <iframe key={url} src={`${url}#toolbar=0&navpanes=0&view=FitH`} title={titel} className="w-full block bg-white" style={{ height: hoehe }} />
        ) : (
          <div className="flex items-center justify-center text-sm text-muted-foreground p-6" style={{ height: hoehe }}>
            {fehler ? "Vorschau konnte nicht erstellt werden." : "Vorschau wird erstellt …"}
          </div>
        )}
      </div>
    </section>
  );
}
