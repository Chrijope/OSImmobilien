/**
 * Client-seitiger PDF-Export für die Präsentationsseiten.
 *
 * Nimmt einen Root-Container, sucht alle `<section id="…">`, macht pro Section
 * einen html2canvas-Snapshot und legt ihn als eigene A4-Querformat-Seite ins PDF.
 * Fügt Kopf-/Fußzeile mit Logo, Copyright und Seitenzahl ein und hängt am Ende
 * eine Disclaimer- und eine Impressum-Seite an.
 */
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";
import { ohneLiquidGlasInKopie } from "@/lib/designSchalter";
import { loadLogo, BRAND, COMPANY_LINE, ensureUnicodeFont, PDF_FONT, sanitizePdfText } from "@/lib/pdfBranding";

export interface PraesentationPdfOptions {
  root: HTMLElement;
  title: string;
  subtitle?: string;
  filename?: string;
  /** Optionaler CSS-Selector für Sections (Default: `section[id]`). */
  sectionSelector?: string;
  /** Wartezeit pro Section, damit Animationen komplett durchlaufen (ms). Default 2600. */
  animationSettleMs?: number;
  /** Optional: nur diese Section-IDs exportieren (in dieser Reihenfolge). */
  sectionIds?: string[];
  /** Wenn true: PDF nicht sofort speichern, sondern als Blob + Dateiname zurückgeben. */
  returnBlob?: boolean;
  /**
   * Hinweis- und Impressumsseite am Ende. Standard an. Aus für Unterlagen,
   * die keine Kundenpräsentation sind, etwa die Folien des Bewerbergesprächs:
   * Der Hinweistext handelt von Immobilien-Kapitalanlagen und passt dort nicht.
   */
  hinweisSeiten?: boolean;
}

export interface PraesentationPdfResult {
  blob: Blob;
  filename: string;
}

// A4 Querformat in mm
const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN_X = 12;
const HEADER_H = 14;
const FOOTER_H = 12;
const CONTENT_TOP = HEADER_H + 4;
const CONTENT_BOTTOM = PAGE_H - FOOTER_H - 2;
const CONTENT_H = CONTENT_BOTTOM - CONTENT_TOP;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

function drawHeader(doc: jsPDF, logo: string | null, title: string) {
  // Logo links
  if (logo) {
    try {
      doc.addImage(logo, "PNG", MARGIN_X, 4, 30, 7.5);
    } catch {}
  }
  // Titel rechts
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.primary);
  doc.text(sanitizePdfText(title), PAGE_W - MARGIN_X, 8.5, { align: "right" });
  // Akzentlinie
  doc.setDrawColor(...BRAND.accent);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, HEADER_H, PAGE_W - MARGIN_X, HEADER_H);
  doc.setTextColor(0, 0, 0);
}

function drawFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  doc.setDrawColor(...BRAND.accent);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_X, PAGE_H - FOOTER_H, PAGE_W - MARGIN_X, PAGE_H - FOOTER_H);

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.muted);
  const year = new Date().getFullYear();
  doc.text(`© ${year} ${COMPANY_LINE}`, MARGIN_X, PAGE_H - 5);
  doc.text(`Seite ${pageNum} von ${totalPages}`, PAGE_W - MARGIN_X, PAGE_H - 5, { align: "right" });
  doc.setTextColor(0, 0, 0);
}

/**
 * Rendert ein DOM-Element als Bild und platziert es proportional in den
 * Content-Bereich der aktuellen PDF-Seite. Wenn das Bild höher als der
 * Content-Bereich ist, wird es auf mehrere Seiten aufgeteilt.
 */
