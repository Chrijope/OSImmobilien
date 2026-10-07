import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";
import { getKontakte, type KundeData } from "@/lib/kundenStore";
import { buildBucketEntries, type KundeBucketEntry } from "@/lib/kontaktPipeline";
import { isTeamWideKontaktRole, kontaktBelongsToUser, getKontaktDashboardBucket, kontaktImTeam } from "@/lib/kontaktOwnership";
import { useAdminTeamScope } from "@/hooks/useAdminTeamScope";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { useUser } from "@/contexts/UserContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { KundenDetailDialog } from "./KundenDetailDialog";
import { unscharfKlasse } from "@/lib/vorfuehrmodus";
import { useLiveVersion } from "@/hooks/useLiveData";
import { ScopeToggle, VP_TEAM_OPTIONS } from "./ScopeToggle";

const KATEGORIE_INFO: Record<string, { label: string; intro: string; stufen: string[]; color: string }> = {
  kontakt: {
    label: "Kontakte",
    intro: "Leads & Interessenten im Erstkontakt – vor gezieltem Follow-Up.",
    stufen: ["Neuer Lead", "Kontaktversuche", "Vermögensaufbau", "Erstgespräch", "Beratungsgespräch"],
    color: "bg-blue-500",
  },
  followup: {
    label: "Follow-Up",
    intro: "Kontakte mit aktiver Wiedervorlage oder geplantem Follow-Up.",
    stufen: ["Follow-Up"],
    color: "bg-rose-500",
  },
  neukunde: {
    label: "Neukunden",
    intro: "Selbstauskunft unterschrieben, noch keine Reservierung.",
    stufen: ["Bonitätsunterlagen", "Objektauswahl"],
    color: "bg-amber-500",
  },
  abwicklung: {
    label: "Abwicklungen",
    intro: "Reservierung unterschrieben, Notartermin steht noch aus.",
    stufen: ["Reservierung", "Finanzierung", "Notar", "Fälligkeit", "Abrechnung"],
    color: "bg-purple-500",
  },
  bestandskunde: {
    label: "Bestandskunden",
    intro: "Notartermin abgeschlossen – Eigentümer der Immobilie.",
    stufen: ["Abgeschlossen"],
    color: "bg-emerald-500",
  },
  bestand: {
    label: "Bestand",
    intro: "Importierte / manuell angelegte Bestandskontakte ohne aktiven Sales-Prozess.",
    stufen: ["Bestandsimport"],
    color: "bg-slate-500",
  },
};

type TooltipState = {
  key: string;
  top: number;
  left: number;
  placement: "top" | "bottom";
};

