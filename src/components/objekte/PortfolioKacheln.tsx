import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Building2, Home, Euro, Layers, AlertCircle, Tag, Hammer } from "lucide-react";
import type { ObjektData } from "@/lib/objekteStore";
import { portfolioKennzahlen, STRUKTUR_LABEL, type ObjektStruktur } from "@/lib/objektKlassen";

/**
 * Portfolioübersicht über den gesamten Bestand, nur für Admins.
 *
 * Die Objektliste zeigt jedes Objekt einzeln. Was fehlte, war die Summe:
 * wie viele Einheiten insgesamt im Bestand liegen, was sie zusammen wert
 * sind und wie sich der Bestand auf die Klassen verteilt.
 */

const euro = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Große Zahl kurz: 12.747.500 € wird zu 12,7 Mio €. */
const kurz = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mio €`;
  if (n >= 1_000) return `${Math.round(n / 1_000).toLocaleString("de-DE")} Tsd €`;
  return euro(n);
};

function Kachel({
  icon: Icon, titel, wert, zusatz, className,
}: {
  icon: typeof Building2; titel: string; wert: string; zusatz?: React.ReactNode; className?: string;
}) {
  return (
    <Card className={className ? `p-4 ${className}` : "p-4"}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{titel}</p>
          {/* Umbrechen statt kürzen: Neben der Seitenleiste auf dem Tablet stand sonst „185 Tsd € – 1,2 M…“. */}
          <p className="mt-0.5 break-words text-xl font-bold tabular-nums">{wert}</p>
          {zusatz && <div className="mt-1.5 space-y-0.5">{zusatz}</div>}
        </div>
      </div>
    </Card>
  );
}

function Verteilung({ eintraege }: { eintraege: [string, number][] }) {
  const sichtbar = eintraege.filter(([, n]) => n > 0);
  if (sichtbar.length === 0) {
    return <p className="text-xs text-muted-foreground">Noch nichts erfasst</p>;
  }
  return (
    <>
      {sichtbar.map(([label, n]) => (
        <p key={label} className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{label}</span>
          <span className="shrink-0 font-medium tabular-nums text-foreground">{n}</span>
        </p>
      ))}
    </>
  );
}

export function PortfolioKacheln({ objekte }: { objekte: ObjektData[] }) {
  const k = useMemo(() => portfolioKennzahlen(objekte), [objekte]);

  if (k.objekte === 0) return null;

  const spanne = k.preisVon > 0
    ? (k.preisVon === k.preisBis ? euro(k.preisVon) : `${kurz(k.preisVon)} – ${kurz(k.preisBis)}`)
    : "–";

  // Ohne Bauzustand gibt es nur drei Spalten, sonst bliebe rechts eine leer.
  const mitBauzustand = k.bauzustaende.length > 0;

  return (
    /*
     * Anordnung nach Christians Wunsch vom 23.09.2026: vorn die vier kleinen
     * Kacheln als 2 mal 2, dahinter Anlageklassen und Bauzustand ueber die
     * volle Hoehe. Vorher standen die beiden grossen unter einer Viererreihe,
     * und rechts daneben blieb die halbe Breite leer.
     *
     *   Handy:  eine Spalte, alles untereinander.
     *   ab sm:  zwei Spalten. Oben die vier kleinen als 2 mal 2, darunter
     *           die beiden grossen nebeneinander.
     *   ab xl:  vier Spalten. Die kleinen belegen die ersten beiden, die
     *           grossen je eine ueber beide Zeilen.
     *
     * Vier Spalten erst ab xl, nicht ab lg: Zwischen 1024 und 1280 Pixel
     * bleiben neben der Seitenleiste nur 180 bis 240 Pixel je Kachel, und
     * Kaufpreisspanne, "Mehrere Einheiten" und laengere Anlageklassen
     * wurden mit Auslassungspunkten gekuerzt. Mit zwei Spalten passen sie.
     *
     * Die kleinen stecken in einem eigenen Raster, das spaltenweise fuellt
     * (`grid-flow-col`). So bleibt die Quellreihenfolge die bisherige, und
     * damit auch die Reihenfolge auf dem Handy und fuer Vorleseprogramme.
     * `grid-rows-2` teilt die Hoehe zu gleichen Teilen: Beide Zeilen werden
     * zusammen so hoch wie die grossen Kacheln daneben. Die grossen strecken
     * sich als Rasterelement von selbst, ihre Liste bleibt oben.
     */
    <div className={`mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 ${mitBauzustand ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
      <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2 sm:grid-rows-2 sm:grid-flow-col">
        <Kachel
          icon={Home}
          titel="Einheiten gesamt"
          wert={String(k.einheiten)}
          zusatz={
            <p className="text-xs text-muted-foreground">
              in {k.objekte} {k.objekte === 1 ? "Objekt" : "Objekten"}
            </p>
          }
        />
        <Kachel
          icon={Euro}
          titel="Portfoliowert"
          wert={kurz(k.portfoliowert)}
          zusatz={<p className="text-xs text-muted-foreground">Summe aller Einheiten</p>}
        />
        <Kachel
          icon={Layers}
          titel="Kaufpreis je Einheit"
          wert={spanne}
          zusatz={<p className="text-xs text-muted-foreground">günstigste bis teuerste</p>}
        />
        <Kachel
          icon={Building2}
          titel="Vermarktungsart"
          wert={String(Object.values(k.struktur).filter((n) => n > 0).length)}
          zusatz={
            <Verteilung
              eintraege={(Object.keys(k.struktur) as ObjektStruktur[])
                .map((s) => [STRUKTUR_LABEL[s], k.struktur[s]] as [string, number])}
            />
          }
        />
      </div>
      <Kachel
        icon={Tag}
        titel="Anlageklassen"
        wert={String(k.anlageklassen.length)}
        // Ohne Bauzustand steht sie ab sm allein in ihrer Zeile und nimmt
        // deshalb die volle Breite; ab xl fuellt sie die dritte Spalte.
        className={mitBauzustand ? undefined : "sm:col-span-2 xl:col-span-1"}
        zusatz={
          <>
            {/* Dieselbe Angabe, die als Badge an der Objektkachel haengt und
                den Filter darueber steuert. */}
            <Verteilung eintraege={k.anlageklassen} />
            {/* Fehlende Angaben ausweisen statt verschweigen: Sonst liest sich
                eine unvollstaendige Verteilung wie eine vollstaendige. */}
            {k.klasseOffen > 0 && (
              <p className="flex items-center gap-1 pt-0.5 text-xs text-amber-600 dark:text-amber-500">
                <AlertCircle className="h-3 w-3 shrink-0" />
                {k.klasseOffen} ohne Angabe
              </p>
            )}
          </>
        }
      />
      {mitBauzustand && (
        <Kachel
          icon={Hammer}
          titel="Bauzustand"
          wert={String(k.bauzustaende.length)}
          zusatz={<Verteilung eintraege={k.bauzustaende} />}
        />
      )}
    </div>
  );
}
