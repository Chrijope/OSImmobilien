/**
 * Geprüfte Wege für geschützte Investment-Felder (30.09.2026): Aufruf der
 * Datenbankfunktion, alter Weg nur, wenn es sie noch nicht gibt, und eine
 * Ablehnung als Satz für den Nutzer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc } }));

import { AktionVerweigert, abwicklungSpeichern, investmentLoeschen, saPdfVermerken } from "./investmentGepruefteWege";

beforeEach(() => mock.rpc.mockReset());

describe("investmentGepruefteWege", () => {
  it("ruft die drei Funktionen mit ihren Parametern", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: null });
    await expect(saPdfVermerken("inv-1", "SA.pdf", "selbstauskunft-papier/k/inv-1/1_SA.pdf")).resolves.toBe("ok");
    await expect(saPdfVermerken("inv-1", "SA.pdf")).resolves.toBe("ok");
    await expect(abwicklungSpeichern("inv-1", { kaufpreisEingegangen: true })).resolves.toBe("ok");
    await expect(investmentLoeschen("inv-1")).resolves.toBe("ok");
    expect(mock.rpc.mock.calls).toEqual([
      ["investment_sa_pdf_vermerken", { _investment_id: "inv-1", _dateiname: "SA.pdf", _papier_pfad: "selbstauskunft-papier/k/inv-1/1_SA.pdf" }],
      ["investment_sa_pdf_vermerken", { _investment_id: "inv-1", _dateiname: "SA.pdf", _papier_pfad: null }],
      ["investment_abwicklung_speichern", { _investment_id: "inv-1", _daten: { kaufpreisEingegangen: true } }],
      ["investment_loeschen", { _investment_id: "inv-1" }],
    ]);
  });

  it("fehlt die Funktion (Migration offen), gilt der alte Weg", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    await expect(investmentLoeschen("inv-1")).resolves.toBe("alterWeg");
  });

  it("eine Ablehnung kommt als AktionVerweigert mit dem Satz der Datenbank", async () => {
    mock.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Ab der Reservierung löschen nur Admin und Inhaber ein Investment." },
    });
    const fehler = await investmentLoeschen("inv-1").catch((e) => e);
    expect(fehler).toBeInstanceOf(AktionVerweigert);
    expect(fehler.message).toBe("Ab der Reservierung löschen nur Admin und Inhaber ein Investment.");
  });

  it("jeder andere Fehler wird geworfen, kein stiller alter Weg", async () => {
    const netz = { code: "", message: "Failed to fetch" };
    mock.rpc.mockResolvedValue({ data: null, error: netz });
    await expect(saPdfVermerken("inv-1", "SA.pdf")).rejects.toBe(netz);
  });
});
