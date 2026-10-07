import { describe, it, expect, vi } from "vitest";
import {
  KACHEL_ADRESSE,
  KARTEN_NAMENSNENNUNG,
  KARTENBILD,
  kachelnFuer,
  kartenausschnitt,
  umgebungsKartenbild,
  weltPixel,
} from "./umgebungKartenbild";
import { umgebungAusAnalyse, umgebungFuerKunden, type Umgebung } from "./umgebungspunkte";

/**
 * Das Kartenbild der Umgebung im PDF. Canvas und Kachellader sind Attrappen:
 * Im Test gibt es weder ein echtes Canvas noch Netz. Geprüft wird, was an
 * OpenStreetMap geht (wenige Kacheln vom Projekt-Kachelserver), dass die
 * Namensnennung im Bild steht, dass die Punkte in ihrer Farbe gezeichnet
 * werden und dass jeder Fehler still zu „keine Karte“ wird.
 */

const umgebung = umgebungFuerKunden(umgebungAusAnalyse({
  schema: 2, messfassung: 3, objekt_koordinaten: { lat: 48.3705, lng: 10.8978 }, genauigkeit: "adresse",
  mikrolage: {
    einkaufen: [{ name: "Markt Eins", typ: "Supermarkt", entfernung_m: 220, lat: 48.3721, lng: 10.8990 }],
    oepnv: [{ name: "Halt Mitte", typ: "Bus", entfernung_m: 150, lat: 48.3698, lng: 10.8960 }],
    parks: [{ name: "Stadtgarten", typ: "Park", entfernung_m: 600, lat: 48.3660, lng: 10.9020 }],
    aerzte: [{ name: "Praxis Dr. Beispiel", typ: "Arztpraxis", entfernung_m: 100, lat: 48.3710, lng: 10.8980 }],
  },
}))!;

function attrappenCanvas() {
  const aufrufe = { texte: [] as string[], fuellfarben: [] as string[], bilder: 0, kreise: 0 };
  const ctx = {
    scale: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), closePath: vi.fn(),
    bezierCurveTo: vi.fn(), stroke: vi.fn(), fillRect: vi.fn(),
    arc: vi.fn(() => { aufrufe.kreise += 1; }),
    fill: vi.fn(function (this: { fillStyle: string }) { aufrufe.fuellfarben.push(String(this.fillStyle)); }),
    drawImage: vi.fn(() => { aufrufe.bilder += 1; }),
    fillText: vi.fn((t: string) => { aufrufe.texte.push(t); }),
    measureText: (t: string) => ({ width: t.length * 6 }),
    fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", textBaseline: "",
    shadowColor: "", shadowBlur: 0, shadowOffsetY: 0,
  };
  const canvas = {
    width: 0, height: 0,
    getContext: () => ctx,
    toDataURL: vi.fn(() => "data:image/jpeg;base64,AAAA"),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, aufrufe };
}

describe("Kartenausschnitt", () => {
  it("rechnet Web-Mercator wie OpenStreetMap: Augsburg bei Stufe 16 in der richtigen Kachel", () => {
    const p = weltPixel(48.3705, 10.8978, 16);
    // Dieselbe Kachel wie nach der Formel im OpenStreetMap-Wiki („Slippy map tilenames“): 34751/22680.
    const r = (48.3705 * Math.PI) / 180;
    expect(Math.floor(p.x / 256)).toBe(Math.floor(((10.8978 + 180) / 360) * 2 ** 16));
    expect(Math.floor(p.y / 256)).toBe(Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** 16));
    expect([Math.floor(p.x / 256), Math.floor(p.y / 256)]).toEqual([34751, 22680]);
  });

  it("zoomt so nah wie möglich, höchstens 16, und fragt höchstens zwölf Kacheln ab", () => {
    const a = kartenausschnitt(umgebung.zentrum, [{ lat: 48.3721, lng: 10.899 }, { lat: 48.366, lng: 10.902 }], KARTENBILD.breite, KARTENBILD.hoehe);
    expect(a.zoom).toBeLessThanOrEqual(16);
    expect(a.zoom).toBeGreaterThanOrEqual(14);
    const kacheln = kachelnFuer(a, KARTENBILD.breite, KARTENBILD.hoehe);
    // 3 × 2 bis 4 × 3, je nachdem, wie das Bild auf dem Kachelraster liegt.
    expect(kacheln.length).toBeGreaterThanOrEqual(6);
    expect(kacheln.length).toBeLessThanOrEqual(12);
    for (const k of kacheln) expect(k.url).toMatch(/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/);
    expect(KACHEL_ADRESSE.startsWith("https://tile.openstreetmap.org/")).toBe(true);
    // Ohne Punkte: das Haus mittig bei Stufe 16.
    expect(kartenausschnitt(umgebung.zentrum, [], 768, 352).zoom).toBe(16);
  });
});

