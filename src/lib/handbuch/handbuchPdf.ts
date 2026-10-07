/**
 * Das Handbuch als PDF im Hausdesign.
 *
 * Deckblatt, Kopf und Fuß kommen aus `pdfBranding.ts`, wie bei allen PDFs des
 * Hauses. Der Inhalt ist dieselbe Struktur, die auch die Online-Fassung zeigt
 * (`inhalt.ts`), Diagramme werden aus derselben Zeichenliste vektoriell mit
 * jsPDF gezeichnet (`diagramme.ts`).
 *
 * Satz in zwei Durchgängen: Der erste ermittelt, auf welcher Seite jedes
 * Kapitel beginnt, der zweite setzt das Inhaltsverzeichnis mit diesen
 * Seitenzahlen. Beide Durchgänge laufen im Browser in Sekundenbruchteilen.
 */
import jsPDF, { GState } from "jspdf";
import QRCode from "qrcode";
import {
  addBrandedFooter,
  addBrandedHeader,
  addCoverPage,
  BRAND,
  ensureUnicodeFont,
  loadIcon,
  loadLogo,
  PDF_FONT,
  sanitizePdfText,
} from "@/lib/pdfBranding";
import type { Block, Handbuch, KastenTon } from "./bausteine";
import { FESTE_FARBEN, type Zeichnung } from "./diagramme";

type RGB = [number, number, number];

const W = 210;
const H = 297;
const RAND_L = 20;
const RAND_R = 20;
const BREITE = W - RAND_L - RAND_R;
const OBEN_ERSTE = 32;
const UNTEN = H - 26;
const PT = 0.3528; // Millimeter je Punkt

const TEXT: RGB = BRAND.text;
const TEXT2: RGB = [74, 84, 98];
const MUTED: RGB = BRAND.muted;
const TINTE: RGB = BRAND.primary;
const AKZENT: RGB = BRAND.accent;
const FLAECHE: RGB = BRAND.light;
const LINIE: RGB = BRAND.separator;
const AKZENT_FLAECHE: RGB = [234, 243, 253];
const GRUEN: RGB = [27, 110, 55];
const ROT: RGB = [180, 35, 24];

const KASTEN: Record<KastenTon, { grund: RGB; balken: RGB; titel: RGB }> = {
  dich: { grund: AKZENT_FLAECHE, balken: AKZENT, titel: [19, 102, 71] },
  gut: { grund: [234, 246, 238], balken: GRUEN, titel: GRUEN },
  ok: { grund: [234, 246, 238], balken: GRUEN, titel: GRUEN },
  acht: { grund: [255, 246, 222], balken: [138, 90, 0], titel: [138, 90, 0] },
};

/*
 * Liquid Glass im PDF (Auftrag vom 26.09.2026). Echte Weichzeichnung kennt
 * jsPDF nicht, der Look wird nachgebildet:
 *
 *   - hinter jeder Inhaltsseite ein paar weiche Wolken in den Markenfarben,
 *     als übereinanderliegende Kreise mit sehr geringer Deckkraft. Kein
 *     dunkler Vollflächen-Grund, auf weißem Papier gedruckt bleibt alles hell;
 *   - Karten als abgerundete, halbtransparente weiße Flächen mit feiner
 *     heller Kante und zartem Schatten.
 *
 * Alles Vektor, der Text bleibt scharf und durchsuchbar, die Datei wächst
 * kaum. Die Bildschirm-Exporte anderer Seiten, die das Glas bewusst
 * ausschalten, sind davon nicht berührt.
 */
const WOLKEN: Array<{ x: number; y: number; r: number; farbe: RGB; deckkraft: number }> = [
  { x: 18, y: 40, r: 70, farbe: [24, 127, 88], deckkraft: 0.018 },
  { x: 196, y: 120, r: 80, farbe: [48, 225, 158], deckkraft: 0.05 },
  { x: 60, y: 262, r: 76, farbe: [48, 225, 158], deckkraft: 0.04 },
  { x: 176, y: 286, r: 46, farbe: [189, 85, 10], deckkraft: 0.018 },
];

function zeichneGlasGrund(doc: jsPDF) {
  for (const w of WOLKEN) {
    // Drei Ringe übereinander ergeben einen weichen Rand statt einer Kante.
    for (const f of [1, 0.72, 0.46]) {
      doc.setGState(new GState({ opacity: w.deckkraft }));
      doc.setFillColor(...w.farbe);
      doc.circle(w.x, w.y, w.r * f, "F");
    }
  }
  doc.setGState(new GState({ opacity: 1 }));
}

/** Eine Glaskarte: zarter Schatten, halbtransparentes Weiß, feine helle Kante. */
function glasKarte(doc: jsPDF, x: number, y: number, b: number, h: number, r = 2.6) {
  doc.setGState(new GState({ opacity: 0.06 }));
  doc.setFillColor(15, 46, 34);
  doc.roundedRect(x, y + 0.7, b, h, r, r, "F");
  doc.setGState(new GState({ opacity: 0.78 }));
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, b, h, r, r, "F");
  doc.setGState(new GState({ opacity: 1 }));
  doc.setDrawColor(221, 230, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, b, h, r, r, "S");
}

function hexZuRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Zeilenhöhe in mm für eine Schriftgröße in pt. */
const zeile = (pt: number, faktor = 1.42) => pt * PT * faktor;

/**
 * Kleinste Schrift im PDF. Das Handbuch wird oft am Handy gelesen, das A4
 * auf Bildschirmbreite verkleinert; darunter wird Text unlesbar.
 */
const MIN_PT = 8;

/** Grafiken werden mit 0,265 mm je Zeichenpunkt gesetzt, höchstens so breit wie die Spalte. */
const grafikBreite = (z: Zeichnung, breiteMm: number) => Math.min(breiteMm, z.breite * 0.265);

