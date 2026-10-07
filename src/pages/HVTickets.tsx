import { useState, useEffect } from "react";
import { useCacheReady } from "@/hooks/useCacheReady";
import { CardListSkeleton } from "@/components/ui/table-skeleton";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getHvTickets, addHvTicket, updateHvTicket, deleteHvTicket, HvTicket, HV_KATEGORIEN, HV_PRIORITAETEN, HvTicketKategorie, HvTicketPrioritaet, HvTicketStatus } from "@/lib/hvTicketStore";
import { getDienstleister } from "@/lib/dienstleisterStore";
import { Plus, Search, AlertTriangle, Clock, CheckCircle, Wrench } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const statusConfig: Record<HvTicketStatus, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  neu: { label: "Neu", icon: AlertTriangle, variant: "destructive" },
  in_bearbeitung: { label: "In Bearbeitung", icon: Clock, variant: "default" },
  beauftragt: { label: "Beauftragt", icon: Wrench, variant: "outline" },
  erledigt: { label: "Erledigt", icon: CheckCircle, variant: "secondary" },
};

const HVTicketsPage = () => {
  const cacheReady = useCacheReady(["hv_tickets"]);
  const [tickets, setTickets] = useState<HvTicket[]>(getHvTickets());
  const [search, setSearch] = useState("");

  useEffect(() => { if (cacheReady) setTickets(getHvTickets()); }, [cacheReady]);
  const [filterStatus, setFilterStatus] = useState<string>("offen");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const dienstleister = getDienstleister();

  const [form, setForm] = useState({
    objektId: "", objektName: "", wohneinheitId: "", wohneinheitName: "",
    mieterId: "", mieterName: "", kategorie: "schaden" as HvTicketKategorie,
    prioritaet: "mittel" as HvTicketPrioritaet, titel: "", beschreibung: "",
    zugewiesenerDienstleisterId: "", zugewiesenerDienstleisterName: "",
    status: "neu" as HvTicketStatus,
  });

  const reload = () => setTickets(getHvTickets());

  const filtered = tickets.filter(t => {
    const matchSearch = `${t.titel} ${t.objektName} ${t.mieterName}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "alle" ? true : filterStatus === "offen" ? t.status !== "erledigt" : t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const openNew = () => {
    setEditId(null);
    setForm({ objektId: "", objektName: "", wohneinheitId: "", wohneinheitName: "", mieterId: "", mieterName: "", kategorie: "schaden", prioritaet: "mittel", titel: "", beschreibung: "", zugewiesenerDienstleisterId: "", zugewiesenerDienstleisterName: "", status: "neu" });
    setDialogOpen(true);
  };

  const openEdit = (t: HvTicket) => {
    setEditId(t.id);
    setForm({ objektId: t.objektId, objektName: t.objektName, wohneinheitId: t.wohneinheitId, wohneinheitName: t.wohneinheitName, mieterId: t.mieterId, mieterName: t.mieterName, kategorie: t.kategorie, prioritaet: t.prioritaet, titel: t.titel, beschreibung: t.beschreibung, zugewiesenerDienstleisterId: t.zugewiesenerDienstleisterId, zugewiesenerDienstleisterName: t.zugewiesenerDienstleisterName, status: t.status });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.titel) { toast({ title: "Bitte Titel eingeben" }); return; }
    if (editId) {
      updateHvTicket(editId, form);
      toast({ title: "Ticket aktualisiert" });
    } else {
      addHvTicket(form);
      toast({ title: "Ticket erstellt" });
    }
    setDialogOpen(false);
    reload();
  };

  const handleStatusChange = (id: string, status: HvTicketStatus) => {
    updateHvTicket(id, { status });
    toast({ title: `Status auf "${statusConfig[status].label}" geändert` });
    reload();
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <PageHeader title="HV-Tickets" subtitle={`${tickets.filter(t => t.status !== "erledigt").length} offene Tickets`} />
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Neues Ticket</Button>
      </div>

      <div className="flex gap-3 mt-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Tickets suchen..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="offen">Offene</SelectItem>
            <SelectItem value="alle">Alle</SelectItem>
            <SelectItem value="neu">Neu</SelectItem>
            <SelectItem value="in_bearbeitung">In Bearbeitung</SelectItem>
            <SelectItem value="beauftragt">Beauftragt</SelectItem>
            <SelectItem value="erledigt">Erledigt</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 mt-6">
        {filtered.map(t => {
          const sc = statusConfig[t.status];
          const Icon = sc.icon;
          return (
            <Card key={t.id} className={`hover:shadow-md transition-shadow ${t.prioritaet === "dringend" ? "border-red-300 dark:border-red-800" : ""}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${t.prioritaet === "dringend" ? "text-red-500" : "text-muted-foreground"}`} />
                      <p className="font-semibold text-sm">{t.titel}</p>
                      <Badge variant={sc.variant} className="text-[10px]">{sc.label}</Badge>
                      <Badge variant={t.prioritaet === "dringend" ? "destructive" : "outline"} className="text-[10px]">{t.prioritaet}</Badge>
                      <Badge variant="outline" className="text-[10px]">{HV_KATEGORIEN.find(k => k.value === t.kategorie)?.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{t.beschreibung}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{t.objektName} · {t.wohneinheitName}</span>
                      {t.mieterName && <span>Mieter: {t.mieterName}</span>}
                      {t.zugewiesenerDienstleisterName && <span>→ {t.zugewiesenerDienstleisterName}</span>}
                      <span>{new Date(t.erstelltAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                    </div>
                  </div>
                  <Select value={t.status} onValueChange={v => handleStatusChange(t.id, v as HvTicketStatus)}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="neu">Neu</SelectItem>
                      <SelectItem value="in_bearbeitung">In Bearbeitung</SelectItem>
                      <SelectItem value="beauftragt">Beauftragt</SelectItem>
                      <SelectItem value="erledigt">Erledigt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-12">Keine Tickets gefunden</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Ticket bearbeiten" : "Neues Ticket erstellen"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="col-span-2"><Label>Titel *</Label><Input value={form.titel} onChange={e => setForm(f => ({ ...f, titel: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Beschreibung</Label><Textarea value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} rows={3} /></div>
            <div><Label>Objekt</Label><Input value={form.objektName} onChange={e => setForm(f => ({ ...f, objektName: e.target.value }))} placeholder="Objektname" /></div>
            <div><Label>Wohneinheit</Label><Input value={form.wohneinheitName} onChange={e => setForm(f => ({ ...f, wohneinheitName: e.target.value }))} placeholder="z.B. WHG 19" /></div>
            <div><Label>Mieter</Label><Input value={form.mieterName} onChange={e => setForm(f => ({ ...f, mieterName: e.target.value }))} /></div>
            <div>
              <Label>Kategorie</Label>
              <Select value={form.kategorie} onValueChange={v => setForm(f => ({ ...f, kategorie: v as HvTicketKategorie }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{HV_KATEGORIEN.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priorität</Label>
              <Select value={form.prioritaet} onValueChange={v => setForm(f => ({ ...f, prioritaet: v as HvTicketPrioritaet }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{HV_PRIORITAETEN.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dienstleister</Label>
              <Select value={form.zugewiesenerDienstleisterId} onValueChange={v => {
                const dl = dienstleister.find(d => d.id === v);
                setForm(f => ({ ...f, zugewiesenerDienstleisterId: v, zugewiesenerDienstleisterName: dl?.firma || "" }));
              }}>
                <SelectTrigger><SelectValue placeholder="Zuweisen..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">Keiner</SelectItem>
                  {dienstleister.map(d => <SelectItem key={d.id} value={d.id}>{d.firma}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={handleSave}>{editId ? "Speichern" : "Erstellen"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default HVTicketsPage;
