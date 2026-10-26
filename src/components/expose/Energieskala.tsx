import { ENERGIESTUFEN } from "@/lib/energieskala";
import { dez } from "@/lib/objektKennzahlen";
import { cn } from "@/lib/utils";
import { useAnzeigeSprache } from "@/lib/seitenSpracheKontext";
import { exposeSeitenTexte } from "./exposeTexte";

/**
 * Das Band A+ bis H wie auf dem Energieausweis: neun Stufen, die aktive
 * hervorgehoben, darunter die Marke für den Endenergiekennwert. Die Stufen
 * und die Position kommen aus energieskala.ts, hier ist nur Darstellung.
 *
 * `pfeil` (Exposé, Inhaber 16.10.2026): ein kleiner Pfeil nach unten über
 * der hervorgehobenen Klasse. Dafür rückt die Skala nach unten, auch bei A+
 * und A ganz links ist Platz, und Satz und Zahlenleiste darunter halten
 * Abstand zur vergrößerten Stufe. Ohne `pfeil` bleibt alles wie im
 * Investmentrechner.
 */
export function Energieskala({ klasse, kennwert, positionProzent, hinweis, pfeil = false }: {
  klasse?: string;
  kennwert?: number;
  positionProzent?: number;
  hinweis?: string;
  pfeil?: boolean;
}) {
  const sprache = useAnzeigeSprache();
  const t = exposeSeitenTexte(sprache);
  return (
    <div data-testid="energieskala">
      <div className={cn("flex gap-1", pfeil && "pt-8")} role="list" aria-label={t.energieklassen}>
        {ENERGIESTUFEN.map((s) => {
          const aktiv = s.klasse === klasse;
          return (
            <div
              key={s.klasse}
              role="listitem"
              aria-current={aktiv ? "true" : undefined}
              data-testid={`energiestufe-${s.klasse}`}
              className={cn("relative flex h-9 flex-1 items-center justify-center rounded-md text-xs font-semibold text-white transition-transform", aktiv && "scale-y-125 ring-2 ring-foreground ring-offset-2 ring-offset-card")}
              style={{ backgroundColor: s.farbe, opacity: klasse && !aktiv ? 0.55 : 1 }}
            >
              {s.klasse}
              {/* Gegen die Streckung der Stufe (scale-y-125) gestaucht, damit der Pfeil seine Form behält. */}
              {pfeil && aktiv && <span aria-hidden="true" data-testid="energie-pfeil" className="pointer-events-none absolute bottom-full left-1/2 mb-3 h-0 w-0 -translate-x-1/2 scale-y-[0.8] border-x-[6px] border-t-[8px] border-x-transparent border-t-foreground" />}
            </div>
          );
        })}
      </div>
      {typeof positionProzent === "number" && typeof kennwert === "number" ? (
        <div className={cn("relative h-6", pfeil ? "mt-4" : "mt-2")}>
          <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${positionProzent}%` }}>
            <div className="mx-auto h-0 w-0 border-x-[6px] border-b-[7px] border-x-transparent border-b-foreground" />
            <div className="whitespace-nowrap text-[11px] font-semibold text-foreground">{dez(kennwert, 1, sprache)} kWh/(m²·a)</div>
          </div>
        </div>
      ) : (
        // Im Exposé setzt premiumExpose.css den Rand von Absätzen auf null, deshalb der Abstand als Innenabstand.
        <p className={cn("text-xs text-muted-foreground", pfeil ? "pt-5" : "mt-2")}>{t.ohneKennwert}</p>
      )}
      <div className={cn("flex justify-between text-bildunterschrift text-muted-foreground", pfeil ? "mt-2" : "mt-1")}><span>0</span><span>50</span><span>100</span><span>150</span><span>200</span><span>250</span><span>{t.ueber300}</span></div>
      {hinweis && <p className="mt-2 text-xs text-muted-foreground">{hinweis}</p>}
    </div>
  );
}
