import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useUser } from "@/contexts/UserContext";
import {
  cacheGet,
  cacheRefreshTable,
  isTableLoaded,
  hatLadefehler,
} from "@/lib/dataCache";
import { useLiveVersion } from "@/hooks/useLiveData";
import { teamMitgliederIds, type Datensicht } from "@/lib/datenSicht";
import { getUserSetting } from "@/lib/userSettingsCache";
import { excludeStatsKontakte } from "@/lib/statsExclusion";
import { getKontaktTyp, kontaktTypFilterWert } from "@/lib/kontaktTypHelper";
import {
  STATISTIK_TABS,
  getVisibleStatistikTabs,
  getDefaultStatistikTab,
  type StatistikTabId,
} from "@/lib/statistikenTabs";
import { StatistikCustomReports } from "@/components/statistiken/StatistikCustomReports";
import { StatistikAnalysetool } from "@/components/statistiken/StatistikAnalysetool";
import { StatistikKampagnen } from "@/components/statistiken/StatistikKampagnen";
import { StatistikLeadZuweisung } from "@/components/statistiken/StatistikLeadZuweisung";
import { darfKampagneSehen } from "@/lib/kampagnenKennung";
import {
  Chart,
  Metric,
  Records,
  Section,
  euro,
  number,
  percent,
} from "@/components/statistiken/ControllerViews";
import {
  bewerberKennzahlen,
  bewerberPipelineVerteilung,
  istBewerberZeile,
} from "@/lib/bewerberStatistik";
import { verlustGrundLabel, grundAusFreitext } from "@/lib/verlustgruende";
import { computeLeadScore } from "@/lib/leadScore";
import { tarnName } from "@/lib/vorfuehrmodus";
import { TRICHTER_STUFEN, normalizeStufe } from "@/lib/statistikTrichter";
import {
  activityData,
  activePeople,
  financingData,
  incomeOf,
  amount,
  belongs,
  cancelled,
  closingDate,
  conversion,
  DAY,
  groupRows,
  inPeriod,
  lost,
  outcomes,
  pipeline,
  previousPeriod,
  price,
  ratio,
  scopeIds,
  stage,
  timestamp,
  timeSeries,
  unique,
  type Period,
  type Row,
} from "@/lib/statistikController";

const TABLES = [
  "kontakte",
  "investments",
  "profiles",
  "user_roles",
  "user_settings",
  "aktivitaeten",
  "anrufe",
  "bewerbungen",
  "provisionsabrechnungen",
  "finanzierungen",
  "empfehlungen",
  "kunden_bewertungen",
  "aufgaben",
];
const dateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const grid = "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4";

