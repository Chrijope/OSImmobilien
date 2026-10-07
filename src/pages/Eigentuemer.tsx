import { useState, useEffect } from "react";
import { useCacheReady } from "@/hooks/useCacheReady";
import { CardListSkeleton } from "@/components/ui/table-skeleton";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { confirmDialog } from "@/lib/confirm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getEigentuemer, addEigentuemer, updateEigentuemer, deleteEigentuemer, EIGENTUEMER_TYPEN, type Eigentuemer } from "@/lib/eigentuemerStore";
import { Plus, Search, Mail, Phone, Trash2, Edit, Building2, Euro, ArrowRightFromLine } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PhoneInput } from "@/components/ui/phone-input";

export default function EigentuemerPage() {
  const cacheReady = useCacheReady(["eigentuemer"]);
  const navigate = useNavigate();
  const [eigentuemer, setEigentuemer] = useState<Eigentuemer[]>(getEigentuemer());
  const [search, setSearch] = useState("");

  useEffect(() => { if (cacheReady) setEigentuemer(getEigentuemer()); }, [cacheReady]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Eigentuemer>>({});

  const reload = () => setEigentuemer(getEigentuemer());

  const filtered = eigentuemer.filter(e => `${e.name} ${e.email} ${e.ort}`.toLowerCase().includes(search.toLowerCase()));

  const openNew = () => {
    setEditId(null);
    setForm({ name: "", typ: "privatperson", anrede: "Herr", email: "", telefon: "", strasse: "", plz: "", ort: "", steuernummer: "", bankIban: "", bankBic: "", verwaltervertragBeginn: "", verwaltervertragEnde: "", verwalterhonorar: 0, kuendigungsfrist: "3 Monate", objektIds: [], objektNamen: [], wirtschaftsplanJahr: new Date().getFullYear(), wirtschaftsplanBetrag: 0, instandhaltungsruecklage: 0, ruecklageSollMonatlich: 0, notizen: "" });
    setDialogOpen(true);
  };

  const openEdit = (e: Eigentuemer) => {
    setEditId(e.id);
    setForm({ ...e });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name) { toast({ title: "Bitte Name eingeben" }); return; }
    if (editId) {
      updateEigentuemer(editId, form);
      toast({ title: "Eigentümer aktualisiert" });
    } else {
      addEigentuemer(form as Omit<Eigentuemer, "id" | "erstelltAm">);
      toast({ title: "Eigentümer angelegt" });
    }
    setDialogOpen(false);
    reload();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Eigentümer wirklich löschen?",
      description: "Der Eigentümer samt hinterlegten Angaben wird entfernt.",
      confirmText: "Löschen",
      cancelText: "Behalten",
      variant: "destructive",
    });
    if (!ok) return;
    deleteEigentuemer(id);
    reload();
    toast({ title: "Eigentümer gelöscht" });
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <PageHeader title="Eigentümer" subtitle={`${eigentuemer.length} Eigentümer verwaltet`} />
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Eigentümer anlegen</Button>
      </div>

      <div className="relative max-w-sm mt-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Suchen..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid gap-4 mt-6">
        {filtered.map(e => (
          <Card key={e.id} className="hover:shadow-md transition-shadow">
            <CardContent className="py-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                   <Building2 className="h-4 w-4 text-primary" />
                   <p className="font-semibold">{e.name}</p>
                   <Badge variant="outline" className="text-[10px]">{EIGENTUEMER_TYPEN.find(t => t.value === e.typ)?.label}</Badge>
                   {e.herkunftVertrieb && (
                     <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-200">
                       <ArrowRightFromLine className="h-3 w-3 mr-1" />
                       Aus Vertrieb übernommen
                     </Badge>
                   )}
                 </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  {e.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{e.email}</span>}
                  {e.telefon && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{e.telefon}</span>}
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  <span>Objekte: {e.objektNamen.join(", ") || "–"}</span>
                  <span className="flex items-center gap-1"><Euro className="h-3 w-3" />Honorar: {e.verwalterhonorar.toLocaleString("de-DE")} €/Monat</span>
                  <span>Rücklage: {e.instandhaltungsruecklage.toLocaleString("de-DE")} €</span>
                   <span>Vertrag bis: {e.verwaltervertragEnde ? new Date(e.verwaltervertragEnde).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "Unbefristet"}</span>
                   {e.herkunftNotarDatum && <span>Notartermin: {e.herkunftNotarDatum}</span>}
                 </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" aria-label="Bearbeiten" onClick={() => openEdit(e)}><Edit className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Löschen" onClick={() => handleDelete(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-12">Keine Eigentümer gefunden</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Eigentümer bearbeiten" : "Neuen Eigentümer anlegen"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="col-span-2"><Label>Name / Firma *</Label><Input value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Typ</Label>
              <Select value={form.typ || "privatperson"} onValueChange={v => setForm(f => ({ ...f, typ: v as Eigentuemer["typ"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EIGENTUEMER_TYPEN.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>E-Mail</Label><Input value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>Telefon</Label><PhoneInput value={form.telefon || ""} onChange={v => setForm(f => ({ ...f, telefon: v }))} /></div>
            <div><Label>Straße</Label><Input value={form.strasse || ""} onChange={e => setForm(f => ({ ...f, strasse: e.target.value }))} /></div>
            <div><Label>PLZ</Label><Input value={form.plz || ""} onChange={e => setForm(f => ({ ...f, plz: e.target.value }))} /></div>
            <div><Label>Ort</Label><Input value={form.ort || ""} onChange={e => setForm(f => ({ ...f, ort: e.target.value }))} /></div>
            <div><Label>IBAN</Label><Input value={form.bankIban || ""} onChange={e => setForm(f => ({ ...f, bankIban: e.target.value }))} /></div>
            <div><Label>Steuernummer</Label><Input value={form.steuernummer || ""} onChange={e => setForm(f => ({ ...f, steuernummer: e.target.value }))} /></div>
            <div className="col-span-2 border-t pt-4 mt-2"><p className="text-sm font-semibold">Verwaltervertrag</p></div>
            <div><Label>Vertragsbeginn</Label><DateInput value={form.verwaltervertragBeginn || ""} onChange={v => setForm(f => ({ ...f, verwaltervertragBeginn: v }))} /></div>
            <div><Label>Vertragsende</Label><DateInput value={form.verwaltervertragEnde || ""} onChange={v => setForm(f => ({ ...f, verwaltervertragEnde: v }))} /></div>
            <div><Label>Honorar (€/Monat)</Label><Input type="number" value={form.verwalterhonorar || 0} onChange={e => setForm(f => ({ ...f, verwalterhonorar: +e.target.value }))} /></div>
            <div><Label>Kündigungsfrist</Label><Input value={form.kuendigungsfrist || ""} onChange={e => setForm(f => ({ ...f, kuendigungsfrist: e.target.value }))} /></div>
            <div className="col-span-2 border-t pt-4 mt-2"><p className="text-sm font-semibold">Wirtschaftsplan & Rücklage</p></div>
            <div><Label>Wirtschaftsplan-Betrag (€/Jahr)</Label><Input type="number" value={form.wirtschaftsplanBetrag || 0} onChange={e => setForm(f => ({ ...f, wirtschaftsplanBetrag: +e.target.value }))} /></div>
            <div><Label>Instandhaltungsrücklage (€)</Label><Input type="number" value={form.instandhaltungsruecklage || 0} onChange={e => setForm(f => ({ ...f, instandhaltungsruecklage: +e.target.value }))} /></div>
            <div><Label>Rücklage Soll (€/Monat)</Label><Input type="number" value={form.ruecklageSollMonatlich || 0} onChange={e => setForm(f => ({ ...f, ruecklageSollMonatlich: +e.target.value }))} /></div>
            <div className="col-span-2"><Label>Notizen</Label><Textarea value={form.notizen || ""} onChange={e => setForm(f => ({ ...f, notizen: e.target.value }))} rows={2} /></div>
          </div>
          <div className="flex justify-end mt-4"><Button onClick={handleSave}>{editId ? "Speichern" : "Anlegen"}</Button></div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
