import { useMemo, useState, type ReactNode } from "react";
import { Building2, ChevronDown, ChevronUp, Eye, MapPin, Route } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { resolveImageUrl } from "@/lib/objekteImages";
import { dez, eur0, prozent } from "@/lib/objektKennzahlen";
import { weNrAnzeige } from "@/lib/objektDatenPflicht";
import {
  LISTEN_SORTIERUNGEN, entfernungZeile, sortiereObjektListe, spanneText,
  type ListenSortierung, type ObjektListenEintrag, type WohnortStand,
} from "@/lib/einheitEmpfehlung";
import { einheitOeffnenLink, objektOeffnenLink, type KundenBezug } from "@/lib/empfehlungAuswahl";
import type { ObjektScore } from "@/lib/objektScore";
import { ScoreRing } from "@/components/objektscore/ScoreAnzeige";

/** Vorschaubild eines Objekts oder einer Einheit, mit Haussymbol als Rückfall. */
export function Vorschaubild({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const src = url ? resolveImageUrl(url) : "";
  return src ? (
    <img src={src} alt={alt} loading="lazy" className={cn("shrink-0 rounded object-cover", className)} />
  ) : (
    <div className={cn("flex shrink-0 items-center justify-center rounded bg-muted", className)}>
      <Building2 className="h-5 w-5 text-muted-foreground/40" />
    </div>
  );
}

interface ObjektauswahlFensterProps {
  offen: boolean;
  onOffenChange: (offen: boolean) => void;
  titel: string;
  /** Rahmen und Kaufpreisrahmen, wie sie auch in der Karte stehen. */
  kopfzeile?: ReactNode;
  liste: ObjektListenEintrag[];
  rahmenVorhanden: boolean;
  standardSortierung: ListenSortierung;
  /** Der Objektscore je Einheit (Kandidatenschlüssel) und der beste je Objekt. Nur intern. */
  scores?: ReadonlyMap<string, ObjektScore>;
  scoreJeObjekt?: ReadonlyMap<string, ObjektScore>;
  wohnortStand: WohnortStand;
  wohnortName?: string;
  /** Der Wohnort wird gerade nachgeschlagen; dann fehlt er noch nicht wirklich. */
  entfernungLaedt?: boolean;
  bezug: KundenBezug;
  onNavigate: (pfad: string) => void;
}

/** Warum keine Entfernung dasteht. Ein Satz, einmal für die ganze Liste statt an jedem Objekt. */
const ENTFERNUNG_FEHLT: Record<Exclude<WohnortStand, "bekannt">, string> = {
  fehlt: "Wohnort fehlt, deshalb keine Entfernungen.",
  nicht_gefunden: "Wohnort nicht gefunden, deshalb keine Entfernungen.",
};

/**
 * „Objektauswahl vergrößern": alle Objekte mit freien, angebotenen Einheiten
 * in einem großen Fenster.
 *
 * Aufgebaut wie die Listenansicht der Seite „Objekte": eine Zeile je Objekt
 * mit Bild, Adresse und Preisspanne, darunter die Wohneinheiten zum
 * Aufklappen. Dazu, was es dort nicht gibt: die Entfernung zum Wohnort, ob
 * die Einheit in den Rahmen passt, eine Sortierung danach und der Schalter
 * „Nur passende".
 */
export function ObjektauswahlFenster({
  offen, onOffenChange, titel, kopfzeile, liste, rahmenVorhanden, standardSortierung, scores, scoreJeObjekt,
  wohnortStand, wohnortName, entfernungLaedt = false, bezug, onNavigate,
}: ObjektauswahlFensterProps) {
  const [sortierung, setSortierung] = useState<ListenSortierung>(standardSortierung);
  const [nurPassende, setNurPassende] = useState(false);
  const [aufgeklappt, setAufgeklappt] = useState<Set<string>>(new Set());

  // Ohne Rahmen gibt es nichts Passendes, dann greifen Sortierung und Schalter danach nicht.
  const wirksameSortierung: ListenSortierung = !rahmenVorhanden && (sortierung === "passende" || sortierung === "score") ? "entfernung" : sortierung;
  const zeilen = useMemo(() => {
    const gefiltert = rahmenVorhanden && nurPassende ? liste.filter((e) => e.anzahlPassend > 0) : liste;
    return sortiereObjektListe(gefiltert, wirksameSortierung, scoreJeObjekt);
  }, [liste, rahmenVorhanden, nurPassende, wirksameSortierung, scoreJeObjekt]);

  const anzahlEinheiten = liste.reduce((s, e) => s + e.einheiten.length, 0);
  const anzahlPassend = liste.reduce((s, e) => s + e.anzahlPassend, 0);
  const entfernungHinweis = entfernungLaedt
    ? "Entfernungen werden berechnet…"
    : wohnortStand === "bekannt" ? "" : ENTFERNUNG_FEHLT[wohnortStand];

  const umschalten = (id: string) =>
    setAufgeklappt((alt) => {
      const neu = new Set(alt);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });

  return (
    <Dialog open={offen} onOpenChange={onOffenChange}>
      <DialogContent
        /*
          Ueber der Kopfleiste, mit Luft oben und unten, und nur die Liste scrollt.

          Christian am 23.09.2026: Die Kopfleiste lag ueber dem oberen Rand, der
          Titel klebte an der Oberkante. Die Leiste liegt auf `z-[60]`, ein
          Dialog von Haus aus nur auf `z-50`. Deshalb `z-[80]`, dasselbe Muster
          wie bei der Vollbildansicht der Galerie (`GalerieVollbild.tsx`).

          Feste Hoehe statt nur einer Obergrenze: Sonst schrumpft das Fenster
          beim Schalter „Nur passende", richtet sich neu mittig aus, und die
          Bedienleiste springt unter dem Finger weg. `dvh` statt `vh`, weil
          `vh` auf dem Handy die Hoehe ohne Browserleisten meint; dann ragte
          das Fenster oben und unten aus dem sichtbaren Bereich.
        */
        className="z-[80] flex h-[86dvh] max-h-[86dvh] w-[95vw] max-w-5xl flex-col gap-3 overflow-hidden p-4 sm:p-6"
      >
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{titel}</DialogTitle>
          <DialogDescription>
            {liste.length} {liste.length === 1 ? "Objekt" : "Objekte"} mit {anzahlEinheiten} freien Einheiten
            {rahmenVorhanden ? `, davon ${anzahlPassend} passend` : ""}.
          </DialogDescription>
          {kopfzeile}
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="objektauswahl-sortierung" className="text-sm">Sortieren nach</Label>
            <Select value={wirksameSortierung} onValueChange={(w) => setSortierung(w as ListenSortierung)}>
              <SelectTrigger id="objektauswahl-sortierung" className="h-8 w-[170px] text-xs" aria-label="Sortieren nach">
                <SelectValue />
              </SelectTrigger>
              {/* Die Auswahl öffnet sich über dem Fenster (`z-[80]`), nicht dahinter. */}
              <SelectContent className="z-[100]">
                {LISTEN_SORTIERUNGEN.map((s) => (
                  <SelectItem key={s.wert} value={s.wert} disabled={(s.wert === "passende" || s.wert === "score") && !rahmenVorhanden}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="objektauswahl-nur-passende"
              checked={rahmenVorhanden && nurPassende}
              onCheckedChange={setNurPassende}
              disabled={!rahmenVorhanden}
            />
            <Label htmlFor="objektauswahl-nur-passende" className="text-sm">Nur passende</Label>
          </div>
          {!rahmenVorhanden && (
            <span className="text-xs text-muted-foreground">Ohne Finanzierungsrahmen gibt es keine passenden.</span>
          )}
          {entfernungHinweis && (
            <span className="text-xs text-muted-foreground" data-testid="objektauswahl-entfernung-hinweis">{entfernungHinweis}</span>
          )}
        </div>

        <div className="-mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-1 pb-1" data-testid="objektauswahl-liste">
          {zeilen.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {nurPassende ? "Kein Objekt hat eine passende freie Einheit." : "Keine freien Einheiten im Angebot."}
            </p>
          )}
          {zeilen.map((e) => {
            const passt = e.anzahlPassend > 0;
            const offenZeile = aufgeklappt.has(e.objektId);
            const entfernung = entfernungZeile(e.entfernungKm, wohnortStand, wohnortName);
            const globalKandidat = e.global ? e.einheiten[0] : undefined;
            return (
              <div
                key={e.objektId}
                data-testid={`objektauswahl-objekt-${e.objektId}`}
                data-passt={passt ? "ja" : "nein"}
                className={cn("overflow-hidden rounded-xl border", passt ? "border-primary/40 bg-primary/5" : "border-border")}
              >
                {/* Auf dem Handy rutscht „Objekt öffnen" in eine eigene Zeile, sonst bliebe für den Text kaum Breite. */}
                <div className="flex flex-wrap gap-3 p-3 sm:flex-nowrap">
                  {rahmenVorhanden && (
                    <ScoreRing score={scoreJeObjekt?.get(e.objektId) ?? { wert: null, keinScore: passt ? "belastung_fehlt" : "ausserhalb_rahmen" }} className="self-center" />
                  )}
                  <Vorschaubild url={e.bildUrl} alt={e.titel} className="h-16 w-24 sm:h-24 sm:w-36" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="text-sm font-bold leading-tight">{e.titel || "Objekt"}</h3>
                      {e.global && <Badge variant="outline" className="text-[10px]">Gesamtobjekt</Badge>}
                      {passt && (
                        <Badge className="bg-primary/10 text-[10px] text-primary hover:bg-primary/10">
                          {e.global ? "passt in den Rahmen" : `${e.anzahlPassend} passend`}
                        </Badge>
                      )}
                    </div>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{[`${e.plz} ${e.ort}`.trim(), e.adresse].filter(Boolean).join(", ")}</span>
                    </p>
                    {/* Immer da, nicht nur bei „Sortieren nach Entfernung"; leer nur ohne Wohnort, dann steht der Grund oben. */}
                    {entfernung && (
                      <p
                        data-testid={`objektauswahl-entfernung-${e.objektId}`}
                        className={cn(
                          "flex items-center gap-1 text-xs",
                          e.entfernungKm === null ? "text-muted-foreground" : "font-medium text-foreground",
                        )}
                      >
                        <Route className={cn("h-3 w-3 shrink-0", e.entfernungKm !== null && "text-primary")} />
                        <span className="truncate">{entfernung}</span>
                      </p>
                    )}
                    <p className="text-sm font-bold">{spanneText(e.preisVon, e.preisBis) || "Preis fehlt"}</p>
                  </div>
                  <div className="flex w-full shrink-0 justify-end sm:w-auto sm:flex-col sm:items-end sm:justify-between">
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => onNavigate(objektOeffnenLink(e.objekt, bezug))}>
                      <Eye className="h-3.5 w-3.5" /> Objekt öffnen
                    </Button>
                  </div>
                </div>

                {globalKandidat ? (
                  <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                    Wird als Ganzes verkauft. Kaufpreis {eur0(globalKandidat.kaufpreis)}, gesamt mit Nebenkosten {eur0(globalKandidat.gesamtkosten)}.
                  </div>
                ) : (
                  <div className="border-t">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                      aria-expanded={offenZeile}
                      onClick={() => umschalten(e.objektId)}
                    >
                      {offenZeile ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {e.einheiten.length} freie {e.einheiten.length === 1 ? "Einheit" : "Einheiten"}
                      {rahmenVorhanden && <span className="ml-auto text-primary">{e.anzahlPassend} passend</span>}
                    </button>
                    {offenZeile && (
                      <div className="overflow-x-auto px-3 pb-3">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {rahmenVorhanden && <TableHead className="text-xs">Score</TableHead>}
                              <TableHead className="text-xs">WE</TableHead>
                              <TableHead className="text-xs">Etage</TableHead>
                              <TableHead className="text-right text-xs">Zimmer</TableHead>
                              <TableHead className="text-right text-xs">Fläche</TableHead>
                              <TableHead className="text-right text-xs">Kaufpreis</TableHead>
                              <TableHead className="text-right text-xs">Gesamt</TableHead>
                              <TableHead className="text-right text-xs">Kaltmiete</TableHead>
                              <TableHead className="text-right text-xs">Rendite</TableHead>
                              <TableHead className="text-xs">Rahmen</TableHead>
                              <TableHead />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {e.einheiten.map((k) => (
                              <TableRow key={k.schluessel} data-testid={`objektauswahl-einheit-${k.schluessel}`} className={k.passt ? "bg-primary/5" : undefined}>
                                {rahmenVorhanden && (
                                  <TableCell className="py-1">
                                    <ScoreRing klein score={scores?.get(k.schluessel) ?? { wert: null, keinScore: k.passt ? "belastung_fehlt" : "ausserhalb_rahmen" }} />
                                  </TableCell>
                                )}
                                <TableCell className="whitespace-nowrap text-xs font-medium">{weNrAnzeige(k.weNr)}</TableCell>
                                <TableCell className="whitespace-nowrap text-xs">{k.etage || ""}</TableCell>
                                <TableCell className="text-right text-xs">{k.zimmer || ""}</TableCell>
                                <TableCell className="whitespace-nowrap text-right text-xs">{k.groesse > 0 ? `${dez(k.groesse, 1)} m²` : ""}</TableCell>
                                <TableCell className="whitespace-nowrap text-right text-xs font-semibold">{k.kaufpreis > 0 ? eur0(k.kaufpreis) : "fehlt"}</TableCell>
                                <TableCell className="whitespace-nowrap text-right text-xs">{k.gesamtkosten > 0 ? eur0(k.gesamtkosten) : ""}</TableCell>
                                <TableCell className="whitespace-nowrap text-right text-xs">{k.kaltmiete > 0 ? eur0(k.kaltmiete) : ""}</TableCell>
                                <TableCell className="whitespace-nowrap text-right text-xs">{k.rendite > 0 ? prozent(k.rendite, 2) : ""}</TableCell>
                                <TableCell className="whitespace-nowrap text-xs">
                                  {!rahmenVorhanden ? "" : k.passt
                                    ? <span className="font-medium text-[hsl(var(--success))]">passt</span>
                                    : <span className="text-muted-foreground">passt nicht</span>}
                                  {k.vorgemerktFuerKunde && <Badge variant="outline" className="ml-1 text-[10px]">vorgemerkt</Badge>}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1 text-xs"
                                    onClick={() => onNavigate(einheitOeffnenLink(k.objektId, k.wohnungId as string, bezug))}
                                  >
                                    <Eye className="h-3 w-3" /> Einheit öffnen
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
