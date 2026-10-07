import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AkademieWahrFalschAufgabe } from "@/lib/vertriebsakademieAufgabenTypen";
import { AufgabenRahmen, AufgabenRueckmeldung } from "./AufgabenRahmen";
import { mischeMitSaat, quote, reduzierteBewegung } from "./AufgabenHelfer";

interface Props {
  aufgabe: AkademieWahrFalschAufgabe;
  geloest: boolean;
  versuche: number;
  /** Vergebene Punkte, nur zur Anzeige im Rahmen. */
  punkte?: number;
  onFertig: (korrekt: boolean) => void;
}

/** Ab dieser Strecke in Pixeln zählt ein Wisch als Entscheidung. */
const WISCH_SCHWELLE_PX = 90;
/** Dauer des Hinausfliegens, passt zu `va-wisch-links` und `va-wisch-rechts`. */
const FLUG_MS = 300;

/**
 * Wisch-Stapel: Aussagen als Kartenstapel.
 *
 * Die oberste Karte wird nach rechts („Stimmt") oder links („Stimmt nicht")
 * gewischt. Die zwei Knöpfe darunter tun dasselbe, für Tastatur, Screenreader
 * und alle, die lieber tippen. Nach jeder Karte erscheint sofort die
 * Auflösung, am Ende die Bilanz. Gelöst ist der Stapel, wenn alle Karten
 * richtig lagen, wie beim Quiz.
 *
 * Wischen läuft über Zeigerereignisse mit `touch-action: pan-y`: Der Finger
 * darf die Seite weiter senkrecht scrollen, nur die waagerechte Bewegung
 * gehört der Karte. Kein HTML-Drag, das geht auf dem iPhone nicht.
 */
