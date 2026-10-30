import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { writeFileSync } from "node:fs";
import { DashboardKopf } from "./DashboardKopf";
import { QuickActions } from "./QuickActions";

const state = vi.hoisted(() => ({
  wide: false, empty: false, role: "vertriebspartner",
  period: vi.fn(), scope: vi.fn(),
}));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ user: { role: state.role, name: "Christian Test" }, authUser: { id: "u1" } }) }));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
vi.mock("@/lib/kundenStore", () => ({ getKontakte: () => [{ id: "k1", vorname: "Anna", nachname: "Weber" }] }));
vi.mock("@/lib/investmentsStore", () => ({ getInvestments: () => [], getInvestmentsByKontakt: () => [] }));
vi.mock("@/lib/kontaktOwnership", () => ({ kontaktBelongsToUser: () => true }));
vi.mock("@/lib/datenSicht", () => ({ istFuehrungskraft: () => state.wide, teamMitgliederIds: () => new Set() }));
vi.mock("@/lib/zielplanungStore", () => ({ loadZielplanung: () => ({ verkaufsvolumen: [] }) }));
vi.mock("@/lib/dashboardSicht", () => ({ useDashboardFilter: () => ({ zeitraum: "monat", sicht: "eigen", setzeZeitraum: state.period, setzeSicht: state.scope }) }));
vi.mock("./HeuteZuTun", () => ({ HeuteZuTun: () => <section aria-label="Heute zu tun">Gemeinsame Vorgangsliste</section> }));
vi.mock("@/lib/objektDatenPflicht", () => ({ kontaktKaufpreis: () => 840000 }));
vi.mock("@/lib/vorfuehrmodus", () => ({ tarnName: (s: string) => s, unscharfKlasse: (s: string) => s }));
vi.mock("@/lib/dashboardKpis", () => ({
  zeitraumGrenzen: () => ({ von: new Date(), bis: new Date() }), zielFuerZeitraum: () => 1200000,
  berechneDashboardKpis: () => ({ umsatz: 840000, zielProzent: 70, ziel: 1200000, offeneReservierungen: 4, notarBeurkundet: 2, notarGeplant: 1, aktiveLeads: 12, unbearbeiteteLeads: 3, conversionProzent: 25,
    umsatzEintraege: state.empty ? [] : [{ kontaktId: "k1", betrag: 840000, datum: "2026-09-09" }], reservierungEintraege: [], notarEintraege: [], leadEintraege: [] }),
}));

const Location = () => { const l = useLocation(); return <output data-testid="location">{l.pathname}{l.search}</output>; };
const mount = () => render(<MemoryRouter><QuickActions /><DashboardKopf /><Location /></MemoryRouter>);
afterEach(cleanup);
beforeEach(() => { state.wide = false; state.empty = false; state.role = "vertriebspartner"; vi.clearAllMocks(); });

const arbeit = ["Offene Follow-Ups", "Offene Aufgaben", "Anrufe und Termine"];
const fortschritt = ["Umsatz beurkundet", "Offene Reservierungen", "Notartermine", "In Bearbeitung", "Conversion"];
describe("Dashboard-Kennzahlen und Aktionen", () => {
  it("behält Fortschrittskennzahlen neben der gemeinsamen Vorgangsliste", () => {
    const { container } = mount();
    const heute = screen.getByRole("region", { name: "Heute zu tun" });
    const zahlen = screen.getByRole("region", { name: "Fortschritt & Kennzahlen" });
    expect(within(heute).getByText("Gemeinsame Vorgangsliste")).toBeVisible();
    fortschritt.forEach((label) => expect(within(zahlen).getByText(label)).toBeVisible());
    fortschritt.forEach((label) => expect(screen.getAllByText(label)).toHaveLength(1));
    ["840 T€", "70 % vom Ziel (1,2 Mio €)", "2 / 3", "12", "dazu 3 unbearbeitete Leads", "25 %", "Erstgespräch bis Reservierung · Haus: 25 %"].forEach((value) => expect(within(zahlen).getByText(value)).toBeVisible());

    if (process.env.DASHBOARD_QA_HTML) writeFileSync(process.env.DASHBOARD_QA_HTML, container.innerHTML);
  });
  it("öffnet weiterhin die Nachweise und von dort die Kundenakte", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Umsatz beurkundet/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Anna Weber")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: /Anna Weber/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/kunden/k1");
  });
  it("behält Zeitfilter und begrenzt die Datensicht auf berechtigte Rollen", () => {
    const { unmount } = mount();
    expect(screen.queryByRole("button", { name: "Ganze Firma" })).not.toBeInTheDocument();
    for (const [label, value] of [["Monat", "monat"], ["Quartal", "quartal"], ["Jahr", "jahr"]]) {
      fireEvent.click(screen.getByRole("button", { name: label })); expect(state.period).toHaveBeenLastCalledWith(value);
    }
    unmount(); state.wide = true; mount();
    fireEvent.click(screen.getByRole("button", { name: "Ganze Firma" })); expect(state.scope).toHaveBeenCalledWith("firma");
    fireEvent.click(screen.getByRole("button", { name: "Mein Team" })); expect(state.scope).toHaveBeenCalledWith("team");
  });
  it("behält Kennzahlen auch ohne Nachweise und ohne fällige Follow-Ups sichtbar", () => {
    state.empty = true; mount();
    expect(screen.getByText("Umsatz beurkundet")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Umsatz beurkundet/ })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Heute zu tun" })).toBeVisible();
  });
  it.each([["Kontakt anlegen", "/kontakte"], ["Alle Kontakte", "/alle-kontakte"], ["Teampartner anlegen", "/teampartner"], ["Vertriebsakademie", "/vertriebsakademie"]])("behält den Schnellzugriff %s", (label, route) => {
    state.role = "admin";
    mount(); fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByTestId("location")).toHaveTextContent(route);
  });
  it("zeigt Vertriebspartnern Kontakt anlegen, Alle Kontakte und Vertriebsakademie in dieser Reihenfolge", () => {
    const { container } = render(<MemoryRouter><QuickActions /><Location /></MemoryRouter>);
    expect(within(container).getAllByRole("button").map((button) => button.textContent)).toEqual(["Kontakt anlegen", "Alle Kontakte", "Vertriebsakademie"]);
    expect(screen.queryByText("Bestandskunden")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Alle Kontakte" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/alle-kontakte");
  });
  it.each(["inhaber", "admin", "vertriebsleiter"])("behält bei %s die Führungszugriffe mit Alle Kontakte", (role) => {
    state.role = role;
    const { container } = render(<MemoryRouter><QuickActions /></MemoryRouter>);
    expect(within(container).getAllByRole("button").map((button) => button.textContent)).toEqual(["Kontakt anlegen", "Alle Kontakte", "Teampartner anlegen", "Vertriebsakademie"]);
    expect(screen.queryByText("Bestandskunden")).not.toBeInTheDocument();
  });

});
