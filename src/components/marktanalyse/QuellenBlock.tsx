import { Card } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import { quellenFor, type Quelle } from "@/data/marktanalyseQuellen";

interface Props {
  quellenIds: string[];
}

const KATEGORIE_LABEL: Record<Quelle["kategorie"], string> = {
  statistik: "Statistik",
  immo: "Immobilienmarkt",
  wirtschaft: "Wirtschaft & Arbeit",
  geo: "Geo-Daten",
};

export function QuellenBlock({ quellenIds }: Props) {
  const quellen = quellenFor(quellenIds);
  if (!quellen.length) return null;
  const gruppen = quellen.reduce<Record<string, Quelle[]>>((acc, q) => {
    (acc[q.kategorie] ||= []).push(q);
    return acc;
  }, {});
  return (
    <Card className="mt-8 p-6 bg-muted/30">
      <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
        Quellenangaben
      </h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Object.entries(gruppen).map(([kat, qs]) => (
          <div key={kat}>
            <div className="text-xs font-medium text-foreground/70 mb-2">
              {KATEGORIE_LABEL[kat as Quelle["kategorie"]]}
            </div>
            <ul className="space-y-1.5">
              {qs.map((q) => (
                <li key={q.id} className="text-xs">
                  <a
                    href={q.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {q.name}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  <div className="text-muted-foreground">
                    Stand: {q.stand}
                    {q.lizenz ? ` · ${q.lizenz}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">
        Alle Kennzahlen sind Referenzwerte aus öffentlichen bzw. lizenzierten Quellen und dienen der Marktorientierung. Für konkrete Kauf- oder Finanzierungsentscheidungen bitte immer aktuelle, objektspezifische Daten prüfen.
      </p>
    </Card>
  );
}