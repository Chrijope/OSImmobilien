import { useState, useMemo } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Plus, Mail, Phone, FileText } from "lucide-react";
import { getKommunikation, addKommunikation, KOMM_TYPEN, RICHTUNG_LABELS, type KommunikationsEintrag } from "@/lib/kommunikationStore";
import { getMieter } from "@/lib/mieterStore";
import { toast } from "@/hooks/use-toast";

export default function HVKommunikation() {
  const liveVersion = useLiveVersion(["kommunikation"]);
  const komm = useMemo(() => getKommunikation(), [liveVersion]);
  const mieter = getMieter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    mieterId: "", typ: "email" as KommunikationsEintrag["typ"],
    richtung: "ausgehend" as KommunikationsEintrag["richtung"],
    betreff: "", inhalt: "", datum: new Date().toISOString().slice(0, 10), erstelltVon: "System",
  });

  const handleAdd = () => {
    if (!form.mieterId || !form.betreff) return;
    addKommunikation(form);
    setOpen(false);
    setForm({ mieterId: "", typ: "email", richtung: "ausgehend", betreff: "", inhalt: "", datum: new Date().toISOString().slice(0, 10), erstelltVon: "System" });
    toast({ title: "Kommunikation dokumentiert" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Mieter-Kommunikation" subtitle="Chronologische Korrespondenz mit Mietern – E-Mail, Telefon, Brief" />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Eintrag erfassen</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Kommunikation dokumentieren</DialogTitle></DialogHeader>
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
                  <Label>Typ</Label>
                  <Select value={form.typ} onValueChange={v => setForm(f => ({ ...f, typ: v as KommunikationsEintrag["typ"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{KOMM_TYPEN.map(t => <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Richtung</Label>
                  <Select value={form.richtung} onValueChange={v => setForm(f => ({ ...f, richtung: v as KommunikationsEintrag["richtung"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RICHTUNG_LABELS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Betreff</Label><Input value={form.betreff} onChange={e => setForm(f => ({ ...f, betreff: e.target.value }))} /></div>
              <div><Label>Inhalt</Label><Textarea value={form.inhalt} onChange={e => setForm(f => ({ ...f, inhalt: e.target.value }))} rows={4} /></div>
              <Button onClick={handleAdd} className="w-full">Erfassen</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" />Kommunikationsverlauf</CardTitle></CardHeader>
        <CardContent>
          {komm.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Noch keine Kommunikation dokumentiert.</p>
          ) : (
            <div className="space-y-3">
              {komm.slice(0, 30).map(k => {
                const typInfo = KOMM_TYPEN.find(t => t.value === k.typ);
                const m = mieter.find(mi => mi.id === k.mieterId);
                return (
                  <div key={k.id} className="flex items-start gap-3 border-b pb-3">
                    <span className="text-lg mt-0.5">{typInfo?.emoji || "📝"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{k.betreff}</p>
                        <Badge variant="outline" className="text-[10px] shrink-0">{k.richtung === "eingehend" ? "↙ Eingehend" : k.richtung === "ausgehend" ? "↗ Ausgehend" : "📌 Intern"}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{m ? `${m.vorname} ${m.nachname}` : k.mieterId} · {new Date(k.datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} · {typInfo?.label}</p>
                      {k.inhalt && <p className="text-sm mt-1 text-muted-foreground line-clamp-2">{k.inhalt}</p>}
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
