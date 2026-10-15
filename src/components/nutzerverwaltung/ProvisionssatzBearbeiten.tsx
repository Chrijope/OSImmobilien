import { useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/auditLog";
import { cacheRefreshTable } from "@/lib/dataCache";
import { parseProvisionssatz, SATZ_UNGUELTIG_TEXT } from "@/lib/karriereStufeHelper";

/*
 * Lead- und Eigen-Satz eines Vertriebspartners im Nutzerprofil (15.10.2026).
 *
 * Ändern dürfen nur die aktiven Rollen admin und inhaber; alle anderen sehen
 * die Sätze nur. Die Datenbank schützt die Schlüssel zusätzlich
 * (user_settings_provision_schuetzen) und verwirft fremde Änderungen still.
 * Deshalb liest die Karte nach dem Speichern neu und meldet eine Abweichung.
 */

export const NICHT_GESPEICHERT_TEXT =
  "Der Provisionssatz wurde nicht gespeichert. Nur Admin und Inhaber können ihn ändern.";

function alsText(wert: number | null): string {
  return wert === null ? "" : String(wert).replace(".", ",");
}

export function ProvisionssatzBearbeiten({
  userId,
  zielName,
  lead,
  eigen,
  darfBearbeiten,
}: {
  userId: string;
  zielName: string;
  lead: number | null;
  eigen: number | null;
  /** Nur bei aktiver Rolle admin oder inhaber. */
  darfBearbeiten: boolean;
}) {
  const [leadText, setLeadText] = useState(alsText(lead));
  const [eigenText, setEigenText] = useState(alsText(eigen));
  const [gespeichert, setGespeichert] = useState({ lead, eigen });
  const [speichert, setSpeichert] = useState(false);

  const leadNeu = parseProvisionssatz(leadText);
  const eigenNeu = parseProvisionssatz(eigenText);
  const gueltig = leadNeu !== null && eigenNeu !== null;

  const speichern = async () => {
    if (!gueltig) {
      toast.error(SATZ_UNGUELTIG_TEXT);
      return;
    }
    setSpeichert(true);
    try {
      const { error } = await supabase.rpc("merge_user_settings" as any, {
        _user_id: userId,
        _patch: { custom_provision_rate_setter: leadNeu, custom_provision_rate_eigen: eigenNeu },
      });
      if (error) throw error;
      // Nachlesen: Der Schutz-Trigger bricht nicht ab, er behält still den alten Wert.
      const { data, error: leseFehler } = await supabase
        .from("user_settings")
        .select("einstellungen")
        .eq("user_id", userId)
        .maybeSingle();
      if (leseFehler) throw leseFehler;
      const e = (data?.einstellungen as Record<string, unknown> | null) ?? {};
      if (e.custom_provision_rate_setter !== leadNeu || e.custom_provision_rate_eigen !== eigenNeu) {
        toast.error(NICHT_GESPEICHERT_TEXT);
        return;
      }
      void logAudit({
        action: "provision_satz_override",
        entity: "user_settings",
        entityId: userId,
        vorher: { custom_provision_rate_setter: gespeichert.lead, custom_provision_rate_eigen: gespeichert.eigen },
        nachher: { custom_provision_rate_setter: leadNeu, custom_provision_rate_eigen: eigenNeu },
        meta: { target_user: zielName },
      });
      setGespeichert({ lead: leadNeu, eigen: eigenNeu });
      void cacheRefreshTable("user_settings");
      toast.success("Provisionssätze gespeichert");
    } catch (err) {
      toast.error("Provisionssätze nicht gespeichert", { description: (err as Error).message });
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-muted/30 space-y-3" data-testid="provisionssatz-profil">
      <div className="text-sm font-medium">Provisionssatz</div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="profil-satz-lead" className="text-xs text-muted-foreground">Lead-Satz (%)</Label>
          <Input
            id="profil-satz-lead"
            inputMode="decimal"
            placeholder="z. B. 10"
            value={leadText}
            onChange={(e) => setLeadText(e.target.value)}
            disabled={!darfBearbeiten}
          />
          <p className="text-[10px] text-muted-foreground">Für Leads, die OS Immobilien zuweist</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="profil-satz-eigen" className="text-xs text-muted-foreground">Eigen-Satz (%)</Label>
          <Input
            id="profil-satz-eigen"
            inputMode="decimal"
            placeholder="z. B. 10"
            value={eigenText}
            onChange={(e) => setEigenText(e.target.value)}
            disabled={!darfBearbeiten}
          />
          <p className="text-[10px] text-muted-foreground">Für Kontakte aus dem eigenen Netzwerk</p>
        </div>
      </div>
      {darfBearbeiten ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-destructive">{!gueltig ? SATZ_UNGUELTIG_TEXT : ""}</p>
          <Button size="sm" variant="outline" disabled={!gueltig || speichert} onClick={speichern} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> Speichern
          </Button>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Die Sätze legen Admin und Inhaber fest.</p>
      )}
    </div>
  );
}
