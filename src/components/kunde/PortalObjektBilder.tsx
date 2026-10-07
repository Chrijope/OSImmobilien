import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Die Bilder des Kaufvorgangs im Kundenportal, zum Durchblättern.
 *
 * Christian am 22.09.2026: Der Kunde soll nicht nur das Titelbild sehen,
 * sondern alle Bilder, die der Vertrieb am Investment hinterlegt hat.
 *
 * Pfeile und Punkte erscheinen erst ab dem zweiten Bild. Ein Pfeil, der nichts
 * weiterblättert, sieht nach einem Fehler aus. Ein Bild, das nicht mehr
 * erreichbar ist, wird übersprungen, statt einen leeren Rahmen zu hinterlassen:
 * Im Portal sitzt der Kunde davor, nicht der Vertrieb, und kann nichts richten.
 */
export function PortalObjektBilder({
  bilder,
  alt,
  texte,
}: {
  bilder: string[];
  alt: string;
  /** Beschriftungen für Vorlesegeräte, aus den Übersetzungen des Portals. */
  texte: { vorheriges: string; naechstes: string; bildNr: (nr: number, gesamt: number) => string };
}) {
  const [nr, setNr] = useState(0);
  const [kaputt, setKaputt] = useState<string[]>([]);

  const gezeigt = bilder.filter((bild) => !kaputt.includes(bild));
  if (gezeigt.length === 0) return null;

  const aktuell = gezeigt[Math.min(nr, gezeigt.length - 1)];
  const blaettern = (richtung: 1 | -1) =>
    setNr((bisher) => (bisher + richtung + gezeigt.length) % gezeigt.length);

  return (
    <div className="relative rounded-lg overflow-hidden border">
      <img
        src={aktuell}
        alt={alt}
        loading="lazy"
        className="w-full h-44 sm:h-56 object-cover"
        onError={() => setKaputt((bisher) => [...bisher, aktuell])}
      />
      {gezeigt.length > 1 && (
        <>
          <button
            type="button"
            aria-label={texte.vorheriges}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow backdrop-blur hover:bg-background"
            onClick={() => blaettern(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={texte.naechstes}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow backdrop-blur hover:bg-background"
            onClick={() => blaettern(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {gezeigt.map((bild, i) => (
              <button
                key={bild}
                type="button"
                aria-label={texte.bildNr(i + 1, gezeigt.length)}
                aria-current={i === Math.min(nr, gezeigt.length - 1)}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === Math.min(nr, gezeigt.length - 1) ? "bg-background" : "bg-background/50"
                }`}
                onClick={() => setNr(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
