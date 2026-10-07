import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

/**
 * Der Versand-Dialog: holt beim Oeffnen die Vorschau, zeigt Betreff, Text,
 * Empfaengerzahl und die Ausgeschlossenen mit Grund, sperrt ohne Migration
 * und schickt erst mit „Jetzt senden".
 */

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ toast }));

const cacheReload = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/dataCache", () => ({ cacheReload }));

import { NachfassMailDialog } from "./NachfassMailDialog";

const VORSCHAU = {
  ok: true,
  modus: "vorschau",
  betreff: "Kurze Nachfrage zu deiner Bewerbung bei MOREImmo",
  empfaenger: [
    { id: "1", name: "Max Mustermann", email: "max@test.de" },
    { id: "2", name: "Erika Beispiel", email: "erika@test.de" },
  ],
  ausgeschlossen: [
    { id: "3", name: "Ohne Adresse", grund: "keine Mailadresse" },
    { id: "4", name: "Schon Dran", grund: "Mail schon erhalten", am: "2026-09-03T09:00:00.000Z" },
  ],
  migrationFehlt: false,
};

async function oeffne(onGesendet = vi.fn()) {
  const onOpenChange = vi.fn();
  await act(async () => {
    render(<NachfassMailDialog open onOpenChange={onOpenChange} onGesendet={onGesendet} />);
  });
  await act(async () => { await Promise.resolve(); });
  return { onOpenChange, onGesendet };
}

beforeEach(() => {
  vi.clearAllMocks();
  invoke.mockImplementation(async (_name: string, args: { body: { modus: string } }) => {
    if (args.body.modus === "vorschau") return { data: VORSCHAU, error: null };
    return { data: { ok: true, gesendet: 2, fehlgeschlagen: [], uebersprungen: 2 }, error: null };
  });
});

describe("NachfassMailDialog", () => {
  it("holt beim Oeffnen nur die Vorschau und zeigt Text, Empfaenger und Ausgeschlossene", async () => {
    await oeffne();

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("send-bewerber-nachfass", { body: { modus: "vorschau" } });

    expect(await screen.findByText("Kurze Nachfrage zu deiner Bewerbung bei MOREImmo")).toBeInTheDocument();
    expect(screen.getByText("Hallo Max,")).toBeInTheDocument();
    // Die Vorschau zeigt die Sammelmail zum Kennenlernen, nicht mehr die
    // alte zur Terminbuchung. Geprueft wird der Satz, der den Bogen begruendet.
    expect(screen.getByText(/Kennenlernen zum Durchklicken gebaut/)).toBeInTheDocument();
    expect(screen.getByText(/Rahmenbedingungen/)).toBeInTheDocument();
    expect(screen.getByText("2 Empfänger")).toBeInTheDocument();
    expect(screen.getByText("2 übersprungen")).toBeInTheDocument();
    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
    expect(screen.getByText("Ohne Adresse")).toBeInTheDocument();
    expect(screen.getByText("keine Mailadresse")).toBeInTheDocument();
    expect(screen.getByText(/Mail schon erhalten am 03\.09\.2026/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Jetzt an 2 senden/ })).toBeEnabled();
  });

  it("sendet erst mit dem Knopf, meldet die Zahlen und laedt den Cache neu", async () => {
    const { onOpenChange, onGesendet } = await oeffne();
    await screen.findByText("2 Empfänger");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Jetzt an 2 senden/ }));
    });

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("send-bewerber-nachfass", { body: { modus: "senden" } }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0].title).toBe("Sammelmail verschickt");
    expect(toast.mock.calls[0][0].description).toContain("2 gesendet");
    expect(toast.mock.calls[0][0].description).toContain("2 übersprungen");
    expect(cacheReload).toHaveBeenCalledWith("bewerbungen");
    expect(onGesendet).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sperrt den Versand und erklaert es, wenn die Migration noch nicht gelaufen ist", async () => {
    invoke.mockResolvedValue({ data: { ...VORSCHAU, migrationFehlt: true }, error: null });
    await oeffne();

    expect(await screen.findByText("Migration noch nicht ausgeführt")).toBeInTheDocument();
    expect(screen.getByText(/20260902160000_bewerber_abmeldung\.sql/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Jetzt an 2 senden/ })).toBeDisabled();
  });

  it("sperrt den Versand, wenn niemand mehr wartet", async () => {
    invoke.mockResolvedValue({ data: { ...VORSCHAU, empfaenger: [] }, error: null });
    await oeffne();

    expect(await screen.findByText(/Niemand wartet gerade auf diese Mail/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jetzt senden" })).toBeDisabled();
  });

  it("nennt Fehlschlaege beim Versand mit Namen und Grund", async () => {
    invoke.mockImplementation(async (_name: string, args: { body: { modus: string } }) => {
      if (args.body.modus === "vorschau") return { data: VORSCHAU, error: null };
      return {
        data: { ok: true, gesendet: 1, fehlgeschlagen: [{ id: "2", name: "Erika Beispiel", grund: "Adresse steht auf der Sperrliste" }], uebersprungen: 0 },
        error: null,
      };
    });
    await oeffne();
    await screen.findByText("2 Empfänger");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Jetzt an 2 senden/ }));
    });

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0].description).toContain("1 gesendet, 1 fehlgeschlagen");
    expect(toast.mock.calls[0][0].description).toContain("Erika Beispiel");
    expect(toast.mock.calls[0][0].description).toContain("Grund: Adresse steht auf der Sperrliste");
  });
});
