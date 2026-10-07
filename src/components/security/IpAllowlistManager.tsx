import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchClientIp, loadIpAllowlist, saveIpAllowlist, type IpAllowlistConfig } from "@/lib/ipAllowlist";
import { logAudit } from "@/lib/auditLog";

export default function IpAllowlistManager() {
  const [cfg, setCfg] = useState<IpAllowlistConfig>({ enabled: false, ips: [], notes: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newIp, setNewIp] = useState("");
  const [myIp, setMyIp] = useState<string | null>(null);
  const [ipLaedt, setIpLaedt] = useState(false);

  // Die eigene IP kommt von api.ipify.org. Abgefragt wird sie nur bei
  // eingeschalteter Liste, sonst erst auf Klick (Datenschutz, DS-003).
  useEffect(() => {
    (async () => {
      const c = await loadIpAllowlist();
      setCfg(c);
      setLoading(false);
      if (c.enabled) setMyIp(await fetchClientIp());
    })();
  }, []);

  const ermittleMeineIp = async () => {
    setIpLaedt(true);
    try {
      const ip = await fetchClientIp();
      setMyIp(ip);
      if (!ip) toast.error("Deine IP ließ sich nicht ermitteln");
    } finally {
      setIpLaedt(false);
    }
  };

  const save = async (next: IpAllowlistConfig) => {
    setSaving(true);
    try {
      const prev = cfg;
      await saveIpAllowlist(next);
      setCfg(next);
      await logAudit({ action: "ip_allowlist_updated", entity: "security", vorher: prev as any, nachher: next as any });
      toast.success("IP-Allowlist gespeichert");
    } catch (e: any) {
      toast.error(e?.message || "Speichern fehlgeschlagen");
    } finally { setSaving(false); }
  };

  const addIp = () => {
    const v = newIp.trim();
    if (!v) return;
    if (cfg.ips.includes(v)) { toast.error("Bereits in Liste"); return; }
    save({ ...cfg, ips: [...cfg.ips, v] });
    setNewIp("");
  };

  const removeIp = (ip: string) => save({ ...cfg, ips: cfg.ips.filter(i => i !== ip) });

  if (loading) return (
    <Card><CardContent className="p-6 text-sm text-muted-foreground flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" /> Lade…
    </CardContent></Card>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" /> IP-Allowlist für /nutzerverwaltung
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch checked={cfg.enabled} onCheckedChange={(v) => save({ ...cfg, enabled: v })} disabled={saving} />
          <Label className="text-sm">
            {cfg.enabled ? "Aktiv — nur freigegebene IPs haben Zugriff" : "Deaktiviert — keine Einschränkung"}
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Inhaber sind als Notausgang immer durchgelassen, damit du dich nicht selbst aussperrst.
          Formate: exakte IP (z.B. <code>82.135.12.34</code>) oder Prefix mit Stern (<code>82.135.12.*</code>).
        </p>

        <div className="flex items-center gap-2">
          <Input value={newIp} onChange={(e) => setNewIp(e.target.value)} placeholder="IP oder 82.135.12.*" className="h-9" />
          <Button size="sm" onClick={addIp} disabled={saving || !newIp.trim()} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Hinzufügen
          </Button>
          {myIp ? (
            <Button size="sm" variant="outline" onClick={() => setNewIp(myIp)} disabled={saving}>
              Meine IP: {myIp}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={ermittleMeineIp} disabled={saving || ipLaedt}>
              {ipLaedt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Meine IP ermitteln
            </Button>
          )}
        </div>

        <div className="space-y-1.5">
          {cfg.ips.length === 0 ? (
            <p className="text-xs text-muted-foreground">Noch keine IPs hinterlegt.</p>
          ) : cfg.ips.map(ip => (
            <div key={ip} className="flex items-center justify-between rounded border p-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono text-[11px]">{ip}</Badge>
                {myIp && (ip === myIp || (ip.endsWith("*") && myIp.startsWith(ip.slice(0,-1)))) && (
                  <Badge variant="outline" className="text-[10px]">deine IP</Badge>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => removeIp(ip)} disabled={saving}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}