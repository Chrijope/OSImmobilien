import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, GitBranch, Save } from "lucide-react";
import { toast } from "sonner";
import { rollenLabel } from "@/lib/rollenLabel";
import { cacheReload } from "@/lib/dataCache";
import { logAudit } from "@/lib/auditLog";

/**
 * Lädt alle Nutzer, die als Teamleiter in Frage kommen:
 *  - Inhaber, Admin, Vertriebsleiter (immer)
 *  - Vertriebspartner mit Karrierestufe Team Lead (id "manager") oder Lizenzpartner (id "vertriebsfirma")
 *
 * Speichert die Zuweisung als user_settings.einstellungen.teamleader_id
 * via merge_user_settings RPC (atomar).
 */
interface Props {
  userId: string;
  /** Initialwert (aus user_settings.einstellungen.teamleader_id), darf leer sein */
  currentTeamleaderId?: string | null;
  /** Wenn true: ausgegrauter, schreibgeschützter Hinweis */
  disabled?: boolean;
  onSaved?: (newId: string | null) => void;
}

interface Candidate {
  id: string;
  name: string;
  rolleLabel: string;
}

export function TeamleaderSelect({ userId, currentTeamleaderId, disabled, onSaved }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState<string>(currentTeamleaderId || "__none__");
  const [initial, setInitial] = useState<string>(currentTeamleaderId || "__none__");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(currentTeamleaderId || "__none__");
    setInitial(currentTeamleaderId || "__none__");
  }, [currentTeamleaderId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // select("*") statt fester Spaltenliste: rollen_variante darf fehlen,
        // solange die Migration nicht gelaufen ist.
        const [profilesRes, rolesRes] = await Promise.all([
          supabase.from("profiles").select("*"),
          supabase.from("user_roles").select("user_id, role"),
        ]);
        const roleMap = new Map<string, string[]>();
        (rolesRes.data || []).forEach((r: any) => {
          const list = roleMap.get(r.user_id) || [];
          list.push(r.role);
          roleMap.set(r.user_id, list);
        });
        const list: Candidate[] = (profilesRes.data || [])
          .filter((p: any) => p.id !== userId) // sich selbst nicht zuweisen
          .map((p: any) => {
            const roles = roleMap.get(p.id) || [];
            // Alle Inhaber, Admins, Vertriebsleiter und Vertriebspartner kommen
            // als Teamleiter in Frage – unabhängig von der Karrierestufe.
            const isEligible = roles.some((r) =>
              ["inhaber", "admin", "vertriebsleiter", "vertriebspartner"].includes(r),
            );
            if (!isEligible) return null;
            const primary = roles[0] || "";
            const rolleLabel = rollenLabel(primary, p.rollen_variante || undefined);
            return { id: p.id, name: p.name || "(ohne Name)", rolleLabel } as Candidate;
          })
          .filter((x): x is Candidate => x !== null)
          .sort((a, b) => a.name.localeCompare(b.name, "de"));
        setCandidates(list);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const dirty = value !== initial;

  const handleSave = async () => {
    setSaving(true);
    try {
      const newId = value === "__none__" ? null : value;
      const oldId = initial === "__none__" ? null : initial;
      const { error } = await supabase.rpc("merge_user_settings" as any, {
        _user_id: userId,
        _patch: { teamleader_id: newId },
      });
      if (error) throw error;
      // Cache global aktualisieren, damit Strukturbaum, Abrechnungen,
      // Auswertungen, Junior-Override und Mentoring sofort die neue
      // Teamleiter-Zuweisung berücksichtigen.
      await cacheReload("user_settings");
      void logAudit({
        action: "teamleader_assigned",
        entity: "user_settings",
        entityId: userId,
        vorher: { teamleader_id: oldId },
        nachher: { teamleader_id: newId },
      });
      setInitial(value);
      onSaved?.(newId);
      toast.success(newId ? "Teamleiter zugewiesen" : "Teamleiter-Zuweisung entfernt");
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs flex items-center gap-1.5">
        <GitBranch className="h-3.5 w-3.5" /> Teamleiter
      </Label>
      <div className="flex items-center gap-2">
        <Select value={value} onValueChange={setValue} disabled={disabled || loading}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue placeholder={loading ? "Lädt…" : "Keinen Teamleiter zuweisen"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— Kein Teamleiter —</SelectItem>
            {candidates.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} <span className="text-muted-foreground text-xs ml-1">({c.rolleLabel})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {dirty && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Übernehmen
          </Button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Inhaber, Admins, Vertriebsleiter und Vertriebspartner können Teamleiter sein.
      </p>
    </div>
  );
}
