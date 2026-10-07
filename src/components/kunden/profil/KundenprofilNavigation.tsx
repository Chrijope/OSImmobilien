import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Lock, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  tabs: { key: string; label: string; draft?: boolean; anzahl?: number; neu?: number }[];
  activeTab: string;
  rolle: string;
  portalFreigeschalten: boolean;
  onWechsel: (key: string) => void;
}

/** Die bereits rollenbereinigte Navigation wird lediglich anders angeordnet. */
export function KundenprofilNavigation({ tabs, activeTab, rolle, portalFreigeschalten, onWechsel }: Props) {
  /*
   * Die Kennung `kundenprofil-reiterleiste` braucht das Profil, um nach einem
   * Reiterwechsel wieder hierher zu rollen. Auf dem Telefon steht die Leiste
   * weit unten, weil Person und Kacheln darueber liegen. Siehe `wechsleReiter`
   * in `pages/KundenDetail.tsx`.
   */
  return (
<div id="kundenprofil-reiterleiste" className="kundenprofil-navigation" aria-label="Arbeitsbereiche">
          {["stammdaten", "investments", "dokumente", "kommunikation", "empfehlungen"].flatMap(key => tabs.filter(t => t.key === key)).map(t => {
            const isDraft = t.draft;
            const isInvestmentTab = t.key === "investments";
            const canAccessDraft = ["admin", "inhaber"].includes(rolle);
            if (isDraft) {
              return (
                <Button
                    data-no-shrink
                  key={t.key}
                  size="sm"
                  variant="outline"
                  disabled={!canAccessDraft}
                  className={cn("gap-1.5", !canAccessDraft && "opacity-40 cursor-not-allowed")}
                  onClick={canAccessDraft ? () => onWechsel(t.key) : undefined}
                >
                  {t.label.replace(/^[^\p{L}]+/u, "")}
                  <Badge className={cn(
                    "ml-1 shrink-0 text-[7px] leading-none px-1 py-0.5 h-3.5 font-semibold uppercase tracking-wide rounded",
                    canAccessDraft
                      ? "bg-orange-500/15 text-orange-500 border border-orange-500/30"
                      : "bg-muted text-muted-foreground border border-border"
                  )}>
                    {canAccessDraft ? "Entwurf" : "Bald verfügbar"}
                  </Badge>
                </Button>
              );
            }
            const chatHint = t.key === "kommunikation"
              ? (portalFreigeschalten
                  ? "Interner Austausch mit Kollegen und der direkte Verlauf mit dem Kunden, beides an einer Stelle. Was intern steht, sieht der Kunde nicht."
                  : "Interner Austausch mit Kollegen zu diesem Kontakt. Der Kundenchat bleibt gesperrt, solange das Kundenportal nicht freigeschaltet ist.")
              : t.key === "dokumente"
              ? "Zentrale Dokumentenablage des Kunden – alle Unterlagen an einem Ort, unabhängig vom einzelnen Investment."
              : isInvestmentTab
              ? "Alle Vorgänge dieses Kunden – Pipelinestufen, Beratungstermin, Selbstauskunft, Bonitätscheck, Objektauswahl und Abwicklung, je Investment."
              : null;
            /*
             * Die Sperre haengt nicht mehr an der Reiterleiste.
             *
             * Bis Welle 3 war der Kundenchat ein eigener, ausgegrauter Reiter.
             * Jetzt ist der Reiter offen, gesperrt ist innerhalb davon nur der
             * eine Eintrag in der Verlaufsliste, und er nennt den Grund.
             */
            const isKundenChatLocked = false;
            return (
              <Tooltip key={t.key}>
                <TooltipTrigger asChild>
                  <Button
                    data-no-shrink
                    size="sm"
                    variant="ghost"
                    aria-current={activeTab === t.key ? "page" : undefined}
                    aria-disabled={isKundenChatLocked}
                    tabIndex={isKundenChatLocked ? -1 : undefined}
                    className={cn(
                      activeTab === t.key ? "bg-primary/10 text-primary" : "text-muted-foreground",
                      isKundenChatLocked && "opacity-50 cursor-not-allowed",
                    )}
                    onClick={isKundenChatLocked ? undefined : () => onWechsel(t.key)}
                  >
                    {t.label.replace(/^[^\p{L}]+/u, "")}
                    {/*
                      Der runde Zaehler fuer neue Nachrichten. Gestaltung wie
                      `badgeCount` in der Seitenleiste, damit dieselbe Sache
                      nicht an zwei Stellen verschieden aussieht.
                    */}
                    {typeof t.neu === "number" && t.neu > 0 && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "ml-1.5 shrink-0 text-[10px] px-1.5 py-0 h-5 tabular-nums",
                          activeTab === t.key
                            ? "bg-primary-foreground text-primary"
                            : "bg-primary text-primary-foreground",
                        )}
                      >
                        {t.neu}
                      </Badge>
                    )}
                    {/* Der Zaehler sagt, wie viele Vorgaenge hinter dem Reiter liegen. */}
                    {typeof t.anzahl === "number" && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "ml-1.5 shrink-0 h-4 min-w-4 px-1 text-[10px] leading-none tabular-nums justify-center",
                          activeTab === t.key
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {t.anzahl}
                      </Badge>
                    )}
                    {isKundenChatLocked && (
                      <>
                        <Lock className="h-3 w-3 ml-1.5 opacity-70" />
                        <Info className="h-3 w-3 ml-1 opacity-70" />
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                {chatHint && (
                  <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                    {chatHint}
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </div>
  );
}