describe("umgebungsKartenbild", () => {
  it("zeichnet Kacheln, Punkte in ihrer Farbe, die Nadel und die Namensnennung und gibt ein JPEG zurück", async () => {
    const { canvas, aufrufe } = attrappenCanvas();
    const ladeKachel = vi.fn(async () => ({}) as CanvasImageSource);
    const bild = await umgebungsKartenbild(umgebung, { erzeugeCanvas: () => canvas, ladeKachel });
    expect(bild).not.toBeNull();
    expect(bild!.format).toBe("JPEG");
    expect(bild!.breite).toBe(KARTENBILD.breite * 2);
    expect(ladeKachel.mock.calls.length).toBeLessThanOrEqual(12);
    expect(aufrufe.bilder).toBe(ladeKachel.mock.calls.length);
    expect(aufrufe.texte).toContain(KARTEN_NAMENSNENNUNG);
    expect(KARTEN_NAMENSNENNUNG).toBe("© OpenStreetMap-Mitwirkende");
    // Farben aus UMGEBUNG_KATEGORIEN: Einkaufen blau, Bus und Bahn violett, Grün grün; die Nadel dunkel.
    expect(aufrufe.fuellfarben).toEqual(expect.arrayContaining(["#15724F", "#5f3dc4", "#2e9468", "#182c3d"]));
    // Seit dem 24.09.2026 abends gehen die Arztpraxen mit, ihre Farbe ist die der Einrichtungen.
    expect(aufrufe.fuellfarben).toContain("#c77d12");
  });

  it("gibt ohne Fehler null zurück, wenn eine Kachel nicht lädt", async () => {
    const { canvas } = attrappenCanvas();
    let n = 0;
    const ladeKachel = vi.fn(async () => { n += 1; if (n === 3) throw new Error("offline"); return {} as CanvasImageSource; });
    await expect(umgebungsKartenbild(umgebung, { erzeugeCanvas: () => canvas, ladeKachel })).resolves.toBeNull();
  });

  it("gibt nach dem Zeitlimit null zurück, statt das PDF warten zu lassen", async () => {
    const { canvas } = attrappenCanvas();
    const nie = () => new Promise<CanvasImageSource>(() => {});
    const start = Date.now();
    await expect(umgebungsKartenbild(umgebung, { erzeugeCanvas: () => canvas, ladeKachel: nie, zeitlimitMs: 30 })).resolves.toBeNull();
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("gibt null zurück ohne Canvas, ohne Zeichenfläche und bei einem verunreinigten Canvas", async () => {
    const ladeKachel = vi.fn(async () => ({}) as CanvasImageSource);
    await expect(umgebungsKartenbild(umgebung, { erzeugeCanvas: () => null, ladeKachel })).resolves.toBeNull();
    const ohneKontext = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
    await expect(umgebungsKartenbild(umgebung, { erzeugeCanvas: () => ohneKontext, ladeKachel })).resolves.toBeNull();
    const { canvas } = attrappenCanvas();
    (canvas as unknown as { toDataURL: () => string }).toDataURL = () => { throw new Error("SecurityError"); };
    await expect(umgebungsKartenbild(umgebung, { erzeugeCanvas: () => canvas, ladeKachel })).resolves.toBeNull();
    // Keine Kachel wird geladen, wenn gar nicht gezeichnet werden kann: nur beim ersten, gescheiterten Canvas-Versuch nicht.
    const nurZaehlen = vi.fn(async () => ({}) as CanvasImageSource);
    await umgebungsKartenbild(umgebung as Umgebung, { erzeugeCanvas: () => null, ladeKachel: nurZaehlen });
    expect(nurZaehlen).not.toHaveBeenCalled();
  });
});
