import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
const fixture = vi.hoisted(() => ({
  role: "admin",
  fail: false,
  loaded: true,
  rows: {} as Record<string, any[]>,
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({
    user: { role: fixture.role, name: "Anna" },
    authUser: { id: "me" },
  }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/lib/dataCache", () => ({
  cacheGet: (table: string) => fixture.rows[table] || [],
  onCacheChange: () => () => {},
  cacheRefreshTable: vi.fn(),
  isTableLoaded: () => fixture.loaded,
  hatLadefehler: () => fixture.fail,
}));
vi.mock("@/lib/datenSicht", () => ({
  teamMitgliederIds: () => new Set(["team"]),
}));
vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: (_key: string, fallback: unknown) => fallback,
}));
vi.mock("@/lib/statsExclusion", () => ({
  excludeStatsKontakte: (rows: unknown) => rows,
  isKontaktStatsExcluded: () => false,
}));
vi.mock("@/components/statistiken/StatistikCustomReports", () => ({
  StatistikCustomReports: () => null,
}));
vi.mock("@/components/statistiken/StatistikAnalysetool", () => ({
  StatistikAnalysetool: () => null,
}));
vi.mock("@/components/statistiken/StatistikLeadZuweisung", () => ({
  StatistikLeadZuweisung: () => <p>Lead-Zuweisung geladen</p>,
}));
vi.mock("@/lib/bewerberStatistik", () => ({
  bewerberKennzahlen: () => ({
    gesamt: 0,
    imProzess: 0,
    aktiv: 0,
    ausgeschieden: 0,
  }),
  bewerberPipelineVerteilung: () => [],
  istBewerberZeile: () => true,
}));
vi.mock("recharts", () => ({
  ResponsiveContainer: () => null,
  BarChart: () => null,
  Bar: () => null,
  LineChart: () => null,
  Line: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));
import Statistiken from "./Statistiken";
const mount = (query = "") =>
  render(
    <MemoryRouter
      initialEntries={[`/statistiken?von=2026-09-01&bis=2026-09-30${query}`]}
    >
      <Statistiken />
    </MemoryRouter>,
  );
beforeEach(() => {
  cleanup();
  fixture.role = "admin";
  fixture.fail = false;
  fixture.loaded = true;
  fixture.rows = {
    profiles: [
      { id: "me", name: "Anna" },
      { id: "team", name: "Ben" },
      { id: "other", name: "Clara" },
    ],
    kontakte: [
      {
        id: "k",
        vorname: "Eigener",
        nachname: "Kunde",
        zustaendig_id: "me",
        erstellt_am: "2026-01-01",
        meta: { pipelineStufe: "reservierung" },
      },
      {
        id: "other",
        vorname: "Fremder",
        nachname: "Kunde",
        zustaendig_id: "other",
        erstellt_am: "2026-01-01",
        meta: { pipelineStufe: "reservierung" },
      },
    ],
    investments: [
      {
        id: "i",
        kunde_id: "k",
        kaufpreis: 200000,
        kaufdatum: "2026-09-04",
        meta: { pipelineStufe: "abgeschlossen" },
      },
      {
        id: "o",
        kunde_id: "other",
        kaufpreis: 900000,
        kaufdatum: "2026-09-04",
        meta: { pipelineStufe: "abgeschlossen" },
      },
    ],
  };
});
describe("Statistikoberfläche", () => {
  it("zeigt verständliche Reiter und schützt versteckte Bereiche auch bei Direktlinks", () => {
    fixture.role = "setterin";
    mount("&tab=sales");
    expect(
      screen.queryByRole("tab", { name: "Umsatz & Provisionen" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Übersicht" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.queryByText("Provisionen und Zahlungsstände"),
    ).not.toBeInTheDocument();
  });
  it("begrenzt eine manipulierte Leitungsansicht auf das eigene Team", () => {
    fixture.role = "vertriebsleiter";
    mount("&sicht=haus");
    expect(
      screen.getByRole("button", {
        name: /Vermitteltes Kaufpreisvolumen: 200/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Gesamtes Haus" }),
    ).not.toBeInTheDocument();
  });
  it("zeigt Ladefehler statt erfundener Nullwerte", () => {
    fixture.fail = true;
    mount();
    expect(
      screen.getByText("Daten konnten nicht vollständig geladen werden"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Neue Kontakte")).not.toBeInTheDocument();
  });
  it("zeigt Laden getrennt von einem leeren Datenbestand", () => {
    fixture.loaded = false;
    mount();
    expect(screen.getByText("Daten werden geladen…")).toBeInTheDocument();
  });
  it("öffnet ausschließlich die Zeilen der gewählten Kennzahl", () => {
    fixture.role = "vertriebspartner";
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: /Abgeschlossene Investments:/ }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Kundenprofil öffnen" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Kundenprofil öffnen" }),
    ).toHaveAttribute("href", "/kunden/k");
  });
  it("zeigt die Lead-Zuweisung der Leitung, aber keinem Vertriebspartner", () => {
    fixture.role = "vertriebsleiter";
    mount("&tab=leadzuweisung");
    expect(screen.getByRole("tab", { name: "Lead-Zuweisung" })).toHaveAttribute("data-state", "active");
    expect(screen.getByText("Lead-Zuweisung geladen")).toBeInTheDocument();
    cleanup();
    fixture.role = "vertriebspartner";
    mount("&tab=leadzuweisung");
    expect(screen.queryByRole("tab", { name: "Lead-Zuweisung" })).not.toBeInTheDocument();
    expect(screen.queryByText("Lead-Zuweisung geladen")).not.toBeInTheDocument();
  });
  it("verwirft umgekehrte Zeiträume", () => {
    render(
      <MemoryRouter
        initialEntries={["/statistiken?von=2026-09-30&bis=2026-09-01"]}
      >
        <Statistiken />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("gültigen Zeitraum");
  });
});
