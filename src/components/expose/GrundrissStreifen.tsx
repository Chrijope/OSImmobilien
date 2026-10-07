import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ExposeInhalt } from "@/lib/exposeInhalt";
import { GrundrissVorschau } from "./GrundrissVorschau";
import { useAnzeigeSprache } from "@/lib/seitenSpracheKontext";
import { exposeSeitenTexte } from "./exposeTexte";

type Plan = ExposeInhalt["grundriss"]["dokumente"][number];

/**
 * Mehrere Grundrisse platzsparend (Christian, 24.09.2026), etwa beim
 * Globalobjekt mit zwölf Plänen: ein Streifen, in dem immer ein Plan steht.
 * Die übrigen erreicht man durch Wischen oder Scrollen, am Desktop mit den
 * Pfeilen und mit den Pfeiltasten, sobald der Streifen den Fokus hat.
 * Darüber „1 von 12“, für Bildschirmleser als Live-Region.
 *
 * Das Blättern ist natives Scrollen mit Einrasten (`scroll-snap`), deshalb
 * funktioniert Wischen auf dem Handy ohne eigene Gestenlogik. Im Druck steht
 * der Streifen als Raster aller Pläne (`exposeLageGrundriss.css`).
 */
export function GrundrissStreifen({ plaene, onZoom }: {
  plaene: Plan[];
  onZoom: (image: { url: string; alt: string }) => void;
}) {
  const t = exposeSeitenTexte(useAnzeigeSprache());
  const bahn = useRef<HTMLDivElement>(null);
  const [aktiv, setAktiv] = useState(0);
  const anzahl = plaene.length;

  const gehe = (ziel: number) => {
    const i = Math.max(0, Math.min(anzahl - 1, ziel));
    setAktiv(i);
    const el = bahn.current;
    // Ohne gemessene Breite (etwa im Test) bleibt es beim Zähler.
    if (el && el.clientWidth > 0 && typeof el.scrollTo === "function") el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  const beimScrollen = () => {
    const el = bahn.current;
    if (!el || el.clientWidth <= 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== aktiv && i >= 0 && i < anzahl) setAktiv(i);
  };

  const taste = (e: KeyboardEvent<HTMLDivElement>) => {
    const ziel = e.key === "ArrowRight" ? aktiv + 1 : e.key === "ArrowLeft" ? aktiv - 1 : e.key === "Home" ? 0 : e.key === "End" ? anzahl - 1 : null;
    if (ziel === null) return;
    e.preventDefault();
    gehe(ziel);
  };

  return (
    <div className="grundriss-streifen" data-testid="grundriss-streifen" role="region" aria-roledescription={t.karussell} aria-label={t.grundrisse}>
      <div className="streifen-leiste screen-only">
        <button type="button" className="streifen-pfeil" aria-label={t.vorherigerGrundriss} disabled={aktiv === 0} onClick={() => gehe(aktiv - 1)} data-testid="grundriss-zurueck">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span className="streifen-zaehler" aria-live="polite" data-testid="grundriss-zaehler">{t.vonGesamt(aktiv + 1, anzahl)}</span>
        <button type="button" className="streifen-pfeil" aria-label={t.naechsterGrundriss} disabled={aktiv === anzahl - 1} onClick={() => gehe(aktiv + 1)} data-testid="grundriss-weiter">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div
        ref={bahn}
        className="streifen-bahn"
        tabIndex={0}
        aria-label={t.grundrisseBlaettern}
        onScroll={beimScrollen}
        onKeyDown={taste}
        data-testid="grundriss-bahn"
      >
        {plaene.map((d, i) => (
          <div key={d.url} className="streifen-eintrag" role="group" aria-roledescription={t.folie} aria-label={t.vonGesamt(i + 1, anzahl)} data-aktiv={i === aktiv ? "true" : undefined}>
            <GrundrissVorschau dokument={d} onZoom={onZoom} />
          </div>
        ))}
      </div>
    </div>
  );
}
