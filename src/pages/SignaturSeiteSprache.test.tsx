import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

/**
 * Die Unterschriftsseite in der Sprache des Kunden (Plan Kundensprache,
 * Etappe 4, S9).
 *
 *   - Reservierung: Die Sprache kommt aus dem Datensatz
 *     (`vertragssprache`). Englisch führt, der deutsche Wortlaut ist
 *     aufklappbar, die Vorrangklausel und der Notarhinweis stehen dabei.
 *   - Selbstauskunft: Die Sprache kommt aus `meta.sprache` der RPC
 *     (Migration 20260925180000). Fehlt sie, bleibt alles deutsch.
 */

const TOKEN = "e".repeat(64);
const suche = vi.hoisted(() => ({ wert: "" }));

vi.mock("react-router-dom", async () => {
  const echt = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...echt, useSearchParams: () => [new URLSearchParams(suche.wert), () => {}] };
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
vi.mock("@/lib/reservierungPdf", () => ({
  generateReservierungPDF: async () => ({ output: () => new Blob([]) }),
}));

import SignaturSeite from "./SignaturSeite";

function antworte(saData: Record<string, unknown> | null, meta: Record<string, unknown> | null, personType = "person1") {
  rpc.mockImplementation((name: string) => {
    if (name === "get_signature_request") {
      return Promise.resolve({
        data: {
          id: "sr-1", kontakt_id: "k1", investment_id: "inv-1", person_type: personType,
          name: "Emily Carter", email: "emily@example.org", status: "pending",
          expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), signed_at: null,
          sa_data: saData, ip_address: null, user_agent: null, meta, signature_data: null,
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

describe("Reservierung auf Englisch", () => {
  beforeEach(() => { suche.wert = `token=${TOKEN}&type=reservierung`; });

  it("zeigt Englisch, den deutschen Wortlaut zum Aufklappen, Vorrangklausel und Notarhinweis", async () => {
    antworte({ vorname: "Emily", nachname: "Carter", vertragssprache: "en" }, null, "rv_kaeufer1");
    await oeffne();
    expect(await screen.findByText("Sign the reservation agreement")).toBeTruthy();
    expect(screen.getByText("Start of the reservation")).toBeTruthy();
    expect(screen.getByText(/I expressly request that OS Immobilien begin the reservation/)).toBeTruthy();
    expect(screen.getAllByText("Show German original (legally binding)").length).toBeGreaterThan(0);
    expect(screen.getByText(/In case of discrepancies, the German version shall prevail/)).toBeTruthy();
    expect(screen.getByText(/notarial purchase contract \(Kaufvertragsurkunde\) is drawn up in German/)).toBeTruthy();
    // Der deutsche, maßgebliche Wortlaut ist im Dokument, nur zugeklappt.
    expect(screen.getByText(/Ich verlange ausdrücklich/)).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
  });

  it("eine ältere Reservierung ohne Vertragssprache bleibt deutsch, auch wenn das Profil Englisch sagt", async () => {
    antworte({ vorname: "Emily", nachname: "Carter" }, { sprache: "en" }, "rv_kaeufer1");
    await oeffne();
    expect(await screen.findByText("Reservierungsvereinbarung unterschreiben")).toBeTruthy();
    expect(screen.getByText("Beginn der Reservierung")).toBeTruthy();
    expect(screen.queryByText("Start of the reservation")).toBeNull();
  });
});

describe("Selbstauskunft", () => {
  beforeEach(() => { suche.wert = `token=${TOKEN}&type=selbstauskunft`; });

  it("folgt meta.sprache aus der RPC", async () => {
    antworte(null, { sprache: "en" });
    await oeffne();
    expect(await screen.findByText("Sign the self-disclosure")).toBeTruthy();
    expect(screen.getByText(/I confirm that the information I have provided in the self-disclosure/)).toBeTruthy();
    expect(screen.getByText("✍️ Confirm signature")).toBeTruthy();
  });

  it("ohne meta bleibt die Seite deutsch", async () => {
    antworte(null, null);
    await oeffne();
    expect(await screen.findByText("Selbstauskunft unterschreiben")).toBeTruthy();
    expect(screen.queryByText("Show German original (legally binding)")).toBeNull();
  });
});
