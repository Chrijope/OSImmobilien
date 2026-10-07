import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ObjektData } from "@/lib/objekteStore";
import { getCachedCoords } from "@/lib/geocodeCache";
import { gespeicherteObjektKoordinate } from "@/lib/einheitEmpfehlung";
import { DeutschlandkarteBasis, type KartenPunkt } from "@/components/karte/DeutschlandkarteBasis";

/**
 * Objektstandorte auf der gemeinsamen Deutschlandkarte.
 *
 * Die Darstellung selbst steckt in `DeutschlandkarteBasis` und ist dieselbe wie
 * auf der Marketingseite. Diese Datei kuemmert sich nur darum, aus Objekten
 * Punkte zu machen: gespeicherte Koordinaten lesen und die uebrigen sichtbar
 * ausweisen statt sie stillschweigend wegzulassen.
 *
 * Seit dem 23.09.2026 schlaegt die Karte nichts mehr bei Nominatim nach
 * (Christian: keine unnoetigen Aufrufe). Die Lage kommt aus dem Objekt
 * (`gespeicherteObjektKoordinate`: gemessene Analyse, `meta.koordinaten`,
 * alte Felder), sonst aus dem Zwischenspeicher frueherer Nachschlagungen im
 * Browser, der ohne jede Anfrage gelesen wird. Was dann noch fehlt, misst der
 * naechste Import.
 */

/**
 * Dieselbe Farbe wie auf der Marketingkarte, dort ist Orange die Farbe der
 * Objekte. Beide Karten sprechen damit dieselbe Sprache. Der mittelhelle Ton
 * traegt ausserdem die dunkle Zahl im Gruppenkreis in heller wie dunkler
 * Darstellung.
 */
const OBJEKT_FARBE = "#f59e0b";
const BEZEICHNUNGEN = { objekt: "Objekte" };

function getStoredCoords(obj: ObjektData): [number, number] | null {
  const k = gespeicherteObjektKoordinate(obj);
  return k ? [k.lat, k.lng] : null;
}

function buildAddressQuery(obj: ObjektData): string {
  const parts: string[] = [];
  if (obj.adresse) parts.push(obj.adresse);
  if (obj.plz) parts.push(obj.plz);
  if (obj.ort) parts.push(obj.ort);
  if (parts.length === 0) return "";
  return parts.join(", ") + ", Deutschland";
}

function adressZeile(obj: ObjektData): string {
  return [obj.adresse, obj.plz, obj.ort].filter(Boolean).join(", ");
}

interface Props {
  objekte: ObjektData[];
  onSelect: (id: string) => void;
  /** Adressliste unter der Karte. Vertriebspartner sehen nur die Karte (Christian, 05.10.2026). */
  mitAdressliste?: boolean;
}

type PinData = ObjektData & { coords: [number, number] };

export function DeutschlandKarte({ objekte, onSelect, mitAdressliste = true }: Props) {
  /*
   * Punkte aus gespeicherten Koordinaten und dem Zwischenspeicher, ohne jede
   * Anfrage. Objekte ohne beides stehen unter der Karte und sind anklickbar,
   * statt stillschweigend zu verschwinden.
   */
  const { pins, ohneKoordinaten } = useMemo(() => {
    const mit: PinData[] = [];
    const ohne: ObjektData[] = [];
    for (const obj of objekte) {
      const stored = getStoredCoords(obj);
      if (stored) { mit.push({ ...obj, coords: stored }); continue; }
      const query = buildAddressQuery(obj);
      const cached = query ? getCachedCoords(query) : undefined;
      if (cached) mit.push({ ...obj, coords: [cached.lat, cached.lng] });
      else ohne.push(obj);
    }
    return { pins: mit, ohneKoordinaten: ohne };
  }, [objekte]);

  const punkte = useMemo<KartenPunkt[]>(
    () => pins.map(pin => ({
      id: pin.id,
      name: pin.titel,
      lat: pin.coords[0],
      lng: pin.coords[1],
      typ: "objekt",
      details: [adressZeile(pin), `${pin.wohnungen.length} Wohneinheiten`].filter(Boolean).join(" · "),
    })),
    [pins],
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="w-6 h-1 rounded-full bg-primary" />
        <h3 className="font-semibold text-sm">Objektstandorte in Deutschland</h3>
        <div className="ml-auto flex items-center gap-2">
          {ohneKoordinaten.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {ohneKoordinaten.length} ohne Koordinaten, Lage noch nicht gemessen
            </span>
          )}
          <Badge variant="secondary" className="text-xs">{`${pins.length} Objekte`}</Badge>
        </div>
      </div>
      <DeutschlandkarteBasis
        punkte={punkte}
        farben={{ objekt: OBJEKT_FARBE }}
        bezeichnungen={BEZEICHNUNGEN}
        aktionText="Zum Objekt"
        onPunktKlick={(punkt) => onSelect(punkt.id)}
        // Mehrere Wohnungen in einem Haus koennen als eigene Objekte gepflegt
        // sein. Die teilen sich dann genau eine Koordinate und laegen ohne das
        // hier in der Nahansicht unsichtbar uebereinander.
        immerGruppieren
        className="w-full rounded-lg overflow-hidden border"
        style={{ height: "500px" }}
      />
      {mitAdressliste && <div className="flex flex-wrap gap-3 mt-4 justify-center">
        {pins.map(pin => (
          <button
            key={pin.id}
            onClick={() => onSelect(pin.id)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <div className="w-2 h-2 rounded-full" style={{ background: OBJEKT_FARBE }} />
            <span>{pin.adresse ? `${pin.adresse}, ${pin.ort}` : pin.ort}</span>
            <span className="text-muted-foreground/50">({pin.wohnungen.length} WE)</span>
          </button>
        ))}
      </div>}
      {mitAdressliste && ohneKoordinaten.length > 0 && (
        <div className="mt-4 pt-3 border-t">
          <p className="text-xs text-muted-foreground mb-2">
            Nicht auf der Karte, weil sich zur Adresse keine Koordinaten finden lassen:
          </p>
          <div className="flex flex-wrap gap-3">
            {ohneKoordinaten.map(obj => (
              <button
                key={obj.id}
                onClick={() => onSelect(obj.id)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                <div className="w-2 h-2 rounded-full border border-muted-foreground/50" />
                <span>{obj.titel}</span>
                {adressZeile(obj) && <span className="text-muted-foreground/50">({adressZeile(obj)})</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
