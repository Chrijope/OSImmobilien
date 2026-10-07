import moreImmoLogo from "@/assets/moreimmo-logo.png";
import moreFinanceLogo from "@/assets/morefinance-logo.svg";

/*
 * Kleiner Partnerhinweis mit Logo in den Leistungskarten der
 * Beratungspräsentationen (Abschnitt 02).
 *
 * Kein Dunkelmodus-Umfärben: Die Karten liegen in `.beratung-apple`, und die
 * bleibt auch im Dunkelmodus eine helle, deckende Fläche (siehe
 * `styles/praesentation-liquid.css`). Das MORE-Immo-Logo steht dort deshalb
 * schon immer unverändert, MORE Finance genauso, die Blautöne bleiben.
 *
 * Die Höhen sind verschieden, weil das MORE-Immo-PNG viel Leerraum trägt:
 * So stehen beide Schriftzüge gleich groß.
 */
const LOGOS: Record<string, { src: string; hoehe: string }> = {
  "MORE Immo": { src: moreImmoLogo, hoehe: "h-[30px] -my-1" },
  "MORE Finance": { src: moreFinanceLogo, hoehe: "h-5" },
};

export function PartnerLogo({ marke, rolle, satz }: { marke: string; rolle: string; satz: string }) {
  const logo = LOGOS[marke];
  return (
    <div className="mt-auto pt-5" data-testid="partner-logo">
      <div className="border-t border-border/60 pt-4">
        {/* Bezeichnung und Logo stehen in einer Zeile, damit beide Karten
            denselben Blockaufbau haben und der Strich auf gleicher Höhe liegt. */}
        <div className="flex h-8 items-center gap-3">
          <p className="whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">{rolle}</p>
          {logo && (
            <img
              src={logo.src}
              alt={marke}
              className={`w-auto max-w-full object-contain object-left ${logo.hoehe}`}
            />
          )}
        </div>
        {/* Mindesthöhe für zwei Textzeilen: So bleiben Strich, Bezeichnung und
            Logo in allen Karten einer Reihe auf derselben Höhe. */}
        <p className="mt-2 min-h-[40px] text-xs text-muted-foreground leading-relaxed">{satz}</p>
      </div>
    </div>
  );
}
