/**
 * Das Anfrageformular der Partnerseite (`/vp/:slug`) schickt die
 * Kampagnenkennung aus dem Werbelink und die Cookie-Einwilligung an
 * `submit-lead`.
 *
 * Der Weg durch die sieben Schritte wird abgekürzt: Das Formular stellt einen
 * Entwurf aus dem Browser wieder her, hier steht er auf dem letzten Schritt.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LeadFunnelDialog from "@/components/landing/LeadFunnelDialog";
import { setzeSpeicherAttrappe } from "@/test/speicherAttrappe";
import { _einwilligungVergessen, speichereCookieEinwilligung } from "@/lib/cookieEinwilligung";
import { _kampagneVergessen } from "@/lib/kampagnenKennung";

let gesendet: Record<string, any> | null = null;

function entwurfAufLetztemSchritt() {
  window.localStorage.setItem(
    "mi_lead_funnel_entwurf",
    JSON.stringify({
      gespeichertAm: Date.now(),
      step: 7,
      data: {
        employment: "angestellt",
        income: "3000-4000",
        hasProperty: "nein",
        equity: "",
        equityAmount: "10000-25000",
        goals: ["vermoegen"],
        investmentVolume: "200-300",
        timeline: "sofort",
        riskTolerance: "",
        firstName: "Max",
        lastName: "Muster",
        email: "max@example.org",
        phone: "0170 1234567",
        preferredTime: "vormittags",
      },
    }),
  );
}

async function absenden() {
  render(
    <MemoryRouter>
      <LeadFunnelDialog open onOpenChange={() => {}} beraterName="Max Berater" beraterSlug="max-berater" />
    </MemoryRouter>,
  );
  // Der Pflichthaken zur Datenschutzerklärung, der erste Haken im Formular.
  fireEvent.click(screen.getAllByRole("checkbox")[0]);
  fireEvent.click(screen.getByRole("button", { name: /Erstgespräch anfordern/ }));
  await waitFor(() => expect(gesendet).not.toBeNull());
  return gesendet!;
}

beforeEach(() => {
  setzeSpeicherAttrappe();
  setzeSpeicherAttrappe("sessionStorage");
  _einwilligungVergessen();
  _kampagneVergessen();
  gesendet = null;
  entwurfAufLetztemSchritt();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      gesendet = JSON.parse(String(init?.body ?? "{}"));
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  _einwilligungVergessen();
  _kampagneVergessen();
});

describe("Die Anfrage von der Partnerseite", () => {
  it("trägt die UTM-Parameter aus dem Werbelink", async () => {
    window.history.replaceState(
      null,
      "",
      "/vp/max-berater?utm_source=facebook&utm_medium=paid_social&utm_campaign=meta_herbst_steuer_video2&utm_content=video2&utm_term=muenchen&fbclid=AbC123",
    );
    const body = await absenden();
    expect(body.meta.kampagne).toMatchObject({
      utmSource: "facebook",
      utmMedium: "paid_social",
      utmCampaign: "meta_herbst_steuer_video2",
      utmContent: "video2",
      utmTerm: "muenchen",
      fbclid: "AbC123",
    });
    expect(body.meta.microseiteSlug).toBe("max-berater");
  });

  it("schickt ohne Werbelink keine erfundene Kampagne", async () => {
    window.history.replaceState(null, "", "/vp/max-berater");
    const body = await absenden();
    expect("kampagne" in body.meta).toBe(false);
  });

  it("sagt dem Server ohne Einwilligung ausdrücklich: kein Marketing", async () => {
    const body = await absenden();
    expect(body.cookieEinwilligung).toMatchObject({ marketing: false });
    // Ohne geladenes Pixel gibt es auch keine Event-ID für Meta.
    expect(body.metaEventId).toBeUndefined();
  });

  it("gibt die Marketing-Einwilligung weiter, wenn sie erteilt ist", async () => {
    speichereCookieEinwilligung({ statistik: true, marketing: true });
    const body = await absenden();
    expect(body.cookieEinwilligung).toMatchObject({ statistik: true, marketing: true });
  });
});
