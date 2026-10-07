import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import JSZip from "jszip";

/**
 * Unterlagen als ZIP (Christian, 24.09.2026). Geprüft wird die Auswahl je
 * Rolle, das Packen mit Platzhaltern, gleichen Namen, Fehlschlägen und
 * Abbruch, und dass die Dateien über denselben Weg wie der Einzeldownload
 * kommen. Der Speicher ist nachgebaut.
 */

const speicher = vi.hoisted(() => ({ resolveUnterlagenUrl: vi.fn() }));
vi.mock("@/lib/storage", () => speicher);

const {
  NICHT_ENTHALTEN_DATEI,
  ZIP_ROLLEN,
  darfUnterlagenAlsZip,
  ladeUnterlageFuerZip,
  packeZip,
  sichererDateiname,
  zipDateiname,
  zipDateienAusBereichen,
  zipMeldung,
} = await import("./unterlagenZip");

function inhalt(text: string): Blob {
  return new Blob([text], { type: "application/pdf" });
}

async function oeffne(blob: Blob | null) {
  expect(blob).not.toBeNull();
  // jsdom kennt `Blob.arrayBuffer` nicht, der FileReader tut es.
  const puffer = await new Promise<ArrayBuffer>((fertig, fehler) => {
    const leser = new FileReader();
    leser.onload = () => fertig(leser.result as ArrayBuffer);
    leser.onerror = () => fehler(leser.error);
    leser.readAsArrayBuffer(blob as Blob);
  });
  return JSZip.loadAsync(puffer);
}

function namenIn(zip: JSZip): string[] {
  return Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name).sort();
}

const bereiche = [
  {
    schluessel: "objekt",
    eintraege: [
      { name: "Teilungserklärung", url: "/objekt-dokument/objekte/o1/dokumente/teilung.pdf" },
      { name: "Exposé", url: "" },
      { name: "Fotos", url: "__gallery__" },
      { name: "Energieausweis", url: "/investagon-dokument/o1/energie.pdf" },
    ],
  },
  {
    schluessel: "wohnung",
    eintraege: [{ name: "Mietvertrag WE 12", url: "/objekt-dokument/objekte/o1/wohnungen/w1/mv.pdf" }],
  },
];

describe("zipDateienAusBereichen: wer was bekommt", () => {
  it("gibt der Kundenrolle nichts, auch Tippgeber, Bewerber und Unbekannte gehen leer aus", () => {
    for (const rolle of ["kunde", "tippgeber", "bewerber", "", null, undefined, "gast"]) {
      expect(zipDateienAusBereichen(bereiche, rolle)).toEqual([]);
      expect(darfUnterlagenAlsZip(rolle)).toBe(false);
    }
  });

  it("gibt der Finanzierungsrolle dieselben Dateien wie dem Admin", () => {
    const admin = zipDateienAusBereichen(bereiche, "admin");
    expect(zipDateienAusBereichen(bereiche, "finanzierungspartner")).toEqual(admin);
    expect(admin.map((d) => d.name)).toEqual(["Teilungserklärung", "Energieausweis", "Mietvertrag WE 12"]);
  });

  it("hält sich an die Rollen aus is_internal_role, die Kundenrolle steht nicht darin", () => {
    expect(ZIP_ROLLEN).toContain("finanzierungspartner");
    expect(ZIP_ROLLEN).not.toContain("kunde");
    expect(ZIP_ROLLEN).not.toContain("tippgeber");
    expect(ZIP_ROLLEN).toHaveLength(15);
  });

  it("überspringt leere Platzhalter und den Galerie-Knopf", () => {
    const namen = zipDateienAusBereichen(bereiche, "admin").map((d) => d.name);
    expect(namen).not.toContain("Exposé");
    expect(namen).not.toContain("Fotos");
  });

  it("legt je Bereich einen Ordner an, wenn einer gewünscht ist", () => {
    const dateien = zipDateienAusBereichen(bereiche, "admin", (s) => (s === "wohnung" ? "Wohnung 12" : "Objekt"));
    expect(dateien.map((d) => `${d.ordner}/${d.name}`)).toEqual([
      "Objekt/Teilungserklärung", "Objekt/Energieausweis", "Wohnung 12/Mietvertrag WE 12",
    ]);
  });
});

