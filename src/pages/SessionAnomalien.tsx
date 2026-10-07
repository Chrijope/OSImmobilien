import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { confirmDialog } from "@/lib/confirm";
import { beendeSitzungenVon } from "@/lib/sitzungenBeenden";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, Loader2, Lock, Unlock } from "lucide-react";
import IpAllowlistManager from "@/components/security/IpAllowlistManager";

type AnomalySession = {
  id: string;
  user_id: string;
  logged_in_at: string;
  ip_address: string | null;
  country: string | null;
  city: string | null;
  browser: string | null;
  os: string | null;
  anomaly_level: "low" | "medium" | "critical";
  anomaly_reason: string | null;
  alert_sent_at: string | null;
  aktiv: boolean;
  user_email?: string;
  user_name?: string;
};

type Lockout = {
  email: string;
  failed_attempts: number;
  last_failed_at: string | null;
  locked_until: string | null;
  lockout_count: number;
  last_ip: string | null;
};

const levelColor: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-300",
  medium: "bg-amber-100 text-amber-800 border-amber-300",
  low: "bg-blue-100 text-blue-800 border-blue-300",
};

const levelLabel: Record<string, string> = {
  critical: "Kritisch",
  medium: "Mittel",
  low: "Niedrig",
};

export default function SessionAnomalien() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AnomalySession[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [forcingLogout, setForcingLogout] = useState<string | null>(null);
  const [lockouts, setLockouts] = useState<Lockout[]>([]);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: sessions, error } = await supabase
        .from("login_sessions")
        .select("*")
        .not("anomaly_level", "is", null)
        .gte("logged_in_at", since)
        .order("logged_in_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const userIds = Array.from(new Set((sessions || []).map((s: any) => s.user_id)));
      let profilesMap: Record<string, { email?: string; name?: string }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email, vorname, nachname")
          .in("id", userIds);
        (profiles || []).forEach((p: any) => {
          profilesMap[p.id] = {
            email: p.email,
            name: [p.vorname, p.nachname].filter(Boolean).join(" "),
          };
        });
      }

      setRows(
        (sessions || []).map((s: any) => ({
          ...s,
          user_email: profilesMap[s.user_id]?.email,
          user_name: profilesMap[s.user_id]?.name,
        }))
      );
    } catch (e: any) {
      console.error(e);
      toast({ title: "Fehler", description: e.message || "Konnte Anomalien nicht laden", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const loadLockouts = async () => {
    const { data } = await supabase
      .from("auth_lockouts")
      .select("email, failed_attempts, last_failed_at, locked_until, lockout_count, last_ip")
      .order("last_failed_at", { ascending: false })
      .limit(100);
    setLockouts((data as any) || []);
  };

  useEffect(() => { loadLockouts(); }, []);

  const handleUnlock = async (email: string) => {
    const ok = await confirmDialog({
      title: "Sperre aufheben?",
      description: `${email} kann sich danach wieder anmelden.`,
      confirmText: "Sperre aufheben",
      cancelText: "Gesperrt lassen",
    });
    if (!ok) return;
    setUnlocking(email);
    try {
      // Reset via record_auth_attempt mit _success=true – wir haben aber keine direkten Rechte;
      // Stattdessen: Eintrag aus auth_lockouts löschen via Edge-Function oder Admin-RPC.
      // Quick-Win: Wir aktualisieren über eine RPC – falls nicht vorhanden, signOut-Pattern via manage-sessions ist nicht passend.
      // Hier nutzen wir ein direktes UPDATE (Admins haben kein Schreibrecht via RLS, daher edge-function).
      const { error } = await supabase.functions.invoke("admin-unlock-account", { body: { email } });
      if (error) throw error;
      toast({ title: "Sperre aufgehoben", description: email });
      loadLockouts();
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setUnlocking(null);
    }
  };

  const handleForceLogout = async (userId: string, name: string) => {
    const ok = await confirmDialog({
      title: "Alle Sitzungen sofort beenden?",
      description: `${name} wird auf allen Geräten abgemeldet und muss sich neu anmelden.`,
      confirmText: "Sitzungen beenden",
      cancelText: "Abbrechen",
      variant: "destructive",
    });
    if (!ok) return;
    setForcingLogout(userId);
    try {
      await beendeSitzungenVon(userId, "Session-Anomalie");
      toast({ title: "Erledigt", description: `Sessions von ${name} beendet.` });
      load();
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setForcingLogout(null);
    }
  };

  const filtered = filter === "all" ? rows : rows.filter(r => r.anomaly_level === filter);

  const stats = {
    critical: rows.filter(r => r.anomaly_level === "critical").length,
    medium: rows.filter(r => r.anomaly_level === "medium").length,
    low: rows.filter(r => r.anomaly_level === "low").length,
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Session-Anomalien</h1>
          <p className="text-sm text-muted-foreground">Verdächtige Logins der letzten 30 Tage</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Kritisch</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-red-600">{stats.critical}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Mittel</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-amber-600">{stats.medium}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Niedrig</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-blue-600">{stats.low}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" /> Account-Lockouts
          </CardTitle>
          <Button variant="outline" size="sm" onClick={loadLockouts}>Neu laden</Button>
        </CardHeader>
        <CardContent>
          {lockouts.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm">Keine Lockouts aktuell.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Fehlversuche</TableHead>
                  <TableHead>Gesperrt bis</TableHead>
                  <TableHead>Sperrungen gesamt</TableHead>
                  <TableHead>Letzte IP</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lockouts.map(l => {
                  const isLocked = l.locked_until && new Date(l.locked_until) > new Date();
                  return (
                    <TableRow key={l.email}>
                      <TableCell className="font-mono text-xs">{l.email}</TableCell>
                      <TableCell>{l.failed_attempts}</TableCell>
                      <TableCell className="text-xs">
                        {isLocked ? (
                          <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
                            {new Date(l.locked_until!).toLocaleString("de-DE")}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{l.lockout_count}</TableCell>
                      <TableCell className="text-xs font-mono">{l.last_ip || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={unlocking === l.email}
                          onClick={() => handleUnlock(l.email)}
                        >
                          {unlocking === l.email
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : (<><Unlock className="h-3 w-3 mr-1" /> Entsperren</>)}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Anomalie-Sessions</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Stufen</SelectItem>
                <SelectItem value="critical">Nur kritisch</SelectItem>
                <SelectItem value="medium">Nur mittel</SelectItem>
                <SelectItem value="low">Nur niedrig</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Neu laden"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">Keine Anomalien gefunden 🎉</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zeitpunkt</TableHead>
                  <TableHead>Nutzer</TableHead>
                  <TableHead>Stufe</TableHead>
                  <TableHead>Grund</TableHead>
                  <TableHead>Standort</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Gerät</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(r.logged_in_at).toLocaleString("de-DE")}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{r.user_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.user_email || r.user_id.slice(0, 8)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={levelColor[r.anomaly_level]}>
                        {levelLabel[r.anomaly_level]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[260px]">{r.anomaly_reason}</TableCell>
                    <TableCell className="text-xs">{[r.city, r.country].filter(Boolean).join(", ") || "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{r.ip_address || "—"}</TableCell>
                    <TableCell className="text-xs">{r.browser} / {r.os}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={forcingLogout === r.user_id || !r.aktiv}
                        onClick={() => handleForceLogout(r.user_id, r.user_name || r.user_email || r.user_id)}
                      >
                        {forcingLogout === r.user_id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Abmelden"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <IpAllowlistManager />
    </div>
  );
}