async function renderSectionToPages(
  doc: jsPDF,
  el: HTMLElement,
  logo: string | null,
  title: string,
  isFirstPageOfDoc: boolean,
  addPageFn: () => void,
): Promise<number> {
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: Math.max(el.scrollWidth, 1200),
    // html2canvas kennt keine Weichzeichnung hinter Flaechen; mit Liquid Glass
    // malte es halbdurchsichtige Schleier ins PDF. Fotografiert wird deshalb
    // eine Kopie im vorigen Aussehen, die Seite selbst bleibt unberuehrt.
    onclone: (kopie) => ohneLiquidGlasInKopie(kopie),
  });

  // Immer genau EINE Seite pro Section: proportional so skalieren, dass
  // die Section vollständig in den Content-Bereich passt (keine Umbrüche).
  if (!isFirstPageOfDoc) addPageFn();
  drawHeader(doc, logo, title);

  const scaleW = CONTENT_W / canvas.width;
  const scaleH = CONTENT_H / canvas.height;
  const scale = Math.min(scaleW, scaleH);
  const renderW = canvas.width * scale;
  const renderH = canvas.height * scale;
  const offsetX = MARGIN_X + (CONTENT_W - renderW) / 2;
  const offsetY = CONTENT_TOP + (CONTENT_H - renderH) / 2;

  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  doc.addImage(dataUrl, "JPEG", offsetX, offsetY, renderW, renderH);
  return 1;
}

function drawDisclaimerPage(doc: jsPDF, logo: string | null, title: string) {
  drawHeader(doc, logo, title);
  let y = CONTENT_TOP + 6;
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BRAND.primary);
  doc.text("Wichtige Hinweise", MARGIN_X, y);
  y += 8;
  doc.setDrawColor(...BRAND.accent);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_X, y, MARGIN_X + 30, y);
  y += 8;

  const paragraphs: string[] = [
    "Diese Präsentation dient ausschließlich zu Informationszwecken und stellt weder ein Angebot noch eine Aufforderung zur Abgabe eines Angebots zum Kauf oder Verkauf von Immobilien, Wertpapieren oder Finanzinstrumenten dar. Sie ersetzt keine individuelle Anlage-, Steuer- oder Rechtsberatung.",
    "Alle Zahlen, Berechnungen und Prognosen basieren auf sorgfältig recherchierten Annahmen, öffentlich zugänglichen Quellen (u. a. Bundesbank, BBSR, Statistisches Bundesamt, IW Köln, KfW, dena, vdp) und typischen Marktparametern zum Zeitpunkt der Erstellung. Sie stellen keine Zusicherung künftiger Wertentwicklungen dar. Historische Renditen und Marktentwicklungen sind kein verlässlicher Indikator für zukünftige Ergebnisse.",
    "Mietprognosen, Wertentwicklungen und Cashflow-Berechnungen können durch Änderungen der Marktlage, Zinsen, gesetzlicher Rahmenbedingungen (u. a. Steuerrecht, Mietrecht, Energieeffizienzvorgaben), Leerstand, Instandhaltungsaufwand und individueller Kundensituation abweichen.",
    "Immobilien-Kapitalanlagen sind langfristige Investments und mit Risiken verbunden (u. a. Marktrisiko, Leerstandsrisiko, Zinsänderungsrisiko, Instandhaltungsrisiko, Liquiditätsrisiko, Klumpenrisiko). Ein Totalverlust des eingesetzten Eigenkapitals ist grundsätzlich möglich.",
    "Steuerliche Effekte (u. a. AfA, Werbungskosten, § 35a EStG) wurden vereinfacht dargestellt. Die tatsächliche steuerliche Behandlung hängt von der persönlichen Situation ab und ist ausschließlich durch einen Steuerberater zu prüfen.",
    "Für die Richtigkeit und Vollständigkeit der Angaben wird trotz sorgfältiger Prüfung keine Haftung übernommen. Verbindlich sind ausschließlich die im Einzelfall zur Verfügung gestellten Vertrags- und Objektunterlagen (Kaufvertrag, Teilungserklärung, Grundbuchauszug, Exposé, Finanzierungsangebot).",
    "Diese Präsentation ist urheberrechtlich geschützt. Weitergabe, Vervielfältigung oder Veröffentlichung – auch auszugsweise – nur mit ausdrücklicher schriftlicher Zustimmung der OS Immobilien.",
  ];

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 50);
  for (const p of paragraphs) {
    const lines = doc.splitTextToSize(sanitizePdfText(p), CONTENT_W);
    if (y + lines.length * 4.6 > CONTENT_BOTTOM - 4) break;
    doc.text(lines, MARGIN_X, y);
    y += lines.length * 4.6 + 3;
  }
  doc.setTextColor(0, 0, 0);
}

