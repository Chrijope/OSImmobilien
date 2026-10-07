import type { ExposeInhalt } from "../exposeInhalt";
import { resolveImageUrl } from "../objekteImages";
import { umgebungFuerKunden, kartenPunkte, type Umgebung } from "../umgebungspunkte";
import type { DruckBild, DruckBilder } from "./daten";

/**
 * Höchstens so viele Fotos kommen ins PDF. Seit dem 05.10.2026 stehen unter
 * „Einblicke“ alle Bilder wie in der Galerie online; die Grenze schützt nur
 * vor einem PDF, das bei einem Ausreißer mit hunderten Fotos platzt.
 */
export const FOTOS_IM_DRUCK = 40;
/** Die ersten drei Fotos stehen groß (Deckblatt, Objektseite), die übrigen nur im Raster der Einblicke. */
const GROSSE_FOTOS = 3;
/** Kante für Fotos im Raster: halbe Seitenbreite reicht mit etwa 1200 Pixeln für 300 dpi. */
const RASTER_KANTE = 1200;
export const LOGO_ADRESSE = "/images/moreimmo-logo.png";
const IST_PDF_PLAN = /\.pdf(?:[?#]|$)/i;

/** Wie ein Bild geladen wird. Im Browser `browserLader`, für die Muster ein Lader in Node. */
export interface BildLader {
  /** Foto oder Plan als Bild, auf `maxKante` Pixel verkleinert. Jeder Fehler ergibt `null`. */
  bild(url: string, maxKante: number, alsPng?: boolean): Promise<DruckBild | null>;
  /** Erste Seite eines PDF-Plans als Bild. */
  pdfSeite(url: string): Promise<DruckBild | null>;
  /** Kartenbild der Umgebung mit Punkten und Namensnennung. */
  karte(umgebung: Umgebung): Promise<DruckBild | null>;
  /** Das Logo ohne transparenten Rand, mit `hell` die Schrift weiß für dunkle Flächen. */
  logo(hell: boolean): Promise<DruckBild | null>;
}

/** Was ein Canvas-Kontext dafür können muss, im Browser wie in Node (`@napi-rs/canvas`). */
interface PixelKontext {
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray; width: number; height: number };
  putImageData(d: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number): void;
}

/**
 * Logo aufbereiten: den durchsichtigen Rand finden und, wenn `hell`, die
 * dunkle Schrift weiß färben. Die blaue Bildmarke bleibt, wie sie ist.
 * Gibt den Ausschnitt mit Inhalt zurück.
 */
export function logoPixel(ctx: PixelKontext, breite: number, hoehe: number, hell: boolean): { x: number; y: number; w: number; h: number } {
  const bild = ctx.getImageData(0, 0, breite, hoehe);
  const d = bild.data;
  let x0 = breite, y0 = hoehe, x1 = 0, y1 = 0;
  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) {
      const i = (y * breite + x) * 4;
      if (d[i + 3] < 8) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      // Dunkel und ungesättigt ist die Schrift, nicht das Blau der Bildmarke.
      if (hell && Math.max(d[i], d[i + 1], d[i + 2]) < 90) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; }
    }
  }
  if (hell) ctx.putImageData(bild, 0, 0);
  return x1 >= x0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { x: 0, y: 0, w: breite, h: hoehe };
}

/**
 * Die Fotos in Druckreihenfolge: vorn das am Objekt gesetzte Titelbild
 * („Titelbild setzen“ in der Galerie, gespeichert als `objekte.bild_url`;
 * `baueExposeInhalt` führt es mit der Kennung „titelbild“), danach die übrigen
 * in der Reihenfolge der Seite. Ohne Titelbild steht das erste Foto vorn.
 */
export function druckFotos<T extends { id?: string; url: string }>(bilder: T[]): T[] {
  const mitAdresse = bilder.filter((b) => b.url);
  const titel = mitAdresse.find((b) => b.id === "titelbild");
  return titel ? [titel, ...mitAdresse.filter((b) => b !== titel)] : mitAdresse;
}

/**
 * Alle Bilder des Exposés vorab laden, damit das PDF danach in einem Zug
 * entsteht. Die großen Fotos mit 2400 Pixeln (etwa 300 dpi auf 20 cm), die
 * im Raster mit 1200, damit das PDF bei vielen Bildern klein bleibt. Pläne
 * als PNG, damit Linien scharf bleiben.
 */
