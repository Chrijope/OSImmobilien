import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Das Hochladen eines Objektbildes.
 *
 * Geprüft wird vor allem, was schiefgehen kann: ein versehentlich gewähltes
 * PDF, eine zu große Datei, eine fehlende Berechtigung, eine abgebrochene
 * Verbindung. In allen Fällen muss ein verständlicher deutscher Satz
 * herauskommen und nichts geworfen werden, sonst bleibt das Fenster im Zustand
 * „lädt“ hängen.
 */

const upload = vi.fn();
const remove = vi.fn();
let komprimierungWirft = false;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => upload(...args),
        remove: (...args: unknown[]) => remove(...args),
      }),
    },
  },
}));

vi.mock("@/lib/imageCompression", () => ({
  compressForUpload: async (datei: File) => {
    if (komprimierungWirft) throw new Error("nicht lesbar");
    return {
      compressed: new File(["klein"], "bild.webp", { type: "image/webp" }),
      original: datei,
      thumbnailDataUrl: "",
    };
  },
}));

vi.mock("@/lib/storage", async () => {
  const echt = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return {
    ...echt,
    getObjektMedienUrl: (pfad: string) => `https://beispiel.test/storage/v1/object/public/objekt-medien/${pfad}`,
    // Größe und Formate bewusst mit der echten Prüfung, das ist der Kern.
    validateUploadFile: echt.validateUploadFile,
    extractStoragePath: echt.extractStoragePath,
  };
});

const { ladeObjektBildHoch, loescheObjektBild } = await import("@/lib/objektBildUpload");

/** Eine Datei mit einer bestimmten Größe, ohne sie wirklich zu füllen. */
const datei = (name: string, typ: string, bytes = 1000): File => {
  const f = new File(["x"], name, { type: typ });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
};

beforeEach(() => {
  upload.mockReset();
  remove.mockReset();
  komprimierungWirft = false;
  upload.mockResolvedValue({ error: null });
});

