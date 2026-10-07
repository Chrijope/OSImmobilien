import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { BEWERBER_BUCHUNGSLINK } from "../../supabase/functions/_shared/bewerber-eingangsmail";

/**
 * Die Seite hinter „Ich habe kein Interesse mehr": Öffnen liest nur, erst der
 * Knopf schickt Token und Grund. Ein verbrauchtes Token zeigt direkt die
 * Bestätigung, ein unbekanntes eine freundliche Hinweisseite.
 */

const TOKEN = "b".repeat(64);
let aktuellesToken = TOKEN;

vi.mock("react-router-dom", async () => {
  const echt = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...echt, useParams: () => ({ token: aktuellesToken }) };
});

const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, functions: { invoke } },
}));

import { MemoryRouter } from "react-router-dom";
import BewerberKeinInteresse from "./BewerberKeinInteresse";

async function oeffne() {
  await act(async () => {
    render(<MemoryRouter><BewerberKeinInteresse /></MemoryRouter>);
  });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  aktuellesToken = TOKEN;
  rpc.mockResolvedValue({ data: [{ vorname: "Max", status: "offen" }], error: null });
  invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe("BewerberKeinInteresse", () => {
  it("fragt beim Oeffnen nach und aendert nichts", async () => {
    await oeffne();

    expect(rpc).toHaveBeenCalledWith("get_bewerber_abmeldung", { _token: TOKEN });
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /Hallo Max, möchtest du wirklich kein Interesse mehr\?/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Magst du uns kurz sagen, warum\?/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ja, bitte nicht mehr melden" })).toBeEnabled();
    // Der leise Weg zurück ins Gespräch.
    expect(screen.getByRole("link", { name: /Termin buchen, 60 Minuten/ })).toHaveAttribute("href", BEWERBER_BUCHUNGSLINK);
  });

  it("schickt beim Bestaetigen Token und Grund und zeigt danach die Bestaetigung mit Buchungslink", async () => {
    await oeffne();

    fireEvent.change(screen.getByLabelText(/Magst du uns kurz sagen, warum\?/), { target: { value: "Habe etwas anderes gefunden." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ja, bitte nicht mehr melden" }));
    });

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith("bewerber-kein-interesse", {
      body: { token: TOKEN, grund: "Habe etwas anderes gefunden.", hp: "" },
    });
    expect(await screen.findByRole("heading", { name: "Alles klar, Max." })).toBeInTheDocument();
    expect(screen.getByText(/Wir melden uns nicht mehr\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gesprächstermin buchen/ })).toHaveAttribute("href", BEWERBER_BUCHUNGSLINK);
  });

  it("zeigt bei einem verbrauchten Token direkt die Bestaetigung, ohne erneut zu senden", async () => {
    rpc.mockResolvedValue({ data: [{ vorname: "Max", status: "bestaetigt" }], error: null });
    await oeffne();

    expect(screen.getByRole("heading", { name: "Alles klar, Max." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ja, bitte nicht mehr melden" })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("zeigt bei einem unbekannten Token die Hinweisseite", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await oeffne();

    expect(screen.getByRole("heading", { name: "Dieser Link ist uns unbekannt" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "os@os-immobilien.com" })).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("schlaegt ein Token, das nicht wie unseres aussieht, gar nicht erst nach", async () => {
    aktuellesToken = "beispiel-token";
    await oeffne();

    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Dieser Link ist uns unbekannt" })).toBeInTheDocument();
  });

  it("zeigt bei einem abgelaufenen oder ersetzten Token die Hinweisseite, ohne zu senden", async () => {
    rpc.mockResolvedValue({ data: [{ vorname: "Max", status: "abgelaufen" }], error: null });
    await oeffne();
    expect(screen.getByRole("heading", { name: "Dieser Link ist nicht mehr gültig" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "os@os-immobilien.com" })).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("wechselt auf die Hinweisseite, wenn die Function das Token beim Bestaetigen ablehnt", async () => {
    // Der Link war beim Laden noch offen, ist aber inzwischen ersetzt oder abgelaufen (410).
    invoke.mockResolvedValue({ data: null, error: { name: "FunctionsHttpError", context: { status: 410 } } });
    await oeffne();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ja, bitte nicht mehr melden" }));
    });

    expect(await screen.findByRole("heading", { name: "Dieser Link ist nicht mehr gültig" })).toBeInTheDocument();
    expect(screen.queryByText(/noch einmal/)).not.toBeInTheDocument();
  });

  it("zeigt bei 404 der Function die Seite fuer unbekannte Links", async () => {
    invoke.mockResolvedValue({ data: null, error: { name: "FunctionsHttpError", context: { status: 404 } } });
    await oeffne();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ja, bitte nicht mehr melden" }));
    });

    expect(await screen.findByRole("heading", { name: "Dieser Link ist uns unbekannt" })).toBeInTheDocument();
  });

  it("bittet bei der Bremse um Geduld statt um einen sofortigen neuen Versuch", async () => {
    invoke.mockResolvedValue({ data: null, error: { name: "FunctionsHttpError", context: { status: 429 } } });
    await oeffne();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ja, bitte nicht mehr melden" }));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/in einer Stunde/);
  });

  it("bleibt bei einem Fehler auf der Frage und erklaert ihn", async () => {
    invoke.mockResolvedValue({ data: { error: "Speichern fehlgeschlagen" }, error: null });
    await oeffne();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ja, bitte nicht mehr melden" }));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/Das hat gerade nicht geklappt/);
    expect(screen.getByRole("button", { name: "Ja, bitte nicht mehr melden" })).toBeEnabled();
  });
});
