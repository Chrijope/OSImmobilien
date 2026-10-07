import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AkademieRechenAufgabe } from "@/lib/vertriebsakademieContent";
import { Beispielrechnung } from "@/components/vertriebsakademie/AkademieVisuals";
import { AufgabenRahmen, AufgabenRueckmeldung } from "./AufgabenRahmen";
import { imZielbereich, parseZahl } from "./AufgabenHelfer";

interface Props {
  aufgabe: AkademieRechenAufgabe;
  geloest: boolean;
  versuche: number;
  /** Vergebene Punkte, nur zur Anzeige im Rahmen. */
  punkte?: number;
  onFertig: (korrekt: boolean) => void;
}

function formatiere(wert: number, einheit?: string): string {
  const zahl = wert.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  return einheit ? `${zahl} ${einheit}` : zahl;
}

/**
 * Rechenaufgabe mit Zielwert und Toleranz.
 *
 * Geprüft wird numerisch, nicht auf Zeichenketten, damit "3,6", "3.6" und
 * "3,60 %" gleich behandelt werden. Die Toleranz liegt standardmäßig bei einem
 * Prozent, weil Partner unterwegs runden.
 *
 * Der Unterschied zwischen den Pfaden: Für Quereinsteiger ist der Rechenweg
 * jederzeit aufklappbar, für Profis erst nach dem Versuch
 * (`wegErstNachVersuch`).
 */
export function AkademieRechenuebung({ aufgabe, geloest, versuche, punkte, onFertig }: Props) {
  const [eingabe, setEingabe] = useState("");
  const [geprueft, setGeprueft] = useState(false);
  const [wegOffen, setWegOffen] = useState(false);

  const wert = parseZahl(eingabe);
  const toleranz = aufgabe.toleranzProzent ?? 1;
  const korrekt = wert !== null && imZielbereich(wert, aufgabe.zielwert, toleranz);
  const wegSichtbar = wegOffen || (geprueft && !!aufgabe.wegErstNachVersuch) || (geprueft && !korrekt);

  function pruefen() {
    setGeprueft(true);
    onFertig(korrekt);
  }

  function neuStarten() {
    setEingabe("");
    setGeprueft(false);
    setWegOffen(false);
  }

  return (
    <AufgabenRahmen
      titel={aufgabe.titel}
      hinweis={aufgabe.hinweis}
      typLabel="Rechnen"
      geloest={geloest}
      versuche={versuche}
      punkte={punkte}
      onNeuStarten={geprueft ? neuStarten : undefined}
      aktion={
        !geprueft ? (
          <div className="flex items-center justify-between gap-2">
            {!aufgabe.wegErstNachVersuch ? (
              <Button
                variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                onClick={() => setWegOffen((o) => !o)}
              >
                <Eye className="h-3.5 w-3.5" /> {wegOffen ? "Rechenweg verbergen" : "Rechenweg zeigen"}
              </Button>
            ) : <span />}
            <Button size="sm" disabled={wert === null} onClick={pruefen}>Prüfen</Button>
          </div>
        ) : (
          <AufgabenRueckmeldung
            korrekt={korrekt}
            text={
              korrekt
                ? `Richtig, ${formatiere(aufgabe.zielwert, aufgabe.einheit)}.`
                : `Richtig wären ${formatiere(aufgabe.zielwert, aufgabe.einheit)}. Der Rechenweg steht oben.`
            }
          />
        )
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">{aufgabe.fall}</div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`rechnen-${aufgabe.id}`}>
            {aufgabe.gesucht}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id={`rechnen-${aufgabe.id}`}
              inputMode="decimal"
              value={eingabe}
              disabled={geprueft}
              onChange={(e) => setEingabe(e.target.value)}
              placeholder="Zahl eintragen"
              className="max-w-[220px]"
            />
            {aufgabe.einheit && (
              <span className="text-sm text-muted-foreground">{aufgabe.einheit}</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Toleranz {toleranz} Prozent, Komma oder Punkt ist egal.
          </p>
        </div>

        {wegSichtbar && <Beispielrechnung b={aufgabe.rechenweg} />}
      </div>
    </AufgabenRahmen>
  );
}
