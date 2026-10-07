import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ExternalLink, Maximize2 } from "lucide-react";
import { planAnzeigename, type ExposeInhalt } from "@/lib/exposeInhalt";
import { resolveImageUrl } from "@/lib/objekteImages";
import { useAnzeigeSprache } from "@/lib/seitenSpracheKontext";
import { exposeSeitenTexte } from "./exposeTexte";
import "./exposeLageGrundriss.css";

/**
 * Höchstens so viele Seiten einer PDF werden gezeichnet. Ein Grundriss hat
 * eine bis drei, eine Mappe mit zwanzig Seiten würde die Seite lange
 * aufhalten. Der Rest steht im Original.
 */
const MAX_SEITEN = 6;

const IST_PDF = /\.pdf(?:[?#]|$)/i;

/**
 * So viel von Seite 2 bleibt im Kasten sichtbar (Christian, 24.09.2026): ein
 * Viertel reicht, damit man sieht, dass es weitergeht, ohne dass alle Seiten
 * groß untereinander stehen.
 */
export const ANGERISSEN = 0.25;

/**
 * Ein Grundriss im Exposé: klein (seit dem 24.09.2026, `exposeLageGrundriss.css`),
 * mit Vollbild und dem Original zum Öffnen.
 *
 * PDF-Pläne werden als Bilder gezeichnet, damit der Druck den Plan selbst
 * enthält und nicht nur einen Rahmen. Die Adresse ist immer eine, die der
 * Browser öffnen kann: befristet aus dem eigenen Speicher (internes Exposé
 * über `useGrundrissAdressen`, Kundenlink über die Aktion „datei“).
 */
export function GrundrissVorschau({ dokument: d, onZoom }: {
  dokument: ExposeInhalt["grundriss"]["dokumente"][number];
  onZoom: (image: { url: string; alt: string }) => void;
}) {
  const t = exposeSeitenTexte(useAnzeigeSprache());
  const [seiten, setSeiten] = useState<string[]>([]);
  const [seitenGesamt, setSeitenGesamt] = useState(0);
  const [fehler, setFehler] = useState(false);
  /*
   * Liefert der Speicher das Bild nicht (Adresse abgelaufen, Datei fehlt),
   * darf im Exposé kein zerbrochenes Bild stehen. Es fällt heraus, der
   * Verweis auf das Original bleibt. Ein fehlender Plan ist eine fehlende
   * Angabe, ein kaputtes Bild sieht nach einem kaputten System aus.
   */
  const [bildFehler, setBildFehler] = useState(false);
  const titel = planAnzeigename(d.name);
  useEffect(() => {
    setSeiten([]); setSeitenGesamt(0); setFehler(false); setBildFehler(false);
    if (d.istBild || !IST_PDF.test(d.url)) return;
    let active = true;
    let task: { destroy: () => Promise<void> } | undefined;
    (async () => {
      try {
        const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.mjs?url")]);
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const loading = pdfjs.getDocument(resolveImageUrl(d.url));
        task = loading;
        const pdf = await loading.promise;
        const images: string[] = [];
        for (let i = 1; i <= Math.min(pdf.numPages, MAX_SEITEN); i++) {
          if (!active) return;
          const page = await pdf.getPage(i);
          const initial = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(2, 1800 / Math.max(initial.width, initial.height)) });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas nicht verfügbar");
          // Eine PDF-Seite hat keinen eigenen Grund, ohne Weiß wäre er durchsichtig.
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: context, viewport }).promise;
          images.push(canvas.toDataURL("image/png"));
          page.cleanup(); canvas.width = canvas.height = 0;
        }
        if (active) { setSeiten(images); setSeitenGesamt(pdf.numPages); }
        await loading.destroy();
      } catch { if (active) setFehler(true); }
    })();
    return () => { active = false; void task?.destroy(); };
  }, [d.url, d.istBild]);
  const images = d.istBild ? (bildFehler ? [] : [resolveImageUrl(d.url)]) : seiten;
  const seitenAlt = (i: number) => (images.length > 1 ? t.seiteVon(titel, i + 1) : titel);
  const mehrseitig = images.length > 1;

  /*
   * Mehrere Seiten stehen in einem eigenen Scrollkasten: Seite 1 ganz, von
   * Seite 2 ein Viertel, der Rest durch Scrollen im Kasten. Die Höhe wird an
   * den gezeichneten Seiten gemessen, weil ihr Seitenverhältnis erst nach dem
   * Laden feststeht und am Handy anders ausfällt als am Desktop. Bis dahin
   * gilt der Rückfall aus `exposeLageGrundriss.css`.
   */
  const kasten = useRef<HTMLDivElement>(null);
  const [kastenHoehe, setKastenHoehe] = useState<number | null>(null);
  const [amEnde, setAmEnde] = useState(false);
  const messen = useCallback(() => {
    const zweite = kasten.current?.children[1] as HTMLElement | undefined;
    if (!zweite || zweite.offsetHeight <= 0) return;
    setKastenHoehe(Math.round(zweite.offsetTop + zweite.offsetHeight * ANGERISSEN));
  }, []);
  useLayoutEffect(() => {
    setKastenHoehe(null); setAmEnde(false);
    if (!mehrseitig) return;
    messen();
    const el = kasten.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // Lädt ein Bild nach oder ändert sich die Breite, ändert sich die Seitenhöhe.
    const beobachter = new ResizeObserver(messen);
    Array.from(el.children).slice(0, 2).forEach((kind) => beobachter.observe(kind));
    return () => beobachter.disconnect();
  }, [mehrseitig, images.length, messen]);
  // Am Ende angekommen fällt der Verlauf weg, sonst bliebe die letzte Seite verblasst.
  const beimScrollen = () => {
    const el = kasten.current;
    if (el) setAmEnde(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
  };

  const seitenListe = images.map((url, i) => <div className="floor" key={i}>
    <button type="button" aria-label={t.imVollbild(seitenAlt(i))} onClick={() => onZoom({ url, alt: seitenAlt(i) })}>
      <img src={url} alt={seitenAlt(i)} onLoad={mehrseitig && i < 2 ? messen : undefined} onError={d.istBild ? () => setBildFehler(true) : undefined} />
    </button>
    {mehrseitig && <p className="caption">{t.seite(i + 1)}</p>}
  </div>);
  return <figure className="plan-document" data-testid="grundriss-plan">
    <figcaption className="plan-kopf">
      <h3 className="subhead">{titel}</h3>
      {/* Ein Ersatzplan sagt, was er ist, damit niemand ihn für den Grundriss der Wohnung hält. */}
      {d.ersatz && <p className="plan-ersatz" data-testid="grundriss-ersatz"><b>{t.ersatzTitel[d.ersatz]}</b> {t.ersatzText[d.ersatz]}</p>}
      <div className="plan-aktionen screen-only">
        {images.length > 0 && <button type="button" className="btn" onClick={() => onZoom({ url: images[0], alt: seitenAlt(0) })} data-testid="grundriss-vollbild"><Maximize2 size={14} aria-hidden="true" /> {t.vollbild}</button>}
        <a className="btn" href={resolveImageUrl(d.url)} target="_blank" rel="noreferrer" data-testid="grundriss-original"><ExternalLink size={14} aria-hidden="true" /> {t.originalOeffnen}</a>
      </div>
    </figcaption>
    {mehrseitig ? <div
      ref={kasten}
      className="plan-seiten"
      role="region"
      tabIndex={0}
      aria-label={t.seitenRegion(titel, images.length)}
      data-ende={amEnde ? "true" : undefined}
      style={kastenHoehe ? { "--plan-seiten-hoehe": `${kastenHoehe}px` } as CSSProperties : undefined}
      onScroll={beimScrollen}
      data-testid="grundriss-seiten"
    >{seitenListe}</div> : seitenListe}
    {seitenGesamt > images.length && images.length > 0 && <p className="caption">{t.weitereSeiten(seitenGesamt - images.length)}</p>}
    {!images.length && <p className="caption">{fehler || bildFehler ? t.vorschauFehler : IST_PDF.test(d.url) ? t.grundrissLaedt : t.nichtAnzeigbar}</p>}
  </figure>;
}
