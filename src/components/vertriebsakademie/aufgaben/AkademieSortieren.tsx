import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AkademieSortierAufgabe } from "@/lib/vertriebsakademieContent";
import { AufgabenRahmen, AufgabenRueckmeldung } from "./AufgabenRahmen";
import { mischeMitSaat, reihenfolgeStimmt } from "./AufgabenHelfer";
import { useZiehen } from "./useZiehen";

interface Props {
  aufgabe: AkademieSortierAufgabe;
  geloest: boolean;
  versuche: number;
  /** Vergebene Punkte, nur zur Anzeige im Rahmen. */
  punkte?: number;
  onFertig: (korrekt: boolean) => void;
}

/** Eine Karte der Liste. Die Kennung ist die Position im Soll, sie bleibt beim Umsortieren stabil. */
interface Karte { id: string; text: string }

/**
 * Schritte in die richtige Reihenfolge bringen.
 *
 * Zwei Wege: Ziehen (Griff für den Finger, ganze Karte für die Maus, Technik
 * in `useZiehen`) und die Pfeiltasten hoch und runter. Die Pfeile bleiben,
 * weil Ziehen mit Tastatur und Screenreader nicht bedienbar ist. Beim Ziehen
 * sortiert sich die Liste schon unter dem Zeiger um, man sieht also sofort,
 * wo die Karte landen wird, bevor man loslässt.
 *
 * Im Quereinsteiger-Pfad sind erste und letzte Position vorgegeben
 * (`randVorgegeben`), im Profi-Pfad steht die Liste komplett offen.
 */
export function AkademieSortieren({ aufgabe, geloest, versuche, punkte, onFertig }: Props) {
  const soll = aufgabe.schritte;
  const rand = !!aufgabe.randVorgegeben && soll.length > 2;

  const startReihenfolge = useMemo<Karte[]>(() => {
    const karten = soll.map((text, i) => ({ id: String(i), text }));
    if (!rand) return mischeMitSaat(karten, aufgabe.id);
    const mitte = mischeMitSaat(karten.slice(1, -1), aufgabe.id);
    return [karten[0], ...mitte, karten[karten.length - 1]];
  }, [soll, rand, aufgabe.id]);

  const [liste, setListe] = useState<Karte[]>(startReihenfolge);
  const [geprueft, setGeprueft] = useState(false);

  const texte = liste.map((k) => k.text);
  const korrekt = reihenfolgeStimmt(texte, soll);
  const fixIndizes = rand ? [0, liste.length - 1] : [];

  function tausche(i: number, j: number) {
    if (geprueft) return;
    if (j < 0 || j >= liste.length) return;
    if (fixIndizes.includes(i) || fixIndizes.includes(j)) return;
    const kopie = [...liste];
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
    setListe(kopie);
  }

  /** Schiebt die Karte an die Position, über der der Zeiger steht. */
  function verschiebeZu(id: string, zielId: string | null) {
    if (geprueft || zielId === null) return;
    setListe((l) => {
      const von = l.findIndex((k) => k.id === id);
      const nach = l.findIndex((k) => k.id === zielId);
      if (von < 0 || nach < 0 || von === nach) return l;
      if (fixIndizes.includes(von) || fixIndizes.includes(nach)) return l;
      const kopie = [...l];
      const [karte] = kopie.splice(von, 1);
      kopie.splice(nach, 0, karte);
      return kopie;
    });
  }

  const ziehen = useZiehen({
    deaktiviert: geprueft,
    onZielWechsel: verschiebeZu,
    onAblegen: verschiebeZu,
  });

  function pruefen() {
    setGeprueft(true);
    onFertig(reihenfolgeStimmt(texte, soll));
  }

  function neuStarten() {
    setListe(startReihenfolge);
    setGeprueft(false);
  }

  const gezogen = liste.find((k) => k.id === ziehen.status.id);

  return (
    <AufgabenRahmen
      titel={aufgabe.titel}
      hinweis={aufgabe.hinweis ?? "Zieh die Schritte in die richtige Reihenfolge, oder nutze die Pfeile."}
      typLabel="Reihenfolge"
      geloest={geloest}
      versuche={versuche}
      punkte={punkte}
      onNeuStarten={geprueft ? neuStarten : undefined}
      aktion={
        !geprueft ? (
          <div className="flex justify-end">
            <Button size="sm" onClick={pruefen}>Reihenfolge prüfen</Button>
          </div>
        ) : (
          <AufgabenRueckmeldung
            korrekt={korrekt}
            text={
              korrekt
                ? "Die Reihenfolge stimmt."
                : "Die markierten Positionen stehen noch falsch. Die richtige Reihenfolge siehst du unten."
            }
            kinder={
              !korrekt ? (
                <ol className="mt-2 space-y-1 list-decimal list-inside text-foreground/90">
                  {soll.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              ) : undefined
            }
          />
        )
      }
    >
      <ol className="space-y-2">
        {liste.map((karte, i) => {
          const fix = fixIndizes.includes(i);
          const stelleStimmt = geprueft && soll[i] === karte.text;
          const wirdGezogen = ziehen.status.id === karte.id;
          const ziehbar = !fix && !geprueft;
          return (
            <li
              key={karte.id}
              data-va-ziel={fix ? undefined : karte.id}
              {...(ziehbar ? ziehen.kartenProps(karte.id) : {})}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm min-h-[44px] bg-card select-none transition-[opacity,border-color,background-color] duration-200",
                ziehbar && "cursor-grab",
                fix && "bg-muted/40",
                wirdGezogen && "opacity-30 border-dashed border-primary",
                geprueft && stelleStimmt && "border-emerald-500/40 bg-emerald-500/5",
                geprueft && !stelleStimmt && "border-rose-500/40 bg-rose-500/5 va-schuetteln",
              )}
            >
              {ziehbar ? (
                <span
                  {...ziehen.griffProps(karte.id)}
                  className="-ml-1.5 flex items-center text-muted-foreground/70 cursor-grab active:cursor-grabbing"
                  aria-label="Zum Ziehen anfassen"
                >
                  <GripVertical className="h-4 w-4" />
                </span>
              ) : null}
              <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
              <span className="flex-1 min-w-0">{karte.text}</span>
              {fix ? (
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="vorgegeben" />
              ) : (
                <span className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    disabled={geprueft || i === 0 || fixIndizes.includes(i - 1)}
                    onClick={() => tausche(i, i - 1)}
                    aria-label="nach oben"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    disabled={geprueft || i === liste.length - 1 || fixIndizes.includes(i + 1)}
                    onClick={() => tausche(i, i + 1)}
                    aria-label="nach unten"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Der Geist, der beim Ziehen dem Zeiger folgt. */}
      {ziehen.geistStyle && gezogen && (
        <div
          aria-hidden
          style={ziehen.geistStyle}
          className="flex items-center gap-2 rounded-lg border-2 border-primary bg-card px-3 py-2 text-sm shadow-xl rotate-[-1deg] scale-[1.02]"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground/70" />
          <span className="flex-1 min-w-0">{gezogen.text}</span>
        </div>
      )}
    </AufgabenRahmen>
  );
}
