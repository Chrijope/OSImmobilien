import { useState, useEffect } from "react";
import { useCacheReady } from "@/hooks/useCacheReady";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getAlleFristen, addCustomFrist, updateCustomFrist, deleteCustomFrist, type Frist } from "@/lib/fristenStore";
import { AlertTriangle, Clock, CheckCircle, Plus, Trash2, Calendar, Shield } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const prioritaetConfig: Record<string, { label: string; color: string; icon: typeof AlertTriangle }> = {
  kritisch: { label: "Kritisch", color: "text-red-600", icon: AlertTriangle },
  hoch: { label: "Hoch", color: "text-orange-500", icon: Clock },
  mittel: { label: "Mittel", color: "text-yellow-600", icon: Calendar },
  niedrig: { label: "Niedrig", color: "text-muted-foreground", icon: CheckCircle },
};

const typLabels: Record<string, string> = {
  mietvertrag: "Mietvertrag", kuendigung: "Kündigung", dienstleister: "Dienstleister",
  versicherung: "Versicherung", verwaltervertrag: "Verwaltervertrag", bka: "BKA-Frist",
  tuev: "TÜV-Prüfung", rauchmelder: "Rauchmelder", legionellen: "Legionellenprüfung",
};

export default function Fristenueberwachung() {
  const cacheReady = useCacheReady(["fristen"]);
  const [fristen, setFristen] = useState<Frist[]>(getAlleFristen());

  useEffect(() => { if (cacheReady) setFristen(getAlleFristen()); }, [cacheReady]);
  const [filter, setFilter] = useState("alle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ typ: "tuev" as Frist["typ"], titel: "", beschreibung: "", faelligAm: "", bezugObjekt: "", bezugPerson: "", prioritaet: "mittel" as Frist["prioritaet"] });

  const reload = () => setFristen(getAlleFristen());

  const filtered = filter === "alle" ? fristen : fristen.filter(f => f.prioritaet === filter);

  const kritisch = fristen.filter(f => f.prioritaet === "kritisch").length;
  const hoch = fristen.filter(f => f.prioritaet === "hoch").length;

  const handleAdd = () => {
    if (!form.titel || !form.faelligAm) { toast({ title: "Bitte Titel und Datum eingeben" }); return; }
    addCustomFrist({ ...form, erledigt: false });
    setDialogOpen(false);
    reload();
    toast({ title: "Frist hinzugefügt" });
  };

  const handleErledigt = (id: string) => {
    updateCustomFrist(id, { erledigt: true });
    reload();
    toast({ title: "Frist als erledigt markiert" });
  };

  const handleDelete = (id: string) => {
    deleteCustomFrist(id);
    reload();
    toast({ title: "Frist gelöscht" });
  };

  const daysUntil = (d: string) => {
    const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
    if (days < 0) return `${Math.abs(days)} Tage überfällig`;
    if (days === 0) return "Heute fällig";
    return `${days} Tage`;
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <PageHeader title="Fristenüberwachung" subtitle={`${fristen.length} aktive Fristen`} />
        <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> Frist hinzufügen</Button>
      </div>

      {(kritisch > 0 || hoch > 0) && (
        <Card className="mt-4 border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <p className="font-semibold text-red-700 dark:text-red-400">
                {kritisch > 0 && `${kritisch} kritische`}{kritisch > 0 && hoch > 0 && " und "}{hoch > 0 && `${hoch} hohe`} Frist(en)
              </p>
              <p className="text-xs text-muted-foreground">Sofortige Bearbeitung erforderlich</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 mt-6 flex-wrap">
        {["alle", "kritisch", "hoch", "mittel", "niedrig"].map(f => (
          <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
            {f === "alle" ? `Alle (${fristen.length})` : `${prioritaetConfig[f]?.label} (${fristen.filter(fr => fr.prioritaet === f).length})`}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 mt-6">
        {filtered.map(f => {
          const cfg = prioritaetConfig[f.prioritaet];
          const Icon = cfg?.icon || Clock;
          const days = Math.ceil((new Date(f.faelligAm).getTime() - Date.now()) / 86400000);
          const isOverdue = days < 0;
          const isCustom = f.id.startsWith("frist-tuev") || f.id.startsWith("frist-rm") || f.id.startsWith("frist-leg") || f.id.startsWith("frist-bka") || f.id.startsWith("frist-");
          return (
            <Card key={f.id} className={`${isOverdue ? "border-red-300 dark:border-red-800" : ""}`}>
              <CardContent className="py-3 flex items-center gap-4">
                <Icon className={`h-5 w-5 shrink-0 ${cfg?.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{f.titel}</p>
                    <Badge variant="outline" className="text-[10px]">{typLabels[f.typ] || f.typ}</Badge>
                    <Badge variant={isOverdue ? "destructive" : f.prioritaet === "kritisch" ? "destructive" : "secondary"} className="text-[10px]">
                      {daysUntil(f.faelligAm)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.beschreibung}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                    {f.bezugObjekt && <span>📍 {f.bezugObjekt}</span>}
                    {f.bezugPerson && <span>👤 {f.bezugPerson}</span>}
                    <span>📅 {new Date(f.faelligAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  {isCustom && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleErledigt(f.id)}>
                        <CheckCircle className="h-3 w-3 mr-1" /> Erledigt
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => handleDelete(f.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-12">Keine Fristen gefunden</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neue Frist hinzufügen</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Titel *</Label><Input value={form.titel} onChange={e => setForm(f => ({ ...f, titel: e.target.value }))} /></div>
            <div><Label>Fällig am *</Label><DateInput value={form.faelligAm} onChange={v => setForm(f => ({ ...f, faelligAm: v }))} /></div>
            <div><Label>Typ</Label>
              <Select value={form.typ} onValueChange={v => setForm(f => ({ ...f, typ: v as Frist["typ"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(typLabels).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Priorität</Label>
              <Select value={form.prioritaet} onValueChange={v => setForm(f => ({ ...f, prioritaet: v as Frist["prioritaet"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kritisch">Kritisch</SelectItem>
                  <SelectItem value="hoch">Hoch</SelectItem>
                  <SelectItem value="mittel">Mittel</SelectItem>
                  <SelectItem value="niedrig">Niedrig</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Objekt</Label><Input value={form.bezugObjekt} onChange={e => setForm(f => ({ ...f, bezugObjekt: e.target.value }))} /></div>
            <div><Label>Beschreibung</Label><Textarea value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} rows={2} /></div>
          </div>
          <div className="flex justify-end mt-4"><Button onClick={handleAdd}>Hinzufügen</Button></div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
