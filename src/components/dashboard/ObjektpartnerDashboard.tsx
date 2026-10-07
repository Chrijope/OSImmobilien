import { useMemo } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getObjekte, type ObjektData } from "@/lib/objekteStore";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Eye,
  EyeOff,
  Home,
  FileText,
  TrendingUp,
  Euro,
  SquareStack,
  ArrowRight,
  Plus,
} from "lucide-react";

function ObjektKpiCards({ objekte }: { objekte: ObjektData[] }) {
  const total = objekte.length;
  const sichtbar = objekte.filter((o) => o.sichtbar).length;
  const unsichtbar = total - sichtbar;
  const totalWohnungen = objekte.reduce((s, o) => s + (o.wohnungen?.length || 0), 0);
  const freieWohnungen = objekte.reduce(
    (s, o) => s + (o.wohnungen?.filter((w) => w.status === "frei").length || 0),
    0
  );
  const verkaufteWohnungen = objekte.reduce(
    (s, o) => s + (o.wohnungen?.filter((w) => w.status === "verkauft").length || 0),
    0
  );
  const gesamtVolumen = objekte.reduce(
    (s, o) => s + o.wohnungen.reduce((ws, w) => ws + (w.vkGesamt || 0), 0),
    0
  );
  const avgRendite =
    totalWohnungen > 0
      ? objekte.reduce(
          (s, o) => s + o.wohnungen.reduce((ws, w) => ws + (w.rendite || 0), 0),
          0
        ) / totalWohnungen
      : 0;

  const kpis = [
    { label: "Objekte gesamt", value: total, icon: Building2, color: "text-primary" },
    { label: "Sichtbar", value: sichtbar, icon: Eye, color: "text-[hsl(var(--success))]" },
    { label: "Unsichtbar", value: unsichtbar, icon: EyeOff, color: "text-muted-foreground" },
    { label: "Wohneinheiten", value: totalWohnungen, icon: Home, color: "text-primary" },
    { label: "Frei", value: freieWohnungen, icon: SquareStack, color: "text-[hsl(var(--warning))]" },
    { label: "Verkauft", value: verkaufteWohnungen, icon: SquareStack, color: "text-[hsl(var(--success))]" },
    {
      label: "Ø Rendite",
      value: `${avgRendite.toFixed(1)}%`,
      icon: TrendingUp,
      color: "text-primary",
    },
    {
      label: "Volumen",
      value: `${(gesamtVolumen / 1_000_000).toFixed(1)} Mio €`,
      icon: Euro,
      color: "text-[hsl(var(--success))]",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="hover:shadow-md transition-shadow">
          <CardContent className="pt-5 pb-4 text-center">
            <kpi.icon className={`h-5 w-5 mx-auto mb-1.5 ${kpi.color}`} />
            <p className="text-xl font-bold">{kpi.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ObjektUebersicht({ objekte }: { objekte: ObjektData[] }) {
  const navigate = useNavigate();

  if (objekte.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Noch keine Objekte angelegt.</p>
          <Button className="mt-4" onClick={() => navigate("/objekte/neu")}>
            <Plus className="h-4 w-4 mr-1" /> Erstes Objekt anlegen
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {objekte.map((obj) => {
        const totalWE = obj.wohnungen?.length || 0;
        const freiWE = obj.wohnungen?.filter((w) => w.status === "frei").length || 0;
        const verkauftWE = obj.wohnungen?.filter((w) => w.status === "verkauft").length || 0;
        const reserviertWE = obj.wohnungen?.filter((w) => w.status === "reserviert").length || 0;
        const doksGesamt = obj.dokumente?.length || 0;
        const doksHochgeladen = obj.dokumente?.filter((d) => d.url).length || 0;

        return (
          <Card
            key={obj.id}
            className="hover:shadow-md transition-all cursor-pointer group"
            onClick={() => navigate(`/objekte/${obj.id}`)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">{obj.titel}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {obj.adresse}, {obj.plz} {obj.ort}
                  </p>
                </div>
                <Badge
                  variant={obj.sichtbar ? "default" : "secondary"}
                  className="shrink-0 text-[10px]"
                >
                  {obj.sichtbar ? "Sichtbar" : "Unsichtbar"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {/* Wohneinheiten-Statistik */}
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <Home className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{totalWE} WE</span>
                </div>
                <span className="text-[hsl(var(--success))]">{verkauftWE} verkauft</span>
                {reserviertWE > 0 && (
                  <span className="text-[hsl(var(--warning))]">{reserviertWE} reserviert</span>
                )}
                <span className="text-muted-foreground">{freiWE} frei</span>
              </div>

              {/* Progress bar */}
              {totalWE > 0 && (
                <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                  <div
                    className="bg-[hsl(var(--success))] transition-all"
                    style={{ width: `${(verkauftWE / totalWE) * 100}%` }}
                  />
                  <div
                    className="bg-[hsl(var(--warning))] transition-all"
                    style={{ width: `${(reserviertWE / totalWE) * 100}%` }}
                  />
                </div>
              )}

              {/* Unterlagen-Status */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  <span>
                    {doksHochgeladen}/{doksGesamt} Unterlagen
                  </span>
                </div>
                {obj.renditeVon > 0 && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span>
                      {obj.renditeVon}–{obj.renditeBis}% Rendite
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <span className="text-xs font-medium text-primary group-hover:underline flex items-center gap-1">
                  Details <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function ObjektpartnerDashboard() {
  const navigate = useNavigate();
  // Objekte kommen in der zweiten Ladewelle; ohne die Version bliebe die
  // Liste leer, wenn das Dashboard vor ihrer Ankunft gerendert wurde.
  const objekteVersion = useLiveVersion(["objekte", "wohnungen"]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const objekte = useMemo(() => getObjekte(), [objekteVersion]);

  return (
    <div className="flex flex-col gap-6">
      {/* Quick Actions */}
      <div className="flex gap-3 flex-wrap">
        <Button onClick={() => navigate("/objekte/neu")}>
          <Plus className="h-4 w-4 mr-1" /> Neues Objekt
        </Button>
        <Button variant="outline" onClick={() => navigate("/objekte")}>
          <Building2 className="h-4 w-4 mr-1" /> Alle Objekte
        </Button>
      </div>

      {/* KPI Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">📊</span>
          <h2 className="text-lg font-semibold tracking-tight">
            Objekt-Übersicht
          </h2>
          <div className="flex-1 h-px bg-border ml-2" />
        </div>
        <ObjektKpiCards objekte={objekte} />
      </div>



      {/* Objekte Detail Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">🏢</span>
          <h2 className="text-lg font-semibold tracking-tight">
            Meine Objekte
          </h2>
          <div className="flex-1 h-px bg-border ml-2" />
        </div>
        <ObjektUebersicht objekte={objekte} />
      </div>
    </div>
  );
}
