/**
 * Die Folienleiste links in der Moderation (`PraesentationsUebung.tsx`).
 *
 * Oben die Wahl des Ablaufs (Vorabbogen, Kennenlernbogen, Rechner), dann die
 * Favoriten, dann die Folien des gewählten Ablaufs, je Weg gruppiert, mit
 * Nummer und Titel. Jede Folie lässt sich direkt anspringen, jede trägt
 * einen Stern. Der Rechner steht als eigener Eintrag ganz unten, damit er
 * sofort zu finden ist.
 *
 * Die Leiste kennt keinen Zustand außer dem, was die Seite ihr gibt; jeder
 * Klick meldet nur ein Ziel zurück. So bleibt die Adresse der Seite die
 * einzige Wahrheit über Ablauf, Weg und Folie.
 */
import { Calculator, ChevronDown, PanelLeftClose, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { WegId } from "@/lib/bewerberKennenlernen";
import { getModul, type ModulId } from "@/lib/bewerberVideocall";
import type { DeckTeil } from "@/lib/praesentationsDeck";
import {
  UEBUNGS_ARTEN,
  favoritBeschriftung,
  favoritenSchluessel,
  kennenlernGruppen,
  rechnerEintrag,
  vorabbogenGruppen,
  type LeistenEintrag,
  type LeistenGruppe,
  type UebungsArt,
  type UebungsStand,
} from "@/lib/praesentationsUebung";

export type UebungsZiel = {
  art: UebungsArt;
  weg?: WegId;
  folieId?: string;
  module?: ModulId[];
  teil?: DeckTeil;
};

function Abschnitt({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

/** Der Stern an einer Folie. */
function Stern({ an, onClick, testId }: { an: boolean; onClick: () => void; testId?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          aria-label={an ? "Favorit entfernen" : "Als Favorit merken"}
          aria-pressed={an}
          data-testid={testId}
          className={cn(
            "shrink-0 rounded p-1 transition",
            an ? "text-amber-500" : "text-muted-foreground/40 hover:text-amber-500",
          )}
        >
          <Star className="h-3.5 w-3.5" fill={an ? "currentColor" : "none"} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{an ? "Favorit entfernen" : "Als Favorit merken"}</TooltipContent>
    </Tooltip>
  );
}

/** Eine Folienzeile: Nummer, Titel, Unterzeile, Stern. */
function Zeile({
  eintrag, nummer, aktiv, gedimmt, istFavorit, onFavorit, onKlick,
}: {
  eintrag: LeistenEintrag;
  nummer: number | null;
  aktiv: boolean;
  gedimmt?: boolean;
  istFavorit: boolean;
  onFavorit: () => void;
  onKlick: () => void;
}) {
  return (
    <li className="flex items-center gap-1 pr-1">
      <button
        type="button"
        onClick={onKlick}
        aria-current={aktiv ? "true" : undefined}
        data-testid={`leiste-${eintrag.schluessel}`}
        className={cn(
          "flex min-w-0 flex-1 items-start gap-2 rounded px-2 py-1.5 text-left text-xs transition",
          aktiv ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted",
          gedimmt && !aktiv && "opacity-50",
        )}
      >
        <span className="w-5 shrink-0 tabular-nums text-[11px] text-muted-foreground">
          {nummer ?? "–"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 truncate">
            {eintrag.istRechner && <Calculator className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
            <span className="truncate">{eintrag.titel}</span>
          </span>
          {eintrag.unterzeile && (
            <span className="block truncate text-[10px] font-normal text-muted-foreground">{eintrag.unterzeile}</span>
          )}
        </span>
      </button>
      <Stern an={istFavorit} onClick={onFavorit} testId={`stern-${eintrag.schluessel}`} />
    </li>
  );
}

export function UebungsLeiste({
  stand,
  nummern,
  favoriten,
  bewerberName,
  seinWeg,
  istFavorit,
  onFavorit,
  onZiel,
  onEinklappen,
}: {
  stand: UebungsStand;
  /** Nummer jeder Folie im gerade gezeigten Ablauf, nach Folien-Id. */
  nummern: Record<string, number>;
  favoriten: string[];
  /**
   * Der Bewerber, aus dessen Profil die Seite geöffnet wurde. Steht er hier,
   * ist die Ansicht keine Übung, sondern die Moderation seines Gesprächs.
   * Leer heißt: ohne Kennung aufgerufen, dann bleibt die Leiste blank.
   */
  bewerberName?: string;
  /**
   * Der Weg, den dieser Bewerber im Kennenlernbogen gewählt hat. Nur auf ihm
   * tragen die Folien seine Antworten, deshalb trägt seine Gruppe eine Marke.
   * Null ohne Bogen und ohne Bewerber.
   */
  seinWeg?: WegId | null;
  istFavorit: (schluessel: string) => boolean;
  onFavorit: (schluessel: string) => void;
  onZiel: (ziel: UebungsZiel) => void;
  onEinklappen: () => void;
}) {
  const aktivSchluessel = stand.art === "rechner"
    ? rechnerEintrag().schluessel
    : favoritenSchluessel(stand.art, stand.folieId, stand.weg);

  const favoritenZeilen = favoriten
    .map((s) => ({ schluessel: s, info: favoritBeschriftung(s) }))
    .filter((f): f is { schluessel: string; info: NonNullable<ReturnType<typeof favoritBeschriftung>> } => !!f.info);

  const gruppen: LeistenGruppe[] = stand.art === "vorabbogen"
    ? vorabbogenGruppen()
    : stand.art === "kennenlernbogen"
      ? kennenlernGruppen({ [stand.weg]: stand.module })
      : [];

  const rechner = rechnerEintrag();

  return (
    <TooltipProvider delayDuration={300}>
      <aside className="flex h-full w-80 shrink-0 flex-col border-r bg-background" data-testid="uebungs-leiste">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          {/* Die Beschriftung sagt, was tatsächlich offen ist. Kommt die Seite
              aus einem Bewerberprofil, reist seine Kennung mit und die
              Moderation gehört zu ihm, dann steht sein Name hier. Nur der
              Aufruf ohne Kennung ist wirklich eine blanke Übung. */}
          <div className="min-w-0" data-testid="leiste-kopf">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {bewerberName ? "Moderation" : "Übungsansicht"}
            </p>
            <p className="truncate text-sm font-semibold">
              {bewerberName || "Blank, ohne Bewerberdaten"}
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={onEinklappen} aria-label="Leiste ausblenden">
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Leiste ausblenden, nur die Folie bleibt (für die Bildschirmfreigabe)</TooltipContent>
          </Tooltip>
        </div>

        <ScrollArea className="flex-1">
          <div className="pb-4">
            {/* Der Ablauf: drei Knöpfe untereinander in voller Leistenbreite.
                Nebeneinander sprengten die Namen die Leiste; so bleibt jeder
                Name ganz lesbar, und die Zeile darunter sagt, welche
                Präsentation dahintersteckt. */}
            <Abschnitt>Ablauf</Abschnitt>
            <div className="space-y-1 px-3" role="tablist" aria-label="Ablauf">
              {UEBUNGS_ARTEN.map((a) => {
                const aktiv = stand.art === a.art;
                return (
                  <button
                    key={a.art}
                    type="button"
                    role="tab"
                    aria-selected={aktiv}
                    onClick={() => onZiel({ art: a.art })}
                    data-testid={`leiste-art-${a.art}`}
                    title={`${a.kurz}: ${a.unterzeile}`}
                    className={cn(
                      "flex w-full min-w-0 flex-col items-start rounded-md border px-2.5 py-1.5 text-left transition",
                      aktiv ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    <span className="block w-full truncate text-xs font-semibold">{a.kurz}</span>
                    <span className={cn("block w-full truncate text-[10px]", aktiv ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {a.unterzeile}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Favoriten */}
            {favoritenZeilen.length > 0 && (
              <>
                <Abschnitt>Favoriten</Abschnitt>
                <ul className="space-y-0.5 px-2" data-testid="leiste-favoriten">
                  {favoritenZeilen.map(({ schluessel, info }) => (
                    <li key={schluessel} className="flex items-center gap-1 pr-1">
                      <button
                        type="button"
                        onClick={() => onZiel({
                          art: info.ziel.art,
                          weg: info.ziel.weg ?? undefined,
                          folieId: info.ziel.folieId,
                          module: info.module,
                        })}
                        className={cn(
                          "flex min-w-0 flex-1 items-start gap-2 rounded px-2 py-1.5 text-left text-xs transition",
                          schluessel === aktivSchluessel ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted",
                        )}
                      >
                        <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" fill="currentColor" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{info.titel}</span>
                          <span className="block truncate text-[10px] font-normal text-muted-foreground">{info.gruppe}</span>
                        </span>
                      </button>
                      <Stern an onClick={() => onFavorit(schluessel)} />
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Der Vorabbogen: Einstieg, dann Teil 1 und Teil 2 */}
            {stand.art === "vorabbogen" && (
              <>
                <Abschnitt>Einstieg</Abschnitt>
                <div className="grid grid-cols-2 gap-1 px-3" role="radiogroup" aria-label="Einstieg">
                  {([1, 2] as DeckTeil[]).map((teil) => (
                    <button
                      key={teil}
                      type="button"
                      role="radio"
                      aria-checked={stand.teil === teil}
                      onClick={() => onZiel({ art: "vorabbogen", teil })}
                      data-testid={`leiste-teil-${teil}`}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-[11px] font-medium transition",
                        stand.teil === teil ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                      )}
                    >
                      {teil === 1 ? "Ab Teil 1 (22 Folien)" : "Nur Teil 2 (15 Folien)"}
                    </button>
                  ))}
                </div>
                <p className="px-3 pt-2 text-[10px] leading-snug text-muted-foreground">
                  Die vier Hintergrund-Pfade (A bis D) ändern nur den Sprechtext der Moderation, nicht die Folien.
                </p>
              </>
            )}

            {/* Die Gruppen */}
            {gruppen.map((g) => {
              const offen = stand.art !== "kennenlernbogen" || g.weg === stand.weg;
              const gedimmt = stand.art === "vorabbogen" && stand.teil === 2 && g.id === "vorabbogen-teil1";
              return (
                <Collapsible
                  key={g.id}
                  open={offen}
                  onOpenChange={(o) => { if (o && g.weg) onZiel({ art: "kennenlernbogen", weg: g.weg }); }}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "mt-3 flex w-full items-center gap-2 px-3 py-1 text-left",
                        stand.art !== "kennenlernbogen" && "cursor-default",
                      )}
                      data-testid={`leiste-gruppe-${g.id}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={cn("flex items-center gap-1.5 text-xs font-semibold", offen ? "text-foreground" : "text-muted-foreground")}>
                          <span className="truncate">{g.titel}</span>
                          {/* Nur auf seinem Weg tragen die Folien seine
                              Antworten. Die Marke sagt, welcher das ist, damit
                              ein Blick in die Leiste reicht. */}
                          {seinWeg && g.weg === seinWeg && (
                            <span
                              className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary"
                              data-testid="leiste-sein-weg"
                            >
                              sein Weg
                            </span>
                          )}
                        </span>
                        {g.unterzeile && (
                          <span className="block truncate text-[10px] text-muted-foreground">{g.unterzeile}</span>
                        )}
                      </span>
                      {stand.art === "kennenlernbogen" && (
                        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition", offen && "rotate-180")} aria-hidden />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {gedimmt && (
                      <p className="px-3 pb-1 text-[10px] leading-snug text-muted-foreground">
                        Im Einstieg „Nur Teil 2" nicht dabei. Ein Klick wechselt auf „Ab Teil 1".
                      </p>
                    )}
                    {g.beiBedarf && g.beiBedarf.length > 0 && g.weg && (
                      <div className="flex flex-wrap items-center gap-1 px-3 pb-1">
                        <span className="text-[10px] text-muted-foreground">Bei Bedarf:</span>
                        {g.beiBedarf.map((m) => {
                          const an = g.weg === stand.weg && stand.module.includes(m);
                          return (
                            <button
                              key={m}
                              type="button"
                              aria-pressed={an}
                              onClick={() => onZiel({
                                art: "kennenlernbogen",
                                weg: g.weg,
                                module: an ? stand.module.filter((x) => x !== m) : [...(g.weg === stand.weg ? stand.module : []), m],
                              })}
                              data-testid={`leiste-modul-${g.weg}-${m}`}
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px] transition",
                                an ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                              )}
                              title={getModul(m).agenda}
                            >
                              Modul {getModul(m).nummer}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <ul className="space-y-0.5 px-2">
                      {g.eintraege.map((e, i) => (
                        <Zeile
                          key={e.schluessel}
                          eintrag={e}
                          nummer={g.weg ? i + 1 : nummern[e.folieId] ?? null}
                          aktiv={e.schluessel === aktivSchluessel}
                          gedimmt={gedimmt}
                          istFavorit={istFavorit(e.schluessel)}
                          onFavorit={() => onFavorit(e.schluessel)}
                          onKlick={() => onZiel({
                            art: e.art,
                            weg: e.weg,
                            folieId: e.folieId,
                            // Eine Teil-1-Folie gibt es nur im Einstieg ab Teil 1.
                            teil: e.teil === 1 ? 1 : stand.teil,
                            module: e.weg === stand.weg ? stand.module : [],
                          })}
                        />
                      ))}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}

            {/* Der Rechner, immer als eigener Eintrag */}
            <Abschnitt>Werkzeug</Abschnitt>
            <ul className="space-y-0.5 px-2">
              <Zeile
                eintrag={rechner}
                nummer={null}
                aktiv={stand.art === "rechner"}
                istFavorit={istFavorit(rechner.schluessel)}
                onFavorit={() => onFavorit(rechner.schluessel)}
                onKlick={() => onZiel({ art: "rechner" })}
              />
            </ul>
          </div>
        </ScrollArea>
      </aside>
    </TooltipProvider>
  );
}
