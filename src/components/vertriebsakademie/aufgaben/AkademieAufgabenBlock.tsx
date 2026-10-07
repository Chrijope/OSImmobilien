import { ListChecks } from "lucide-react";
import type { AkademieAufgabe } from "@/lib/vertriebsakademieContent";
import type { AkademieWahrFalschAufgabe } from "@/lib/vertriebsakademieAufgabenTypen";
import { useVaProgress, vaProgress, PUNKTE_STANDARD } from "@/lib/vertriebsakademieProgress";
import { AkademieQuiz } from "./AkademieQuiz";
import { AkademieSortieren } from "./AkademieSortieren";
import { AkademieZuordnen } from "./AkademieZuordnen";
import { AkademieRechenuebung } from "./AkademieRechenuebung";
import { AkademieSzenario } from "./AkademieSzenario";
import { AkademieWahrFalsch } from "./AkademieWahrFalsch";

/**
 * Der Wisch-Stapel hängt noch nicht an der Union in der Inhaltsdatei, die
 * wird gerade getrennt überarbeitet. Bis dahin nimmt der Block ihn strukturell
 * an, damit die Komponente schon verdrahtet und geprüft ist.
 */
type BlockAufgabe = AkademieAufgabe | AkademieWahrFalschAufgabe;

interface Props {
  slug: string;
  aufgaben: BlockAufgabe[];
  onSprung?: (abschnittId: string) => void;
}

/**
 * Rendert die prüfbaren Aufgaben eines Abschnitts und schreibt die Ergebnisse
 * in den Fortschritt. Die Auswertung passiert in den einzelnen Komponenten,
 * hier läuft nur die Verteilung nach Typ und die Speicherung.
 */
export function AkademieAufgabenBlock({ slug, aufgaben, onSprung }: Props) {
  const state = useVaProgress();
  if (!aufgaben.length) return null;

  const geloestAnzahl = aufgaben.filter((a) => state.aufgaben[`${slug}::${a.id}`]?.geloest).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          {aufgaben.length === 1 ? "Aufgabe" : "Aufgaben"}
        </span>
        {aufgaben.length > 1 && (
          <span className="text-xs font-normal tabular-nums text-muted-foreground">
            {geloestAnzahl} von {aufgaben.length} gelöst
          </span>
        )}
      </div>

      {aufgaben.map((a) => {
        const ergebnis = state.aufgaben[`${slug}::${a.id}`];
        const gemeinsam = {
          geloest: !!ergebnis?.geloest,
          versuche: ergebnis?.versuche ?? 0,
          punkte: ergebnis?.punkte,
          onFertig: (korrekt: boolean) =>
            vaProgress.setAufgabe(slug, a.id, korrekt, a.punkte ?? PUNKTE_STANDARD),
        };

        switch (a.typ) {
          case "quiz":
            return <AkademieQuiz key={a.id} aufgabe={a} {...gemeinsam} onSprung={onSprung} />;
          case "sortieren":
            return <AkademieSortieren key={a.id} aufgabe={a} {...gemeinsam} />;
          case "zuordnen":
            return <AkademieZuordnen key={a.id} aufgabe={a} {...gemeinsam} />;
          case "rechnen":
            return <AkademieRechenuebung key={a.id} aufgabe={a} {...gemeinsam} />;
          case "szenario":
            return <AkademieSzenario key={a.id} aufgabe={a} {...gemeinsam} />;
          case "wahrfalsch":
            return <AkademieWahrFalsch key={a.id} aufgabe={a} {...gemeinsam} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
