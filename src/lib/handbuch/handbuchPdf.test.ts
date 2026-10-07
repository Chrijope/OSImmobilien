/**
 * Das Handbuch als PDF: Deckblatt plus Seiten, Inhaltsverzeichnis mit den
 * richtigen Seitenzahlen, Link zur Selbstauskunft.
 *
 * Schrift, Logo und Bildmarke lädt der Test nicht aus dem Netz; jsPDF fällt
 * dann auf Helvetica zurück, am Seitenaufbau ändert das wenig.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { baueHandbuch } from "./inhalt";
import { erzeugeHandbuchPdf, gibPdfAus, handbuchDateiname } from "./handbuchPdf";

vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("kein Netz im Test")));

describe("Handbuch-PDF", () => {
  it("entsteht mit rund 20 Seiten und verlinkt die Selbstauskunft", async () => {
    const h = baueHandbuch({
      antworten: { ziel: "steuer", beruf: "angestellt", brutto: "80_120", ueberschuss: "1000_1500", eigenkapital: "30_60", start: "drei_monate" },
      vorname: "Erika",
      nachname: "Muster",
      datum: "26.09.2026",
      saLink: "https://portal.more.immo/handbuch/selbstauskunft/abc",
    });
    const doc = await erzeugeHandbuchPdf(h);
    const seiten = doc.getNumberOfPages();
    expect(seiten).toBeGreaterThanOrEqual(19);
    expect(seiten).toBeLessThanOrEqual(24);
    const roh = doc.output();
    expect(roh).toContain("https://portal.more.immo/handbuch/selbstauskunft/abc");
  }, 30000);

  it("entsteht auf Englisch mit englischen festen Wörtern und demselben Umfang", async () => {
    const h = baueHandbuch({
      antworten: { ziel: "alter", beruf: "beamter", brutto: "50_80", ueberschuss: "500_1000", eigenkapital: "10_30", start: "sofort", gemeinsamVeranlagt: true },
      vorname: "Erika",
      nachname: "Muster",
      datum: "26 Sep 2026",
      saLink: "https://portal.more.immo/sa/abc?lang=en",
      sprache: "en",
    });
    const doc = await erzeugeHandbuchPdf(h);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(19);
    const roh = doc.output();
    // Der Seitentext ist komprimiert; lesbar bleiben Titel und Links.
    expect(roh).toContain("Your personal property handbook for Erika Muster");
    expect(roh).toContain("https://portal.more.immo/sa/abc?lang=en");
  }, 30000);

  it("baut einen sauberen Dateinamen", () => {
    expect(handbuchDateiname("Jörg Müller-Lüdenscheidt")).toBe("MOREImmo_Immobilienhandbuch_Jorg_Muller_Ludenscheidt.pdf");
    expect(handbuchDateiname("")).toBe("MOREImmo_Immobilienhandbuch.pdf");
    expect(handbuchDateiname("Erika Muster", "en")).toBe("MOREImmo_Property_Handbook_Erika_Muster.pdf");
  });
});

describe("PDF-Ausgabe auf dem Handy", () => {
  const blob = new Blob(["%PDF"], { type: "application/pdf" });
  const klicks: string[] = [];
  const setzeBrowser = (ua: string, share?: (d: ShareData) => Promise<void>) => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
    Object.defineProperty(navigator, "canShare", { configurable: true, value: share ? () => true : undefined });
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
  };
  const beobachteDownload = () => {
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      klicks.push(this.download);
    });
  };
  afterEach(() => {
    vi.restoreAllMocks();
    klicks.length = 0;
  });

  it("lädt im normalen Browser (Safari, Chrome) über einen Download-Link", async () => {
    beobachteDownload();
    const share = vi.fn();
    setzeBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1", share);
    expect(await gibPdfAus(blob, "Handbuch.pdf")).toBe("geladen");
    expect(klicks).toEqual(["Handbuch.pdf"]);
    expect(share).not.toHaveBeenCalled();
  });

  it("teilt im Instagram-Browser über das Teilen-Menü", async () => {
    beobachteDownload();
    const share = vi.fn().mockResolvedValue(undefined);
    setzeBrowser("Mozilla/5.0 (iPhone) Instagram 300.0", share);
    expect(await gibPdfAus(blob, "Handbuch.pdf")).toBe("geteilt");
    expect((share.mock.calls[0][0] as ShareData).files?.[0].name).toBe("Handbuch.pdf");
    expect(klicks).toEqual([]);
  });

  it("lädt nichts nach, wenn der Besucher das Teilen-Menü schließt", async () => {
    beobachteDownload();
    setzeBrowser("FBAN/FBIOS", vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" })));
    expect(await gibPdfAus(blob, "Handbuch.pdf")).toBe("abgebrochen");
    expect(klicks).toEqual([]);
  });

  it("fällt auf den Download zurück, wenn das Teilen verweigert wird", async () => {
    beobachteDownload();
    setzeBrowser("FBAN/FBIOS", vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" })));
    expect(await gibPdfAus(blob, "Handbuch.pdf")).toBe("geladen");
    expect(klicks).toEqual(["Handbuch.pdf"]);
  });
});
