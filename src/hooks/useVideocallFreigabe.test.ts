import { describe, it, expect, vi, beforeEach } from "vitest";
import { CHRISTIAN_PEETZ_ID } from "@/lib/leadPool";

/*
 * Der Haken hinter Seitenleiste, Videocall-Seiten und dem Meeting im
 * Kundenprofil. Seit dem 27.09.2026 nur Christian Peetz als admin.
 */
let aktuell: { user: { role: string }; authUser: { id: string; email: string } | null };
vi.mock("@/contexts/UserContext", () => ({ useUser: () => aktuell }));

const { useVideocallFreigabe } = await import("./useVideocallFreigabe");

const als = (role: string, authUser: { id: string; email: string } | null) => {
  aktuell = { user: { role }, authUser };
  return useVideocallFreigabe();
};

describe("useVideocallFreigabe", () => {
  beforeEach(() => { aktuell = { user: { role: "admin" }, authUser: null }; });

  it("gibt Christian als admin frei", () => {
    expect(als("admin", { id: CHRISTIAN_PEETZ_ID, email: "" })).toEqual({ darf: true, laedt: false });
  });

  it("sperrt Christian als Vertriebspartner", () => {
    expect(als("vertriebspartner", { id: CHRISTIAN_PEETZ_ID, email: "" }).darf).toBe(false);
  });

  it("sperrt Kurz, Vogl und jeden anderen Admin", () => {
    expect(als("admin", { id: "x-1", email: "os@os-immobilien.com" }).darf).toBe(false);
    expect(als("admin", { id: "7a0e03f6-6614-4f47-830a-5ed454e4979d", email: "h.vogl@vundp24.de" }).darf).toBe(false);
    expect(als("admin", { id: "x-2", email: "os@os-immobilien.com" }).darf).toBe(false);
    expect(als("hr", { id: "x-3", email: "os@os-immobilien.com" }).darf).toBe(false);
  });

  it("meldet laedt, solange die Anmeldung fehlt", () => {
    expect(als("admin", null)).toEqual({ darf: false, laedt: true });
  });
});
