import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, RefreshCw, ScrollText, ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";

type SignatureStatus = "verified" | "invalid" | "missing" | "not_required";

interface WebhookRow {
  id: string;
  source: string;
  event: string | null;
  method: string | null;
  status_code: number | null;
  ip: string | null;
  user_agent: string | null;
  signature_status: SignatureStatus;
  signature_reason: string | null;
  payload: any;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function SignatureBadge({ status, reason }: { status: SignatureStatus; reason: string | null }) {
  if (status === "verified") {
    return <Badge className="bg-green-600 hover:bg-green-700"><ShieldCheck className="h-3 w-3 mr-1" /> Verifiziert</Badge>;
  }
  if (status === "invalid") {
    return <Badge variant="destructive"><ShieldX className="h-3 w-3 mr-1" /> Ungültig{reason ? `: ${reason}` : ""}</Badge>;
  }
  if (status === "missing") {
    return <Badge variant="outline" className="text-amber-600 border-amber-600"><ShieldAlert className="h-3 w-3 mr-1" /> Fehlt</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground"><ShieldQuestion className="h-3 w-3 mr-1" /> n/a</Badge>;
}

function StatusBadge({ code }: { code: number | null }) {
  if (code == null) return <Badge variant="outline">–</Badge>;
  if (code >= 200 && code < 300) return <Badge className="bg-green-600 hover:bg-green-700">{code}</Badge>;
  if (code === 401 || code === 403) return <Badge variant="destructive">{code}</Badge>;
  if (code === 429) return <Badge className="bg-amber-600 hover:bg-amber-700">{code}</Badge>;
  if (code >= 400 && code < 500) return <Badge variant="outline" className="text-amber-600 border-amber-600">{code}</Badge>;
  if (code >= 500) return <Badge variant="destructive">{code}</Badge>;
  return <Badge variant="outline">{code}</Badge>;
}

export default function WebhookAudit() {
  const [rows, setRows] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<string>("all");
  const [sigFilter, setSigFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<WebhookRow | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("webhook_audit_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (source !== "all") q = q.eq("source", source);
      if (sigFilter !== "all") q = q.eq("signature_status", sigFilter);
      // Der Statusfilter läuft bewusst in der Datenbank und nicht erst auf den
      // geladenen Zeilen. Sonst zeigt die Seite nur die Fehler, die es zufällig
      // in die letzten 500 Einträge geschafft haben, und bei einem lauten
      // Zulieferer sind das genau keine.
      if (statusFilter === "fehler") q = q.gte("status_code", 400);
      else if (statusFilter === "rate_limit") q = q.eq("status_code", 429);
      else if (statusFilter === "serverfehler") q = q.gte("status_code", 500);
      else if (statusFilter === "erfolg") q = q.gte("status_code", 200).lt("status_code", 300);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as unknown as WebhookRow[]);
    } catch (e: any) {
      toast.error("Laden fehlgeschlagen: " + (e?.message ?? ""));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [source, sigFilter, statusFilter]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) =>
      [r.source, r.event, r.ip, r.error_message, r.signature_reason]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [rows, search]);

  const stats = useMemo(() => {
    const total = rows.length;
    const verified = rows.filter((r) => r.signature_status === "verified").length;
    const invalid = rows.filter((r) => r.signature_status === "invalid").length;
    const errors = rows.filter((r) => (r.status_code ?? 0) >= 400).length;
    return { total, verified, invalid, errors };
  }, [rows]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ScrollText className="h-7 w-7" /> Webhook-Audit-Log
          </h1>
          <p className="text-muted-foreground mt-1">
            Eingehende Webhooks (Sipgate, Lead-API) mit Signature-Status, IP und Payload-Vorschau.
          </p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Aktualisieren
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Gesamt (letzte 500)</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Signatur verifiziert</div>
          <div className="text-2xl font-bold text-green-600">{stats.verified}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Signatur ungültig</div>
          <div className="text-2xl font-bold text-destructive">{stats.invalid}</div>
        </Card>
        <Card
          className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setStatusFilter(statusFilter === "fehler" ? "all" : "fehler")}
          title="Auf Fehler filtern"
        >
          <div className="text-sm text-muted-foreground">Fehler (ab 400)</div>
          <div className="text-2xl font-bold text-amber-600">{stats.errors}</div>
        </Card>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap gap-3">
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Quelle" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Quellen</SelectItem>
              <SelectItem value="sipgate">Sipgate</SelectItem>
              <SelectItem value="submit-lead">Lead-API</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sigFilter} onValueChange={setSigFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Signature-Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Signaturen</SelectItem>
              <SelectItem value="verified">Verifiziert</SelectItem>
              <SelectItem value="invalid">Ungültig</SelectItem>
              <SelectItem value="missing">Fehlt</SelectItem>
              <SelectItem value="not_required">Nicht erforderlich</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Statuscode" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Statuscodes</SelectItem>
              <SelectItem value="fehler">Nur Fehler (ab 400)</SelectItem>
              <SelectItem value="rate_limit">Rate-Limit (429)</SelectItem>
              <SelectItem value="serverfehler">Serverfehler (ab 500)</SelectItem>
              <SelectItem value="erfolg">Erfolgreich (2xx)</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Suche (Event, IP, Fehler…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zeit</TableHead>
                <TableHead>Quelle</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Signatur</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Dauer</TableHead>
                <TableHead>Fehler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Keine Einträge gefunden.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelected(r)}
                >
                  <TableCell className="font-mono text-xs whitespace-nowrap">{fmtDate(r.created_at)}</TableCell>
                  <TableCell><Badge variant="outline">{r.source}</Badge></TableCell>
                  <TableCell className="text-sm">{r.event ?? "–"}</TableCell>
                  <TableCell><StatusBadge code={r.status_code} /></TableCell>
                  <TableCell><SignatureBadge status={r.signature_status} reason={r.signature_reason} /></TableCell>
                  <TableCell className="font-mono text-xs">{r.ip ?? "–"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.duration_ms != null ? `${r.duration_ms} ms` : "–"}</TableCell>
                  <TableCell className="text-xs text-destructive max-w-[200px] truncate">{r.error_message ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Webhook-Detail · {selected?.source} · {selected ? fmtDate(selected.created_at) : ""}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Event:</span> {selected.event ?? "–"}</div>
                <div><span className="text-muted-foreground">Methode:</span> {selected.method ?? "–"}</div>
                <div><span className="text-muted-foreground">Status:</span> <StatusBadge code={selected.status_code} /></div>
                <div><span className="text-muted-foreground">Signatur:</span> <SignatureBadge status={selected.signature_status} reason={selected.signature_reason} /></div>
                <div><span className="text-muted-foreground">IP:</span> <span className="font-mono">{selected.ip ?? "–"}</span></div>
                <div><span className="text-muted-foreground">Dauer:</span> {selected.duration_ms ?? "–"} ms</div>
                <div className="col-span-2"><span className="text-muted-foreground">User-Agent:</span> <span className="font-mono text-xs break-all">{selected.user_agent ?? "–"}</span></div>
                {selected.error_message && (
                  <div className="col-span-2"><span className="text-muted-foreground">Fehler:</span> <span className="text-destructive">{selected.error_message}</span></div>
                )}
              </div>
              <div>
                <div className="text-muted-foreground mb-2 font-medium">Payload</div>
                <pre className="bg-muted p-3 rounded text-xs overflow-x-auto max-h-[400px]">
{JSON.stringify(selected.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}