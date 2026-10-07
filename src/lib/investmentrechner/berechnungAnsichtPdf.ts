/** Download der sichtbaren Berechnungsseiten, das gewählte Deckblatt vorn. */
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";
import { ohneLiquidGlasInKopie } from "@/lib/designSchalter";
import type { FormatSprache } from "@/lib/sprachFormat";
import { berechnungPdfDateiname, type BerechnungPdfObjekt } from "./berechnungPdf";

const A4_BREITE = 210;
const A4_HOEHE = 297;

/**
 * Liest die Regeln aller verlinkten Stildateien, die der Browser schon geladen hat.
 * Hintergrund: html2canvas baut eine Kopie der Seite in einem unsichtbaren Rahmen.
 * Verlinkte Stildateien lädt der Rahmen dort neu; beim ersten Download war das oft
 * noch nicht fertig, und die Seiten wurden ohne Gestaltung fotografiert.
 */
export function geladeneStildateien(quelle: Document = document): Map<string, string> {
  const stile = new Map<string, string>();
  for (const blatt of Array.from(quelle.styleSheets)) {
    if (!(blatt.ownerNode instanceof HTMLLinkElement) || !blatt.href) continue;
    try {
      const basis = blatt.href;
      const regeln = Array.from(blatt.cssRules)
        .map((regel) => regel.cssText)
        .join("\n")
        // Relative Pfade (Schriften, Bilder) bleiben auf die Stildatei bezogen.
        .replace(/url\((["']?)(?!data:|https?:|blob:|#)([^"')]+)\1\)/g, (_, q: string, pfad: string) => `url(${q}${new URL(pfad, basis).href}${q})`);
      const medien = blatt.media?.mediaText;
      stile.set(blatt.href, medien ? `@media ${medien} {\n${regeln}\n}` : regeln);
    } catch {
      // Fremde Stildatei (etwa Schriften eines anderen Servers): bleibt verlinkt.
    }
  }
  return stile;
}

/** Ersetzt in der Kopie jede verlinkte Stildatei an gleicher Stelle durch ihre Regeln. */
export function stileInKopieEinbetten(kopie: Document, stile: Map<string, string>): void {
  kopie.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]').forEach((link) => {
    const css = stile.get(link.href);
    if (css === undefined) return;
    const style = kopie.createElement("style");
    style.setAttribute("data-export-stil", link.href);
    style.textContent = css;
    link.replaceWith(style);
  });
}

/**
 * Die Druckfassung benutzt dieselbe React-Komponente und dieselben Seiten wie die Vorschau.
 *
 * Bis zum 07.10.2026 stand davor ein zusätzliches, mit jsPDF gezeichnetes
 * CI-Deckblatt. Seitdem ist die erste fotografierte Seite selbst das
 * Deckblatt, in der Variante, die der Berater gewählt hat (Deckblatt.tsx).
 */
export async function erzeugeBerechnungsansichtPdf(druckdokument: HTMLElement): Promise<jsPDF> {
  const seiten = Array.from(druckdokument.querySelectorAll<HTMLElement>(".expose-page"));
  if (!seiten.length) throw new Error("Die Berechnungsseiten sind nicht verfügbar");

  druckdokument.classList.add("investmentrechner-export");
  try {
    await document.fonts.ready;
    await Promise.all(Array.from(druckdokument.querySelectorAll("img")).map((bild) => bild.decode().catch(() => undefined)));

    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    const stile = geladeneStildateien();
    for (const [index, seite] of seiten.entries()) {
      const bild = await html2canvas(seite, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: Math.max(window.innerWidth, 1280),
        onclone: (kopie) => {
          stileInKopieEinbetten(kopie, stile);
          ohneLiquidGlasInKopie(kopie);
        },
      });
      if (index > 0) doc.addPage();
      doc.addImage(bild.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, A4_BREITE, A4_HOEHE);
      bild.width = 0;
      bild.height = 0;
    }
    return doc;
  } finally {
    druckdokument.classList.remove("investmentrechner-export");
  }
}

export async function ladeBerechnungsansichtHerunter(
  objekte: BerechnungPdfObjekt[],
  sprache: FormatSprache = "de",
  druckdokument: HTMLElement,
): Promise<string> {
  if (!objekte.length) throw new Error("Keine Berechnung zum Herunterladen");
  const doc = await erzeugeBerechnungsansichtPdf(druckdokument);
  const name = berechnungPdfDateiname(objekte, sprache);
  doc.save(name);
  return name;
}