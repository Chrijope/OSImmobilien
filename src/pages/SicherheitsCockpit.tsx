import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, RefreshCw, ShieldAlert, ShieldCheck, KeyRound, ScrollText,
  AlertTriangle, CheckCircle2, Database, Lock,
} from "lucide-react";
import { toast } from "sonner";

interface SecretInfo {
  name: string;
  configured: boolean;
  lastRotatedAt: string | null;
  rotatedByName: string | null;
  notes: string | null;
  ageDays: number | null;
  severity: "ok" | "warn" | "critical" | "unknown";
}

interface CockpitData {
  linter: any;
  anomalies: any;
  secrets: SecretInfo[];
  rotationThresholds: { warnDays: number; criticalDays: number };
  scannedAt: string;
}

function fmtDate(iso: string | null) {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function SeverityBadge({ severity }: { severity: SecretInfo["severity"] }) {
  if (severity === "ok") return <Badge className="bg-green-600 hover:bg-green-700"><CheckCircle2 className="h-3 w-3 mr-1" /> OK</Badge>;
  if (severity === "warn") return <Badge className="bg-amber-600 hover:bg-amber-700"><AlertTriangle className="h-3 w-3 mr-1" /> Rotation fällig</Badge>;
  if (severity === "critical") return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" /> Überfällig</Badge>;
  return <Badge variant="outline">Unbekannt</Badge>;
}

function RotateSecretDialog({ secret, onDone }: { secret: SecretInfo; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", userData.user?.id ?? "")
        .maybeSingle();

      const { error } = await (supabase as any)
        .from("secret_rotations")
        .upsert(
          {
            secret_name: secret.name,
            last_rotated_at: new Date().toISOString(),
            rotated_by: userData.user?.id,
            rotated_by_name: profile?.name ?? userData.user?.email ?? null,
            notes: notes.trim() || null,
          },
          { onConflict: "secret_name" },
        );
      if (error) throw error;
      toast.success(`Rotation für ${secret.name} dokumentiert`);
      setOpen(false);
      setNotes("");
      onDone();
    } catch (e: any) {
      toast.error("Speichern fehlgeschlagen: " + (e?.message ?? ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Rotiert markieren</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Secret rotiert: {secret.name}</DialogTitle>
          <DialogDescription>
            Bestätige, dass du diesen Schlüssel beim Anbieter neu erstellt und in den Cloud-Secrets aktualisiert hast.
            Die Rotation wird mit Zeitstempel und deinem Namen protokolliert.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Notiz (optional): z. B. Grund der Rotation, neue Quelle…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Rotation dokumentieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SicherheitsCockpit() {
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [cspHasHeader, setCspHasHeader] = useState<boolean | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke("security-cockpit");
      if (error) throw error;
      setData(resp as CockpitData);
    } catch (e: any) {
      toast.error("Laden fehlgeschlagen: " + (e?.message ?? ""));
    } finally {
      setLoading(false);
    }
  };

  const checkCSP = async () => {
    try {
      const res = await fetch(window.location.origin + "/", { method: "HEAD" });
      setCspHasHeader(res.headers.has("content-security-policy"));
    } catch {
      setCspHasHeader(false);
    }
  };

  useEffect(() => {
    load();
    checkCSP();
  }, []);

  const linter = data?.linter;
  const anomalies = data?.anomalies;

  const linterIssueCount =
    (linter?.rls_disabled?.length ?? 0) +
    (linter?.definer_no_search_path?.length ?? 0) +
    (linter?.rls_no_policy?.length ?? 0);

  const anomalyCount =
    (anomalies?.mass_deletes?.length ?? 0) +
    (anomalies?.role_changes?.length ?? 0) +
    (anomalies?.dsgvo_deletes?.length ?? 0);

  const rotationCriticalCount = (data?.secrets ?? []).filter((s) => s.severity === "critical").length;
  const rotationWarnCount = (data?.secrets ?? []).filter((s) => s.severity === "warn").length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-7 w-7" /> Sicherheits-Cockpit
          </h1>
          <p className="text-muted-foreground mt-1">
            Datenbank-Linter, Audit-Anomalien, Secret-Rotation und CSP-Status auf einen Blick.
          </p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Aktualisieren
        </Button>
      </div>

      {/* Übersichts-Kacheln */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Database className="h-4 w-4" /> DB-Befunde</div>
          <div className={`text-2xl font-bold ${linterIssueCount > 0 ? "text-amber-600" : "text-green-600"}`}>{linterIssueCount}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><ScrollText className="h-4 w-4" /> Audit-Anomalien (24h)</div>
          <div className={`text-2xl font-bold ${anomalyCount > 0 ? "text-destructive" : "text-green-600"}`}>{anomalyCount}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><KeyRound className="h-4 w-4" /> Secret-Rotation</div>
          <div className="text-2xl font-bold">
            <span className="text-destructive">{rotationCriticalCount}</span>
            <span className="text-muted-foreground mx-1">/</span>
            <span className="text-amber-600">{rotationWarnCount}</span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="h-4 w-4" /> CSP-Header</div>
          <div className="text-2xl font-bold">
            {cspHasHeader === null
              ? <Badge variant="outline">Prüfe…</Badge>
              : cspHasHeader
                ? <Badge className="bg-green-600">Aktiv</Badge>
                : <Badge variant="destructive">Nur Meta-Tag</Badge>}
          </div>
        </Card>
      </div>

      <Tabs defaultValue="linter" className="space-y-4">
        <TabsList>
          <TabsTrigger value="linter">DB-Linter</TabsTrigger>
          <TabsTrigger value="anomalies">Audit-Anomalien</TabsTrigger>
          <TabsTrigger value="secrets">Secret-Rotation</TabsTrigger>
          <TabsTrigger value="csp">CSP &amp; Header</TabsTrigger>
        </TabsList>

        {/* DB-Linter */}
        <TabsContent value="linter" className="space-y-4">
          <LinterSection title="Tabellen ohne RLS" items={linter?.rls_disabled ?? []} severity="critical"
            render={(t: any) => `${t.schema}.${t.tabelle}`} />
          <LinterSection title="RLS aktiv, aber keine Policy" items={linter?.rls_no_policy ?? []} severity="warn"
            render={(t: any) => t.tabelle} />
          <LinterSection title="SECURITY DEFINER ohne search_path" items={linter?.definer_no_search_path ?? []} severity="warn"
            render={(t: any) => `${t.funktion}(${t.args})`} />
        </TabsContent>

        {/* Anomalien */}
        <TabsContent value="anomalies" className="space-y-4">
          <AnomalyCard title="Massen-Löschungen (>10/24h)" rows={anomalies?.mass_deletes ?? []}
            cols={[
              ["Actor", (r: any) => r.actor_email ?? r.actor ?? "–"],
              ["Entity", (r: any) => r.entity],
              ["Anzahl", (r: any) => r.anzahl],
              ["Von", (r: any) => fmtDate(r.von)],
              ["Bis", (r: any) => fmtDate(r.bis)],
            ]} />
          <AnomalyCard title="Rollen-Änderungen (24h)" rows={anomalies?.role_changes ?? []}
            cols={[
              ["Actor", (r: any) => r.actor_email ?? "–"],
              ["Aktion", (r: any) => r.action],
              ["Entity-ID", (r: any) => r.entity_id ?? "–"],
              ["Zeit", (r: any) => fmtDate(r.erstellt_am)],
            ]} />
          <AnomalyCard title="Fehlgeschlagene Logins" rows={anomalies?.login_failures ?? []}
            cols={[
              ["E-Mail", (r: any) => r.email],
              ["Versuche", (r: any) => r.failed_attempts],
              ["Lockouts", (r: any) => r.lockout_count],
              ["IP", (r: any) => r.last_ip ?? "–"],
              ["Letzter Versuch", (r: any) => fmtDate(r.last_failed_at)],
            ]} />
          <AnomalyCard title="DSGVO-Hard-Deletes (7 Tage)" rows={anomalies?.dsgvo_deletes ?? []}
            cols={[
              ["Actor", (r: any) => r.actor_email ?? "–"],
              ["Kontakt-ID", (r: any) => r.entity_id ?? "–"],
              ["Grund", (r: any) => r.meta?.grund_referenz ?? "–"],
              ["Zeit", (r: any) => fmtDate(r.erstellt_am)],
            ]} />
        </TabsContent>

        {/* Secrets */}
        <TabsContent value="secrets" className="space-y-4">
          <Card className="p-4 text-sm text-muted-foreground">
            Warn-Schwelle: <strong>{data?.rotationThresholds?.warnDays ?? 90} Tage</strong> · Kritisch ab: <strong>{data?.rotationThresholds?.criticalDays ?? 180} Tage</strong>.
            Nach jeder Schlüssel-Erneuerung beim Anbieter hier dokumentieren.
          </Card>
          <div className="space-y-2">
            {(data?.secrets ?? []).map((s) => (
              <Card key={s.name} className={`p-4 ${s.severity === "critical" ? "border-destructive" : ""}`}>
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold">{s.name}</span>
                      {s.configured
                        ? <Badge variant="secondary">konfiguriert</Badge>
                        : <Badge variant="outline" className="text-muted-foreground">nicht gesetzt</Badge>}
                      <SeverityBadge severity={s.severity} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Letzte Rotation: {fmtDate(s.lastRotatedAt)}
                      {s.ageDays != null && <> · vor <strong>{s.ageDays} Tagen</strong></>}
                      {s.rotatedByName && <> · durch {s.rotatedByName}</>}
                    </div>
                    {s.notes && <div className="text-xs text-muted-foreground">Notiz: {s.notes}</div>}
                  </div>
                  <RotateSecretDialog secret={s} onDone={load} />
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* CSP */}
        <TabsContent value="csp" className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              {cspHasHeader
                ? <><ShieldCheck className="h-5 w-5 text-green-600" /> <span className="font-semibold">CSP wird als HTTP-Header ausgeliefert</span></>
                : <><ShieldAlert className="h-5 w-5 text-amber-600" /> <span className="font-semibold">CSP nur als Meta-Tag (HTTP-Header empfohlen)</span></>}
            </div>
            <p className="text-sm text-muted-foreground">
              Der HTTP-Header <code>Content-Security-Policy</code> hat Vorrang vor dem
              <code> &lt;meta&gt; </code>-Tag und greift bereits beim ersten Byte. Konfiguriert in <code>public/_headers</code>.
            </p>
            <div className="text-sm space-y-1">
              <div>✓ <code>default-src 'self'</code> – nur eigene Origin</div>
              <div>✓ <code>object-src 'none'</code> – keine Plugins / Flash</div>
              <div>✓ <code>frame-ancestors 'self'</code> – Clickjacking-Schutz</div>
              <div>✓ <code>base-uri 'self'</code> – Base-Tag-Injection blockiert</div>
              <div>✓ <code>upgrade-insecure-requests</code> – Mixed-Content auto-HTTPS</div>
              <div>! <code>script-src 'unsafe-inline' 'unsafe-eval'</code> – Vite-bedingt; nach Build-Hardening prüfen</div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="font-semibold mb-2">Weitere aktive Security-Header</div>
            <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
              <li>Strict-Transport-Security (2 Jahre, includeSubDomains, preload)</li>
              <li>X-Frame-Options: SAMEORIGIN</li>
              <li>X-Content-Type-Options: nosniff</li>
              <li>Referrer-Policy: strict-origin-when-cross-origin</li>
              <li>Permissions-Policy: Kamera/Mikrofon/Payment blockiert</li>
              <li>Cross-Origin-Opener-Policy: same-origin</li>
            </ul>
          </Card>
        </TabsContent>
      </Tabs>

      {data?.scannedAt && (
        <div className="text-xs text-muted-foreground text-right">
          Letzter Scan: {fmtDate(data.scannedAt)}
        </div>
      )}
    </div>
  );
}

function LinterSection({
  title, items, severity, render,
}: {
  title: string;
  items: any[];
  severity: "warn" | "critical";
  render: (item: any) => string;
}) {
  const empty = items.length === 0;
  return (
    <Card className={`p-4 ${!empty && severity === "critical" ? "border-destructive" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">{title}</div>
        {empty
          ? <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Sauber</Badge>
          : <Badge variant={severity === "critical" ? "destructive" : "outline"} className={severity === "warn" ? "text-amber-600 border-amber-600" : ""}>
              {items.length} Befund{items.length !== 1 ? "e" : ""}
            </Badge>}
      </div>
      {!empty && (
        <ul className="text-sm space-y-1 font-mono">
          {items.map((it, i) => <li key={i}>• {render(it)}</li>)}
        </ul>
      )}
    </Card>
  );
}

function AnomalyCard({
  title, rows, cols,
}: {
  title: string;
  rows: any[];
  cols: Array<[string, (r: any) => any]>;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold">{title}</div>
        {rows.length === 0
          ? <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Unauffällig</Badge>
          : <Badge variant="destructive">{rows.length}</Badge>}
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                {cols.map(([h]) => <th key={h} className="py-2 pr-3">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  {cols.map(([h, get]) => <td key={h} className="py-2 pr-3 align-top">{String(get(r) ?? "–")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}