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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getVersicherungen, addVersicherung, updateVersicherung, deleteVersicherung, getSchadensmeldungen, addSchadenmeldung, updateSchadenmeldung, VERSICHERUNGS_TYPEN, type Versicherung, type Schadenmeldung } from "@/lib/versicherungStore";
import { Plus, Search, Shield, AlertTriangle, Trash2, Edit, Euro } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PhoneInput } from "@/components/ui/phone-input";

export default function VersicherungenPage() {
  const cacheReady = useCacheReady(["versicherungen"]);
  const [versicherungen, setVersicherungen] = useState<Versicherung[]>(getVersicherungen());
  const [schaeden, setSchaeden] = useState<Schadenmeldung[]>(getSchadensmeldungen());

  useEffect(() => { if (cacheReady) { setVersicherungen(getVersicherungen()); setSchaeden(getSchadensmeldungen()); } }, [cacheReady]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [schadenDialogOpen, setSchadenDialogOpen] = useState(false);
  const [form, setForm] = useState<Partial<Versicherung>>({});
  const [schadenForm, setSchadenForm] = useState<Partial<Schadenmeldung>>({});

  const reload = () => { setVersicherungen(getVersicherungen()); setSchaeden(getSchadensmeldungen()); };

  const filtered = versicherungen.filter(v => `${v.versicherer} ${v.objektName} ${v.policenNr}`.toLowerCase().includes(search.toLowerCase()));

  const gesamtPraemien = versicherungen.reduce((s, v) => s + v.praemieJaehrlich, 0);
  const offeneSchaeden = schaeden.filter(s => s.status !== "reguliert" && s.status !== "abgelehnt").length;

  const openNew = () => {
    setEditId(null);
    setForm({ typ: "gebaeudeversicherung", versicherer: "", policenNr: "", praemieJaehrlich: 0, vertragBeginn: "", vertragEnde: "", kuendigungsfrist: "3 Monate", deckungssumme: 0, selbstbeteiligung: 0, ansprechpartner: "", telefon: "", email: "", objektId: "", objektName: "", notizen: "" });
    setDialogOpen(true);
  };

  const openEdit = (v: Versicherung) => { setEditId(v.id); setForm({ ...v }); setDialogOpen(true); };

  const handleSave = () => {
    if (!form.versicherer) { toast({ title: "Bitte Versicherer eingeben" }); return; }
    if (editId) { updateVersicherung(editId, form); toast({ title: "Versicherung aktualisiert" }); }
    else { addVersicherung(form as Omit<Versicherung, "id" | "erstelltAm">); toast({ title: "Versicherung angelegt" }); }
    setDialogOpen(false); reload();
  };

  const openSchadenNew = (versId: string, objektId: string) => {
    setSchadenForm({ versicherungId: versId, objektId, schadenDatum: new Date().toISOString().split("T")[0], schadensNr: "", beschreibung: "", schadenshoehe: 0, regulierungsBetrag: 0, status: "gemeldet" });
    setSchadenDialogOpen(true);
  };

  const handleSchadenSave = () => {
    if (!schadenForm.beschreibung) { toast({ title: "Bitte Beschreibung eingeben" }); return; }
    addSchadenmeldung(schadenForm as Omit<Schadenmeldung, "id" | "erstelltAm">);
    toast({ title: "Schadensmeldung erstellt" });
    setSchadenDialogOpen(false); reload();
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <PageHeader title="Versicherungen" subtitle={`${versicherungen.length} Policen · ${gesamtPraemien.toLocaleString("de-DE")} € Jahresprämien`} />
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Versicherung anlegen</Button>
      </div>

      {offeneSchaeden > 0 && (
        <Card className="mt-4 border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900">
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <p className="font-semibold text-orange-700 dark:text-orange-400">{offeneSchaeden} offene Schadensmeldung(en)</p>
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-sm mt-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Suchen..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid gap-4 mt-6">
        {filtered.map(v => {
          const vSchaeden = schaeden.filter(s => s.versicherungId === v.id);
          return (
            <Card key={v.id}>
              <CardContent className="py-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <p className="font-semibold">{v.versicherer}</p>
                    <Badge variant="outline" className="text-[10px]">{VERSICHERUNGS_TYPEN.find(t => t.value === v.typ)?.label}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{v.policenNr}</Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span>📍 {v.objektName}</span>
                    <span><Euro className="h-3 w-3 inline" /> {v.praemieJaehrlich.toLocaleString("de-DE")} €/Jahr</span>
                    <span>Deckung: {v.deckungssumme.toLocaleString("de-DE")} €</span>
                    <span>SB: {v.selbstbeteiligung.toLocaleString("de-DE")} €</span>
                    <span>Bis: {v.vertragEnde ? new Date(v.vertragEnde).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–"}</span>
                    {vSchaeden.length > 0 && <Badge variant="destructive" className="text-[10px]">{vSchaeden.length} Schäden</Badge>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => openSchadenNew(v.id, v.objektId)}>Schaden melden</Button>
                  <Button variant="ghost" size="icon" aria-label="Bearbeiten" onClick={() => openEdit(v)}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Löschen" onClick={() => { deleteVersicherung(v.id); reload(); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Versicherung Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Versicherung bearbeiten" : "Neue Versicherung"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="col-span-2"><Label>Versicherer *</Label><Input value={form.versicherer || ""} onChange={e => setForm(f => ({ ...f, versicherer: e.target.value }))} /></div>
            <div><Label>Typ</Label>
              <Select value={form.typ || "gebaeudeversicherung"} onValueChange={v => setForm(f => ({ ...f, typ: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{VERSICHERUNGS_TYPEN.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Policen-Nr.</Label><Input value={form.policenNr || ""} onChange={e => setForm(f => ({ ...f, policenNr: e.target.value }))} /></div>
            <div><Label>Objekt</Label><Input value={form.objektName || ""} onChange={e => setForm(f => ({ ...f, objektName: e.target.value }))} /></div>
            <div><Label>Jahresprämie (€)</Label><Input type="number" value={form.praemieJaehrlich || 0} onChange={e => setForm(f => ({ ...f, praemieJaehrlich: +e.target.value }))} /></div>
            <div><Label>Deckungssumme (€)</Label><Input type="number" value={form.deckungssumme || 0} onChange={e => setForm(f => ({ ...f, deckungssumme: +e.target.value }))} /></div>
            <div><Label>Selbstbeteiligung (€)</Label><Input type="number" value={form.selbstbeteiligung || 0} onChange={e => setForm(f => ({ ...f, selbstbeteiligung: +e.target.value }))} /></div>
            <div><Label>Vertragsbeginn</Label><DateInput value={form.vertragBeginn || ""} onChange={v => setForm(f => ({ ...f, vertragBeginn: v }))} /></div>
            <div><Label>Vertragsende</Label><DateInput value={form.vertragEnde || ""} onChange={v => setForm(f => ({ ...f, vertragEnde: v }))} /></div>
            <div><Label>Kündigungsfrist</Label><Input value={form.kuendigungsfrist || ""} onChange={e => setForm(f => ({ ...f, kuendigungsfrist: e.target.value }))} /></div>
            <div><Label>Ansprechpartner</Label><Input value={form.ansprechpartner || ""} onChange={e => setForm(f => ({ ...f, ansprechpartner: e.target.value }))} /></div>
            <div><Label>Telefon</Label><PhoneInput value={form.telefon || ""} onChange={v => setForm(f => ({ ...f, telefon: v }))} /></div>
          </div>
          <div className="flex justify-end mt-4"><Button onClick={handleSave}>{editId ? "Speichern" : "Anlegen"}</Button></div>
        </DialogContent>
      </Dialog>

      {/* Schaden Dialog */}
      <Dialog open={schadenDialogOpen} onOpenChange={setSchadenDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schaden melden</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Schadendatum</Label><DateInput value={schadenForm.schadenDatum || ""} onChange={v => setSchadenForm(f => ({ ...f, schadenDatum: v }))} /></div>
            <div><Label>Beschreibung *</Label><Textarea value={schadenForm.beschreibung || ""} onChange={e => setSchadenForm(f => ({ ...f, beschreibung: e.target.value }))} rows={3} /></div>
            <div><Label>Geschätzte Schadenshöhe (€)</Label><Input type="number" value={schadenForm.schadenshoehe || 0} onChange={e => setSchadenForm(f => ({ ...f, schadenshoehe: +e.target.value }))} /></div>
          </div>
          <div className="flex justify-end mt-4"><Button onClick={handleSchadenSave}>Melden</Button></div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