/** Die kleinste Beschriftung einer Grafik in pt, wenn sie in `breiteMm` steht. */
function grafikMinPt(z: Zeichnung, breiteMm: number): number {
  const groessen = z.formen.flatMap((f) => (f.art === "text" ? [f.groesse] : []));
  if (groessen.length === 0) return Infinity;
  return (Math.min(...groessen) * (grafikBreite(z, breiteMm) / z.breite)) / PT;
}

/** Zeichnet eine Zeichenliste an eine Stelle im PDF, auf die gegebene Breite skaliert. */
export function zeichneInsPdf(doc: jsPDF, z: Zeichnung, x: number, y: number, breiteMm: number): number {
  const s = breiteMm / z.breite;
  const farbe = (f: keyof typeof FESTE_FARBEN) => hexZuRgb(FESTE_FARBEN[f]);
  for (const f of z.formen) {
    switch (f.art) {
      case "rect": {
        if (f.deckkraft !== undefined) doc.setGState(new GState({ opacity: f.deckkraft }));
        doc.setFillColor(...farbe(f.farbe));
        const r = Math.min((f.r ?? 0) * s, (f.h * s) / 2, (f.b * s) / 2);
        if (r > 0) doc.roundedRect(x + f.x * s, y + f.y * s, Math.max(0.01, f.b * s), Math.max(0.01, f.h * s), r, r, "F");
        else doc.rect(x + f.x * s, y + f.y * s, Math.max(0.01, f.b * s), Math.max(0.01, f.h * s), "F");
        if (f.deckkraft !== undefined) doc.setGState(new GState({ opacity: 1 }));
        break;
      }
      case "linie":
        doc.setDrawColor(...farbe(f.farbe));
        doc.setLineWidth(Math.max(0.1, (f.breite ?? 1) * s));
        if (f.gestrichelt) doc.setLineDashPattern([5 * s, 4 * s], 0);
        doc.line(x + f.x1 * s, y + f.y1 * s, x + f.x2 * s, y + f.y2 * s);
        if (f.gestrichelt) doc.setLineDashPattern([], 0);
        break;
      case "pfad": {
        if (f.punkte.length < 2) break;
        const [x0, y0] = f.punkte[0];
        const schritte: Array<[number, number]> = [];
        for (let i = 1; i < f.punkte.length; i++) {
          schritte.push([(f.punkte[i][0] - f.punkte[i - 1][0]) * s, (f.punkte[i][1] - f.punkte[i - 1][1]) * s]);
        }
        if (f.gefuellt) {
          if (f.deckkraft !== undefined) doc.setGState(new GState({ opacity: f.deckkraft }));
          doc.setFillColor(...farbe(f.farbe));
          doc.lines(schritte, x + x0 * s, y + y0 * s, [1, 1], "F", true);
          if (f.deckkraft !== undefined) doc.setGState(new GState({ opacity: 1 }));
        } else {
          doc.setDrawColor(...farbe(f.farbe));
          doc.setLineWidth(Math.max(0.1, (f.breite ?? 2) * s));
          doc.setLineJoin("round");
          doc.setLineCap("round");
          if (f.gestrichelt) doc.setLineDashPattern([5 * s, 4 * s], 0);
          doc.lines(schritte, x + x0 * s, y + y0 * s, [1, 1], "S", false);
          if (f.gestrichelt) doc.setLineDashPattern([], 0);
          doc.setLineJoin("miter");
          doc.setLineCap("butt");
        }
        break;
      }
      case "kreis":
        doc.setFillColor(...farbe(f.farbe));
        if (f.rand) {
          doc.setDrawColor(...farbe(f.rand));
          doc.setLineWidth((f.randBreite ?? 1) * s);
          doc.circle(x + f.x * s, y + f.y * s, f.r * s, "FD");
        } else {
          doc.circle(x + f.x * s, y + f.y * s, f.r * s, "F");
        }
        break;
      case "text": {
        doc.setFont(PDF_FONT, f.fett ? "bold" : "normal");
        doc.setFontSize((f.groesse * s) / PT);
        doc.setTextColor(...farbe(f.farbe));
        const align = f.anker === "middle" ? "center" : f.anker === "end" ? "right" : "left";
        doc.text(sanitizePdfText(f.text), x + f.x * s, y + f.y * s, { align });
        break;
      }
    }
  }
  doc.setTextColor(0, 0, 0);
  return z.hoehe * s;
}

interface Kontext {
  doc: jsPDF;
  /** Englisch oder Deutsch, für die festen Wörter des Satzes. */
  en: boolean;
  logo: string | null;
  qr: Map<string, string>;
  seitenNummern: Map<string, number>;
}

class Setzer {
  y = OBEN_ERSTE;
  kapitel = "";
  constructor(private k: Kontext) {}

  get doc() {
    return this.k.doc;
  }

  neueSeite(kapitel: string) {
    this.doc.addPage();
    zeichneGlasGrund(this.doc);
    this.kapitel = kapitel;
    this.y = addBrandedHeader(this.doc, this.k.logo, `${this.k.en ? "Property handbook" : "Immobilienhandbuch"} · ${kapitel}`) - 4;
  }

  platz(hoehe: number) {
    if (this.y + hoehe > UNTEN && this.y > OBEN_ERSTE + 2) this.neueSeite(this.kapitel);
  }

  // ─── Text ────────────────────────────────────────────────────────────

  zeilen(text: string, pt: number, breite: number, fett = false): string[] {
    this.doc.setFont(PDF_FONT, fett ? "bold" : "normal");
    this.doc.setFontSize(pt);
    return this.doc.splitTextToSize(sanitizePdfText(text), breite) as string[];
  }

  text(
    text: string,
    x: number,
    y: number,
    breite: number,
    pt: number,
    farbe: RGB,
    opts: { fett?: boolean; zeichnen: boolean; faktor?: number },
  ): number {
    const zs = this.zeilen(text, pt, breite, opts.fett);
    const lh = zeile(pt, opts.faktor);
    if (opts.zeichnen) {
      this.doc.setTextColor(...farbe);
      zs.forEach((z, i) => this.doc.text(z, x, y + pt * PT + i * lh));
    }
    return zs.length * lh;
  }

