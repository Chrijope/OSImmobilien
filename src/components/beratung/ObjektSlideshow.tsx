// Bildergalerie zu einem durchgerechneten Objekt.
//
// Bewusst manuell: Der Berater klickt weiter, wenn er soweit ist. Eine
// automatisch laufende Galerie nimmt einem im Gespräch die Kontrolle darüber,
// worüber gerade geredet wird, und der Kunde schaut dem Bild hinterher statt
// zuzuhören.

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import type { ObjektBild } from "@/data/rechenbeispiele";

export function ObjektSlideshow({
  bilder,
  adresse,
  name,
  beschriftung = { zurueck: "Vorheriges Bild", weiter: "Nächstes Bild" },
}: {
  bilder: ObjektBild[];
  adresse: string;
  name: string;
  /** Beschriftung der Pfeile für Bildschirmleser, in der Sprache der Präsentation. */
  beschriftung?: { zurueck: string; weiter: string };
}) {
  const [index, setIndex] = useState(0);

  // Beim Wechsel des Objekts wieder beim ersten Bild anfangen.
  useEffect(() => setIndex(0), [adresse]);

  if (bilder.length === 0) return null;

  const weiter = () => setIndex((i) => (i + 1) % bilder.length);
  const zurueck = () => setIndex((i) => (i - 1 + bilder.length) % bilder.length);
  const aktuell = bilder[Math.min(index, bilder.length - 1)];

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border bg-muted/30 group">
        <img
          src={aktuell.pfad}
          alt={aktuell.titel ? `${name}, ${aktuell.titel}` : name}
          className="w-full h-[clamp(240px,42vh,520px)] object-cover"
          loading="lazy"
        />

        {/* Adresse liegt auf dem Bild, damit im Gespräch klar ist, was man sieht. */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm sm:text-base truncate">{name}</p>
              <p className="text-white/80 text-[11px] sm:text-xs flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{adresse}</span>
              </p>
            </div>
          </div>
        </div>

        {bilder.length > 1 && (
          <>
            <button
              onClick={zurueck}
              aria-label={beschriftung.zurueck}
              className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/45 text-white flex items-center justify-center backdrop-blur-sm transition hover:bg-black/65 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={weiter}
              aria-label={beschriftung.weiter}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/45 text-white flex items-center justify-center backdrop-blur-sm transition hover:bg-black/65 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <span className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white backdrop-blur-sm">
              {index + 1} / {bilder.length}
            </span>
          </>
        )}
      </div>

      {bilder.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {bilder.map((b, i) => (
            <button
              key={b.pfad}
              onClick={() => setIndex(i)}
              aria-label={b.titel}
              className={`relative shrink-0 overflow-hidden rounded-lg border-2 transition ${
                i === index ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <img src={b.pfad} alt="" className="h-14 w-20 object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
