import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { frageGastStatus } from "@/lib/videoraumStore";

/**
 * Der wartende Gast fragt alle vier Sekunden nach seinem Stand. Die Antwort
 * "es gibt dich nicht mehr" muss sich von einer Stoerung unterscheiden lassen:
 * Loescht der Gastgeber den Raum, waehrend jemand wartet, verschwindet der
 * Teilnehmer mit. Ohne die Unterscheidung sah der Kunde bis in alle Ewigkeit
 * "Sie werden gleich eingelassen".
 */

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => { /* still */ });
});

describe("frageGastStatus", () => {
  it("gibt den Stand zurück, solange es den Teilnehmer gibt", async () => {
    rpc.mockResolvedValue({
      data: { status: "wartet", raum_status: "offen", teilnehmer_id: "t-1" },
      error: null,
    });
    expect(await frageGastStatus("g")).toMatchObject({
      status: "wartet",
      raumStatus: "offen",
      teilnehmerId: "t-1",
    });
  });

  it("meldet weg, wenn es den Teilnehmer nicht mehr gibt", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await frageGastStatus("g")).toBe("weg");
  });

  it("meldet bei einer Störung nichts Endgültiges", async () => {
    // Eine wackelige Leitung darf den Kunden nicht aus dem Warteraum werfen.
    rpc.mockResolvedValue({ data: null, error: { message: "network" } });
    expect(await frageGastStatus("g")).toBeNull();
  });
});