function drawImpressumPage(doc: jsPDF, logo: string | null, title: string) {
  drawHeader(doc, logo, title);
  let y = CONTENT_TOP + 6;
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BRAND.primary);
  doc.text("Impressum & Copyright", MARGIN_X, y);
  y += 8;
  doc.setDrawColor(...BRAND.accent);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_X, y, MARGIN_X + 30, y);
  y += 10;

  const year = new Date().getFullYear();
  const lines = [
    ["Herausgeber", "OS Immobilien"],
    ["Anschrift", "Am Ostbahnhof 1, 15749 Mittenwalde"],
    ["Kontakt", "os@os-immobilien.com · https://osimmobilien.netlify.app"],
    ["Copyright", `© ${year} OS Immobilien. Alle Rechte vorbehalten.`],
    ["Bildquellen", "OS Immobilien, Adobe Stock, Unsplash (lizenzfrei)"],
    ["Stand", new Date().toLocaleDateString("de-DE")],
  ];
  doc.setFontSize(10);
  for (const [k, v] of lines) {
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...BRAND.primary);
    doc.text(k, MARGIN_X, y);
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(50, 50, 50);
    doc.text(sanitizePdfText(v), MARGIN_X + 40, y);
    y += 7;
  }

  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.muted);
  const note =
    "Diese Präsentation und ihr Inhalt sind geistiges Eigentum der OS Immobilien. Jede Vervielfältigung, Weitergabe an Dritte, Veröffentlichung oder Nutzung – auch auszugsweise – ist ohne schriftliche Zustimmung untersagt. Verstöße können zivil- und strafrechtlich verfolgt werden.";
  const wrapped = doc.splitTextToSize(sanitizePdfText(note), CONTENT_W);
  doc.text(wrapped, MARGIN_X, y);
  doc.setTextColor(0, 0, 0);
}

/**
 * Rendert einen Cover-Slide (Titelseite) auf der aktuellen Seite.
 */
function drawCover(doc: jsPDF, logo: string | null, title: string, subtitle?: string) {
  // Farbiges Feld oben
  doc.setFillColor(...BRAND.accent);
  doc.rect(0, 0, PAGE_W, 6, "F");

  if (logo) {
    try { doc.addImage(logo, "PNG", PAGE_W / 2 - 30, 40, 60, 15); } catch {}
  }

  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(28);
  doc.setTextColor(...BRAND.primary);
  const wrapped = doc.splitTextToSize(sanitizePdfText(title), PAGE_W - 40);
  doc.text(wrapped, PAGE_W / 2, 95, { align: "center" });

  if (subtitle) {
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND.muted);
    const subWrap = doc.splitTextToSize(sanitizePdfText(subtitle), PAGE_W - 60);
    doc.text(subWrap, PAGE_W / 2, 115, { align: "center" });
  }

  // Divider
  doc.setDrawColor(...BRAND.accent);
  doc.setLineWidth(0.8);
  doc.line(PAGE_W / 2 - 20, 135, PAGE_W / 2 + 20, 135);

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.muted);
  doc.text("Präsentation", PAGE_W / 2, 145, { align: "center" });
  doc.text(new Date().toLocaleDateString("de-DE"), PAGE_W / 2, 152, { align: "center" });

  // Unten
  doc.setFontSize(8);
  doc.text(COMPANY_LINE, PAGE_W / 2, PAGE_H - 12, { align: "center" });
  doc.text("osimmobilien.netlify.app", PAGE_W / 2, PAGE_H - 7, { align: "center" });
  doc.setTextColor(0, 0, 0);
}

/**
 * Fügt allen animierten Elementen im Root eine Klasse hinzu, die
 * Animationen einfriert, damit html2canvas einen stabilen Snapshot bekommt.
 */
