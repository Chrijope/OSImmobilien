import { useState, useCallback, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ObjektpartnerDashboard } from "@/components/dashboard/ObjektpartnerDashboard";
import { FinanzierungspartnerDashboard } from "@/components/dashboard/FinanzierungspartnerDashboard";
import { FinanzierungsPerformanceBlock } from "@/components/dashboard/FinanzierungsPerformanceBlock";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { UmsatzChart } from "@/components/dashboard/UmsatzChart";
import { LeadChart } from "@/components/dashboard/LeadChart";
import { ProvisionChart } from "@/components/dashboard/ProvisionChart";
import { KundenCard } from "@/components/dashboard/KundenCard";
import { PotenzialCard } from "@/components/dashboard/PotenzialCard";
import { DashboardKopf } from "@/components/dashboard/DashboardKopf";

import { QuickActions } from "@/components/dashboard/QuickActions";
import { MicroseiteCard } from "@/components/dashboard/MicroseiteCard";

import { GeburtstageCard } from "@/components/dashboard/GeburtstageCard";
import { WeeklyCallCard } from "@/components/dashboard/WeeklyCallCard";
import { ZielplanungCard } from "@/components/dashboard/ZielplanungCard";
import { WettbewerbCard } from "@/components/dashboard/WettbewerbCard";
import { HelpdeskCard } from "@/components/dashboard/HelpdeskCard";
import { HausverwaltungKpiCard } from "@/components/dashboard/HausverwaltungKpiCard";
import { SetterLeadOverviewCard } from "@/components/dashboard/SetterLeadOverviewCard";
import { SetterMeineLeadsCard } from "@/components/dashboard/SetterMeineLeadsCard";
import { SetterPipelineCard } from "@/components/dashboard/SetterPipelineCard";
import { TeamUebersichtCard } from "@/components/dashboard/TeamUebersichtCard";
import { UeberfaelligeFollowUpsCard } from "@/components/dashboard/UeberfaelligeFollowUpsCard";
import { VernachlaessigteLeadsCard } from "@/components/dashboard/VernachlaessigteLeadsCard";
import { NoShowQuoteCard } from "@/components/dashboard/NoShowQuoteCard";
import { BewerberKpiCard } from "@/components/dashboard/BewerberKpiCard";

import { useUser } from "@/contexts/UserContext";
import { Sunrise, Sun, Sunset, ChevronDown, Quote } from "lucide-react";
import { glaubenssatzDesTages } from "@/lib/kulturContent";

// Collapsible sections – per-user, persisted via user_settings
const COLLAPSIBLE_KEYS = new Set(["setter", "hausverwaltung", "finanzierungs-performance"]);
const COLLAPSED_SETTING_KEY = "dashboard_collapsed_sections";

function loadCollapsedSections(): Record<string, boolean> {
  if (isTestAccount()) {
    try {
      const raw = localStorage.getItem(`mi_${COLLAPSED_SETTING_KEY}`);
      if (raw) return JSON.parse(raw) || {};
    } catch { /* noop */ }
    return {};
  }
  return getUserSetting<Record<string, boolean>>(COLLAPSED_SETTING_KEY, {}) || {};
}
function saveCollapsedSections(v: Record<string, boolean>) {
  if (isTestAccount()) {
    try { localStorage.setItem(`mi_${COLLAPSED_SETTING_KEY}`, JSON.stringify(v)); } catch { /* noop */ }
    return;
  }
  setUserSetting(COLLAPSED_SETTING_KEY, v);
}

// ── Tile configuration ──
interface TileConfig {
  id: string;
  label: string;
  colSpan: number; // out of 12
  component: React.ComponentType;
  visibleFor?: string[]; // if set, only these roles see it
  section: string; // thematic grouping
}

// Role groups for tile visibility
// Der Vertriebsleiter ist auf dem Dashboard einem Admin gleichgestellt.
// Wer als Führungskraft gilt, steht in `src/lib/datenSicht.ts` und wird hier
// nicht noch einmal aufgezählt.
const SALES_ROLES = ["inhaber", "admin", "vertriebsleiter", "vertriebspartner", "individuell"];
const ADMIN_OVERSIGHT = ["inhaber", "admin", "vertriebsleiter", "backoffice"]; // Admin-Overview Tiles (ohne HV/Helpdesk)
const ALL_INTERNAL = ["inhaber", "admin", "vertriebsleiter", "vertriebspartner", "buchhaltung", "finanzierungspartner", "objektpartner", "hausverwaltung", "individuell", "setterin", "backoffice", "hr", "marketing", "versicherungsexperte", "testaccount"];

