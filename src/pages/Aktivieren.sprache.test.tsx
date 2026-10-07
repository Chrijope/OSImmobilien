import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "@/i18n";
import Aktivieren from "./Aktivieren";

/*
 * Sprache der Aktivierungsseite (Plan Kundensprache, Etappe 1).
 *
 * Die Seite liest ihre Adresse direkt aus `window.location`, deshalb setzt der
 * Test sie über die History. i18n läuft echt, nur der Supabase-Aufruf ist
 * nachgebaut.
 */

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    auth: { signOut: vi.fn(async () => ({ error: null })) },
  },
}));

const INFO = {
  email: "max@example.com",
  kundeName: "Max Muster",
  portal: "kunde",
  kontaktId: "k-1",
  role: "kunde",
  next: "",
  expiresAt: "2026-10-02T12:00:00Z",
  used: false,
  expired: false,
};

function zeige(adresse: string) {
  window.history.replaceState({}, "", adresse);
  return render(
    <MemoryRouter>
      <Aktivieren />
    </MemoryRouter>,
  );
}

/** So kommt eine Fehlerantwort (Status 4xx) aus `supabase.functions.invoke`. */
function fehlerAntwort(koerper: Record<string, unknown>) {
  return {
    data: null,
    error: {
      message: "Edge Function returned a non-2xx status code",
      context: { json: async () => koerper },
    },
  };
}

afterEach(async () => {
  await i18n.changeLanguage("de");
  window.history.replaceState({}, "", "/");
  invoke.mockReset();
});

describe("Aktivierungsseite: Sprache", () => {
  it("übernimmt ohne lang in der Adresse die Profilsprache aus der Token-Info", async () => {
    invoke.mockResolvedValue({ data: { ...INFO, sprache: "en" }, error: null });
    zeige("/aktivieren?t=abc123");

    expect(await screen.findByText("Hello Max,")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activate account" })).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  it("bleibt mit ?lang=de deutsch, auch wenn die Info Englisch sagt", async () => {
    invoke.mockResolvedValue({ data: { ...INFO, sprache: "en" }, error: null });
    zeige("/aktivieren?t=abc123&lang=de");

    expect(await screen.findByText("Hallo Max,")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Konto aktivieren" })).toBeInTheDocument();
    expect(i18n.language).toBe("de");
    expect(document.documentElement.lang).toBe("de");
  });

  it("bleibt ohne sprache in der Info (ältere Function) bei der aktuellen Anzeige", async () => {
    invoke.mockResolvedValue({ data: INFO, error: null });
    zeige("/aktivieren?t=abc123");

    expect(await screen.findByText("Hallo Max,")).toBeInTheDocument();
    expect(i18n.language).toBe("de");
  });

  it("übersetzt einen Fehler über seinen code", async () => {
    await i18n.changeLanguage("en");
    invoke.mockResolvedValue(fehlerAntwort({ error: "Token nicht gefunden", code: "token_not_found" }));
    zeige("/aktivieren?t=abc123");

    expect(await screen.findByText("This activation link wasn't found.")).toBeInTheDocument();
    expect(screen.getByText("Activation link not valid")).toBeInTheDocument();
  });

  it("zeigt ohne code die Meldung des Servers statt der technischen Fehlermeldung", async () => {
    invoke.mockResolvedValue(fehlerAntwort({ error: "Token nicht gefunden" }));
    zeige("/aktivieren?t=abc123");

    expect(await screen.findByText("Token nicht gefunden")).toBeInTheDocument();
    expect(screen.queryByText(/non-2xx/)).not.toBeInTheDocument();
  });
});
