import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Calculator, Building2, ExternalLink, ArrowRight, User as UserIcon, TrendingUp, Wallet, Banknote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Kennzahl } from "@/components/ui/kennzahl";
import { einlage } from "@/components/kunde/portal/einlage";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import { SteuerCockpitCard } from "@/components/kunde/SteuerCockpitCard";
import { MarktwertCard } from "@/components/kunde/eigene/MarktwertCard";
import { EigeneSteuerJahresListe } from "@/components/kunde/eigene/EigeneSteuerJahresListe";
import { adaptMoreImmoInvestment } from "@/lib/kundePortalInvestment";
import { moreImmoPosition, eigenePosition, berechnePortfolioKennzahlen } from "@/lib/portalPortfolio";
import { PortalHero } from "@/components/kunde/portal/PortalHero";
import { useTranslation } from "react-i18next";
import { portalSprache } from "@/i18n/portalSprache";
import { euroText, prozentText } from "@/lib/sprachFormat";

export default function KundeSteuerCockpit() {
  const { t } = useTranslation();
  const { authUser } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [kontakt, setKontakt] = useState<any>(null);
  const [investments, setInvestments] = useState<any[]>([]);
  const [finanzierungen, setFinanzierungen] = useState<any[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = async () => {
    if (!authUser) return;
    try {
      const { data: kontakte } = await supabase
        .from("kontakte")
        .select("*")
        .or(`meta->>authUserId.eq.${authUser.id},meta->person2->>authUserId.eq.${authUser.id}`)
        .limit(1);
      const k = kontakte?.[0];
      if (!k) return;
      setKontakt(k);
      const { data: invs } = await supabase
        .from("investments")
        .select("*")
        .eq("kunde_id", k.id)
        .order("erstellt_am", { ascending: true });
      setInvestments(invs || []);
      const invIds = (invs || []).map((i: any) => i.id);
      if (invIds.length > 0) {
        const { data: fins } = await supabase
          .from("finanzierungen")
          .select("*")
          .in("kunde_id", invIds);
        setFinanzierungen(fins || []);
      } else {
        setFinanzierungen([]);
      }
    } catch (e) {
      console.error("Fehler:", e);
    }
  };

  useEffect(() => {
    if (!authUser) return;
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [authUser]);

  useEffect(() => { if (refreshKey > 0) reload(); }, [refreshKey]);

  // Realtime: investments + finanzierungen + kontakte + externe_investments
  useEffect(() => {
    if (!authUser || !kontakt?.id) return;
    const kid = kontakt.id;
    const invCh = supabase
      .channel(`steuer-inv-${kid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "investments", filter: `kunde_id=eq.${kid}` }, () => reload())
      .subscribe();
    const finCh = supabase
      .channel(`steuer-fin-${kid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "finanzierungen" }, () => reload())
      .subscribe();
    const kontaktCh = supabase
      .channel(`steuer-kontakt-${kid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kontakte", filter: `id=eq.${kid}` }, () => reload())
      .subscribe();
    const extCh = supabase
      .channel(`steuer-ext-${authUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "externe_investments" }, () => {
        supabase.from("externe_investments").select("*").then(({ data }) => {
          const filtered = (data || []).filter((i: any) => (i.meta?.quelle || "extern") !== "moreimmo");
          setExterneInvestments(filtered);
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(invCh);
      supabase.removeChannel(finCh);
      supabase.removeChannel(kontaktCh);
      supabase.removeChannel(extCh);
    };
  }, [authUser?.id, kontakt?.id]);

  // ?inv=ID übernimmt aktive Auswahl
  useEffect(() => {
    const invId = searchParams.get("inv");
    if (invId && investments.length > 0) {
      const idx = investments.findIndex((i) => i.id === invId);
      if (idx >= 0) setActiveIdx(idx);
    }
  }, [searchParams, investments]);

  const activeInv = investments[activeIdx];
  const invMeta = (activeInv?.meta as any) || {};
  const kontaktMeta = (kontakt?.meta as any) || {};
  const finanzierung = useMemo(
    () => finanzierungen.find((f) => f.kunde_id === activeInv?.id),
    [finanzierungen, activeInv]
  );
  const adapted = useMemo(
    () => activeInv ? adaptMoreImmoInvestment(activeInv, invMeta, finanzierung) : null,
    [activeInv, invMeta, finanzierung]
  );

  const persistMeta = async (patch: any) => {
    if (!activeInv) return;
    // Nur die tatsaechlich geaenderten Felder schreiben. Vorher ging die
    // komplette meta-Spalte aus dem Schnappschuss `invMeta` zurueck in die
    // Datenbank. Wurde in der offenen Sitzung woanders etwas geaendert
    // (Unterschrift, Dokumentenfreigabe), hat dieser alte Stand es still
    // ueberschrieben. Die RPC merged serverseitig feldweise.
    const { error } = await supabase.rpc("merge_investment_meta", {
      _investment_id: activeInv.id,
      _updates: patch,
    });
    if (error) { toast.error(t("portal.steuer.save_failed")); return; }
    setRefreshKey((k) => k + 1);
  };

  const tabParam = searchParams.get("tab");
  const invParam = searchParams.get("inv");
  const tabFromUrl: "moreimmo" | "eigene" | null =
    tabParam === "eigene" ? "eigene" : tabParam === "moreimmo" || invParam ? "moreimmo" : null;
  const handleTabChange = (val: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (val === "moreimmo" || val === "eigene") next.set("tab", val);
    else next.delete("tab");
    if (val === null) next.delete("inv");
    setSearchParams(next, { replace: true });
  };
  // Eigene (externe) Investments vollstaendig laden, damit die Uebersicht
  // dieselben Kennzahlen wie die Investments-Seite zeigt (MOREImmo + eigene).
  const [externeInvestments, setExterneInvestments] = useState<any[]>([]);
  useEffect(() => {
    if (!authUser) return;
    supabase.from("externe_investments").select("*").then(({ data }) => {
      const filtered = (data || []).filter((i: any) => (i.meta?.quelle || "extern") !== "moreimmo");
      setExterneInvestments(filtered);
    });
  }, [authUser]);
  const externeCount = externeInvestments.length;

  const fmtCur = (v: number) => euroText(v, portalSprache(), 0);

  if (loading) {
    // Skeleton in Seitenstruktur statt zentriertem Spinner
    return (
      <DashboardLayout>
        <div className="space-y-6 p-4 md:p-6">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <div className="portal-card p-5 space-y-4">
            <Skeleton className="h-5 w-48" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Skeleton className="h-36 rounded-2xl" />
            <Skeleton className="h-36 rounded-2xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── Dashboard-Übersicht ───
  if (tabFromUrl === null) {
    // Gleiche Basis wie die Investments-Uebersicht: MOREImmo + eigene
    // Investments. Rendite nur ueber Positionen mit belegter Miete.
    const positionen = [
      ...investments.map((inv) =>
        moreImmoPosition(inv, finanzierungen.find((f) => f.kunde_id === inv.id) || null),
      ),
      ...externeInvestments.map((inv) => eigenePosition(inv)),
    ];
    const kz = berechnePortfolioKennzahlen(positionen);
    const cards = [
      {
        label: t("portal.steuer.kpi_investments"), value: kz.anzahl.toString(),
        sub: t("portal.steuer.kpi_split", { more: kz.anzahlMoreImmo, eigene: kz.anzahlEigene }),
        icon: Building2, color: "text-primary", bg: "bg-primary/10",
      },
      { label: t("portal.steuer.kpi_value"), value: fmtCur(kz.kaufpreisGesamt), sub: undefined as string | undefined, icon: Wallet, color: "text-foreground", bg: "bg-muted" },
      {
        label: t("portal.steuer.kpi_rent"), value: fmtCur(kz.mieteGesamt),
        sub: kz.mieteAnzahl < kz.anzahl ? t("portal.steuer.kpi_yield_basis", { n: kz.mieteAnzahl, m: kz.anzahl }) : undefined,
        icon: Banknote, color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10",
      },
      {
        label: t("portal.steuer.kpi_yield"),
        value: kz.rendite != null ? prozentText(kz.rendite, portalSprache(), 2) : "—",
        sub: kz.rendite != null
          ? t("portal.steuer.kpi_yield_basis", { n: kz.mieteAnzahl, m: kz.anzahl })
          : t("portal.steuer.kpi_yield_none"),
        icon: TrendingUp, color: "text-primary", bg: "bg-primary/10",
      },
    ];
    return (
      <DashboardLayout>
        <div className="space-y-6 p-4 md:p-6">
          <PortalHero
            eyebrow={t("portal.steuer.hero_eyebrow")}
            title={t("portal.steuer.hero_title_overview")}
            subtitle={t("portal.steuer.hero_subtitle_overview")}
          />

          <div className="portal-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-6 bg-primary rounded" />
              <h2 className="font-bold text-base">{t("portal.steuer.portfolio_title")}</h2>
              <span className="text-xs text-muted-foreground ml-auto">{t("portal.steuer.portfolio_sub")}</span>
            </div>
            {/* Einspaltig am Handy: Die Zahl der Kennzahl ist gross und passte
                zu zweit nebeneinander nicht in die Kachel. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {cards.map((c) => (
                <div key={c.label} {...einlage("p-4")}>
                  <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center mb-3`}>
                    <c.icon className={`h-4 w-4 ${c.color}`} />
                  </div>
                  <Kennzahl label={c.label} wert={c.value} zusatz={c.sub} />
                </div>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <button
              onClick={() => handleTabChange("moreimmo")}
              disabled={investments.length === 0}
              className="text-left rounded-2xl border border-border/60 bg-card bg-gradient-to-br from-primary/5 via-card to-card hover:border-primary/40 hover:shadow-lg transition-all p-6 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-bold text-lg">{t("portal.steuer.card_moreimmo_title")}</h3>
                    <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("portal.steuer.card_moreimmo_desc")}
                  </p>
                  <div className="mt-3"><Badge variant="secondary" className="text-xs">{t(investments.length === 1 ? "portal.steuer.object_count_one" : "portal.steuer.object_count_other", { count: investments.length })}</Badge></div>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleTabChange("eigene")}
              className="text-left rounded-2xl border border-border/60 bg-card bg-gradient-to-br from-[hsl(var(--success))]/5 via-card to-card hover:border-[hsl(var(--success))]/40 hover:shadow-lg transition-all p-6 group block w-full"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-[hsl(var(--success))]/10 flex items-center justify-center shrink-0">
                  <UserIcon className="h-6 w-6 text-[hsl(var(--success))]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-bold text-lg">{t("portal.steuer.card_eigene_title")}</h3>
                    <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-[hsl(var(--success))] group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("portal.steuer.card_eigene_desc")}
                  </p>
                  <div className="mt-3"><Badge variant="secondary" className="text-xs">{t(externeCount === 1 ? "portal.steuer.object_count_one" : "portal.steuer.object_count_other", { count: externeCount })}</Badge></div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── Eigene Investments: echter Abschnitt statt reinem Link ───
  // Liste mit Kurz-Ergebnis des gewaehlten Steuerjahres, Anlage-V-PDF und
  // Link ins Detail (Stufe 3 der Kundenportal-Sanierung).
  if (tabFromUrl === "eigene") {
    return (
      <DashboardLayout>
        <div className="p-4 md:p-6 space-y-6">
          <button
            onClick={() => handleTabChange(null)}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowRight className="h-3.5 w-3.5 rotate-180" /> {t("portal.steuer.to_overview")}
          </button>
          <PortalHero
            eyebrow={t("portal.steuer.hero_eyebrow")}
            title={t("portal.steuer.eigene_hero_title", "Eigene Investments")}
            subtitle={t("portal.steuer.eigene_hero_subtitle", "Steuerliches Ergebnis deiner selbst gehaltenen Immobilien je Steuerjahr, mit Anlage-V-Aufstellung als PDF.")}
          />
          <EigeneSteuerJahresListe />
        </div>
      </DashboardLayout>
    );
  }

  if (!investments.length) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto p-6">
          <PortalHero
            eyebrow={t("portal.steuer.hero_eyebrow")}
            title={t("portal.steuer.empty_title")}
            subtitle={t("portal.steuer.empty_sub")}
            actions={
              <Button asChild variant="outline">
                <Link to="/kunde/investments"><Building2 className="h-4 w-4 mr-2" /> {t("portal.steuer.to_investments")}</Link>
              </Button>
            }
          />
        </div>
      </DashboardLayout>
    );
  }

  // Nur die Selbstauskunft dieses Investments. Der Steuersatz gehoert zu dem
  // Kauf, um den es geht, nicht zum Kunden im Allgemeinen (Regel in saQuelle.ts).
  const saData = invMeta?.saData || invMeta?.saSnapshot;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        <button
          onClick={() => handleTabChange(null)}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowRight className="h-3.5 w-3.5 rotate-180" /> {t("portal.steuer.to_overview")}
        </button>
        <PortalHero
          eyebrow={t("portal.steuer.hero_eyebrow")}
          title={t("portal.steuer.hero_title_detail")}
          subtitle={t("portal.steuer.hero_subtitle_detail")}
          actions={activeInv && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/kunde/investments?tab=moreimmo&inv=${activeInv.id}`}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> {t("portal.steuer.to_investment")}
              </Link>
            </Button>
          )}
        />

        {investments.length > 1 && (
          <Tabs value={String(activeIdx)} onValueChange={(v) => {
            const idx = Number(v);
            setActiveIdx(idx);
            const next = new URLSearchParams(searchParams);
            next.set("inv", investments[idx].id);
            setSearchParams(next, { replace: true });
          }}>
            <TabsList className="flex-wrap h-auto">
              {investments.map((inv, i) => (
                <TabsTrigger key={inv.id} value={String(i)} className="text-xs">
                  {inv.objekt || inv.wohnung || t("portal.steuer.investment_fallback", { n: i + 1 })}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {/* ─── Steuer-Cockpit, Wertentwicklung & Marktwert (gebündelt) ─── */}
        {activeInv && adapted && (
          <section className="space-y-4">
            <SteuerCockpitCard
              inv={activeInv}
              invMeta={invMeta}
              kontakt={kontakt}
              kontaktMeta={kontaktMeta}
              finanzierung={finanzierung}
              saData={saData}
              onRefresh={() => setRefreshKey((k) => k + 1)}
            />
            <MarktwertCard inv={adapted} onPersist={persistMeta} />
          </section>
        )}
        {/* Hinweis: Die Anlage-V-Karte (SteuerCockpitEigen) wird hier absichtlich NICHT
            gerendert. Sie rechnete parallel eine zweite, abweichende Steuerrechnung fuer
            dasselbe Objekt. Fuer eigene Immobilien bleibt sie in EigeneInvestmentsTab. */}
      </div>
    </DashboardLayout>
  );
}