  // ─── Blöcke ──────────────────────────────────────────────────────────

  /** Zeichnet (oder misst) einen Block ab `y`. Gibt die Höhe zurück. */
  block(b: Block, x: number, breite: number, y: number, zeichnen: boolean): number {
    const doc = this.doc;
    switch (b.typ) {
      case "lead":
        return this.text(b.text, x, y, breite, 11, TEXT2, { zeichnen });
      case "absatz":
        return this.text(b.text, x, y, breite, 9.4, TEXT, { zeichnen });
      case "fussnote":
        return this.text(b.text, x, y, breite, 8, MUTED, { zeichnen, faktor: 1.38 });
      case "h2":
        return 2 + this.text(b.text, x, y + 2, breite, 12, TINTE, { fett: true, zeichnen, faktor: 1.25 });
      case "liste": {
        let h = 0;
        for (const p of b.punkte) {
          if (zeichnen) {
            doc.setFillColor(...AKZENT);
            doc.circle(x + 1.2, y + h + 2.2, 0.7, "F");
          }
          h += this.text(p, x + 4.5, y + h, breite - 4.5, 9.4, TEXT, { zeichnen }) + 1;
        }
        return h;
      }
      case "karten": {
        const abstand = 3.4;
        const kb = (breite - abstand * (b.spalten - 1)) / b.spalten;
        const pad = 3.4;
        let h = 0;
        for (let i = 0; i < b.karten.length; i += b.spalten) {
          const reihe = b.karten.slice(i, i + b.spalten);
          const hoehen = reihe.map(
            (k) =>
              pad * 2 +
              this.text(k.titel, 0, 0, kb - pad * 2, 9.6, TINTE, { fett: true, zeichnen: false, faktor: 1.3 }) +
              1 +
              this.text(k.text, 0, 0, kb - pad * 2, 8.4, TEXT2, { zeichnen: false, faktor: 1.38 }),
          );
          const rh = Math.max(...hoehen);
          if (zeichnen) {
            reihe.forEach((k, j) => {
              const kx = x + j * (kb + abstand);
              glasKarte(doc, kx, y + h, kb, rh, 2.4);
              doc.setFillColor(...AKZENT);
              doc.roundedRect(kx + pad, y + h + pad - 0.4, 6, 0.9, 0.4, 0.4, "F");
              const th = this.text(k.titel, kx + pad, y + h + pad + 1.4, kb - pad * 2, 9.6, TINTE, { fett: true, zeichnen, faktor: 1.3 });
              this.text(k.text, kx + pad, y + h + pad + 2.4 + th, kb - pad * 2, 8.4, TEXT2, { zeichnen, faktor: 1.38 });
            });
          }
          h += rh + abstand;
        }
        return h - abstand + 1.4;
      }
      case "kasten": {
        const pad = 3.6;
        const ton = KASTEN[b.ton];
        const th = this.text(b.titel.toUpperCase(), 0, 0, breite - pad * 2 - 2, 7, ton.titel, { fett: true, zeichnen: false });
        const tx = this.text(b.text, 0, 0, breite - pad * 2 - 2, 9, TEXT, { zeichnen: false, faktor: 1.4 });
        const h = pad * 2 + th + 1.2 + tx;
        if (zeichnen) {
          doc.setFillColor(...ton.grund);
          doc.roundedRect(x, y, breite, h, 2.4, 2.4, "F");
          doc.setFillColor(...ton.balken);
          doc.rect(x, y + 2, 1.1, h - 4, "F");
          this.text(b.titel.toUpperCase(), x + pad + 2, y + pad, breite - pad * 2 - 2, 7, ton.titel, { fett: true, zeichnen });
          this.text(b.text, x + pad + 2, y + pad + th + 1.2, breite - pad * 2 - 2, 9, TEXT, { zeichnen, faktor: 1.4 });
        }
        return h;
      }
      case "grafik": {
        let h = 0;
        if (b.titel) h += this.text(b.titel, x, y + h, breite, 9.6, TINTE, { fett: true, zeichnen, faktor: 1.3 });
        if (b.untertitel) h += this.text(b.untertitel, x, y + h, breite, 8, MUTED, { zeichnen });
        if (h) h += 1.5;
        const gb = grafikBreite(b.zeichnung, breite);
        const gh = b.zeichnung.hoehe * (gb / b.zeichnung.breite);
        if (zeichnen) zeichneInsPdf(doc, b.zeichnung, x, y + h, gb);
        return h + gh;
      }
      case "tabelle":
        return this.tabelle(b, x, breite, y, zeichnen);
      case "weg": {
        const pf = 5;
        const bb = (breite - pf * (b.schritte.length - 1)) / b.schritte.length;
        const pad = 3.6;
        const hoehen = b.schritte.map((s) => pad * 2 + 10 + this.text(s.titel, 0, 0, bb - pad * 2, 10.4, TINTE, { fett: true, zeichnen: false }) + 1 + this.text(s.text, 0, 0, bb - pad * 2, 8.4, TEXT2, { zeichnen: false }));
        const h = Math.max(...hoehen);
        if (zeichnen) {
          const farben: RGB[] = [TINTE, [19, 102, 71], AKZENT];
          b.schritte.forEach((s, i) => {
            const bx = x + i * (bb + pf);
            glasKarte(doc, bx, y, bb, h, 2.6);
            doc.setFillColor(...farben[i % 3]);
            doc.roundedRect(bx + pad, y + pad, 8, 8, 2, 2, "F");
            doc.setFont(PDF_FONT, "bold");
            doc.setFontSize(11);
            doc.setTextColor(255, 255, 255);
            doc.text(String(i + 1), bx + pad + 4, y + pad + 5.6, { align: "center" });
            const th = this.text(s.titel, bx + pad, y + pad + 10, bb - pad * 2, 10.4, TINTE, { fett: true, zeichnen });
            this.text(s.text, bx + pad, y + pad + 11 + th, bb - pad * 2, 8.4, TEXT2, { zeichnen });
            if (i < b.schritte.length - 1) {
              doc.setDrawColor(...AKZENT);
              doc.setLineWidth(0.5);
              const mx = bx + bb + pf / 2;
              doc.line(mx - 1.4, y + h / 2, mx + 1.2, y + h / 2);
              doc.line(mx + 0.2, y + h / 2 - 1.1, mx + 1.2, y + h / 2);
              doc.line(mx + 0.2, y + h / 2 + 1.1, mx + 1.2, y + h / 2);
            }
          });
        }
        return h;
      }
      case "vergleich": {
        const ab = 5;
        const sb = (breite - ab) / 2;
        const pad = 3.6;
        const hoehe = (punkte: string[]) => pad * 2 + 5 + punkte.reduce((s, p) => s + this.text(p, 0, 0, sb - pad * 2 - 4, 8.8, TINTE, { zeichnen: false }) + 1.6, 0);
        const h = Math.max(hoehe(b.links.punkte), hoehe(b.rechts.punkte));
        if (zeichnen) {
          const spalte = (sx: number, titel: string, punkte: string[], grund: RGB, farbe: RGB) => {
            doc.setFillColor(...grund);
            doc.roundedRect(sx, y, sb, h, 2.6, 2.6, "F");
            this.text(titel.toUpperCase(), sx + pad, y + pad, sb, 7, farbe, { fett: true, zeichnen });
            let py = y + pad + 5;
            for (const p of punkte) {
              doc.setFillColor(...farbe);
              doc.circle(sx + pad + 1, py + 2.1, 0.8, "F");
              py += this.text(p, sx + pad + 4, py, sb - pad * 2 - 4, 8.8, TINTE, { zeichnen }) + 1.6;
            }
          };
          spalte(x, b.links.titel, b.links.punkte, [253, 239, 239], ROT);
          spalte(x + sb + ab, b.rechts.titel, b.rechts.punkte, [234, 246, 238], GRUEN);
        }
        return h;
      }
      case "prozess": {
        const n = b.schritte.length;
        const sb = breite / n;
        const hoehen = b.schritte.map((s) => 13 + this.text(s.titel, 0, 0, sb - 2, 8.2, TINTE, { fett: true, zeichnen: false, faktor: 1.25 }) + this.text(s.text, 0, 0, sb - 2, 8, TEXT2, { zeichnen: false, faktor: 1.3 }));
        const h = Math.max(...hoehen);
        if (zeichnen) {
          doc.setDrawColor(...AKZENT);
          doc.setLineWidth(0.8);
          doc.line(x + sb / 2, y + 5, x + breite - sb / 2, y + 5);
          b.schritte.forEach((s, i) => {
            const cx = x + i * sb + sb / 2;
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(...AKZENT);
            doc.setLineWidth(0.7);
            doc.circle(cx, y + 5, 4.6, "FD");
            doc.setFont(PDF_FONT, "bold");
            doc.setFontSize(9);
            doc.setTextColor(...AKZENT);
            doc.text(String(i + 1), cx, y + 6.3, { align: "center" });
            const zs = this.zeilen(s.titel, 8.2, sb - 2, true);
            doc.setTextColor(...TINTE);
            zs.forEach((z, zi) => doc.text(z, cx, y + 13 + zi * zeile(8.2, 1.25), { align: "center" }));
            const tz = this.zeilen(s.text, 8, sb - 2);
            doc.setFont(PDF_FONT, "normal");
            doc.setTextColor(...TEXT2);
            tz.forEach((z, zi) => doc.text(z, cx, y + 13 + zs.length * zeile(8.2, 1.25) + zi * zeile(8, 1.3), { align: "center" }));
          });
        }
        return h + 2;
      }
      case "trichter": {
        const farben: RGB[] = [TINTE, [20, 65, 48], [19, 102, 71], AKZENT, [44, 189, 134]];
        const zh = 8.6;
        const maxB = 96;
        if (zeichnen) {
          b.stufen.forEach((s, i) => {
            const bb = maxB - i * 13;
            const sy = y + i * (zh + 1.6);
            doc.setFillColor(...farben[i % farben.length]);
            doc.roundedRect(x, sy, bb, zh, 1.8, 1.8, "F");
            doc.setFont(PDF_FONT, "bold");
            doc.setFontSize(8.4);
            doc.setTextColor(255, 255, 255);
            doc.text(sanitizePdfText(s.titel), x + 3, sy + zh / 2 + 1.1);
            this.text(s.text, x + bb + 3, sy + 0.6, breite - bb - 3, 8, TEXT2, { zeichnen, faktor: 1.3 });
          });
        }
        return b.stufen.length * (zh + 1.6);
      }
      case "zeitstrahl": {
        const markeB = 36;
        const tx = x + 10 + markeB + 3;
        const tb = breite - (tx - x);
        // Auch ein zweizeiliger Titel links („Service charge statement“)
        // bestimmt die Höhe, sonst läuft er in den nächsten Eintrag.
        const hoehen = b.eintraege.map((e) =>
          Math.max(
            10,
            this.text(e.text, 0, 0, tb, 8.6, TEXT2, { zeichnen: false }) + 1.5,
            4 + this.text(e.titel, 0, 0, markeB, 9.6, TINTE, { fett: true, zeichnen: false, faktor: 1.2 }) + 1,
          ),
        );
        const h = hoehen.reduce((s, v) => s + v + 1.5, 0);
        if (zeichnen) {
          doc.setDrawColor(48, 225, 158);
          doc.setLineWidth(0.8);
          doc.line(x + 4.3, y + 3, x + 4.3, y + h - 6);
          let ey = y;
          b.eintraege.forEach((e, i) => {
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(...AKZENT);
            doc.setLineWidth(0.6);
            doc.circle(x + 4.3, ey + 4, 3.6, "FD");
            doc.setFillColor(...AKZENT);
            doc.circle(x + 4.3, ey + 4, 1.2, "F");
            this.text(e.marke.toUpperCase(), x + 10, ey + 0.6, markeB, 7, AKZENT, { fett: true, zeichnen });
            this.text(e.titel, x + 10, ey + 4, markeB, 9.6, TINTE, { fett: true, zeichnen, faktor: 1.2 });
            this.text(e.text, tx, ey + 0.8, tb, 8.6, TEXT2, { zeichnen });
            ey += hoehen[i] + 1.5;
          });
        }
        return h;
      }
      case "checkliste": {
        let h = this.text(b.titel, x, y, breite, 9.6, TINTE, { fett: true, zeichnen }) + 1.5;
        for (const p of b.punkte) {
          const text = p.optional ? `${p.text} (optional)` : p.text;
          const th = this.text(text, x + 6, y + h + 1.2, breite - 6, 8.8, TEXT, { zeichnen });
          if (zeichnen) {
            doc.setDrawColor(154, 165, 180);
            doc.setLineWidth(0.4);
            doc.roundedRect(x, y + h + 1.6, 3.6, 3.6, 0.8, 0.8, "S");
            doc.setDrawColor(...LINIE);
            doc.setLineWidth(0.2);
            doc.line(x, y + h + th + 2.6, x + breite, y + h + th + 2.6);
          }
          h += th + 2.8;
        }
        return h;
      }
      case "zahlen": {
        const ab = 3;
        const n = b.werte.length;
        const zb = (breite - ab * (n - 1)) / n;
        const hoehen = b.werte.map((w) => 3 + zeile(14, 1.1) + 1 + this.text(w.text, 0, 0, zb - 6, 8, MUTED, { zeichnen: false }) + 3);
        const h = Math.max(...hoehen);
        if (zeichnen) {
          b.werte.forEach((w, i) => {
            const zx = x + i * (zb + ab);
            glasKarte(doc, zx, y, zb, h, 2.4);
            this.text(w.wert, zx + 3, y + 3, zb - 6, 14, TINTE, { fett: true, zeichnen, faktor: 1.1 });
            this.text(w.text, zx + 3, y + 4 + zeile(14, 1.1), zb - 6, 8, MUTED, { zeichnen });
          });
        }
        return h;
      }
      case "angaben": {
        const pad = 3.4;
        const sb = (breite - pad * 2 - 5) / 2;
        const zh = 6.2;
        const titelH = zeile(9.6, 1.3) + 1.5;
        // Lange Werte („50.000 bis 80.000 €, gemeinsam veranlagt“) liefen in
        // die Beschriftung hinein. Sie brechen jetzt rechtsbündig um, die
        // Zeile wächst mit.
        const labelB = (l: string) => {
          doc.setFont(PDF_FONT, "normal");
          doc.setFontSize(8.2);
          return doc.getTextWidth(sanitizePdfText(l));
        };
        const wertZeilen = b.paare.map(([l, v]) => this.zeilen(v, 8.2, Math.max(20, sb - labelB(l) - 3), true));
        const lh = zeile(8.2, 1.25);
        const reihenHoehen: number[] = [];
        wertZeilen.forEach((zs, i) => {
          const r = Math.floor(i / 2);
          reihenHoehen[r] = Math.max(reihenHoehen[r] ?? zh, zh + (zs.length - 1) * lh);
        });
        const reihenH = reihenHoehen.reduce((s, v) => s + v, 0);
        const hinweisH = b.hinweis ? this.text(b.hinweis, 0, 0, breite - pad * 2, 8, MUTED, { zeichnen: false }) + 1.5 : 0;
        const h = pad * 2 + titelH + reihenH + hinweisH;
        if (zeichnen) {
          doc.setFillColor(...AKZENT_FLAECHE);
          doc.roundedRect(x, y, breite, h, 2.4, 2.4, "F");
          this.text(b.titel, x + pad, y + pad, breite, 9.6, TINTE, { fett: true, zeichnen });
          b.paare.forEach(([l], i) => {
            const r = Math.floor(i / 2);
            const sx = x + pad + (i % 2) * (sb + 5);
            const sy = y + pad + titelH + reihenHoehen.slice(0, r).reduce((s, v) => s + v, 0);
            doc.setFont(PDF_FONT, "normal");
            doc.setFontSize(8.2);
            doc.setTextColor(...MUTED);
            doc.text(sanitizePdfText(l), sx, sy + 3.6);
            doc.setFont(PDF_FONT, "bold");
            doc.setTextColor(...TINTE);
            wertZeilen[i].forEach((z, zi) => doc.text(z, sx + sb, sy + 3.6 + zi * lh, { align: "right" }));
            doc.setDrawColor(200, 214, 235);
            doc.setLineWidth(0.15);
            doc.line(sx, sy + reihenHoehen[r] - 0.8, sx + sb, sy + reihenHoehen[r] - 0.8);
          });
          if (b.hinweis) this.text(b.hinweis, x + pad, y + pad + titelH + reihenH + 1, breite - pad * 2, 8, MUTED, { zeichnen });
        }
        return h;
      }
      case "inhalt": {
        const zh = 6.4;
        if (zeichnen) {
          b.eintraege.forEach((e, i) => {
            const zy = y + i * zh;
            doc.setFont(PDF_FONT, "bold");
            doc.setFontSize(9.2);
            doc.setTextColor(...AKZENT);
            doc.text(e.nr, x, zy + 4.2);
            doc.setFont(PDF_FONT, "normal");
            doc.setTextColor(...TINTE);
            doc.text(sanitizePdfText(e.titel), x + 9, zy + 4.2);
            const nr = this.k.seitenNummern.get(e.seitenId);
            if (nr) {
              doc.setTextColor(...MUTED);
              doc.text(String(nr), x + breite, zy + 4.2, { align: "right" });
            }
            doc.setDrawColor(...LINIE);
            doc.setLineWidth(0.15);
            doc.line(x, zy + zh, x + breite, zy + zh);
          });
        }
        return b.eintraege.length * zh + 1;
      }
      case "portal": {
        const pad = 3.6;
        const zh = 7.4;
        const hinweisH = this.text(b.hinweis, 0, 0, breite - pad * 2, 8, MUTED, { zeichnen: false });
        const h = pad * 2 + zeile(9.6, 1.3) + 1 + b.zeilen.length * (zh + 1.4) + hinweisH;
        if (zeichnen) {
          glasKarte(doc, x, y, breite, h, 2.6);
          this.text(b.titel, x + pad, y + pad, breite, 9.6, TINTE, { fett: true, zeichnen });
          const toene: Record<"g" | "y" | "r", [RGB, RGB]> = {
            g: [[234, 246, 238], GRUEN],
            y: [[255, 246, 222], [138, 90, 0]],
            r: [[253, 239, 239], ROT],
          };
          b.zeilen.forEach((z, i) => {
            const zy = y + pad + zeile(9.6, 1.3) + 1 + i * (zh + 1.4);
            // Zeilen auf der Glaskarte leicht getönt, sonst Weiß auf Weiß.
            doc.setFillColor(...FLAECHE);
            doc.roundedRect(x + pad, zy, breite - pad * 2, zh, 1.6, 1.6, "F");
            doc.setFont(PDF_FONT, "normal");
            doc.setFontSize(8.8);
            doc.setTextColor(...TINTE);
            doc.text(sanitizePdfText(z.text), x + pad + 3, zy + zh / 2 + 1.2);
            const [grund, farbe] = toene[z.ton];
            doc.setFont(PDF_FONT, "bold");
            doc.setFontSize(7);
            const sb = doc.getTextWidth(z.status) + 5;
            doc.setFillColor(...grund);
            doc.roundedRect(x + breite - pad - 3 - sb, zy + 1.6, sb, zh - 3.2, 2, 2, "F");
            doc.setTextColor(...farbe);
            doc.text(sanitizePdfText(z.status), x + breite - pad - 3 - sb / 2, zy + zh / 2 + 1, { align: "center" });
          });
          this.text(b.hinweis, x + pad, y + h - pad - hinweisH, breite - pad * 2, 8, MUTED, { zeichnen });
        }
        return h;
      }
      case "naechsterSchritt": {
        const pad = 7;
        const qrB = 36;
        const tb = breite - pad * 2 - (b.link ? qrB + 6 : 0);
        const kopfH = zeile(7, 1.3) + 1;
        const titelH = this.text(b.titel, 0, 0, tb, 17, TINTE, { fett: true, zeichnen: false, faktor: 1.2 });
        const textH = this.text(b.text, 0, 0, tb, 10, TINTE, { zeichnen: false });
        const knopfH = 11;
        const unterH = b.link ? this.text(b.link, 0, 0, tb, 8, MUTED, { zeichnen: false }) : this.text(b.ersatz, 0, 0, tb, 8.6, MUTED, { zeichnen: false });
        const h = Math.max(pad * 2 + kopfH + titelH + 2 + textH + 3 + knopfH + 3 + unterH, b.link ? qrB + pad * 2 : 0);
        if (zeichnen) {
          doc.setFillColor(...TINTE);
          doc.roundedRect(x, y, breite, h, 4, 4, "F");
          let cy = y + pad;
          this.text(`${this.k.en ? "FOR" : "FÜR"} ${b.fuer.toUpperCase()}`, x + pad, cy, tb, 7, [48, 225, 158], { fett: true, zeichnen });
          cy += kopfH;
          cy += this.text(b.titel, x + pad, cy, tb, 17, [255, 255, 255], { fett: true, zeichnen, faktor: 1.2 }) + 2;
          cy += this.text(b.text, x + pad, cy, tb, 10, [212, 220, 232], { zeichnen }) + 3;
          if (b.link) {
            doc.setFont(PDF_FONT, "bold");
            doc.setFontSize(11);
            const kb = doc.getTextWidth(b.knopf) + 14;
            doc.setFillColor(189, 85, 10); // Marken-Orange wie auf der Seite (#BD550A)
            doc.roundedRect(x + pad, cy, kb, knopfH, 2.6, 2.6, "F");
            doc.setTextColor(255, 255, 255);
            doc.text(sanitizePdfText(b.knopf), x + pad + kb / 2, cy + knopfH / 2 + 1.4, { align: "center" });
            doc.link(x + pad, cy, kb, knopfH, { url: b.link });
            cy += knopfH + 3;
            doc.setFont(PDF_FONT, "normal");
            doc.setFontSize(8);
            doc.setTextColor(143, 160, 182);
            const lz = this.zeilen(b.link, 8, tb);
            lz.forEach((z, i) => doc.text(z, x + pad, cy + 2.9 + i * zeile(8)));
            doc.link(x + pad, cy, tb, lz.length * zeile(8) + 1, { url: b.link });
            const qr = this.k.qr.get(b.link);
            if (qr) {
              const qx = x + breite - pad - qrB;
              const qy = y + (h - qrB) / 2;
              doc.setFillColor(255, 255, 255);
              doc.roundedRect(qx, qy, qrB, qrB, 2.4, 2.4, "F");
              doc.addImage(qr, "PNG", qx + 2, qy + 2, qrB - 4, qrB - 4, undefined, "FAST");
              doc.link(qx, qy, qrB, qrB, { url: b.link });
            }
          } else {
            this.text(b.ersatz, x + pad, cy, tb, 8.6, [212, 220, 232], { zeichnen });
          }
        }
        return h;
      }
      case "zweispaltig": {
        const ab = 6;
        const sb = (breite - ab) / 2;
        // Eine Grafik in der halben Spalte schrumpft ihre Beschriftung unter
        // 8 pt (das Ringdiagramm der Nebenkosten auf rund 6 pt), am Handy
        // nicht mehr lesbar. Dann stehen beide Spalten untereinander.
        const alle = [...b.links, ...b.rechts];
        if (alle.some((bl) => bl.typ === "grafik" && grafikMinPt(bl.zeichnung, sb) < MIN_PT)) {
          let h = 0;
          alle.forEach((bl, i) => {
            h += this.block(bl, x, breite, y + h, zeichnen) + (i < alle.length - 1 ? 3 : 0);
          });
          return h;
        }
        const spalte = (bloecke: Block[], sx: number) => {
          let h = 0;
          bloecke.forEach((bl, i) => {
            h += this.block(bl, sx, sb, y + h, zeichnen) + (i < bloecke.length - 1 ? 3 : 0);
          });
          return h;
        };
        return Math.max(spalte(b.links, x), spalte(b.rechts, x + sb + ab));
      }
    }
  }