export async function ladeDruckBilder(inhalt: ExposeInhalt, lader: BildLader): Promise<DruckBilder> {
  const fotosRoh = druckFotos(inhalt.start.bilder).slice(0, FOTOS_IM_DRUCK);
  const umgebung = umgebungFuerKunden(inhalt.mikrolage.umgebung);
  const [fotos, karte, logo, logoHell, person] = await Promise.all([
    Promise.all(fotosRoh.map((b, i) => lader.bild(b.url, i < GROSSE_FOTOS ? 2400 : RASTER_KANTE))),
    umgebung && kartenPunkte(umgebung).length > 0 ? lader.karte(umgebung) : Promise.resolve(null),
    lader.logo(false),
    lader.logo(true),
    inhalt.kontakt.vertrieb?.avatarUrl ? lader.bild(inhalt.kontakt.vertrieb.avatarUrl, 400) : Promise.resolve(null),
  ]);
  // Pläne nacheinander: pdf.js zeichnet sonst mehrere Seiten gleichzeitig in den Speicher.
  const plaene: Array<DruckBild | null> = [];
  for (const d of inhalt.grundriss.dokumente.slice(0, 12)) {
    plaene.push(d.istBild ? await lader.bild(d.url, 2400, true) : IST_PDF_PLAN.test(d.url) ? await lader.pdfSeite(d.url) : null);
  }
  return { fotos: fotos.filter((f): f is DruckBild => f !== null), plaene, karte, logo, logoHell, person };
}

/* ── Browser ─────────────────────────────────────────────────────────── */

function blobAlsDataUrl(blob: Blob): Promise<string> {
  return new Promise((fertig, fehler) => {
    const leser = new FileReader();
    leser.onloadend = () => fertig(String(leser.result || ""));
    leser.onerror = () => fehler(new Error("Bild nicht lesbar"));
    leser.readAsDataURL(blob);
  });
}

/** Über ein Canvas verkleinern und neu kodieren; react-pdf kennt nur JPEG und PNG. */
function neuKodieren(daten: string, maxKante: number, alsPng: boolean): Promise<DruckBild | null> {
  return new Promise((fertig) => {
    const img = new Image();
    img.onload = () => {
      try {
        const faktor = Math.min(1, maxKante / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * faktor));
        c.height = Math.max(1, Math.round(img.naturalHeight * faktor));
        const ctx = c.getContext("2d");
        if (!ctx) { fertig(null); return; }
        if (!alsPng) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        fertig({ src: alsPng ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.88), breite: c.width, hoehe: c.height });
      } catch {
        fertig(null);
      }
    };
    img.onerror = () => fertig(null);
    img.src = daten;
  });
}

export const browserLader: BildLader = {
  async bild(url, maxKante, alsPng = false) {
    try {
      const antwort = await fetch(resolveImageUrl(url));
      if (!antwort.ok) return null;
      return await neuKodieren(await blobAlsDataUrl(await antwort.blob()), maxKante, alsPng);
    } catch {
      return null;
    }
  },
  async pdfSeite(url) {
    try {
      const antwort = await fetch(resolveImageUrl(url));
      if (!antwort.ok) return null;
      const { erzeugePdfVorschau } = await import("../pdfVorschau");
      const seite = await erzeugePdfVorschau(await antwort.blob(), 2200);
      return seite ? await neuKodieren(await blobAlsDataUrl(seite), 2200, false) : null;
    } catch {
      return null;
    }
  },
  logo(hell) {
    return new Promise((fertig) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          const ctx = c.getContext("2d");
          if (!ctx) { fertig(null); return; }
          ctx.drawImage(img, 0, 0);
          const r = logoPixel(ctx, c.width, c.height, hell);
          const z = document.createElement("canvas");
          z.width = r.w; z.height = r.h;
          z.getContext("2d")?.drawImage(c, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
          fertig({ src: z.toDataURL("image/png"), breite: r.w, hoehe: r.h });
        } catch {
          fertig(null);
        }
      };
      img.onerror = () => fertig(null);
      img.src = LOGO_ADRESSE;
    });
  },
  async karte(umgebung) {
    const { umgebungsKartenbild } = await import("../umgebungKartenbild");
    // Dreifache Auflösung: Punkte und Namensnennung bleiben im Druck scharf.
    const k = await umgebungsKartenbild(umgebung, { skala: 3 });
    return k ? { src: k.daten, breite: k.breite, hoehe: k.hoehe } : null;
  },
};
