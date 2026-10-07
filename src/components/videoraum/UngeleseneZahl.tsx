import { mitWerten } from "@/lib/videoraumAnrede";
import { videoraumGastTexte } from "@/lib/videoraumGastTexte";
import type { Sprache } from "@/lib/seitenSprache";

/**
 * Die kleine rote Zahl an einem Chatknopf.
 *
 * Sie steht an drei Stellen: an der Leiste des Gespraechs, an der schmalen
 * Leiste oben im CRM und im schwebenden Fenster auf dem Schreibtisch. Deshalb
 * gibt es sie einmal und nicht dreimal, sonst waere sie nach der naechsten
 * Aenderung an drei Orten verschieden gross.
 *
 * Sie liegt absolut und ausserhalb des Textflusses. Das ist nicht Kosmetik,
 * sondern Bedingung: Die Leiste oben im CRM schiebt den Seiteninhalt nach
 * unten, und `LeistenBereich` misst ihre Hoehe. Eine Zahl, die im Fluss laege,
 * machte die Leiste hoeher und schoebe damit jede Seite im CRM mit.
 *
 * Alle Klassen sind fest hingeschrieben und nicht zusammengesetzt. Im
 * schwebenden Fenster wirkt nur, was beim Bauen in die Stilvorlage gekommen
 * ist, siehe `schwebendesFenster`; ein zur Laufzeit gebauter Klassenname
 * stuende dort nicht darin.
 */
export function UngeleseneZahl({
  zahl,
  gross = false,
  sprache = "de",
}: {
  zahl: number;
  /** Etwas groesser, fuer die Knoepfe im Gespraech. */
  gross?: boolean;
  /** Sprache des Vorlesetextes, Vorgabe Deutsch. Nur die Gastseite reicht sie herein. */
  sprache?: Sprache;
}) {
  if (zahl <= 0) return null;
  const t = videoraumGastTexte(sprache).neben;
  return (
    <span
      data-pruefung="ungelesene-zahl"
      aria-label={zahl === 1 ? t.ungelesenEins : mitWerten(t.ungelesenMehr, { zahl })}
      className={
        gross
          ? "absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#E5372B] px-1 text-[10px] font-bold tabular-nums text-white"
          : "absolute -right-1 -top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#E5372B] px-1 text-[9.5px] font-bold leading-none tabular-nums text-white"
      }
    >
      {zahl > 99 ? "99+" : zahl}
    </span>
  );
}
