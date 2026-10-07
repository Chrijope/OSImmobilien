import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ObjektBild } from "@/lib/objekteStore";
import { bildAlsDataUrl, ladeRechnerBilder, MAX_RECHNER_BILDER, rechnerBildAdressen } from "./rechnerBilder";

/**
 * Die Fotos, mit denen der Bereich „Bilder" im Rechner startet.
 *
 * Geprüft wird die Reihenfolge (Einheit vor Objekt, Titelbild des Objekts
 * vorn), dass nichts doppelt kommt, dass Grundrisse draußen bleiben und dass
 * höchstens sechs Bilder geladen werden, wobei ein kaputtes Bild Platz für
 * das nächste macht.
 */

const bild = (url: string, reihenfolge: number, alt = ""): ObjektBild => ({ id: url, url, alt, reihenfolge });

describe("rechnerBildAdressen", () => {
  it("nimmt erst die Fotos der Einheit, dann die des Objekts mit dem Titelbild vorn", () => {
    const adressen = rechnerBildAdressen(
      { bildUrl: "/o/titel.jpg", bilder: [bild("/o/2.jpg", 2), bild("/o/titel.jpg", 3), bild("/o/1.jpg", 1)] },
      { bilder: [bild("/w/b.jpg", 2), bild("/w/a.jpg", 1)] },
    );
    expect(adressen).toEqual(["/w/a.jpg", "/w/b.jpg", "/o/titel.jpg", "/o/1.jpg", "/o/2.jpg"]);
  });

  it("nimmt ohne Fotos der Einheit die des Objekts, das Titelbild zuerst", () => {
    const adressen = rechnerBildAdressen(
      { bildUrl: "/o/titel.jpg", bilder: [bild("/o/1.jpg", 1), bild("/o/titel.jpg", 2)] },
      { bilder: [] },
    );
    expect(adressen).toEqual(["/o/titel.jpg", "/o/1.jpg"]);
  });

  it("lässt Grundrisse, leere Adressen und Dubletten weg", () => {
    const adressen = rechnerBildAdressen(
      { bildUrl: "", bilder: [bild("/gemeinsam.jpg", 1), bild("/o/grundriss.png", 2, "Grundriss EG"), bild("  ", 3)] },
      { bilder: [bild("/gemeinsam.jpg", 1), bild(" /w/a.jpg ", 2)] },
    );
    expect(adressen).toEqual(["/gemeinsam.jpg", "/w/a.jpg"]);
  });

  it("kommt ohne jedes Bild mit einer leeren Liste zurück", () => {
    expect(rechnerBildAdressen({ bildUrl: "", bilder: [] }, {})).toEqual([]);
  });
});

describe("ladeRechnerBilder", () => {
  const adressen = Array.from({ length: 9 }, (_, i) => `/bild-${i + 1}.jpg`);

  it("lädt höchstens sechs Bilder, in der Reihenfolge der Adressen", async () => {
    const laden = vi.fn(async (adresse: string) => `data:image/jpeg;base64,${adresse}`);
    const bilder = await ladeRechnerBilder(adressen, laden);
    expect(bilder).toHaveLength(MAX_RECHNER_BILDER);
    expect(bilder[0]).toBe("data:image/jpeg;base64,/bild-1.jpg");
    expect(bilder[5]).toBe("data:image/jpeg;base64,/bild-6.jpg");
    // Mehr als nötig wird gar nicht erst geladen.
    expect(laden).toHaveBeenCalledTimes(6);
  });

  it("lässt für ein kaputtes Bild das nächste nachrücken", async () => {
    const laden = vi.fn(async (adresse: string) => {
      if (adresse === "/bild-2.jpg") return null;
      if (adresse === "/bild-3.jpg") throw new Error("Netz weg");
      return `data:${adresse}`;
    });
    const bilder = await ladeRechnerBilder(adressen, laden);
    expect(bilder).toEqual(["data:/bild-1.jpg", "data:/bild-4.jpg", "data:/bild-5.jpg", "data:/bild-6.jpg", "data:/bild-7.jpg", "data:/bild-8.jpg"]);
  });

  it("nimmt inhaltsgleiche Bilder und doppelte Adressen nur einmal", async () => {
    const laden = vi.fn(async (adresse: string) => (adresse.includes("kopie") ? "data:gleich" : adresse === "/a.jpg" ? "data:gleich" : `data:${adresse}`));
    const bilder = await ladeRechnerBilder(["/a.jpg", "/a.jpg", "/kopie.jpg", "/b.jpg"], laden);
    expect(bilder).toEqual(["data:gleich", "data:/b.jpg"]);
    expect(laden).toHaveBeenCalledTimes(3);
  });

  it("gibt ohne Adressen eine leere Liste zurück, ohne etwas zu laden", async () => {
    const laden = vi.fn();
    expect(await ladeRechnerBilder([], laden)).toEqual([]);
    expect(laden).not.toHaveBeenCalled();
  });
});

describe("bildAlsDataUrl", () => {
  /*
   * jsdom lädt keine Bilder und kennt keine Leinwand. Die Attrappe meldet ein
   * kleines, darstellbares Bild, so bleibt es unverkleinert; mit `kaputt`
   * meldet sie ein Bild, das der Browser nicht zeigen kann.
   */
  let kaputt = false;
  class BildAttrappe {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 800;
    naturalHeight = 600;
    set src(_wert: string) {
      queueMicrotask(() => (kaputt ? this.onerror?.() : this.onload?.()));
    }
  }
  beforeEach(() => {
    kaputt = false;
    vi.stubGlobal("Image", BildAttrappe);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("liest ein Bild als Data-URL ein, damit die PDF es ohne Nachladen zeigt", async () => {
    const abruf = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Blob(["x"], { type: "image/png" })));
    const daten = await bildAlsDataUrl("https://beispiel.supabase.co/storage/v1/object/public/objekt-medien/a.png");
    expect(daten).toMatch(/^data:image\/png;base64,/);
    expect(abruf).toHaveBeenCalledWith(expect.stringContaining("/objekt-medien/a.png"), { credentials: "omit" });
  });

  it("erkennt ein Bild an der Endung, wenn die Ablage keinen Bildtyp mitschickt", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Blob(["x"], { type: "application/octet-stream" })));
    expect(await bildAlsDataUrl("https://beispiel.de/haus.JPG?v=2")).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("lässt ein Bild weg, das der Browser nicht darstellen kann", async () => {
    kaputt = true;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Blob(["x"], { type: "image/heic" })));
    expect(await bildAlsDataUrl("https://beispiel.de/iphone.heic")).toBeNull();
  });

  it("verwirft eine Fehlerseite statt sie als Bild einzusetzen", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }));
    expect(await bildAlsDataUrl("https://beispiel.de/seite")).toBeNull();
  });

  it("verwirft ein nicht gefundenes Bild", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
    expect(await bildAlsDataUrl("https://beispiel.de/fehlt.jpg")).toBeNull();
  });

  it("gibt die Adresse selbst zurück, wenn der fremde Server den Abruf sperrt", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await bildAlsDataUrl("https://fremd.de/haus.jpg")).toBe("https://fremd.de/haus.jpg");
  });

  it("reicht eine schon eingelesene Data-URL unverändert durch", async () => {
    const abruf = vi.spyOn(globalThis, "fetch");
    expect(await bildAlsDataUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(abruf).not.toHaveBeenCalled();
  });
});
