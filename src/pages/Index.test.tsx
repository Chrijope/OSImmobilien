import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { writeFileSync } from "node:fs";
import bestand from "./dashboard-rollen-bestand.json";
import Index from "./Index";

const state = vi.hoisted(() => ({ role: "admin", settings: {} as Record<string, boolean> }));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ user: { role: state.role, name: "Christian Test", moreId: "test" } }) }));
vi.mock("@/components/DashboardLayout", () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false }));
vi.mock("@/lib/userSettingsCache", () => ({ getUserSetting: () => state.settings, setUserSetting: vi.fn() }));
vi.mock("@/lib/kulturContent", () => ({ glaubenssatzDesTages: () => "Gemeinsam weiterkommen." }));
vi.mock("@/components/dashboard/ObjektpartnerDashboard", () => ({ ObjektpartnerDashboard: () => <div data-component="ObjektpartnerDashboard">ObjektpartnerDashboard</div> }));
vi.mock("@/components/dashboard/FinanzierungspartnerDashboard", () => ({ FinanzierungspartnerDashboard: () => <div data-component="FinanzierungspartnerDashboard">FinanzierungspartnerDashboard</div> }));
vi.mock("@/components/dashboard/FinanzierungsPerformanceBlock", () => ({ FinanzierungsPerformanceBlock: () => <div data-component="FinanzierungsPerformanceBlock">FinanzierungsPerformanceBlock</div> }));
vi.mock("@/components/dashboard/UmsatzChart", () => ({ UmsatzChart: () => <div data-component="UmsatzChart">UmsatzChart</div> }));
vi.mock("@/components/dashboard/LeadChart", () => ({ LeadChart: () => <div data-component="LeadChart">LeadChart</div> }));
vi.mock("@/components/dashboard/ProvisionChart", () => ({ ProvisionChart: () => <div data-component="ProvisionChart">ProvisionChart</div> }));
vi.mock("@/components/dashboard/NotartermineCard", () => ({ NotartermineCard: () => <div data-component="NotartermineCard">NotartermineCard</div> }));
vi.mock("@/components/dashboard/KundenCard", () => ({ KundenCard: () => <div data-component="KundenCard">KundenCard</div> }));
vi.mock("@/components/dashboard/PotenzialCard", () => ({ PotenzialCard: () => <div data-component="PotenzialCard">PotenzialCard</div> }));
vi.mock("@/components/dashboard/DashboardKopf", () => ({ DashboardKopf: () => <div data-component="DashboardKopf">DashboardKopf</div> }));
vi.mock("@/components/dashboard/QuickActions", () => ({ QuickActions: () => <div data-component="QuickActions">QuickActions</div> }));
vi.mock("@/components/dashboard/MicroseiteCard", () => ({ MicroseiteCard: () => <div data-component="MicroseiteCard">MicroseiteCard</div> }));
vi.mock("@/components/dashboard/GeburtstageCard", () => ({ GeburtstageCard: () => <div data-component="GeburtstageCard">GeburtstageCard</div> }));
vi.mock("@/components/dashboard/WeeklyCallCard", () => ({ WeeklyCallCard: () => <div data-component="WeeklyCallCard">WeeklyCallCard</div> }));
vi.mock("@/components/dashboard/ZielplanungCard", () => ({ ZielplanungCard: () => <div data-component="ZielplanungCard">ZielplanungCard</div> }));
vi.mock("@/components/dashboard/WettbewerbCard", () => ({ WettbewerbCard: () => <div data-component="WettbewerbCard">WettbewerbCard</div> }));
vi.mock("@/components/dashboard/HelpdeskCard", () => ({ HelpdeskCard: () => <div data-component="HelpdeskCard">HelpdeskCard</div> }));
vi.mock("@/components/dashboard/HausverwaltungKpiCard", () => ({ HausverwaltungKpiCard: () => <div data-component="HausverwaltungKpiCard">HausverwaltungKpiCard</div> }));
vi.mock("@/components/dashboard/SetterLeadOverviewCard", () => ({ SetterLeadOverviewCard: () => <div data-component="SetterLeadOverviewCard">SetterLeadOverviewCard</div> }));
vi.mock("@/components/dashboard/SetterMeineLeadsCard", () => ({ SetterMeineLeadsCard: () => <div data-component="SetterMeineLeadsCard">SetterMeineLeadsCard</div> }));
vi.mock("@/components/dashboard/SetterPipelineCard", () => ({ SetterPipelineCard: () => <div data-component="SetterPipelineCard">SetterPipelineCard</div> }));
vi.mock("@/components/dashboard/TeamUebersichtCard", () => ({ TeamUebersichtCard: () => <div data-component="TeamUebersichtCard">TeamUebersichtCard</div> }));
vi.mock("@/components/dashboard/UeberfaelligeFollowUpsCard", () => ({ UeberfaelligeFollowUpsCard: () => <div data-component="UeberfaelligeFollowUpsCard">UeberfaelligeFollowUpsCard</div> }));
vi.mock("@/components/dashboard/VernachlaessigteLeadsCard", () => ({ VernachlaessigteLeadsCard: () => <div data-component="VernachlaessigteLeadsCard">VernachlaessigteLeadsCard</div> }));
vi.mock("@/components/dashboard/NoShowQuoteCard", () => ({ NoShowQuoteCard: () => <div data-component="NoShowQuoteCard">NoShowQuoteCard</div> }));
vi.mock("@/components/dashboard/BewerberKpiCard", () => ({ BewerberKpiCard: () => <div data-component="BewerberKpiCard">BewerberKpiCard</div> }));

