import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { Sprache } from "@/lib/seitenSprache";
import { MOBILE_SCAN_TEXTE, dokumentnameAnzeige, mitText } from "@/pages/mobileScanTexte";

export type ScanUploadStatus = "laedt" | "fertig" | "fehler";

/** Ein Upload dieser Handy-Sitzung, so wie ihn die Liste „Hochgeladen“ zeigt. */
export interface ScanUploadEintrag {
  id: string;
  docTyp: string;
  status: ScanUploadStatus;
}

interface Props {
  eintraege: ScanUploadEintrag[];
  /**
   * Sprache der Liste, Vorgabe Deutsch. Der Dokumentname bleibt als
   * Unterlagentyp deutsch gespeichert, nur seine Anzeige wird übersetzt.
   */
  sprache?: Sprache;
}

/**
 * Liste „Hochgeladen“ auf der Handy-Scan-Seite. Reihenfolge wie im
 * Sitzungsprotokoll (meta.uploads): der älteste oben, der neueste unten,
 * also direkt über „Sitzung abschließen“.
 */
export function MobileScanHochgeladen({ eintraege, sprache = "de" }: Props) {
  if (eintraege.length === 0) return null;
  const t = MOBILE_SCAN_TEXTE[sprache].liste;
  const fertig = eintraege.filter((e) => e.status === "fertig").length;

  return (
    <section aria-labelledby="scan-hochgeladen-titel" className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <h2 id="scan-hochgeladen-titel" className="text-sm font-semibold">
          {t.titel}
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {mitText(fertig === 1 ? t.zahlEins : t.zahlMehr, { zahl: fertig })}
        </span>
      </div>
      <ul data-ui="card" className="rounded-lg border bg-card divide-y">
        {eintraege.map((e) => (
          <li key={e.id} data-status={e.status} className="flex items-center gap-3 px-4 py-3">
            {e.status === "fertig" && (
              <CheckCircle2
                role="img"
                aria-label={t.fertig}
                className="h-5 w-5 shrink-0 text-[hsl(var(--success))]"
              />
            )}
            {e.status === "laedt" && (
              <Loader2 role="img" aria-label={t.laedt} className="h-5 w-5 shrink-0 animate-spin text-primary" />
            )}
            {e.status === "fehler" && (
              <AlertCircle role="img" aria-label={t.fehler} className="h-5 w-5 shrink-0 text-destructive" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{dokumentnameAnzeige(e.docTyp, sprache)}</p>
              {e.status === "laedt" && <p className="text-[11px] text-muted-foreground">{t.laedtText}</p>}
              {e.status === "fehler" && (
                <p className="text-[11px] text-destructive">
                  {t.fehlerText}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