describe("Was der Nutzer falsch machen kann", () => {
  it("weist ein PDF mit einem verständlichen Satz ab", async () => {
    const e = await ladeObjektBildHoch("inv-1", datei("vertrag.pdf", "application/pdf"));
    expect(e.ok).toBe(false);
    expect(e.fehler).toBe("Bitte ein Bild auswählen, etwa JPG, PNG oder WEBP.");
    expect(upload).not.toHaveBeenCalled();
  });

  it("weist eine zu große Datei ab und nennt die Grenze", async () => {
    const e = await ladeObjektBildHoch("inv-1", datei("riesig.jpg", "image/jpeg", 11 * 1024 * 1024));
    expect(e.ok).toBe(false);
    expect(e.fehler).toContain("zu groß");
    expect(e.fehler).toContain("10 MB");
    expect(upload).not.toHaveBeenCalled();
  });

  it("verlangt ein Investment", async () => {
    const e = await ladeObjektBildHoch("", datei("bild.jpg", "image/jpeg"));
    expect(e.ok).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it("kommt ohne Datei zurecht", async () => {
    const e = await ladeObjektBildHoch("inv-1", undefined as unknown as File);
    expect(e.ok).toBe(false);
    expect(e.fehler).toBe("Keine Datei ausgewählt.");
  });
});

describe("Der gute Fall", () => {
  it("lädt hoch und liefert die fertige Adresse", async () => {
    const e = await ladeObjektBildHoch("inv-1", datei("haus.jpg", "image/jpeg"));
    expect(e.ok).toBe(true);
    expect(e.url).toContain("/objekt-medien/objektfotos/investment/inv-1/");
  });

  it("legt das Bild im vorhandenen Bereich unter dem bekannten Präfix ab", async () => {
    await ladeObjektBildHoch("inv-7", datei("haus.jpg", "image/jpeg"));
    const pfad = upload.mock.calls[0][0] as string;
    // Das Präfix entscheidet, ob `storage.isObjektMedienPath` den Pfad kennt.
    expect(pfad.startsWith("objektfotos/investment/inv-7/")).toBe(true);
  });

  it("trennt die Bilder zweier Investments", async () => {
    await ladeObjektBildHoch("inv-a", datei("a.jpg", "image/jpeg"));
    await ladeObjektBildHoch("inv-b", datei("b.jpg", "image/jpeg"));
    expect(upload.mock.calls[0][0]).toContain("/inv-a/");
    expect(upload.mock.calls[1][0]).toContain("/inv-b/");
  });

  it("überschreibt nie ein vorhandenes Bild", async () => {
    await ladeObjektBildHoch("inv-1", datei("haus.jpg", "image/jpeg"));
    expect(upload.mock.calls[0][2]).toMatchObject({ upsert: false });
  });

  it("lädt die verkleinerte Fassung hoch, nicht das Original", async () => {
    await ladeObjektBildHoch("inv-1", datei("gross.jpg", "image/jpeg", 5 * 1024 * 1024));
    expect((upload.mock.calls[0][1] as File).name).toBe("bild.webp");
  });

  it("nimmt das Original, wenn das Verkleinern scheitert", async () => {
    komprimierungWirft = true;
    const e = await ladeObjektBildHoch("inv-1", datei("eigenartig.heic", "image/heic"));
    expect(e.ok).toBe(true);
    expect((upload.mock.calls[0][1] as File).name).toBe("eigenartig.heic");
  });
});

describe("Wenn der Speicher nein sagt", () => {
  it("übersetzt eine fehlende Berechtigung", async () => {
    upload.mockResolvedValue({ error: { message: "new row violates row-level security policy" } });
    const e = await ladeObjektBildHoch("inv-1", datei("haus.jpg", "image/jpeg"));
    expect(e.ok).toBe(false);
    expect(e.fehler).toBe("Für das Hochladen von Bildern fehlt die Berechtigung.");
  });

  it("übersetzt eine serverseitige Größenablehnung", async () => {
    upload.mockResolvedValue({ error: { message: "Payload too large" } });
    const e = await ladeObjektBildHoch("inv-1", datei("haus.jpg", "image/jpeg"));
    expect(e.ok).toBe(false);
    expect(e.fehler).toContain("zu groß");
  });

  it("fängt eine abgebrochene Verbindung ab, statt zu werfen", async () => {
    upload.mockRejectedValue(new Error("Failed to fetch"));
    const e = await ladeObjektBildHoch("inv-1", datei("haus.jpg", "image/jpeg"));
    expect(e.ok).toBe(false);
    expect(e.fehler).toBe("Keine Verbindung zum Speicher. Bitte erneut versuchen.");
  });

  it("meldet einen unbekannten Fehler verständlich", async () => {
    upload.mockResolvedValue({ error: { message: "irgendwas Unerwartetes" } });
    const e = await ladeObjektBildHoch("inv-1", datei("haus.jpg", "image/jpeg"));
    expect(e.ok).toBe(false);
    expect(e.fehler).toBe("Das Bild konnte nicht gespeichert werden. Bitte erneut versuchen.");
  });
});

describe("Löschen greift nur die eigenen Bilder an", () => {
  it("löscht ein Bild, das zu einem Investment gehört", async () => {
    await loescheObjektBild(
      "https://beispiel.test/storage/v1/object/public/objekt-medien/objektfotos/investment/inv-1/123_abc.webp",
    );
    expect(remove).toHaveBeenCalledWith(["objektfotos/investment/inv-1/123_abc.webp"]);
  });

  it("rührt ein Bild aus dem eigenen Bestand nicht an", async () => {
    await loescheObjektBild(
      "https://beispiel.test/storage/v1/object/public/objekt-medien/objektfotos/objekt-4711/titel.jpg",
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it("rührt ein Exposé nicht an", async () => {
    await loescheObjektBild(
      "https://beispiel.test/storage/v1/object/public/objekt-medien/expose/objekt-4711.pdf",
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it("kommt mit einer leeren Adresse zurecht", async () => {
    await loescheObjektBild("");
    await loescheObjektBild(null);
    await loescheObjektBild(undefined);
    expect(remove).not.toHaveBeenCalled();
  });

  it("wirft nicht, wenn das Löschen scheitert", async () => {
    remove.mockRejectedValue(new Error("weg"));
    await expect(
      loescheObjektBild(
        "https://beispiel.test/storage/v1/object/public/objekt-medien/objektfotos/investment/inv-1/1.webp",
      ),
    ).resolves.toBeUndefined();
  });
});