function freezeAnimations(root: HTMLElement): () => void {
  const style = document.createElement("style");
  style.setAttribute("data-pdf-freeze", "true");
  style.textContent = `
    [data-pdf-freezing] *, [data-pdf-freezing] {
      animation-play-state: paused !important;
      transition: none !important;
    }
    [data-pdf-freezing] .opacity-0 {
      opacity: 1 !important;
    }
    [data-pdf-freezing] .translate-y-6,
    [data-pdf-freezing] .translate-y-4,
    [data-pdf-freezing] .translate-y-2,
    [data-pdf-freezing] .-translate-y-1,
    [data-pdf-freezing] .-translate-y-2,
    [data-pdf-freezing] .-translate-y-3,
    [data-pdf-freezing] .-translate-y-4,
    [data-pdf-freezing] .lp-marquee-track {
      transform: none !important;
    }
  `;
  document.head.appendChild(style);
  root.setAttribute("data-pdf-freezing", "true");
  document.documentElement.setAttribute("data-pdf-freezing", "true");
  // Alle CountUp-Zahlen sofort auf Endwert setzen
  try { window.dispatchEvent(new Event("pdf:finalize-all")); } catch {}
  return () => {
    root.removeAttribute("data-pdf-freezing");
    document.documentElement.removeAttribute("data-pdf-freezing");
    style.remove();
  };
}

/**
 * Blendet alles aus, was nicht ins PDF gehört.
 *
 * Der Auslöser war konkret: Die Beratungspräsentation zeigt im Trainer-Modus
 * (`?trainer=1`) die internen Sprechskripte, und diese Karten liegen INNERHALB
 * der Section. Ohne diesen Filter landet das interne Verkaufsdrehbuch im PDF,
 * das anschliessend beim Kunden liegt. Betroffene Elemente tragen
 * `data-pdf-exclude`.
 */
function versteckeInterneElemente(root: HTMLElement): () => void {
  const elemente = Array.from(root.querySelectorAll<HTMLElement>("[data-pdf-exclude]"));
  const vorher = elemente.map((el) => el.style.display);
  elemente.forEach((el) => {
    el.style.display = "none";
  });
  return () => elemente.forEach((el, i) => {
    el.style.display = vorher[i];
  });
}

/**
 * Ersetzt Videos für die Dauer des Exports durch ihr Standbild.
 *
 * html2canvas kann `<video>` nicht zeichnen und liefert eine leere Fläche.
 * Der Hero der Beratungspräsentation ist seit dem Videotausch genau so ein
 * Fall und käme sonst als schwarzer Kasten ins PDF. Das Standbild steht
 * ohnehin schon im `poster`-Attribut.
 */
function ersetzeVideosDurchStandbild(root: HTMLElement): () => void {
  const videos = Array.from(root.querySelectorAll<HTMLVideoElement>("video"));
  const ersatz: { video: HTMLVideoElement; bild: HTMLImageElement | null; display: string }[] = [];

  for (const video of videos) {
    const poster = video.getAttribute("poster");
    const display = video.style.display;
    let bild: HTMLImageElement | null = null;
    if (poster) {
      bild = document.createElement("img");
      bild.src = poster;
      bild.alt = "";
      bild.className = video.className;
      bild.setAttribute("data-pdf-videoersatz", "true");
      video.parentElement?.insertBefore(bild, video);
    }
    video.style.display = "none";
    ersatz.push({ video, bild, display });
  }

  return () => ersatz.forEach(({ video, bild, display }) => {
    bild?.remove();
    video.style.display = display;
  });
}

