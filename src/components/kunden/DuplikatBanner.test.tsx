import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Duplikat-Banner unter Alle Kontakte: Behalten wird der ältere Kontakt,
 * auch wenn der neuere mehr Angaben hat (früher gewann, wer eine
 * Telefonnummer hatte). Die Rückfrage nennt beide mit Anlagedatum.
 */

const t = vi.hoisted(() => ({
  zusammenfuehren: vi.fn(),
  dateien: vi.fn(),
  hinweis: vi.fn(),
  confirm: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: t.toast }) }));
vi.mock("@/lib/confirm", () => ({
  hinweisDialog: (...a: unknown[]) => t.hinweis(...a),
  confirmDialog: (...a: unknown[]) => t.confirm(...a),
}));
vi.mock("@/lib/dataCache", () => ({ cacheRefreshTable: () => Promise.resolve() }));
vi.mock("@/lib/kontaktZusammenfuehren", async (original) => ({
  ...(await original<typeof import("@/lib/kontaktZusammenfuehren")>()),
  kontakteZusammenfuehren: (...a: unknown[]) => t.zusammenfuehren(...a),
  zusammengefuehrteDateienVerschieben: (...a: unknown[]) => t.dateien(...a),
}));

import { DuplikatBanner } from "./DuplikatBanner";
import type { KundeData } from "@/lib/kundenStore";

/** Ausgedachte Testkontakte. */
const aelter = { id: "a", moreId: 7, vorname: "Erika", nachname: "Beispiel", email: "erika@beispiel.test", telefon: "", erstellt_am: "2026-03-01T10:00:00Z" } as KundeData;
const neuer = { id: "b", moreId: 42, vorname: "Erika", nachname: "Beispiel", email: "erika@beispiel.test", telefon: "0170 1234567", erstellt_am: "2026-09-20T10:00:00Z" } as KundeData;

describe("DuplikatBanner", () => {
  beforeEach(() => {
    t.zusammenfuehren.mockReset().mockResolvedValue({ behaltenId: "a", aufgeloestId: "b", portalKonflikt: false, nichtUmgehaengt: [], dateienProblem: null });
    t.hinweis.mockReset();
    t.confirm.mockReset();
    t.dateien.mockReset();
  });

  it("behält den älteren, auch wenn nur der neuere eine Telefonnummer hat, und fragt mit Anlagedatum nach", async () => {
    render(<MemoryRouter><DuplikatBanner kontakte={[neuer, aelter]} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Anzeigen/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Zusammenführen$/ }));

    expect(await screen.findByText(/MI-00007, angelegt am 01\.03\.2026/)).toBeTruthy();
    expect(screen.getByText(/MI-00042, angelegt am 20\.09\.2026/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Zusammenführen" }));
    await waitFor(() => expect(t.zusammenfuehren).toHaveBeenCalledWith("a", "b"));
  });

  it("meldet einen Portalkonflikt im Projektstil", async () => {
    t.zusammenfuehren.mockResolvedValue({ behaltenId: "a", aufgeloestId: "b", portalKonflikt: true, nichtUmgehaengt: [], dateienProblem: null });
    render(<MemoryRouter><DuplikatBanner kontakte={[aelter, neuer]} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Anzeigen/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Zusammenführen$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Zusammenführen" }));
    await waitFor(() => expect(t.hinweis).toHaveBeenCalledWith(expect.objectContaining({ title: "Bitte von Hand prüfen" })));
  });

  it("bietet bei nicht verschobenen Dateien an, es noch einmal zu versuchen", async () => {
    t.zusammenfuehren.mockResolvedValue({ behaltenId: "a", aufgeloestId: "b", portalKonflikt: false, nichtUmgehaengt: [], dateienProblem: "1 Datei liegt noch am alten Ort." });
    t.confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    t.dateien.mockResolvedValue("1 Datei liegt noch am alten Ort.");
    render(<MemoryRouter><DuplikatBanner kontakte={[aelter, neuer]} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Anzeigen/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Zusammenführen$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Zusammenführen" }));

    await waitFor(() => expect(t.confirm).toHaveBeenCalledTimes(2));
    expect(t.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: "Einige Dateien konnten nicht verschoben werden",
      confirmText: "Noch einmal versuchen",
    }));
    expect(t.dateien).toHaveBeenCalledTimes(1);
    expect(t.dateien).toHaveBeenCalledWith("a", "b");
  });
});
