import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

/**
 * Die Unterschriftsseite bei der Reservierung eines ganzen Hauses.
 *
 * Die Wahl zum Beginn der Reservierung trifft der Kunde hier. Kauft eine
 * Gesellschaft, gibt es keine Widerrufsbelehrung und damit auch keine Wahl
 * (Tabelle B des Entwurfs vom 23.09.2026). Kaufen Privatpersonen, steht die
 * Wahl da, beim Abwarten mit „das Objekt“ statt „die Wohnung“.
 */

const TOKEN = "d".repeat(64);

vi.mock("react-router-dom", async () => {
  const echt = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...echt,
    useSearchParams: () => [new URLSearchParams(`token=${TOKEN}&type=reservierung`), () => {}],
  };
});

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    removeChannel: vi.fn(),
    channel: () => {
      const kanal: Record<string, unknown> = {};
      kanal.on = () => kanal;
      kanal.subscribe = () => kanal;
      return kanal;
    },
  },
}));
// Die Vorschau selbst ist hier nicht Gegenstand, sie hat ihre eigenen Tests.
vi.mock("@/lib/reservierungPdf", () => ({
  generateReservierungPDF: async () => ({ output: () => new Blob([]) }),
}));

import SignaturSeite from "./SignaturSeite";

function antworte(saData: Record<string, unknown>) {
  rpc.mockImplementation((name: string) => {
    if (name === "get_signature_request") {
      return Promise.resolve({
        data: {
          id: "sr-1", kontakt_id: "k1", investment_id: "inv-1", person_type: "rv_kaeufer1",
          name: "Max Muster", email: "max@muster.test", status: "pending",
          expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), signed_at: null,
          sa_data: saData, ip_address: null, user_agent: null, meta: null, signature_data: null,
        },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });
}

async function oeffne() {
  await act(async () => { render(<SignaturSeite />); });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  if (!("createObjectURL" in URL)) Object.assign(URL, { createObjectURL: () => "blob:test", revokeObjectURL: () => {} });
});

describe("Reservierung eines ganzen Hauses auf der Unterschriftsseite", () => {
  it("fragt eine Gesellschaft nicht nach dem Beginn und bestätigt keine Belehrung", async () => {
    antworte({ gesamtobjekt: true, kaeuferArt: "gesellschaft", vorname: "Max", nachname: "Muster", firma: "Muster GmbH" });
    await oeffne();
    expect(await screen.findByText(/diese Vereinbarung vor der Unterzeichnung vollständig gelesen/)).toBeTruthy();
    expect(screen.queryByText("Beginn der Reservierung")).toBeNull();
    expect(document.getElementById("signatur-widerruf-abwarten")).toBeNull();
    expect(screen.queryByText(/einschließlich der Widerrufsbelehrung/)).toBeNull();
  });

  it("lässt Privatpersonen wählen und sagt beim Abwarten „das Objekt“", async () => {
    antworte({ gesamtobjekt: true, kaeuferArt: "privat", vorname: "Anna", nachname: "Beispiel" });
    await oeffne();
    expect(await screen.findByText("Beginn der Reservierung")).toBeTruthy();
    expect(screen.getByText(/dass das Objekt bis zum Ablauf der Widerrufsfrist nicht für mich reserviert ist/)).toBeTruthy();
    expect(screen.queryByText(/dass die Wohnung bis zum Ablauf/)).toBeNull();
  });
});
