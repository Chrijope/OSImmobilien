import { useState, type ReactNode } from "react";
import { BookMarked, Calculator, LineChart, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { konfiguratorAngaben, rahmenKurz } from "@/lib/handbuch/leadStand";
import {
  AnalyseInhalt,
  KonfiguratorInhalt,
  RASTER_SCHMAL,
  SteuerInhalt,
  hatRechnerAngaben,
  kurzfassungAnalyse,
  kurzfassungSteuer,
  rechnerZeitpunkt,
  useLeadStandZeile,
  type RechnerMeta,
} from "@/components/kunden/RechnerAngaben";
import { KundenprofilHoverKarte } from "./KundenprofilHoverKarte";

export interface KiZusammenfassung {
  investmentId: string;
  nummer: number;
  text: string;
  /** ISO-Zeitpunkt der letzten Änderung, falls bekannt. */
  stand?: string;
}

export interface RechnerQuelle {
  schluessel: string;
  art: "konfigurator" | "analyse" | "steuer" | "ki";
  titel: string;
  kern: string;
  /** Kurzes Datum „09.10.“ für die Zeile, leer wenn unbekannt. */
  datum: string;
  /** Der ganze Zeitpunkt für Karte und Panel. */
  zeitpunkt: string;
  ki?: KiZusammenfassung;
}

const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n));

function kurzDatum(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
}

/**
 * Eine Zeile je Quelle, Quellen ohne Daten fallen weg. Die Inhalte selbst
 * kommen aus `RechnerAngaben.tsx`, damit Profil und Karte dieselben Zahlen
 * zeigen und nichts neu gerechnet wird.
 */
