import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

/**
 * Einstellungen im Kundenportal: Zwei-Faktor einschalten und ausschalten.
 *
 *   - Ausgeschaltet: Erklärung, was man braucht, und „Einschalten“.
 *   - Einschalten: QR-Code und Schlüssel zum Abtippen, Bestätigung mit Code
 *     im Browser (Sitzung wird aal2), danach Wiederherstellungscodes zum
 *     Herunterladen.
 *   - Ausschalten: nur mit einem aktuellen Code, über `manage-mfa`.
 */

const mocks = vi.hoisted(() => ({
  faktoren: [] as Array<{ id: string; status: string; factor_type: string; created_at?: string }>,
  listFactors: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: "kunde", name: "Otto Hans" }, authUser: { id: "auth-otto", email: "otto@example.com" } }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { mfa: { listFactors: mocks.listFactors, challenge: mocks.challenge, verify: mocks.verify } },
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

import i18n from "@/i18n";
import { KundenZweiFaktor } from "./KundenZweiFaktor";

beforeEach(async () => {
  cleanup();
  mocks.faktoren = [];
  mocks.listFactors.mockReset();
  mocks.listFactors.mockImplementation(async () => ({ data: { totp: mocks.faktoren, all: mocks.faktoren }, error: null }));
  mocks.challenge.mockReset();
  mocks.challenge.mockResolvedValue({ data: { id: "ch-1" }, error: null });
  mocks.verify.mockReset();
  mocks.verify.mockImplementation(async () => {
    mocks.faktoren = [{ id: "neu-1", status: "verified", factor_type: "totp", created_at: "2026-09-25T10:00:00Z" }];
    return { data: {}, error: null };
  });
  mocks.invoke.mockReset();
  mocks.invoke.mockImplementation(async (_name: string, { body }: { body: { action: string } }) => {
    if (body.action === "enroll") return { data: { factorId: "neu-1", qrCode: "data:image/svg+xml;base64,AAAA", secret: "JBSWY3DPEHPK3PXP" }, error: null };
    if (body.action === "generate_recovery_codes") return { data: { codes: ["AAAAA-BBBBB", "CCCCC-DDDDD"] }, error: null };
    if (body.action === "deaktivieren") {
      mocks.faktoren = [];
      return { data: { success: true }, error: null };
    }
    return { data: {}, error: null };
  });
  await i18n.changeLanguage("de");
});

describe("KundenZweiFaktor: einschalten", () => {
  it("erklärt ausgeschaltet, was man braucht, und ist als freiwillig gekennzeichnet", async () => {
    render(<KundenZweiFaktor />);

    expect(await screen.findByText("Die Zwei-Faktor-Anmeldung ist ausgeschaltet")).toBeInTheDocument();
    expect(screen.getByText("Freiwillig")).toBeInTheDocument();
    expect(screen.getByText(/Google Authenticator oder Microsoft Authenticator/)).toBeInTheDocument();
    expect(screen.queryByText(/optional/i)).not.toBeInTheDocument();
  });

  it("zeigt QR-Code und Schlüssel, bestätigt im Browser und zeigt danach die Wiederherstellungscodes", async () => {
    render(<KundenZweiFaktor />);
    fireEvent.click(await screen.findByRole("button", { name: "Einschalten" }));

    expect(await screen.findByAltText("QR-Code für die Authenticator-App")).toBeInTheDocument();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledWith("manage-mfa", { body: { action: "enroll", friendlyName: "MOREImmo Kundenportal" } });

    // Nach der sechsten Ziffer wird von selbst abgesendet, ohne Klick.
    fireEvent.change(screen.getByLabelText("Code aus der Authenticator-App"), { target: { value: "123456" } });

    expect(await screen.findByText("Sichere jetzt deine Wiederherstellungscodes")).toBeInTheDocument();
    expect(mocks.challenge).toHaveBeenCalledWith({ factorId: "neu-1" });
    expect(mocks.verify).toHaveBeenCalledWith({ factorId: "neu-1", challengeId: "ch-1", code: "123456" });
    expect(mocks.invoke).toHaveBeenCalledWith("manage-mfa", { body: { action: "generate_recovery_codes" } });
    expect(screen.getByText("AAAAA-BBBBB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Herunterladen/ })).toBeInTheDocument();
    expect(await screen.findByText("Die Zwei-Faktor-Anmeldung ist eingeschaltet")).toBeInTheDocument();
  });

  it("schaltet bei falschem Code nichts ein", async () => {
    mocks.verify.mockResolvedValueOnce({ data: null, error: new Error("Invalid TOTP code") });
    render(<KundenZweiFaktor />);
    fireEvent.click(await screen.findByRole("button", { name: "Einschalten" }));
    fireEvent.change(await screen.findByLabelText("Code aus der Authenticator-App"), { target: { value: "000000" } });

    await waitFor(() => expect(mocks.verify).toHaveBeenCalledTimes(1));
    // Falscher Code: Felder wieder leer, der Kunde tippt neu.
    await waitFor(() => expect(screen.getByLabelText("Code aus der Authenticator-App")).toHaveValue(""));
    expect(mocks.invoke).not.toHaveBeenCalledWith("manage-mfa", { body: { action: "generate_recovery_codes" } });
    expect(screen.queryByText("Sichere jetzt deine Wiederherstellungscodes")).not.toBeInTheDocument();
  });
});

describe("KundenZweiFaktor: ausschalten", () => {
  beforeEach(() => {
    mocks.faktoren = [{ id: "f-1", status: "verified", factor_type: "totp", created_at: "2026-09-01T10:00:00Z" }];
  });

  it("verlangt einen aktuellen Code und schickt ihn an manage-mfa", async () => {
    render(<KundenZweiFaktor />);
    expect(await screen.findByText("Die Zwei-Faktor-Anmeldung ist eingeschaltet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ausschalten" }));
    expect(screen.getByText(/aktuellen Code aus deiner Authenticator-App/)).toBeInTheDocument();
    const bestaetigen = screen.getAllByRole("button", { name: "Ausschalten" }).at(-1)!;
    expect(bestaetigen).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Code aus der Authenticator-App"), { target: { value: "654321" } });
    fireEvent.click(bestaetigen);

    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith("manage-mfa", { body: { action: "deaktivieren", factorId: "f-1", code: "654321" } }),
    );
    expect(await screen.findByText("Die Zwei-Faktor-Anmeldung ist ausgeschaltet")).toBeInTheDocument();
  });

  it("lässt sie eingeschaltet, wenn man es sich anders überlegt", async () => {
    render(<KundenZweiFaktor />);
    fireEvent.click(await screen.findByRole("button", { name: "Ausschalten" }));
    fireEvent.click(screen.getByRole("button", { name: "Eingeschaltet lassen" }));

    expect(screen.getByText("Die Zwei-Faktor-Anmeldung ist eingeschaltet")).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("zeigt die Texte auf Englisch", async () => {
    await i18n.changeLanguage("en");
    render(<KundenZweiFaktor />);

    expect(await screen.findByText("Two-factor sign-in is on")).toBeInTheDocument();
    expect(screen.getByText("Voluntary")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn off" })).toBeInTheDocument();
  });
});
