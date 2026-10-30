import { View } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { anzeigbareMerkmale, einheitQuelle, rohdaten, type EinheitQuelle, type Merkmal, type MitInvestagonRohdaten } from "@/lib/investagonFelder";

const schluessel = (m: Merkmal) => `${m.bezeichnung}\u0000${m.wert}`;

/**
 * Die Merkmale eines Objekts oder einer Einheit. Die eigenen der Einheit
 * zuerst; ohne sie die des Objekts. Auf der Objektseite ohne eigene Merkmale
 * die, die alle Einheiten gemeinsam haben (Investagon führt Tags oft nur an
 * den Einheiten).
 */
export function merkmalTags(objekt: MitInvestagonRohdaten & { wohnungen?: EinheitQuelle[] }, einheit?: EinheitQuelle): Merkmal[] {
  if (einheit) {
    const eigene = anzeigbareMerkmale(einheitQuelle(einheit));
    if (eigene.length) return eigene;
  }
  const amObjekt = anzeigbareMerkmale(objekt);
  if (amObjekt.length || einheit) return amObjekt;
  const jeEinheit = (objekt.wohnungen ?? []).map((w) => anzeigbareMerkmale(einheitQuelle(w)));
  if (!jeEinheit.length || !jeEinheit[0].length) return [];
  return jeEinheit[0].filter((m) => jeEinheit.every((liste) => liste.some((x) => schluessel(x) === schluessel(m))));
}

/**
 * Die Merkmale als Tags und daneben der virtuelle Rundgang, wenn ein Link
 * gepflegt ist (Christian, 30.10.2026). Ohne beides nichts.
 */
export function MerkmalTags({ objekt, einheit, className }: { objekt: MitInvestagonRohdaten & { wohnungen?: EinheitQuelle[] }; einheit?: EinheitQuelle; className?: string }) {
  const tags = merkmalTags(objekt, einheit);
  const link = rohdaten(objekt)?.virtual_tour_url;
  const rundgang = typeof link === "string" && /^https:\/\//i.test(link) ? link : undefined;
  if (!tags.length && !rundgang) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className ?? ""}`} data-testid="merkmal-tags">
      {rundgang && (
        <a href={rundgang} target="_blank" rel="noopener noreferrer" data-testid="rundgang-link"
          className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          <View className="h-3 w-3" /> Virtueller Rundgang
        </a>
      )}
      {tags.map((m) => (
        <Badge key={schluessel(m)} variant="outline" className="rounded-full border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-foreground">
          {m.wert ? `${m.bezeichnung}: ${m.wert}` : m.bezeichnung}
        </Badge>
      ))}
    </div>
  );
}
