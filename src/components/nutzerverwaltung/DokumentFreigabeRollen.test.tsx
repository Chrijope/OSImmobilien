import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * „Wer darf Dokumente für Kunden freigeben" in der Nutzerverwaltung
 * (Christian, 23.09.2026). Die gespeicherte Einstellung ist nachgebaut.
 */

const nutzer = vi.hoisted(() => ({ rolle: "admin" }));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ user: { role: nutzer.rolle, name: "Test" } }) }));
const einstellung = vi.hoisted(() => ({ wert: null as unknown }));
const speichern = vi.hoisted(() => vi.fn());
vi.mock("@/lib/appConfigStore", () => ({
  getAppConfig: (_schluessel: string, rueckfall: unknown) => einstellung.wert ?? rueckfall,
  setAppConfig: speichern,
}));
const toastErfolg = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: toastErfolg, error: vi.fn() } }));

const { DokumentFreigabeRollen } = await import("./DokumentFreigabeRollen");

beforeEach(() => {
  nutzer.rolle = "admin";
  einstellung.wert = null;
  speichern.mockReset().mockResolvedValue(true);
  toastErfolg.mockReset();
});

describe("DokumentFreigabeRollen", () => {
  it.each([["vertriebsleiter"], ["objektpartner"], ["backoffice"], ["vertriebspartner"]])("bleibt für %s unsichtbar", (rolle) => {
    nutzer.rolle = rolle;
    const { container } = render(<DokumentFreigabeRollen />);
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt ohne Einstellung die Voreinstellung, Admin und Inhaber fest angehakt", () => {
    render(<DokumentFreigabeRollen />);
    expect(screen.getByRole("heading", { name: "Wer darf Dokumente für Kunden freigeben" })).toBeInTheDocument();
    for (const name of [/^Admin/, /^Inhaber/]) {
      const box = screen.getByRole("checkbox", { name });
      expect(box).toBeChecked();
      expect(box).toBeDisabled();
    }
    expect(screen.getByRole("checkbox", { name: "Vertriebsleiter" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Objektpartner" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Backoffice" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Vertriebspartner" })).not.toBeChecked();
  });

  it("speichert beim Zuschalten die ganze Liste unter dem festen Schlüssel", async () => {
    nutzer.rolle = "inhaber";
    render(<DokumentFreigabeRollen />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Vertriebspartner" }));
    await waitFor(() => expect(speichern).toHaveBeenCalledWith("dokument_freigabe_rollen", {
      rollen: ["vertriebsleiter", "objektpartner", "vertriebspartner"],
    }));
    await waitFor(() => expect(toastErfolg).toHaveBeenCalledWith("Vertriebspartner darf jetzt Dokumente für Kunden freigeben."));
  });

  it("speichert beim Abwählen eine kürzere Liste, auch eine leere", async () => {
    einstellung.wert = { rollen: ["objektpartner"] };
    render(<DokumentFreigabeRollen />);
    expect(screen.getByRole("checkbox", { name: "Vertriebsleiter" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Objektpartner" }));
    await waitFor(() => expect(speichern).toHaveBeenCalledWith("dokument_freigabe_rollen", { rollen: [] }));
    await waitFor(() => expect(toastErfolg).toHaveBeenCalledWith("Objektpartner darf keine Dokumente mehr für Kunden freigeben."));
  });

  it("meldet keinen Erfolg, wenn das Speichern scheitert", async () => {
    speichern.mockResolvedValue(false);
    render(<DokumentFreigabeRollen />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Backoffice" }));
    await waitFor(() => expect(speichern).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Backoffice" })).toBeEnabled());
    expect(toastErfolg).not.toHaveBeenCalled();
  });
});
