import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BeratungspraesentationHV from "./BeratungspraesentationHV";

/*
 * Karte „Dein persönlicher Ansprechpartner“ unter der Unternehmensgruppe, in
 * A und B. Mit Kunde zeigt sie den zuständigen Partner, sonst den Angemeldeten.
 * Alle Personen sind erfunden.
 */

const zustand = vi.hoisted(() => ({
  eigen: {} as Record<string, string | undefined>,
  profile: [] as Array<Record<string, string>>,
  rollen: [] as Array<{ user_id: string; role: string }>,
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { name: "Alex Beispiel", role: "vertriebspartner" }, authUser: { id: "nutzer-1" } }),
}));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/lib/dataCache", () => ({
  onCacheChange: () => () => {},
  cacheGet: (tabelle: string) => (tabelle === "profiles" ? zustand.profile : tabelle === "user_roles" ? zustand.rollen : []),
}));
vi.mock("@/lib/beraterProfil", () => ({ ladeBerater: () => ({ name: "", ...zustand.eigen }) }));
vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: (id: string) => (id === "k-1" ? { vorname: "Anna", nachname: "Muster", zustaendig_id: "partner-2" } : undefined),
}));
vi.mock("@/lib/investmentsStore", () => ({ getInvestmentMetaField: (_i: string, _f: string, rueckfall: unknown) => rueckfall }));

class Beobachter {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeEach(() => {
  zustand.eigen = { position: "Immobilienberater", telefon: "030 111", email: "alex@example.com" };
  zustand.profile = [];
  zustand.rollen = [];
  vi.stubGlobal("IntersectionObserver", Beobachter);
});
afterEach(() => vi.unstubAllGlobals());

function karte(adresse: string, variante: "a" | "b") {
  render(
    <MemoryRouter initialEntries={[adresse]}>
      <Routes>
        <Route path="*" element={<BeratungspraesentationHV variante={variante} />} />
      </Routes>
    </MemoryRouter>,
  );
  return within(screen.getByTestId("ansprechpartner"));
}

describe.each(["a", "b"] as const)("Ansprechpartner in Fassung %s", (variante) => {
  it("steht im Abschnitt Unternehmensgruppe, mit Initialen, Telefon und Mail", () => {
    const k = karte("/", variante);
    expect(document.getElementById("gruppe")!.contains(screen.getByTestId("ansprechpartner"))).toBe(true);
    expect(k.getByText("Dein persönlicher Ansprechpartner")).toBeInTheDocument();
    expect(k.getByText("Alex Beispiel")).toBeInTheDocument();
    expect(k.getByText("Immobilienberater")).toBeInTheDocument();
    expect(k.getByTestId("ansprechpartner-initialen").textContent).toBe("AB");
    expect(k.getByText("030 111").closest("a")).toHaveAttribute("href", "tel:030111");
    expect(k.getByText("alex@example.com").closest("a")).toHaveAttribute("href", "mailto:alex@example.com");
  });
});

describe.each(["a", "b"] as const)("Vorteile der Gruppe in Fassung %s", (variante) => {
  it("zeigt die vier Vorteile unter den Logos, über der Ansprechpartner-Karte", () => {
    karte("/", variante);
    const leiste = screen.getByTestId("gruppe-vorteile");
    expect(document.getElementById("gruppe")!.contains(leiste)).toBe(true);
    const v = within(leiste);
    for (const titel of ["Rundum-sorglos", "Provisionsfrei", "Verwaltung", "Finanzierung"]) {
      expect(v.getByText(titel)).toBeInTheDocument();
    }
    expect(v.getByText("Du kaufst direkt vom Bauträger, ohne Maklerprovision.")).toBeInTheDocument();
    expect(v.getByText("Finanzierung auch ohne Eigenkapital möglich.")).toBeInTheDocument();
    expect(leiste.compareDocumentPosition(screen.getByTestId("ansprechpartner")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("Ansprechpartner, Einzelfälle", () => {
  it("zeigt das Foto statt der Initialen", () => {
    zustand.eigen.bild = "https://example.com/alex.jpg";
    const k = karte("/", "a");
    expect(k.getByRole("img", { name: "Alex Beispiel" })).toHaveAttribute("src", "https://example.com/alex.jpg");
    expect(k.queryByTestId("ansprechpartner-initialen")).toBeNull();
  });

  it("lässt die Knöpfe ohne Telefon und Mail weg", () => {
    zustand.eigen = { position: "Immobilienberater" };
    const k = karte("/", "b");
    expect(k.queryAllByRole("link")).toHaveLength(0);
  });

  it("zeigt mit Kunde den zuständigen Partner statt des Angemeldeten", () => {
    zustand.profile = [{ id: "partner-2", name: "Kim Erfunden", telefon: "0170 222", email: "kim@example.com" }];
    zustand.rollen = [{ user_id: "partner-2", role: "vertriebspartner" }];
    const k = karte("/?kundeId=k-1&investmentId=i-1", "a");
    expect(k.getByText("Kim Erfunden")).toBeInTheDocument();
    expect(k.queryByText("Alex Beispiel")).toBeNull();
    expect(k.getByText("0170 222").closest("a")).toHaveAttribute("href", "tel:0170222");
    expect(k.getByTestId("ansprechpartner-initialen").textContent).toBe("KE");
  });
});
