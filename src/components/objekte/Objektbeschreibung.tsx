import { useMemo } from "react";
import { Card } from "@/components/ui/card";

/**
 * Die Objektbeschreibung mit sichtbarer Gliederung.
 *
 * Bisher wurde der Text zeilenweise als Absätze ausgegeben. Überschriften
 * kannte die Darstellung zwar, aber nur zwei Schreibweisen, und Aufzählungen
 * gar nicht. Ein gepflegter Text sah dadurch aus wie eine Textwand, und im
 * Kundengespräch überfliegt niemand eine Textwand.
 *
 * Diese Fassung zerlegt denselben Text in Abschnitte und stellt sie als
 * Blöcke dar. Am Datenmodell ändert sich nichts: Es bleibt ein Textfeld, und
 * bestehende Beschreibungen funktionieren unverändert weiter.
 *
 * Erkannt werden:
 *   # bis #### Überschrift
 *   MAKROLAGE:, MIKROLAGE:, OBJEKTDETAILS:   (Altbestand)
 *   Überschrift:                              (kurze Zeile mit Doppelpunkt)
 *   - Punkt, * Punkt, • Punkt                 (Aufzählungen)
 */

type Block =
  | { art: "ueberschrift"; text: string }
  | { art: "absatz"; text: string }
  | { art: "liste"; punkte: string[] };

/** Langtexte für die Altbestand-Überschriften, damit sie etwas aussagen. */
const ALT_UEBERSCHRIFTEN: Record<string, string> = {
  MAKROLAGE: "Makrolage",
  MIKROLAGE: "Mikrolage",
  OBJEKTDETAILS: "Objektdetails",
};

export function zerlegeBeschreibung(roh: string): Block[] {
  const bloecke: Block[] = [];
  let liste: string[] = [];

  const listeSchliessen = () => {
    if (liste.length > 0) { bloecke.push({ art: "liste", punkte: liste }); liste = []; }
  };

  for (const zeile of (roh || "").split(/\r?\n/)) {
    const t = zeile.trim();
    if (!t) { listeSchliessen(); continue; }

    const md = t.match(/^#{1,4}\s+(.+)$/);
    if (md) { listeSchliessen(); bloecke.push({ art: "ueberschrift", text: md[1].trim() }); continue; }

    const alt = t.match(/^(MAKROLAGE|MIKROLAGE|OBJEKTDETAILS)\s*:\s*(.*)$/i);
    if (alt) {
      listeSchliessen();
      bloecke.push({ art: "ueberschrift", text: ALT_UEBERSCHRIFTEN[alt[1].toUpperCase()] || alt[1] });
      const rest = alt[2]?.trim();
      if (rest) bloecke.push({ art: "absatz", text: rest });
      continue;
    }

    const punkt = t.match(/^[-*•]\s+(.+)$/);
    if (punkt) { liste.push(punkt[1].trim()); continue; }

    /*
     * Kurze Zeile, die mit Doppelpunkt endet, gilt als Überschrift.
     *
     * Die Längengrenze ist wichtig: Ohne sie würde "Die Lage überzeugt: ruhig
     * und trotzdem zentral" zur Überschrift, und der eigentliche Satz wäre
     * weg. Sechzig Zeichen trennt eine Zwischenüberschrift zuverlässig von
     * einem Satz mit Doppelpunkt darin.
     */
    if (t.endsWith(":") && t.length <= 60 && !t.slice(0, -1).includes(". ")) {
      listeSchliessen();
      bloecke.push({ art: "ueberschrift", text: t.slice(0, -1).trim() });
      continue;
    }

    listeSchliessen();
    bloecke.push({ art: "absatz", text: t });
  }
  listeSchliessen();
  return bloecke;
}

export function Objektbeschreibung({
  text,
  titel = "Objektbeschreibung",
  /** Ohne Karte einbetten, etwa wenn schon eine Karte drumherum ist. */
  nackt = false,
}: {
  text?: string;
  titel?: string;
  nackt?: boolean;
}) {
  const bloecke = useMemo(() => zerlegeBeschreibung(text || ""), [text]);
  if (bloecke.length === 0) return null;

  const inhalt = (
    <div className="space-y-3">
      {bloecke.map((b, i) => {
        if (b.art === "ueberschrift") {
          return (
            <h4
              key={i}
              // Erste Überschrift ohne Abstand nach oben, sonst klafft eine
              // Lücke zwischen Kartenrand und erstem Wort.
              className={`text-sm font-semibold uppercase tracking-wide text-primary ${i === 0 ? "" : "pt-3"}`}
            >
              {b.text}
            </h4>
          );
        }
        if (b.art === "liste") {
          return (
            <ul key={i} className="space-y-1">
              {b.punkte.map((p, j) => (
                <li key={j} className="flex gap-2 text-sm leading-relaxed">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          );
        }
        return <p key={i} className="text-sm leading-relaxed">{b.text}</p>;
      })}
    </div>
  );

  if (nackt) return inhalt;

  return (
    <Card className="p-6">
      <div className="mb-3 h-1 w-8 bg-primary" />
      <h3 className="mb-4 font-bold">{titel}</h3>
      {inhalt}
    </Card>
  );
}
