import { useState, useEffect } from "react";
import { useCacheReady } from "@/hooks/useCacheReady";
import { CardListSkeleton } from "@/components/ui/table-skeleton";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { confirmDialog } from "@/lib/confirm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getDienstleister, addDienstleister, updateDienstleister, deleteDienstleister, Dienstleister, DIENSTLEISTER_TYPEN, DienstleisterTyp } from "@/lib/dienstleisterStore";
import { Plus, Search, Phone, Mail, Trash2, Edit, Building2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PhoneInput } from "@/components/ui/phone-input";

const DienstleisterPage = () => {
  const cacheReady = useCacheReady(["dienstleister"]);
  const navigate = useNavigate();
  const [dls, setDls] = useState<Dienstleister[]>(getDienstleister());
  const [search, setSearch] = useState("");

  useEffect(() => { if (cacheReady) setDls(getDienstleister()); }, [cacheReady]);
  const [filterTyp, setFilterTyp] = useState<string>("alle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ firma: "", ansprechpartner: "", email: "", telefon: "", typ: "hausmeister" as DienstleisterTyp, objektIds: [] as string[], vertragBeginn: "", vertragEnde: "", kuendigungsfrist: "", kostenMonatlich: 0, notizen: "" });

  const reload = () => setDls(getDienstleister());

  const filtered = dls.filter(d => {
    const matchSearch = `${d.firma} ${d.ansprechpartner}`.toLowerCase().includes(search.toLowerCase());
    const matchTyp = filterTyp === "alle" || d.typ === filterTyp;
    return matchSearch && matchTyp;
  });

  const openNew = () => {
    setEditId(null);
    setForm({ firma: "", ansprechpartner: "", email: "", telefon: "", typ: "hausmeister", objektIds: [], vertragBeginn: "", vertragEnde: "", kuendigungsfrist: "", kostenMonatlich: 0, notizen: "" });
    setDialogOpen(true);
  };

  const openEdit = (d: Dienstleister) => {
    setEditId(d.id);
    setForm({ firma: d.firma, ansprechpartner: d.ansprechpartner, email: d.email, telefon: d.telefon, typ: d.typ, objektIds: d.objektIds, vertragBeginn: d.vertragBeginn, vertragEnde: d.vertragEnde, kuendigungsfrist: d.kuendigungsfrist, kostenMonatlich: d.kostenMonatlich, notizen: d.notizen });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.firma) { toast({ title: "Bitte Firma eingeben" }); return; }
    if (editId) {
      updateDienstleister(editId, form);
      toast({ title: "Dienstleister aktualisiert" });
    } else {
      addDienstleister({ ...form, dokumente: [] });
      toast({ title: "Dienstleister angelegt" });
    }
    setDialogOpen(false);
    reload();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Dienstleister wirklich löschen?",
      description: "Der Dienstleister samt hinterlegten Angaben wird entfernt.",
      confirmText: "Löschen",
      cancelText: "Behalten",
      variant: "destructive",
    });
    if (!ok) return;
    deleteDienstleister(id);
    toast({ title: "Dienstleister gelöscht" });
    reload();
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <PageHeader title="Dienstleister" subtitle={`${dls.length} externe Partner`} />
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Dienstleister anlegen</Button>
      </div>

      <div className="flex gap-3 mt-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Dienstleister suchen..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterTyp} onValueChange={setFilterTyp}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Typen</SelectItem>
            {DIENSTLEISTER_TYPEN.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 mt-6">
        {filtered.map(d => (
          <Card key={d.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/dienstleister/${d.id}`)}>
            <CardContent className="py-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{d.firma}</p>
                  <Badge variant="outline" className="text-[10px]">{DIENSTLEISTER_TYPEN.find(t => t.value === d.typ)?.label || d.typ}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{d.ansprechpartner}</p>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  {d.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{d.email}</span>}
                  {d.telefon && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{d.telefon}</span>}
                  <span>{d.kostenMonatlich.toLocaleString("de-DE")} €/Monat</span>
                  {d.objektIds.length > 0 && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{d.objektIds.length} Objekt(e)</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="Bearbeiten" onClick={(e) => { e.stopPropagation(); openEdit(d); }}><Edit className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Löschen" onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-12">Keine Dienstleister gefunden</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Dienstleister bearbeiten" : "Neuen Dienstleister anlegen"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div><Label>Firma *</Label><Input value={form.firma} onChange={e => setForm(f => ({ ...f, firma: e.target.value }))} /></div>
            <div><Label>Ansprechpartner</Label><Input value={form.ansprechpartner} onChange={e => setForm(f => ({ ...f, ansprechpartner: e.target.value }))} /></div>
            <div><Label>E-Mail</Label><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>Telefon</Label><PhoneInput value={form.telefon} onChange={v => setForm(f => ({ ...f, telefon: v }))} /></div>
            <div>
              <Label>Typ</Label>
              <Select value={form.typ} onValueChange={v => setForm(f => ({ ...f, typ: v as DienstleisterTyp }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIENSTLEISTER_TYPEN.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Kosten/Monat (€)</Label><Input type="number" value={form.kostenMonatlich} onChange={e => setForm(f => ({ ...f, kostenMonatlich: +e.target.value }))} /></div>
            <div><Label>Vertragsbeginn</Label><DateInput value={form.vertragBeginn} onChange={v => setForm(f => ({ ...f, vertragBeginn: v }))} /></div>
            <div><Label>Vertragsende</Label><DateInput value={form.vertragEnde} onChange={v => setForm(f => ({ ...f, vertragEnde: v }))} /></div>
            <div className="col-span-2"><Label>Kündigungsfrist</Label><Input value={form.kuendigungsfrist} onChange={e => setForm(f => ({ ...f, kuendigungsfrist: e.target.value }))} placeholder="z.B. 3 Monate" /></div>
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={handleSave}>{editId ? "Speichern" : "Anlegen"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default DienstleisterPage;
