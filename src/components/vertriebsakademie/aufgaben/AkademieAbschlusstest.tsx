import { useMemo, useState } from "react";
import { Award, CornerDownRight, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AkademieKapitel } from "@/lib/vertriebsakademieContent";
import { useVaProgress, vaProgress } from "@/lib/vertriebsakademieProgress";
import { useZielgruppe } from "@/lib/vertriebsakademieZielgruppe";
import { mischeAntworten, mischeMitSaat, quote } from "./AufgabenHelfer";

interface Props {
  kap: AkademieKapitel;
  onSprung?: (abschnittId: string) => void;
}

/**
 * Abschlusstest eines Kapitels.
 *
 * Er sperrt nichts. Alle Kapitel bleiben jederzeit zugänglich, der Test
 * qualifiziert nur den Abschluss.
 *
 * Im Profi-Pfad ist er zusätzlich ein Freitest: Wer besteht, schließt das
 * Kapitel ab, ohne es gelesen zu haben. Wer nicht besteht, sieht genau die
 * Abschnitte, aus denen die falschen Antworten stammen.
 */
export function AkademieAbschlusstest({ kap, onSprung }: Props) {
  const test = kap.abschlusstest;
  const state = useVaProgress();
  const [zielgruppe] = useZielgruppe();
  const [gestartet, setGestartet] = useState(false);
  const [index, setIndex] = useState(0);
  const [antworten, setAntworten] = useState<number[]>([]);
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const [fertig, setFertig] = useState(false);

  // Gemischt werden die Fragen und die Antworten, siehe mischeAntworten.
  const fragen = useMemo(() => {
    if (!test) return [];
    const gemischt = mischeMitSaat(test.fragen, kap.slug);
    const gewaehlte = test.anzahl ? gemischt.slice(0, test.anzahl) : gemischt;
    return gewaehlte.map(mischeAntworten);
  }, [test, kap.slug]);

  if (!test || fragen.length === 0) return null;

  const testId = `abschlusstest-${kap.slug}`;
  const ergebnis = state.aufgaben[`${kap.slug}::${testId}`];
  const bestanden = !!ergebnis?.geloest;
  const quoteNoetig = test.bestehensquote ?? 70;
  const istFreitest = zielgruppe === "profi";

  const richtig = antworten.reduce((n, a, i) => n + (a === fragen[i]?.korrekt ? 1 : 0), 0);
  const erreicht = quote(richtig, fragen.length);

  function antworten_bestaetigen() {
    if (gewaehlt === null) return;
    const naechste = [...antworten, gewaehlt];
    setAntworten(naechste);
    setGewaehlt(null);
    if (index + 1 >= fragen.length) {
      const r = naechste.reduce((n, a, i) => n + (a === fragen[i]?.korrekt ? 1 : 0), 0);
      const geschafft = quote(r, fragen.length) >= quoteNoetig;
      setFertig(true);
      vaProgress.setAufgabe(kap.slug, testId, geschafft, 30);
      if (geschafft && istFreitest) vaProgress.setKapitelDone(kap.slug, true);
    } else {
      setIndex(index + 1);
    }
  }

  function neuStarten() {
    setIndex(0);
    setAntworten([]);
    setGewaehlt(null);
    setFertig(false);
    setGestartet(true);
  }

  const aktuelle = fragen[index];

  return (
    <Card
      className={cn(
        "p-5 space-y-4",
        bestanden && "border-emerald-500/40 bg-emerald-500/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn("p-2 rounded-lg shrink-0", bestanden ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/10 text-primary")}>
            {bestanden ? <Award className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-tight">
              {istFreitest ? "Freitest" : "Abschlusstest"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fragen.length} Fragen, bestanden ab {quoteNoetig} Prozent.{" "}
              {istFreitest
                ? "Bestehst du, gilt das Kapitel als abgeschlossen, auch ohne es zu lesen."
                : "Der Test sperrt nichts, er zeigt dir nur, was schon sitzt."}
            </p>
          </div>
        </div>
        {bestanden && (
          <span className="text-xs font-medium text-emerald-600 shrink-0">bestanden</span>
        )}
      </div>

      {!gestartet && !fertig && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setGestartet(true)}>
            {bestanden ? "Noch einmal antreten" : istFreitest ? "Freitest starten" : "Test starten"}
          </Button>
        </div>
      )}

      {gestartet && !fertig && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Frage {index + 1} von {fragen.length}</span>
            <span>keine Auflösung zwischendurch</span>
          </div>
          <div className="text-sm font-medium">{aktuelle.frage}</div>
          <div className="grid gap-2">
            {aktuelle.optionen.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setGewaehlt(i)}
                className={cn(
                  "text-left text-sm rounded-lg border px-3 py-2 transition-colors",
                  gewaehlt === i ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                )}
              >
                {opt}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={gewaehlt === null} onClick={antworten_bestaetigen}>
              {index + 1 < fragen.length ? "Weiter" : "Auswerten"}
            </Button>
          </div>
        </div>
      )}

      {fertig && (
        <div className="space-y-3">
          <div
            className={cn(
              "rounded-lg border p-3 text-sm",
              erreicht >= quoteNoetig
                ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400",
            )}
          >
            <div className="font-semibold">
              {richtig} von {fragen.length} richtig, {erreicht} Prozent.
            </div>
            <div className="text-foreground/90 mt-0.5">
              {erreicht >= quoteNoetig
                ? istFreitest
                  ? "Bestanden. Das Kapitel ist damit abgeschlossen."
                  : "Bestanden."
                : "Noch nicht bestanden. Die Abschnitte zu deinen Fehlern stehen unten."}
            </div>
          </div>

          {erreicht < quoteNoetig && (
            <div className="space-y-2">
              {fragen.map((f, i) =>
                antworten[i] === f.korrekt ? null : (
                  <div key={i} className="rounded-lg border p-3 text-xs space-y-1">
                    <div className="font-medium">{f.frage}</div>
                    <div className="text-emerald-600">Richtig: {f.optionen[f.korrekt]}</div>
                    <div className="text-muted-foreground">{f.aufloesung}</div>
                    {f.sprungZuAbschnitt && onSprung && (
                      <Button
                        variant="link" size="sm" className="h-auto p-0 text-xs gap-1"
                        onClick={() => onSprung(f.sprungZuAbschnitt!)}
                      >
                        <CornerDownRight className="h-3 w-3" /> Zur Stelle im Kapitel
                      </Button>
                    )}
                  </div>
                ),
              )}
            </div>
          )}

          <Button variant="ghost" size="sm" className="gap-1" onClick={neuStarten}>
            <RotateCcw className="h-3.5 w-3.5" /> Noch einmal
          </Button>
        </div>
      )}
    </Card>
  );
}