describe("packeZip", () => {
  it("packt die Dateien in ihre Ordner, mit Endung aus dem Ablagepfad", async () => {
    const laden = vi.fn(async (url: string) => inhalt(url));
    const paket = await packeZip(
      [
        { name: "Teilungserklärung", url: "/objekt-dokument/objekte/o1/dokumente/teilung.pdf", ordner: "Objekt" },
        { name: "Grundriss.png", url: "/objekt-dokument/objekte/o1/wohnungen/w1/wd2_plan", ordner: "Wohnung 12" },
      ],
      { laden },
    );
    expect(paket).toMatchObject({ gepackt: 2, gesamt: 2, nichtEnthalten: [] });
    const zip = await oeffne(paket.blob);
    expect(namenIn(zip)).toEqual(["Objekt/Teilungserklärung.pdf", "Wohnung 12/Grundriss.png"]);
    expect(await zip.file("Objekt/Teilungserklärung.pdf")!.async("string")).toBe("/objekt-dokument/objekte/o1/dokumente/teilung.pdf");
  });

  it("lädt leere Platzhalter gar nicht erst und zählt sie nicht mit", async () => {
    const laden = vi.fn(async () => inhalt("x"));
    const paket = await packeZip(
      [{ name: "Leer", url: "" }, { name: "Nur Leerzeichen", url: "   " }, { name: "Fotos", url: "__gallery__" }, { name: "Echt", url: "/a/echt.pdf" }],
      { laden },
    );
    expect(laden).toHaveBeenCalledTimes(1);
    expect(paket).toMatchObject({ gepackt: 1, gesamt: 1, nichtEnthalten: [] });
  });

  it("nummeriert gleiche Namen im selben Ordner, auch bei anderer Schreibweise", async () => {
    const laden = vi.fn(async () => inhalt("x"));
    const paket = await packeZip(
      [
        { name: "Grundriss", url: "/a/1.pdf", ordner: "Objekt" },
        { name: "Grundriss", url: "/a/2.pdf", ordner: "Objekt" },
        { name: "grundriss", url: "/a/3.pdf", ordner: "Objekt" },
        { name: "Grundriss", url: "/a/4.pdf", ordner: "Wohnung 12" },
      ],
      { laden },
    );
    const zip = await oeffne(paket.blob);
    expect(namenIn(zip)).toEqual([
      "Objekt/Grundriss (2).pdf", "Objekt/Grundriss.pdf", "Objekt/grundriss (3).pdf", "Wohnung 12/Grundriss.pdf",
    ]);
  });

  it("schreibt Fehlschläge mit Grund in „Nicht enthalten.txt“ und packt den Rest", async () => {
    const laden = vi.fn(async (url: string) => {
      if (url.includes("kaputt")) throw new Error("ließ sich nicht laden (Fehler 404).");
      return inhalt("x");
    });
    const paket = await packeZip(
      [
        { name: "Mietvertrag", url: "/a/mv.pdf", ordner: "Wohnung 12" },
        { name: "Grundbuch", url: "/a/kaputt.pdf", ordner: "Objekt" },
      ],
      { laden },
    );
    expect(paket.gepackt).toBe(1);
    expect(paket.nichtEnthalten).toEqual([{ name: "Grundbuch", ordner: "Objekt", grund: "ließ sich nicht laden (Fehler 404)." }]);
    const zip = await oeffne(paket.blob);
    expect(namenIn(zip)).toEqual([NICHT_ENTHALTEN_DATEI, "Wohnung 12/Mietvertrag.pdf"]);
    const text = await zip.file(NICHT_ENTHALTEN_DATEI)!.async("string");
    expect(text).toContain("Objekt/Grundbuch: ließ sich nicht laden (Fehler 404).");
    expect(zipMeldung(paket)).toEqual({
      art: "teilweise",
      text: "1 von 2 Dateien in der ZIP-Datei. 1 fehlt, die Gründe stehen in „Nicht enthalten.txt“.",
    });
  });

  it("liefert keine ZIP-Datei, wenn keine einzige Datei lädt", async () => {
    const paket = await packeZip([{ name: "A", url: "/a.pdf" }], { laden: async () => { throw new Error("weg"); } });
    expect(paket.blob).toBeNull();
    expect(zipMeldung(paket).art).toBe("nichts");
  });

  it("lädt nacheinander und meldet den Fortschritt", async () => {
    let gleichzeitig = 0;
    let hoechstens = 0;
    const laden = vi.fn(async () => {
      gleichzeitig++;
      hoechstens = Math.max(hoechstens, gleichzeitig);
      await new Promise((r) => setTimeout(r, 1));
      gleichzeitig--;
      return inhalt("x");
    });
    const schritte: string[] = [];
    await packeZip(
      Array.from({ length: 5 }, (_, i) => ({ name: `D${i}`, url: `/a/${i}.pdf` })),
      { laden, onFortschritt: ({ fertig, gesamt }) => schritte.push(`${fertig}/${gesamt}`) },
    );
    expect(hoechstens).toBe(1);
    expect(schritte).toEqual(["0/5", "1/5", "2/5", "3/5", "4/5", "5/5"]);
  });

  it("hört beim Abbrechen auf und liefert nichts", async () => {
    const abbruch = new AbortController();
    const laden = vi.fn(async () => {
      abbruch.abort();
      return inhalt("x");
    });
    await expect(packeZip(
      [{ name: "A", url: "/a.pdf" }, { name: "B", url: "/b.pdf" }],
      { laden, signal: abbruch.signal },
    )).rejects.toMatchObject({ name: "AbortError" });
    expect(laden).toHaveBeenCalledTimes(1);
  });

  it("macht aus einem gefährlichen Namen keinen Pfad nach draußen", async () => {
    const paket = await packeZip([{ name: "../../etc/pass\u0000wd", url: "/a/x.pdf" }], { laden: async () => inhalt("x") });
    const zip = await oeffne(paket.blob);
    expect(namenIn(zip)).toEqual(["etc passwd.pdf"]);
  });
});

