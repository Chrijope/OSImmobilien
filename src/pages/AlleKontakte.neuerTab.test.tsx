import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AlleKontakte from "./AlleKontakte";

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: "admin", name: "Test Leitung", moreId: "test" }, authUser: { id: "u-test" } }),
}));
vi.mock("@/components/DashboardLayout", () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/hooks/useUserSettings", () => ({ useUserSettings: () => ({ settings: {}, saveSettings: vi.fn(), loaded: true }) }));
vi.mock("@/hooks/useVertretungen", () => ({ useVertretungen: () => new Set<string>() }));
vi.mock("@/lib/loadAllUsers", () => ({ loadAllUsers: () => [] }));
vi.mock("@/lib/kundenStore", async (orig) => ({
  ...(await orig<typeof import("@/lib/kundenStore")>()),
  getKontakte: () => [{
    id: "k-test-1",
    vorname: "Testvorname",
    nachname: "Testnachname",
    berater: "Test Leitung",
    erstellt_am: "2026-09-01T10:00:00Z",
    pipelineStufe: "neu",
    status: "neu",
  }],
}));

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount() {
  return render(
    <MemoryRouter initialEntries={["/alle-kontakte"]}>
      <Routes>
        <Route path="/alle-kontakte" element={<AlleKontakte />} />
        <Route path="/kunden/:id" element={<div>Kundenprofil geöffnet</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Zweite Spalte: das Anlagedatum, ohne eigene Links oder Knöpfe.
const datumZelle = () => screen.getByText("Testnachname").closest("tr")!.querySelector("td:nth-child(2)")!;

describe("Alle Kontakte: Kundenprofil in neuem Tab", () => {
  it("macht den Namen zu einem echten Link aufs Kundenprofil", () => {
    mount();
    expect(screen.getByRole("link", { name: "Testvorname" })).toHaveAttribute("href", "/kunden/k-test-1");
    expect(screen.getByText("Testnachname").closest("a")).toHaveAttribute("href", "/kunden/k-test-1");
  });

  it("hat je Zeile einen Knopf, der sicher in einem neuen Tab öffnet", () => {
    mount();
    const knopf = screen.getByRole("link", { name: "In neuem Tab öffnen" });
    expect(knopf).toHaveAttribute("href", "/kunden/k-test-1");
    expect(knopf).toHaveAttribute("target", "_blank");
    expect(knopf).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("öffnet bei Strg+Klick und Mittelklick auf die Zeile einen neuen Tab", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    mount();
    fireEvent.click(datumZelle(), { ctrlKey: true });
    fireEvent(datumZelle(), new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith("/kunden/k-test-1", "_blank", "noopener");
    expect(screen.queryByText("Kundenprofil geöffnet")).not.toBeInTheDocument();
  });

  it("navigiert beim Markieren über das Auswahlkästchen nicht", () => {
    mount();
    const kaestchen = screen.getByRole("checkbox", { name: "Testvorname Testnachname auswählen" });
    fireEvent.click(kaestchen);
    expect(screen.queryByText("Kundenprofil geöffnet")).not.toBeInTheDocument();
    expect(kaestchen).toHaveAttribute("data-state", "checked");
  });

  it("öffnet bei normalem Klick auf die Zeile wie bisher im selben Tab", () => {
    mount();
    fireEvent.click(datumZelle());
    expect(screen.getByText("Kundenprofil geöffnet")).toBeInTheDocument();
  });

  it("zeigt das Anlagedatum ohne Kalender-Symbol", () => {
    mount();
    expect(datumZelle().textContent).toMatch(/2026/);
    expect(datumZelle().querySelector("svg")).toBeNull();
  });
});

describe("Alle Kontakte: Spaltenreihenfolge", () => {
  const kopf = () => Array.from(document.querySelectorAll("thead th")).slice(1).map((th) => th.textContent?.trim());

  it("zeigt Pipeline-Status vor Quelle und Kategorie vor Vertriebspartner", () => {
    mount();
    expect(kopf()).toEqual([
      "Angelegt am", "Vorname", "Nachname", "Telefon", "E-Mail",
      "Pipeline-Status", "Quelle", "Typ", "Kategorie", "Vertriebspartner",
    ]);
  });

  it("setzt die Zellen unter die passende Kopfzeile", () => {
    mount();
    const zellen = screen.getByText("Testnachname").closest("tr")!.querySelectorAll("td");
    // +1 wegen der Auswahlspalte vorne.
    expect(zellen[kopf().indexOf("Vertriebspartner") + 1].textContent).toBe("Test Leitung");
    expect(zellen.length).toBe(kopf().length + 1);
  });
});