/** Wartet bis alle <img> im Element vollständig geladen sind. */
async function waitForImages(el: HTMLElement) {
  const imgs = Array.from(el.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      try {
        if (!img.complete || img.naturalWidth === 0) {
          await new Promise<void>((res) => {
            const done = () => res();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
            setTimeout(done, 8000);
          });
        }
        if (typeof (img as any).decode === "function") {
          try { await (img as HTMLImageElement).decode(); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }),
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function exportPraesentationAsPdf(
  opts: PraesentationPdfOptions,
): Promise<PraesentationPdfResult | void> {
  const {
    root,
    title,
    subtitle,
    filename,
    sectionSelector = "section",
    animationSettleMs = 2600,
    sectionIds,
    hinweisSeiten = true,
  } = opts;

  let sections: HTMLElement[];
  if (sectionIds && sectionIds.length) {
    sections = sectionIds
      .map((id) => root.querySelector<HTMLElement>(`section#${CSS.escape(id)}`))
      .filter((el): el is HTMLElement => !!el);
  } else {
    sections = Array.from(root.querySelectorAll<HTMLElement>(sectionSelector));
  }
  if (sections.length === 0) throw new Error("Keine Sections für PDF-Export gefunden.");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  await ensureUnicodeFont(doc);
  const logo = await loadLogo();

  // Interne Elemente und Videos fuer die gesamte Dauer des Exports behandeln.
  // Beides muss VOR dem ersten Snapshot greifen und erst danach zurueck.
  const zeigeInterneWieder = versteckeInterneElemente(root);
  const stelleVideosWiederHer = ersetzeVideosDurchStandbild(root);

  try {

  // Warten bis Fonts / Bilder geladen sind
  if ((document as any).fonts?.ready) {
    try { await (document as any).fonts.ready; } catch {}
  }
  // Alle lazy-geladenen Bilder eager machen, damit sie beim Section-Snapshot
  // bereits geladen sind (auch wenn sie ausserhalb des initialen Viewports liegen).
  const lazyImgs = Array.from(root.querySelectorAll<HTMLImageElement>('img[loading="lazy"]'));
  for (const img of lazyImgs) {
    img.loading = "eager";
    // erzwinge Reload falls der Browser das Bild noch nicht gestartet hat
    if (!img.complete || img.naturalWidth === 0) {
      const src = img.src;
      if (src) { img.src = ""; img.src = src; }
    }
  }
  await waitForImages(root);

  // Cover
  drawCover(doc, logo, title, subtitle);

  // Für jeden Abschnitt: sichtbar machen, Animationen komplett laufen lassen,
  // dann kurz einfrieren und Snapshot machen. So sieht das PDF exakt so aus,
  // als hätte man in Ruhe Screenshots gemacht.
  for (const section of sections) {
    // 1) Section in den Viewport bringen, damit IntersectionObserver-Animationen starten
    section.scrollIntoView({ block: "start", behavior: "auto" });
    await sleep(120);

    // 2) Bilder in der Section abwarten
    await waitForImages(section);

    // 3) Animations-Dauer abwarten (pro Section überschreibbar via data-pdf-wait)
    const overrideMs = Number(section.dataset.pdfWait);
    const waitMs = Number.isFinite(overrideMs) && overrideMs > 0 ? overrideMs : animationSettleMs;
    await sleep(waitMs);

    // 4) CountUps final setzen und Frame flushen
    try { window.dispatchEvent(new Event("pdf:finalize-all")); } catch {}
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200)));

    // 5) Nur für die Snapshot-Zeit einfrieren, danach wieder freigeben
    const unfreeze = freezeAnimations(root);
    try {
      await renderSectionToPages(
        doc,
        section,
        logo,
        title,
        false,
        () => doc.addPage("a4", "landscape"),
      );
    } finally {
      unfreeze();
    }
  }

  if (hinweisSeiten) {
    // Disclaimer
    doc.addPage("a4", "landscape");
    drawDisclaimerPage(doc, logo, title);

    // Impressum
    doc.addPage("a4", "landscape");
    drawImpressumPage(doc, logo, title);
  }

  // Fußzeilen (Seitenzahlen) NACH allem einfügen — außer Cover
  const total = doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    doc.setPage(i);
    drawFooter(doc, i - 1, total - 1);
  }

  const safeTitle = title.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
  const date = new Date().toISOString().slice(0, 10);
  const finalName = filename || `OS-Immobilien_${safeTitle}_${date}.pdf`;
  if (opts.returnBlob) {
    return { blob: doc.output("blob"), filename: finalName };
  }
  doc.save(finalName);

  } finally {
    // Auch bei einem Fehler muss die Seite wieder in ihren Ausgangszustand,
    // sonst bleibt das Hero-Video versteckt oder ein Standbild liegen.
    stelleVideosWiederHer();
    zeigeInterneWieder();
  }
}