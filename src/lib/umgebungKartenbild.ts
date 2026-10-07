import { ausschnittPunkte, kartenPunkte, OBJEKT_FARBE, type Umgebung } from "./umgebungspunkte";

/**
 * Das Kartenbild der Umgebung für das Exposé-PDF (Christian, 24.09.2026).
 *
 * Am Bildschirm zeichnet Leaflet die Karte (`components/umgebung/PunkteKarte`).
 * Ein PDF kann keine lebende Karte tragen, deshalb entsteht hier beim Erzeugen
 * des PDFs ein festes Bild: Kartenkacheln von OpenStreetMap auf ein Canvas,
 * darauf die Punkte der Umgebung in der Farbe ihrer Kategorie und die Nadel
 * des Objekts, unten rechts die Namensnennung. Das Bild geht als JPEG ins PDF.
 *
 * NUTZUNGSREGELN VON OPENSTREETMAP
 *
 * - Derselbe Kachelserver wie die Leaflet-Karten im Projekt, ohne Schlüssel
 *   und ohne kostenpflichtigen Dienst.
 * - Geladen wird nur beim Klick auf „PDF herunterladen“, und dann höchstens
 *   zwölf Kacheln (4 × 3 bei 768 × 352 Bildpunkten). Keine Vorab- und keine
 *   Massenabrufe. Der Browser hält die Kacheln in seinem Zwischenspeicher,
 *   dazu merkt sich diese Datei die geladenen Bilder für die Sitzung.
 * - Die Namensnennung „© OpenStreetMap-Mitwirkende“ steht sichtbar im Bild.
 *
 * RÜCKFALL
 *
 * Lädt eine Kachel nicht (offline, gesperrt, kein CORS) oder dauert es länger
 * als `ZEITLIMIT_MS`, gibt es `null`. Das PDF erscheint dann ohne Kartenbild,
 * nur mit den Listen, und ohne Fehlermeldung. Halbe Karten mit grauen Löchern
 * gibt es nicht: Entweder alle Kacheln sind da oder keine Karte.
 *
 * Der Ausschnitt folgt derselben Regel wie am Bildschirm (`ausschnittPunkte`,
 * etwa ein Kilometer um das Haus, Zoomstufe höchstens 16).
 */

/** Derselbe Kachelserver wie die Karten im Projekt (`DeutschlandkarteBasis`, `PunkteKarte`). */
export const KACHEL_ADRESSE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
/** Die Namensnennung, die OpenStreetMap für jedes Kartenbild verlangt. */
export const KARTEN_NAMENSNENNUNG = "© OpenStreetMap-Mitwirkende";

const KACHEL = 256;
/** Bildgröße in Kartenpunkten, etwa das Seitenverhältnis der breiten Kachel im PDF. */
export const KARTENBILD = { breite: 768, hoehe: 352 } as const;
/** Abstand der äußersten Punkte zum Bildrand, wie `padding` bei Leaflet. */
const RAND = 30;
const ZOOM_MIN = 11;
const ZOOM_MAX = 16;
/** Nach so vielen Millisekunden erscheint das PDF ohne Karte. */
export const ZEITLIMIT_MS = 4000;

type Koordinate = { lat: number; lng: number };

/** Lage in Bildpunkten der ganzen Welt bei dieser Zoomstufe (Web-Mercator, wie OpenStreetMap und Leaflet). */
export function weltPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = KACHEL * 2 ** zoom;
  const breite = Math.max(-85.0511, Math.min(85.0511, lat));
  const sin = Math.sin((breite * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * n,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n,
  };
}

export interface Kartenausschnitt {
  zoom: number;
  /** Linke obere Ecke des Bildes in Weltbildpunkten. */
  links: number;
  oben: number;
}

/**
 * Zoomstufe und Lage des Bildes: die größte Stufe bis 16, bei der Objekt und
 * Ausschnittpunkte mit Rand ins Bild passen, mittig wie `fitBounds` bei
 * Leaflet. Ohne Punkte das Objekt in der Mitte bei Stufe 16.
 */