export function baueRechnerQuellen(eingabe: {
  meta?: RechnerMeta | null;
  quelle?: string;
  erstelltAm?: string;
  ki?: KiZusammenfassung[];
}): RechnerQuelle[] {
  const { meta, quelle, erstelltAm } = eingabe;
  const liste: RechnerQuelle[] = [];
  if (hatRechnerAngaben(meta, quelle)) {
    const konf = konfiguratorAngaben({ quelle, meta });
    if (konf.ausHandbuch) {
      liste.push({
        schluessel: "konfigurator",
        art: "konfigurator",
        titel: "Konfigurator",
        kern: konf.rahmen ? `Rahmen ${rahmenKurz(konf.rahmen)}` : "Selbstauskunft angefragt",
        datum: kurzDatum(konf.zeitpunkt ?? erstelltAm),
        zeitpunkt: rechnerZeitpunkt(konf.zeitpunkt ?? undefined, erstelltAm),
      });
    }
    const a = meta?.analyseSnapshot;
    if (a || typeof meta?.analyseScore === "number") {
      liste.push({
        schluessel: "analyse",
        art: "analyse",
        titel: "Analyse-Tool",
        kern: typeof meta?.analyseScore === "number" ? `${meta.analyseScore} Punkte` : kurzfassungAnalyse(meta),
        datum: kurzDatum(a?.erfasstAm ?? erstelltAm),
        zeitpunkt: rechnerZeitpunkt(a?.erfasstAm, erstelltAm),
      });
    }
    const s = meta?.steuerSnapshot;
    if (s && Object.values(s).some((w) => w !== undefined && w !== null)) {
      liste.push({
        schluessel: "steuer",
        art: "steuer",
        titel: "Steuerrechner",
        kern: typeof s.steuerlastHeute === "number" ? `Steuerlast ${eur(s.steuerlastHeute)}` : kurzfassungSteuer(s),
        datum: kurzDatum(s.erfasstAm ?? erstelltAm),
        zeitpunkt: rechnerZeitpunkt(s.erfasstAm, erstelltAm),
      });
    }
  }
  for (const ki of [...(eingabe.ki || [])].filter((k) => k.text.trim()).sort((x, y) => x.nummer - y.nummer)) {
    liste.push({
      schluessel: `ki-${ki.investmentId}`,
      art: "ki",
      titel: "KI-Zusammenfassung Erstgespräch",
      kern: `Investment ${ki.nummer}`,
      datum: kurzDatum(ki.stand),
      zeitpunkt: ki.stand ? `Stand ${new Date(ki.stand).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : "Stand nicht vermerkt",
      ki,
    });
  }
  return liste;
}

const SYMBOL: Record<RechnerQuelle["art"], ReactNode> = {
  konfigurator: <BookMarked className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />,
  analyse: <LineChart className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />,
  steuer: <Calculator className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />,
  ki: <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />,
};

interface Props {
  meta?: RechnerMeta | null;
  quelle?: string;
  erstelltAm?: string;
  kontaktId?: string;
  kontakt: { vorname?: string; nachname?: string; zustaendigId?: string | null };
  ki?: KiZusammenfassung[];
}

/**
 * „Angaben aus Rechnern und Gesprächen“ in der linken Spalte.
 *
 * Je Quelle eine Zeile mit Symbol, Titel, Kernwert und Datum. Darüberfahren
 * oder Antippen öffnet die ganze Auskunft, „Ganz anzeigen“ dieselbe in einem
 * Seitenpanel, damit langer Text nicht verschwindet, wenn die Maus geht.
 */
export function KundenprofilRechnerZeilen({ meta, quelle, erstelltAm, kontaktId, kontakt, ki }: Props) {
  const quellen = baueRechnerQuellen({ meta, quelle, erstelltAm, ki });
  const [panel, setPanel] = useState<RechnerQuelle | null>(null);
  const konfigurator = quellen.some((q) => q.art === "konfigurator");
  const zeile = useLeadStandZeile(konfigurator, kontaktId);

  if (quellen.length === 0) return <p className="text-xs text-muted-foreground">Noch keine Angaben aus Rechnern oder Gesprächen.</p>;

  const inhalt = (q: RechnerQuelle) => {
    if (q.art === "steuer" && meta?.steuerSnapshot) return <SteuerInhalt s={meta.steuerSnapshot} meta={meta} raster={RASTER_SCHMAL} />;
    if (q.art === "analyse") return <AnalyseInhalt meta={meta} raster={RASTER_SCHMAL} />;
    if (q.art === "konfigurator") return <KonfiguratorInhalt meta={meta} quelle={quelle} zeile={zeile} kontakt={kontakt} raster={RASTER_SCHMAL} />;
    return <p className="whitespace-pre-line text-sm">{q.ki?.text}</p>;
  };

  return (
    <>
      <ul className="kundenprofil-rechnerzeilen">
        {quellen.map((q) => (
          <li key={q.schluessel}>
            <KundenprofilHoverKarte
              ausloeser={
                <button type="button" className="kundenprofil-rechnerzeile" title={`${q.titel}${q.kern ? ` · ${q.kern}` : ""}`} aria-label={`Ergebnis anzeigen: ${[q.titel, q.kern, q.datum].filter(Boolean).join(", ")}`}>
                  {SYMBOL[q.art]}
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{q.titel}</span>
                    {q.kern && <span className="text-muted-foreground"> · {q.kern}</span>}
                  </span>
                  {q.datum && <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{q.datum}</span>}
                </button>
              }
            >
              <p className="font-semibold">{q.titel}</p>
              <p className="mb-3 text-xs text-muted-foreground">{q.zeitpunkt}</p>
              {inhalt(q)}
              <div className="mt-3 flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setPanel(q)}>Ganz anzeigen</Button>
              </div>
            </KundenprofilHoverKarte>
          </li>
        ))}
      </ul>
      <Sheet open={!!panel} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {panel && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle>{panel.titel}</SheetTitle>
                <SheetDescription>{panel.zeitpunkt}</SheetDescription>
              </SheetHeader>
              {inhalt(panel)}
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
