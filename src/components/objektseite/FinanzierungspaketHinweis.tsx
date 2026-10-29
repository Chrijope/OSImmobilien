import { Link } from "react-router-dom";
import { AlertTriangle, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/UserContext";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import { darfObjektpaketHinweisSehen, fehlendeFinanzierungsunterlagen } from "@/lib/finanzierungsObjektpaket";

/**
 * Der Kasten oben auf Objekt- und Einheitsseite, wenn Unterlagen für die
 * Finanzierung fehlen (Christian, 27.10.2026). Bewusst kein Pflichtfeld beim
 * Anlegen, sondern ein deutlicher Hinweis. Nur für Admin, Inhaber,
 * Objektpartner und Vertriebspartner (seit 29.10.2026); alle anderen und ein
 * vollständiges Paket sehen nichts.
 */
export function FinanzierungspaketHinweis({ objekt, wohnung, onZuDenDokumenten, hochladenZiel }: {
  objekt: Pick<ObjektData, "dokumente" | "meta" | "wohnungen">;
  wohnung?: ObjektWohnung;
  onZuDenDokumenten: () => void;
  /** Wohin „Unterlagen hochladen" führt; fehlt, wenn die Rolle hier nicht pflegen darf. */
  hochladenZiel?: string;
}) {
  const { user } = useUser();
  if (!darfObjektpaketHinweisSehen(user.role)) return null;
  const { fehlend, vorhanden, vollstaendig } = fehlendeFinanzierungsunterlagen(objekt, wohnung);
  if (vollstaendig) return null;
  const gesamt = fehlend.length + vorhanden.length;

  return (
    <div role="alert" data-testid="finanzierungspaket-hinweis"
      className="mb-4 rounded-2xl border-2 border-amber-500/50 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-950/30 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="font-semibold text-amber-900 dark:text-amber-100">
              Finanzierungspaket unvollständig: {vorhanden.length} von {gesamt} Unterlagen
            </p>
            <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-200/90">
              Vor dem Einreichen beim Finanzierer fehlt noch:
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {fehlend.map((f) => (
                <li key={f} className="rounded-full border border-amber-500/40 bg-background/70 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{f}</li>
              ))}
            </ul>
            <div className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-amber-200/70 dark:bg-amber-900/60" aria-hidden>
              <div className="h-full bg-amber-500" style={{ width: `${gesamt ? Math.round((vorhanden.length / gesamt) * 100) : 0}%` }} />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onZuDenDokumenten}><FileText className="h-3.5 w-3.5" /> Zu den Dokumenten</Button>
          {hochladenZiel && (
            <Button size="sm" className="gap-1.5" asChild><Link to={hochladenZiel}><Upload className="h-3.5 w-3.5" /> Unterlagen hochladen</Link></Button>
          )}
        </div>
      </div>
    </div>
  );
}