// Section display order + labels
const SECTION_ORDER = [
  { key: "aktionen", label: "Schnellzugriff", icon: "⚡" },
  { key: "performance", label: "Vertriebsperformance", icon: "📊" },
  { key: "ziele", label: "Ziele & Wettbewerb", icon: "🎯" },
  { key: "setter", label: "Setter-Bereich", icon: "📞" },
  { key: "bewerbung", label: "Bewerbermanagement", icon: "🧑‍💼" },
  { key: "team", label: "Team & Support", icon: "👥" },
  { key: "hausverwaltung", label: "Hausverwaltung", icon: "🏢" },
  { key: "landingpage", label: "Meine Landingpage", icon: "🌐" },
];

const ALL_TILES: TileConfig[] = [
  // Die beiden Karten "Überfällige Follow-Ups" und "Vernachlässigte Leads"
  // sind entfallen. Die Kennzahlen oben sagen dasselbe in einer Zeile und
  // führen mit einem Klick in die Inbox, wo sich die Punkte auch erledigen
  // lassen. Zwei Darstellungen derselben Sache laufen sonst wieder
  // auseinander.

  // ── Vertriebsperformance ──
  
  { id: "kunden", label: "Kunden", colSpan: 6, component: KundenCard, visibleFor: [...SALES_ROLES, "backoffice"], section: "performance" },
  { id: "potenzial", label: "Potenzial", colSpan: 6, component: PotenzialCard, visibleFor: [...SALES_ROLES, "backoffice"], section: "performance" },
  { id: "umsatz", label: "Umsatzübersicht", colSpan: 6, component: UmsatzChart, visibleFor: [...SALES_ROLES, "backoffice"], section: "performance" },
  { id: "provision", label: "Eigenprovision", colSpan: 6, component: ProvisionChart, visibleFor: [...SALES_ROLES, "buchhaltung", "backoffice"], section: "performance" },
  { id: "leads", label: "Kontakte", colSpan: 6, component: LeadChart, visibleFor: [...SALES_ROLES, "backoffice"], section: "performance" },
  { id: "noshow-quote-admin", label: "No-Show-Quote", colSpan: 6, component: NoShowQuoteCard, visibleFor: ADMIN_OVERSIGHT, section: "performance" },
  /*
   * Die beiden Karten der Führung.
   *
   * Es gab sie bisher nur im Setter-Bereich, sichtbar allein für die
   * Setterinnen. Ein Vertriebsleiter bekam sie nie zu Gesicht, obwohl gerade er
   * wissen muss, was in seinem Team liegen bleibt. Die Follow-Up-Karte bringt
   * eine fertige Team- und Firmensicht mit, die dadurch nie aufgerufen wurde.
   */
  // ── Setter ──
  { id: "setter-leads", label: "Setter – Lead-Übersicht", colSpan: 12, component: SetterLeadOverviewCard, visibleFor: ADMIN_OVERSIGHT, section: "setter" },
  { id: "setter-kpis", label: "Setter-Lead-Übersicht", colSpan: 12, component: SetterLeadOverviewCard, visibleFor: ["setterin"], section: "setter" },
  { id: "setter-meine-leads", label: "Meine Leads", colSpan: 12, component: SetterMeineLeadsCard, visibleFor: ["setterin"], section: "setter" },
  { id: "setter-vernachlaessigte-leads", label: "Vernachlässigte Leads (SLA)", colSpan: 12, component: VernachlaessigteLeadsCard, visibleFor: ["setterin"], section: "setter" },
  { id: "noshow-quote-setter", label: "No-Show-Quote", colSpan: 6, component: NoShowQuoteCard, visibleFor: ["setterin"], section: "setter" },
  { id: "setter-followups-overdue", label: "Überfällige Follow-Ups", colSpan: 6, component: UeberfaelligeFollowUpsCard, visibleFor: ["setterin"], section: "setter" },
  { id: "setter-pipeline", label: "Pipeline", colSpan: 12, component: SetterPipelineCard, visibleFor: ["setterin"], section: "setter" },
  { id: "zielplanung", label: "Zielplanung", colSpan: 4, component: ZielplanungCard, visibleFor: SALES_ROLES, section: "ziele" },
  { id: "wettbewerb", label: "Wettbewerb", colSpan: 4, component: WettbewerbCard, visibleFor: SALES_ROLES, section: "ziele" },
  // ── Hausverwaltung ──
  { id: "hausverwaltung", label: "Hausverwaltung", colSpan: 12, component: HausverwaltungKpiCard, visibleFor: ["hausverwaltung"], section: "hausverwaltung" },
  // Ohne Vertriebsleitung: Mieter, Vermietungen und Tickets liest seit
  // 20261004130000 nur die Hausverwaltung mit Admin und Inhaber, die Karte
  // zeigte ihr sonst lauter Nullen.
  { id: "hausverwaltung-admin", label: "Hausverwaltung", colSpan: 12, component: HausverwaltungKpiCard, visibleFor: ["inhaber", "admin"], section: "hausverwaltung" },
  // ── Bewerbermanagement (Admin/Inhaber/HR) ──
  { id: "bewerber-kpis", label: "Bewerbermanagement – KPIs", colSpan: 12, component: BewerberKpiCard, visibleFor: ["inhaber", "admin", "hr"], section: "bewerbung" },
  { id: "team-uebersicht", label: "Team-Übersicht", colSpan: 12, component: TeamUebersichtCard, visibleFor: ["inhaber", "admin", "vertriebsleiter", "vertriebspartner"], section: "team" },
  // ── Team & Support ──
  { id: "geburtstage", label: "Geburtstage", colSpan: 4, component: GeburtstageCard, visibleFor: ALL_INTERNAL, section: "team" },
  { id: "helpdesk", label: "Helpdesk", colSpan: 4, component: HelpdeskCard, visibleFor: ["inhaber", "admin", "vertriebsleiter", "backoffice"], section: "team" },
  { id: "weekly-call", label: "Weekly Sales Call", colSpan: 4, component: WeeklyCallCard, visibleFor: ["inhaber", "admin", "vertriebsleiter", "vertriebspartner"], section: "team" },

  // ── Kommunikation & Updates ──
  // Systemupdates entfernt: Die Karte zeigte nur News der letzten sieben Tage
  // und stand danach dauerhaft leer. Sie wird niemandem mehr angezeigt.

  // ── Schnellzugriff (nur Vertrieb & Admins; wird oben gerendert) ──
  { id: "quickactions-bottom", label: "Schnellzugriff", colSpan: 12, component: QuickActions, visibleFor: ["inhaber", "admin", "vertriebsleiter", "vertriebspartner"], section: "aktionen" },

  // ── Landingpage ganz unten ──
  // Sie ist ein Werkzeug, keine Kennzahl. Über volle Breite ganz oben hat sie
  // alles Wichtige unter den Bildschirmrand gedrückt.
  { id: "microseite", label: "Meine Landingpage", colSpan: 12, component: MicroseiteCard, visibleFor: ["inhaber", "admin", "vertriebsleiter", "vertriebspartner"], section: "landingpage" },
];

