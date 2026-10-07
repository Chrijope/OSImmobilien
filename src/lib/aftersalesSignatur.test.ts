/**
 * Aftersales-Beratung: Der Browser schreibt nicht mehr selbst in
 * `signature_requests` (Christians Entscheidung vom 29.09.2026). Angelegt wird
 * ueber `aftersales_signatur_anlegen`, unterschrieben ueber
 * `sign_signature_request`. Nur solange die Migration noch nicht gelaufen ist,
 * faellt das Anlegen auf den alten Direktweg zurueck.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  insert: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mock.rpc, from: mock.from, functions: { invoke: mock.invoke } },
}));

import { aftersalesSignaturAnlegen, aftersalesVpUnterschreiben, signaturLinkErinnern } from "./aftersalesSignatur";

describe("signaturLinkErinnern", () => {
  it("ruft die Function, der Browser liest keinen Token", async () => {
    mock.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(signaturLinkErinnern({ art: "aftersales_kunde", investmentId: "inv-1" })).resolves.toBeNull();
    expect(mock.invoke).toHaveBeenCalledWith("signatur-link-erinnern", {
      body: { art: "aftersales_kunde", investmentId: "inv-1" },
    });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("gibt einen Fehler als Satz zurueck statt zu werfen", async () => {
    mock.invoke.mockResolvedValue({ data: null, error: new Error("Das darf nur der Bewerberbereich.") });
    await expect(
      signaturLinkErinnern({ art: "vertrag_kurz", bewerberId: "b-1", bewerberName: "B", paketTitel: "P" }),
    ).resolves.toBe("Das darf nur der Bewerberbereich.");
  });
});

const EINGABE = {
  investmentId: "inv-1",
  kontaktId: "k-1",
  vpName: "Partner",
  kundeName: "Kunde",
  kundeEmail: "kunde@example.org",
  formular: { ort: "Hamburg" },
};

beforeEach(() => {
  mock.rpc.mockReset();
  mock.insert.mockReset().mockResolvedValue({ error: null });
  mock.from.mockReset().mockReturnValue({ insert: mock.insert });
});

describe("aftersalesSignaturAnlegen", () => {
  it("legt ueber die Datenbankfunktion an und fasst die Tabelle nicht an", async () => {
    mock.rpc.mockResolvedValue({ data: "vp-token", error: null });
    await expect(aftersalesSignaturAnlegen(EINGABE)).resolves.toBe("vp-token");
    expect(mock.rpc).toHaveBeenCalledWith("aftersales_signatur_anlegen", {
      _investment_id: "inv-1",
      _formular: { ort: "Hamburg" },
      _vp_name: "Partner",
    });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("eine Ablehnung des Servers wird weitergereicht, kein Direktweg", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "darf nicht" } });
    await expect(aftersalesSignaturAnlegen(EINGABE)).rejects.toMatchObject({ code: "42501" });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("nur wenn die Funktion fehlt, legt der alte Weg beide Zeilen an", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    const token = await aftersalesSignaturAnlegen(EINGABE);
    expect(mock.from).toHaveBeenCalledWith("signature_requests");
    const zeilen = mock.insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(zeilen.map((z) => z.person_type)).toEqual(["aftersales_vp", "aftersales_kunde"]);
    expect(zeilen[0].token).toBe(token);
  });
});

describe("aftersalesVpUnterschreiben", () => {
  it("unterschreibt ueber sign_signature_request und wirft nicht", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "already-signed" } });
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(aftersalesVpUnterschreiben("vp-token", "data:image/png;base64,x")).resolves.toBeUndefined();
    expect(mock.rpc).toHaveBeenCalledWith("sign_signature_request", expect.objectContaining({
      _token: "vp-token",
      _signature_data: "data:image/png;base64,x",
    }));
    expect(mock.from).not.toHaveBeenCalled();
    fehler.mockRestore();
  });
});
