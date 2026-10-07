import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getKontakte } from "@/lib/kundenStore";
import { excludeStatsKontakte } from "@/lib/statsExclusion";
import { isTeamWideKontaktRole, kontaktBelongsToUser, getKontaktDashboardBucket, kontaktImTeam } from "@/lib/kontaktOwnership";
import { useAdminTeamScope } from "@/hooks/useAdminTeamScope";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { ScopeToggle, VP_TEAM_OPTIONS } from "./ScopeToggle";
import { unscharfKlasse } from "@/lib/vorfuehrmodus";
import { useUser } from "@/contexts/UserContext";
import { useMemo, useState } from "react";
import { KundenDetailDialog } from "./KundenDetailDialog";
import { useLiveVersion } from "@/hooks/useLiveData";
import { Info } from "lucide-react";
import { kontaktKaufpreis } from "@/lib/objektDatenPflicht";

export function PotenzialCard() {
  const { user, authUser } = useUser();
  const isTeamWide = isTeamWideKontaktRole(user.role);
  const { splitTeamCompany, teamIds, teamNames, vpTeamView } = useAdminTeamScope();
  const showScopeToggle = splitTeamCompany || vpTeamView;
  const [scope, setScope] = useState<"eigen" | "team" | "company" | "all">("all");
  const cacheVersion = useLiveVersion(["kontakte"]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogKunden, setDialogKunden] = useState<any[]>([]);

  const { stats, groups } = useMemo(() => {
    const all = excludeStatsKontakte(getKontakte()).filter(k => !k.archiviert);
    const allUsers = loadAllUsers();
    let filtered;
    if (isTeamWide) {
      filtered = all;
    } else if (vpTeamView) {
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

    // Pipeline-Stufen-Buckets
    // "Kunden": alle zwischen Beratungsgespräch und Fälligkeit (inkl.)
    const KUNDEN_STUFEN = new Set([
      "beratungsgespraech",
      "bonitaetsunterlagen",
      "objektauswahl",
      "follow_up_objekt",
      "reservierung",
      "finanzierung",
      "notar",
      "faelligkeit",
    ]);
    // "Vollständig" / Volumen-relevant: ab Objektauswahl (Objekt ist zugeordnet)
    const AB_OBJEKTAUSWAHL = new Set([
      "objektauswahl",
      "follow_up_objekt",
      "reservierung",
      "finanzierung",
      "notar",
      "faelligkeit",
    ]);

    const normStufe = (k: any): string => {
      const s = k.meta?.pipelineStufe || k.pipelineStufe || "";
      if (s === "closing") return "objektauswahl"; // Legacy-Mapping
      return s;
    };

    /*
     * Was in der Pipeline steckt, gewichtet nach Abschlusswahrscheinlichkeit.
     *
     * Die rohe Summe aller Kaufpreise behandelte einen Kunden im
     * Beratungsgespraech wie einen kurz vor dem Notar. Der eine schliesst mit
     * dreissig Prozent ab, der andere mit neunzig. Eine Zahl, die beide gleich
     * zaehlt, taugt nicht zur Planung.
     *
     * Die Wahrscheinlichkeit je Stufe liegt seit jeher in pipelineStufen.ts und
     * wurde hier nie genutzt.
     *
     * Notar und Faelligkeit fallen raus: Wer beim Notar sitzt, ist kein
     * Potenzial mehr, sondern Umsatz, und der steht in der obersten Kachel.
     */
    const OFFEN = new Set([
      "beratungsgespraech", "bg_noshow", "selbstauskunft", "bonitaetsunterlagen",
      "objektauswahl", "follow_up_objekt", "reservierung", "finanzierung",
    ]);
    const offene = filtered.filter(k => k.status !== "verloren" && OFFEN.has(normStufe(k)));
    const complete = filtered.filter(k => k.status !== "verloren" && AB_OBJEKTAUSWAHL.has(normStufe(k)));

    /*
     * Erst die Investments, dann der Kontakt.
     *
     * Wer einen Kunden von Hand auf Reservierung oder Finanzierung zieht,
     * traegt den Kaufpreis im Dialog ein, und der legt ihn am Investment ab.
     * Am Kontakt steht dann nichts. Genau diese Kunden waeren hier mit null
     * Euro in die Prognose eingegangen, obwohl Objekt und Preis feststehen.
     */
    const preis = (k: any) => kontaktKaufpreis(k.id, k.kaufpreis);
    /*
     * Der volle Kaufpreis, nicht gewichtet.
     *
     * Kurzzeitig stand hier eine mit der Abschlusswahrscheinlichkeit
     * multiplizierte Summe. Christian will die Zahl eins zu eins so sehen, wie
     * sie im System steht: Was in der Pipeline liegt, liegt dort mit seinem
     * ganzen Betrag. Eine gewichtete Zahl laesst sich nicht gegen die
     * Kaufvertraege pruefen, und genau das muss moeglich bleiben.
     */
    const gesamt = offene.reduce((s, k) => s + preis(k), 0);

    // Nach Naehe zum Abschluss gruppiert, damit sichtbar ist, worauf die
    // Prognose steht: auf wenigen Reservierungen oder auf vielen Gespraechen.
    const AB_RESERVIERUNG = new Set(["reservierung", "finanzierung"]);
    const AB_OBJEKT = new Set(["objektauswahl", "follow_up_objekt"]);
    const summe = (liste: any[]) => liste.reduce((s, k) => s + preis(k), 0);
    const spaet = offene.filter(k => AB_RESERVIERUNG.has(normStufe(k)));
    const mitte = offene.filter(k => AB_OBJEKT.has(normStufe(k)));
    const frueh = offene.filter(k => !AB_RESERVIERUNG.has(normStufe(k)) && !AB_OBJEKT.has(normStufe(k)));

    const kurz = (betrag: number) =>
      betrag >= 1_000_000
        ? `${(betrag / 1_000_000).toFixed(1)} Mio.`
        : `${Math.round(betrag / 1000)} T`;

    return {
      stats: {
        kunden: offene.length,
        vollstaendig: complete.length,
        volumen: kurz(gesamt),
        spaetBetrag: kurz(summe(spaet)),
        mitteBetrag: kurz(summe(mitte)),
        fruehBetrag: kurz(summe(frueh)),
        spaetAnzahl: spaet.length,
        mitteAnzahl: mitte.length,
        fruehAnzahl: frueh.length,
      },
      groups: { kunden: offene, vollstaendig: complete, volumen: offene, spaet, mitte, frueh },
    };
  }, [isTeamWide, user.name, authUser?.id, cacheVersion, splitTeamCompany, vpTeamView, showScopeToggle, scope, teamIds, teamNames]);

  const openList = (title: string, kunden: any[]) => {
    setDialogTitle(title);
    setDialogKunden(kunden);
    setDialogOpen(true);
  };

  const metricClass = "font-bold text-foreground cursor-pointer hover:text-primary transition-colors";

  return (
    <>
      <Card className="h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-[0.1em]">
              {isTeamWide ? "Potenzial · Team" : "Potenzial"}
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
        <CardContent className="flex flex-col items-center justify-center gap-4 pt-2">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center justify-center gap-6 w-full">
              {/*
                Die Prognose steht vorn, nicht die Anzahl.
                
                Eine Anzahl sagt, wie viele Vorgaenge laufen. Die gewichtete
                Summe sagt, womit man rechnen kann, und darum geht es bei einer
                Karte namens Potenzial.
              */}
              <div className="flex-1 text-center flex flex-col items-center">
                <p
                  className={unscharfKlasse(`text-[26px] sm:text-[34px] tracking-tight tabular-nums leading-none font-semibold ${metricClass}`)}
                  onClick={() => openList("Mögliches Volumen – beteiligte Kunden", groups.volumen)}
                >
                  {stats.volumen}<span className="text-xs font-normal text-muted-foreground ml-1.5">EUR</span>
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-[11px] text-muted-foreground font-medium mt-2 inline-flex items-center gap-1 cursor-help">
                      Mögliches Volumen <Info className="w-3 h-3" />
                    </p>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-center">
                    Summe aller Kaufpreise vom Beratungsgespräch bis zur Finanzierung, so
                    wie sie am jeweiligen Investment hinterlegt sind. Notar und Fälligkeit sind
                    nicht enthalten, die stehen als Umsatz in der Kachel oben.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Separator orientation="vertical" className="h-12" />
              <div className="flex-1 text-center flex flex-col items-center">
                <p
                  className={unscharfKlasse(`text-[26px] sm:text-[34px] tracking-tight tabular-nums leading-none font-semibold ${metricClass}`)}
                  onClick={() => openList("Offene Vorgänge", groups.kunden)}
                >
                  {stats.kunden}
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-[11px] text-muted-foreground font-medium mt-2 inline-flex items-center gap-1 cursor-help">
                      offene Vorgänge <Info className="w-3 h-3" />
                    </p>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-center">
                    Vom Beratungsgespräch bis zur Finanzierung. Davon haben {stats.vollstaendig}
                    {" "}bereits ein zugeordnetes Objekt.
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/*
              Woraus die Prognose besteht. Ohne diese Aufteilung sieht eine
              halbe Million aus wenigen Reservierungen genauso aus wie eine aus
              vierzig vagen Gespraechen.
            */}
            <div className="pt-3 mt-1 border-t space-y-1.5">
              {([
                { label: "Reservierung und Finanzierung", betrag: stats.spaetBetrag, anzahl: stats.spaetAnzahl, gruppe: groups.spaet },
                { label: "Objektauswahl", betrag: stats.mitteBetrag, anzahl: stats.mitteAnzahl, gruppe: groups.mitte },
                { label: "Beratung und Bonität", betrag: stats.fruehBetrag, anzahl: stats.fruehAnzahl, gruppe: groups.frueh },
              ]).filter((z) => z.anzahl > 0).map((z) => (
                <button
                  key={z.label}
                  type="button"
                  className="flex w-full items-baseline justify-between gap-2 text-[11px] hover:text-foreground transition-colors"
                  onClick={() => openList(z.label, z.gruppe)}
                >
                  <span className="text-muted-foreground truncate">
                    {z.label} <span className={unscharfKlasse("tabular-nums")}>({z.anzahl})</span>
                  </span>
                  <span className={unscharfKlasse("font-medium tabular-nums shrink-0")}>{z.betrag} EUR</span>
                </button>
              ))}
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>
      <KundenDetailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={dialogTitle}
        kunden={dialogKunden}
        variant="abwicklung"
      />
    </>
  );
}
