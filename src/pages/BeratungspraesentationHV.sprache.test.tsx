import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BeratungspraesentationHV from "./BeratungspraesentationHV";

/*
 * Sprachwechsel der Beratungspräsentation OS Immobilien.
 *
 * Die Präsentation erscheint an zwei Stellen: unter Unterlagen und
 * Präsentation ohne Kunden und im Kundenprofil beim Investment mit Kunde,
 * Kontakt und Investment in der Adresse. Beide öffnen dieselbe Seite, also
 * muss an beiden derselbe Schalter stehen und dasselbe tun.
 */

const zustand = vi.hoisted(() => ({ nutzerId: "nutzer-1" }));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({
    user: { name: "Maria Muster", role: "vertriebspartner", moreId: "M-0001", email: "maria@example.com" },
    authUser: { id: zustand.nutzerId, email: "maria@example.com" },
  }),
}));
vi.mock("@/hooks/useUserSettings", () => ({
  useUserSettings: () => ({ settings: { profil: { telefon: "0911 000000" } } }),
}));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/lib/dataCache", () => ({ onCacheChange: () => () => {} }));
vi.mock("@/lib/kundenStore", () => ({
  // Der erfundene Kontakt aus dem Kundenprofil wird gesiezt.
  getKontaktById: (id: string) => (id === "k-1" ? { setterSkript: { anrede: "sie" } } : undefined),
}));
vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentMetaField: (_id: string, _feld: string, rueckfall: unknown) => rueckfall,
}));
/*
 * Das Radix-Menü des Schalters wird hier durch ein schlichtes Double ersetzt.
 * In jsdom gibt es keine Positionen, das offene Menü rendert sich deshalb
 * laufend neu und bremst die Testumgebung für alle folgenden Tests aus. Im
 * Browser und im Kundenportal läuft dasselbe Menü unauffällig. Geprüft wird
 * hier die Verdrahtung: welcher Wert angezeigt wird und was ein Eintrag tut.
 */
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" role="menuitem" onClick={onClick}>
      {children}
    </button>
  ),
}));

// jsdom kennt weder die Beobachter noch einen localStorage.
class Beobachter {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const ablage = new Map<string, string>();
beforeEach(() => {
  ablage.clear();
  zustand.nutzerId = "nutzer-1";
  vi.stubGlobal("IntersectionObserver", Beobachter);
  vi.stubGlobal("ResizeObserver", Beobachter);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => ablage.get(k) ?? null,
    setItem: (k: string, v: string) => void ablage.set(k, v),
    removeItem: (k: string) => void ablage.delete(k),
    clear: () => ablage.clear(),
  });
});
afterEach(() => vi.unstubAllGlobals());

const UNTERLAGEN = "/beratungspraesentation-moreimmo";
const KUNDENPROFIL = "/beratungspraesentation-moreimmo?kunde=Max%20Muster&kundeId=k-1&investmentId=i-1";

function zeige(adresse: string) {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <Routes>
        <Route path="/beratungspraesentation-moreimmo" element={<BeratungspraesentationHV />} />
      </Routes>
    </MemoryRouter>,
  );
}

function schalteAuf(sprache: "Deutsch" | "English") {
  // Nur im Menü des Schalters suchen, eine Rollenabfrage über die ganze Seite dauert Sekunden.
  const menue = screen.getByTestId("sprachwechsel").parentElement?.querySelector("[role='menu']") as HTMLElement;
  fireEvent.click(within(menue).getByRole("menuitem", { name: new RegExp(sprache) }));
}

/**
 * Eine Abschnittsüberschrift über ihren Text. Nicht über getByRole: Auf einer
 * Seite dieser Größe braucht die Rollenabfrage Sekunden je Aufruf.
 */
const ueberschriften = () => Array.from(document.querySelectorAll("h2")).map((h) => h.textContent);
const ueberschrift = (name: string) => {
  const treffer = Array.from(document.querySelectorAll("h2")).find((h) => h.textContent === name);
  if (!treffer) throw new Error(`Keine Überschrift "${name}", vorhanden: ${ueberschriften().join(" | ")}`);
  return treffer;
};

