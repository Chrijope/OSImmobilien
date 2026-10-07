import { Card } from "@/components/ui/card";
import { Lock } from "lucide-react";

interface Props {
  /** Titel der Platzhalter-Karten (1-2 Stück) */
  titles: string[];
  /** Sperr-Begründung, sichtbar unter dem Schloss */
  reason: string;
}

interface CardProps {
  /** Titel der gesperrten Phase */
  title: string;
  /** Sperr-Begründung, sichtbar unter dem Schloss */
  reason: string;
  /** Zusatzinhalt unter dem Hinweis, etwa ein Schalter. */
  children?: React.ReactNode;
  /** Sprungziel der Abschnittsleiste im Investment, etwa `card-notar-<id>`. */
  id?: string;
}

/**
 * Eine einzelne gesperrte Phasen-Kachel.
 *
 * Sie belegt genau eine Zelle des umgebenden Rasters. Das ist der Grund, warum
 * es sie gibt: Der frühere Sammel-Platzhalter brachte sein eigenes Raster mit
 * und musste deshalb über beide Spalten gelegt werden. Sobald daneben eine
 * einzelne Karte stand, blieb eine Zelle leer und die Paare verschoben sich.
 */
export function LockedPhaseCard({ title, reason, children, id }: CardProps) {
  return (
    <Card id={id} className="p-6 border-dashed border-border/60 bg-muted/20 transition-all duration-500">
      <div className="w-8 h-1 bg-muted-foreground/30 mb-3" />
      <h3 className="font-bold mb-4 text-muted-foreground">{title}</h3>
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg p-3">
        <Lock className="h-4 w-4 shrink-0" />
        <span>{reason}</span>
      </div>
      {children}
    </Card>
  );
}

/**
 * Render-Platzhalter für gesperrte Phasen-Kacheln im Investment-Detail.
 * Hält das Grid-Layout (lg:grid-cols-2) durchgängig sichtbar – analog
 * zum Kundenportal, in dem alle Phasen-Schritte immer dargestellt werden.
 */
export function LockedPhaseGrid({ titles, reason }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {titles.map((title) => (
        <LockedPhaseCard key={title} title={title} reason={reason} />
      ))}
    </div>
  );
}

export default LockedPhaseGrid;