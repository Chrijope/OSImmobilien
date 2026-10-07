/**
 * Scheitert das Verkleinern, muss der Nutzer es erfahren.
 *
 * Bis zum 26.09.2026 fing `unterlagenVerkleinern` jeden Fehler ab und gab
 * kommentarlos die Originaldatei zurück. Der Upload meldete dann entweder
 * Erfolg oder "ließ sich nicht weit genug verkleinern", beides falsch. Hier
 * scheitert pdf.js absichtlich, wie es etwa bei einem gesperrten Worker
 * passiert.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.reject(new Error("Worker gesperrt")) }),
}));
vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({ default: "/assets/pdf.worker.js" }));
vi.mock("jspdf", () => ({ default: class {} }));

const upload = vi.fn(async () => ({ error: null }));
const upsert = vi.fn(async () => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ upload }) },
    from: () => ({ upsert }),
  },
}));

import { aufHochladbareGroesse } from "@/lib/unterlagenVerkleinern";
import { ladeHoch } from "@/lib/partnerUnterlagenStore";

const MB = 1024 * 1024;

/** Ein PDF der gewünschten Größe, ohne wirklich so viel Speicher zu belegen. */
function pdf(groesse: number): File {
  return {
    name: "scan.pdf",
    type: "application/pdf",
    size: groesse,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as File;
}

beforeEach(() => {
  upload.mockClear();
  upsert.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Verkleinern scheitert", () => {
  it("meldet den Fehler, statt still das Original zu liefern", async () => {
    const original = pdf(19 * MB);
    const r = await aufHochladbareGroesse(original);
    expect(r.datei).toBe(original);
    expect(r.verkleinert).toBe(false);
    expect(r.fehler).toMatch(/nicht verkleinern/);
  });

  it("lehnt eine zu große Datei mit dem echten Grund ab", async () => {
    const r = await ladeHoch("u1", "personalausweis", pdf(25 * MB));
    expect(r.ok).toBe(false);
    expect(r.grund).toMatch(/nicht verkleinern/);
    expect(r.grund).not.toMatch(/nicht weit genug/);
    expect(upload).not.toHaveBeenCalled();
  });

  it("lädt eine noch passende Datei hoch und gibt den Fehler mit", async () => {
    const r = await ladeHoch("u1", "personalausweis", pdf(19 * MB));
    expect(r.ok).toBe(true);
    expect(r.verkleinert).toBe(false);
    expect(r.verkleinernFehler).toMatch(/nicht verkleinern/);
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
