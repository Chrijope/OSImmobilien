import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { vertragsZusammenfassung } from "@/lib/vertragsZusammenfassung";
import type { Bewerber } from "@/lib/bewerbungStore";

interface Props {
  /** Der Bewerber-Datensatz mit den Vertragsdaten, falls verknüpft. */
  bewerber?: Bewerber;
  /**
   * Dezente Zeile statt der Karte, wenn kein Bewerber verknüpft ist oder noch
   * kein Paket gewählt wurde (z. B. in der Nutzerverwaltung). Ohne diesen Text
   * wird in dem Fall gar nichts gerendert (z. B. im Vertrags-Tab, wo darunter
   * ohnehin die Konfiguration steht).
   */
  fallbackText?: string;
  /**
   * Ohne eigene Karte und Überschrift rendern, um die Zusammenfassung in eine
   * bestehende Karte einzubetten (Vertrags-Tab: Kasten "Aktuelles Paket").
   */
  eingebettet?: boolean;
}

/**
 * Kompakte Karte "Vertrag auf einen Blick": die wichtigsten Rahmenparameter
 * des Vertrags sofort lesbar, ohne das PDF zu öffnen. Inhalte kommen aus
 * vertragsZusammenfassung() und damit aus denselben Regeln wie der
 * Vertragsgenerator.
 */
export function VertragAufEinenBlick({ bewerber, fallbackText, eingebettet }: Props) {
  const zeilen = bewerber ? vertragsZusammenfassung(bewerber) : null;
  if (!zeilen || zeilen.length === 0) {
    if (!fallbackText) return null;
    return <p className="text-xs text-muted-foreground">{fallbackText}</p>;
  }
  const raster = (
    <div className="grid sm:grid-cols-2 gap-3">
      {zeilen.map((z) => (
        <div key={z.label}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            {z.label}
            {z.individuell && (
              <Badge
                variant="outline"
                className="text-[9px] h-4 px-1 border-primary/50 text-primary normal-case"
              >
                individuell
              </Badge>
            )}
          </p>
          <p className="text-sm font-medium text-foreground">{z.wert}</p>
        </div>
      ))}
    </div>
  );
  if (eingebettet) return raster;
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Vertrag auf einen Blick</h3>
      </div>
      {raster}
    </Card>
  );
}