  tabelle(b: Extract<Block, { typ: "tabelle" }>, x: number, breite: number, y: number, zeichnen: boolean): number {
    const doc = this.doc;
    const spalten = b.kopf?.length ?? b.zeilen[0]?.zellen.length ?? 1;
    // Erste Spalte breit, die übrigen teilen sich den Rest. Bei zwei Spalten
    // ist die zweite ein Betrag und bekommt nur, was sie braucht.
    const breiten: number[] =
      spalten === 2 && b.rechtsAb === 1
        ? [breite - 32, 32]
        : spalten === 2
          ? [breite * 0.3, breite * 0.7]
          : spalten === 3
            ? [breite * 0.24, breite * 0.4, breite * 0.36]
            : [breite * 0.3, ...Array(spalten - 1).fill((breite * 0.7) / (spalten - 1))];
    const pad = 1.8;
    const pt = 8.4;
    let h = 0;
    if (b.titel) h += this.text(b.titel, x, y, breite, 9.6, TINTE, { fett: true, zeichnen, faktor: 1.3 }) + 1;
    const rechts = (i: number) => b.rechtsAb !== undefined && i >= b.rechtsAb;
    const zelleX = (i: number) => x + breiten.slice(0, i).reduce((s, v) => s + v, 0);
    if (b.kopf) {
      // Köpfe brechen in ihrer Spalte um; einzeilig liefen lange Köpfe
      // („mit Notar und Grundbuch“) in die Nachbarspalte.
      const kopfZeilen = b.kopf.map((k, i) => this.zeilen(k.toUpperCase(), 7, breiten[i] - pad * 2, true));
      const kl = zeile(7, 1.2);
      const kh = Math.max(6.4, Math.max(...kopfZeilen.map((z) => z.length)) * kl + 3);
      if (zeichnen) {
        doc.setFillColor(...FLAECHE);
        doc.rect(x, y + h, breite, kh, "F");
        doc.setDrawColor(...TINTE);
        doc.setLineWidth(0.3);
        doc.line(x, y + h + kh, x + breite, y + h + kh);
        doc.setFont(PDF_FONT, "bold");
        doc.setFontSize(7);
        doc.setTextColor(...TINTE);
        kopfZeilen.forEach((zs, i) => {
          const tx = rechts(i) ? zelleX(i) + breiten[i] - pad : zelleX(i) + pad;
          // Einzeilig wie bisher mittig, mehrzeilig ab oben.
          const oben = y + h + (kh - zs.length * kl) / 2 + 7 * PT * 0.9;
          zs.forEach((z, zi) => doc.text(z, tx, oben + zi * kl, { align: rechts(i) ? "right" : "left" }));
        });
      }
      h += kh;
    }
    for (const z of b.zeilen) {
      const fett = !!z.summe || !!z.hervor;
      const zs = z.zellen.map((c, i) => this.zeilen(c, pt, breiten[i] - pad * 2, fett || (i === 0 && spalten === 3 && !!b.kopf)));
      const zh = Math.max(...zs.map((l) => l.length)) * zeile(pt, 1.32) + pad * 2;
      if (zeichnen) {
        if (z.hervor) {
          doc.setFillColor(...AKZENT_FLAECHE);
          doc.rect(x, y + h, breite, zh, "F");
        }
        if (z.summe) {
          doc.setDrawColor(...TINTE);
          doc.setLineWidth(0.3);
          doc.line(x, y + h, x + breite, y + h);
        }
        zs.forEach((lines, i) => {
          const ton = z.toene?.[i];
          doc.setTextColor(...(ton === "plus" ? GRUEN : ton === "minus" ? ROT : fett ? TINTE : TEXT));
          doc.setFont(PDF_FONT, fett || (i === 0 && spalten === 3 && !!b.kopf) ? "bold" : "normal");
          doc.setFontSize(pt);
          lines.forEach((l, li) => {
            const ly = y + h + pad + pt * PT + li * zeile(pt, 1.32);
            if (rechts(i)) doc.text(l, zelleX(i) + breiten[i] - pad, ly, { align: "right" });
            else doc.text(l, zelleX(i) + pad, ly);
          });
        });
        if (!z.summe) {
          doc.setDrawColor(...LINIE);
          doc.setLineWidth(0.15);
          doc.line(x, y + h + zh, x + breite, y + h + zh);
        }
      }
      h += zh;
    }
    return h + 1;
  }

