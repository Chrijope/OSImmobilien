import { formatDatum } from "@/lib/utils";
import { getEhemaligeBerater, getUebergaben } from "@/lib/beraterHistorie";
import { grundSatz } from "@/lib/uebergabeGrund";
import type { KundeData } from "@/lib/kundenStore";

/**
 * Wer den Kontakt vorher hatte und warum er gewechselt ist.
 *
 * Zwei Zeilen der Lead- und Verwaltungsdaten, damit der neue Vertriebspartner
 * die Übergabe auch dann noch nachlesen kann, wenn die Glocke längst gelesen
 * ist. Quelle ist allein `meta.beraterHistorie`, es gibt kein zweites Feld.
 *
 * Steht als eigene Komponente hier, weil `KundenDetail.tsx` diesen Block an
 * zwei Stellen zeigt: einmal mit Person 2 und einmal ohne.
 */
export function BeraterVerlauf({ kunde }: { kunde: KundeData }) {
  const ehemalige = getEhemaligeBerater(kunde);
  if (ehemalige.length === 0) return null;

  const uebergaben = getUebergaben(kunde);

  return (
    <>
      <span className="font-semibold align-top">Ehemaliger Vertriebspartner:</span>
      <span className="text-sm">
        {ehemalige.map((e, idx) => (
          <div key={idx} className="text-muted-foreground">
            {e.name}
            {e.bis && <span className="text-xs"> · bis {formatDatum(e.bis)}</span>}
          </div>
        ))}
      </span>

      {uebergaben.length > 0 && (
        <>
          <span className="font-semibold align-top">Grund der Übergabe:</span>
          <span className="text-sm">
            {uebergaben.map((u, idx) => {
              const grund = grundSatz({ key: u.grund, text: u.grundText });
              return (
                <div key={idx} className="text-muted-foreground">
                  {grund || "Ohne Angabe"}
                  <span className="text-xs">
                    {" · "}
                    {u.von || "offener Pool"} an {u.an}
                    {u.am ? `, ${formatDatum(u.am)}` : ""}
                  </span>
                </div>
              );
            })}
          </span>
        </>
      )}
    </>
  );
}
