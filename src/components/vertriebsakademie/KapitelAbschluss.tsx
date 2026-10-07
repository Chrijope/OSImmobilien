// Der Übergang von einem Kapitel ins nächste.
//
// Bisher endete ein Kapitel mit dem Abschlusstest und zwei Pfeilknöpfen. Was
// jemand gerade gelernt hat und warum das nächste Kapitel darauf aufbaut,
// stand nirgends. Genau dort bricht das Durcharbeiten ab.
//
// Diese Karte beantwortet drei Fragen, in dieser Reihenfolge:
//   1. Was habe ich gerade geschafft?   (nur echte, gezählte Zahlen)
//   2. Was kommt als Nächstes?          (Nummer, Titel, Lernziel)
//   3. Warum lohnt sich das?            (das `ziel`-Feld des nächsten Kapitels)
//
// Kein Lob auf Vorrat: Ist das Kapitel noch nicht durch, steht hier, was
// konkret offen ist, und nicht, wie stark man schon war.

import { AkademieLink as Link } from "@/components/vertriebsakademie/AkademieLink";
import { ArrowRight, BookOpen, CheckCircle2, ListChecks, Target, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AkademieKapitel } from "@/lib/vertriebsakademieContent";
import type { GlobalStats, KapitelStats } from "@/lib/vertriebsakademieProgress";
import type { AkademieZielgruppe } from "@/lib/vertriebsakademieZielgruppe";

interface Props {
  kap: AkademieKapitel;
  stats: KapitelStats;
  gesamt: GlobalStats;
  next?: AkademieKapitel;
  kapitelDone: boolean;
  /** Abschlusstest bestanden? `undefined`, wenn das Kapitel keinen hat. */
  testBestanden?: boolean;
  zielgruppe: AkademieZielgruppe;
}

export function KapitelAbschluss({
  kap, stats, gesamt, next, kapitelDone, testBestanden, zielgruppe,
}: Props) {
  // Der Profi will durch. Er bekommt den nächsten Schritt und dessen Ziel,
  // aber keine Aufzählung dessen, was er gerade gemacht hat.
  const kompakt = zielgruppe === "profi";

  const offen = [
    stats.doneLektionen < stats.totalLektionen
      ? `${stats.totalLektionen - stats.doneLektionen} von ${stats.totalLektionen} Lektionen`
      : null,
    stats.totalAufgaben > stats.doneAufgaben
      ? `${stats.totalAufgaben - stats.doneAufgaben} von ${stats.totalAufgaben} Aufgaben`
      : null,
    testBestanden === false ? "der Abschlusstest" : null,
  ].filter(Boolean) as string[];

  const geschafft = [
    stats.totalLektionen > 0 ? `${stats.doneLektionen} von ${stats.totalLektionen} Lektionen` : null,
    stats.totalAufgaben > 0 ? `${stats.doneAufgaben} von ${stats.totalAufgaben} Aufgaben gelöst` : null,
    testBestanden ? "Abschlusstest bestanden" : null,
  ].filter(Boolean) as string[];

  return (
    <Card className="p-5 border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <div className="grid gap-5 md:grid-cols-2">
        {/* Links: der Stand. */}
        <div className="min-w-0">
          {kapitelDone ? (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Trophy className="h-4 w-4 text-emerald-600 shrink-0" />
                Kapitel {kap.nummer} steht
              </div>
              {!kompakt && kap.ziel && (
                <p className="mt-2 text-sm text-foreground/90 leading-relaxed">
                  <span className="font-medium">Das kannst du jetzt: </span>
                  {kap.ziel}
                </p>
              )}
              {!kompakt && geschafft.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {geschafft.map((g) => (
                    <li key={g} className="flex items-start gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-px" />
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                {gesamt.doneKapitel} von {gesamt.totalKapitel} Kapiteln durch
                {gesamt.doneKapitel < gesamt.totalKapitel &&
                  `, noch ${gesamt.totalKapitel - gesamt.doneKapitel} vor dir`}
                .
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ListChecks className="h-4 w-4 text-primary shrink-0" />
                {offen.length > 0 ? "In diesem Kapitel ist noch offen" : "Du bist durch das Kapitel"}
              </div>
              {offen.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-foreground/90">
                  {offen.map((o) => (
                    <li key={o} className="flex items-start gap-1.5">
                      <span className="text-primary mt-1">•</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-foreground/90">
                  Alles bearbeitet. Setze oben den Haken, dann zählt das Kapitel als abgeschlossen.
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Kapitel {kap.nummer} ist zu {stats.pct} Prozent bearbeitet.
              </p>
            </>
          )}
        </div>

        {/* Rechts: der nächste Schritt. */}
        <div className="min-w-0 md:border-l md:border-border/70 md:pl-5">
          {next ? (
            <>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Als Nächstes
              </div>
              <div className="mt-1 text-base font-semibold leading-snug">
                Kapitel {next.nummer}: {next.titel}
              </div>
              {next.ziel ? (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-foreground/90 leading-relaxed">
                  <Target className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>{next.ziel}</span>
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{next.teaser}</p>
              )}
              <Button asChild className="mt-4 gap-1.5">
                <Link to={`/vertriebsakademie/${next.slug}`}>
                  Kapitel {next.nummer} öffnen <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Das war das letzte Kapitel
              </div>
              <p className="mt-2 text-sm text-foreground/90 leading-relaxed">
                Ab hier sind die Kapitel dein Nachschlagewerk. Im Übungsplatz halten dich
                Tagesimpuls und Karteikarten in Übung, ohne dass du ein Kapitel neu lesen musst.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild className="gap-1.5">
                  <Link to="/vertriebsakademie/training">
                    Zum Übungsplatz <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="gap-1.5">
                  <Link to="/vertriebsakademie">
                    <BookOpen className="h-4 w-4" /> Zur Übersicht
                  </Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