// Die gespeicherte Kachelreihenfolge ist entfallen, zusammen mit dem
// Anordnen per Ziehen. Die Reihenfolge ergibt sich aus ALL_TILES.

// ── Kachel-Rahmen ──
// Das Anordnen per Ziehen ist entfallen. Die Reihenfolge steht fest, damit
// alle dasselbe Dashboard sehen.
function Tile({ tile }: { tile: TileConfig }) {
  const Comp = tile.component;

  const colClass =
    tile.colSpan === 12
      ? "lg:col-span-12"
      : tile.colSpan === 6
      ? "lg:col-span-6"
      : tile.colSpan === 5
      ? "lg:col-span-5"
      : tile.colSpan === 3
      ? "lg:col-span-3"
      : "lg:col-span-4";

  return (
    <div data-dashboard-tile={tile.id} className={`${colClass} min-w-0 relative overflow-visible`}>
      <Comp />
    </div>
  );
}

const Index = () => {
  const { user } = useUser();
  const isAdmin = user.role === "admin" || user.role === "inhaber" || user.role === "vertriebsleiter";

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => loadCollapsedSections());

  const toggleCollapsed = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveCollapsedSections(next);
      return next;
    });
  }, []);

  // Sichtbare Kacheln in der festgelegten Reihenfolge.
  const visibleTiles = useMemo(
    () => ALL_TILES.filter((t) => !t.visibleFor || t.visibleFor.includes(user.role)),
    [user.role],
  );

  // Group visible tiles by section, preserving order
  const groupedSections = useMemo(() => {
    const groups: { key: string; label: string; icon: string; tiles: TileConfig[] }[] = [];
    const seen = new Set<string>();

    for (const tile of visibleTiles) {
      if (!seen.has(tile.section)) {
        seen.add(tile.section);
        const sectionMeta = SECTION_ORDER.find((s) => s.key === tile.section);
        if (sectionMeta) {
          groups.push({ ...sectionMeta, tiles: [] });
        }
      }
      const group = groups.find((g) => g.key === tile.section);
      if (group) group.tiles.push(tile);
      // Eine Kachel mit unbekanntem Abschnitt verschwand vorher stillschweigend.
      else if (!SECTION_ORDER.some((sm) => sm.key === tile.section)) {
        console.warn(`Dashboard: Kachel "${tile.id}" hat den unbekannten Abschnitt "${tile.section}".`);
      }
    }

    // Die Reihenfolge folgt SECTION_ORDER, nicht dem Zufall des ersten
    // Auftretens im Kachel-Array. Vorher stand Hausverwaltung vor
    // Bewerbermanagement, obwohl die Liste es andersherum vorsah.
    const rang = (key: string) => {
      const i = SECTION_ORDER.findIndex((sm) => sm.key === key);
      return i === -1 ? 999 : i;
    };
    // Der eigene Arbeitsbereich steht zuerst; die sichtbaren Karten bleiben identisch.
    const arbeitsbereich = user.role === "setterin" ? "setter"
      : user.role === "hausverwaltung" ? "hausverwaltung"
      : user.role === "hr" ? "bewerbung" : undefined;
    return groups.sort((a, b) =>
      (a.key === arbeitsbereich ? -1 : rang(a.key)) -
      (b.key === arbeitsbereich ? -1 : rang(b.key)),
    );
  }, [visibleTiles, user.role]);

  const now = new Date();
  const hour = now.getHours();
  // „Erster Login des Tages" pro Nutzer erkennen: einmal pro Kalendertag
  // zeigen wir die Tageszeit-Begrüßung, ab dem zweiten Aufruf „Willkommen zurück".
  const todayKey = now.toISOString().slice(0, 10);
  const firstName = user.name.split(" ")[0];
  const greetSeenKey = `mi_dashboard_greet_seen_${user.moreId || firstName}`;
  const alreadySeenToday = (() => {
    try { return localStorage.getItem(greetSeenKey) === todayKey; } catch { return false; }
  })();
  useEffect(() => {
    try { localStorage.setItem(greetSeenKey, todayKey); } catch { /* ignore */ }
  }, [greetSeenKey, todayKey]);
  const greetingMeta = (() => {
    if (hour < 11) return {
      text: "Guten Morgen",
      Icon: Sunrise,
      accent: "text-amber-600 dark:text-amber-300",
    };
    if (hour < 17) return {
      text: "Guten Tag",
      Icon: Sun,
      accent: "text-orange-600 dark:text-orange-300",
    };
    return {
      text: "Guten Abend",
      Icon: Sunset,
      accent: "text-violet-600 dark:text-violet-300",
    };
  })();
  const greeting = alreadySeenToday ? "Willkommen zurück" : greetingMeta.text;
  const tagesform = now.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const uhrzeit = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const { Icon: GreetIcon } = greetingMeta;
  const tagesGlaubenssatz = glaubenssatzDesTages(now);

  const GreetingHero = ({ subtitle }: { subtitle?: string }) => (
    <header className="relative mb-6 overflow-hidden rounded-3xl border border-primary/10 bg-gradient-to-br from-accent via-card to-secondary/50 p-5 shadow-sm md:p-7">
      <div className="pointer-events-none absolute -right-12 -top-20 h-60 w-60 rounded-full bg-primary/5 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium text-primary">Dein Platz bei OS Immobilien</p>
          <h1 className="text-[28px] md:text-[36px] font-semibold tracking-tight leading-tight">
            {greeting}, {firstName}.
          </h1>
          {subtitle && <p className="mt-2 max-w-2xl text-sm md:text-base leading-relaxed text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-primary/10 bg-card/60 px-3 py-2 text-xs text-muted-foreground tabular-nums">
          <GreetIcon className={`h-4 w-4 shrink-0 ${greetingMeta.accent}`} aria-hidden="true" />
          <span>{tagesform} · {uhrzeit} Uhr</span>
        </div>
      </div>
      <div className="relative mt-5 flex items-start gap-3 rounded-2xl border border-primary/10 bg-card/70 p-4 md:px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10" aria-hidden="true">
          <Quote className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <blockquote className="text-sm md:text-base font-medium leading-relaxed">„{tagesGlaubenssatz}“</blockquote>
          <p className="mt-1.5 text-xs text-muted-foreground">Glaubenssatz des Tages · Unsere Kultur</p>
        </div>
      </div>
    </header>
  );

  const renderSection = (section: typeof groupedSections[number]) => {
    const isCollapsible = COLLAPSIBLE_KEYS.has(section.key);
    const isOpen = !collapsed[section.key];
    const titleId = `dashboard-${section.key}-title`;
    return (
      <section key={section.key} id={`dashboard-${section.key}`} aria-labelledby={titleId} className="scroll-mt-24 min-w-0">
        {isCollapsible ? (
          <h2 id={titleId} className="mb-4">
            <button type="button" onClick={() => toggleCollapsed(section.key)} aria-expanded={isOpen}
              aria-controls={`dashboard-${section.key}-content`}
              className="flex w-full items-center gap-3 rounded-lg py-1 text-left text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {section.label}
              <span className="ml-auto text-xs font-normal text-muted-foreground">{isOpen ? "Einklappen" : "Anzeigen"}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`} aria-hidden="true" />
            </button>
          </h2>
        ) : <h2 id={titleId} className="mb-4 text-lg font-semibold tracking-tight">{section.label}</h2>}
        {(!isCollapsible || isOpen) && (
          <div id={`dashboard-${section.key}-content`} className="grid grid-cols-1 lg:grid-cols-12 gap-5 overflow-visible">
            {section.tiles.map((tile) => <Tile key={tile.id} tile={tile} />)}
          </div>
        )}
      </section>
    );
  };

  if (user.role === "objektpartner") {
    return (
      <DashboardLayout>
        <GreetingHero subtitle="Hier ist dein Objekt-Überblick." />
        <div className="mt-6">
          <ObjektpartnerDashboard />
        </div>
      </DashboardLayout>
    );
  }

  if (user.role === "finanzierungspartner") {
    return (
      <DashboardLayout>
        <GreetingHero subtitle="Dein Finanzierungs-Überblick auf einen Blick." />
        <div className="mt-6">
          <FinanzierungspartnerDashboard />
        </div>
      </DashboardLayout>
    );
  }

  const weitereBereiche = groupedSections.filter((section) => section.key !== "aktionen");
  const schnellzugriff = groupedSections.find((section) => section.key === "aktionen");

  return (
    <DashboardLayout>
      <GreetingHero subtitle="Schön, dass du da bist. Hier findest du alles für deinen nächsten Schritt." />

      {schnellzugriff && <div className="mb-6">{renderSection(schnellzugriff)}</div>}
      <DashboardKopf />

      {weitereBereiche.length > 1 && (
        <nav aria-label="Dashboard-Bereiche" className="my-8 rounded-xl border bg-card p-4">
          <p className="mb-3 text-xs font-medium text-muted-foreground">Direkt zu deinem Bereich</p>
          <div className="flex flex-wrap gap-2">
            {weitereBereiche.map((section) => (
              <a key={section.key} href={`#dashboard-${section.key}`}
                onClick={() => { if (collapsed[section.key]) toggleCollapsed(section.key); }}
                className="rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {section.label}
              </a>
            ))}
            {isAdmin && <a href="#dashboard-finanzierungs-performance"
              onClick={() => { if (collapsed["finanzierungs-performance"]) toggleCollapsed("finanzierungs-performance"); }}
              className="rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Finanzierungs-Performance</a>}
          </div>
        </nav>
      )}

      <div className="mt-8 space-y-10">
        {weitereBereiche.map((section) => (
          <div key={section.key} className="space-y-10">
            {renderSection(section)}
            {isAdmin && section.key === "setter" && (
              <section id="dashboard-finanzierungs-performance" aria-labelledby="dashboard-finanzierung-title" className="scroll-mt-24">
                <h2 id="dashboard-finanzierung-title" className="mb-4">
                  <button type="button" onClick={() => toggleCollapsed("finanzierungs-performance")}
                    aria-expanded={!collapsed["finanzierungs-performance"]} aria-controls="dashboard-finanzierung-content"
                    className="flex w-full items-center gap-3 rounded-lg py-1 text-left text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Finanzierungs-Performance
                    <span className="ml-auto text-xs font-normal text-muted-foreground">{collapsed["finanzierungs-performance"] ? "Anzeigen" : "Einklappen"}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${collapsed["finanzierungs-performance"] ? "-rotate-90" : ""}`} aria-hidden="true" />
                  </button>
                </h2>
                {!collapsed["finanzierungs-performance"] && <div id="dashboard-finanzierung-content"><FinanzierungsPerformanceBlock compact /></div>}
              </section>
            )}
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
};

export default Index;
