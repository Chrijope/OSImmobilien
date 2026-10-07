import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Plus, Trash2, Info } from "lucide-react";
import {
  getNotarTerminVorschlaege,
  setNotarTerminVorschlaege,
  getNotarTerminVorschlaegeFreigegeben,
  setNotarTerminVorschlaegeFreigegeben,
  getNotarTerminBestaetigt,
  clearNotarTerminBestaetigt,
  getNotarTerminPortalFreigabe,
  setNotarTerminPortalFreigabe,
  type NotarTerminVorschlag,
} from "@/lib/investmentsStore";

interface Props {
  investmentId: string;
  onChange?: () => void;
  toast: (opts: { title?: string; description?: string }) => void;
}

/**
 * VP-Block zum Pflegen mehrerer Notartermin-Vorschläge mit lokaler Inputs-State,
 * damit das Eintippen (insb. type="time") nicht durch externe Re-Renders unterbrochen wird.
 *
 * Sobald der Kunde im Portal einen Termin bestätigt hat, wird nur noch der bestätigte
 * Termin angezeigt – inkl. Hinweis, dass der VP diesen dem Notar verbindlich bestätigen muss.
 */
export function NotarVorschlaegeBlock({ investmentId, onChange, toast }: Props) {
  const [vorschlaege, setVorschlaegeLocal] = useState<NotarTerminVorschlag[]>(() => getNotarTerminVorschlaege(investmentId));
  const [tick, setTick] = useState(0);

  const freigegeben = getNotarTerminVorschlaegeFreigegeben(investmentId);
  const bestaetigt = getNotarTerminBestaetigt(investmentId);

  // Re-sync from store when investmentId changes
  useEffect(() => {
    setVorschlaegeLocal(getNotarTerminVorschlaege(investmentId));
  }, [investmentId]);

  // Sobald der Kunde einen Termin bestätigt hat, werden die alten Vorschläge
  // im VP-Profil EINMALIG geleert (per bestaetigtAm-Tracking). Danach kann
  // der VP frische Vorschläge via "+ Vorschlag" eintragen, ohne dass diese
  // sofort wieder gelöscht werden.
  const lastClearedRef = useRef<string | null>(null);
  useEffect(() => {
    const ts = bestaetigt?.bestaetigtAm || null;
    if (ts && lastClearedRef.current !== ts) {
      lastClearedRef.current = ts;
      if (vorschlaege.length > 0) {
        setVorschlaegeLocal([]);
        setNotarTerminVorschlaege(investmentId, []);
        setNotarTerminVorschlaegeFreigegeben(investmentId, []);
        onChange?.();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestaetigt?.bestaetigtAm, investmentId]);

  const isVorschlagValid = (v: NotarTerminVorschlag) => !!v.datum && !!v.uhrzeit;
  const validVorschlaege = vorschlaege.filter(isVorschlagValid);

  // ── WICHTIG: Vorschläge werden NICHT automatisch freigegeben! ──
  // Im Kundenportal sichtbar werden Vorschläge erst, wenn der VP unten den
  // grünen Button "Notartermin im Kundenportal FREIGEBEN" klickt. Erst dann
  // werden die hier gepflegten Vorschläge in das "Freigegeben"-Array geschrieben
  // und die alte Kunden-Bestätigung verworfen. So kann der VP – auch nach einer
  // bereits erfolgten Bestätigung – beliebig viele neue Vorschläge eintragen,
  // ohne dass der bestätigte Termin sofort verschwindet oder dem Kunden bereits
  // unfertige Entwürfe angezeigt werden.

  const persist = (next: NotarTerminVorschlag[]) => {
    setVorschlaegeLocal(next);
    setNotarTerminVorschlaege(investmentId, next);
    onChange?.();
  };

  const updateVorschlag = (idx: number, field: "datum" | "uhrzeit", value: string) => {
    setVorschlaegeLocal(prev => {
      const next = [...prev];
      next[idx] = { ...(next[idx] || { datum: "", uhrzeit: "" }), [field]: value };
      setNotarTerminVorschlaege(investmentId, next);
      return next;
    });
  };

  const addVorschlag = () => persist([...vorschlaege, { datum: "", uhrzeit: "" }]);
  const removeVorschlag = (idx: number) => {
    persist(vorschlaege.filter((_, i) => i !== idx));
  };

  // ── Bestätigter Termin: prominent anzeigen + VP kann trotzdem neue Vorschläge einstellen ──
  const bestaetigtBanner = bestaetigt ? (
    <div className="rounded-lg border-2 border-[hsl(var(--success))]/50 bg-[hsl(var(--success))]/10 p-3 mb-3">
      <div className="flex items-start gap-2 mb-2">
        <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">✓ Vom Kunden bestätigter Notartermin</p>
          <p className="text-[11px] text-muted-foreground">
            Bestätigt am {new Date(bestaetigt.bestaetigtAm).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <Badge className="bg-[hsl(var(--success))]/20 text-[hsl(var(--success))] border-0 text-[10px]">Bestätigt</Badge>
      </div>

      <div className="flex items-center gap-3 p-2.5 rounded-md bg-card border">
        <div className="w-8 h-8 rounded-md bg-[hsl(var(--success))]/15 flex items-center justify-center shrink-0">
          <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold">{bestaetigt.datum || "Datum offen"}</p>
          {bestaetigt.uhrzeit && <p className="text-xs text-muted-foreground">{bestaetigt.uhrzeit} Uhr</p>}
        </div>
        <Badge className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-0 text-[10px]">Vom Kunden gewählt</Badge>
      </div>

      <div className="mt-2.5 flex items-start gap-2 p-2.5 rounded-md bg-primary/5 border border-primary/20">
        <Info className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
        <p className="text-[11px] text-foreground leading-relaxed">
          Bitte gib diesen Termin verbindlich an das Notariat weiter und bestätige ihn dort.
          Falls der Termin verschoben werden muss, kannst du unten neue Vorschläge einstellen.
        </p>
      </div>
    </div>
  ) : null;

  return (
    <div className="border rounded-lg p-3 bg-muted/20 mt-3" data-tick={tick}>
      {bestaetigtBanner}
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div>
          <p className="text-xs font-semibold">
            {bestaetigt ? "Neue Termin-Vorschläge (z. B. bei Verschiebung)" : "Termin-Vorschläge zur Kundenwahl"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Trag mehrere Termine ein. Sichtbar werden sie im Kundenportal erst, wenn du unten <strong>Notartermin im Kundenportal FREIGEBEN</strong> klickst.
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addVorschlag}>
          <Plus className="h-3 w-3 mr-1" /> Vorschlag
        </Button>
      </div>

      {vorschlaege.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">Noch keine Vorschläge eingetragen.</p>
      ) : (
        <div className="space-y-2">
          {vorschlaege.map((v, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                type="date"
                value={v.datum}
                onChange={e => updateVorschlag(idx, "datum", e.target.value)}
                className="h-8 text-xs flex-1"
              />
              <Input
                type="time"
                value={v.uhrzeit}
                onChange={e => updateVorschlag(idx, "uhrzeit", e.target.value)}
                className="h-8 text-xs w-28"
              />
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => removeVorschlag(idx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