export function kartenausschnitt(zentrum: Koordinate, punkte: Koordinate[], breite: number, hoehe: number): Kartenausschnitt {
  for (let zoom = ZOOM_MAX; zoom >= ZOOM_MIN; zoom--) {
    const px = [zentrum, ...punkte].map((p) => weltPixel(p.lat, p.lng, zoom));
    const xs = px.map((p) => p.x);
    const ys = px.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const passt = maxX - minX <= breite - 2 * RAND && maxY - minY <= hoehe - 2 * RAND;
    if (punkte.length === 0 || passt) {
      return { zoom, links: (minX + maxX) / 2 - breite / 2, oben: (minY + maxY) / 2 - hoehe / 2 };
    }
  }
  // Passt selbst bei der kleinsten Stufe nicht alles: das Haus in die Mitte, es ist das Wichtigste.
  const mitte = weltPixel(zentrum.lat, zentrum.lng, ZOOM_MIN);
  return { zoom: ZOOM_MIN, links: mitte.x - breite / 2, oben: mitte.y - hoehe / 2 };
}

/** Die Kacheln, die das Bild abdecken, mit Adresse und Lage im Bild. */
export function kachelnFuer(a: Kartenausschnitt, breite: number, hoehe: number): Array<{ url: string; x: number; y: number }> {
  const anzahl = 2 ** a.zoom;
  const kacheln: Array<{ url: string; x: number; y: number }> = [];
  const x0 = Math.floor(a.links / KACHEL);
  const x1 = Math.floor((a.links + breite - 1) / KACHEL);
  const y0 = Math.floor(a.oben / KACHEL);
  const y1 = Math.floor((a.oben + hoehe - 1) / KACHEL);
  for (let ky = y0; ky <= y1; ky++) {
    if (ky < 0 || ky >= anzahl) continue;
    for (let kx = x0; kx <= x1; kx++) {
      const kxWelt = ((kx % anzahl) + anzahl) % anzahl;
      kacheln.push({
        url: KACHEL_ADRESSE.replace("{z}", String(a.zoom)).replace("{x}", String(kxWelt)).replace("{y}", String(ky)),
        x: kx * KACHEL - a.links,
        y: ky * KACHEL - a.oben,
      });
    }
  }
  return kacheln;
}

// ── Laden ──────────────────────────────────────────────────────────────────

/** Die in dieser Sitzung geladenen Kacheln. Ein zweites PDF desselben Hauses fragt den Server nicht noch einmal. */
const geladen = new Map<string, Promise<CanvasImageSource>>();
const HOECHSTENS_GEMERKT = 200;

function ladeKachelbild(url: string): Promise<CanvasImageSource> {
  const gemerkt = geladen.get(url);
  if (gemerkt) return gemerkt;
  if (geladen.size >= HOECHSTENS_GEMERKT) geladen.clear();
  const laden = new Promise<CanvasImageSource>((fertig, fehler) => {
    const bild = new Image();
    // Ohne CORS wäre das Canvas danach „verunreinigt“ und gäbe kein Bild heraus.
    bild.crossOrigin = "anonymous";
    bild.onload = () => fertig(bild);
    bild.onerror = () => fehler(new Error("Kartenkachel nicht geladen"));
    bild.src = url;
  });
  // Eine gescheiterte Kachel nicht merken, der nächste Versuch soll neu laden.
  laden.catch(() => geladen.delete(url));
  geladen.set(url, laden);
  return laden;
}

function mitZeitlimit<T>(arbeit: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((fertig) => {
    const uhr = setTimeout(() => fertig(null), ms);
    arbeit.then(
      (wert) => { clearTimeout(uhr); fertig(wert); },
      () => { clearTimeout(uhr); fertig(null); },
    );
  });
}

function standardCanvas(): HTMLCanvasElement | null {
  return typeof document !== "undefined" ? document.createElement("canvas") : null;
}

// ── Zeichnen ───────────────────────────────────────────────────────────────

/** Die Nadel des Objekts mit der Spitze auf dem Haus: Tropfen mit weißem Rand und weißem Kern. */
function nadel(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const r = 9;
  const kopf = y - 19;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - 3, y - 7, x - r, y - 11, x - r, kopf);
  ctx.arc(x, kopf, r, Math.PI, 0);
  ctx.bezierCurveTo(x + r, y - 11, x + 3, y - 7, x, y);
  ctx.closePath();
  ctx.fillStyle = OBJEKT_FARBE;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, kopf, 3.4, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
}