  // ─── Seiten ──────────────────────────────────────────────────────────

  setzeSeite(seite: Handbuch["seiten"][number]) {
    this.neueSeite(seite.kapitel);
    this.k.seitenNummern.set(seite.id, this.doc.getNumberOfPages());
    const doc = this.doc;
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(7);
    doc.setTextColor(...AKZENT);
    doc.text(sanitizePdfText(seite.kapitel.toUpperCase()), RAND_L, this.y + 2.5, { charSpace: 1.2 });
    this.y += 5;
    this.y += this.text(seite.titel, RAND_L, this.y, BREITE, 20, TINTE, { fett: true, zeichnen: true, faktor: 1.15 }) + 4;
    for (const b of seite.bloecke) {
      const h = this.block(b, RAND_L, BREITE, this.y, false);
      this.platz(Math.min(h, UNTEN - OBEN_ERSTE - 4));
      this.block(b, RAND_L, BREITE, this.y, true);
      this.y += h + (b.typ === "h2" ? 1.5 : 3.6);
    }
  }
}

async function qrFuer(links: string[]): Promise<Map<string, string>> {
  const karte = new Map<string, string>();
  for (const link of links) {
    try {
      karte.set(link, await QRCode.toDataURL(link, { margin: 1, width: 320, errorCorrectionLevel: "M" }));
    } catch {
      // Ohne QR-Code bleibt der Link, das PDF entsteht trotzdem.
    }
  }
  return karte;
}

