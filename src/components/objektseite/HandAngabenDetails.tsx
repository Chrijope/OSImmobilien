import { Car, ListOrdered } from "lucide-react";
import { rohdaten, type MitInvestagonRohdaten } from "@/lib/investagonFelder";
import { Detail } from "./Bausteine";

const prozent = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;

/**
 * Stellplatz und Mietart und Kaufpreisraten nach MaBV
 * (30.10.2026, damit alles aus Investagon auch von Hand angelegt sichtbar
 * ist). Der Rundgang steht oben bei den Merkmalen (`MerkmalTags`). Liest
 * wie alle Objektangaben über `rohdaten`: Hand vor Investagon.
 * Ohne Angabe erscheint nichts.
 */
export function HandAngabenDetails({ objekt }: { objekt: MitInvestagonRohdaten }) {
  const roh = rohdaten(objekt) ?? {};
  const stellplatz = typeof roh.parking_type === "string" ? roh.parking_type : undefined;
  const mietart = typeof roh.rent_type === "string" ? roh.rent_type : undefined;
  const raten = Array.isArray(roh.mabv_raten) ? (roh.mabv_raten as Array<{ bezeichnung: string; prozent: number }>) : [];

  return (
    <>
      {(stellplatz || mietart) && (
        <Detail icon={<Car className="h-3.5 w-3.5" />} label="Stellplatz und Miete"
          wert={stellplatz || "Keine Angabe"} unter={mietart ? `Mietart: ${mietart}` : undefined} />
      )}
      {raten.length > 0 && (
        <Detail icon={<ListOrdered className="h-3.5 w-3.5" />} label="Kaufpreisraten nach MaBV"
          wert={`${raten.length} Raten, ${prozent(raten.reduce((s, r) => s + r.prozent, 0))}`}
          unter={<ol className="list-decimal pl-4">{raten.map((r, i) => <li key={i}>{r.bezeichnung}: {prozent(r.prozent)}</li>)}</ol>} />
      )}
    </>
  );
}
