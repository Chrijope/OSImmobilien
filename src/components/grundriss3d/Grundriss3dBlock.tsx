import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Box, Loader2, Map as MapIcon } from "lucide-react";
import { PlanSvg } from "./PlanSvg";
import { gesamtFlaeche, qm, type Grundriss3dPlan } from "./plan";
import type { Grundriss3dAnsichtProps } from "./Grundriss3dAnsicht";

/*
 * Rahmen um die 3D-Ansicht. Selbst ohne three.js: Die Ansicht wird erst
 * geladen, wenn der Block in Sichtweite kommt (eigener Chunk). Ohne WebGL
 * oder auf schwachen Geräten bleibt es beim 2D-Grundriss, mit Knopf zum
 * Nachladen. 2D ist immer erreichbar (Barrierefreiheit).
 */

export const ladeAnsicht = () => import("./Grundriss3dAnsicht");
const Ansicht = lazy(ladeAnsicht);

export function webglMoeglich(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Faustregel: zwei Kerne oder höchstens 2 GB Speicher gilt als schwach. */
export function schwachesGeraet(nav: { hardwareConcurrency?: number; deviceMemory?: number } = navigator as never): boolean {
  return (nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2;
}

export const HAFTUNGSHINWEIS = "Darstellung schematisch, Möblierung beispielhaft. Maßgeblich sind Grundriss, Teilungserklärung und Aufteilungsplan.";

export function Grundriss3dBlock({ einheiten, kompakt, hoehe = 480, fassade, titel, startwerte }: {
  einheiten: Array<{ plan: Grundriss3dPlan; titel?: string }>;
  kompakt?: boolean;
  hoehe?: number;
  fassade?: string;
  titel?: string;
  startwerte?: Grundriss3dAnsichtProps["startwerte"];
}) {
  const [ansicht, setAnsicht] = useState<"3d" | "2d">(() => (webglMoeglich() && !schwachesGeraet() ? "3d" : "2d"));
  const [inSicht, setInSicht] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ohneWebgl = !webglMoeglich();

  useEffect(() => {
    const el = ref.current;
    if (!el || inSicht) return;
    if (typeof IntersectionObserver === "undefined") { setInSicht(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInSicht(true); }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [inSicht]);

  if (!einheiten.length) return null;
  const summe = einheiten.reduce((s, e) => s + gesamtFlaeche(e.plan), 0);
  const platzhalter = (
    <div className="flex items-center justify-center rounded-xl bg-muted/40 text-sm text-muted-foreground" style={{ height: hoehe }}>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 3D-Ansicht wird geladen
    </div>
  );

  return (
    <div ref={ref} className="space-y-2" data-testid="grundriss-3d-block">
      <div className="flex flex-wrap items-center gap-2">
        {titel && <span className="text-sm font-semibold">{titel}</span>}
        <span className="text-xs text-muted-foreground">Raumflächen zusammen {qm(summe)}</span>
        <div className="ml-auto inline-flex overflow-hidden rounded-md border text-xs">
          <button type="button" className={`inline-flex items-center gap-1 px-2.5 py-1.5 ${ansicht === "3d" ? "bg-primary text-primary-foreground" : ""}`}
            disabled={ohneWebgl} title={ohneWebgl ? "Dein Browser kann kein 3D darstellen." : undefined} onClick={() => setAnsicht("3d")}>
            <Box className="h-3.5 w-3.5" /> 3D
          </button>
          <button type="button" className={`inline-flex items-center gap-1 px-2.5 py-1.5 ${ansicht === "2d" ? "bg-primary text-primary-foreground" : ""}`} onClick={() => setAnsicht("2d")}>
            <MapIcon className="h-3.5 w-3.5" /> 2D
          </button>
        </div>
      </div>
      {ansicht === "3d" ? (
        inSicht ? (
          <Suspense fallback={platzhalter}>
            <Ansicht einheiten={einheiten} kompakt={kompakt} hoehe={hoehe} fassade={fassade} startwerte={startwerte} />
          </Suspense>
        ) : platzhalter
      ) : (
        <div className="grid gap-3 rounded-xl border bg-white p-3" style={{ gridTemplateColumns: einheiten.length > 1 ? "repeat(auto-fill, minmax(260px, 1fr))" : "1fr" }}>
          {einheiten.map((e, i) => (
            <figure key={i} className="m-0">
              <PlanSvg plan={{ ...e.plan, hintergrund: undefined }} className="h-auto w-full" titel={e.titel} />
              {e.titel && einheiten.length > 1 && <figcaption className="text-center text-xs text-muted-foreground">{e.titel}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">{HAFTUNGSHINWEIS}</p>
    </div>
  );
}
