import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BeratungspraesentationHV from "./BeratungspraesentationHV";

/*
 * Abschnitte 15 und 16 (16.10.2026), in A und B: Knopf „Objektvorstellung
 * buchen“ mit dem Link des zuständigen Partners, keine Ja/Nein-Knöpfe mehr,
 * Kundenportal erst nach der unterschriebenen Selbstauskunft.
 */

const zustand = vi.hoisted(() => ({
  profile: [] as Array<Record<string, unknown>>,
  saSigned: false,
  portalStatus: "none",
  freischalten: vi.fn(async () => true),
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { name: "Maria Muster", role: "vertriebspartner" }, authUser: { id: "nutzer-1" } }),
}));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/lib/dataCache", () => ({
  onCacheChange: () => () => {},
  cacheGet: (t: string) => (t === "profiles" ? zustand.profile : []),
}));
vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: (id: string) =>
    id === "k-1" ? { anrede: "Frau", vorname: "Anna", nachname: "Muster", email: "anna@example.com", zustaendig_id: "partner-2" } : undefined,
}));
vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentMetaField: (_id: string, feld: string, rueckfall: unknown) => (feld === "saSigned" ? zustand.saSigned : rueckfall),
  getInvestmentsByKontakt: () => [{ id: "i-1" }],
}));
vi.mock("@/lib/kundenportalFreischalten", () => ({
  portalMetaLesen: () => ({ status: zustand.portalStatus }),
  kundenportalFreischalten: zustand.freischalten,
}));

class Beobachter {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const ablage = new Map<string, string>();
beforeEach(() => {
  ablage.clear();
  zustand.profile = [];
  zustand.saSigned = false;
  zustand.portalStatus = "none";
  zustand.freischalten.mockClear();
  vi.stubGlobal("IntersectionObserver", Beobachter);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => ablage.get(k) ?? null,
    setItem: (k: string, v: string) => void ablage.set(k, v),
    removeItem: (k: string) => void ablage.delete(k),
    clear: () => ablage.clear(),
  });
});
afterEach(() => vi.unstubAllGlobals());

const MIT_KUNDE = "/x?kundeId=k-1&investmentId=i-1";

function zeige(adresse: string, variante: "a" | "b") {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <Routes>
        <Route path="*" element={<BeratungspraesentationHV variante={variante} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe.each(["a", "b"] as const)("Beratungspräsentation %s, Abschnitte 15 und 16", (variante) => {
  it("öffnet mit Kunde den Objektvorstellungs-Link des zuständigen Partners im neuen Tab", () => {
    zustand.profile = [
      { id: "nutzer-1", name: "Maria Muster", objektlink: "https://termin.example/eigen" },
      { id: "partner-2", name: "Paul Partner", objektlink: "https://termin.example/paul" },
    ];
    zeige(MIT_KUNDE, variante);
    const link = screen.getByRole("link", { name: /Objektvorstellung buchen/ });
    expect(link).toHaveAttribute("href", "https://termin.example/paul");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("nimmt ohne Kunde den Link des Angemeldeten", () => {
    zustand.profile = [
      { id: "nutzer-1", name: "Maria Muster", objektlink: "https://termin.example/eigen" },
      { id: "partner-2", name: "Paul Partner", objektlink: "https://termin.example/paul" },
    ];
    zeige("/x", variante);
    expect(screen.getByRole("link", { name: /Objektvorstellung buchen/ })).toHaveAttribute("href", "https://termin.example/eigen");
  });

  it("graut den Knopf ohne Link aus und sagt warum", () => {
    zustand.profile = [{ id: "partner-2", name: "Paul Partner", objektlink: "" }];
    zeige(MIT_KUNDE, variante);
    expect(screen.queryByRole("link", { name: /Objektvorstellung buchen/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Objektvorstellung buchen/ })).toBeDisabled();
    expect(screen.getByText("Kein Buchungslink für die Objektvorstellung in den Einstellungen hinterlegt")).toBeInTheDocument();
  });

  it("hat keine Knöpfe Ja, Nein und Ja unter Bedingung mehr", () => {
    zeige(MIT_KUNDE, variante);
    expect(screen.queryByRole("button", { name: "Ja unter Bedingung" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nein" })).toBeNull();
    expect(screen.queryByText(/Antwort festhalten/)).toBeNull();
    expect(screen.queryByText("Bitte bis zum Termin bereitlegen")).toBeNull();
  });

  it("graut das Kundenportal vor der Unterschrift aus", () => {
    zeige(MIT_KUNDE, variante);
    expect(screen.getByText(/Nach der gemeinsam ausgefüllten und von dir unterschriebenen Selbstauskunft/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kundenportal freigeben/ })).toBeDisabled();
    expect(screen.getByText("Erst nach der unterschriebenen Selbstauskunft")).toBeInTheDocument();
  });

  it("graut das Kundenportal ohne Kunde und Investment aus, auch wenn nichts unterschrieben sein kann", () => {
    zustand.saSigned = true;
    zeige("/x?kundeId=k-1", variante);
    expect(screen.getByRole("button", { name: /Kundenportal freigeben/ })).toBeDisabled();
  });

  it("gibt nach der Unterschrift über den Weg des Kundenprofils frei", async () => {
    zustand.saSigned = true;
    zeige(MIT_KUNDE, variante);
    const knopf = screen.getByRole("button", { name: /Kundenportal freigeben/ });
    expect(knopf).toBeEnabled();
    fireEvent.click(knopf);
    await waitFor(() => expect(zustand.freischalten).toHaveBeenCalledTimes(1));
    expect(zustand.freischalten).toHaveBeenCalledWith(
      expect.objectContaining({ kontaktId: "k-1", investmentIds: ["i-1"], vonName: "Maria Muster" }),
    );
  });

  it("simuliert die Freigabe in der Vorschau und versendet nichts", () => {
    render(
      <MemoryRouter>
        <BeratungspraesentationHV
          variante={variante}
          vorschau={{ schluessel: "vorschau-t", kundenName: "Anna", kontakt: {}, skript: null, saUnterschrieben: true }}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Kundenportal freigeben/ }));
    expect(zustand.freischalten).not.toHaveBeenCalled();
    expect(screen.getByText("Kundenportal ist freigegeben")).toBeInTheDocument();
    expect(screen.getByTestId("vorschau-portal")).toBeInTheDocument();
  });

  it("zeigt „Kundenportal ist freigegeben“ statt Knopf, wenn es schon offen ist", () => {
    zustand.saSigned = true;
    zustand.portalStatus = "eingeladen";
    zeige(MIT_KUNDE, variante);
    expect(screen.queryByRole("button", { name: /Kundenportal freigeben/ })).toBeNull();
    expect(screen.getByText("Kundenportal ist freigegeben")).toBeInTheDocument();
  });
});
