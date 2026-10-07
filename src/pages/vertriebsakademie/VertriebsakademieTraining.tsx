import "@/styles/akademie-neu.css";
import { useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import { AkademieLink as Link } from "@/components/vertriebsakademie/AkademieLink";
import {
  ArrowLeft, ArrowRight, Eye, Layers, Lightbulb, RotateCcw, Sparkles, Zap,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useZielgruppe } from "@/lib/vertriebsakademieZielgruppe";
import { useVaProgress, vaProgress, PUNKTE_STANDARD } from "@/lib/vertriebsakademieProgress";
import {
  alleKarteikarten, profiImpulsDerWoche, tagesimpuls, tagesnummer, waehleFuerSaat,
} from "@/lib/vertriebsakademieTraining";
import { istFaellig, sicherheit, useVaKarten, vaKarten } from "@/lib/vertriebsakademieKarten";
import { AkademieQuiz } from "@/components/vertriebsakademie/aufgaben/AkademieQuiz";
import { AkademieZuordnen } from "@/components/vertriebsakademie/aufgaben/AkademieZuordnen";
import { AkademieRechenuebung } from "@/components/vertriebsakademie/aufgaben/AkademieRechenuebung";

/**
 * Übungsplatz der Akademie.
 *
 * Drei Dinge, die außerhalb der Kapitel liegen, weil man sie nicht einmal
 * durcharbeitet, sondern regelmäßig benutzt: der Tagesimpuls, die Karteikarten
 * und im Profi-Pfad der Impuls der Woche.
 */
export default function VertriebsakademieTraining() {
  const neueAnsicht = useLocation().pathname.startsWith("/vertriebsakademie");
  const [zielgruppe] = useZielgruppe();
  const heute = tagesnummer();

  return (
    <DashboardLayout>
      <div className={neueAnsicht ? "an-root an-neben space-y-6" : "w-full space-y-6"}>
        {/*
          Der Rückweg steht oben links, über der Überschrift.

          Christian am 22.09.2026: Rechts neben der Überschrift wird er
          schlecht gefunden. Der Rückweg liegt im ganzen System an derselben
          Stelle, hier also genauso wie im Ablaufplan, in der
          Einwandbibliothek und in der Kapitelansicht der Akademie.
        */}
        <Button variant="ghost" size="sm" asChild className="gap-1 -ml-2">
          <Link to="/vertriebsakademie">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Vertriebsakademie
          </Link>
        </Button>

        <PageHeader
          title="Übungsplatz"
          subtitle="Drei Minuten am Tag halten mehr als ein Nachmittag im Monat."
        />

        {zielgruppe === "profi" && <ImpulsDerWoche />}

        <Tabs defaultValue="tag" className="w-full">
          <TabsList>
            <TabsTrigger value="tag" className="gap-1">
              <Zap className="h-3.5 w-3.5" /> Tagesimpuls
            </TabsTrigger>
            <TabsTrigger value="karten" className="gap-1">
              <Layers className="h-3.5 w-3.5" /> Karteikarten
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tag" className="mt-4">
            <Tagesimpuls zielgruppe={zielgruppe} />
          </TabsContent>

          <TabsContent value="karten" className="mt-4">
            <Karteikarten heute={heute} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ── Impuls der Woche ──────────────────────────────────────────────────────

function ImpulsDerWoche() {
  const impuls = useMemo(() => profiImpulsDerWoche(), []);
  if (!impuls) return null;
  return (
    <Card className="p-5 border-amber-500/30 bg-amber-500/5">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/15 text-amber-600 shrink-0">
          <Lightbulb className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">Profi-Impuls der Woche</h3>
            <span className="text-[11px] text-muted-foreground">
              Kapitel {impuls.kapitelNummer}, {impuls.abschnitt}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-foreground/90">{impuls.text}</p>
          <Button asChild variant="link" size="sm" className="h-auto p-0 mt-2 text-xs gap-1">
            <Link to={`/vertriebsakademie/${impuls.slug}?vaScrollTo=${impuls.abschnittId}`}>
              Zum Abschnitt <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ── Tagesimpuls ───────────────────────────────────────────────────────────

function Tagesimpuls({ zielgruppe }: { zielgruppe: "alle" | "quereinsteiger" | "profi" }) {
  const state = useVaProgress();
  const aufgaben = useMemo(() => tagesimpuls(zielgruppe), [zielgruppe]);

  if (!aufgaben.length) {
    return (
      <Card className="p-5 text-sm text-muted-foreground">
        Für deinen Lernpfad liegen noch keine Aufgaben vor.
      </Card>
    );
  }

  const geloest = aufgaben.filter(
    (x) => state.aufgaben[`${x.slug}::${x.aufgabe.id}`]?.geloest,
  ).length;

  return (
    <div className="space-y-3">
      <Card className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>
            Drei Aufgaben aus verschiedenen Kapiteln, jeden Tag neu gemischt.
          </span>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground shrink-0">
          {geloest} von {aufgaben.length}
        </span>
      </Card>

      {aufgaben.map(({ slug, kapitelTitel, aufgabe }) => {
        const e = state.aufgaben[`${slug}::${aufgabe.id}`];
        const gemeinsam = {
          geloest: !!e?.geloest,
          versuche: e?.versuche ?? 0,
          onFertig: (korrekt: boolean) =>
            vaProgress.setAufgabe(slug, aufgabe.id, korrekt, aufgabe.punkte ?? PUNKTE_STANDARD),
        };
        return (
          <div key={`${slug}-${aufgabe.id}`} className="space-y-1">
            <div className="text-[11px] text-muted-foreground pl-1">{kapitelTitel}</div>
            {aufgabe.typ === "quiz" && <AkademieQuiz aufgabe={aufgabe} {...gemeinsam} />}
            {aufgabe.typ === "zuordnen" && <AkademieZuordnen aufgabe={aufgabe} {...gemeinsam} />}
            {aufgabe.typ === "rechnen" && <AkademieRechenuebung aufgabe={aufgabe} {...gemeinsam} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Karteikarten ──────────────────────────────────────────────────────────

const KARTEN_PRO_TAG = 5;

function Karteikarten({ heute }: { heute: number }) {
  const stand = useVaKarten();
  const alle = useMemo(() => alleKarteikarten(), []);
  const [index, setIndex] = useState(0);
  const [gedreht, setGedreht] = useState(false);

  const faellig = useMemo(() => {
    const offen = alle.filter((k) => istFaellig(stand[k.id], heute));
    return waehleFuerSaat(offen, KARTEN_PRO_TAG, heute);
    // Absichtlich nur beim Tageswechsel neu, nicht bei jeder Bewertung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alle, heute]);

  const karte = faellig[index];
  const fertig = index >= faellig.length;

  function bewerten(gewusst: boolean) {
    if (!karte) return;
    vaKarten.bewerten(karte.id, gewusst, heute);
    setGedreht(false);
    setIndex((i) => i + 1);
  }

  const gelernt = alle.filter((k) => (stand[k.id]?.stufe ?? 0) > 0).length;

  if (!alle.length) {
    return <Card className="p-5 text-sm text-muted-foreground">Keine Karten vorhanden.</Card>;
  }

  return (
    <div className="space-y-3">
      <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          {alle.length} Karten aus Lexikon und Zahlenkapitel, {gelernt} davon schon angefasst.
        </div>
        <Button
          variant="ghost" size="sm" className="h-7 gap-1 text-xs"
          onClick={() => { vaKarten.zuruecksetzen(); setIndex(0); setGedreht(false); }}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Fortschritt zurücksetzen
        </Button>
      </Card>

      {fertig ? (
        <Card className="p-6 text-center space-y-2">
          <div className="text-sm font-semibold">Für heute durch.</div>
          <p className="text-xs text-muted-foreground">
            Die Karten, die du nicht wusstest, kommen morgen wieder. Die sicheren erst deutlich später.
          </p>
        </Card>
      ) : (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Karte {index + 1} von {faellig.length}</span>
            <span>
              {karte.quelle === "zahlen" ? "Zahl aus dem Glossarkapitel" : "Begriff aus dem Lexikon"}
              {stand[karte.id] ? `, ${sicherheit(stand[karte.id])} Prozent sicher` : ", neu"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setGedreht((g) => !g)}
            className={cn(
              "w-full min-h-[140px] rounded-xl border-2 p-6 text-center transition-colors",
              gedreht ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40",
            )}
          >
            <div className="text-base font-semibold">{karte.vorderseite}</div>
            {gedreht ? (
              <div className="mt-3 text-sm text-foreground/90">{karte.rueckseite}</div>
            ) : (
              <div className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Eye className="h-3.5 w-3.5" /> antippen zum Umdrehen
              </div>
            )}
          </button>

          {gedreht && (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => bewerten(false)}>
                Noch nicht sicher
              </Button>
              <Button className="flex-1" onClick={() => bewerten(true)}>
                Gewusst
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