function sammleLinks(handbuch: Handbuch): string[] {
  const links: string[] = [];
  const durch = (bloecke: Block[]) =>
    bloecke.forEach((b) => {
      if (b.typ === "naechsterSchritt" && b.link) links.push(b.link);
      if (b.typ === "zweispaltig") {
        durch(b.links);
        durch(b.rechts);
      }
    });
  handbuch.seiten.forEach((s) => durch(s.bloecke));
  return links;
}

async function setze(handbuch: Handbuch, seitenNummern: Map<string, number>, qr: Map<string, string>, logo: string | null, icon: string | null): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  await ensureUnicodeFont(doc);
  const en = handbuch.sprache === "en";
  addCoverPage(doc, icon, {
    kennung: en ? "Investing in rented flats" : "Kapitalanlage mit vermieteten Wohnungen",
    titel: handbuch.titel,
    untertitel: handbuch.untertitel,
    empfaenger: handbuch.erstelltFuer,
    datum: handbuch.datum,
    fusszeile: en
      ? "Model calculations with disclosed assumptions, not a commitment. OS Immobilien Holding GmbH, Am Ostbahnhof 1, 15749 Mittenwalde, Germany"
      : "Modellrechnungen mit offengelegten Annahmen, keine Zusage. OS Immobilien Holding GmbH, Am Ostbahnhof 1, 15749 Mittenwalde",
    sprache: handbuch.sprache,
  });
  const setzer = new Setzer({ doc, en, logo, qr, seitenNummern });
  for (const seite of handbuch.seiten) setzer.setzeSeite(seite);
  const gesamt = doc.getNumberOfPages();
  for (let i = 2; i <= gesamt; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i, gesamt);
  }
  doc.setProperties({
    title: `${handbuch.titel} ${en ? "for" : "für"} ${handbuch.erstelltFuer}`,
    author: "OS Immobilien",
    subject: en ? "Model calculations, not a commitment" : "Modellrechnungen, keine Zusage",
  });
  return doc;
}

