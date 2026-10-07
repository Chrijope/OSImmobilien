import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { getKontakte } from "@/lib/kundenStore";
import { excludeStatsKontakte } from "@/lib/statsExclusion";
import { UserCheck, Phone, AlertTriangle, ArrowRight, Briefcase, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEffectivePipelineStufe, PIPELINE_STUFEN } from "@/lib/kontaktPipeline";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useUser } from "@/contexts/UserContext";
import { tarnName } from "@/lib/vorfuehrmodus";
import { kontaktBelongsToUser } from "@/lib/kontaktOwnership";
import { datumSortierwert } from "@/lib/datumsformate";

const NEUKUNDE_STUFEN = ["neuer_lead", "kontaktversuche", "follow_up", "erstgespraech_geplant", "erstgespraech", "beratungsgespraech", "bonitaetsunterlagen", "objektauswahl", "follow_up_objekt"];
const ABWICKLUNG_STUFEN = ["reservierung", "finanzierung", "notar"];
const BESTANDSKUNDE_STUFEN = ["faelligkeit", "abrechnung", "abgeschlossen"];


export function SetterMeineLeadsCard() {
  const navigate = useNavigate();
  const _cv = useLiveVersion(["kontakte"]);
  const { user, authUser } = useUser();

  const stats = useMemo(() => {
    const all = excludeStatsKontakte(getKontakte());
    // Nur Kontakte, die dem eingeloggten Nutzer als Vertriebspartner
    // (berater / zustaendig_id) zugewiesen sind. Archivierte raus.
    const touched = all.filter(k => {
      if (k.archiviert) return false;
      return kontaktBelongsToUser(k, { userName: user.name, userId: authUser?.id });
    });

    const now = new Date().toISOString();
    const inWartezeit = touched.filter(k => k.verstecktBis && k.verstecktBis > now);
    const verloren = touched.filter(k => getEffectivePipelineStufe(k) === "verloren");

    // Count by category
    const neukunden = touched.filter(k => {
      const stufe = getEffectivePipelineStufe(k);
      return NEUKUNDE_STUFEN.includes(stufe);
    }).length;
    const abwicklung = touched.filter(k => {
      const stufe = getEffectivePipelineStufe(k);
      return ABWICKLUNG_STUFEN.includes(stufe);
    }).length;
    const bestandskunden = touched.filter(k => {
      const stufe = getEffectivePipelineStufe(k);
      return BESTANDSKUNDE_STUFEN.includes(stufe);
    }).length;

    // Recent leads (last 5)
    const recent = [...touched]
      // Gemischte Datumsformate im Bestand: erst auf ISO bringen, dann
      // vergleichen. Sonst sortiert "07.08.2026" vor "2026-08-01".
      .sort((a, b) =>
        datumSortierwert(b.zugewiesenAm || b.erstellt_am).localeCompare(
          datumSortierwert(a.zugewiesenAm || a.erstellt_am),
        ))
      .slice(0, 5);

    return { total: touched.length, inWartezeit: inWartezeit.length, verloren: verloren.length, neukunden, abwicklung, bestandskunden, recent };
  }, [_cv, user.name, authUser?.id]);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>          <h3 className="font-bold">Meine Leads</h3>
        </div>
        <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate("/meine-leads")}>
          Alle anzeigen <ArrowRight className="h-3 w-3" />
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        <div className="rounded-lg border bg-muted/30 p-3 text-center">
          <UserCheck className="h-4 w-4 mx-auto text-primary mb-1" />
          <p className="text-xl font-bold">{stats.total}</p>
          <p className="text-[10px] text-muted-foreground">Gesamt</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-center">
          <Phone className="h-4 w-4 mx-auto text-amber-500 mb-1" />
          <p className="text-xl font-bold">{stats.neukunden}</p>
          <p className="text-[10px] text-muted-foreground">Neukunden</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-center">
          <Briefcase className="h-4 w-4 mx-auto text-blue-500 mb-1" />
          <p className="text-xl font-bold">{stats.abwicklung}</p>
          <p className="text-[10px] text-muted-foreground">Abwicklung</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-center">
          <Home className="h-4 w-4 mx-auto text-emerald-500 mb-1" />
          <p className="text-xl font-bold">{stats.bestandskunden}</p>
          <p className="text-[10px] text-muted-foreground">Bestandskunden</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-center">
          <AlertTriangle className="h-4 w-4 mx-auto text-destructive mb-1" />
          <p className="text-xl font-bold">{stats.verloren}</p>
          <p className="text-[10px] text-muted-foreground">Verloren</p>
        </div>
      </div>

      {stats.recent.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Zuletzt bearbeitet</p>
          <div className="space-y-2">
            {stats.recent.map(k => {
              const stufe = getEffectivePipelineStufe(k);
              const stufeLabel = PIPELINE_STUFEN.find(s => s.key === stufe)?.label || stufe;
              
              return (
                <div
                  key={k.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/kunden/${k.id}`)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Phone className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-sm font-medium truncate">{tarnName(`${k.vorname ?? ""} ${k.nachname ?? ""}`.trim())}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className="text-[9px] bg-primary/10 text-primary">{stufeLabel}</Badge>
                    {k.verstecktBis && k.verstecktBis > new Date().toISOString() && (
                      <Badge variant="outline" className="text-[9px] bg-orange-500/10 text-orange-600 border-orange-500/20">Wartezeit</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
