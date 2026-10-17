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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getMieter, deleteMieter, Mieter } from "@/lib/mieterStore";
import { MieterDialog } from "@/components/mieter/MieterDialog";
import { Plus, Search, Phone, Mail, Trash2, Edit } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  aktiv: { label: "Aktiv", variant: "default" },
  gekuendigt: { label: "Gekündigt", variant: "destructive" },
  ausgezogen: { label: "Ausgezogen", variant: "secondary" },
  neu: { label: "Neu", variant: "outline" },
};

const MieterPage = () => {
  const cacheReady = useCacheReady(["mieter"]);
  const navigate = useNavigate();
  const [mieter, setMieter] = useState<Mieter[]>(getMieter());
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("alle");

  useEffect(() => { if (cacheReady) setMieter(getMieter()); }, [cacheReady]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Mieter | null>(null);

  const reload = () => setMieter(getMieter());

  const filtered = mieter.filter(m => {
    const matchSearch = `${m.vorname} ${m.nachname} ${m.email}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "alle" || m.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const openNew = () => { setBearbeiten(null); setDialogOpen(true); };
  const openEdit = (m: Mieter) => { setBearbeiten(m); setDialogOpen(true); };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Mieter wirklich löschen?",
      description: "Der Mieter samt hinterlegten Angaben wird entfernt.",
      confirmText: "Löschen",
      cancelText: "Behalten",
      variant: "destructive",
    });
    if (!ok) return;
    deleteMieter(id);
    toast({ title: "Mieter gelöscht" });
    reload();
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <PageHeader title="Mieterverwaltung" subtitle={`${mieter.length} Mieter insgesamt`} />
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Mieter anlegen</Button>
      </div>

      <div className="flex gap-3 mt-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Mieter suchen..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Status</SelectItem>
            <SelectItem value="aktiv">Aktiv</SelectItem>
            <SelectItem value="gekuendigt">Gekündigt</SelectItem>
            <SelectItem value="ausgezogen">Ausgezogen</SelectItem>
            <SelectItem value="neu">Neu</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 mt-6">
        {filtered.map(m => (
          <Card key={m.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/mieter/${m.id}`)}>
            <CardContent className="py-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{m.vorname} {m.nachname}</p>
                  <Badge variant={statusLabels[m.status]?.variant || "secondary"} className="text-[10px]">
                    {statusLabels[m.status]?.label || m.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  <span>{m.objektName && m.wohneinheitName ? `${m.objektName}, ${m.wohneinheitName}` : "keiner Einheit zugeordnet"}</span>
                  {m.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{m.email}</span>}
                  {m.telefon && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{m.telefon}</span>}
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  <span>Kaltmiete: {m.kaltmiete.toLocaleString("de-DE")} €</span>
                  <span>NK: {m.nebenkosten.toLocaleString("de-DE")} €</span>
                  <span>Kaution: {m.kaution.toLocaleString("de-DE")} € {m.kautionEingegangen ? "✓" : "✗"}</span>
                  {m.mietvertragBeginn && <span>Vertrag: ab {m.mietvertragBeginn}, {m.mietvertragEnde ? `befristet bis ${m.mietvertragEnde}` : "unbefristet"}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="Bearbeiten" onClick={(e) => { e.stopPropagation(); openEdit(m); }}><Edit className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Löschen" onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-12">Keine Mieter gefunden</p>}
      </div>

      <MieterDialog open={dialogOpen} onOpenChange={setDialogOpen} mieter={bearbeiten} onGespeichert={reload} />
    </DashboardLayout>
  );
};

export default MieterPage;
