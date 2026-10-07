// Karte aller gefilterten Standorte.
//
// Die Koordinaten lagen für alle 351 Standorte im Datenbestand und wurden von
// keiner einzigen Ansicht genutzt. Serverseitig arbeiten die Sync-Aufträge
// damit, im Frontend waren sie tot. Eine Liste von 351 Zeilen beantwortet die
// Frage "wo liegt das eigentlich" nicht, eine Karte schon.
//
// Die Farbe des Punktes zeigt die Bruttomietrendite, die Größe die
// Einwohnerzahl. Damit ist das Preis-Rendite-Gefälle zwischen Süden und Westen
// auf einen Blick zu sehen.

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { bruttomietrendite, type Standort } from "@/data/marktanalyseSeed";

const MITTE: [number, number] = [51.2, 10.4];

/** Rendite in eine Farbe von Rot über Gelb nach Grün. */
function renditeFarbe(r: number): string {
  if (r >= 5) return "#059669";
  if (r >= 4) return "#65a30d";
  if (r >= 3.2) return "#ca8a04";
  if (r >= 2.5) return "#ea580c";
  return "#dc2626";
}

function radius(einwohner: number): number {
  // Wurzel, damit München nicht die halbe Karte einnimmt.
  return Math.max(4, Math.min(18, Math.sqrt(einwohner) / 180));
}

export function StandortKarte({
  standorte,
  markiert = [],
  onWaehlen,
  hoehe = 460,
}: {
  standorte: Standort[];
  /** Ids, die hervorgehoben werden, etwa die Vergleichsauswahl. */
  markiert?: string[];
  onWaehlen?: (id: string) => void;
  hoehe?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const karte = useRef<L.Map | null>(null);
  const ebene = useRef<L.LayerGroup | null>(null);
  // In einer Ref halten, damit der Zeichen-Effekt nicht an der Identität einer
  // Pfeilfunktion hängt und bei jedem Tastendruck im Suchfeld neu läuft.
  const waehlen = useRef(onWaehlen);
  waehlen.current = onWaehlen;

  useEffect(() => {
    if (!container.current || karte.current) return;
    const k = L.map(container.current, {
      center: MITTE,
      zoom: 6,
      scrollWheelZoom: false,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 18,
    }).addTo(k);
    ebene.current = L.layerGroup().addTo(k);
    karte.current = k;
    return () => {
      k.remove();
      karte.current = null;
      ebene.current = null;
    };
  }, []);

  useEffect(() => {
    const k = karte.current;
    const e = ebene.current;
    if (!k || !e) return;
    e.clearLayers();

    const punkte: L.LatLngExpression[] = [];
    for (const s of standorte) {
      if (!s.lat || !s.lng) continue;
      const r = bruttomietrendite(s);
      const hervor = markiert.includes(s.id);
      const kreis = L.circleMarker([s.lat, s.lng], {
        radius: radius(s.einwohner),
        color: hervor ? "#0f1621" : renditeFarbe(r),
        weight: hervor ? 3 : 1,
        fillColor: renditeFarbe(r),
        fillOpacity: 0.75,
      });
      kreis.bindTooltip(
        `<b>${s.name}</b><br>${r.toFixed(2)} % Rendite<br>${s.kaufpreis_qm_wohnung_eur.toLocaleString("de-DE")} €/m²`,
        { direction: "top" },
      );
      if (waehlen.current) kreis.on("click", () => waehlen.current?.(s.id));
      kreis.addTo(e);
      punkte.push([s.lat, s.lng]);
    }

    if (punkte.length > 1) {
      k.fitBounds(L.latLngBounds(punkte).pad(0.1), { animate: false });
    } else if (punkte.length === 1) {
      k.setView(punkte[0], 10, { animate: false });
    }
  }, [standorte, markiert]);

  return (
    <div className="space-y-2">
      <div
        ref={container}
        style={{ height: hoehe }}
        className="w-full rounded-lg overflow-hidden border z-0"
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Bruttomietrendite:</span>
        {[
          { l: "unter 2,5 %", f: "#dc2626" },
          { l: "2,5 – 3,2 %", f: "#ea580c" },
          { l: "3,2 – 4 %", f: "#ca8a04" },
          { l: "4 – 5 %", f: "#65a30d" },
          { l: "ab 5 %", f: "#059669" },
        ].map((x) => (
          <span key={x.l} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.f }} />
            {x.l}
          </span>
        ))}
        <span className="ml-auto">Punktgröße: Einwohnerzahl</span>
      </div>
    </div>
  );
}
