import type { ReactNode } from "react";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { getHausgeldMonatForWohnung, getHausgeldNichtUmlegbarForWohnung } from "@/lib/objekteStore";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { zimmerText } from "@/lib/objektKennzahlen";
import {
  normalizeVerwaltungsart,
  verwaltungsartLabel,
  VERWALTUNG_HAUSGELD_TOOLTIP,
  SEV_KOSTEN_TOOLTIP,
} from "@/lib/verwaltungInfo";

type Row = { label: string; value: ReactNode; tip?: string };

const fmt = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

function FactSection({ title, rows }: { title: string; rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="text-muted-foreground flex items-center gap-1">
              {r.label}
              {r.tip && (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 cursor-help opacity-70" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs whitespace-pre-line text-xs">
                      {r.tip}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </span>
            <span className="font-medium text-right">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ZahlenDatenFaktenGrid({
  objekt,
  w,
  hatGeplanteErhoehung,
  sanierungAnteilLabel,
}: {
  objekt: ObjektData;
  w: ObjektWohnung;
  hatGeplanteErhoehung?: (w: ObjektWohnung) => boolean;
  sanierungAnteilLabel?: ReactNode;
}) {
  const meta: any = objekt.meta || {};
  const gd: any = objekt.globalDaten || {};

  // ── Fakten ──────────────────────────────────────────────
  const fakten: Row[] = [
    { label: "Etage", value: w.etage || "–" },
    { label: "Lage", value: w.lage || "–" },
    { label: "Zimmer", value: w.zimmer ? zimmerText(w.zimmer) : "–" },
    { label: "Größe", value: `${w.groesse.toLocaleString("de-DE", { maximumFractionDigits: 2 })} m²` },
  ];
  if (gd.baujahr) fakten.push({ label: "Baujahr", value: gd.baujahr });
  if (gd.zustand) fakten.push({ label: "Bauzustand", value: gd.zustand });
  if (meta.anlageklasse)
    fakten.push({ label: "Anlageklasse", value: meta.anlageklasse });
  if (sanierungAnteilLabel)
    fakten.push({ label: "Sanierung", value: sanierungAnteilLabel });

  // ── Mietübersicht ───────────────────────────────────────
  const wHausgeld = getHausgeldMonatForWohnung(objekt, w);
  const nuW = getHausgeldNichtUmlegbarForWohnung(objekt, w);

  const miet: Row[] = [
    {
      label: "Miete",
      tip: "Aktuelle Kaltmiete pro Monat (ohne Nebenkosten). Geplante Mieterhöhungen werden separat angezeigt.",
      value: (
        <>
          {fmt(w.mieteGesamt)}
          {hatGeplanteErhoehung?.(w) && (
            <span className="text-[10px] text-[hsl(var(--success))] ml-1">
              → {fmt(w.neueMiete!)} ab {w.mieterhoehungAb}
            </span>
          )}
        </>
      ),
    },
    {
      label: "Kaltmiete / m²",
      tip: "Monatliche Kaltmiete geteilt durch Wohnfläche. Vergleichswert für die lokale Mietpreislage.",
      value: w.groesse > 0 ? fmt(w.mieteGesamt / w.groesse) : "–",
    },
    { label: "Kaufpreis", value: fmt(w.vkGesamt), tip: "Verkaufspreis dieser Einheit ohne Kaufnebenkosten (Grunderwerbsteuer, Notar, Makler)." },
    { label: "Rendite", value: `${w.rendite.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`, tip: "Bruttomietrendite = Jahreskaltmiete ÷ Kaufpreis × 100. Ohne Hausgeld, Steuern und Finanzierung." },
    { label: "Hausgeld", value: `${fmt(wHausgeld)} / mtl.`, tip: "Monatliches Hausgeld an die WEG (Betriebskosten, Rücklage, WEG-Verwaltung). Bei Einzelwohnungen wird der hinterlegte Wohnungswert zu 100 % übernommen." },
    { label: "davon nicht umlegbar", value: `${fmt(nuW)} / mtl.`, tip: "Anteil des Hausgelds, der nicht auf den Mieter umgelegt werden kann (Verwaltungskosten, Instandhaltungsrücklage) und vom Eigentümer getragen wird." },
  ];
  if ((meta.garantierteErstvermietungKalt || 0) > 0)
    miet.push({
      label: "Garant. Erstvermietung (kalt)",
      tip: "Vom Bauträger/Verkäufer garantierte Kaltmiete bei Erstvermietung – sichert die Anfangsrendite ab.",
      value: fmt(meta.garantierteErstvermietungKalt),
    });
  if (((w as any).ruecklageWohnung || 0) > 0)
    miet.push({
      label: "Rücklage Wohnung",
      tip: "Bereits angesparte Instandhaltungsrücklage, die dieser Einheit beim Kauf zugerechnet wird.",
      value: fmt((w as any).ruecklageWohnung),
    });
  if (meta.verwaltungsart) {
    const art = normalizeVerwaltungsart(meta.verwaltungsart);
    const label = verwaltungsartLabel(meta.verwaltungsart);
    const parts: string[] = [];
    if ((art === "WEG" || art === "WEG+SEV") && meta.verwaltungskostenWeg)
      parts.push(`WEG ${fmt(Number(meta.verwaltungskostenWeg))}/mtl.`);
    if ((art === "SEV" || art === "WEG+SEV") && meta.verwaltungskostenSev)
      parts.push(`SEV ${fmt(Number(meta.verwaltungskostenSev))}/mtl.`);
    if ((art === "Mietpool" || art === "Betreiber") && meta.verwaltungskostenSonstige)
      parts.push(`${art} ${fmt(Number(meta.verwaltungskostenSonstige))}/mtl.`);
    const tip =
      art === "SEV" || art === "WEG+SEV" || art === "Mietpool" || art === "Betreiber"
        ? `${VERWALTUNG_HAUSGELD_TOOLTIP}\n\n${SEV_KOSTEN_TOOLTIP}`
        : VERWALTUNG_HAUSGELD_TOOLTIP;
    miet.push({
      label: "Verwaltung",
      value: parts.length > 0 ? `${label} – ${parts.join(" · ")}` : label,
      tip,
    });
  }

  // ── Energieinformation ──────────────────────────────────
  const energie: Row[] = [];
  if (gd.energieeffizienzklasse)
    energie.push({
      label: "Energieeffizienzklasse",
      value: gd.energieeffizienzklasse,
    });
  if (meta.energieausweistyp)
    energie.push({
      label: "Energieausweistyp",
      value: meta.energieausweistyp,
    });
  if (meta.heizungsart)
    energie.push({ label: "Heizungsart", value: meta.heizungsart });

  // ── Extras ──────────────────────────────────────────────
  const extras: Row[] = [];
  if (w.stellplatzPreis)
    extras.push({ label: "Stellplatz Kaufpreis", value: fmt(w.stellplatzPreis) });
  if (w.stellplatzMiete)
    extras.push({
      label: "Stellplatz Miete",
      value: `${fmt(w.stellplatzMiete)} / mtl.`,
    });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
      <FactSection title="Fakten" rows={fakten} />
      <FactSection title="Mietübersicht" rows={miet} />
      <FactSection title="Energieinformation" rows={energie} />
      <FactSection title="Extras" rows={extras} />
    </div>
  );
}