import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nutzer = vi.hoisted(() => ({ darkMode: false, toggleDarkMode: vi.fn() }));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => nutzer }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (schluessel: string) => schluessel }),
}));

import { HellDunkelSchalter } from "./HellDunkelSchalter";

describe("HellDunkelSchalter im Kundenportal", () => {
  beforeEach(() => {
    nutzer.darkMode = false;
    nutzer.toggleDarkMode.mockClear();
    document.documentElement.dataset.glas = "liquid";
  });
  afterEach(() => {
    delete document.documentElement.dataset.glas;
  });

  it("schaltet mit Liquid Glass ueber denselben Zustand wie das CRM", () => {
    render(<HellDunkelSchalter />);
    const knopf = screen.getByRole("button", { name: "portal.header.dark_mode" });
    expect(knopf).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(knopf);
    expect(nutzer.toggleDarkMode).toHaveBeenCalledTimes(1);
  });

  it("bietet im Dunkeln den Weg zurueck ins Helle an", () => {
    nutzer.darkMode = true;
    render(<HellDunkelSchalter />);
    expect(screen.getByRole("button", { name: "portal.header.light_mode" })).toHaveAttribute("aria-pressed", "true");
  });

  it("fehlt ohne Liquid Glass, weil das Portal dann keine dunklen Flaechen hat", () => {
    document.documentElement.dataset.glas = "an";
    const { container } = render(<HellDunkelSchalter />);
    expect(container).toBeEmptyDOMElement();
  });
});
