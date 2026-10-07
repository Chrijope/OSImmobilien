/**
 * Der Lead aus dem Funnel der Mikroseite übernimmt die Seitensprache
 * (Plan Kundensprache, Etappe 6).
 *
 * Der Funnel startet aus einem gespeicherten Entwurf direkt im letzten
 * Schritt, damit der Test nicht sieben Schritte durchklicken muss. Geprüft
 * wird, was an `submit-lead` geht: `sprache` und die Einwilligung im Wortlaut
 * der Seite. Die Notizen für den Partner bleiben deutsch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LeadFunnelDialog from "@/components/landing/LeadFunnelDialog";
import { SeitenSpracheProvider } from "@/components/SeitenSprache";

const ENTWURF = {
  gespeichertAm: Date.now(),
  step: 7,
  data: {
    employment: "angestellt", income: "80k", hasProperty: "nein", equity: "", equityAmount: "20k",
    goals: ["vermoegen"], investmentVolume: "300k", timeline: "sofort", riskTolerance: "",
    firstName: "Max", lastName: "Mustermann", email: "max@example.com", phone: "+49 170 1234567",
    preferredTime: "vormittags",
  },
};

let rumpf: Record<string, unknown> | null = null;

beforeEach(() => {
  rumpf = null;
  const werte = new Map<string, string>([["mi_lead_funnel_entwurf", JSON.stringify(ENTWURF)]]);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => werte.get(k) ?? null,
    setItem: (k: string, v: string) => void werte.set(k, String(v)),
    removeItem: (k: string) => void werte.delete(k),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      rumpf = JSON.parse(init.body);
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ success: true }) } as unknown as Response;
    }),
  );
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["de-DE"]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function funnel(adresse: string) {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <SeitenSpracheProvider>
        <LeadFunnelDialog open onOpenChange={() => {}} beraterName="Max Berater" beraterSlug="max-berater" />
      </SeitenSpracheProvider>
    </MemoryRouter>,
  );
}

async function absenden(knopf: RegExp) {
  fireEvent.click(screen.getAllByRole("checkbox")[0]);
  fireEvent.click(screen.getByRole("button", { name: knopf }));
  await waitFor(() => expect(rumpf).not.toBeNull());
}

describe("LeadFunnelDialog: der Lead übernimmt die Sprache", () => {
  it("auf Englisch geht `sprache: en` mit der englischen Einwilligung hinaus", async () => {
    funnel("/vp/max-berater?lang=en");
    await absenden(/Request initial consultation/i);
    expect(rumpf?.sprache).toBe("en");
    expect((rumpf?.dsgvo_consent as { version: string }).version).toBe("2026-09-v1-en");
    expect(String(rumpf?.notizen)).toMatch(/^Beruf: angestellt/);
  });

  it("auf Deutsch geht `sprache: de` mit der deutschen Einwilligung hinaus", async () => {
    funnel("/vp/max-berater");
    await absenden(/Erstgespräch anfordern/i);
    expect(rumpf?.sprache).toBe("de");
    expect((rumpf?.dsgvo_consent as { version: string }).version).toBe("2026-09-v1");
  });
});
