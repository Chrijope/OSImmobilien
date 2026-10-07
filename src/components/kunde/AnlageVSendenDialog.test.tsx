import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * Der Dialog haengt an Supabase, PDF-Erzeugung und Nutzerkontext; alles wird
 * durch Attrappen ersetzt. Geprueft wird die Validierung der Adresse und dass
 * beim Senden das erzeugte PDF als Base64 an send-anlage-v geht.
 */
// jsdom bringt hier keinen localStorage mit, derselbe Behelf wie in
// AkademieQuiz.test.tsx.
const speicher = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  writable: true,
  value: {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
    removeItem: (k: string) => { speicher.delete(k); },
    clear: () => speicher.clear(),
  },
});

const { invokeMock, base64Mock, toastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  base64Mock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ authUser: { id: "nutzer-1" } }),
}));
vi.mock("@/lib/anlageVPdf", () => ({
  erzeugeAnlageVPdfBase64: base64Mock,
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("react-i18next", () => ({
  // @/i18n (über portalSprache) meldet sich damit bei i18next an.
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (_schluessel: string, standard?: unknown, werte?: Record<string, unknown>) => {
      let text = typeof standard === "string" ? standard : String(_schluessel);
      const w = (typeof standard === "object" && standard ? standard : werte) as Record<string, unknown> | undefined;
      if (w) for (const [k, v] of Object.entries(w)) text = text.replace(`{{${k}}}`, String(v));
      return text;
    },
  }),
}));

import { AnlageVSendenDialog } from "@/components/kunde/AnlageVSendenDialog";
import type { AnlageVAufstellung } from "@/lib/anlageVExport";

const aufstellung = {
  bezeichnung: "Testwohnung",
  jahr: 2026,
  erstelltAm: "18.08.2026",
  herkunft: "eigen",
  objekt: [],
  einnahmen: [],
  werbungskosten: [],
  erhaltungsBelege: [],
  summeEinnahmen: 0,
  summeWerbungskosten: 0,
  ueberschussVerlust: 0,
  miteigentumsanteilP: 100,
  vermieteteMonate: 12,
  vermieteteMonateAngenommen: false,
  sonderAfaHinweis: "",
  fehlendeAngaben: [],
  unvollstaendig: false,
} as AnlageVAufstellung;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  base64Mock.mockResolvedValue({ base64: "cGRm", dateiname: "anlage-v-vorbereitung_testwohnung_2026.pdf" });
  invokeMock.mockResolvedValue({ data: { success: true }, error: null });
});

const oeffne = () =>
  render(
    <AnlageVSendenDialog aufstellung={aufstellung} open onOpenChange={() => {}} />,
  );

describe("AnlageVSendenDialog", () => {
  it("zeigt Dateiname und Jahr des Anhangs", () => {
    oeffne();
    expect(screen.getByText(/anlage-v-vorbereitung_testwohnung_2026\.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/Veranlagungsjahr 2026/)).toBeInTheDocument();
  });

  it("sendet nicht bei ungueltiger Adresse und zeigt die Validierungsmeldung", async () => {
    oeffne();
    fireEvent.change(screen.getByLabelText(/E-Mail-Adresse des Steuerberaters/), {
      target: { value: "keine-adresse" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Senden/ }));
    expect(invokeMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/gültige E-Mail-Adresse/)).toBeInTheDocument();
  });

  it("schickt das Base64-PDF mit allen Angaben an send-anlage-v und merkt sich die Adresse", async () => {
    oeffne();
    fireEvent.change(screen.getByLabelText(/E-Mail-Adresse des Steuerberaters/), {
      target: { value: "kanzlei@example.de" },
    });
    fireEvent.change(screen.getByLabelText(/Persönliche Nachricht/), {
      target: { value: "Bitte prüfen." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Senden/ }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock).toHaveBeenCalledWith("send-anlage-v", {
      body: {
        empfaengerEmail: "kanzlei@example.de",
        nachricht: "Bitte prüfen.",
        pdfBase64: "cGRm",
        dateiname: "anlage-v-vorbereitung_testwohnung_2026.pdf",
        investmentBezeichnung: "Testwohnung",
        jahr: 2026,
      },
    });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    expect(window.localStorage.getItem("anlagev.steuerberaterEmail.nutzer-1")).toBe("kanzlei@example.de");
  });

  it("meldet einen Fehlschlag als Fehler-Toast und merkt sich die Adresse nicht", async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error("kaputt") });
    oeffne();
    fireEvent.change(screen.getByLabelText(/E-Mail-Adresse des Steuerberaters/), {
      target: { value: "kanzlei@example.de" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Senden/ }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("anlagev.steuerberaterEmail.nutzer-1")).toBeNull();
  });

  it("belegt die zuletzt genutzte Adresse vor", () => {
    window.localStorage.setItem("anlagev.steuerberaterEmail.nutzer-1", "alt@kanzlei.de");
    oeffne();
    expect(screen.getByLabelText(/E-Mail-Adresse des Steuerberaters/)).toHaveValue("alt@kanzlei.de");
  });
});