afterEach(cleanup);
beforeEach(() => {
  state.settings = {};
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
});
const mount = () => render(<MemoryRouter><Index /></MemoryRouter>);

describe("Dashboard: vollständiger Bestand je Nutzerrolle", () => {
  it.each(Object.entries(bestand))("behält für %s jede bisherige Karte genau einmal", (role, expected) => {
    state.role = role;
    const { container } = mount();
    const actual = Array.from(container.querySelectorAll("[data-component]")).map((node) => node.getAttribute("data-component"));
    const expectedWithFinance = ["admin", "inhaber", "vertriebsleiter"].includes(role)
      ? [...expected, "FinanzierungsPerformanceBlock"] : expected;
    expect(actual.sort()).toEqual([...expectedWithFinance].sort());
    if (process.env.DASHBOARD_QA_LAYOUT && role === "admin") writeFileSync(process.env.DASHBOARD_QA_LAYOUT, container.innerHTML);
    expect(screen.getByText("„Gemeinsam weiterkommen.“")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Glaubenssatz des Tages/ })).not.toBeInTheDocument();
    expect(screen.getByText("„Gemeinsam weiterkommen.“").closest("a, button")).toBeNull();
  });

  it("stellt den Schnellzugriff vor die Kennzahlen und behält die Landingpage", () => {
    state.role = "vertriebspartner";
    const { container } = mount();
    const names = Array.from(container.querySelectorAll("[data-component]")).map((node) => node.getAttribute("data-component"));
    expect(names.indexOf("QuickActions")).toBeLessThan(names.indexOf("DashboardKopf"));
    expect(names).toContain("MicroseiteCard");
  });

  it.each([["setterin", "SetterLeadOverviewCard"], ["hausverwaltung", "HausverwaltungKpiCard"], ["hr", "BewerberKpiCard"]])("stellt bei %s den eigenen Bereich voran", (role, first) => {
    state.role = role;
    const { container } = mount();
    expect(container.querySelectorAll("[data-component]")[1]).toHaveAttribute("data-component", first);
  });

  it("behält gespeicherte Einklappzustände und öffnet den Bereich über den Sprunglink", () => {
    state.role = "admin";
    state.settings = { setter: true, "finanzierungs-performance": true };
    mount();
    expect(screen.queryByText("SetterLeadOverviewCard")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Setter-Bereich" }));
    expect(screen.getByText("SetterLeadOverviewCard")).toBeVisible();
    expect(screen.queryByText("FinanzierungsPerformanceBlock")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Finanzierungs-Performance" }));
    expect(screen.getByText("FinanzierungsPerformanceBlock")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Setter-Bereich/ }));
    expect(screen.queryByText("SetterLeadOverviewCard")).not.toBeInTheDocument();
  });
});
