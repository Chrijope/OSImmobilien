import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert, Loader2 } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { brauchtClientIp, fetchClientIp, isIpAllowed, loadIpAllowlist, type IpAllowlistConfig } from "@/lib/ipAllowlist";
import { logAudit } from "@/lib/auditLog";

/**
 * Schützt Routen durch eine optionale IP-Allowlist (in app_config).
 * - Inhaber sind immer durchgelassen (Notausgang gegen Selbst-Aussperrung).
 * - Wenn Liste leer oder deaktiviert → freier Zugang, und die eigene IP wird
 *   gar nicht erst bei api.ipify.org abgefragt (Datenschutz, 27.09.2026).
 */
export default function IpAllowlistGuard({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [state, setState] = useState<"loading" | "allow" | "deny">("loading");
  const [ip, setIp] = useState<string | null>(null);
  const [cfg, setCfg] = useState<IpAllowlistConfig | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const c = await loadIpAllowlist();
      if (cancel) return;
      // Inhaber kommen immer durch, also braucht es auch fuer sie keine Abfrage.
      const clientIp = user.role !== "inhaber" && brauchtClientIp(c) ? await fetchClientIp() : null;
      if (cancel) return;
      setCfg(c); setIp(clientIp);
      const allowed = user.role === "inhaber" || isIpAllowed(clientIp, c);
      setState(allowed ? "allow" : "deny");
      if (!allowed) {
        logAudit({ action: "ip_allowlist_blocked", entity: "auth", meta: { ip: clientIp, route: window.location.pathname } });
      }
    })();
    return () => { cancel = true; };
  }, [user.role]);

  if (state === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Sicherheitsprüfung läuft…
      </div>
    );
  }
  if (state === "deny") {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <Card className="border-destructive/40">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-2 text-destructive font-semibold">
              <ShieldAlert className="h-5 w-5" /> Zugriff blockiert
            </div>
            <p className="text-sm text-muted-foreground">
              Diese Seite ist nur aus freigegebenen Netzwerken erreichbar. Deine IP <span className="font-mono">{ip || "unbekannt"}</span> steht nicht auf der Allowlist.
            </p>
            <p className="text-xs text-muted-foreground">
              Bitte wende dich an einen Inhaber, um deine IP freizuschalten.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}