/** Erzeugt das PDF. Zwei Durchgänge, damit das Inhaltsverzeichnis Seitenzahlen hat. */
export async function erzeugeHandbuchPdf(handbuch: Handbuch): Promise<jsPDF> {
  const [logo, icon, qr] = await Promise.all([loadLogo(), loadIcon(), qrFuer(sammleLinks(handbuch))]);
  const nummern = new Map<string, number>();
  await setze(handbuch, nummern, qr, logo, icon);
  return setze(handbuch, nummern, qr, logo, icon);
}

/** Der Dateiname, etwa „OS-Immobilien_Immobilienhandbuch_Erika_Muster.pdf“, englisch „OS-Immobilien_Property_Handbook_…“. */
export function handbuchDateiname(name: string, sprache: "de" | "en" = "de"): string {
  const sauber = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `OS-Immobilien_${sprache === "en" ? "Property_Handbook" : "Immobilienhandbuch"}${sauber ? `_${sauber}` : ""}.pdf`;
}

export async function ladeHandbuchPdfHerunter(handbuch: Handbuch): Promise<void> {
  const doc = await erzeugeHandbuchPdf(handbuch);
  await gibPdfAus(doc.output("blob"), handbuchDateiname(handbuch.erstelltFuer, handbuch.sprache));
}

