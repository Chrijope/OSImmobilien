import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

/**
 * Die Unterschriftsseite, wenn der Link nicht mehr trägt.
 *
 * Das Sicherheitsaudit vom 15.09.2026 hat unter F10 gemeldet, dass
 * `get_signature_request` das Ablaufdatum nie nachgesehen hat. Seit der
 * Migration 20260916140000 gibt die Datenbank zu einem abgelaufenen Link
 * nichts mehr heraus. Damit sieht die Seite bei einem abgelaufenen Link
 * zunächst dasselbe wie bei einem unbekannten, nämlich nichts.
 *
 * Geprüft wird deshalb viererlei:
 *   1. Ist der Link abgelaufen, sagt die Seite genau das und verweist auf
 *      den Berater.
 *   2. Ist der Token unbekannt, steht dort nichts von Ablauf, sondern der
 *      allgemeine Hinweis. Die Seite verrät damit nicht, ob es den Token gibt.
 *   3. Die zweite Abfrage wird nur gestellt, wenn der Hauptaufruf nichts
 *      geliefert hat. Ein gültiger Link kostet keinen zusätzlichen Aufruf.
 *   4. Die Seite kommt ohne die gekürzten Felder aus: fehlen ip_address,
 *      user_agent, meta und signature_data, arbeitet sie unverändert weiter.
 */

const TOKEN = "c".repeat(64);

vi.mock("react-router-dom", async () => {
  const echt = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...echt,
    useSearchParams: () => [new URLSearchParams(`token=${TOKEN}&type=selbstauskunft`), () => {}],
  };
});

const rpc = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
const removeChannel = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    functions: { invoke },
    removeChannel,
    channel: () => {
      const kanal: Record<string, unknown> = {};
      kanal.on = () => kanal;
      kanal.subscribe = () => kanal;
      return kanal;
    },
  },
}));

import SignaturSeite from "./SignaturSeite";

/** Eine gültige Anfrage, so wie die gekürzte Funktion sie heute liefert. */
function anfrage(rest: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "sr-1",
    kontakt_id: "k1",
    investment_id: null,
    person_type: "person1",
    name: "Jonas Lins",
    email: "jonas@example.org",
    status: "pending",
    expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    signed_at: null,
    // Ohne sa_data baut die Seite keine PDF-Vorschau. Für diesen Test reicht das.
    sa_data: null,
    // Genau die vier Felder, die die Datenbank seit F10 leer zurückgibt.
    ip_address: null,
    user_agent: null,
    meta: null,
    signature_data: null,
    ...rest,
  };
}

/**
 * Beantwortet die Aufrufe der Seite. `anfrageAntwort` ist das, was
 * `get_signature_request` liefert, `abgelaufen` das, was die zweite Abfrage
 * meldet.
 */
function antworte(anfrageAntwort: unknown, abgelaufen: boolean | Error = false) {
  rpc.mockImplementation((name: string) => {
    if (name === "get_signature_request") {
      return Promise.resolve({ data: anfrageAntwort, error: null });
    }
    if (name === "signature_request_abgelaufen") {
      if (abgelaufen instanceof Error) return Promise.reject(abgelaufen);
      return Promise.resolve({ data: abgelaufen, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
}

async function oeffne() {
  await act(async () => {
    render(<SignaturSeite />);
  });
  await act(async () => { await Promise.resolve(); });
}

function aufrufe(name: string) {
  return rpc.mock.calls.filter((call) => call[0] === name);
}

beforeEach(() => {
  vi.clearAllMocks();
  invoke.mockResolvedValue({ data: { success: true }, error: null });
  antworte(anfrage());
});

describe("Abgelaufener Link", () => {
  it("nennt den Ablauf beim Namen und verweist auf den Berater", async () => {
    antworte(null, true);
    await oeffne();

    expect(screen.getByRole("heading", { name: "Link abgelaufen" })).toBeInTheDocument();
    expect(screen.getByText(/abgelaufen und lässt sich nicht mehr öffnen/)).toBeInTheDocument();
    expect(screen.getByText(/wenden Sie sich bitte an Ihren Berater/)).toBeInTheDocument();
  });

  it("fragt erst dann nach dem Ablauf, wenn der Hauptaufruf nichts geliefert hat", async () => {
    antworte(null, true);
    await oeffne();

    expect(aufrufe("get_signature_request")).toHaveLength(1);
    expect(aufrufe("signature_request_abgelaufen")).toHaveLength(1);
    expect(aufrufe("signature_request_abgelaufen")[0][1]).toEqual({ _token: TOKEN });
  });
});

describe("Unbekannter Link", () => {
  it("zeigt den allgemeinen Hinweis und sagt nichts über einen Ablauf", async () => {
    antworte(null, false);
    await oeffne();

    expect(screen.getByRole("heading", { name: "Fehler" })).toBeInTheDocument();
    expect(screen.getByText(/nicht bekannt/)).toBeInTheDocument();
    expect(screen.queryByText("Link abgelaufen")).not.toBeInTheDocument();
  });

  it("bleibt beim allgemeinen Hinweis, wenn es die zweite Funktion noch nicht gibt", async () => {
    // So verhält sich die Datenbank, solange die Migration nicht gelaufen ist.
    antworte(null, new Error("function public.signature_request_abgelaufen does not exist"));
    await oeffne();

    expect(screen.getByRole("heading", { name: "Fehler" })).toBeInTheDocument();
    expect(screen.queryByText("Link abgelaufen")).not.toBeInTheDocument();
  });
});

describe("Gültiger Link", () => {
  it("zeigt die Unterschriftsseite und fragt nicht nach dem Ablauf", async () => {
    await oeffne();

    expect(screen.getByText("Jonas Lins")).toBeInTheDocument();
    expect(screen.queryByText("Link abgelaufen")).not.toBeInTheDocument();
    expect(aufrufe("signature_request_abgelaufen")).toHaveLength(0);
  });

  it("kommt ohne ip_address, user_agent, meta und signature_data aus", async () => {
    // Genau die vier Felder, die die Datenbank seit F10 leer liefert.
    const ohneNachweise = anfrage();
    expect(ohneNachweise.ip_address).toBeNull();
    expect(ohneNachweise.user_agent).toBeNull();
    expect(ohneNachweise.meta).toBeNull();
    expect(ohneNachweise.signature_data).toBeNull();

    antworte(ohneNachweise);
    await oeffne();

    expect(screen.getByText("Jonas Lins")).toBeInTheDocument();
    expect(screen.getByText(/jonas@example.org/)).toBeInTheDocument();
  });
});
