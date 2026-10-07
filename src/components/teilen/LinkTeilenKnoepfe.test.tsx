/**
 * Das Teilen-Element oben rechts, gemeinsam für Berater-Mikroseite und
 * Handbuch-Seite.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("sonner", () => ({ toast }));

import { LinkTeilenKnoepfe } from "./LinkTeilenKnoepfe";

const schreiben = vi.fn();
beforeEach(() => {
  schreiben.mockReset().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText: schreiben } });
  vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => vi.restoreAllMocks());

describe("LinkTeilenKnoepfe", () => {
  it("kopiert den Link und öffnet die Vorschau", async () => {
    render(<LinkTeilenKnoepfe url="https://portal.more.immo/handbuch/maria" vorschauUrl="http://localhost/handbuch/maria" />);
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    await waitFor(() => expect(schreiben).toHaveBeenCalledWith("https://portal.more.immo/handbuch/maria"));
    expect(await screen.findByText("Kopiert!")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Vorschau/ }));
    expect(window.open).toHaveBeenCalledWith("http://localhost/handbuch/maria", "_blank", "noopener");
  });

  it("ist gesperrt, solange es noch keinen Link gibt", () => {
    render(<LinkTeilenKnoepfe url={null} />);
    expect(screen.getByRole("button", { name: /Link kopieren/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Vorschau/ })).toBeDisabled();
  });
});
