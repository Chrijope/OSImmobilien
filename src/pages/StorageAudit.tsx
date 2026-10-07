import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldAlert, ShieldCheck, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Wrench } from "lucide-react";

interface BucketResult {
  id: string;
  name: string;
  public: boolean;
  sensitive: boolean;
  fileCount: number;
  totalBytes: number;
  createdAt: string;
  issues: string[];
  severity: "ok" | "warn" | "critical";
}

function formatBytes(b: number) {
  if (!b) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

export default function StorageAudit() {
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [buckets, setBuckets] = useState<BucketResult[]>([]);
  const [scannedAt, setScannedAt] = useState<string | null>(null);

  const runScan = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("storage-audit");
      if (error) throw error;
      setBuckets((data?.buckets ?? []) as BucketResult[]);
      setScannedAt(data?.scannedAt ?? null);
    } catch (e: any) {
      toast.error("Scan fehlgeschlagen: " + (e?.message ?? "Unbekannter Fehler"));
    } finally {
      setLoading(false);
    }
  };

  const runAutoFix = async () => {
    setFixing(true);
    try {
      const { data, error } = await supabase.functions.invoke("storage-audit", {
        body: { action: "autofix" },
      });
      if (error) throw error;
      const count = data?.fixedCount ?? 0;
      if (count === 0) {
        toast.success("Keine kritischen Buckets gefunden – alles sauber.");
      } else {
        const failed = (data?.fixed ?? []).filter((f: any) => !f.success);
        if (failed.length > 0) {
          toast.error(`${count - failed.length} Bucket(s) gesperrt, ${failed.length} Fehler.`);
        } else {
          toast.success(`${count} sensible Bucket(s) auf privat gesetzt.`);
        }
      }
      await runScan();
    } catch (e: any) {
      toast.error("Auto-Fix fehlgeschlagen: " + (e?.message ?? "Unbekannter Fehler"));
    } finally {
      setFixing(false);
    }
  };

  useEffect(() => { runScan(); }, []);

  const critical = buckets.filter(b => b.severity === "critical");
  const warn = buckets.filter(b => b.severity === "warn");

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-7 w-7" /> Storage-Bucket-Audit
          </h1>
          <p className="text-muted-foreground mt-1">
            Übersicht aller Buckets, Public-Status und Sicherheitswarnungen.
            {scannedAt && <span className="ml-2 text-xs">Zuletzt: {new Date(scannedAt).toLocaleString("de-DE")}</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={runScan} disabled={loading || fixing} variant="outline">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Neu scannen
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={loading || fixing || critical.length === 0}>
                {fixing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wrench className="h-4 w-4 mr-2" />}
                Auto-Fix {critical.length > 0 ? `(${critical.length})` : ""}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sensible Buckets jetzt sperren?</AlertDialogTitle>
                <AlertDialogDescription>
                  Alle als sensibel markierten Buckets, die aktuell öffentlich erreichbar sind,
                  werden auf <strong>privat</strong> umgestellt. Bestehende öffentliche Links
                  funktionieren danach nicht mehr – nur noch signierte URLs.
                  Die Aktion wird im Audit-Log protokolliert.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={runAutoFix}>Jetzt sperren</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Buckets gesamt</div>
          <div className="text-3xl font-bold">{buckets.length}</div>
        </Card>
        <Card className="p-4 border-destructive/40">
          <div className="text-sm text-muted-foreground">Kritisch</div>
          <div className="text-3xl font-bold text-destructive">{critical.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Warnungen</div>
          <div className="text-3xl font-bold">{warn.length}</div>
        </Card>
      </div>

      <div className="space-y-3">
        {buckets.map((b) => (
          <Card key={b.id} className={`p-4 ${b.severity === "critical" ? "border-destructive" : ""}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-semibold">{b.name}</span>
                  {b.public
                    ? <Badge variant="destructive">öffentlich</Badge>
                    : <Badge variant="secondary">privat</Badge>}
                  {b.sensitive && <Badge variant="outline">sensibel</Badge>}
                  {b.severity === "ok" && <Badge className="bg-green-600"><ShieldCheck className="h-3 w-3 mr-1" /> OK</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {b.fileCount} Dateien · {formatBytes(b.totalBytes)}
                </div>
              </div>
            </div>
            {b.issues.length > 0 && (
              <div className="mt-3 space-y-1">
                {b.issues.map((iss, i) => (
                  <div key={i} className={`flex items-start gap-2 text-sm ${iss.startsWith("KRITISCH") ? "text-destructive" : "text-amber-600"}`}>
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{iss}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
        {!loading && buckets.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">Keine Buckets gefunden.</Card>
        )}
      </div>
    </div>
  );
}