function punkt(ctx: CanvasRenderingContext2D, x: number, y: number, farbe: string): void {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.arc(x, y, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = farbe;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();
}

/** Namensnennung unten rechts auf hellem Feld, wie bei Leaflet. */
function namensnennung(ctx: CanvasRenderingContext2D, breite: number, hoehe: number): void {
  ctx.save();
  ctx.font = "11px Helvetica, Arial, sans-serif";
  const b = ctx.measureText(KARTEN_NAMENSNENNUNG).width + 12;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillRect(breite - b, hoehe - 18, b, 18);
  ctx.fillStyle = "#333333";
  ctx.textBaseline = "middle";
  ctx.fillText(KARTEN_NAMENSNENNUNG, breite - b + 6, hoehe - 9);
  ctx.restore();
}

export interface Kartenbild {
  /** Bild als Data-URL. */
  daten: string;
  format: "JPEG" | "PNG";
  /** Größe in Bildpunkten. */
  breite: number;
  hoehe: number;
}

export interface KartenbildOptionen {
  /** Lädt eine Kachel. Nur für Tests; sonst ein `Image` mit CORS. */
  ladeKachel?: (url: string) => Promise<CanvasImageSource>;
  /** Liefert das Canvas. Nur für Tests. */
  erzeugeCanvas?: () => HTMLCanvasElement | null;
  zeitlimitMs?: number;
  /** Auflösung gegenüber den Kartenpunkten; 2 hält Punkte und Schrift im Druck scharf. */
  skala?: number;
}

/**
 * Das Kartenbild der Umgebung oder `null`, wenn es nicht entstehen kann.
 * Wirft nie: Ein PDF ohne Karte ist besser als gar kein PDF.
 */
export async function umgebungsKartenbild(umgebung: Umgebung, optionen: KartenbildOptionen = {}): Promise<Kartenbild | null> {
  try {
    const { breite, hoehe } = KARTENBILD;
    const skala = optionen.skala ?? 2;
    const canvas = (optionen.erzeugeCanvas ?? standardCanvas)();
    if (!canvas) return null;
    canvas.width = breite * skala;
    canvas.height = hoehe * skala;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const punkte = kartenPunkte(umgebung);
    const ausschnitt = kartenausschnitt(umgebung.zentrum, ausschnittPunkte(punkte), breite, hoehe);
    const kacheln = kachelnFuer(ausschnitt, breite, hoehe);
    const laden = optionen.ladeKachel ?? ladeKachelbild;
    const bilder = await mitZeitlimit(Promise.all(kacheln.map((k) => laden(k.url))), optionen.zeitlimitMs ?? ZEITLIMIT_MS);
    if (!bilder) return null;

    ctx.scale(skala, skala);
    ctx.fillStyle = "#eef1f4";
    ctx.fillRect(0, 0, breite, hoehe);
    kacheln.forEach((k, i) => ctx.drawImage(bilder[i], k.x, k.y, KACHEL, KACHEL));
    // Ein zarter heller Schleier: Die farbigen Punkte heben sich so vom bunten Kartengrund ab.
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(0, 0, breite, hoehe);

    const imBild = (p: Koordinate) => {
      const w = weltPixel(p.lat, p.lng, ausschnitt.zoom);
      return { x: w.x - ausschnitt.links, y: w.y - ausschnitt.oben };
    };
    // Die fernen zuerst, damit die nahen obenauf liegen.
    [...punkte]
      .sort((a, b) => b.meter - a.meter)
      .map((p) => ({ farbe: p.farbe, ...imBild(p) }))
      .filter((p) => p.x > -8 && p.x < breite + 8 && p.y > -8 && p.y < hoehe + 8)
      .forEach((p) => punkt(ctx, p.x, p.y, p.farbe));
    const haus = imBild(umgebung.zentrum);
    nadel(ctx, haus.x, haus.y);
    namensnennung(ctx, breite, hoehe);

    const daten = canvas.toDataURL("image/jpeg", 0.86);
    if (!/^data:image\/(jpeg|png)/.test(daten)) return null;
    return { daten, format: daten.startsWith("data:image/png") ? "PNG" : "JPEG", breite: canvas.width, hoehe: canvas.height };
  } catch {
    // Etwa ein „verunreinigtes“ Canvas, wenn der Server kein CORS schickt.
    return null;
  }
}
