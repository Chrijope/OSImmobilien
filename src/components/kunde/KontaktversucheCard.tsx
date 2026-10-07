import { Card } from "@/components/ui/card";
import { Phone, RotateCw, ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { PipelineStufeHinweis } from "./PipelineStufeHinweis";
import { formatDatum } from "@/lib/utils";
import type { AktivitaetEntry } from "@/lib/aktivitaetenStore";
import { getFollowUpsByKunde } from "@/lib/followUpStore";
import { MAX_KONTAKTVERSUCHE } from "@/lib/kontaktversuchSchedule";

interface Props {
  kundeId: string;
  nichtErreichtCount: number;
  aktivitaeten: AktivitaetEntry[];
  /** Zusätzlicher Inhalt (z.B. Gesprächsausgang-Buttons), der innerhalb derselben Karte angezeigt wird. */
  children?: ReactNode;
  /** Wenn true, Kartenkopf startet eingeklappt (nur Header sichtbar). Default: false. */
  defaultCollapsed?: boolean;
}

const TOTAL_MAX = MAX_KONTAKTVERSUCHE;

function formatZeit(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const datum = formatDatum(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${datum}, ${hh}:${mm}`;
}

export function KontaktversucheCard({ kundeId, nichtErreichtCount, aktivitaeten, children, defaultCollapsed = false }: Props) {
  const count = nichtErreichtCount || 0;

  // Letzter "Nicht erreicht"-Versuch aus Aktivitäten
  const letzterVersuch = aktivitaeten
    .filter(a => a.art === "anruf" && /nicht\s+erreicht/i.test(a.beschreibung || ""))
    .sort((a, b) => (b.datum || "").localeCompare(a.datum || ""))[0];

  // Follow-Ups
  const followUps = getFollowUpsByKunde(kundeId);
  const followUpCount = followUps.length;
  const letzterFollowUp = followUps
    .slice()
    .sort((a, b) => (b.erstelltAm || "").localeCompare(a.erstelltAm || ""))[0];

  const hasStats = count > 0 || followUpCount > 0;
  // Karte nur sichtbar, wenn Statistiken vorhanden ODER zusätzlicher Inhalt (children) gerendert werden soll
  if (!hasStats && !children) return null;

  const [open, setOpen] = usePersistedState<boolean>(
    `kontaktversuche-card-open:${kundeId}`,
    !defaultCollapsed
  );

  // Farbe je nach Anzahl
  const dotColor = (idx: number) => {
    if (idx >= count) return "bg-muted";
    if (count >= TOTAL_MAX - 1) return "bg-destructive";
    if (count >= Math.ceil(TOTAL_MAX * 0.6)) return "bg-amber-500";
    return "bg-emerald-500";
  };

  const counterColor =
    count >= TOTAL_MAX - 1 ? "text-destructive" : count >= Math.ceil(TOTAL_MAX * 0.6) ? "text-amber-600" : "text-foreground";

  return (
    <Card className="p-6">
      <div className="w-8 h-1 bg-primary mb-3" />
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 mb-4 w-full text-left hover:opacity-80 transition-opacity"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <h3 className="font-bold">Kontaktversuche &amp; Gesprächsausgang</h3>
        {hasStats && (
          <span className="ml-1 text-xs text-muted-foreground">
            ({count}/{TOTAL_MAX} nicht erreicht{followUpCount > 0 ? ` · ${followUpCount} Follow-Up${followUpCount === 1 ? "" : "s"}` : ""})
          </span>
        )}
        <div onClick={(e) => e.stopPropagation()} className="ml-auto">
          <PipelineStufeHinweis
            label="Kontaktversuche"
            hinweis={`Getrackt werden ausschließlich Klicks auf den Button „Nicht erreicht“. Nach ${TOTAL_MAX} erfolglosen Versuchen wird der Lead automatisch auf „Verloren“ gesetzt. Staffelung: 1. Versuch → 4h, 2./3./4. → bis morgen 09:00, 5.–10. → 48h, 11.–14. → 72h. Follow-Ups werden separat gezählt und zählen NICHT auf die ${TOTAL_MAX}/${TOTAL_MAX}.`}
          />
        </div>
      </button>

      {open && (
        <>
        {hasStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Nicht erreicht */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className={`text-2xl font-bold ${counterColor}`}>
              {count} / {TOTAL_MAX}
            </span>
            <span className="text-sm text-muted-foreground">nicht erreicht</span>
          </div>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: TOTAL_MAX }).map((_, i) => (
              <span
                key={i}
                className={`inline-block h-3 w-3 rounded-full ${dotColor(i)}`}
                aria-hidden
              />
            ))}
          </div>
          {letzterVersuch?.datum && (
            <p className="text-xs text-muted-foreground">
              Letzter Versuch: {formatZeit(letzterVersuch.datum)}
            </p>
          )}
          {count >= TOTAL_MAX - 1 && count < TOTAL_MAX && (
            <p className="text-xs text-destructive font-medium">
              Achtung: Beim nächsten erfolglosen Versuch wird der Lead automatisch als „Verloren“ markiert.
            </p>
          )}
        </div>

        {/* Follow-Ups */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <RotateCw className="h-4 w-4 text-muted-foreground" />
            <span className="text-2xl font-bold">{followUpCount}</span>
            <span className="text-sm text-muted-foreground">
              {followUpCount === 1 ? "Follow-Up" : "Follow-Ups"}
            </span>
          </div>
          {letzterFollowUp?.erstelltAm && (
            <p className="text-xs text-muted-foreground">
              Letzter: {formatZeit(letzterFollowUp.erstelltAm)}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Zählt nicht auf die {TOTAL_MAX}/{TOTAL_MAX}
          </p>
        </div>
        </div>
        )}
        {children && (
          <div className={hasStats ? "mt-6 pt-6 border-t" : ""}>
            {children}
          </div>
        )}
        </>
      )}
    </Card>
  );
}
