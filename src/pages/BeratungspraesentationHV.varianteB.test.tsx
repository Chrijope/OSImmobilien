import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BeratungspraesentationHV from "./BeratungspraesentationHV";
import { isUrlAllowedForRole } from "@/lib/sidebarPermissions";
import { ENTFERNTE_DOKUMENT_IDS, mitNachgetragenen, seedUnterlagen } from "@/lib/unterlagenSeed";

/*
 * Beratungspräsentation B (Vergleichsfassung, 16.10.2026): dieselbe Seite mit
 * variante="b". Geprüft wird, was B anders macht, und dass A davon nichts merkt.
 */

const zustand = vi.hoisted(() => ({ skript: null as Record<string, unknown> | null }));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { name: "Maria Muster", role: "vertriebspartner" }, authUser: { id: "nutzer-1" } }),
}));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/lib/dataCache", () => ({ onCacheChange: () => () => {}, cacheGet: () => [] }));
vi.mock("@/lib/kundenStore", () => ({
  getKontaktById: (id: string) => (id === "k-1" ? { anrede: "Frau", vorname: "Anna", nachname: "Muster" } : undefined),
}));
vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentMetaField: (_id: string, feld: string, rueckfall: unknown) =>
    feld === "setterSkript" ? zustand.skript ?? rueckfall : rueckfall,
}));

class Beobachter {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const ablage = new Map<string, string>();
beforeEach(() => {
  ablage.clear();
  zustand.skript = null;
  vi.stubGlobal("IntersectionObserver", Beobachter);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => ablage.get(k) ?? null,
    setItem: (k: string, v: string) => void ablage.set(k, v),
    removeItem: (k: string) => void ablage.delete(k),
    clear: () => ablage.clear(),
  });
});
afterEach(() => vi.unstubAllGlobals());

const B = "/beratungspraesentation-osimmobilien-b";
const B_KUNDE = `${B}?kunde=Anna%20Muster&kundeId=k-1&investmentId=i-1`;

function zeige(adresse: string, variante: "a" | "b" = "b") {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <Routes>
        <Route path="*" element={<BeratungspraesentationHV variante={variante} />} />
      </Routes>
    </MemoryRouter>,
  );
}
const ueberschriften = () => Array.from(document.querySelectorAll("h2")).map((h) => h.textContent);
const ziele = () => document.getElementById("ziele")!;

describe("Abschnitt 02 in B", () => {
  it("zeigt dieselbe Ziele-Seite wie die normale Präsentation", () => {
    zeige(B);
    expect(ziele().querySelector("h2")?.textContent).toBe("Das wünschen sich die meisten unserer Kunden.");
    expect(ziele().querySelector('[data-testid="wuensche"]')?.textContent).toContain("Steuern sparen");
    expect(screen.getByLabelText("Motiv in den Worten des Kunden")).toBeInTheDocument();
    expect(screen.getByLabelText("Erfahrung mit Immobilien")).toBeInTheDocument();
    expect(ziele().querySelectorAll("button").length).toBeGreaterThan(0);
  });
});

