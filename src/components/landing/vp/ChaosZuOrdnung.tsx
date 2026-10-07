import { useEffect, useState } from "react";
import { useScrollAbschnitt } from "@/components/landing/useScrollAbschnitt";
import { ScrollBuehne } from "@/components/landing/StickyScrollAbschnitt";

/**
 * Aus dem Haufen wird eine Liste.
 *
 * WAS MAN SIEHT
 *
 * Erst liegen die Sätze übereinander, gekippt und durcheinander: das, was
 * jemanden heute festhält. Wer weiterscrollt, sieht sie sich einen nach dem
 * anderen einordnen, und in dem Moment, in dem ein Satz gerade liegt, dreht
 * sich sein Inhalt um. Aus dem Vorwurf wird die Antwort.
 *
 * WARUM DAS SO GEBAUT IST
 *
 * Der Abschnitt klebt am Bildschirm fest, solange man durch ihn hindurchfährt.
 * Das übernimmt `useScrollAbschnitt` mitsamt seinen Sicherungen: Es wird kein
 * Scrollereignis abgefangen, nichts gesperrt, und wer reduzierte Bewegung
 * eingestellt hat, bekommt gar keine hohe Hülle, sondern sofort die fertige
 * Liste. Eine Animation darf nie darüber entscheiden, ob etwas lesbar ist.
 *
 * WARUM DIE UNORDNUNG FEST EINGETRAGEN IST
 *
 * Die Versätze stehen als Zahlen in `UNORDNUNG` und kommen nicht aus einem
 * Zufallsgenerator. Zufall sähe bei jedem Aufruf anders aus, könnte zwei Karten
 * genau aufeinanderlegen und wäre nicht prüfbar. Diese Werte sind so gewählt,
 * dass der Haufen um die Mitte liegt und trotzdem jede Karte ein Stück weit
 * sichtbar bleibt.
 */

export interface ChaosPaar {
  /** Der Satz, der heute festhält. */
  problem: string;
  /** Was bei uns an dieser Stelle steht. */
  antwort: string;
}

/**
 * Versatz je Karte im Haufen: waagerecht, senkrecht, Drehung, Stapelplatz.
 *
 * Die senkrechten Werte heben die Listenreihenfolge bewusst auf, sonst läge
 * der Haufen schon sortiert da und es gäbe nichts zu ordnen.
 *
 * Sie sind aber nicht beliebig: Im Haufen liegen die Karten rund 60 Pixel
 * auseinander, und genau so viel braucht eine Karte, damit ihre Textzeile frei
 * bleibt. Ein engerer Haufen sah zwar wilder aus, verdeckte aber zwei der
 * fünf Sätze vollständig, und lesen konnte man sie erst nach dem Ordnen.
 *
 * `stapel` sagt, welche Karte über welcher liegt. Ohne das lag die Karte mit
 * dem höchsten Index immer oben, unabhängig davon, wo sie im Haufen sitzt,
 * und der Stapel sah verkehrt herum aus.
 */
const UNORDNUNG: Array<{ dx: number; dy: number; dreh: number; stapel: number }> = [
  { dx: -92, dy: 214, dreh: -6.5, stapel: 3 },
  { dx: 108, dy: 0, dreh: 5.5, stapel: 5 },
  { dx: -64, dy: 154, dreh: -3.5, stapel: 1 },
  { dx: 124, dy: -124, dreh: 7.5, stapel: 4 },
  { dx: -86, dy: -96, dreh: -5, stapel: 2 },
  { dx: 70, dy: -188, dreh: 4, stapel: 6 },
];

/**
 * Höhe einer Zeile in der geordneten Liste, in Pixeln.
 *
 * Auf schmalen Schirmen bricht derselbe Satz auf drei Zeilen um. Mit der
 * Desktop-Höhe überlappten die Karten dann ausgerechnet in dem Moment, in dem
 * die Liste ordentlich sein soll.
 */
const ZEILE_BREIT = 96;
const ZEILE_SCHMAL = 124;

/**
 * Anteil des Scrollwegs, in dem der Haufen noch unberuehrt liegt.
 *
 * Erst danach beginnt das Einsortieren. Ohne diese Pause sieht niemand das
 * Chaos als Bild, es loest sich schon auf, waehrend es hereinkommt.
 */
const HALTEN = 0.2;

