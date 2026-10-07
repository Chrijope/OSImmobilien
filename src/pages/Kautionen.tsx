import { useState, useMemo } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, Plus, AlertTriangle, CheckCircle } from "lucide-react";
import { getKautionen, createKaution, type KautionEintrag } from "@/lib/kautionStore";
import { getMieter } from "@/lib/mieterStore";
import { toast } from "@/hooks/use-toast";

export default function Kautionen() {
  const liveVersion = useLiveVersion(["kautionen"]);
  const kautionen = useMemo(() => getKautionen(), [liveVersion]);
  const mieter = getMieter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ mieterId: "", betrag: "", mietbeginn: "" });

  const handleAdd = () => {
    if (!form.mieterId || !form.betrag) return;
    createKaution(form.mieterId, Number(form.betrag), form.mietbeginn || new Date().toISOString().slice(0, 10));
    setOpen(false);
    setForm({ mieterId: "", betrag: "", mietbeginn: "" });
    toast({ title: "Kaution erfasst" });
  };

  const statusLabels: Record<KautionEintrag["status"], string> = {
    offen: "Offen", vollstaendig: "Vollständig", teilweise: "Teilweise", rueckzahlung: "Rückzahlung", abgeschlossen: "Abgeschlossen",
  };
  const statusColor: Record<KautionEintrag["status"], string> = {
    offen: "bg-yellow-100 text-yellow-800", vollstaendig: "bg-green-100 text-green-800",
    teilweise: "bg-orange-100 text-orange-800", rueckzahlung: "bg-blue-100 text-blue-800", abgeschlossen: "bg-muted text-muted-foreground",
  };

  const totalBetrag = kautionen.reduce((s, k) => s + k.betrag, 0);
  const offene = kautionen.filter(k => k.status === "offen" || k.status === "teilweise").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Kautionsverwaltung" subtitle="Kautionen nach §551 BGB – Eingang, Zinsen & Rückzahlung" />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Kaution erfassen</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Neue Kaution</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Mieter</Label>
                <Select value={form.mieterId} onValueChange={v => setForm(f => ({ ...f, mieterId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Mieter wählen" /></SelectTrigger>
                  <SelectContent>{mieter.map(m => <SelectItem key={m.id} value={m.id}>{m.vorname} {m.nachname}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Kautionsbetrag (€)</Label><Input type="number" value={form.betrag} onChange={e => setForm(f => ({ ...f, betrag: e.target.value }))} /></div>
              <div><Label>Mietbeginn</Label><DateInput value={form.mietbeginn} onChange={v => setForm(f => ({ ...f, mietbeginn: v }))} /></div>
              <Button onClick={handleAdd} className="w-full">Erfassen</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6 text-center"><Banknote className="h-8 w-8 mx-auto mb-2 text-primary" /><p className="text-2xl font-bold">{totalBetrag.toLocaleString("de-DE")} €</p><p className="text-sm text-muted-foreground">Kautionen gesamt</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" /><p className="text-2xl font-bold">{kautionen.filter(k => k.status === "vollstaendig").length}</p><p className="text-sm text-muted-foreground">Vollständig</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" /><p className="text-2xl font-bold">{offene}</p><p className="text-sm text-muted-foreground">Offen / Teilweise</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Alle Kautionen</CardTitle></CardHeader>
        <CardContent>
          {kautionen.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Noch keine Kautionen erfasst.</p>
          ) : (
            <div className="space-y-3">
              {kautionen.map(k => {
                const m = mieter.find(mi => mi.id === k.mieterId);
                return (
                  <div key={k.id} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <p className="font-medium">{m ? `${m.vorname} ${m.nachname}` : k.mieterId}</p>
                      <p className="text-xs text-muted-foreground">Eingezahlt: {k.eingezahltAm ? new Date(k.eingezahltAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–"} · Zinssatz: {k.zinssatz}%</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{k.betrag.toLocaleString("de-DE")} €</span>
                      <Badge className={statusColor[k.status]}>{statusLabels[k.status]}</Badge>
                    </div>
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