/**
 * Die eingebauten Browser von Instagram, Facebook, TikTok und LinkedIn
 * (Anzeigen führen dorthin) laden eine Datei über einen Download-Link oft
 * gar nicht, ohne Fehlermeldung. Erkennbar nur an der Kennung des Browsers.
 */
const IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|Instagram|BytedanceWebview|musical_ly|LinkedInApp/i;

/**
 * Gibt das fertige PDF aus. Normal als Download über einen Link mit
 * `download`, das klappt in Safari auf dem iPhone und in Chrome auf Android
 * auch nach dem Rechnen und öffnet kein Fenster, das ein Popup-Blocker
 * schlucken könnte. In einem In-App-Browser zuerst das Teilen-Menü des
 * Geräts („In Dateien sichern“); lehnt der Browser das ab, etwa weil seit dem
 * Klick zu viel Zeit vergangen ist, doch der Download.
 */
export async function gibPdfAus(blob: Blob, dateiname: string): Promise<"geteilt" | "abgebrochen" | "geladen"> {
  if (IN_APP_BROWSER.test(navigator.userAgent ?? "")) {
    const datei = new File([blob], dateiname, { type: "application/pdf" });
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [datei] })) {
      try {
        await navigator.share({ files: [datei], title: dateiname });
        return "geteilt";
      } catch (e) {
        // Selbst geschlossen: kein Fehler, kein zweiter Weg hinterher.
        if ((e as { name?: string } | null)?.name === "AbortError") return "abgebrochen";
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  a.rel = "noopener";
  // Im Dokument, sonst ignorieren manche Browser den Klick.
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari liest die Datei erst nach dem Klick; zu frühes Freigeben bricht ab.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "geladen";
}

/** Nur für die Prüfung im Test: Farben der Hausfarbwelt als RGB. */
export const _intern = { hexZuRgb, zeile };
export type { RGB };
