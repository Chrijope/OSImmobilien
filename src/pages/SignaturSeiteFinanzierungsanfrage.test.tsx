import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

/**
 * Die Unterschriftsseite für die Finanzierungsanfrage (16.11.2026).
 *
 * Geprüft wird, was der Käufer sieht: eigener Titel, seine Rolle (Person 2
 * bei der zweiten Anfrage), die Vorschau aus dem mitgeschickten Stand, die
 * Einwilligung mit den Erklärungen von Seite 6, und kein Korrekturknopf der
 * Selbstauskunft.
 */

const TOKEN = "f".repeat(64);

vi.mock("react-router-dom", async () => {
  const echt = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...echt,
    useSearchParams: () => [new URLSearchParams(`token=${TOKEN}&type=finanzierungsanfrage_p2`), () => {}],
  };
});

const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
const erzeuge = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    functions: { invoke },
    removeChannel: vi.fn(),
    channel: () => {
      const kanal: Record<string, unknown> = {};
      kanal.on = () => kanal;
      kanal.subscribe = () => kanal;
      return kanal;
    },
  },
}));
vi.mock("@/lib/finanzierungsanfrage", () => ({ erzeugeFinanzierungsanfrage: erzeuge }));

import SignaturSeite from "./SignaturSeite";

const sa = { vorname: "Max", nachname: "Muster", ort: "München", person2: true, person2Data: { vorname: "Erika", nachname: "Muster" } };

beforeEach(() => {
  vi.clearAllMocks();
  erzeuge.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:vorschau"), revokeObjectURL: vi.fn() });
  rpc.mockImplementation((name: string) => Promise.resolve({
    data: name === "get_signature_request" ? {
      id: "sr-2", kontakt_id: "k1", investment_id: "i1", person_type: "finanzierungsanfrage_p2",
      name: "Erika Muster", email: "erika@example.test", status: "pending",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(), signed_at: null,
      sa_data: { finanzierungsanfrage: { runde: "r1", sa, objekt: { strasse: "Teststraße 1" }, ort: "München" } },
      ip_address: null, user_agent: null, meta: null, signature_data: null,
    } : null,
    error: null,
  }));
});

async function oeffne() {
  await act(async () => { render(<SignaturSeite />); });
  await act(async () => { await Promise.resolve(); });
}

describe("Finanzierungsanfrage unterschreiben", () => {
  it("zeigt Titel, Rolle und die Einwilligung mit den Erklärungen von Seite 6", async () => {
    await oeffne();
    expect(screen.getByRole("heading", { name: "Finanzierungsanfrage unterschreiben" })).toBeInTheDocument();
    expect(screen.getByText(/Person 2/)).toBeInTheDocument();
    expect(screen.getByText(/automatisierten Grundbuch-Abrufverfahrens auf Seite 6/)).toBeInTheDocument();
    expect(screen.queryByText("Selbstauskunft bearbeiten")).not.toBeInTheDocument();
  });

  it("baut die Vorschau aus dem mitgeschickten Stand", async () => {
    await oeffne();
    expect(erzeuge).toHaveBeenCalledWith(sa, { strasse: "Teststraße 1" });
  });
});