export function AkademieWahrFalsch({ aufgabe, geloest, versuche, punkte, onFertig }: Props) {
  const karten = useMemo(() => mischeMitSaat(aufgabe.karten, aufgabe.id), [aufgabe.karten, aufgabe.id]);

  const [index, setIndex] = useState(0);
  const [antworten, setAntworten] = useState<boolean[]>([]);
  const [flug, setFlug] = useState<"links" | "rechts" | null>(null);
  const [dx, setDx] = useState(0);
  const [wischt, setWischt] = useState(false);
  const startX = useRef<number | null>(null);
  const flugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fertig = antworten.length >= karten.length;
  const richtige = antworten.reduce((n, a, i) => n + (a === karten[i].stimmt ? 1 : 0), 0);
  const aktuelle = karten[index];
  const letzteAntwort = antworten.length > 0 && !fertig ? antworten.length - 1 : null;

  // Wie beim Quiz: Der Rückruf steht in einer Ref, damit kein Effekt an seiner
  // Identität hängt und in einer Schleife meldet.
  const onFertigRef = useRef(onFertig);
  onFertigRef.current = onFertig;

  useEffect(() => () => { if (flugTimer.current) clearTimeout(flugTimer.current); }, []);

  function entscheiden(stimmt: boolean) {
    if (fertig || flug || !aktuelle) return;
    const naechste = [...antworten, stimmt];
    const abschliessen = () => {
      setAntworten(naechste);
      setFlug(null);
      setDx(0);
      if (naechste.length >= karten.length) {
        const alleRichtig = naechste.every((a, i) => a === karten[i].stimmt);
        onFertigRef.current(alleRichtig);
      } else {
        setIndex((i) => i + 1);
      }
    };
    if (reduzierteBewegung()) {
      abschliessen();
      return;
    }
    setFlug(stimmt ? "rechts" : "links");
    flugTimer.current = setTimeout(abschliessen, FLUG_MS);
  }

  function neuStarten() {
    if (flugTimer.current) clearTimeout(flugTimer.current);
    setIndex(0);
    setAntworten([]);
    setFlug(null);
    setDx(0);
  }

  // Wischen: waagerechte Bewegung der obersten Karte.
  function anfassen(e: ReactPointerEvent<HTMLElement>) {
    if (fertig || flug || e.button !== 0) return;
    startX.current = e.clientX;
    setWischt(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* alte Browser */ }
  }
  function bewegen(e: ReactPointerEvent<HTMLElement>) {
    if (startX.current === null) return;
    setDx(e.clientX - startX.current);
  }
  function loslassen(e: ReactPointerEvent<HTMLElement>) {
    if (startX.current === null) return;
    const strecke = e.clientX - startX.current;
    startX.current = null;
    setWischt(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* egal */ }
    if (Math.abs(strecke) >= WISCH_SCHWELLE_PX) entscheiden(strecke > 0);
    else setDx(0);
  }
  function abbrechen() {
    startX.current = null;
    setWischt(false);
    setDx(0);
  }

  const neigung = Math.max(-1, Math.min(1, dx / WISCH_SCHWELLE_PX));

  return (
    <AufgabenRahmen
      titel={aufgabe.titel}
      hinweis={aufgabe.hinweis ?? "Wisch die Karte nach rechts, wenn die Aussage stimmt, und nach links, wenn nicht. Oder tippe unten."}
      typLabel={`Stimmt oder nicht · ${karten.length} Karten`}
      geloest={geloest}
      versuche={versuche}
      punkte={punkte}
      onNeuStarten={fertig ? neuStarten : undefined}
      aktion={
        fertig ? (
          <AufgabenRueckmeldung
            korrekt={richtige === karten.length}
            text={`${richtige} von ${karten.length} richtig, das sind ${quote(richtige, karten.length)} Prozent.`}
            kinder={
              <ul className="mt-2 space-y-1.5">
                {karten.map((k, i) => {
                  const ok = antworten[i] === k.stimmt;
                  return (
                    <li key={i} className="flex items-start gap-1.5 text-foreground/90">
                      {ok
                        ? <Check className="h-3.5 w-3.5 mt-px shrink-0 text-emerald-600" aria-label="richtig" />
                        : <X className="h-3.5 w-3.5 mt-px shrink-0 text-rose-600" aria-label="falsch" />}
                      <span>
                        <span className="font-medium">{k.aussage}</span>{" "}
                        <span className="text-muted-foreground">
                          {k.stimmt ? "Stimmt." : "Stimmt nicht."} {k.aufloesung}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            }
          />
        ) : undefined
      }
    >
      {!fertig && aktuelle && (
        <div className="space-y-3">
          <div className="text-[11px] text-muted-foreground">
            Karte {index + 1} von {karten.length}
          </div>

          {/* Der Stapel: zwei Karten schauen hinten heraus, die oberste bewegt sich. */}
          <div className="relative mx-auto max-w-md" style={{ minHeight: 132 }}>
            {index + 2 < karten.length && (
              <div aria-hidden className="absolute inset-x-4 top-3 h-full rounded-xl border bg-card/70 scale-[0.94] translate-y-2" />
            )}
            {index + 1 < karten.length && (
              <div aria-hidden className="absolute inset-x-2 top-1.5 h-full rounded-xl border bg-card/90 scale-[0.97] translate-y-1" />
            )}
            <div
              role="group"
              aria-label={`Aussage: ${aktuelle.aussage}`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") { e.preventDefault(); entscheiden(true); }
                if (e.key === "ArrowLeft") { e.preventDefault(); entscheiden(false); }
              }}
              onPointerDown={anfassen}
              onPointerMove={bewegen}
              onPointerUp={loslassen}
              onPointerCancel={abbrechen}
              style={{
                touchAction: "pan-y",
                transform: flug ? undefined : `translateX(${dx}px) rotate(${neigung * 6}deg)`,
                transition: wischt ? "none" : "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
              className={cn(
                "relative rounded-xl border-2 bg-card p-4 md:p-5 shadow-md select-none cursor-grab active:cursor-grabbing min-h-[132px] flex items-center",
                neigung > 0.3 && "border-emerald-500/60",
                neigung < -0.3 && "border-rose-500/60",
                flug === "rechts" && "va-wisch-rechts border-emerald-500/60",
                flug === "links" && "va-wisch-links border-rose-500/60",
              )}
            >
              <span
                aria-hidden
                className="absolute left-3 top-3 rounded border-2 border-rose-500 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600 -rotate-6"
                style={{ opacity: flug === "links" ? 1 : Math.max(0, -neigung) }}
              >
                Stimmt nicht
              </span>
              <span
                aria-hidden
                className="absolute right-3 top-3 rounded border-2 border-emerald-500 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 rotate-6"
                style={{ opacity: flug === "rechts" ? 1 : Math.max(0, neigung) }}
              >
                Stimmt
              </span>
              <p className="text-sm md:text-base font-medium leading-snug text-center w-full px-2">
                {aktuelle.aussage}
              </p>
            </div>
          </div>

          <div className="flex justify-center gap-3">
            <Button
              variant="outline" size="sm"
              className="gap-1.5 min-w-[130px] border-rose-500/40 text-rose-700 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
              disabled={!!flug}
              onClick={() => entscheiden(false)}
            >
              <X className="h-4 w-4" /> Stimmt nicht
            </Button>
            <Button
              variant="outline" size="sm"
              className="gap-1.5 min-w-[130px] border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400"
              disabled={!!flug}
              onClick={() => entscheiden(true)}
            >
              <Check className="h-4 w-4" /> Stimmt
            </Button>
          </div>

          {letzteAntwort !== null && (
            <AufgabenRueckmeldung
              key={letzteAntwort}
              korrekt={antworten[letzteAntwort] === karten[letzteAntwort].stimmt}
              text={`${karten[letzteAntwort].stimmt ? "Die Aussage stimmt." : "Die Aussage stimmt nicht."} ${karten[letzteAntwort].aufloesung}`}
            />
          )}
        </div>
      )}
    </AufgabenRahmen>
  );
}
