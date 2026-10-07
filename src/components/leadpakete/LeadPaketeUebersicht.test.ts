import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { nachtragKandidaten } = await import("./LeadPaketeUebersicht");

const zuweisung = (paket_id: string, kontakt_id: string, reklamiert = false) => ({
  id: `${paket_id}-${kontakt_id}`,
  paket_id,
  kontakt_id,
  zugewiesen_am: "2026-10-02T00:00:00Z",
  zugewiesen_von: null,
  reklamiert_am: reklamiert ? "2026-10-03T00:00:00Z" : null,
  reklamationsgrund: null,
  ersatz_fuer: null,
});

describe("Lieferung nachtragen: wählbare Leads", () => {
  it("nur Leads des Paketpartners, ohne Eigenkontakte, Gelöschte und schon Gezählte", () => {
    const kontakte = [
      { id: "frei", zustaendig_id: "p1", nachname: "B" },
      { id: "eigen", zustaendig_id: "p1", nachname: "C", eigen: true },
      { id: "fremd", zustaendig_id: "p2", nachname: "D" },
      { id: "geloescht", zustaendig_id: "p1", nachname: "E", geloescht: true },
      { id: "gezaehlt", zustaendig_id: "p1", nachname: "F" },
      { id: "hierReklamiert", zustaendig_id: "p1", nachname: "G" },
      { id: "andersReklamiert", zustaendig_id: "p1", nachname: "A" },
    ];
    const zuweisungen = [
      zuweisung("anderes", "gezaehlt"),
      zuweisung("paket", "hierReklamiert", true),
      zuweisung("anderes", "andersReklamiert", true),
    ];
    const ids = nachtragKandidaten({ id: "paket", partner_id: "p1" }, kontakte, zuweisungen, (k) => !k.eigen).map((k) => k.id);
    expect(ids).toEqual(["andersReklamiert", "frei"]);
  });
});
