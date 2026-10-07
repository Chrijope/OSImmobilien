import { useState, useEffect } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Building2, CheckCircle2, Lock, ShieldCheck, Eye, AlertCircle } from "lucide-react";
import { getObjekteImAngebot, type ObjektData, type ObjektWohnung } from "@/lib/objekteStore";
import { zielRouteFuerObjekt } from "@/lib/objektseiteDaten";
import { getWohnungDisplayStatus } from "@/lib/investmentsStore";
import { useUser } from "@/contexts/UserContext";

const STATUS_CONFIG: Record<string, { label: string; color: string; bgClass: string; barColor: string; dotColor: string; icon: React.ReactNode }> = {
  frei: { label: "Verfügbar", color: "bg-[hsl(120,100%,40%)]", barColor: "bg-[hsl(120,100%,40%)]", dotColor: "bg-[hsl(120,100%,40%)]", bgClass: "bg-[hsl(120,100%,40%)]/10 text-[hsl(120,100%,40%)] border-[hsl(120,100%,40%)]/30", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  reserviert: { label: "Reserviert", color: "bg-[hsl(220,90%,55%)]", barColor: "bg-[hsl(220,90%,55%)]", dotColor: "bg-[hsl(220,90%,55%)]", bgClass: "bg-[hsl(220,90%,55%)]/10 text-[hsl(220,90%,55%)] border-[hsl(220,90%,55%)]/30", icon: <Lock className="h-3.5 w-3.5" /> },
  verkauft: { label: "Verkauft", color: "bg-[hsl(0,100%,50%)]", barColor: "bg-[hsl(0,100%,50%)]", dotColor: "bg-[hsl(0,100%,50%)]", bgClass: "bg-[hsl(0,100%,50%)]/10 text-[hsl(0,100%,50%)] border-[hsl(0,100%,50%)]/30", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  notar_mit_gs: { label: "Notar mit GS", color: "bg-[hsl(160,80%,40%)]", barColor: "bg-[hsl(160,80%,40%)]", dotColor: "bg-[hsl(160,80%,40%)]", bgClass: "bg-[hsl(160,80%,40%)]/10 text-[hsl(160,80%,40%)] border-[hsl(160,80%,40%)]/30", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  notar_ohne_gs: { label: "Notar ohne GS", color: "bg-[hsl(30,90%,50%)]", barColor: "bg-[hsl(30,90%,50%)]", dotColor: "bg-[hsl(30,90%,50%)]", bgClass: "bg-[hsl(30,90%,50%)]/10 text-[hsl(30,90%,50%)] border-[hsl(30,90%,50%)]/30", icon: <AlertCircle className="h-3.5 w-3.5" /> },
  notar: { label: "Notar", color: "bg-[hsl(260,70%,55%)]", barColor: "bg-[hsl(260,70%,55%)]", dotColor: "bg-[hsl(260,70%,55%)]", bgClass: "bg-[hsl(260,70%,55%)]/10 text-[hsl(260,70%,55%)] border-[hsl(260,70%,55%)]/30", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
};

const fmt = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function daysRemaining(gesetztBis?: string): number | null {
  if (!gesetztBis) return null;
  const parts = gesetztBis.split(".");
  if (parts.length !== 3) return null;
  const target = new Date(+parts[2], +parts[1] - 1, +parts[0]);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function Einheitenspiegel() {
  const navigate = useNavigate();
  const { user } = useUser();
  const isAdmin = ["admin", "vertriebsleiter", "inhaber", "backoffice"].includes(user.role);

  const [objekte, setObjekte] = useState<ObjektData[]>([]);
  const [selectedObjekt, setSelectedObjekt] = useState<string>("alle");

  // Objekte kommen in der zweiten Ladewelle; die Liste muss nachziehen.
  const objekteVersion = useLiveVersion(["objekte", "wohnungen"]);
  useEffect(() => {
    // Angebotssicht: verkaufte und in Investagon nicht angebotene Einheiten
    // fehlen (Christians Regel vom 23.09.2026, siehe `objektImAngebot`).
    let all = getObjekteImAngebot().filter(o => o.sichtbar);
    // Objektpartner: only show objects where they are listed as exclusive partner
    if (user.role === "objektpartner") {
      const userName = user.name || "";
      all = all.filter(o =>
        o.exklusivPartner && o.exklusivPartner.some(p => p.toLowerCase() === userName.toLowerCase())
      );
    }
    setObjekte(all);
  }, [user.role, user.name, objekteVersion]);

  // Collect all units
  const allWohnungen = objekte.flatMap(o =>
    o.wohnungen.map(w => ({ ...w, objektTitel: o.titel, objektId: o.id, objektOrt: o.ort }))
  );

  const filtered = selectedObjekt === "alle"
    ? allWohnungen
    : allWohnungen.filter(w => w.objektId === selectedObjekt);

  // Stats
  const stats = {
    frei: filtered.filter(w => w.status === "frei").length,
    reserviert: filtered.filter(w => w.status === "reserviert").length,
    verkauft: filtered.filter(w => w.status === "verkauft").length,
    total: filtered.length,
  };

  const verfuegbarkeit = stats.total > 0 ? Math.round((stats.frei / stats.total) * 100) : 0;
  const volumeFrei = filtered.filter(w => w.status === "frei").reduce((s, w) => s + w.vkGesamt, 0);
  const volumeGesamt = filtered.reduce((s, w) => s + w.vkGesamt, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Einheitenspiegel" subtitle="Live-Verfügbarkeit aller Objekte und Einheiten" />

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={selectedObjekt} onValueChange={setSelectedObjekt}>
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="Alle Objekte" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Objekte ({allWohnungen.length} Einheiten)</SelectItem>
            {objekte.map(o => (
              <SelectItem key={o.id} value={o.id}>{o.titel} ({o.wohnungen.length})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["frei", "reserviert", "verkauft"] as const).map(status => (
          <Card key={status}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-3 h-3 rounded-full ${STATUS_CONFIG[status].dotColor}`} />
                <span className="text-xs text-muted-foreground">{STATUS_CONFIG[status].label}</span>
              </div>
              <div className="text-2xl font-bold text-foreground">{stats[status]}</div>
              <div className="text-[10px] text-muted-foreground">{stats.total > 0 ? Math.round((stats[status] / stats.total) * 100) : 0}%</div>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Freies Volumen</div>
            <div className="text-lg font-bold text-foreground">{fmt(volumeFrei)}</div>
            <div className="text-[10px] text-muted-foreground">von {fmt(volumeGesamt)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Verfügbarkeitsbalken pro Objekt */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Verfügbarkeit pro Objekt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {objekte.map(o => {
            const wohnungen = o.wohnungen;
            const f = wohnungen.filter(w => w.status === "frei").length;
            const _g = 0; // gesetzt status removed
            const r = wohnungen.filter(w => w.status === "reserviert").length;
            const v = wohnungen.filter(w => w.status === "verkauft").length;
            const total = wohnungen.length;
            return (
              <div key={o.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <button onClick={() => navigate(zielRouteFuerObjekt(o))} className="text-sm font-medium hover:text-primary transition-colors text-left">
                    {o.titel}
                  </button>
                  <span className="text-xs text-muted-foreground">{f}/{total} frei</span>
                </div>
                <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                  {f > 0 && <div className={`${STATUS_CONFIG.frei.barColor} transition-all`} style={{ width: `${(f / total) * 100}%` }} />}
                  {r > 0 && <div className={`${STATUS_CONFIG.reserviert.barColor} transition-all`} style={{ width: `${(r / total) * 100}%` }} />}
                  {v > 0 && <div className={`${STATUS_CONFIG.verkauft.barColor} transition-all`} style={{ width: `${(v / total) * 100}%` }} />}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Einheiten-Tabelle */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Alle Einheiten ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>WE</TableHead>
                  <TableHead>Objekt</TableHead>
                  <TableHead>Größe</TableHead>
                  <TableHead>Kaufpreis</TableHead>
                  <TableHead>Miete</TableHead>
                  <TableHead>Rendite</TableHead>
                  <TableHead>Vermietet</TableHead>
                  {isAdmin && <TableHead>Kunde</TableHead>}
                  <TableHead>Frist</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(w => {
                  const days = null;
                  const displayStatus = getWohnungDisplayStatus(w.status, w.kundeId, false, w.id);
                  const statusCfg = STATUS_CONFIG[displayStatus.key] || STATUS_CONFIG[w.status];
                  return (
                    <TableRow key={`${w.objektId}-${w.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className={`text-[10px] gap-1 ${statusCfg.bgClass}`}>
                            {statusCfg.icon}
                            {displayStatus.label}
                          </Badge>
                          {(displayStatus.key === "notar_mit_gs" || displayStatus.key === "notar_ohne_gs") && (
                            <span className="text-[9px] text-muted-foreground italic">nur intern</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-sm">{w.weNr}</TableCell>
                      <TableCell>
                        <div className="text-xs">{w.objektTitel}</div>
                        <div className="text-[10px] text-muted-foreground">{w.objektOrt}</div>
                      </TableCell>
                      <TableCell className="text-xs">{w.groesse} m²</TableCell>
                      <TableCell className="text-xs font-medium">{fmt(w.vkGesamt)}</TableCell>
                      <TableCell className="text-xs">{fmt(w.mieteGesamt)}/mtl.</TableCell>
                      <TableCell className="text-xs">{w.rendite.toFixed(2)}%</TableCell>
                      <TableCell>
                        <Badge variant={(w as any).vermietet !== false ? "default" : "destructive"} className="text-[10px]">
                          {(w as any).vermietet !== false ? "Vermietet" : "Leerstand"}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-xs">
                          {w.kundeName ? (
                            <div className="space-y-0.5">
                              <button className="font-medium text-primary hover:underline cursor-pointer" onClick={() => navigate(`/kunden/${w.kundeId}`)}>
                                {w.kundeName}
                              </button>
                              {w.beraterName && (
                                <p className="text-[10px] text-muted-foreground">VP: {w.beraterName}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">–</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        {days !== null && (
                          <Badge variant="outline" className={`text-[9px] ${days <= 2 ? "border-destructive/50 text-destructive" : "border-warning/50 text-warning"}`}>
                            {days <= 0 ? "Abgelaufen" : `${days} Tage`}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => navigate(zielRouteFuerObjekt(objekte.find((o) => o.id === w.objektId) ?? { id: w.objektId }))}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
