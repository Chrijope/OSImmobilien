import { ENERGIESTUFEN } from "@/lib/energieskala";
import { dez } from "@/lib/objektKennzahlen";
import { cn } from "@/lib/utils";
import { useAnzeigeSprache } from "@/lib/seitenSpracheKontext";
import { exposeSeitenTexte } from "./exposeTexte";

/**
 * Das Band A+ bis H wie auf dem Energieausweis: neun Stufen, die aktive
 * hervorgehoben, darunter die Marke für den Endenergiekennwert. Die Stufen
 * und die Position kommen aus energieskala.ts, hier ist nur Darstellung.
 */
export function Energieskala({ klasse, kennwert, positionProzent, hinweis }: {
  klasse?: string;
  kennwert?: number;
  positionProzent?: number;
  hinweis?: string;
}) {
  const sprache = useAnzeigeSprache();
  const t = exposeSeitenTexte(sprache);
  return (
    <div data-testid="energieskala">
      <div className="flex gap-1" role="list" aria-label={t.energieklassen}>
        {ENERGIESTUFEN.map((s) => {
          const aktiv = s.klasse === klasse;
          return (
            <div
              key={s.klasse}
              role="listitem"
              aria-current={aktiv ? "true" : undefined}
              data-testid={`energiestufe-${s.klasse}`}
              className={cn("flex h-9 flex-1 items-center justify-center rounded-md text-xs font-semibold text-white transition-transform", aktiv && "scale-y-125 ring-2 ring-foreground ring-offset-2 ring-offset-card")}
              style={{ backgroundColor: s.farbe, opacity: klasse && !aktiv ? 0.55 : 1 }}
            >
              {s.klasse}
            </div>
          );
        })}
      </div>
      {typeof positionProzent === "number" && typeof kennwert === "number" ? (
        <div className="relative mt-2 h-6">
          <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${positionProzent}%` }}>
            <div className="mx-auto h-0 w-0 border-x-[6px] border-b-[7px] border-x-transparent border-b-foreground" />
            <div className="whitespace-nowrap text-[11px] font-semibold text-foreground">{dez(kennwert, 1, sprache)} kWh/(m²·a)</div>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{t.ohneKennwert}</p>
      )}
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>0</span><span>50</span><span>100</span><span>150</span><span>200</span><span>250</span><span>{t.ueber300}</span></div>
      {hinweis && <p className="mt-2 text-xs text-muted-foreground">{hinweis}</p>}
    </div>
  );
}
