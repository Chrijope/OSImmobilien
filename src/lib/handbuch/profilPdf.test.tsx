/**
 * Das Handbuch-PDF aus dem Kundenprofil (Karte „Aus dem Konfigurator“).
 *
 * Hält fest: Der Knopf erscheint nur mit allen sechs Antworten, und an
 * `baueHandbuch` gehen dieselben Angaben wie auf der Ergebnisseite (Antworten
 * vom Kontakt, Name, Sprache, Partner über sein Kürzel, Link im PDF).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const baueHandbuch = vi.fn((ang: unknown) => ({ gebaut: ang }));
const ladeHandbuchPdfHerunter = vi.fn(async () => {});
const ladeBeraterAusKuerzel = vi.fn(async (slug: string) => ({
  status: "ok" as const,
  berater: { userId: "u1", slug, name: "Max Partner", position: "", telefon: "0123", email: "max@example.org", bild: null, buchungslink: "https://example.org/termin", metaPixelId: null, pixelVerantwortlicher: null },
}));
const profile: Record<string, { vp_slug?: string; gesperrt?: boolean }> = {
  p1: { vp_slug: "max-partner" },
  p2: { vp_slug: "gesperrt", gesperrt: true },
};

vi.mock("@/lib/handbuch/inhalt", async (orig) => ({ ...(await orig<object>()), baueHandbuch }));
vi.mock("@/lib/handbuch/handbuchPdf", async (orig) => ({ ...(await orig<object>()), ladeHandbuchPdfHerunter }));
vi.mock("@/components/handbuch/Rahmen", async (orig) => ({ ...(await orig<object>()), ladeBeraterAusKuerzel }));
vi.mock("@/lib/dataCache", async (orig) => ({
  ...(await orig<object>()),
  cacheGetById: (tabelle: string, id: string) => (tabelle === "profiles" ? profile[id] : undefined),
}));

import RechnerAngaben from "@/components/kunden/RechnerAngaben";
import { handbuchAngabenAusKontakt } from "./profilPdf";

const TOKEN = "a".repeat(64);
const ANTWORTEN = { ziel: "steuer", beruf: "angestellt", brutto: "80_120", ueberschuss: "1000_1500", eigenkapital: "30_60", start: "drei_monate" };
const funnel = (antworten: object = ANTWORTEN) => ({
  handbuchFunnel: { antworten, ausgang: "passt", zeitpunkt: "2026-09-26T10:00:00.000Z", token: TOKEN },
}) as never;

beforeEach(() => {
  baueHandbuch.mockClear();
  ladeHandbuchPdfHerunter.mockClear();
  ladeBeraterAusKuerzel.mockClear();
});

describe("Knopf „Handbuch als PDF“", () => {
  it("erscheint mit allen sechs Antworten", () => {
    render(<RechnerAngaben meta={funnel()} vorname="Erika" nachname="Muster" />);
    expect(screen.getByRole("button", { name: /Handbuch als PDF/ })).toBeTruthy();
  });

  it("fehlt bei unvollständigen Antworten und bei der offenen Selbstauskunft", () => {
    const { ziel: _weg, ...ohneZiel } = ANTWORTEN;
    const { unmount } = render(<RechnerAngaben meta={funnel(ohneZiel)} />);
    expect(screen.queryByRole("button", { name: /Handbuch als PDF/ })).toBeNull();
    unmount();
    render(<RechnerAngaben meta={{ handbuchSelbstauskunft: { zeitpunkt: "2026-09-26T10:00:00.000Z" } } as never} />);
    expect(screen.queryByRole("button", { name: /Handbuch als PDF/ })).toBeNull();
  });

  it("gibt Antworten, Name, Sprache und den zuständigen Partner an das Handbuch", async () => {
    render(<RechnerAngaben meta={{ ...(funnel() as object), kundenSprache: "en" } as never} vorname="Erika" nachname="Muster" zustaendigId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /Handbuch als PDF/ }));
    await waitFor(() => expect(ladeHandbuchPdfHerunter).toHaveBeenCalledTimes(1));
    expect(ladeBeraterAusKuerzel).toHaveBeenCalledWith("max-partner");
    expect(baueHandbuch).toHaveBeenCalledWith({
      antworten: ANTWORTEN,
      vorname: "Erika",
      nachname: "Muster",
      datum: "26 Sep 2026",
      saLink: `https://portal.more.immo/handbuch/ergebnis/${TOKEN}/selbstauskunft?lang=en`,
      partner: { name: "Max Partner", email: "max@example.org", telefon: "0123", buchungslink: "https://example.org/termin" },
      sprache: "en",
    });
    expect(ladeHandbuchPdfHerunter).toHaveBeenCalledWith(baueHandbuch.mock.results[0].value);
  });
});

describe("handbuchAngabenAusKontakt", () => {
  it("nimmt Deutsch ohne Sprachangabe und lässt den Link weg, wenn die Selbstauskunft vorliegt", () => {
    const ang = handbuchAngabenAusKontakt({ vorname: "Erika", nachname: "Muster", meta: funnel() }, { partnerKuerzel: null, saAusgefuellt: true });
    expect(ang?.sprache).toBe("de");
    expect(ang?.datum).toBe("26.09.2026");
    expect(ang?.saLink).toBeNull();
  });

  it("gibt ohne Antworten nichts zurück", () => {
    expect(handbuchAngabenAusKontakt({ meta: {} }, { partnerKuerzel: null, saAusgefuellt: false })).toBeNull();
  });
});

describe("gesperrter Zuständiger", () => {
  it("steht nicht im Kopf, wie auf der Ergebnisseite", async () => {
    render(<RechnerAngaben meta={funnel()} vorname="Erika" nachname="Muster" zustaendigId="p2" />);
    fireEvent.click(screen.getByRole("button", { name: /Handbuch als PDF/ }));
    await waitFor(() => expect(ladeHandbuchPdfHerunter).toHaveBeenCalledTimes(1));
    expect(ladeBeraterAusKuerzel).not.toHaveBeenCalled();
    expect(baueHandbuch.mock.calls[0][0]).toMatchObject({ partner: null, saLink: `https://portal.more.immo/handbuch/ergebnis/${TOKEN}/selbstauskunft` });
  });
});
