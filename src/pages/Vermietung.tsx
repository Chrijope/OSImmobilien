import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getVermietungen, updateVermietung, VERMIETUNG_STUFEN, VermietungPipeline, VermietungStufe } from "@/lib/vermietungStore";
import { ChevronRight, ExternalLink, Users, Calendar, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const VermietungPage = () => {
  const navigate = useNavigate();
  const [vermietungen, setVermietungen] = useState<VermietungPipeline[]>(getVermietungen());
  const [filterStufe, setFilterStufe] = useState<string>("alle");

  const reload = () => setVermietungen(getVermietungen());

  const handleStufeChange = (id: string, neueStufe: VermietungStufe) => {
    updateVermietung(id, { stufe: neueStufe });
    toast({ title: `Status auf "${VERMIETUNG_STUFEN.find(s => s.value === neueStufe)?.label}" geändert` });
    reload();
  };

  const filtered = filterStufe === "alle" ? vermietungen : vermietungen.filter(v => v.stufe === filterStufe);

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <PageHeader title="Vermietung" subtitle={`${vermietungen.length} Einheiten in der Pipeline`} />
        <Button onClick={() => navigate("/vermietung/objekt-neu")}><Plus className="h-4 w-4 mr-2" /> Objekt anlegen</Button>
      </div>

      {/* Kanban-artige Übersicht */}
      <div className="flex gap-2 mt-6 overflow-x-auto pb-2">
        <Button variant={filterStufe === "alle" ? "default" : "outline"} size="sm" onClick={() => setFilterStufe("alle")}>
          Alle ({vermietungen.length})
        </Button>
        {VERMIETUNG_STUFEN.map(s => {
          const count = vermietungen.filter(v => v.stufe === s.value).length;
          return (
            <Button key={s.value} variant={filterStufe === s.value ? "default" : "outline"} size="sm" onClick={() => setFilterStufe(s.value)}>
              <span className="h-2 w-2 rounded-full mr-1.5" style={{ backgroundColor: s.color }} />
              {s.label} ({count})
            </Button>
          );
        })}
      </div>

      {/* Pipeline-Karten */}
      <div className="grid gap-4 mt-6">
        {filtered.map(v => {
          const stufeConfig = VERMIETUNG_STUFEN.find(s => s.value === v.stufe);
          const stufeIdx = VERMIETUNG_STUFEN.findIndex(s => s.value === v.stufe);
          const nextStufe = stufeIdx < VERMIETUNG_STUFEN.length - 1 ? VERMIETUNG_STUFEN[stufeIdx + 1] : null;

          return (
            <Card key={v.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{v.objektName} – {v.wohneinheitName}</p>
                      <Badge className="text-[10px]" style={{ backgroundColor: stufeConfig?.color, color: "white" }}>
                        {stufeConfig?.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Kaltmiete: {v.kaltmiete.toLocaleString("de-DE")} €</span>
                      {v.interessenten.length > 0 && (
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{v.interessenten.length} Interessent(en)</span>
                      )}
                      {v.uebergabeDatum && (
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Übergabe: {new Date(v.uebergabeDatum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                      )}
                      {v.inseratUrl && (
                        <a href={v.inseratUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                          <ExternalLink className="h-3 w-3" />Inserat
                        </a>
                      )}
                    </div>

                    {/* Interessenten */}
                    {v.interessenten.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Interessenten:</p>
                        {v.interessenten.map((int, i) => (
                          <div key={i} className="text-xs flex items-center gap-3 bg-muted/50 rounded px-2 py-1">
                            <span className="font-medium">{int.name}</span>
                            <span>{int.email}</span>
                            <span>{int.telefon}</span>
                            {int.besichtigungsDatum && <span>Besichtigung: {new Date(int.besichtigungsDatum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Fortschrittsbalken */}
                    <div className="flex items-center gap-1 mt-3">
                      {VERMIETUNG_STUFEN.map((s, i) => (
                        <div key={s.value} className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: i <= stufeIdx ? stufeConfig?.color : "hsl(var(--muted))" }} />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {nextStufe && (
                      <Button size="sm" variant="outline" onClick={() => handleStufeChange(v.id, nextStufe.value)}>
                        <ChevronRight className="h-4 w-4 mr-1" />{nextStufe.label}
                      </Button>
                    )}
                    <Select value={v.stufe} onValueChange={val => handleStufeChange(v.id, val as VermietungStufe)}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {VERMIETUNG_STUFEN.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-12">Keine Einheiten in dieser Stufe</p>}
      </div>
    </DashboardLayout>
  );
};

export default VermietungPage;
