import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AkademieQuizAufgabe } from "@/lib/vertriebsakademieContent";
import { AufgabenRahmen, AufgabenRueckmeldung } from "./AufgabenRahmen";
import { mischeAntworten, quote } from "./AufgabenHelfer";

interface Props {
  aufgabe: AkademieQuizAufgabe;
  geloest: boolean;
  versuche: number;
  /** Vergebene Punkte, nur zur Anzeige im Rahmen. */
  punkte?: number;
  onFertig: (korrekt: boolean) => void;
  onSprung?: (abschnittId: string) => void;
}

/**
 * Multiple Choice mit Auflösung.
 *
 * Zwei Härtegrade, gesteuert über den Inhalt statt über Code:
 *  - Quereinsteiger: drei Optionen, Auflösung sofort nach jeder Frage.
 *  - Profi: vier Optionen, `aufloesungAmEnde`, optional mit Zeitlimit.
 *
 * Die Auflösung ist der eigentliche Zweck. Wer falsch liegt, bekommt nicht nur
 * die richtige Antwort, sondern den Sprung zurück in den Abschnitt.
 */
export function AkademieQuiz({ aufgabe, geloest, versuche, punkte, onFertig, onSprung }: Props) {
  // Antworten mischen, wie im Abschlusstest. Ungemischt war in 276 von 369
  // Abschnittsfragen die zweite Option die richtige.
  const fragen = useMemo(() => aufgabe.fragen.map(mischeAntworten), [aufgabe.fragen]);
  const sofort = !aufgabe.aufloesungAmEnde;

  const [index, setIndex] = useState(0);
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const [antworten, setAntworten] = useState<number[]>([]);
  const [fertig, setFertig] = useState(false);
  // Die Uhr laeuft erst, wenn der Partner die erste Antwort anfasst. Vorher lief
  // sie ab dem Aufklappen des Abschnitts. Wer den Abschnitt nur zum Lesen offen
  // liess, bekam nach Ablauf ungefragt einen Fehlversuch gebucht und musste die
  // Aufgabe neu starten, obwohl er sie nie begonnen hatte.
  const [restSek, setRestSek] = useState<number | null>(null);

  const aktuelle = fragen[index];
  const richtigeAnzahl = useMemo(
    () => antworten.reduce((n, a, i) => n + (a === fragen[i]?.korrekt ? 1 : 0), 0),
    [antworten, fragen],
  );

  // Der Rueckruf steht in einer Ref und ist keine Abhaengigkeit des Effekts.
  // AkademieAufgabenBlock baut onFertig als Pfeilfunktion im JSX, er hat also
  // bei jedem Rendern eine neue Identitaet. Hing der Zeitlimit-Effekt an dieser
  // Identitaet, drehte sich das Ganze im Kreis: Der Effekt meldete das Ergebnis,
  // der Fortschrittsspeicher meldete die Aenderung, es wurde neu gerendert, der
  // Rueckruf war neu, der Effekt lief wieder. React meldete das im Browser als
  // "Minified React error #185", also "Maximum update depth exceeded", und die
  // Fehlerseite loeste das ganze Kapitel ab. Nicht zurueckbauen.
  const onFertigRef = useRef(onFertig);
  onFertigRef.current = onFertig;

  // Zeitlimit: laeuft nur, solange die Aufgabe offen ist.
  useEffect(() => {
    if (restSek === null || fertig) return;
    if (restSek <= 0) {
      setFertig(true);
      onFertigRef.current(false);
      return;
    }
    const t = setTimeout(() => setRestSek((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [restSek, fertig]);

  /** Startet die Uhr beim ersten Antippen einer Antwort, danach nie wieder. */
  function waehle(i: number) {
    setGewaehlt(i);
    if (aufgabe.zeitlimitSek && restSek === null) setRestSek(aufgabe.zeitlimitSek);
  }

  function abschliessen(alleAntworten: number[]) {
    const richtig = alleAntworten.reduce((n, a, i) => n + (a === fragen[i]?.korrekt ? 1 : 0), 0);
    setFertig(true);
    onFertig(richtig === fragen.length);
  }

  function bestaetigen() {
    if (gewaehlt === null) return;
    const naechste = [...antworten, gewaehlt];
    setAntworten(naechste);
    if (index + 1 >= fragen.length) {
      abschliessen(naechste);
    } else if (!sofort) {
      setIndex(index + 1);
      setGewaehlt(null);
    }
  }

  function weiter() {
    setIndex(index + 1);
    setGewaehlt(null);
  }

  function neuStarten() {
    setIndex(0);
    setGewaehlt(null);
    setAntworten([]);
    setFertig(false);
    setRestSek(null);
  }

  const zeigeSofortAufloesung = sofort && antworten.length > index;
  // Vor dem Start zeigt die Anzeige das volle Limit, damit sichtbar bleibt, dass
  // die Aufgabe eine Uhr hat.
  const angezeigteRestSek = fertig ? null : restSek ?? aufgabe.zeitlimitSek ?? null;

  return (
    <AufgabenRahmen
      titel={aufgabe.titel}
      hinweis={aufgabe.hinweis}
      typLabel={fragen.length > 1 ? `Quiz · ${fragen.length} Fragen` : "Quiz"}
      geloest={geloest}
      versuche={versuche}
      punkte={punkte}
      restSekunden={angezeigteRestSek}
      onNeuStarten={fertig ? neuStarten : undefined}
    >
      {fertig ? (
        <div className="space-y-3">
          <AufgabenRueckmeldung
            korrekt={richtigeAnzahl === fragen.length}
            text={
              fragen.length === 1
                ? (richtigeAnzahl === 1 ? "Die Begründung steht unten." : "Sieh dir die Auflösung an.")
                : `${richtigeAnzahl} von ${fragen.length} richtig, das sind ${quote(richtigeAnzahl, fragen.length)} Prozent.`
            }
          />
          <div className="space-y-2">
            {fragen.map((f, i) => {
              const a = antworten[i];
              const ok = a === f.korrekt;
              return (
                <div key={i} className="rounded-lg border p-3 text-xs space-y-1">
                  <div className="font-medium text-foreground">{f.frage}</div>
                  <div className={ok ? "text-emerald-600" : "text-rose-600"}>
                    Deine Antwort: {a === undefined ? "keine" : f.optionen[a]}
                  </div>
                  {!ok && <div className="text-emerald-600">Richtig: {f.optionen[f.korrekt]}</div>}
                  <div className="text-muted-foreground">{f.aufloesung}</div>
                  {f.sprungZuAbschnitt && onSprung && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs gap-1"
                      onClick={() => onSprung(f.sprungZuAbschnitt!)}
                    >
                      <CornerDownRight className="h-3 w-3" /> Zur Stelle im Kapitel
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {fragen.length > 1 && (
            <div className="text-[11px] text-muted-foreground">
              Frage {index + 1} von {fragen.length}
            </div>
          )}
          <div className="text-sm font-medium">{aktuelle.frage}</div>
          <div className="grid gap-2">
            {aktuelle.optionen.map((opt, i) => {
              const istGewaehlt = gewaehlt === i;
              const aufgeloest = zeigeSofortAufloesung;
              const istRichtig = i === aktuelle.korrekt;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={aufgeloest}
                  onClick={() => waehle(i)}
                  className={cn(
                    "text-left text-sm rounded-lg border px-3 py-2 transition-colors",
                    !aufgeloest && istGewaehlt && "border-primary bg-primary/5",
                    !aufgeloest && !istGewaehlt && "hover:bg-muted/50",
                    aufgeloest && istRichtig && "border-emerald-500/50 bg-emerald-500/5",
                    aufgeloest && !istRichtig && istGewaehlt && "border-rose-500/50 bg-rose-500/5",
                    aufgeloest && !istRichtig && !istGewaehlt && "opacity-60",
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {zeigeSofortAufloesung && (
            <AufgabenRueckmeldung
              korrekt={antworten[index] === aktuelle.korrekt}
              text={aktuelle.aufloesung}
              kinder={
                aktuelle.sprungZuAbschnitt && onSprung ? (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs gap-1"
                    onClick={() => onSprung(aktuelle.sprungZuAbschnitt!)}
                  >
                    <CornerDownRight className="h-3 w-3" /> Zur Stelle im Kapitel
                  </Button>
                ) : undefined
              }
            />
          )}

          <div className="flex justify-end">
            {zeigeSofortAufloesung ? (
              index + 1 < fragen.length ? (
                <Button size="sm" className="gap-1" onClick={weiter}>
                  Nächste Frage <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button size="sm" onClick={() => abschliessen(antworten)}>
                  Ergebnis ansehen
                </Button>
              )
            ) : (
              <Button size="sm" disabled={gewaehlt === null} onClick={bestaetigen}>
                {index + 1 < fragen.length ? "Antworten" : "Auswerten"}
              </Button>
            )}
          </div>
        </div>
      )}
    </AufgabenRahmen>
  );
}
