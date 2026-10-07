import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const geladen: string[] = [];
vi.mock("@/lib/umgebung", () => ({
  geocode: vi.fn(async (a: string) => { geladen.push(a); return { lat: 48, lng: 11 }; }),
  umgebung: vi.fn(async () => []),
  istVorgeladen: vi.fn((a: string) => a.includes("schon-da")),
}));

const { umgebungVorladen, _vorladenZuruecksetzen } = await import("@/lib/umgebungVorladen");

const obj = (adresse: string, plz = "80331", ort = "München") =>
  ({ id: adresse, adresse, plz, ort, wohnungen: [] }) as never;

describe("Umgebung vorladen", () => {
  beforeEach(() => { geladen.length = 0; _vorladenZuruecksetzen(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("laedt nur, was noch nicht im Speicher liegt", async () => {
    umgebungVorladen([obj("Hauptstr 1"), obj("schon-da 2")]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(geladen).toEqual(["Hauptstr 1, 80331 München"]);
  });

  it("fragt dieselbe Adresse nur einmal", async () => {
    umgebungVorladen([obj("Hauptstr 1"), obj("Hauptstr 1")]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(geladen).toHaveLength(1);
  });

  it("laesst Pausen zwischen den Anfragen, sonst sperrt OpenStreetMap", async () => {
    umgebungVorladen([obj("A 1"), obj("B 2"), obj("C 3")]);
    await vi.advanceTimersByTimeAsync(100);
    expect(geladen).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3100);
    expect(geladen).toHaveLength(2);
  });

  it("laeuft nur einmal, auch bei mehrfachem Aufruf", async () => {
    umgebungVorladen([obj("A 1")]);
    umgebungVorladen([obj("B 2")]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(geladen).toEqual(["A 1, 80331 München"]);
  });

  it("ueberspringt Objekte ohne brauchbare Adresse", async () => {
    umgebungVorladen([obj("", "", ""), obj("Hauptstr 1")]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(geladen).toEqual(["Hauptstr 1, 80331 München"]);
  });

  it("haelt nicht an, wenn eine Adresse scheitert", async () => {
    const { geocode } = await import("@/lib/umgebung");
    (geocode as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("nicht gefunden"));
    umgebungVorladen([obj("Kaputt 1"), obj("Gut 2")]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(geladen).toContain("Gut 2, 80331 München");
  });
});
