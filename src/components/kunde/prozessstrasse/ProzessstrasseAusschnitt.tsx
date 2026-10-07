/**
 * Prozesslinie im Ausschnitt, die Fortschrittsanzeige der Investment-Karte.
 *
 * Fünf Stationen um die aktuelle (Handy: drei) auf einer Treppe je Etappe,
 * darunter die ganze Strecke als Punktleiste mit Pfeilen zum Verschieben.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PHASEN, baueStrasse } from "./prozessstrasseModell";
import {
  AKTIV,
  ERLEDIGT,
  Legende,
  OFFEN,
  StrassenKopf,
  ZielSymbol,
  type VarianteProps,
} from "./ProzessstrasseTeile";
import { STUFE_H, StrassenBahn, bahnHoehe, ebeneVon } from "./StrassenBahn";

function useBreite<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [breite, setBreite] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBreite(e.contentRect.width));
    ro.observe(el);
    setBreite(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, breite] as const;
}

const RUNDER_KNOPF =
  "grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-[var(--shadow-sm)] transition-[transform,color,opacity] duration-300 hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// ─── V2 Ausschnitt ──────────────────────────────────────────────────────────

export function ProzessstrasseAusschnitt(props: VarianteProps) {
  const strasse = useMemo(() => baueStrasse(props.stufe, props.rolle), [props.stufe, props.rolle]);
  const [ref, breite] = useBreite<HTMLDivElement>();
  const n = strasse.stationen.length;
  const sichtbar = breite > 0 && breite < 480 ? 3 : 5;
  const mitteStart = Math.min(Math.max(strasse.aktuellIndex - Math.floor(sichtbar / 2), 0), n - sichtbar);
  const [start, setStart] = useState<number | null>(null);
  const s = Math.min(Math.max(start ?? mitteStart, 0), n - sichtbar);
  const dx = breite / sichtbar;
  const zentriere = (i: number) => setStart(Math.min(Math.max(i - Math.floor(sichtbar / 2), 0), n - sichtbar));
  // Nur die Ebenen im Ausschnitt beanspruchen Höhe: die höchste sichtbare
  // Ebene rückt nach oben, die Fläche ist so hoch wie die sichtbare Treppe.
  const ebenen = strasse.stationen.slice(s, s + sichtbar).map(ebeneVon);
  const hoechste = Math.max(...ebenen);
  const tiefste = Math.min(...ebenen);
  const hochSchieben = (PHASEN.length - 1 - hoechste) * STUFE_H;

  return (
    <div className="prozessstrasse space-y-3">
      <StrassenKopf strasse={strasse} />
      <div
        ref={ref}
        tabIndex={0}
        aria-label="Ausschnitt der Prozesslinie, mit Pfeiltasten verschieben"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setStart(s - 1);
          if (e.key === "ArrowRight") setStart(s + 1);
        }}
        className="ps-gleiten-hoehe relative overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ height: bahnHoehe(hoechste - tiefste) }}
      >
        {breite > 0 && (
          <div className="ps-gleiten absolute left-0 top-0" style={{ transform: `translate(${-s * dx}px, ${-hochSchieben}px)` }}>
            <StrassenBahn strasse={strasse} dx={dx} sichtbarAb={s * dx} {...props} />
          </div>
        )}
      </div>

      {/* Schieberegler: die ganze Strecke als Punkte, der sichtbare Teil hell hinterlegt */}
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Ausschnitt nach links" className={RUNDER_KNOPF} disabled={s === 0} onClick={() => setStart(s - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="relative flex-1 py-2">
          {/* Die Punkte sitzen mittig in ihren Spalten, die Linie läuft von Mitte zu Mitte. */}
          <div className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ background: OFFEN, left: `${50 / n}%`, right: `${50 / n}%` }} />
          <div
            className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
            style={{ background: ERLEDIGT, left: `${50 / n}%`, width: `${((strasse.zielErreicht ? n - 1 : strasse.aktuellIndex) / n) * 100}%` }}
          />
          <div
            className="ps-gleiten absolute top-1/2 h-6 -translate-y-1/2 rounded-full bg-foreground/[0.06] ring-1 ring-foreground/10"
            style={{
              left: `calc(${(s / n) * 100}% )`,
              width: `${(sichtbar / n) * 100}%`,
            }}
            aria-hidden="true"
          />
          <div className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {strasse.stationen.map((st, i) => {
              const farbe = st.zustand === "erledigt" ? ERLEDIGT : st.zustand === "aktuell" ? AKTIV : "hsl(var(--card))";
              return (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => zentriere(i)}
                  title={st.label}
                  aria-label={`Zu ${st.label} springen`}
                  className="group grid h-5 place-items-center outline-none"
                >
                  <span
                    className="block rounded-full transition-transform duration-300 group-hover:scale-150 group-focus-visible:ring-2 group-focus-visible:ring-ring"
                    style={{
                      width: st.zustand === "aktuell" ? 11 : 8,
                      height: st.zustand === "aktuell" ? 11 : 8,
                      background: farbe,
                      border: st.zustand === "offen" ? `2px solid ${OFFEN}` : undefined,
                      boxShadow: st.zustand === "aktuell" ? "0 0 0 3px hsl(var(--ps-aktiv) / 0.22)" : undefined,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
        <ZielSymbol strasse={strasse} className="h-4 w-4 shrink-0" />
        <button type="button" aria-label="Ausschnitt nach rechts" className={RUNDER_KNOPF} disabled={s >= n - sichtbar} onClick={() => setStart(s + 1)}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>
          Zeigt Station {s + 1} bis {s + sichtbar} von {n}
        </span>
        {s !== mitteStart && (
          <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => setStart(null)}>
            Zur aktuellen Station
          </button>
        )}
      </div>
      <div className="border-t border-border/70 pt-3">
        <Legende strasse={strasse} />
      </div>
    </div>
  );
}