export function KundenCard() {
  const { user, authUser } = useUser();
  const isTeamWide = isTeamWideKontaktRole(user.role);
  const { splitTeamCompany, teamIds, teamNames, vpTeamView } = useAdminTeamScope();
  const showScopeToggle = splitTeamCompany || vpTeamView;
  const cacheVersion = useLiveVersion(["kontakte", "investments"]);
  const [scope, setScope] = useState<"eigen" | "team" | "company" | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogKunden, setDialogKunden] = useState<any[]>([]);
  const [dialogVariant, setDialogVariant] = useState<"kontakt" | "followup" | "neukunde" | "abwicklung" | "bestandskunde" | "bestand">("kontakt");
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const closeTooltip = () => {
    clearCloseTimeout();
    setTooltip(null);
  };

  const scheduleTooltipClose = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => setTooltip(null), 120);
  };

  const openTooltip = (key: string, trigger: HTMLButtonElement | null) => {
    if (!trigger) return;

    clearCloseTimeout();

    const rect = trigger.getBoundingClientRect();
    const tooltipWidth = 260;
    const tooltipHeight = 190;
    const viewportPadding = 12;
    const preferredTop = rect.bottom + 10;
    const shouldPlaceAbove = preferredTop + tooltipHeight > window.innerHeight - viewportPadding;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - tooltipWidth / 2, viewportPadding),
      window.innerWidth - tooltipWidth - viewportPadding,
    );

    setTooltip({
      key,
      left,
      top: shouldPlaceAbove ? Math.max(viewportPadding, rect.top - tooltipHeight - 10) : preferredTop,
      placement: shouldPlaceAbove ? "top" : "bottom",
    });
  };

  useEffect(() => {
    return () => clearCloseTimeout();
  }, []);

  const { counts, groups } = useMemo(() => {
    const all = getKontakte();
    const allUsers = loadAllUsers();
    let filtered;
    if (isTeamWide) {
      filtered = all;
    } else if (vpTeamView) {
      // Eigene + Downline-Kontakte
      filtered = all.filter(k => {
        if (kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id })) return true;
        return kontaktImTeam(k, teamIds, teamNames);
      });
    } else {
      filtered = all.filter(k => kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id }));
    }
    if (showScopeToggle && scope !== "all") {
      filtered = filtered.filter(k => {
        const b = getKontaktDashboardBucket(k, {
          userName: user.name,
          userId: authUser?.id,
          isTeamWide,
          teamNames,
          teamIds,
          users: allUsers,
          splitTeamCompany: true,
        });
        return b === scope;
      });
    }
    const active = filtered.filter(k => !k.archiviert);

    // Investment-zentrisch: Kunden mit mehreren Investments tauchen in mehreren Buckets
    // einmal pro Investment auf (siehe buildBucketEntries / Neukunden / Abwicklung).
    const kontakteEntries = buildBucketEntries(active, "kontakte");
    const leadEntries = buildBucketEntries(active, "leadverwaltung");
    const followupEntries = buildBucketEntries(active, "followup");
    const neukundenEntries = buildBucketEntries(active, "neukunden");
    const abwicklungEntries = buildBucketEntries(active, "abwicklung");
    const bestandsEntries = buildBucketEntries(active, "bestandskunden");
    const bestandImportEntries = buildBucketEntries(active, "bestandsimport");

    // Für den Detail-Dialog (KundenDetailDialog) brauchen wir KundeData-Objekte.
    // Dedupliziert pro Kunde, damit der Dialog je Bucket den Kunden 1× zeigt.
    const uniqKunden = (entries: KundeBucketEntry[]): KundeData[] => {
      const seen = new Set<string>();
      const out: KundeData[] = [];
      for (const e of entries) {
        if (seen.has(e.kunde.id)) continue;
        seen.add(e.kunde.id);
        out.push(e.kunde);
      }
      return out;
    };

    const groups = {
      kontakte: uniqKunden([...kontakteEntries, ...leadEntries]),
      followup: uniqKunden(followupEntries),
      neukunden: uniqKunden(neukundenEntries),
      abwicklung: uniqKunden(abwicklungEntries),
      bestandskunden: uniqKunden(bestandsEntries),
      bestand: uniqKunden(bestandImportEntries),
    };
    return {
      // Counts = eindeutige Kunden pro Bucket (passend zur Detail-Liste)
      counts: {
        kontakte: groups.kontakte.length,
        followup: groups.followup.length,
        neukunden: groups.neukunden.length,
        abwicklung: groups.abwicklung.length,
        bestandskunden: groups.bestandskunden.length,
        bestand: groups.bestand.length,
      },
      groups,
    };
  }, [isTeamWide, user.name, authUser?.id, cacheVersion, splitTeamCompany, vpTeamView, showScopeToggle, scope, teamIds, teamNames]);

  const openList = (title: string, kunden: any[], variant: "kontakt" | "followup" | "neukunde" | "abwicklung" | "bestandskunde" | "bestand") => {
    setDialogTitle(title);
    setDialogKunden(kunden);
    setDialogVariant(variant);
    setDialogOpen(true);
  };

  const metrics = [
    { key: "kontakt", count: counts.kontakte, group: groups.kontakte },
    { key: "followup", count: counts.followup, group: groups.followup },
    { key: "neukunde", count: counts.neukunden, group: groups.neukunden },
    { key: "abwicklung", count: counts.abwicklung, group: groups.abwicklung },
    { key: "bestandskunde", count: counts.bestandskunden, group: groups.bestandskunden },
    { key: "bestand", count: counts.bestand, group: groups.bestand },
  ];

  return (
    <>
      <Card className="h-full overflow-visible">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-[0.1em]">
              {isTeamWide ? "Kundenübersicht · Team" : "Kundenübersicht"}
            </CardTitle>
            {showScopeToggle && (
              <ScopeToggle
                value={scope}
                onChange={setScope}
                options={splitTeamCompany ? undefined : VP_TEAM_OPTIONS}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-center overflow-visible pt-2">
          <div className="grid grid-cols-2 gap-y-4 gap-x-2 w-full sm:grid-cols-6 sm:divide-x sm:divide-border/60 overflow-visible">
            {metrics.map(({ key, count, group }) => {
              const info = KATEGORIE_INFO[key];
              return (
                <div key={key} className="text-center flex flex-col items-center px-1 sm:px-2 min-w-0">
                  <p
                    className={unscharfKlasse("text-[26px] sm:text-[34px] font-semibold tracking-tight text-foreground cursor-pointer hover:text-primary transition-colors tabular-nums leading-none")}
                    onClick={() => openList(info.label, group, key as any)}
                  >
                    {count}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${info.color}`} />
                    <p className="text-[11px] text-muted-foreground font-medium">{info.label}</p>
                    <div
                      className="relative flex items-center"
                      onMouseEnter={(event) => openTooltip(key, event.currentTarget.querySelector("button"))}
                      onMouseLeave={scheduleTooltipClose}
                    >
                      <button
                        type="button"
                        className="text-muted-foreground/60 hover:text-foreground transition-colors"
                        aria-label={`Info zu ${info.label}`}
                        aria-expanded={tooltip?.key === key}
                        onFocus={(event) => openTooltip(key, event.currentTarget)}
                        onBlur={scheduleTooltipClose}
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>

        {/*
          Die Uebergaenge zwischen den Gruppen.
          
          Sechs Zahlen nebeneinander sagen, wie viele wo stehen. Sie sagen nicht,
          wo es eng wird. Genau das zeigt das Verhaeltnis: Wenn aus 340 Kontakten
          42 Neukunden werden und daraus 12 Abwicklungen, sieht man auf einen
          Blick, welcher Schritt der schwerste ist.
          
          Ausdruecklich ein Verhaeltnis der heutigen Bestaende und keine
          Conversion: Die 12 in Abwicklung stammen nicht aus den 340, die heute
          im Kontakt stehen, sondern aus frueheren. Als Hinweis darauf, wo der
          Trichter eng wird, taugt es trotzdem, als Erfolgsquote nicht.
        */}
        <div className="px-6 pb-4 -mt-1">
          {(() => {
            const holen = (k: string) => metrics.find((m) => m.key === k)?.count ?? 0;
            const quote = (von: number, nach: number) =>
              von > 0 ? `${Math.round((nach / von) * 100)} %` : "–";
            const kontakt = holen("kontakt");
            const neukunde = holen("neukunde");
            const abwicklung = holen("abwicklung");
            const bestand = holen("bestandskunde");
            if (kontakt + neukunde + abwicklung === 0) return null;

            const schritte = [
              { von: "Kontakt", nach: "Neukunde", wert: quote(kontakt, neukunde) },
              { von: "Neukunde", nach: "Abwicklung", wert: quote(neukunde, abwicklung) },
              { von: "Abwicklung", nach: "Bestand", wert: quote(abwicklung, bestand) },
            ];

            return (
              <div className="flex items-center justify-center gap-4 flex-wrap border-t pt-3">
                {schritte.map((sch) => (
                  <span key={sch.von} className="text-[11px] text-muted-foreground">
                    {sch.von} <span className="mx-0.5">→</span> {sch.nach}{" "}
                    <span className={unscharfKlasse("font-semibold text-foreground tabular-nums")}>{sch.wert}</span>
                  </span>
                ))}
                <span className="text-[10px] text-muted-foreground/70">
                  Verhältnis der heutigen Bestände, keine Erfolgsquote
                </span>
              </div>
            );
          })()}
        </div>
      </Card>
      <KundenDetailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={dialogTitle}
        kunden={dialogKunden}
        variant={dialogVariant}
      />
      {tooltip && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-[9999] w-[260px] rounded-md border bg-popover p-3 text-left text-popover-foreground shadow-lg"
              style={{ left: tooltip.left, top: tooltip.top }}
              onMouseEnter={clearCloseTimeout}
              onMouseLeave={scheduleTooltipClose}
            >
              <p className="mb-1 text-xs font-semibold">{KATEGORIE_INFO[tooltip.key].label}</p>
              <p className="mb-2 text-xs">{KATEGORIE_INFO[tooltip.key].intro}</p>
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">Pipeline-Stufen:</p>
              <ul className="text-[11px] space-y-0.5">
                {KATEGORIE_INFO[tooltip.key].stufen.map((stufe) => (
                  <li key={stufe} className="flex items-start gap-1">
                    <span className="text-muted-foreground">•</span>
                    <span>{stufe}</span>
                  </li>
                ))}
              </ul>
              <div
                className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border bg-popover"
                style={
                  tooltip.placement === "bottom"
                    ? { top: -5, borderRight: 0, borderBottom: 0 }
                    : { bottom: -5, borderLeft: 0, borderTop: 0 }
                }
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
