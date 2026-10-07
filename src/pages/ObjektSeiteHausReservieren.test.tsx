import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ReactNode } from "react";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * „Haus für Kunden reservieren“ auf der Objektseite, seit dem 23.09.2026.
 *
 *   1. Der Knopf steht nur beim Globalobjekt und nur für die Rollen, die
 *      reservieren dürfen.
 *   2. Ohne die Migration `20260923152000_globalobjekt_reservierung.sql` ist
 *      er gesperrt; Admin und Inhaber lesen den Grund.
 *   3. Ist das Haus reserviert, steht statt des Knopfs die Belegung da, Namen
 *      nur für die, die sie sehen dürfen. Ist es für einen anderen Kunden
 *      vorgemerkt, steht „vorgemerkt bis HH:MM“.
 *   4. Der Dialog führt ins Formular im Modus „gesamtes Objekt“.
 */

const zustand = vi.hoisted(() => ({
  objekte: {} as Record<string, unknown>,
  rolle: "admin",
  aufgehoben: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: () => undefined,
  },
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: zustand.rolle, name: "Test" , email: "" }, authUser: { id: "nutzer-test" } }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/components/objektseite/Galerie", () => ({ Galerie: () => <div>Galerie</div> }));
vi.mock("@/lib/objektTexteKi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objektTexteKi")>()),
  brauchtObjektTexte: () => false,
  starteObjektTexteBeiBedarf: async () => undefined,
}));
vi.mock("@/components/objektseite/ObjektseiteZugang", () => ({
  ObjektseiteZugang: (p: { children: ReactNode }) => <>{p.children}</>,
}));
vi.mock("@/lib/objekteStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objekteStore")>()),
  getObjektById: (id: string) => zustand.objekte[id],
  hebeHausReservierungAuf: async (id: string) => { zustand.aufgehoben.push(id); return { ok: true }; },
}));
vi.mock("@/lib/objektExposeStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objektExposeStore")>()),
  kundenZurAuswahl: () => [],
}));

const { default: ObjektSeite } = await import("./ObjektSeite");

