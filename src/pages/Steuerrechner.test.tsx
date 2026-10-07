/**
 * Die interne Seite Steuerrechner: Wer bekommt einen Link?
 *
 * Entscheidung vom 24.09.2026: Vertriebspartner, Vertriebsleitung, Admin und
 * Inhaber bekommen einen eigenen Link. Das Backoffice sieht die Seite, aber
 * keinen Knopf zum Teilen und keinen Link, und fuer das Backoffice wird
 * `ensure-vp-slug` gar nicht erst gerufen. Der alte Link mit `?b=` entsteht
 * nicht mehr.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const zustand = vi.hoisted(() => ({ rolle: "vertriebspartner" as string }));
const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({
    user: { name: "Maria Muster", role: zustand.rolle },
    authUser: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("@/lib/chatStore", () => ({ getProfilePic: () => null }));
vi.mock("@/lib/userSettingsCache", () => ({ getUserSetting: () => null }));
vi.mock("@/lib/beraterProfil", () => ({ eigeneBerufsbezeichnung: () => "Immobilienberaterin" }));
vi.mock("@/components/steuerrechner/SteuerRechnerStrecke", () => ({
  default: (props: { eigenerLink?: boolean }) => (
    <div data-testid="strecke">{props.eigenerLink === false ? "ohne-link" : "mit-link"}</div>
  ),
}));

import Steuerrechner from "./Steuerrechner";

async function oeffne() {
  await act(async () => {
    render(<Steuerrechner />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  zustand.rolle = "vertriebspartner";
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { slug: "maria-muster" }, error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Rollen mit eigenem Link", () => {
  it("die Vertriebsleitung bekommt einen Link", async () => {
    zustand.rolle = "vertriebsleiter";
    await oeffne();
    expect(invoke).toHaveBeenCalledWith("ensure-vp-slug", { body: {} });
    expect(await screen.findByText(/\/steuer\/maria-muster/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Steuerrechner teilen/ })).toBeTruthy();
  });

  it("Admin und Inhaber behalten ihren Link", async () => {
    for (const rolle of ["admin", "inhaber"]) {
      zustand.rolle = rolle;
      invoke.mockClear();
      const { unmount } = render(<Steuerrechner />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(invoke).toHaveBeenCalledWith("ensure-vp-slug", { body: {} });
      expect(screen.getByRole("button", { name: /Steuerrechner teilen/ })).toBeTruthy();
      unmount();
    }
  });

  it("kopiert nur den Link mit Kuerzel, nie den alten mit ?b=", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await oeffne();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Steuerrechner teilen/ }));
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    const url = String((writeText.mock.calls[0] as unknown[])[0]);
    expect(url).toMatch(/\/steuer\/maria-muster$/);
    expect(url).not.toContain("?b=");
  });

  it("laesst ohne Kuerzel nichts teilen, statt auf den alten Link auszuweichen", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "kaputt" } });
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await oeffne();
    const knopf = screen.getByRole("button", { name: /Steuerrechner teilen/ }) as HTMLButtonElement;
    expect(knopf.disabled).toBe(true);
    fireEvent.click(knopf);
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe("Rollen ohne eigenen Link", () => {
  it("das Backoffice sieht den Rechner, aber keinen Teilen-Knopf und keinen Link", async () => {
    zustand.rolle = "backoffice";
    await oeffne();
    expect(screen.getByTestId("strecke").textContent).toBe("ohne-link");
    expect(screen.queryByRole("button", { name: /teilen/i })).toBeNull();
    expect(screen.queryByText(/Dein Link/)).toBeNull();
    expect(screen.queryByText(/Dein persönlicher Link/)).toBeNull();
  });

  it("ruft ensure-vp-slug fuer das Backoffice gar nicht erst auf", async () => {
    zustand.rolle = "backoffice";
    await oeffne();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("gilt ebenso fuer individuell und testaccount", async () => {
    for (const rolle of ["individuell", "testaccount"]) {
      zustand.rolle = rolle;
      const { unmount } = render(<Steuerrechner />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByRole("button", { name: /teilen/i })).toBeNull();
      unmount();
    }
    expect(invoke).not.toHaveBeenCalled();
  });
});
