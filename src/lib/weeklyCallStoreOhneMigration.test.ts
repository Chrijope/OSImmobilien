import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Ohne Migration 20261005160000 kein Rueckfall auf die alte, ungetrennte
 * Liste: Sonst saehe jeder die Punkte beider Calls, und neue 19:30-Punkte
 * landeten spaeter beim 19:00-Call.
 */

const rpc = vi.hoisted(() => vi.fn());
const insert = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    from: () => ({ insert }),
    auth: { getUser: async () => ({ data: { user: { id: "ich" } } }) },
  },
}));

import { ladePunkte, ladeTermine, legePunktAn } from "./weeklyCallStore";

const fehltFunktion = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Weekly-Call-Punkte ohne Migration", () => {
  it("liest keine ungetrennte Liste, sondern meldet null", async () => {
    rpc.mockResolvedValue(fehltFunktion);
    expect(await ladePunkte("2026-10-12", "vertriebspartner")).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("weekly_call_punkte_lesen", { _termin: "2026-10-12", _runde: "vertriebspartner" });
  });

  it("faellt auch in der Rueckschau nicht auf alle Calls zurueck", async () => {
    rpc.mockResolvedValue(fehltFunktion);
    expect(await ladeTermine("vertriebspartner")).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("traegt nie ohne Call ein", async () => {
    insert.mockResolvedValue({ error: { code: "PGRST204", message: "Could not find the 'call_runde' column" } });
    expect(await legePunktAn("Thema", "vertriebspartner")).toBe(false);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({ user_id: "ich", text: "Thema", call_runde: "vertriebspartner" });
  });
});