describe("Inhalte in B", () => {
  it("tauscht Abschnitt 05 und behält die übrige Reihenfolge", () => {
    zeige(B);
    const ist = ueberschriften();
    expect(ist.indexOf("Alles aus einer Hand, unter einem Dach.")).toBeLessThan(ist.indexOf("OS Real Estate in einem Satz."));
    expect(ist.indexOf("Geld auf dem Konto verliert real an Wert.")).toBeGreaterThan(-1);
    expect(ist.indexOf("Geld auf dem Konto verliert real an Wert.")).toBeLessThan(ist.indexOf("Alles aus einer Hand, unter einem Dach."));
  });

  it("zeigt die Kaufkraft über 25 Jahre als Kurven wie in der PDF und den Verlust in Rot", () => {
    zeige(B);
    const label = screen.getByTestId("kaufkraft-jahre").querySelector("svg")?.getAttribute("aria-label");
    expect(label).toContain("164.061 €");
    expect(label).toContain("88.493 €");
    expect(label).toContain("53.939 €");
    expect(screen.getByTestId("kaufkraft-jahre").textContent).toContain("25 J.");
    expect(screen.getByTestId("kaufkraft-verlust").style.background).toBeTruthy();
  });

  it("zeigt das Dokument zum Konzept am Ende seiner Folien und bei „beides“ beide", () => {
    zeige(B);
    const link = () => screen.getByTestId("dokumente-b").querySelectorAll("a");
    expect(link()).toHaveLength(1);
    expect(link()[0]).toHaveTextContent("Dokument öffnen: Altersvorsorge");
    expect(link()[0]).toHaveAttribute("target", "_blank");
    expect(screen.getByTestId("konzept-inhalt-alter")).toContainElement(screen.getByTestId("dokumente-b"));
    fireEvent.click(screen.getAllByRole("radio", { name: "Konzept 2 · Steuerersparnis" })[0]);
    expect(link()[0]).toHaveTextContent("Dokument öffnen: Steuerersparnis");
    expect(link()[0]).toHaveAttribute("href", "/vertriebsunterlagen/steuerersparnis-mit-immobilien.pdf");
  });

  it("zeigt bei Schwerpunkt beides beide Dokumente", () => {
    zustand.skript = { anrede: "du", antworten: { schwerpunkt: "beides" } };
    zeige(B_KUNDE);
    expect(screen.getAllByTestId("dokumente-b").flatMap((d) => [...d.querySelectorAll("a")])).toHaveLength(2);
  });

  it("die PDFs liegen im Repo", () => {
    for (const datei of ["steuerersparnis-mit-immobilien.pdf", "arbeitsleistung-und-immobilienvermoegen.pdf"]) {
      const kopf = readFileSync(resolve(process.cwd(), "public/vertriebsunterlagen", datei)).subarray(0, 5).toString();
      expect(kopf).toBe("%PDF-");
    }
  });
});

describe("Fassung A bleibt unberührt", () => {
  it("hat keine B-Bausteine und die alte Reihenfolge", () => {
    zeige("/beratungspraesentation-osimmobilien", "a");
    // Seit 20.10.2026 haben A und B die rote Verlustkarte und dieselbe Jahresgrafik.
    expect(screen.getByTestId("kaufkraft-verlust")).toBeInTheDocument();
    expect(screen.getByTestId("kaufkraft-jahre")).toBeInTheDocument();
    for (const id of ["ziele-erstgespraech", "dokumente-b"]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    const ist = ueberschriften();
    expect(ist.indexOf("OS Real Estate in einem Satz.")).toBeLessThan(ist.indexOf("Alles aus einer Hand, unter einem Dach."));
    expect(screen.getByLabelText("Motiv in den Worten des Kunden")).toBeInTheDocument();
  });
});

describe("Einbindung von B", () => {
  const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");

  it("ist seit dem 20.10.2026 die einzige Fassung, die alte B-Adresse leitet um", () => {
    const app = lies("src/App.tsx");
    expect(app).toContain(
      '<Route path="/beratungspraesentation-osimmobilien" element={<PraesentationGuard><BeratungspraesentationHV variante="b" /></PraesentationGuard>} />',
    );
    expect(app).toMatch(/path="\/beratungspraesentation-osimmobilien-b" element=\{<Navigate to=\{`\/beratungspraesentation-osimmobilien\$\{window\.location\.search\}`\}/);
    expect(lies("src/pages/KundenDetail.tsx")).not.toContain("/beratungspraesentation-osimmobilien-b");
    expect(lies("src/pages/Praesentation.tsx")).not.toContain('internalRoute: "/beratungspraesentation-osimmobilien-b"');
  });

  it("folgt den Rechten der Präsentationsseite", () => {
    for (const rolle of ["vertriebsleiter", "backoffice"] as const) {
      expect(isUrlAllowedForRole(B, rolle)).toBe(true);
    }
    expect(isUrlAllowedForRole(B, "hausverwaltung")).toBe(false);
  });

  it("Fassung B steht nicht mehr gesondert in den Unterlagen und wird aus gespeicherten Listen entfernt", () => {
    const ids = seedUnterlagen().find((a) => a.id === "praesentation")!.dokumente.map((d) => d.id);
    expect(ids).not.toContain("p-beratung-b");
    expect(ENTFERNTE_DOKUMENT_IDS).toContain("p-beratung-b");
    expect(mitNachgetragenen(seedUnterlagen()).geaendert).toBe(false);
  });
});
