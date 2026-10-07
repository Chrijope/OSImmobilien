import { render, act, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

/*
 * Externer Kalender und interner Videocall sind seit dem 27.09.2026 getrennt.
 * Ein Vertriebspartner ohne Videocall-Freigabe, aber mit hinterlegtem
 * externem Kalender, muss „Kunde wählt selbst“ weiter nutzen koennen: Link
 * auf die Terminseite anlegen und an den Kunden schicken. Den internen
 * Videoraum und „Unsere Zeiten“ sieht er nicht.
 */
const m = vi.hoisted(() => ({
  erstelleLink: vi.fn(),
  ladeTerminarten: vi.fn(async () => []),
  mail: vi.fn(async () => true),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useVideocallFreigabe", () => ({ useVideocallFreigabe: () => ({ darf: false, laedt: false }) }));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ user: { id: "vp1", name: "Partner", role: "vertriebspartner" } }) }));
vi.mock("@/lib/eigeneBuchungslinks", async (original) => ({
  ...(await original<typeof import("@/lib/eigeneBuchungslinks")>()),
  useEigeneBuchungslinks: () => ({ links: { erstgespraech: "https://calendly.com/partner/erstgespraech" }, laedt: false }),
}));
vi.mock("@/lib/buchungStore", async (original) => ({
  istExternerLink: (await original<typeof import("@/lib/buchungStore")>()).istExternerLink,
  ladeTerminarten: m.ladeTerminarten,
  ladeLinks: async () => [],
  erstelleLink: m.erstelleLink,
  setzeLinkAktiv: vi.fn(),
  buchungUrl: (t: string) => `https://osimmobilien.netlify.app/termin/${t}`,
}));
vi.mock("@/lib/buchungslinkMail", () => ({ versendeBuchungslinkMail: m.mail }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: m.toast }), toast: m.toast }));
vi.mock("@/lib/meetingSpeichern", () => ({ speichereMeeting: vi.fn() }));
vi.mock("@/lib/meetingEinladung", () => ({ versendeMeetingEinladung: vi.fn(), versendeGastEinladungen: vi.fn() }));
vi.mock("@/lib/aktivitaetenStore", () => ({ addAktivitaet: vi.fn() }));
vi.mock("@/lib/aufgabenStore", () => ({ addAufgabe: vi.fn() }));
vi.mock("@/lib/loadAllUsers", () => ({ loadAllUsers: () => [] }));
vi.mock("@/lib/investmentsStore", () => ({ getInvestmentsByKontakt: () => [] }));
vi.mock("@/lib/beraterProfil", () => ({ ladeBerater: () => ({ name: "Partner" }) }));
vi.mock("@/lib/userSettingsCache", () => ({ getUserSetting: () => null }));
vi.mock("@/lib/kontaktPipeline", () => ({ istTerminInZukunft: () => true, heuteIso: () => "2026-09-27", TERMIN_ZUKUNFT_MELDUNG: "Zukunft" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));

import { QuickActionDialog } from "./QuickActionDialog";

beforeEach(() => {
  vi.clearAllMocks();
  const speicher = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => speicher.set(k, v),
    removeItem: (k: string) => speicher.delete(k),
  });
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: async () => undefined } });
  m.erstelleLink.mockResolvedValue({
    link: {
      id: "l1", token: "terminwahl-abc", mitarbeiter_id: "vp1", kontakt_id: "kunde", kontakt_snapshot: {},
      terminart_id: null, aktiv: true, einmalig: false, gueltig_bis: null, created_at: "2026-09-27", ziel: "extern",
    },
    fehler: null,
  });
});
afterEach(cleanup);

async function anzeigen() {
  await act(async () => {
    render(
      <QuickActionDialog art="meeting" kundeId="kunde" kundeName="Testkunde" kundeEmail="kunde@example.test"
        kundeTelefon="" berater="Partner" onClose={vi.fn()} onSaved={vi.fn()} />,
    );
  });
}

describe("Meeting: externer Kalender ohne Videocall", () => {
  /*
    Seit dem 29.09.2026 ist die Terminseite nur noch für den angemeldeten
    Partner, dem der Link gehört. Ein Link darauf für den Kunden, zum Kopieren
    oder per Mail, führte ins Leere. Der Partner trägt den Termin selbst ein,
    über „Terminseite öffnen“ unter „Termin festlegen“.
  */
  it("bietet keinen Terminseiten-Link für den Kunden mehr an, nur „Terminseite öffnen“", async () => {
    await anzeigen();
    expect(screen.queryByText("Kunde wählt selbst")).toBeNull();
    expect(screen.queryByRole("button", { name: /Terminseite erstellen/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "An Kunden senden" })).toBeNull();
    expect(screen.getByText("Terminseite öffnen")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Terminseite öffnen"));
    await waitFor(() => expect(m.erstelleLink).toHaveBeenCalledTimes(1));
    expect(m.erstelleLink.mock.calls[0][0]).toMatchObject({ ziel: "extern", terminartId: null });
    expect(m.mail).not.toHaveBeenCalled();
  });

  it("zeigt den internen Videoraum nicht und laedt keine internen Terminarten", async () => {
    await anzeigen();
    expect(screen.queryByText("Eigener Raum, Link entsteht automatisch")).toBeNull();
    expect(m.ladeTerminarten).not.toHaveBeenCalled();
  });
});