describe("Dateinamen", () => {
  it("baut den ZIP-Namen aus Objekt, Wohnung und Datum", () => {
    const datum = new Date(2026, 8, 24);
    expect(zipDateiname({ objektTitel: "Friesenstraße 5", weNr: "WE 12", datum })).toBe("Unterlagen Friesenstraße 5 WE 12 2026-09-24.zip");
    expect(zipDateiname({ objektTitel: "Friesenstraße 5", weNr: 12, zusatz: "Wohnung", datum })).toBe("Unterlagen Friesenstraße 5 WE 12 Wohnung 2026-09-24.zip");
    expect(zipDateiname({ objektTitel: "Friesenstraße 5", datum })).toBe("Unterlagen Friesenstraße 5 2026-09-24.zip");
    expect(zipDateiname({ objektTitel: "", datum })).toBe("Unterlagen Objekt 2026-09-24.zip");
  });

  it("bereinigt den ZIP-Namen: keine Schrägstriche, keine Steuerzeichen", () => {
    const name = zipDateiname({ objektTitel: "Haus/Nord\\Süd:\u0007 <Alt>\u202Efdp.exe", weNr: "3|4", datum: new Date(2026, 8, 24) });
    expect(name).toBe("Unterlagen Haus Nord Süd Alt fdp.exe WE 3 4 2026-09-24.zip");
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
    expect(Array.from(name).some((z) => z.charCodeAt(0) < 0x20 || z === "\u202e")).toBe(false);
  });

  it("lässt keinen Punkt am Anfang oder Ende und fängt Gerätenamen ab", () => {
    expect(sichererDateiname("..versteckt.")).toBe("versteckt");
    expect(sichererDateiname("   ")).toBe("Dokument");
    expect(sichererDateiname("CON")).toBe("_CON");
    expect(sichererDateiname("x".repeat(300))).toHaveLength(120);
  });
});

describe("ladeUnterlageFuerZip: derselbe Weg wie der Einzeldownload", () => {
  const holen = vi.fn();
  beforeEach(() => {
    speicher.resolveUnterlagenUrl.mockReset();
    holen.mockReset();
    vi.stubGlobal("fetch", holen);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("holt die befristete Adresse über resolveUnterlagenUrl und lädt sie", async () => {
    speicher.resolveUnterlagenUrl.mockResolvedValue("https://x.supabase.co/storage/v1/object/sign/investagon-dokumente/o1/e.pdf?token=t");
    const datei = inhalt("pdf");
    holen.mockResolvedValue({ ok: true, status: 200, blob: async () => datei });
    expect(await ladeUnterlageFuerZip("/investagon-dokument/o1/e.pdf")).toBe(datei);
    expect(speicher.resolveUnterlagenUrl).toHaveBeenCalledWith("/investagon-dokument/o1/e.pdf");
  });

  it("gibt ohne Adresse auf, statt anders an die Datei zu kommen", async () => {
    speicher.resolveUnterlagenUrl.mockResolvedValue(null);
    await expect(ladeUnterlageFuerZip("/objekt-dokument/objekte/o1/dokumente/gb.pdf")).rejects.toThrow("kein Zugriff");
    expect(holen).not.toHaveBeenCalled();
  });

  it("lädt nichts von fremden Servern und nennt den Grund", async () => {
    await expect(ladeUnterlageFuerZip("https://tool.investagon.com/files/a.pdf")).rejects.toThrow("fremden Server");
    expect(speicher.resolveUnterlagenUrl).not.toHaveBeenCalled();
    expect(holen).not.toHaveBeenCalled();
  });

  it("meldet einen Fehlerstatus mit Nummer", async () => {
    speicher.resolveUnterlagenUrl.mockResolvedValue("https://x.supabase.co/storage/v1/object/sign/objekt-dokumente/a.pdf?token=t");
    holen.mockResolvedValue({ ok: false, status: 404, blob: async () => inhalt("") });
    await expect(ladeUnterlageFuerZip("/objekt-dokument/a.pdf")).rejects.toThrow("Fehler 404");
  });
});