/** Wahr auf Schirmen unter 640 Pixeln, der Tailwind-Grenze `sm`. */
function useSchmal(): boolean {
  const [schmal, setSchmal] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const abfrage = window.matchMedia("(max-width: 639px)");
    const pruefen = () => setSchmal(abfrage.matches);
    pruefen();
    abfrage.addEventListener?.("change", pruefen);
    return () => abfrage.removeEventListener?.("change", pruefen);
  }, []);
  return schmal;
}

export function ChaosZuOrdnung({ paare }: { paare: ChaosPaar[] }) {
  const abschnitt = useScrollAbschnitt(paare.length);
  const schmal = useSchmal();
  const zeile = schmal ? ZEILE_SCHMAL : ZEILE_BREIT;

  /*
    Nur bei reduzierter Bewegung steht hier die schlichte Wahrheit: beide
    Saetze untereinander, nichts versteckt.

    Ausdruecklich NICHT auch bei `!gesteuert`: Der Hook setzt `gesteuert` erst,
    wenn er die Huelle messen konnte. Wer hier schon aussteigt, rendert nie
    eine Huelle, es gibt nie etwas zu messen, und der Abschnitt bleibt fuer
    immer in der Ersatzdarstellung. Dieser Fehler war am 19.09.2026 genau
    einmal drin. Solange nicht gemessen ist, steht die Buehne trotzdem, und
    die Karten zeigen sich unten fertig sortiert.
  */
  if (abschnitt.ruhig) {
    return (
      <ul className="mx-auto max-w-3xl space-y-3">
        {paare.map((paar) => (
          <li
            key={paar.problem}
            className="rounded-xl border border-white/10 bg-[hsl(220_26%_13%)] p-5"
          >
            <p className="text-[15px] font-semibold leading-snug text-slate-400 line-through decoration-destructive/60">
              {paar.problem}
            </p>
            <p className="mt-2 text-[15px] font-semibold leading-snug text-white">
              {paar.antwort}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ScrollBuehne abschnitt={abschnitt} hoehe="h-[320svh] sm:h-[360svh]" ausrichtung="oben">
      <div className="mx-auto max-w-3xl px-1">
        <Kopfzeile fortschritt={abschnitt.gesteuert ? abschnitt.bandFortschritt : 1} />

        <div
          className="relative mx-auto mt-8"
          style={{ height: paare.length * zeile + 16 }}
        >
          {paare.map((paar, i) => (
            <Karte
              key={paar.problem}
              paar={paar}
              index={i}
              band={abschnitt.bandFortschritt}
              anzahl={paare.length}
              zeile={zeile}
              schmal={schmal}
              gesteuert={abschnitt.gesteuert}
            />
          ))}
        </div>
      </div>
    </ScrollBuehne>
  );
}

/**
 * Die Zeile über dem Haufen wechselt mit, sonst stünde über der fertigen
 * Liste noch die Frage, die sie längst beantwortet hat.
 */
function Kopfzeile({ fortschritt }: { fortschritt: number }) {
  const gedreht = fortschritt > 0.58;
  return (
    <div className="relative h-16 text-center">
      <p
        className="absolute inset-x-0 top-0 transition-opacity duration-500"
        style={{ opacity: gedreht ? 0 : 1 }}
      >
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-destructive/80">
          So ist es heute
        </span>
        <span className="mt-2 block text-lg font-bold text-white sm:text-xl">
          Fünf Sätze. Du weißt selbst, welche davon sitzen.
        </span>
      </p>
      <p
        className="absolute inset-x-0 top-0 transition-opacity duration-500"
        style={{ opacity: gedreht ? 1 : 0 }}
      >
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#88CFFF]">
          So ist es bei uns
        </span>
        <span className="mt-2 block text-lg font-bold text-white sm:text-xl">
          Derselbe Punkt. Andere Antwort.
        </span>
      </p>
    </div>
  );
}

function Karte({
  paar,
  index,
  band,
  anzahl,
  zeile,
  schmal,
  gesteuert,
}: {
  paar: ChaosPaar;
  index: number;
  band: number;
  anzahl: number;
  zeile: number;
  schmal: boolean;
  gesteuert: boolean;
}) {
  /*
    Erst haelt der Haufen still, dann ordnet er sich.

    Ohne diese Haltephase begann das Einsortieren im selben Moment, in dem der
    Abschnitt hereinkam: Man sah das Chaos nie als Bild, sondern immer schon
    halb aufgeloest. Das erste Fuenftel des Weges gehoert deshalb dem Haufen.

    Danach hat jede Karte ihr eigenes Fenster. Karte 0 ordnet sich zuerst,
    danach die naechste. Der Nenner ist absichtlich groesser als das Fenster
    breit ist: So ueberlappen die Bewegungen leicht und es ruckelt nicht von
    einer Karte zur naechsten.
  */
  const ordnen = Math.max(0, (band - HALTEN) / (1 - HALTEN));
  const fensterBreite = 1 / anzahl;
  const roh = (ordnen - index * fensterBreite) / (fensterBreite * 1.35);
  // Ohne gelungene Messung ist alles fertig: geordnet und aufgedeckt.
  const t = gesteuert ? Math.max(0, Math.min(1, roh)) : 1;

  // Weiche Kurve statt linear: startet zügig, kommt sanft an.
  const e = 1 - Math.pow(1 - t, 3);

  /*
    Auf dem Handy faellt der seitliche Versatz deutlich kleiner aus. Die Werte
    in UNORDNUNG sind fuer eine 768 Pixel breite Flaeche gedacht; auf 375 Pixel
    schoben sie die Karten links und rechts aus dem Bild, und der Text war an
    beiden Raendern abgeschnitten.
  */
  const versatz = UNORDNUNG[index % UNORDNUNG.length];
  const seit = schmal ? 0.3 : 1;
  const hoch = schmal ? 0.8 : 1;
  const dx = versatz.dx * seit * (1 - e);
  const dy = versatz.dy * hoch * (1 - e);
  const dreh = versatz.dreh * (schmal ? 0.65 : 1) * (1 - e);
  /*
    Im Haufen deutlich kleiner. Bei voller Breite sind die Karten so lang und
    flach, dass jede Ueberlappung einen Satz mittendrin abschneidet, und das
    sieht nach Fehler aus statt nach Unordnung. Verkleinert wirken sie wie
    hingeworfene Zettel, und es bleibt Luft zwischen ihnen.
  */
  const groesse = 0.78 + 0.22 * e;

  // Der Inhalt dreht sich erst, wenn die Karte fast liegt.
  const gedreht = e > 0.62;

  return (
    <div
      className="absolute inset-x-0"
      style={{
        top: index * zeile,
        transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${dreh}deg) scale(${groesse})`,
        /*
          Im Haufen bestimmt der Stapelplatz, wer oben liegt. Beim Ordnen
          steigt eine Karte darueber hinaus nach vorn: Sonst schiebt sich der
          Haufen ueber die Karte, die sich gerade einsortiert hat, und der
          Fortschritt ist nicht zu sehen.
        */
        zIndex: 10 + versatz.stapel + Math.round(e * 30),
        willChange: e < 1 ? "transform" : undefined,
      }}
    >
      <div
        className="flex min-h-[80px] items-center gap-4 rounded-xl border p-4 transition-colors duration-500 sm:p-5"
        style={{
          borderColor: gedreht ? "rgba(136,207,255,0.35)" : "rgba(255,255,255,0.16)",
          background: gedreht ? "hsl(214 40% 17%)" : "hsl(220 24% 18%)",
          // Im Haufen ein tiefer Schatten: Ohne ihn verschwimmen die Karten
          // auf dem dunklen Grund zu einer einzigen grauen Flaeche.
          boxShadow: gedreht
            ? "0 10px 30px -12px rgba(0,0,0,0.5)"
            : "0 24px 48px -16px rgba(0,0,0,0.85)",
        }}
      >
        <span
          aria-hidden
          className="h-10 w-1 shrink-0 rounded-full transition-colors duration-500"
          style={{ background: gedreht ? "#88CFFF" : "hsl(0 72% 51%)" }}
        />

        {/*
          Beide Sätze liegen übereinander im selben Kasten. Ein Austausch im
          Fluss würde die Karte in der Höhe springen lassen, genau während sie
          sich bewegt.
        */}
        <span className="relative min-w-0 flex-1">
          <span
            className="block text-[15px] font-semibold leading-snug text-slate-200 transition-opacity duration-500 sm:text-base"
            style={{ opacity: gedreht ? 0 : 1 }}
          >
            {paar.problem}
          </span>
          <span
            className="absolute inset-0 block text-[15px] font-semibold leading-snug text-white transition-opacity duration-500 sm:text-base"
            style={{ opacity: gedreht ? 1 : 0 }}
            aria-hidden={!gedreht}
          >
            {paar.antwort}
          </span>
        </span>
      </div>
    </div>
  );
}

export default ChaosZuOrdnung;
