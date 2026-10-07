import { useState, useMemo } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, TrendingUp } from "lucide-react";
import { getZaehlerstaende, addZaehlerstand, ZAEHLER_TYPEN, ANLASS_LABELS, type Zaehlerstand } from "@/lib/zaehlerstandStore";
import { getMieter } from "@/lib/mieterStore";
import { toast } from "@/hooks/use-toast";

export default function ZaehlerstaendePage() {
  const liveVersion = useLiveVersion(["zaehlerstaende"]);
  const staende = useMemo(() => getZaehlerstaende(), [liveVersion]);
  const mieter = getMieter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    mieterId: "", objektId: "", wohneinheitId: "",
    typ: "strom" as Zaehlerstand["typ"], zaehlerNr: "", stand: "",
    ableseDatum: new Date().toISOString().slice(0, 10),
    abgelesenVon: "", anlass: "regulaer" as Zaehlerstand["anlass"], notiz: "",
  });

  const handleAdd = () => {
    if (!form.mieterId || !form.stand) return;
    const m = mieter.find(mi => mi.id === form.mieterId);
    addZaehlerstand({
      mieterId: form.mieterId, objektId: m?.objektId || form.objektId, wohneinheitId: m?.wohneinheitId || form.wohneinheitId,
      typ: form.typ, zaehlerNr: form.zaehlerNr, stand: Number(form.stand),
      ableseDatum: form.ableseDatum, abgelesenVon: form.abgelesenVon || "System",
      anlass: form.anlass, notiz: form.notiz,
    });
    // Data auto-refreshes via useLiveVersion
    setOpen(false);
    toast({ title: "Zählerstand erfasst" });
  };

  const grouped = staende.reduce((acc, s) => { acc[s.typ] = (acc[s.typ] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Zählerstände" subtitle="Strom, Wasser, Heizung & Gas – alle Ablesungen im Überblick" />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Ablesung erfassen</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Neue Ablesung erfassen</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Mieter</Label>
                <Select value={form.mieterId} onValueChange={v => setForm(f => ({ ...f, mieterId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Mieter wählen" /></SelectTrigger>
                  <SelectContent>{mieter.map(m => <SelectItem key={m.id} value={m.id}>{m.vorname} {m.nachname}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Zählertyp</Label>
                  <Select value={form.typ} onValueChange={v => setForm(f => ({ ...f, typ: v as Zaehlerstand["typ"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ZAEHLER_TYPEN.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Anlass</Label>
                  <Select value={form.anlass} onValueChange={v => setForm(f => ({ ...f, anlass: v as Zaehlerstand["anlass"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ANLASS_LABELS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Zählerstand</Label><Input type="number" value={form.stand} onChange={e => setForm(f => ({ ...f, stand: e.target.value }))} placeholder="z.B. 12345" /></div>
                <div><Label>Zählernummer</Label><Input value={form.zaehlerNr} onChange={e => setForm(f => ({ ...f, zaehlerNr: e.target.value }))} /></div>
              </div>
              <div><Label>Ablesedatum</Label><DateInput value={form.ableseDatum} onChange={v => setForm(f => ({ ...f, ableseDatum: v }))} /></div>
              <Button onClick={handleAdd} className="w-full">Erfassen</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {ZAEHLER_TYPEN.map(t => (
          <Card key={t.value}>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold">{grouped[t.value] || 0}</p>
              <p className="text-sm text-muted-foreground">{t.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />Letzte Ablesungen</CardTitle></CardHeader>
        <CardContent>
          {staende.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Noch keine Ablesungen erfasst.</p>
          ) : (
            <div className="space-y-3">
              {staende.slice(0, 20).map(s => {
                const m = mieter.find(mi => mi.id === s.mieterId);
                const t = ZAEHLER_TYPEN.find(z => z.value === s.typ);
                return (
                  <div key={s.id} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <p className="font-medium">{m ? `${m.vorname} ${m.nachname}` : s.mieterId}</p>
                      <p className="text-xs text-muted-foreground">{new Date(s.ableseDatum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} · Nr. {s.zaehlerNr} · {t?.label}</p>
                    </div>
                    <Badge variant="outline">{s.stand.toLocaleString("de-DE")} {t?.einheit}</Badge>
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
