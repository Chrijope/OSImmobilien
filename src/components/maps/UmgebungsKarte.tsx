import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import { gespeicherteObjektKoordinate } from "@/lib/einheitEmpfehlung";
import { messFehlerHinweis, umgebungAusAnalyse } from "@/lib/umgebungspunkte";
import { Umgebungsansicht } from "@/components/umgebung/Umgebungsansicht";

/**
 * Karte mit Objektnadel und Umgebung auf Objekt- und Einheitsseite.
 *
 * SEIT DEM 23.09.2026 OHNE ABFRAGE AUS DEM BROWSER
 *
 * Vorher suchte diese Karte bei jedem Öffnen die Adresse bei Photon (Komoot)
 * und fragte die Umgebung live bei Overpass ab; die Objektübersicht lud das
 * sogar für alle Objekte im Voraus. Christian will keine unnötigen Aufrufe:
 * Der Standort wird einmal gemessen und fest am Objekt hinterlegt. Die Karte
 * liest nur noch, was dort steht, in derselben Reihenfolge wie im Exposé:
 *
 *   1. Mittelpunkt und Einrichtungen der gemessenen Analyse,
 *   2. sonst die gespeicherte Lage `meta.koordinaten`, nur mit der Nadel,
 *   3. sonst ein ruhiger Satz und ein Link zu OpenStreetMap, den man selbst
 *      anklickt.
 *
 * Geladen werden nur die Kartenbilder von OpenStreetMap.
 *
 * SEIT DEM 24.09.2026 MIT UMGEBUNGSPUNKTEN UND LAGEKASTEN
 *
 * Karte und Kasten sind dieselben wie im Exposé und in der Kundenansicht
 * (`Umgebungsansicht`): Punkte farbig nach Kategorie mit Legende, daneben je
 * Kategorie die nächsten Orte mit Entfernung. Vorher standen hier unter der
 * Karte nur drei Abzeichen mit dem jeweils nächsten Ort.
 */

export function UmgebungsKarte({
  adresse,
  titel,
  /** Höhe der Karte. Auf der Wohnungsseite darf sie flacher sein. */
  hoehe = 340,
  /** `meta` des Objekts: gemessene Analyse und gespeicherte Lage. */
  meta,
}: {
  adresse: string;
  titel?: string;
  hoehe?: number;
  meta?: unknown;
}) {
  const umgebung = useMemo(() => umgebungAusAnalyse((meta as { standortanalyse?: unknown } | null)?.standortanalyse), [meta]);
  const lage = umgebung?.zentrum ?? gespeicherteObjektKoordinate({ meta: (meta || {}) as Record<string, unknown> });
  const fehler = umgebung ? undefined : messFehlerHinweis(meta);

  if (!lage) {
    const osm = `https://www.openstreetmap.org/search?query=${encodeURIComponent(adresse)}`;
    return (
      <Card className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground" data-testid="umgebungskarte-ohne-lage">
        <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
        <p>Die Karte zur Lage folgt. Die Lage wird automatisch aus der Adresse gemessen und erscheint hier, sobald sie vorliegt.</p>
        {fehler && <p className="max-w-md text-xs" data-testid="umgebungskarte-fehler">{fehler}</p>}
        {adresse.trim() && <a href={osm} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">In OpenStreetMap ansehen</a>}
      </Card>
    );
  }

  return (
    <Card className="p-3 sm:p-4" data-testid="umgebungskarte">
      <Umgebungsansicht
        umgebung={umgebung}
        lage={lage}
        adresse={adresse}
        titel={titel || adresse}
        variante="crm"
        kartenHoehe={hoehe}
        zusatz={fehler}
      />
    </Card>
  );
}