describe("Sprachwechsel der Beratungspräsentation", () => {
  it("startet auf Deutsch und schaltet die Texte auf Englisch um", () => {
    zeige(UNTERLAGEN);
    expect(ueberschrift("Was machen wir heute?")).toBeInTheDocument();
    expect(screen.getByTestId("sprachwechsel")).toHaveTextContent("DE");
    expect(screen.getByTestId("sprachwechsel")).toHaveAccessibleName("Sprache");

    schalteAuf("English");

    expect(ueberschrift("What are we doing today?")).toBeInTheDocument();
    expect(ueberschrift("The calculation, line by line")).toBeInTheDocument();
    expect(ueberschriften()).not.toContain("Was machen wir heute?");
    expect(screen.getByTestId("sprachwechsel")).toHaveTextContent("EN");
    expect(screen.getByTestId("sprachwechsel")).toHaveAccessibleName("Language");
    // Referenzen und Beträge folgen mit.
    expect(document.body.textContent).toContain("Our projects");
    expect(document.body.textContent).toContain("€350,000");

    schalteAuf("Deutsch");
    expect(ueberschrift("Was machen wir heute?")).toBeInTheDocument();
  });

  it("merkt die Wahl je Nutzer", () => {
    zeige(UNTERLAGEN);
    schalteAuf("English");
    expect(ablage.get("beratungspraesentation-sprache:nutzer-1")).toBe("en");
  });

  it("öffnet in der gemerkten Sprache, aber nur für diesen Nutzer", () => {
    ablage.set("beratungspraesentation-sprache:nutzer-1", "en");
    const { unmount } = zeige(UNTERLAGEN);
    expect(ueberschrift("What are we doing today?")).toBeInTheDocument();
    unmount();

    zustand.nutzerId = "nutzer-2";
    zeige(UNTERLAGEN);
    expect(ueberschrift("Was machen wir heute?")).toBeInTheDocument();
  });

  it("zeigt in Abschnitt 02 die Partnerlogos OS Immobilien und MORE Finance in beiden Sprachen", () => {
    zeige(KUNDENPROFIL);
    const partner = () => screen.getAllByTestId("partner-logo");
    expect(partner()).toHaveLength(2);
    expect(within(partner()[0]).getByAltText("OS Immobilien")).toBeInTheDocument();
    expect(partner()[0]).toHaveTextContent("Objektpartner");
    expect(partner()[0]).toHaveTextContent("Über OS Immobilien vertreiben wir die Objekte und Einheiten.");
    expect(within(partner()[1]).getByAltText("MORE Finance")).toBeInTheDocument();
    expect(partner()[1]).toHaveTextContent("Finanzierungspartner");
    expect(partner()[1]).toHaveTextContent("MORE Finance übernimmt die Finanzierung.");

    schalteAuf("English");
    expect(partner()[0]).toHaveTextContent("Property partner");
    expect(partner()[0]).toHaveTextContent("We market the properties and units through OS Immobilien.");
    expect(partner()[1]).toHaveTextContent("Financing partner");
    expect(partner()[1]).toHaveTextContent("MORE Finance handles the financing.");
  });

  it("zeigt auf Englisch keinen Gedankenstrich", () => {
    zeige(KUNDENPROFIL);
    schalteAuf("English");
    expect(document.body.textContent).not.toMatch(/[—–]/);
  });

  it("sitzt in der Kopfleiste, bleibt also beim Durchblättern sichtbar, und fehlt im Druck", () => {
    zeige(UNTERLAGEN);
    const kopf = document.querySelector("header[data-lg='kopfscheibe']") as HTMLElement;
    expect(within(kopf).getByTestId("sprachwechsel")).toBeInTheDocument();
    expect(kopf.className).toContain("sticky");
    const huelle = screen.getByTestId("sprachwechsel").closest("[data-pdf-exclude]");
    expect(huelle?.className).toContain("print:hidden");
  });
});

describe("An beiden Einbindungsstellen derselbe Schalter", () => {
  it.each([
    ["Unterlagen und Präsentation", UNTERLAGEN],
    ["Kundenprofil beim Investment", KUNDENPROFIL],
  ])("%s: genau ein Schalter, der umschaltet", (_stelle, adresse) => {
    zeige(adresse);
    expect(screen.getAllByTestId("sprachwechsel")).toHaveLength(1);
    schalteAuf("English");
    expect(ueberschrift("What are we doing today?")).toBeInTheDocument();
    expect(document.documentElement.querySelector("[data-praesentation='beratung']")).toHaveAttribute("lang", "en");
  });

  it("im Kundenprofil bleibt der Kundenname unübersetzt, die Anrede wird zu you", () => {
    zeige(KUNDENPROFIL);
    // Deutsch mit der Sie-Form aus dem Erstgespräch.
    expect(document.body.textContent).toContain("dass Sie am Ende wissen");
    schalteAuf("English");
    expect(document.body.textContent).toContain("Welcome Max Muster");
    expect(document.body.textContent).toContain("by the end you know which options suit your situation");
  });

  it("alle Wege führen auf dieselbe Seite", () => {
    const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");
    // Sidebar Präsentation
    expect(lies("src/pages/Praesentation.tsx")).toContain('internalRoute: "/beratungspraesentation-moreimmo"');
    // Sidebar Unterlagen
    expect(lies("src/lib/unterlagenSeed.ts")).toContain('interneRoute: "/beratungspraesentation-moreimmo"');
    // Kundenprofil beim Investment
    expect(lies("src/pages/KundenDetail.tsx")).toContain("window.open(`/beratungspraesentation-moreimmo?${params.toString()}`");
    // Und die Route zeigt genau diese Komponente.
    expect(lies("src/App.tsx")).toMatch(
      /path="\/beratungspraesentation-moreimmo" element=\{<PraesentationGuard><BeratungspraesentationHV \/><\/PraesentationGuard>\}/,
    );
  });
});
