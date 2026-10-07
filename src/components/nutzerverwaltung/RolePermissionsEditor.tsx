import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { confirmDialog } from "@/lib/confirm";
import { ROLES, type UserRole } from "@/types/user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Plus, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";

// Rollen mit Voll-Zugriff (immer alles erlaubt — nicht editierbar)
const FULL_ACCESS: UserRole[] = ["inhaber", "admin", "individuell", "testaccount"];

type PermissionMap = Partial<Record<UserRole, string[]>>;

export function RolePermissionsEditor() {
  const [loading, setLoading] = useState(true);
  const [perms, setPerms] = useState<PermissionMap>({});
  const [newUrl, setNewUrl] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("role_permissions" as any)
      .select("role, url");
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      const map: PermissionMap = {};
      for (const row of (data as unknown as { role: string; url: string }[]) || []) {
        (map[row.role as UserRole] ||= []).push(row.url);
      }
      for (const k of Object.keys(map)) map[k as UserRole]!.sort();
      setPerms(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addUrl = async (role: UserRole) => {
    const url = (newUrl[role] || "").trim();
    if (!url) return;
    if (!url.startsWith("/")) {
      toast({ title: "Ungültiger Pfad", description: "Pfad muss mit '/' beginnen.", variant: "destructive" });
      return;
    }
    setBusy(`${role}:${url}`);
    const { error } = await supabase.from("role_permissions" as any).insert({ role, url } as any);
    setBusy(null);
    if (error) {
      toast({ title: "Speichern fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    setNewUrl(s => ({ ...s, [role]: "" }));
    setPerms(s => ({ ...s, [role]: [...(s[role] || []), url].sort() }));
    toast({ title: "Pfad hinzugefügt", description: `${role} darf jetzt ${url}` });
  };

  const removeUrl = async (role: UserRole, url: string) => {
    const ok = await confirmDialog({
      title: "Pfad für diese Rolle entfernen?",
      description: `Die Rolle „${role}“ erreicht ${url} danach nicht mehr.`,
      confirmText: "Entfernen",
      cancelText: "Behalten",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(`${role}:${url}`);
    const { error } = await supabase
      .from("role_permissions" as any)
      .delete()
      .eq("role", role)
      .eq("url", url);
    setBusy(null);
    if (error) {
      toast({ title: "Löschen fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    setPerms(s => ({ ...s, [role]: (s[role] || []).filter(u => u !== url) }));
    toast({ title: "Pfad entfernt", description: `${role} verliert Zugriff auf ${url}` });
  };

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Lade Berechtigungen…</div>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Quelle: Tabelle <code>role_permissions</code>. Änderungen greifen sofort (Sidebar + Routen-Schutz). Voll-Zugriffs-Rollen sehen immer alles.
      </p>
      <Accordion type="single" collapsible className="w-full">
        {ROLES.map((r) => {
          const isFull = FULL_ACCESS.includes(r.id as UserRole);
          const urls = perms[r.id as UserRole] || [];
          return (
            <AccordionItem key={r.id} value={r.id}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3 w-full">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="font-medium text-sm">{r.label}</span>
                  {isFull ? (
                    <Badge variant="secondary" className="ml-auto mr-2 gap-1"><ShieldCheck className="h-3 w-3" /> Voll-Zugriff</Badge>
                  ) : (
                    <span className="ml-auto mr-2 text-xs text-muted-foreground">{urls.length} Pfade</span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {isFull ? (
                  <p className="text-xs text-muted-foreground py-2">Diese Rolle hat per Definition Zugriff auf alle Pfade. Nicht editierbar.</p>
                ) : (
                  <div className="space-y-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {urls.length === 0 && <p className="text-xs text-muted-foreground">Noch keine Pfade gepflegt.</p>}
                      {urls.map((url) => (
                        <Badge
                          key={url}
                          variant="outline"
                          className="gap-1 pl-2 pr-1 py-1 text-xs font-mono"
                        >
                          {url}
                          <button
                            type="button"
                            disabled={busy === `${r.id}:${url}`}
                            onClick={() => removeUrl(r.id as UserRole, url)}
                            className="ml-0.5 rounded hover:bg-destructive/10 p-0.5 disabled:opacity-50"
                            title="Entfernen"
                          >
                            {busy === `${r.id}:${url}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3 text-destructive" />}
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="/neuer-pfad"
                        value={newUrl[r.id] || ""}
                        onChange={(e) => setNewUrl(s => ({ ...s, [r.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(r.id as UserRole); } }}
                        className="h-8 text-xs font-mono"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addUrl(r.id as UserRole)}
                        disabled={!newUrl[r.id]?.trim() || !!busy}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Hinzufügen
                      </Button>
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}