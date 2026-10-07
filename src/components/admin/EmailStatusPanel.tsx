import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, CheckCircle2, Clock, XCircle, AlertTriangle, Mail } from "lucide-react";
import { toast } from "sonner";

interface LogRow {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface Stats {
  sent: number;
  pending: number;
  failed: number;
  dlq: number;
}

const STATUS_META: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  sent: { label: "Gesendet", icon: CheckCircle2, className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  pending: { label: "Ausstehend", icon: Clock, className: "bg-amber-100 text-amber-800 border-amber-300" },
  failed: { label: "Fehlgeschlagen", icon: XCircle, className: "bg-red-100 text-red-800 border-red-300" },
  dlq: { label: "Dead Letter", icon: AlertTriangle, className: "bg-red-200 text-red-900 border-red-400" },
  suppressed: { label: "Unterdrückt", icon: XCircle, className: "bg-muted text-muted-foreground border-border" },
  bounced: { label: "Bounce", icon: XCircle, className: "bg-orange-100 text-orange-800 border-orange-300" },
};

function formatDate(d: string): string {
  const date = new Date(d);
  return date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function EmailStatusPanel() {
  const [stats, setStats] = useState<Stats>({ sent: 0, pending: 0, failed: 0, dlq: 0 });
  const [recent, setRecent] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "failed" | "pending">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Stats (24h, dedupliziert nach message_id über letzten Status)
      const { data: statsRows } = await supabase
        .from("email_send_log")
        .select("status, message_id, created_at, metadata")
        .gte("created_at", since)
        .or("metadata.is.null,metadata->>testSend.neq.true")
        .order("created_at", { ascending: false })
        .limit(5000);

      const latestByMsg = new Map<string, string>();
      (statsRows ?? []).forEach((r: any) => {
        const key = r.message_id ?? r.id;
        if (!latestByMsg.has(key)) latestByMsg.set(key, r.status);
      });
      const counts: Stats = { sent: 0, pending: 0, failed: 0, dlq: 0 };
      latestByMsg.forEach((s) => {
        if (s === "sent") counts.sent++;
        else if (s === "pending") counts.pending++;
        else if (s === "dlq") counts.dlq++;
        else if (s === "failed") counts.failed++;
      });
      setStats(counts);

      // Letzte 50 Logs
      let q = supabase
        .from("email_send_log")
        .select("id, message_id, template_name, recipient_email, status, error_message, created_at, metadata")
        .or("metadata.is.null,metadata->>testSend.neq.true")
        .order("created_at", { ascending: false })
        .limit(50);
      if (filter === "failed") q = q.in("status", ["failed", "dlq"]);
      if (filter === "pending") q = q.eq("status", "pending");
      const { data, error } = await q;
      if (error) throw error;
      setRecent((data ?? []) as LogRow[]);
    } catch (err) {
      console.error("Fehler beim Laden des E-Mail-Logs:", err);
      toast.error("E-Mail-Status konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">E-Mail-Versand Status</h3>
          <span className="text-xs text-muted-foreground">(letzte 24 h)</span>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Gesendet" value={stats.sent} icon={CheckCircle2} tone="success" />
        <StatCard label="Ausstehend" value={stats.pending} icon={Clock} tone="warning" />
        <StatCard label="Fehlgeschlagen" value={stats.failed} icon={XCircle} tone="error" />
        <StatCard label="Dead Letter" value={stats.dlq} icon={AlertTriangle} tone="error" />
      </div>

      {(stats.dlq > 0 || stats.failed > 5) && (
        <Card className="p-3 border-red-300 bg-red-50 dark:bg-red-950/20">
          <p className="text-sm text-red-900 dark:text-red-200 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              Es gibt aktuell {stats.dlq > 0 ? `${stats.dlq} unzustellbare Nachricht(en) in der Dead-Letter-Queue` : `eine erhöhte Fehlerrate (${stats.failed} Fehler)`}.
              Prüfe die Liste unten, um Empfänger und Ursache zu sehen.
            </span>
          </p>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>Alle</Button>
        <Button variant={filter === "pending" ? "default" : "outline"} size="sm" onClick={() => setFilter("pending")}>Ausstehend</Button>
        <Button variant={filter === "failed" ? "default" : "outline"} size="sm" onClick={() => setFilter("failed")}>Nur Fehler</Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Zeit</TableHead>
              <TableHead>Empfänger</TableHead>
              <TableHead>Template</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
              <TableHead>Fehler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  {loading ? "Lade…" : "Keine Einträge gefunden."}
                </TableCell>
              </TableRow>
            )}
            {recent.map((row) => {
              const meta = STATUS_META[row.status] ?? { label: row.status, icon: Clock, className: "bg-muted text-muted-foreground border-border" };
              const Icon = meta.icon;
              return (
                <TableRow key={row.id}>
                  <TableCell className="text-xs whitespace-nowrap">{formatDate(row.created_at)}</TableCell>
                  <TableCell className="text-sm font-medium truncate max-w-[200px]">{row.recipient_email}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.template_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[11px] ${meta.className}`}>
                      <Icon className="h-3 w-3 mr-1" />
                      {meta.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[260px]" title={row.error_message ?? ""}>
                    {row.error_message ?? "–"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof CheckCircle2; tone: "success" | "warning" | "error" }) {
  const toneClasses = {
    success: "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 border-emerald-200",
    warning: "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border-amber-200",
    error: "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 border-red-200",
  }[tone];
  return (
    <Card className={`p-4 border ${toneClasses}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <Icon className="h-8 w-8 opacity-60" />
      </div>
    </Card>
  );
}