function we(id: string): ObjektWohnung {
  return { id, weNr: `WE ${id}`, etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 600, vkGesamt: 200000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei" };
}

function haus(weiteres: Partial<ObjektData> = {}): ObjektData {
  return {
    id: "haus", titel: "Haus Musterstraße", adresse: "Musterstraße 1", plz: "95028", ort: "Hof", beschreibung: "", highlights: [],
    bildUrl: "", bilder: [], dokumente: [], wohnungen: [we("w1"), we("w2")], videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
    erstellt_am: "2026-01-01", meta: {}, globalObjekt: true, belegung: "frei",
    ...weiteres,
  } as unknown as ObjektData;
}

function zeige() {
  return render(
    <MemoryRouter initialEntries={["/objekte/haus"]}>
      <Routes>
        <Route path="/objekte/:id" element={<ObjektSeite />} />
        <Route path="/reservierung" element={<p>Formular</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const KNOPF = /Haus für Kunden reservieren/;

beforeEach(() => {
  cleanup();
  zustand.rolle = "admin";
  zustand.aufgehoben = [];
});

describe("Der Knopf steht nur beim Globalobjekt", () => {
  it("erscheint bei einem freien Globalobjekt mit Migration", () => {
    zustand.objekte = { haus: haus() };
    zeige();
    const knoepfe = screen.getAllByRole("button", { name: KNOPF });
    expect(knoepfe.length).toBeGreaterThan(0);
    expect((knoepfe[0] as HTMLButtonElement).disabled).toBe(false);
    // Marken-Orange wie an der Einheit, nicht blau und nicht umrandet.
    expect(knoepfe[0]).toHaveClass("btn-brand");
    expect(knoepfe[0]).not.toHaveClass("bg-primary");
    expect(knoepfe[0]).not.toHaveClass("bg-card");
  });

  it("fehlt bei einem Objekt, das in Einheiten verkauft wird", () => {
    zustand.objekte = { haus: haus({ globalObjekt: false }) };
    zeige();
    expect(screen.queryAllByRole("button", { name: KNOPF })).toHaveLength(0);
  });

  it("fehlt für Rollen, die nicht reservieren dürfen", () => {
    zustand.rolle = "objektpartner";
    zustand.objekte = { haus: haus() };
    zeige();
    expect(screen.queryAllByRole("button", { name: KNOPF })).toHaveLength(0);
  });

  it("öffnet den Dialog für das ganze Haus", () => {
    zustand.objekte = { haus: haus() };
    zeige();
    fireEvent.click(screen.getAllByRole("button", { name: KNOPF })[0]);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/Das ganze Haus, Musterstraße 1/)).toBeTruthy();
  });
});

describe("Ohne Migration ist der Knopf gesperrt", () => {
  it("sperrt ihn und nennt Admin und Inhaber den Grund", () => {
    zustand.objekte = { haus: haus({ belegung: undefined }) };
    zeige();
    const knoepfe = screen.getAllByRole("button", { name: KNOPF });
    expect(knoepfe.every((k) => (k as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getAllByText("Migration Globalobjekt-Reservierung noch nicht ausgeführt").length).toBeGreaterThan(0);
  });

  it("zeigt dem Vertrieb keinen Technikhinweis", () => {
    zustand.rolle = "vertriebspartner";
    zustand.objekte = { haus: haus({ belegung: undefined }) };
    zeige();
    expect(screen.getAllByRole("button", { name: KNOPF }).every((k) => (k as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.queryAllByText("Migration Globalobjekt-Reservierung noch nicht ausgeführt")).toHaveLength(0);
  });
});

describe("Belegung und Vormerkung statt des Knopfs", () => {
  it("zeigt beim reservierten Haus Kunde und Datum, keinen Knopf, und den Status oben", () => {
    zustand.objekte = { haus: haus({ belegung: "reserviert", belegungKundeId: "k-9", belegungKundeName: "Bernd Muster", belegungAm: "2026-09-20T10:00:00.000Z" }) };
    zeige();
    expect(screen.queryAllByRole("button", { name: KNOPF })).toHaveLength(0);
    expect(screen.getAllByText("Haus reserviert").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bernd Muster").length).toBeGreaterThan(0);
    expect(screen.getAllByText("reserviert am 20.09.2026").length).toBeGreaterThan(0);
    expect(screen.getByText("reserviert")).toBeTruthy();
  });

  it("zeigt den Namen nicht, wer ihn nicht sehen darf", () => {
    zustand.rolle = "vertriebspartner";
    zustand.objekte = { haus: haus({ belegung: "reserviert", belegungKundeId: "k-9", belegungKundeName: "Bernd Muster", belegungAm: "2026-09-20T10:00:00.000Z", belegungVon: "anderer-partner" }) };
    zeige();
    expect(screen.getAllByText("Haus reserviert").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Bernd Muster")).toHaveLength(0);
  });

  it("zeigt „vorgemerkt bis“, wenn gerade für einen anderen Kunden eine Vereinbarung unterwegs ist", () => {
    const bis = new Date(Date.now() + 30 * 60_000);
    const uhr = bis.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    zustand.objekte = { haus: haus({ vorgemerktBis: bis.toISOString(), vorgemerktKundeId: "k-7", vorgemerktKundeName: "Clara Kunde" }) };
    zeige();
    expect(screen.queryAllByRole("button", { name: KNOPF })).toHaveLength(0);
    expect(screen.getAllByText(`vorgemerkt bis ${uhr}`).length).toBeGreaterThan(0);
  });

  it("gibt den Knopf nach Ablauf der Vormerkung wieder frei", () => {
    zustand.objekte = { haus: haus({ vorgemerktBis: new Date(Date.now() - 60_000).toISOString(), vorgemerktKundeId: "k-7" }) };
    zeige();
    expect(screen.getAllByRole("button", { name: KNOPF }).length).toBeGreaterThan(0);
  });
});

describe("Hausreservierung aufheben (seit dem 23.09.2026)", () => {
  const reserviert = () => haus({ belegung: "reserviert", belegungKundeId: "k-9", belegungKundeName: "Bernd Muster", belegungAm: "2026-09-20T10:00:00.000Z" });

  it("Admin und Inhaber sehen den Knopf am reservierten Haus", () => {
    for (const rolle of ["admin", "inhaber"]) {
      cleanup();
      zustand.rolle = rolle;
      zustand.objekte = { haus: reserviert() };
      zeige();
      expect(screen.getAllByTestId("haus-aufheben").length).toBeGreaterThan(0);
    }
  });

  it("der Vertrieb sieht ihn nicht", () => {
    for (const rolle of ["vertriebspartner", "vertriebsleiter", "backoffice"]) {
      cleanup();
      zustand.rolle = rolle;
      zustand.objekte = { haus: reserviert() };
      zeige();
      expect(screen.queryAllByTestId("haus-aufheben")).toHaveLength(0);
    }
  });

  it("fragt nach und hebt erst nach der Bestätigung auf", async () => {
    zustand.objekte = { haus: reserviert() };
    zeige();
    fireEvent.click(screen.getAllByTestId("haus-aufheben")[0]);
    expect(await screen.findByText("Hausreservierung wirklich aufheben?")).toBeTruthy();
    expect(zustand.aufgehoben).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Reservierung aufheben" }));
    await vi.waitFor(() => expect(zustand.aufgehoben).toEqual(["haus"]));
  });

  it("fehlt bei einem vorgemerkten Haus, das erledigt die Frist von selbst", () => {
    zustand.objekte = { haus: haus({ vorgemerktBis: new Date(Date.now() + 30 * 60_000).toISOString(), vorgemerktKundeId: "k-7" }) };
    zeige();
    expect(screen.queryAllByTestId("haus-aufheben")).toHaveLength(0);
  });
});