export default function Statistiken() {
  const { user, authUser } = useUser();
  const version = useLiveVersion(TABLES);
  const [params, setParams] = useSearchParams();
  const [detail, setDetail] = useState<{ title: string; rows: Row[] } | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const now = useMemo(() => new Date(), [version]);
  const userId = authUser?.id || "";
  const profiles = cacheGet<Row>("profiles");
  const team = teamMitgliederIds(userId);
  const house = ["inhaber", "admin", "testaccount"].includes(user.role);
  const leader = user.role === "vertriebsleiter";
  const explicit = getUserSetting<string[]>("custom_permissions", []);
  const visible = getVisibleStatistikTabs(user.role, explicit);
  const requested = params.get("tab") as StatistikTabId;
  const tab = visible.includes(requested)
    ? requested
    : getDefaultStatistikTab(user.role, explicit);
  const defaultView = house ? "haus" : leader ? "team" : "eigene";
  const requestedView = params.get("sicht") || defaultView;
  const view: Datensicht =
    house && ["haus", "team", "eigene"].includes(requestedView)
      ? (requestedView as Datensicht)
      : leader && requestedView !== "eigene"
        ? "team"
        : "eigene";
  const person = params.get("person") || "alle";
  const ids = scopeIds(user.role, userId, view, team, person);
  // "team" gibt es seit dem 29.09.2026 nicht mehr; Unbekanntes heißt "alle".
  const typWahl = kontaktTypFilterWert(params.get("typ"));
  const contactType =
    tab === "sales" || tab === "recruiting" || typWahl === "-"
      ? "alle"
      : typWahl;
  const startText =
    params.get("von") ||
    dateInput(new Date(now.getFullYear(), now.getMonth(), 1));
  const endText = params.get("bis") || dateInput(now);
  const p: Period = {
    start: new Date(`${startText}T00:00:00`),
    end: new Date(`${endText}T00:00:00`),
  };
  p.end.setDate(p.end.getDate() + 1);
  const invalid =
    !Number.isFinite(+p.start) ||
    !Number.isFinite(+p.end) ||
    +p.start >= +p.end ||
    (+p.end - +p.start) / DAY > 3660;
  const set = (values: Record<string, string>) =>
    setParams((old) => {
      const next = new URLSearchParams(old);
      Object.entries(values).forEach(([k, v]) =>
        v ? next.set(k, v) : next.delete(k),
      );
      return next;
    });
  const readOnlyScope = useMemo(
    () =>
      unique(excludeStatsKontakte(cacheGet<Row>("kontakte"))).filter(
        (k) => !k.geloescht && belongs(k, ids, profiles, user.role),
      ),
    [version, userId, user.role, view, person],
  );
  const kontakte = readOnlyScope.filter(
    (k) =>
      contactType === "alle" ||
      getKontaktTyp(k as any) === contactType,
  );
  const kontaktIds = new Set(kontakte.map((k) => k.id));
  const investments = unique(cacheGet<Row>("investments")).filter((i) =>
    kontaktIds.has(i.kunde_id),
  );
  const stock = pipeline(kontakte, investments, +now);
  const safePeriod = invalid ? { start: now, end: now } : p;
  const result = outcomes(kontakte, investments, safePeriod);
  const previous = outcomes(kontakte, investments, previousPeriod(safePeriod));
  const acts = activityData(
    cacheGet<Row>("aktivitaeten"),
    kontakte,
    safePeriod,
  );
  const prevActs = activityData(
    cacheGet<Row>("aktivitaeten"),
    kontakte,
    previousPeriod(safePeriod),
  );
  const show = (title: string, rows: Row[]) => setDetail({ title, rows });
  const people = activePeople(acts, profiles);
  const actorGroups = people.rows;
  const tasks = unique(cacheGet<Row>("aufgaben")).filter(
    (a) =>
      kontaktIds.has(a.kontakt_id) && (ids === null || ids.has(a.benutzer_id)),
  );
  const lateTasks = tasks.filter(
    (a) =>
      !a.erledigt_am &&
      a.status !== "erledigt" &&
      timestamp(a.faellig_am) !== null &&
      timestamp(a.faellig_am)! < +now,
  );
  const ratings = unique(cacheGet<Row>("kunden_bewertungen")).filter(
    (r) =>
      kontaktIds.has(r.kunde_id) &&
      inPeriod(r.erstellt_am, safePeriod) &&
      Number.isFinite(Number(r.bewertung_gesamt)) &&
      r.bewertung_gesamt >= 1 &&
      r.bewertung_gesamt <= 5,
  );
  const referrals = unique(cacheGet<Row>("empfehlungen")).filter(
    (r) => kontaktIds.has(r.kontakt_id) && inPeriod(r.erstellt_am, safePeriod),
  );
  const reactivated = kontakte.filter((k) =>
    inPeriod(k.meta?.reaktiviertAm, safePeriod),
  );
  const sources = groupRows(
    result.newContacts,
    (k) => k.quelle || "Keine Angabe",
  );
  const conversionRows = conversion(
    result.newContacts,
    investments.filter(
      (i) => !closingDate(i) || timestamp(closingDate(i))! < +p.end,
    ),
  );
  const roleNote = [
    "objektpartner",
    "finanzierungspartner",
    "versicherungsexperte",
  ].includes(user.role);
  const requirements =
    tab === "recruiting"
      ? ["bewerbungen"]
      : tab === "sales"
        ? ["kontakte", "investments", "provisionsabrechnungen"]
        : tab === "activity"
          ? ["kontakte", "aktivitaeten", "anrufe", "aufgaben"]
          : tab === "finanzierung"
            ? ["kontakte", "investments", "finanzierungen"]
            : tab === "leadzuweisung"
              ? ["kontakte", "investments", "user_roles"]
            : tab === "overview"
              ? [
                  "kontakte",
                  "investments",
                  "empfehlungen",
                  "kunden_bewertungen",
                ]
              : ["kontakte", "investments"];
  requirements.push("profiles", "user_settings");
  const failures = requirements.filter(hatLadefehler);
  const pending = requirements.filter(
    (t) => !isTableLoaded(t) && !hatLadefehler(t),
  );
  const loaded = failures.length === 0 && pending.length === 0;
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all(requirements.map(cacheRefreshTable));
    } finally {
      setRefreshing(false);
    }
  };
  const quality = [
    {
      label: "Kontakt ohne eindeutige Zuständigkeit",
      rows: kontakte.filter(
        (k) =>
          !k.zustaendig_id &&
          profiles.filter((p) => p.name === k.berater).length !== 1,
      ),
    },
    {
      label: "Kontakt ohne Erstellungsdatum",
      rows: kontakte.filter((k) => timestamp(k.erstellt_am) === null),
    },
    {
      label: "Unbekannte Prozessstufe",
      rows: kontakte.filter(
        (k) =>
          !TRICHTER_STUFEN.includes(normalizeStufe(k.meta?.pipelineStufe)) &&
          !["verloren", "archiviert", "bestandsimport"].includes(stage(k)),
      ),
    },
    {
      label: "Investment ohne Kaufpreis",
      rows: investments.filter((i) => !cancelled(i) && price(i) === 0),
    },
    { label: "Abschluss ohne Datum", rows: result.missingClosingDate },
    {
      label: "Verlust ohne Verlustdatum",
      rows: kontakte.filter(
        (k) => lost(k) && timestamp(k.meta?.verlorenAm) === null,
      ),
    },
    {
      label: "Offener Vorgang ohne Stufeneintritt",
      // Der Stufeneintritt steht am Investment. Die Pruefung liegt deshalb in
      // `pipeline()`, damit hier kein zweiter Rechenweg entsteht.
      rows: stock.ohneStufeneintritt,
    },
    {
      label: "Kontakt ohne Akquisequelle",
      rows: kontakte.filter((k) => !k.quelle),
    },
  ];
  const bills = unique(cacheGet<Row>("provisionsabrechnungen")).filter(
    (b) =>
      !!userId &&
      (user.role === "buchhaltung" || ids === null || ids.has(b.user_id)) &&
      (person === "alle" || b.user_id === person),
  );
  const periodBills = bills.filter((b) => {
    const start = new Date(`${b.monat}-01T00:00:00`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return start < safePeriod.end && end > safePeriod.start;
  });
  const paid = bills.filter(
    (b) => b.status === "ausgezahlt" && inPeriod(b.ausgezahlt_am, safePeriod),
  );
  const sum = (rows: Row[], field: string) =>
    rows.reduce(
      (s, r) => s + (Number.isFinite(Number(r[field])) ? Number(r[field]) : 0),
      0,
    );
  const billGroups = groupRows(
    periodBills,
    (b) =>
      ({
        offen: "Entwurf",
        freigegeben: "Freigegeben",
        ausgezahlt: "Ausgezahlt",
      })[b.status] || "Status ungeklärt",
  );
  const recruiting = unique(cacheGet<Row>("bewerbungen")).filter(
    (b) => istBewerberZeile(b) && inPeriod(b.erstellt_am, safePeriod),
  );
  const recruitingKpis = bewerberKennzahlen(recruiting);
  const financing = financingData(investments, cacheGet<Row>("finanzierungen"));
  const noContactFilters = tab === "recruiting";
  return (
    <DashboardLayout>
      <div className="space-y-6 min-w-0">
        <PageHeader
          title="Statistiken"
          subtitle="Geschäftsentwicklung, Prozessqualität und belegbare Ergebnisse"
        />
        {!visible.length ? (
          <Section title="Keine Statistikfreigabe">
            <p>
              Für deine Rolle sind keine Statistikbereiche freigegeben. Die
              zuständige Administration kann die benötigten Bereiche
              ausdrücklich freigeben.
            </p>
          </Section>
        ) : (
          <>
            <div data-ui="card" className="border rounded-xl p-4 space-y-4 bg-card">
              <div className="flex flex-wrap items-end gap-4">
                {!noContactFilters && (house || leader) && (
                  <label className="text-sm space-y-1">
                    <span className="block">Datenbereich</span>
                    <select
                      aria-label="Datenbereich"
                      className="border rounded-md bg-background p-2"
                      value={view}
                      onChange={(e) =>
                        set({ sicht: e.target.value, person: "alle" })
                      }
                    >
                      <option value="eigene">Meine Zahlen</option>
                      <option value="team">Mein Team</option>
                      {house && <option value="haus">Gesamtes Haus</option>}
                    </select>
                  </label>
                )}
                {!noContactFilters &&
                  (house || leader || user.role === "buchhaltung") && (
                    <label className="text-sm space-y-1">
                      <span className="block">Person</span>
                      <select
                        aria-label="Person"
                        className="border rounded-md bg-background p-2 max-w-full"
                        value={person}
                        onChange={(e) => set({ person: e.target.value })}
                      >
                        <option value="alle">Alle im Datenbereich</option>
                        {profiles
                          .filter(
                            (p) =>
                              user.role === "buchhaltung" ||
                              scopeIds(user.role, userId, view, team) ===
                                null ||
                              scopeIds(user.role, userId, view, team)!.has(
                                p.id,
                              ),
                          )
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {tarnName(p.name || "Ohne Namen", "partner")}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                {!noContactFilters && tab !== "sales" && tab !== "leadzuweisung" && (
                  <label className="text-sm space-y-1">
                    <span className="block">Kontaktzuordnung</span>
                    <select
                      aria-label="Kontaktzuordnung"
                      className="border rounded-md bg-background p-2"
                      value={contactType}
                      onChange={(e) => set({ typ: e.target.value })}
                    >
                      <option value="alle">Alle Kontaktarten</option>
                      <option value="eigen">Eigenkontakte</option>
                      <option value="lead">Leads der Gesellschaft</option>
                    </select>
                  </label>
                )}
                <label className="text-sm space-y-1">
                  <span className="block">Von</span>
                  <Input
                    aria-label="Zeitraum von"
                    type="date"
                    value={startText}
                    onChange={(e) => set({ von: e.target.value })}
                  />
                </label>
                <label className="text-sm space-y-1">
                  <span className="block">Bis einschließlich</span>
                  <Input
                    aria-label="Zeitraum bis einschließlich"
                    type="date"
                    value={endText}
                    onChange={(e) => set({ bis: e.target.value })}
                  />
                </label>
                <Button
                  variant="outline"
                  onClick={() =>
                    set({
                      von: dateInput(
                        new Date(now.getFullYear(), now.getMonth(), 1),
                      ),
                      bis: dateInput(now),
                    })
                  }
                >
                  Dieser Monat
                </Button>
                <Button
                  variant="outline"
                  disabled={refreshing}
                  onClick={refresh}
                >
                  {refreshing ? "Wird aktualisiert…" : "Aktualisieren"}
                </Button>
              </div>
              <p className="text-sm font-medium border-t pt-3">
                {tab === "recruiting"
                  ? "Recruiting · Berechtigter Bewerberbestand"
                  : user.role === "buchhaltung" && tab === "sales"
                    ? "Buchhaltung · Abrechnungsberechtigung"
                    : {
                        eigene: "Meine Zuständigkeit",
                        team: "Mein Team",
                        haus: "Gesamtes Haus",
                      }[view]}{" "}
                · {startText} bis {endText}
              </p>
              <p className="text-xs text-muted-foreground">
                Ereignisse: gewählter Zeitraum. Bestandskarten: aktueller Stand,
                unabhängig vom Anlagedatum. Vergleich: unmittelbar
                davorliegender Zeitraum gleicher Länge. Zuletzt in dieser
                Ansicht aktualisiert: {now.toLocaleString("de-DE")}.
              </p>
              {roleNote && (
                <p className="text-sm text-muted-foreground">
                  Es werden ausschließlich eindeutig zugeordnete Vorgänge
                  ausgewertet. Eine fehlende Fachpartner-Zuordnung wird nicht
                  durch unternehmensweite Zahlen ersetzt.
                </p>
              )}
            </div>
            <Tabs
              value={tab}
              onValueChange={(v) =>
                set({ tab: v, ...(v === "sales" ? { typ: "alle" } : {}) })
              }
            >
              <TabsList className="h-auto flex flex-wrap justify-start gap-1 bg-transparent p-0">
                {STATISTIK_TABS.filter((t) => visible.includes(t.id)).map(
                  (t) => (
                    <TabsTrigger
                      key={t.id}
                      value={t.id}
                      className="border data-[state=active]:border-primary py-2.5"
                    >
                      {t.label}
                    </TabsTrigger>
                  ),
                )}
              </TabsList>
              {invalid ? (
                <p role="alert" className="py-6">
                  Bitte einen gültigen Zeitraum von maximal zehn Jahren wählen.
                </p>
              ) : !loaded ? (
                <Section
                  title={
                    failures.length
                      ? "Daten konnten nicht vollständig geladen werden"
                      : "Daten werden geladen…"
                  }
                >
                  <p role="status">
                    {failures.length
                      ? "Die Kennzahlen bleiben ausgeblendet, damit fehlende Daten nicht als Nullwerte erscheinen. Bitte erneut aktualisieren."
                      : "Die Auswertung erscheint, sobald ihre Daten vollständig geladen sind."}
                  </p>
                </Section>
              ) : (
                <>
                  {visible.includes("overview") && (
                    <TabsContent value="overview" className="space-y-6 mt-6">
                      <div className={grid}>
                        <Metric
                          label="Neue Kontakte"
                          value={number(result.newContacts.length)}
                          note="Angelegt im Zeitraum"
                          current={result.newContacts.length}
                          previous={previous.newContacts.length}
                          onClick={() =>
                            show("Neue Kontakte", result.newContacts)
                          }
                        />
                        <Metric
                          label="Abgeschlossene Investments"
                          value={number(result.deals.length)}
                          note={`${result.customers.size} unterschiedliche Kunden · Abschlussdatum im Zeitraum`}
                          current={result.deals.length}
                          previous={previous.deals.length}
                          onClick={() =>
                            show("Abgeschlossene Investments", result.deals)
                          }
                        />
                        <Metric
                          label="Vermitteltes Kaufpreisvolumen"
                          value={euro(result.volume)}
                          note="Abgeschlossene Investments; kein Unternehmensumsatz"
                          current={result.volume}
                          previous={previous.volume}
                          onClick={() =>
                            show("Grundlage Kaufpreisvolumen", result.deals)
                          }
                        />
                        <Metric
                          label="Offene Verkaufschancen"
                          value={number(stock.open.length)}
                          note="Aktueller Bestand, nicht auf neue Kontakte begrenzt"
                          onClick={() =>
                            show("Offene Verkaufschancen", stock.open)
                          }
                        />
                      </div>
                      <div className={grid}>
                        <Metric
                          label="Stufenfrist überschritten"
                          value={number(stock.stale.length)}
                          note="Aktueller Bestand · nur mit belegtem Stufeneintritt"
                          onClick={() =>
                            show("Stufenfrist überschritten", stock.stale)
                          }
                        />
                        <Metric
                          label="Notartermin in 30 Tagen"
                          value={number(stock.upcoming.length)}
                          note="Offene Vorgänge mit zukünftigem Termin"
                          onClick={() =>
                            show("Notartermine nächste 30 Tage", stock.upcoming)
                          }
                        />
                        <Metric
                          label="Notartermin überfällig"
                          value={number(stock.overdue.length)}
                          note="Offener Vorgang mit vergangenem Termin"
                          onClick={() =>
                            show("Überfällige Notartermine", stock.overdue)
                          }
                        />
                        <Metric
                          label="Notartermin fehlt"
                          value={number(stock.unscheduled.length)}
                          note="Vorgänge in Abschlussvorbereitung ohne Termin"
                          onClick={() =>
                            show("Fehlende Notartermine", stock.unscheduled)
                          }
                        />
                      </div>
                      <Chart
                        title="Abschlüsse im Zeitverlauf"
                        note="Anzahl Investments nach belegtem Abschlussdatum. Zeiträume ohne Abschluss bleiben sichtbar."
                        rows={timeSeries(result.deals, p, closingDate)}
                        temporal
                      />
                      {[
                        "inhaber",
                        "admin",
                        "vertriebsleiter",
                        "vertriebspartner",
                        "testaccount",
                      ].includes(user.role) && (
                        <Section
                          title="Kundenbindung"
                          note="Ereignisse im gewählten Zeitraum, beschränkt auf den gewählten Kontaktbestand. Keine geschätzten Quoten auf unvollständiger Historie."
                        >
                          <div className={grid}>
                            <Metric
                              label="Kundenbewertungen"
                              value={
                                ratings.length
                                  ? `${number(ratings.reduce((s, r) => s + Number(r.bewertung_gesamt), 0) / ratings.length)} / 5`
                                  : "—"
                              }
                              note={`${ratings.length} gültige Bewertungen im Zeitraum`}
                            />
                            <Metric
                              label="Verknüpfte Empfehlungen"
                              value={number(referrals.length)}
                              note="Empfehlungsdatensätze mit eindeutiger Kontaktverknüpfung"
                              onClick={() =>
                                show(
                                  "Verknüpfte Empfehlungen",
                                  referrals.map((r) => ({
                                    ...r,
                                    kunde_id: r.kontakt_id,
                                  })),
                                )
                              }
                            />
                            <Metric
                              label="Reaktivierte Kontakte"
                              value={number(reactivated.length)}
                              note="Dokumentiertes Reaktivierungsdatum im Zeitraum"
                              onClick={() =>
                                show("Reaktivierte Kontakte", reactivated)
                              }
                            />
                          </div>
                        </Section>
                      )}
                      <Section
                        title="Datenqualität"
                        note="Ein Vorgang kann mehrere Lücken haben. Die Zahlen sind nicht addierbar; fehlende Werte werden nicht geschätzt."
                      >
                        <div className="divide-y">
                          {quality.map((q) => (
                            <button
                              key={q.label}
                              onClick={() => show(q.label, q.rows)}
                              className="w-full py-3 text-left flex justify-between gap-4 hover:text-primary focus-visible:outline focus-visible:outline-primary"
                            >
                              <span>{q.label}</span>
                              <span className="font-semibold tabular-nums">
                                {q.rows.length}
                              </span>
                            </button>
                          ))}
                        </div>
                      </Section>
                    </TabsContent>
                  )}
                  {visible.includes("opportunity") && (
                    <TabsContent value="opportunity" className="space-y-6 mt-6">
                      <div className={grid}>
                        <Metric
                          label="Offenes Kaufpreisvolumen"
                          value={euro(stock.volume)}
                          note="Nur offene, zugeordnete Investments; keine Budgets"
                        />
                        <Metric
                          label="Gewichtetes Kaufpreisvolumen"
                          value={euro(stock.weighted)}
                          note="Offene Kaufpreise × hinterlegte Stufenwahrscheinlichkeit; Schätzung, kein Umsatz"
                        />
                        <Metric
                          label="Budget ohne Investment"
                          value={euro(stock.budget)}
                          note="Unverbindliche Kontaktbudgets separat, nicht im Kaufpreisvolumen"
                        />
                        <Metric
                          label="Median bis Abschluss"
                          value={
                            result.medianDays === null
                              ? "—"
                              : `${number(result.medianDays)} Tage`
                          }
                          note={`${result.durationCount} Abschlüsse mit beiden Datumsangaben`}
                        />
                      </div>
                      <Chart
                        title="Kontakte nach aktuellem Status"
                        note={`Alle ${kontakte.length} Kontakte genau einmal, einschließlich Verlust und Archiv. Keine historische Momentaufnahme.`}
                        rows={stock.rows.map((r) => ({
                          label: r.label,
                          count: r.count,
                        }))}
                        onSelect={(label) =>
                          show(
                            label,
                            stock.rows.find((r) => r.label === label)
                              ?.contacts || [],
                          )
                        }
                      />
                      <Chart
                        title="Offenes Kaufpreisvolumen nach Investmentstufe"
                        note="Ein Investment zählt genau einmal. Mehrere Investments eines Kunden bleiben getrennte Geschäftsvorgänge."
                        rows={stock.rows
                          .filter((r) => r.volume > 0)
                          .map((r) => ({ label: r.label, count: r.volume }))}
                        monetary
                      />
                      <Section
                        title="Abschlussquote der neu angelegten Kontakte"
                        note="Kohorte: im gewählten Zeitraum angelegte Kontakte, mit belegtem Abschluss spätestens bis zum Periodenende. Junge Kohorten sind noch nicht ausgereift."
                      >
                        <p className="text-3xl font-semibold tabular-nums">
                          {percent(result.cohortRate)}
                        </p>
                        <p>
                          {result.cohortWon.size} von{" "}
                          {result.newContacts.length} Kontakten. Jeder Kunde
                          zählt einmal, auch bei mehreren Investments.
                        </p>
                      </Section>
                      <Section
                        title="Belegte Prozessübergänge"
                        note="Aktueller Nachweisstand der Kontaktkohorte. Je Übergang: Kontakte mit beiden Nachweisen ÷ Kontakte mit vorherigem Nachweis. Keine aus Bestandszahlen abgeleitete historische Conversion."
                      >
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr>
                                <th className="text-left p-2">Nachweis</th>
                                <th>Erfüllt / Basis</th>
                                <th>Quote</th>
                                <th>Vorheriger Nachweis fehlt</th>
                              </tr>
                            </thead>
                            <tbody>
                              {conversionRows.map((r) => (
                                <tr key={r.label} className="border-t">
                                  <td className="p-2">{r.label}</td>
                                  <td className="text-center tabular-nums">
                                    {r.numerator} / {r.denominator}
                                  </td>
                                  <td className="text-center tabular-nums">
                                    {percent(r.rate)}
                                  </td>
                                  <td className="text-center">
                                    {r.missingPrevious}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Section>
                      {[
                        "inhaber",
                        "admin",
                        "vertriebsleiter",
                        "vertriebspartner",
                        "testaccount",
                      ].includes(user.role) && (
                        <details className="rounded-xl border p-4">
                          <summary className="cursor-pointer font-medium">
                            Lead-Qualität und Einkommensstruktur
                          </summary>
                          <div className="space-y-6 mt-4">
                            <Chart
                              title="Lead-Qualität offener Kontakte"
                              note="Je Kontakt eine ausgefüllte Selbstauskunft. Mehrere unterschiedliche Selbstauskünfte werden als ungeklärt ausgewiesen; fehlende Angaben ergeben keinen Null-Score."
                              rows={groupRows(stock.open, (k) => {
                                const forms = investments
                                  .filter(
                                    (i) => i.kunde_id === k.id && !cancelled(i),
                                  )
                                  .map((i) => i.meta?.saData)
                                  .filter(Boolean);
                                const distinct = [
                                  ...new Map(
                                    forms.map((f) => [JSON.stringify(f), f]),
                                  ).values(),
                                ];
                                if (distinct.length > 1)
                                  return "Mehrere Selbstauskünfte";
                                if (!distinct.length)
                                  return "Ohne Selbstauskunft";
                                const score = computeLeadScore(distinct[0]);
                                return score.hasSA
                                  ? `Klasse ${score.klasse}`
                                  : "Selbstauskunft unvollständig";
                              })}
                            />
                            <Chart
                              title="Monatliche Einkommensstruktur"
                              note="Je Investment die Einkünfte aus dessen eigener Selbstauskunft: Gehalt, Selbstständigkeit, Rente und Vermietung. Gezählt werden Investments, nicht Kontakte, denn Zahlen gehören zum Vorgang. Keine Ableitung aus Anrede oder anderen Merkmalen."
                              rows={groupRows(investments.filter((i) => !cancelled(i)), (i) => {
                                const income = incomeOf(i.meta?.saData || i.meta?.saSnapshot);
                                return income === null
                                  ? "Keine verwertbare Angabe"
                                  : income < 2500
                                    ? "Unter 2.500 €"
                                    : income < 4000
                                      ? "2.500 bis unter 4.000 €"
                                      : income < 6000
                                        ? "4.000 bis unter 6.000 €"
                                        : income < 10000
                                          ? "6.000 bis unter 10.000 €"
                                          : "Ab 10.000 €";
                              })}
                            />
                          </div>
                        </details>
                      )}
                      <Chart
                        title="Verlustgründe"
                        note={`${result.losses.length} Verluste mit Verlustdatum im Zeitraum. Fehlendes Verlustdatum wird in der Datenqualität ausgewiesen.`}
                        rows={groupRows(result.losses, (k) =>
                          verlustGrundLabel(
                            k.meta?.verlorenGrund ||
                              grundAusFreitext("").grundId,
                          ),
                        ).map((r) => ({ label: r.label, count: r.count }))}
                      />
                    </TabsContent>
                  )}
                  {visible.includes("activity") && (
                    <TabsContent value="activity" className="space-y-6 mt-6">
                      <div className={grid}>
                        <Metric
                          label="Protokollierte Aktivitäten"
                          value={number(acts.length)}
                          note="Aktivitätsdatum im Zeitraum; nur gewählter Kontaktbestand"
                          current={acts.length}
                          previous={prevActs.length}
                          onClick={() => show("Aktivitäten", acts)}
                        />
                        <Metric
                          label="Aktive Personen"
                          value={number(people.count)}
                          note={`Eindeutige Benutzer über alle Rollen; ${people.unassigned} Aktivitäten ohne eindeutige Person`}
                        />
                        <Metric
                          label="Aktivitäten pro Kalendertag"
                          value={number(
                            acts.length /
                              Math.max(
                                1,
                                Math.round((+p.end - +p.start) / DAY),
                              ),
                          )}
                          note="Einschließlich Tagen ohne Aktivitäten"
                        />
                        <Metric
                          label="Kontakte mit Aktivität"
                          value={number(
                            new Set(acts.map((a) => a.kunde_id)).size,
                          )}
                          note="Eindeutige Kontakte; keine Mehrfachzählung"
                        />
                      </div>
                      <Chart
                        title="Aktivitäten im Zeitverlauf"
                        note="Anrufe, E-Mails, Termine, Notizen und Aufgaben nach Protokolldatum. Ein Protokoll ist kein eigenständiger Geschäftserfolg."
                        rows={timeSeries(acts, p, (a) => a.datum)}
                        temporal
                      />
                      <Chart
                        title="Aktivitäten nach Art"
                        note="Protokolle und tatsächliche Anrufe bleiben unterscheidbar."
                        rows={groupRows(
                          acts,
                          (a) =>
                            ({
                              anruf: "Anruf",
                              anruf_protokoll: "Anrufprotokoll",
                              anruf_gestartet: "Anruf gestartet",
                              email: "E-Mail",
                              meeting: "Termin",
                              meeting_protokoll: "Terminprotokoll",
                              notiz: "Notiz",
                              aufgabe: "Aufgabe",
                            })[a.art] ||
                            a.art ||
                            "Keine Angabe",
                        )}
                      />
                      {(house || leader) && (
                        <Chart
                          title="Aktivitäten je Person"
                          note="Alle Personen des gewählten Kontaktbestands. Kein auf zehn Personen begrenzter Gesamtzähler; Beiträge an fremden Kontakten können enthalten sein."
                          rows={actorGroups.map((r) => ({
                            ...r,
                            label: tarnName(r.label, "partner"),
                          }))}
                        />
                      )}
                      <Section
                        title="Nachfassen und Termine"
                        note="Offene Aufgaben sind aktueller Bestand. Ein vergangener Termin gilt ohne Ergebnisnachweis nicht automatisch als wahrgenommen."
                      >
                        <div className={grid}>
                          <Metric
                            label="Überfällige Aufgaben"
                            value={number(lateTasks.length)}
                            note="Mit Kontaktzuordnung, Fälligkeit überschritten und nicht erledigt"
                            onClick={() =>
                              show(
                                "Überfällige Aufgaben",
                                lateTasks.map((a) => ({
                                  ...a,
                                  kunde_id: a.kontakt_id,
                                  name: a.titel,
                                })),
                              )
                            }
                          />
                          <Metric
                            label="Erfasste Termine"
                            value={number(
                              acts.filter((a) => a.art === "meeting").length,
                            )}
                            note="Termindatum im Zeitraum; Protokolle nicht erneut als Termine gezählt"
                          />
                          <Metric
                            label="Wahrnehmungsquote"
                            value="—"
                            note="Ohne vollständige Zuordnung von Terminen zu Teilnahme oder Absage nicht verlässlich berechenbar."
                          />
                        </div>
                      </Section>
                      <Section
                        title="Telefonie"
                        note="Anrufereignisse werden separat gezählt, nicht zu Aktivitätsprotokollen addiert."
                      >
                        {(() => {
                          const calls = unique(cacheGet<Row>("anrufe")).filter(
                            (a) =>
                              kontaktIds.has(a.kontakt_id || a.kunde_id) &&
                              inPeriod(a.angerufen_am, p) &&
                              (ids === null || ids.has(a.benutzer_id)),
                          );
                          const reached = calls.filter(
                            (a) =>
                              a.ergebnis &&
                              !["nicht_erreicht", "mailbox"].includes(
                                a.ergebnis,
                              ),
                          );
                          const appointments = calls.filter(
                            (a) => a.ergebnis === "termin_vereinbart",
                          );
                          return (
                            <div className={grid}>
                              <Metric
                                label="Anrufe"
                                value={number(calls.length)}
                                note="Mit Kontakt- und Benutzerzuordnung"
                                onClick={() =>
                                  show(
                                    "Anrufe",
                                    calls.map((a) => ({
                                      ...a,
                                      kunde_id: a.kontakt_id || a.kunde_id,
                                    })),
                                  )
                                }
                              />
                              <Metric
                                label="Erreichbarkeit"
                                value={percent(
                                  ratio(reached.length, calls.length),
                                )}
                                note={`${reached.length} von ${calls.length} Anrufen`}
                              />
                              <Metric
                                label="Terminquote"
                                value={percent(
                                  ratio(appointments.length, calls.length),
                                )}
                                note={`${appointments.length} von ${calls.length} Anrufen`}
                              />
                              <Metric
                                label="Gesprächsdauer"
                                value={`${number(calls.reduce((s, a) => s + amount(a.dauer_sekunden), 0) / 60)} Min.`}
                                note="Summe protokollierter Gesprächsdauer"
                              />
                            </div>
                          );
                        })()}
                      </Section>
                    </TabsContent>
                  )}
                  {visible.includes("sales") && (
                    <TabsContent value="sales" className="space-y-6 mt-6">
                      <div className={grid}>
                        <Metric
                          label="Kaufpreisvolumen"
                          value={euro(result.volume)}
                          note="Belegte Abschlüsse im Zeitraum; kein Unternehmensumsatz"
                          current={result.volume}
                          previous={previous.volume}
                        />
                        <Metric
                          label="Investments abgeschlossen"
                          value={number(result.deals.length)}
                          note="Nach Abschlussdatum, unabhängig vom Anlagedatum"
                          onClick={() => show("Abschlüsse", result.deals)}
                        />
                        <Metric
                          label="Durchschnittlicher Kaufpreis"
                          value={
                            result.deals.some((i) => price(i) > 0)
                              ? euro(
                                  result.volume /
                                    result.deals.filter((i) => price(i) > 0)
                                      .length,
                                )
                              : "—"
                          }
                          note={`${result.deals.filter((i) => price(i) > 0).length} Investments mit Kaufpreis; ${result.deals.filter((i) => price(i) === 0).length} ohne Preis nicht im Durchschnitt`}
                        />
                        <Metric
                          label="Unternehmensumsatz"
                          value="—"
                          note="Keine verknüpfte Erlösbuchhaltung. Kaufpreise oder Partnerprovisionen ersetzen keinen gebuchten Unternehmensumsatz."
                        />
                      </div>
                      <Chart
                        title="Vermitteltes Kaufpreisvolumen"
                        note="Periodengerechte Zuordnung nach Abschlussdatum."
                        rows={timeSeries(result.deals, p, closingDate, price)}
                        monetary
                        temporal
                      />
                      <Section
                        title="Provisionen und Zahlungsstände"
                        note="Eigener Abrechnungsbezug: Personenauswahl gilt, Kontaktarten gelten nicht für ganze Abrechnungen. Es werden ganze Abrechnungsmonate ausgewertet, die den Zeitraum berühren; Auszahlungen nach Zahlungsdatum."
                      >
                        <div className={grid}>
                          <Metric
                            label="Abrechnungsbetrag netto"
                            value={euro(sum(periodBills, "netto"))}
                            note={`${periodBills.length} Abrechnungen, einschließlich Entwürfen; kein Unternehmensumsatz`}
                          />
                          <Metric
                            label="Freigegeben, noch offen"
                            value={euro(
                              sum(
                                periodBills.filter(
                                  (b) => b.status === "freigegeben",
                                ),
                                "netto",
                              ),
                            )}
                            note="Aktueller Zahlungsstand der ausgewählten Abrechnungsmonate"
                          />
                          <Metric
                            label="Als ausgezahlt markiert"
                            value={euro(sum(paid, "netto"))}
                            note={`${paid.length} Abrechnungen mit Auszahlungsdatum; unabhängig vom Abrechnungsmonat`}
                          />
                          <Metric
                            label="Entwürfe"
                            value={euro(
                              sum(
                                periodBills.filter((b) => b.status === "offen"),
                                "netto",
                              ),
                            )}
                            note="Noch nicht freigegeben; nicht als zahlungsfällig ausgewiesen"
                          />
                        </div>
                        <Link
                          to="/provisionsabrechnung"
                          className="inline-block text-primary underline"
                        >
                          Abrechnungen und Belege prüfen
                        </Link>
                      </Section>
                      <Chart
                        title="Abrechnungsstatus"
                        note="Anzahl Abrechnungen der ausgewählten Monate; Status zum aktuellen Stand."
                        rows={billGroups}
                      />
                      <Chart
                        title="Kaufpreisverteilung abgeschlossener Investments"
                        note="Nur belegte Abschlüsse. Fehlende Kaufpreise bleiben separat sichtbar."
                        rows={groupRows(result.deals, (i) =>
                          !price(i)
                            ? "Kaufpreis fehlt"
                            : price(i) < 200000
                              ? "Unter 200.000 €"
                              : price(i) < 400000
                                ? "200.000 bis unter 400.000 €"
                                : price(i) < 600000
                                  ? "400.000 bis unter 600.000 €"
                                  : "Ab 600.000 €",
                        )}
                      />
                    </TabsContent>
                  )}
                  {visible.includes("conversion") && (
                    <TabsContent value="conversion" className="space-y-6 mt-6">
                      <Chart
                        title="Akquisequellen neuer Kontakte"
                        note="Quelle und Kontaktzuordnung sind unterschiedliche Merkmale. Fehlende Quellen bleiben sichtbar."
                        rows={sources}
                        onSelect={(label) =>
                          show(
                            label,
                            sources.find((s) => s.label === label)?.items || [],
                          )
                        }
                      />
                      {/* Die Kampagnen hinter den Quellen. Nur für die Rollen,
                          die Werbebudget verantworten (`darfKampagneSehen`). */}
                      {darfKampagneSehen(user.role) && (
                        <StatistikKampagnen
                          kontakte={result.newContacts}
                          investments={investments}
                        />
                      )}
                      <Section
                        title="Online-Rechner"
                        note="Abweichender Messbezug: anonyme Ereignisse im separat angegebenen rollierenden Zeitraum. Kontaktarten und der allgemeine Von-bis-Filter gelten hier nicht. Die gewählte Person bzw. das Team gilt weiterhin."
                      >
                        {ids?.size === 0 ? (
                          <p>Keine Person im gewählten Datenbereich.</p>
                        ) : (
                          <>
                            <StatistikAnalysetool
                              beraterIds={ids === null ? null : [...ids]}
                            />
                            <StatistikAnalysetool
                              beraterIds={ids === null ? null : [...ids]}
                              werkzeug="steuerrechner"
                              mitKampagnen={house && ids === null}
                            />
                          </>
                        )}
                      </Section>
                    </TabsContent>
                  )}
                  {visible.includes("custom") && (
                    <TabsContent value="custom" className="space-y-6 mt-6">
                      <Section
                        title="Eigene Berichte"
                        note="Kontaktbestand im gewählten Datenbereich. Die Erstellungsdaten werden hier ausdrücklich über den globalen Zeitraum begrenzt; weitere Filter schränken nur ein."
                      >
                        <StatistikCustomReports kontakte={result.newContacts} />
                      </Section>
                    </TabsContent>
                  )}
                  {visible.includes("recruiting") && (
                    <TabsContent value="recruiting" className="space-y-6 mt-6">
                      <div className={grid}>
                        <Metric
                          label="Bewerber eingegangen"
                          value={number(recruitingKpis.gesamt)}
                          note="Angelegt im Zeitraum; ohne Stellen und Onboarding-Termine"
                        />
                        <Metric
                          label="Im Prozess"
                          value={number(recruitingKpis.imProzess)}
                          note="Aktueller Status der Eingangskohorte"
                        />
                        <Metric
                          label="Aktive Partner"
                          value={number(recruitingKpis.aktiv)}
                          note="Aktueller Status der Eingangskohorte"
                        />
                        <Metric
                          label="Ausgeschieden"
                          value={number(recruitingKpis.ausgeschieden)}
                          note="Abgelehnt oder kein Interesse"
                        />
                      </div>
                      <Chart
                        title="Bewerberprozess"
                        note="Aktueller Status der im Zeitraum eingegangenen Bewerber. Kein historischer Statusverlauf."
                        rows={bewerberPipelineVerteilung(recruiting).map(
                          (r) => ({ label: r.label, count: r.count }),
                        )}
                      />
                      <Chart
                        title="Bewerberquellen"
                        note="Fehlende Quellen als eigene Kategorie."
                        rows={groupRows(
                          recruiting,
                          (b) => b.meta?.quelle || "Keine Angabe",
                        )}
                      />
                      <Section title="Datenqualität Recruiting">
                        <p>
                          {
                            cacheGet<Row>("bewerbungen").filter(
                              (b) =>
                                istBewerberZeile(b) &&
                                timestamp(b.erstellt_am) === null,
                            ).length
                          }{" "}
                          Bewerber ohne Erstellungsdatum sind keinem Zeitraum
                          zuordenbar.
                        </p>
                        <Link
                          to="/bewerberprozess"
                          className="text-primary underline"
                        >
                          Bewerbermanagement öffnen
                        </Link>
                      </Section>
                    </TabsContent>
                  )}
                  {visible.includes("finanzierung") && (
                    <TabsContent
                      value="finanzierung"
                      className="space-y-6 mt-6"
                    >
                      <Section
                        title="Finanzierungsbestand"
                        note="Aktuell zugeordnete Investments, unabhängig vom Anlagedatum. Grundlage sind ausgewählte Bankangebote und deren Dokumente. Ein Notartermin ersetzt keinen unterschriebenen Darlehensvertrag."
                      >
                        <div className={grid}>
                          <Metric
                            label="Finanzierungsvorgänge"
                            value={number(financing.rows.length)}
                            note="Ein Investment zählt einmal"
                            onClick={() =>
                              show("Finanzierungsvorgänge", financing.rows)
                            }
                          />
                          <Metric
                            label="Darlehensvertrag unterschrieben"
                            value={number(financing.confirmed.length)}
                            note="Unterschriebener Vertrag des eindeutig ausgewählten Angebots"
                            onClick={() =>
                              show(
                                "Unterschriebene Darlehensverträge",
                                financing.confirmed,
                              )
                            }
                          />
                          <Metric
                            label="Vertragsabdeckung"
                            value={percent(
                              ratio(
                                financing.confirmed.length,
                                financing.rows.length,
                              ),
                            )}
                            note={`${financing.confirmed.length} von ${financing.rows.length} Vorgängen; keine Bank-Genehmigungsquote`}
                          />
                          <Metric
                            label="Vertragliches Darlehensvolumen"
                            value={euro(financing.volume)}
                            note={`${financing.missingAmount.length} unterschriebene Vorgänge ohne Darlehensbetrag; kein Kaufpreisersatz`}
                          />
                        </div>
                      </Section>
                      <Chart
                        title="Bearbeitungsstand Finanzierung"
                        note="Bankfinal, Angebot gewählt und Vertrag unterschrieben sind getrennte Sachverhalte."
                        rows={groupRows(financing.rows, (i) => i.financeState)}
                        onSelect={(label) =>
                          show(
                            label,
                            financing.rows.filter(
                              (i) => i.financeState === label,
                            ),
                          )
                        }
                      />
                      <div className={grid}>
                        <Metric
                          label="Ø Reservierung bis Angebot"
                          value={
                            financing.rvOffer.length
                              ? `${number(financing.rvOffer.reduce((s, n) => s + n, 0) / financing.rvOffer.length)} Tage`
                              : "—"
                          }
                          note={`${financing.rvOffer.length} Vorgänge mit beiden Ereigniszeitpunkten`}
                        />
                        <Metric
                          label="Ø Angebot bis Vertragsupload"
                          value={
                            financing.offerContract.length
                              ? `${number(financing.offerContract.reduce((s, n) => s + n, 0) / financing.offerContract.length)} Tage`
                              : "—"
                          }
                          note={`${financing.offerContract.length} Vorgänge mit beiden Ereigniszeitpunkten; Upload ist nicht Unterschrift`}
                        />
                      </div>
                    </TabsContent>
                  )}
                  {visible.includes("leadzuweisung") && (
                    <TabsContent value="leadzuweisung" className="mt-6">
                      <StatistikLeadZuweisung ids={ids} period={safePeriod} />
                    </TabsContent>
                  )}
                </>
              )}
            </Tabs>
          </>
        )}
        {detail && (
          <Records
            key={detail.title}
            title={detail.title}
            rows={detail.rows}
            onClose={() => setDetail(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
