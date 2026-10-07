import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Map as MapIcon } from "lucide-react";
import { UmgebungsKarte } from "@/components/maps/UmgebungsKarte";

/**
 * Knopf, der die Lagekarte groß öffnet.
 *
 * Die Karte selbst steckt in `UmgebungsKarte` und ist dieselbe wie die fest
 * eingebettete auf Objekt- und Wohnungsseite. Vorher hatte dieser Knopf eine
 * eigene, zweite Fassung mit eigenem Kartenaufbau und eigener
 * OpenStreetMap-Abfrage.
 *
 * Genau daran hing ein Fehler: Der Abfrage fehlte das Element-Präfix, sie war
 * ungültig, und der Dialog hat nie einen einzigen Umgebungspunkt gezeigt. Weil
 * die Karte selbst erschien, ist es niemandem aufgefallen. Mit nur noch einer
 * Fassung kann das nicht wieder auseinanderlaufen.
 *
 * Die Karte zeigt seit dem 23.09.2026 nur, was am Objekt gespeichert ist
 * (`meta`: gemessene Analyse und Lage), und fragt keinen Geodienst mehr.
 */
export function UmgebungsKarteButton({
  address,
  titel,
  meta,
}: {
  address: string;
  titel?: string;
  /** `meta` des Objekts, aus dem die Karte Lage und Umgebung liest. */
  meta?: unknown;
}) {
  const [offen, setOffen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOffen(true)} className="gap-1.5">
        <MapIcon className="h-3.5 w-3.5" />
        Karte
      </Button>

      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent className="max-w-4xl p-0">
          <DialogHeader className="px-6 pb-2 pt-6">
            <DialogTitle>{titel || "Lage und Umgebung"}</DialogTitle>
            <p className="text-sm text-muted-foreground">{address}</p>
          </DialogHeader>
          <div className="px-6 pb-6">
            {/* Erst beim Öffnen aufbauen: Leaflet braucht eine sichtbare
                Fläche, sonst bleibt die Karte grau. */}
            {offen && <UmgebungsKarte adresse={address} titel={titel} hoehe={420} meta={meta} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
