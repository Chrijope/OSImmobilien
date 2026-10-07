import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Kundenwächter nach der Entscheidung vom 25.09.2026: Zwei-Faktor freiwillig.
 *
 *   - Kunde ohne Zwei-Faktor kommt ins Portal, darüber steht der Hinweis.
 *   - Nach dem Schließen erscheint der Hinweis nicht sofort wieder.
 *   - Kunde mit Zwei-Faktor muss den Code eingeben, vorher sieht er nichts.
 *   - Interne Rollen laufen durch diesen Wächter unverändert durch.
 */

// jsdom bringt hier keinen localStorage mit, der Hinweis merkt sich das Schließen darin.
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

const mocks = vi.hoisted(() => ({
  rolle: "kunde" as string,
  faktoren: [] as Array<{ id: string; status: string; factor_type: string }>,
  aal: "aal1" as string,
  einstellungen: {} as Record<string, unknown>,
  listFactors: vi.fn(),
  getAal: vi.fn(),
  invoke: vi.fn(),
  setUserSetting: vi.fn(),
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({
    user: { role: mocks.rolle, name: "Otto Hans" },
    authUser: { id: "auth-otto", email: "otto@example.com" },
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors: mocks.listFactors,
        getAuthenticatorAssuranceLevel: mocks.getAal,
        challenge: vi.fn(async () => ({ data: { id: "ch-1" }, error: null })),
        verify: vi.fn(async () => ({ data: {}, error: null })),
      },
    },
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (key: string, fallback: unknown) => (key in mocks.einstellungen ? mocks.einstellungen[key] : fallback),
  setUserSetting: mocks.setUserSetting,
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

import i18n from "@/i18n";
import { KundenMfaGuard } from "./KundenMfaGuard";

function waechter() {
  return render(
    <MemoryRouter>
      <KundenMfaGuard>
        <p>Portalinhalt</p>
      </KundenMfaGuard>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  cleanup();
  localStorage.clear();
  mocks.rolle = "kunde";
  mocks.faktoren = [];
  mocks.aal = "aal1";
  mocks.einstellungen = {};
  mocks.listFactors.mockReset();
  mocks.listFactors.mockImplementation(async () => ({
    data: { totp: mocks.faktoren, all: mocks.faktoren },
    error: null,
  }));
  mocks.getAal.mockReset();
  mocks.getAal.mockImplementation(async () => ({ data: { currentLevel: mocks.aal }, error: null }));
  mocks.invoke.mockReset();
  mocks.setUserSetting.mockReset();
  await i18n.changeLanguage("de");
});

describe("KundenMfaGuard: Zwei-Faktor freiwillig", () => {
  it("lässt einen Kunden ohne Zwei-Faktor ins Portal und zeigt den Hinweis", async () => {
    waechter();

    expect(await screen.findByText("Portalinhalt")).toBeInTheDocument();
    expect(screen.getByText("Schütze dein Konto mit der Zwei-Faktor-Anmeldung")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jetzt einrichten" })).toHaveAttribute("href", "/kunde/einstellungen?tab=sicherheit");
    expect(screen.queryByText("Sicherheitscode eingeben")).not.toBeInTheDocument();
  });

  it("zeigt den Hinweis nicht auf der Einstellungsseite, dort steht die Einrichtung selbst", async () => {
    render(
      <MemoryRouter initialEntries={["/kunde/einstellungen?tab=sicherheit"]}>
        <KundenMfaGuard>
          <p>Portalinhalt</p>
        </KundenMfaGuard>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Portalinhalt")).toBeInTheDocument();
    expect(screen.queryByText("Schütze dein Konto mit der Zwei-Faktor-Anmeldung")).not.toBeInTheDocument();
  });

  it("zeigt den Hinweis auf Englisch, wenn das Portal englisch ist", async () => {
    await i18n.changeLanguage("en");
    waechter();

    expect(await screen.findByText("Protect your account with two-factor sign-in")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Later" })).toBeInTheDocument();
  });

  it("zeigt den Hinweis nach dem Schließen nicht sofort wieder", async () => {
    waechter();
    fireEvent.click(await screen.findByRole("button", { name: "Später" }));

    expect(screen.queryByText("Schütze dein Konto mit der Zwei-Faktor-Anmeldung")).not.toBeInTheDocument();
    expect(screen.getByText("Portalinhalt")).toBeInTheDocument();
    // Im Konto gemerkt, damit es auch auf anderen Geräten gilt.
    expect(mocks.setUserSetting).toHaveBeenCalledWith("kunde_2fa_hinweis_geschlossen_am", expect.any(String));

    // Nächster Seitenwechsel: Der Wächter wird neu aufgebaut, der Hinweis bleibt weg.
    cleanup();
    waechter();
    expect(await screen.findByText("Portalinhalt")).toBeInTheDocument();
    expect(screen.queryByText("Schütze dein Konto mit der Zwei-Faktor-Anmeldung")).not.toBeInTheDocument();
  });

  it("zeigt den Hinweis nicht, wenn er auf einem anderen Gerät kürzlich geschlossen wurde", async () => {
    mocks.einstellungen = { kunde_2fa_hinweis_geschlossen_am: new Date().toISOString() };
    waechter();

    expect(await screen.findByText("Portalinhalt")).toBeInTheDocument();
    expect(screen.queryByText("Schütze dein Konto mit der Zwei-Faktor-Anmeldung")).not.toBeInTheDocument();
  });

  it("zeigt den Hinweis wieder, wenn das Schließen länger als 30 Tage her ist", async () => {
    localStorage.setItem("mi_kunde_2fa_hinweis_auth-otto", new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString());
    waechter();

    expect(await screen.findByText("Schütze dein Konto mit der Zwei-Faktor-Anmeldung")).toBeInTheDocument();
  });

  it("verlangt von einem Kunden mit Zwei-Faktor den Code und zeigt vorher nichts", async () => {
    mocks.faktoren = [{ id: "faktor-1", status: "verified", factor_type: "totp" }];
    waechter();

    expect(await screen.findByText("Sicherheitscode eingeben")).toBeInTheDocument();
    expect(screen.queryByText("Portalinhalt")).not.toBeInTheDocument();
    expect(screen.queryByText("Schütze dein Konto mit der Zwei-Faktor-Anmeldung")).not.toBeInTheDocument();
    // Kein Weg vorbei: kein Knopf „Später“ oder „Überspringen“.
    expect(screen.queryByRole("button", { name: /Später|Überspringen/ })).not.toBeInTheDocument();
  });

  it("lässt einen Kunden mit Zwei-Faktor nach dem Code (aal2) ohne Hinweis hinein", async () => {
    mocks.faktoren = [{ id: "faktor-1", status: "verified", factor_type: "totp" }];
    mocks.aal = "aal2";
    waechter();

    expect(await screen.findByText("Portalinhalt")).toBeInTheDocument();
    expect(screen.queryByText("Sicherheitscode eingeben")).not.toBeInTheDocument();
    expect(screen.queryByText("Schütze dein Konto mit der Zwei-Faktor-Anmeldung")).not.toBeInTheDocument();
  });

  it("schickt Kunden ohne Zwei-Faktor nicht mehr in eine Pflichteinrichtung, auch lange nach dem ersten Login", async () => {
    waechter();

    expect(await screen.findByText("Portalinhalt")).toBeInTheDocument();
    expect(screen.queryByText(/Zwei-Faktor-Authentifizierung einrichten/)).not.toBeInTheDocument();
    expect(screen.queryByText(/verpflichtend/)).not.toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalledWith("manage-mfa", expect.objectContaining({ body: { action: "enroll" } }));
  });

  it("lässt interne Rollen ohne Prüfung durch", async () => {
    for (const rolle of ["admin", "vertriebspartner", "backoffice"]) {
      cleanup();
      mocks.rolle = rolle;
      waechter();
      expect(screen.getByText("Portalinhalt")).toBeInTheDocument();
      expect(screen.queryByText("Schütze dein Konto mit der Zwei-Faktor-Anmeldung")).not.toBeInTheDocument();
    }
    expect(mocks.listFactors).not.toHaveBeenCalled();
  });
});

describe("KundenMfaGuard: Codeabfrage", () => {
  it("prüft den Code im Browser, damit die Sitzung aal2 bekommt", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    mocks.faktoren = [{ id: "faktor-1", status: "verified", factor_type: "totp" }];
    const neuLaden = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload: neuLaden });
    waechter();

    const feld = await screen.findByLabelText("Sicherheitscode eingeben");
    fireEvent.change(feld, { target: { value: "123456" } });

    await waitFor(() => expect(supabase.auth.mfa.verify).toHaveBeenCalledWith({ factorId: "faktor-1", challengeId: "ch-1", code: "123456" }));
    await waitFor(() => expect(neuLaden).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });
});
