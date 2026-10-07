import { Badge } from "@/components/ui/badge";
import { PIPELINE_STUFEN, type KundeBucketEntry } from "@/lib/kontaktPipeline";
import { KontaktTypBadge } from "@/components/kunden/KontaktTypBadge";

/**
 * Rendert die führende "Aktuelles Investment / Deal"-Zelle für Listen,
 * die einen Kunden mehrfach (1× pro Investment) anzeigen.
 * - Mit Investment: Stufen-Badge + Objekt-/Label-Hinweis (hervorgehoben).
 * - Ohne Investment: leiser "–"-Platzhalter (Kontakt hat keine aktiven Deals).
 */
export function BucketEntryDealCell({ entry }: { entry: KundeBucketEntry }) {
  if (!entry.investmentId) {
    return (
      <div className="flex items-center gap-1.5">
        <KontaktTypBadge kunde={entry.kunde} size="xs" />
        <span className="text-xs text-muted-foreground">–</span>
      </div>
    );
  }
  const stufeLabel = PIPELINE_STUFEN.find((s) => s.key === entry.stufe)?.label || entry.stufe;
  return (
    <div className="flex flex-col gap-0.5 min-w-[170px]">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground font-medium whitespace-nowrap shrink-0">
          Inv. {entry.investmentNummer ?? "?"}
        </Badge>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary whitespace-nowrap shrink-0">
          {stufeLabel}
        </Badge>
        <KontaktTypBadge kunde={entry.kunde} size="xs" showIcon={false} />
      </div>
      {entry.objektLabel && (
        <span className="text-[11px] text-muted-foreground truncate" title={entry.objektLabel}>
          {entry.objektLabel}
        </span>
      )}
    </div>
  );
}

/** Einheitlicher Key für eine Bucket-Eintragszeile (Kunde + Investment). */
export function bucketEntryKey(entry: KundeBucketEntry): string {
  return `${entry.kunde.id}-${entry.investmentId ?? "self"}`;
}

/** Erzeugt die Navigation-URL für einen Bucket-Eintrag — inklusive `?investment=` Param. */
export function bucketEntryHref(entry: KundeBucketEntry): string {
  return entry.investmentId
    ? `/kunden/${entry.kunde.id}?investment=${entry.investmentId}`
    : `/kunden/${entry.kunde.id}`;
}