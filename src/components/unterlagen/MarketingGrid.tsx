import { Download } from "lucide-react";
import type { UnterlagenDokument } from "@/lib/unterlagenSeed";

interface MarketingGridProps {
  dokumente: UnterlagenDokument[];
  onClick: (dok: UnterlagenDokument) => void;
}

function Tile({ dok, onClick }: { dok: UnterlagenDokument; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col text-left rounded-2xl border border-border bg-card hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden"
      title="Klicken zum Herunterladen"
    >
      <div className="relative w-full aspect-[16/10] bg-[conic-gradient(at_50%_50%,#f3f3f3_25%,#fafafa_0_50%,#f3f3f3_0_75%,#fafafa_0)] bg-[length:16px_16px] flex items-center justify-center overflow-hidden">
        {dok.vorschauUrl ? (
          <img
            src={dok.vorschauUrl}
            alt={`${dok.name} Vorschau`}
            className="max-h-full max-w-full object-contain p-6 group-hover:scale-[1.02] transition-transform"
          />
        ) : null}
        <div className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow">
          <Download className="h-4 w-4 text-foreground" />
        </div>
      </div>
      <div className="p-4">
        <div className="font-medium text-sm group-hover:text-primary transition-colors">{dok.name}</div>
        {dok.beschreibung && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{dok.beschreibung}</p>
        )}
      </div>
    </button>
  );
}

export function MarketingGrid({ dokumente, onClick }: MarketingGridProps) {
  const logos = dokumente.filter((d) => !d.id.startsWith("m-zoom-desktop-"));
  const hintergruende = dokumente.filter((d) => d.id.startsWith("m-zoom-desktop-"));

  return (
    <div className="space-y-8">
      {logos.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <h3 className="text-sm font-semibold tracking-tight">Logos</h3>
            <span className="text-xs text-muted-foreground">({logos.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {logos.map((d) => (
              <Tile key={d.id} dok={d} onClick={() => onClick(d)} />
            ))}
          </div>
        </section>
      )}

      {hintergruende.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <h3 className="text-sm font-semibold tracking-tight">Hintergründe</h3>
            <span className="text-xs text-muted-foreground">({hintergruende.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {hintergruende.map((d) => (
              <Tile key={d.id} dok={d} onClick={() => onClick(d)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}