import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollText, RefreshCw, Download, FileText } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { logAudit } from "@/lib/auditLog";
import jsPDF from "jspdf";

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  actor: string | null;
  actor_email: string | null;
  vorher: any;
  nachher: any;
  meta: any;
  erstellt_am: string;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AuditLog() {
  const { user } = useUser();
  const isAdmin = ["admin", "inhaber"].includes(user.role);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("alle");
  const [entityFilter, setEntityFilter] = useState<string>("alle");
  const [range, setRange] = useState<string>("30");
  const [expanded, setExpanded] = useState<string | null>(null);

  const exportCSV = async () => {
    const headers = ["Datum","Action","Entity","EntityId","Actor","ActorEmail","Meta"];
    const esc = (v: any) => {
      const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [headers.join(",")];
    for (const r of filtered) {
      lines.push([
        fmtDate(r.erstellt_am), r.action, r.entity, r.entity_id || "",
        r.actor || "", r.actor_email || "", r.meta || {},
      ].map(esc).join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `audit-log_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    await logAudit({ action: "audit_log_exported", entity: "audit_log", meta: { format: "csv", count: filtered.length, range_days: parseInt(range) } });
  };

  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    doc.setFontSize(14);
    doc.text("Audit-Log Export – MOREImmo CRM", 40, 40);
    doc.setFontSize(9);
    doc.text(`Erstellt: ${new Date().toLocaleString("de-DE")} • Zeitraum: letzte ${range} Tage • ${filtered.length} Einträge`, 40, 58);
    let y = 84;
    doc.setFontSize(8);
    const lineH = 11;
    for (const r of filtered) {
      if (y > 540) { doc.addPage(); y = 40; }
      const header = `${fmtDate(r.erstellt_am)}  •  ${r.entity}  •  ${r.action}  •  ${r.actor_email || "system"}`;
      doc.setFont(undefined, "bold");
      doc.text(header.substring(0, 160), 40, y);
      y += lineH;
      doc.setFont(undefined, "normal");
      if (r.entity_id) { doc.text(`ID: ${r.entity_id}`, 40, y); y += lineH; }
      const metaStr = JSON.stringify(r.meta || {});
      if (metaStr.length > 2) {
        const wrapped = doc.splitTextToSize(`Meta: ${metaStr}`, w - 80);
        doc.text(wrapped.slice(0, 4), 40, y);
        y += lineH * Math.min(wrapped.length, 4);
      }
      y += 4;
    }
    doc.save(`audit-log_${new Date().toISOString().slice(0,10)}.pdf`);
    await logAudit({ action: "audit_log_exported", entity: "audit_log", meta: { format: "pdf", count: filtered.length, range_days: parseInt(range) } });
  };

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - parseInt(range) * 86400000).toISOString();
    const { data, error } = await supabase
      .from("audit_log")
      .select("*")
      .gte("erstellt_am", since)
      .order("erstellt_am", { ascending: false })
      .limit(1000);
    if (error) console.error("[AuditLog]", error);
    setRows((data as AuditRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, range]);

  const actions = useMemo(() => Array.from(new Set(rows.map(r => r.action))).sort(), [rows]);
  const entities = useMemo(() => Array.from(new Set(rows.map(r => r.entity))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (actionFilter !== "alle" && r.action !== actionFilter) return false;
      if (entityFilter !== "alle" && r.entity !== entityFilter) return false;
      if (!q) return true;
      return (
        (r.actor_email || "").toLowerCase().includes(q) ||
        (r.entity_id || "").toLowerCase().includes(q) ||
        r.action.toLowerCase().includes(q) ||
        r.entity.toLowerCase().includes(q) ||
        JSON.stringify(r.meta || {}).toLowerCase().includes(q)
      );
    });
  }, [rows, search, actionFilter, entityFilter]);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Diese Seite ist nur für Inhaber und Admins sichtbar.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <ScrollText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Audit-Log</h1>
          <p className="text-sm text-muted-foreground">
            Revisionssicheres Protokoll aller sensiblen Änderungen. Nur sichtbar für Inhaber & Admins.
          </p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Aktualisieren
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCSV} disabled={loading || filtered.length === 0}>
          <Download className="h-3.5 w-3.5" /> CSV
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={exportPDF} disabled={loading || filtered.length === 0}>
          <FileText className="h-3.5 w-3.5" /> PDF
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Filter</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input
            placeholder="Suche (User, ID, Action, Meta)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
          />
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Actions</SelectItem>
              {actions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Entity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Entitäten</SelectItem>
              {entities.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Letzte 24 Stunden</SelectItem>
              <SelectItem value="7">Letzte 7 Tage</SelectItem>
              <SelectItem value="30">Letzte 30 Tage</SelectItem>
              <SelectItem value="90">Letzte 90 Tage</SelectItem>
              <SelectItem value="365">Letztes Jahr</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">
            {filtered.length} Eintrag{filtered.length === 1 ? "" : "e"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Lade…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Keine Einträge gefunden.</div>
          ) : (
            <div className="divide-y">
              {filtered.map(r => {
                const open = expanded === r.id;
                return (
                  <div key={r.id} className="px-4 py-3 hover:bg-muted/30">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : r.id)}
                      className="w-full flex items-center justify-between gap-3 text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Badge variant="secondary" className="text-[10px]">{r.entity}</Badge>
                        <span className="text-xs font-medium truncate">{r.action}</span>
                        {r.entity_id && (
                          <span className="text-[10px] text-muted-foreground font-mono truncate">
                            {r.entity_id.slice(0, 8)}…
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
                        <span className="truncate max-w-[200px]">{r.actor_email || "system"}</span>
                        <span>{fmtDate(r.erstellt_am)}</span>
                      </div>
                    </button>
                    {open && (
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        <div>
                          <div className="font-semibold mb-1">Vorher</div>
                          <pre className="bg-muted/40 p-2 rounded text-[10px] overflow-auto max-h-64">
                            {JSON.stringify(r.vorher ?? null, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div className="font-semibold mb-1">Nachher</div>
                          <pre className="bg-muted/40 p-2 rounded text-[10px] overflow-auto max-h-64">
                            {JSON.stringify(r.nachher ?? null, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div className="font-semibold mb-1">Meta</div>
                          <pre className="bg-muted/40 p-2 rounded text-[10px] overflow-auto max-h-64">
                            {JSON.stringify(r.meta ?? {}, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}