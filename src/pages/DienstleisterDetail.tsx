import { useState } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getDienstleisterById, updateDienstleister, addDienstleisterDokument, removeDienstleisterDokument,
  DIENSTLEISTER_TYPEN, DL_DOKUMENT_TYPEN, type Dienstleister, type DienstleisterDokument, type DienstleisterTyp,
} from "@/lib/dienstleisterStore";
import { getObjekte } from "@/lib/objekteStore";
import {
  ArrowLeft, Phone, Mail, MapPin, Globe, FileText, Plus, Trash2, Pencil,
  Building2, Star, CreditCard, Wrench
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PhoneInput } from "@/components/ui/phone-input";

export default function DienstleisterDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [dl, setDl] = useState<Dienstleister | undefined>(() => getDienstleisterById(id || ""));
  const [editOpen, setEditOpen] = useState(false);
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [objektDialogOpen, setObjektDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Dienstleister>>({});
  const [docForm, setDocForm] = useState({ name: "", url: "", typ: "vertrag" as DienstleisterDokument["typ"] });

  // Objekte kommen in der zweiten Ladewelle; die Version loest das Nachrendern aus.
  useLiveVersion(["objekte", "wohnungen"]);
  const allObjekte = getObjekte();
  const reload = () => setDl(getDienstleisterById(id || ""));

  if (!dl) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-muted-foreground">Dienstleister nicht gefunden.</p>
          <Button variant="outline" onClick={() => navigate("/dienstleister")}>Zurück</Button>
        </div>
      </DashboardLayout>
    );
  }

  const typLabel = DIENSTLEISTER_TYPEN.find(t => t.value === dl.typ)?.label || dl.typ;

  const openEdit = () => {
    setEditForm({
      firma: dl.firma, ansprechpartner: dl.ansprechpartner, email: dl.email, telefon: dl.telefon,
      typ: dl.typ, strasse: dl.strasse, plz: dl.plz, ort: dl.ort, webseite: dl.webseite,
      steuernummer: dl.steuernummer, iban: dl.iban, kostenMonatlich: dl.kostenMonatlich,
      vertragBeginn: dl.vertragBeginn, vertragEnde: dl.vertragEnde, kuendigungsfrist: dl.kuendigungsfrist,
      leistungsbeschreibung: dl.leistungsbeschreibung, notizen: dl.notizen, bewertung: dl.bewertung,
    });
    setEditOpen(true);
  };

  const handleSaveEdit = () => {
    updateDienstleister(dl.id, editForm);
    reload();
    setEditOpen(false);
    toast({ title: "Dienstleister aktualisiert" });
  };

  const handleAddDoc = () => {
    if (!docForm.name) { toast({ title: "Bitte Dokumentname eingeben" }); return; }
    addDienstleisterDokument(dl.id, docForm);
    reload();
    setDocDialogOpen(false);
    setDocForm({ name: "", url: "", typ: "vertrag" });
    toast({ title: "Dokument hinzugefügt" });
  };

  const handleRemoveDoc = (docId: string) => {
    removeDienstleisterDokument(dl.id, docId);
    reload();
    toast({ title: "Dokument entfernt" });
  };

  const handleToggleObjekt = (objektId: string, objektName: string) => {
    const ids = [...(dl.objektIds || [])];
    const names = [...(dl.objektNamen || [])];
    const idx = ids.indexOf(objektId);
    if (idx >= 0) {
      ids.splice(idx, 1);
      names.splice(idx, 1);
    } else {
      ids.push(objektId);
      names.push(objektName);
    }
    updateDienstleister(dl.id, { objektIds: ids, objektNamen: names });
    reload();
  };

  const dokumente = dl.dokumente || [];

  return (
    <DashboardLayout>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => navigate("/dienstleister")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Zurück zur Dienstleisterliste
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Wrench className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{dl.firma}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline">{typLabel}</Badge>
                <span className="text-sm text-muted-foreground">{dl.ansprechpartner}</span>
                {dl.bewertung && (
                  <span className="flex items-center gap-0.5 text-xs text-amber-500">
                    {Array.from({ length: dl.bewertung }).map((_, i) => <Star key={i} className="h-3 w-3 fill-current" />)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <Button onClick={openEdit}><Pencil className="h-4 w-4 mr-2" /> Bearbeiten</Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Kosten / Monat</p>
          <p className="text-lg font-bold">{dl.kostenMonatlich.toLocaleString("de-DE")} €</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Objekte</p>
          <p className="text-lg font-bold">{(dl.objektIds || []).length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Vertragsbeginn</p>
          <p className="text-lg font-bold">{dl.vertragBeginn ? new Date(dl.vertragBeginn).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–"}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Vertragsende</p>
          <p className="text-lg font-bold">{dl.vertragEnde ? new Date(dl.vertragEnde).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "Unbefristet"}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="objekte">Objekte ({(dl.objektIds || []).length})</TabsTrigger>
          <TabsTrigger value="dokumente">Dokumente ({dokumente.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Kontaktdaten</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {dl.email && <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" />{dl.email}</div>}
                {dl.telefon && <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" />{dl.telefon}</div>}
                {(dl.strasse || dl.ort) && <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" />{dl.strasse}, {dl.plz} {dl.ort}</div>}
                {dl.webseite && <div className="flex items-center gap-2 text-sm"><Globe className="h-4 w-4 text-muted-foreground" /><a href={dl.webseite} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{dl.webseite}</a></div>}
                {dl.iban && <div className="flex items-center gap-2 text-sm"><CreditCard className="h-4 w-4 text-muted-foreground" />IBAN: {dl.iban}</div>}
                {dl.steuernummer && <div className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-muted-foreground" />StNr: {dl.steuernummer}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Vertrag & Kosten</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Typ</span><span className="font-medium">{typLabel}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Kosten / Monat</span><span className="font-medium">{dl.kostenMonatlich.toLocaleString("de-DE")} €</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Kosten / Jahr</span><span className="font-medium">{(dl.kostenMonatlich * 12).toLocaleString("de-DE")} €</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Vertragsbeginn</span><span className="font-medium">{dl.vertragBeginn ? new Date(dl.vertragBeginn).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Vertragsende</span><span className="font-medium">{dl.vertragEnde ? new Date(dl.vertragEnde).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "Unbefristet"}</span></div>
                {dl.kuendigungsfrist && <div className="flex justify-between"><span className="text-muted-foreground">Kündigungsfrist</span><span className="font-medium">{dl.kuendigungsfrist}</span></div>}
              </CardContent>
            </Card>
            {dl.leistungsbeschreibung && (
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-base">Leistungsbeschreibung</CardTitle></CardHeader>
                <CardContent><p className="text-sm whitespace-pre-wrap">{dl.leistungsbeschreibung}</p></CardContent>
              </Card>
            )}
            {dl.notizen && (
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-base">Notizen</CardTitle></CardHeader>
                <CardContent><p className="text-sm whitespace-pre-wrap">{dl.notizen}</p></CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="objekte">
          <div className="mt-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Zugewiesene Objekte</h3>
              <Button size="sm" onClick={() => setObjektDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Objekt verknüpfen</Button>
            </div>
            <div className="grid gap-3">
              {(dl.objektIds || []).map((objId, i) => (
                <Card key={objId}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm font-medium">{dl.objektNamen?.[i] || objId}</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => handleToggleObjekt(objId, dl.objektNamen?.[i] || objId)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {(dl.objektIds || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Keine Objekte zugewiesen</p>}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="dokumente">
          <div className="mt-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Dokumente & Verträge</h3>
              <Button size="sm" onClick={() => setDocDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Dokument hinzufügen</Button>
            </div>
            <div className="grid gap-3">
              {dokumente.map(doc => (
                <Card key={doc.id}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">{DL_DOKUMENT_TYPEN.find(t => t.value === doc.typ)?.label} · {new Date(doc.erstelltAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {doc.url && <Button size="sm" variant="ghost" onClick={() => window.open(doc.url, "_blank")}>Öffnen</Button>}
                      <Button size="sm" variant="ghost" onClick={() => handleRemoveDoc(doc.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {dokumente.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Keine Dokumente hinterlegt</p>}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Dienstleister bearbeiten</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div><Label>Firma</Label><Input value={editForm.firma || ""} onChange={e => setEditForm(f => ({ ...f, firma: e.target.value }))} /></div>
            <div><Label>Ansprechpartner</Label><Input value={editForm.ansprechpartner || ""} onChange={e => setEditForm(f => ({ ...f, ansprechpartner: e.target.value }))} /></div>
            <div><Label>E-Mail</Label><Input value={editForm.email || ""} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>Telefon</Label><PhoneInput value={editForm.telefon || ""} onChange={v => setEditForm(f => ({ ...f, telefon: v }))} /></div>
            <div><Label>Straße</Label><Input value={editForm.strasse || ""} onChange={e => setEditForm(f => ({ ...f, strasse: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-2"><div><Label>PLZ</Label><Input value={editForm.plz || ""} onChange={e => setEditForm(f => ({ ...f, plz: e.target.value }))} /></div><div className="col-span-2"><Label>Ort</Label><Input value={editForm.ort || ""} onChange={e => setEditForm(f => ({ ...f, ort: e.target.value }))} /></div></div>
            <div><Label>Webseite</Label><Input value={editForm.webseite || ""} onChange={e => setEditForm(f => ({ ...f, webseite: e.target.value }))} /></div>
            <div><Label>Typ</Label>
              <Select value={editForm.typ || "hausmeister"} onValueChange={v => setEditForm(f => ({ ...f, typ: v as DienstleisterTyp }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DIENSTLEISTER_TYPEN.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Kosten / Monat (€)</Label><Input type="number" value={editForm.kostenMonatlich || 0} onChange={e => setEditForm(f => ({ ...f, kostenMonatlich: +e.target.value }))} /></div>
            <div><Label>IBAN</Label><Input value={editForm.iban || ""} onChange={e => setEditForm(f => ({ ...f, iban: e.target.value }))} /></div>
            <div><Label>Steuernummer</Label><Input value={editForm.steuernummer || ""} onChange={e => setEditForm(f => ({ ...f, steuernummer: e.target.value }))} /></div>
            <div><Label>Vertragsbeginn</Label><DateInput value={editForm.vertragBeginn || ""} onChange={v => setEditForm(f => ({ ...f, vertragBeginn: v }))} /></div>
            <div><Label>Vertragsende</Label><DateInput value={editForm.vertragEnde || ""} onChange={v => setEditForm(f => ({ ...f, vertragEnde: v }))} /></div>
            <div className="col-span-2"><Label>Kündigungsfrist</Label><Input value={editForm.kuendigungsfrist || ""} onChange={e => setEditForm(f => ({ ...f, kuendigungsfrist: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Leistungsbeschreibung</Label><Textarea value={editForm.leistungsbeschreibung || ""} onChange={e => setEditForm(f => ({ ...f, leistungsbeschreibung: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Notizen</Label><Textarea value={editForm.notizen || ""} onChange={e => setEditForm(f => ({ ...f, notizen: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end mt-4"><Button onClick={handleSaveEdit}>Speichern</Button></div>
        </DialogContent>
      </Dialog>

      {/* Doc Dialog */}
      <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dokument hinzufügen</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Dokumentname *</Label><Input value={docForm.name} onChange={e => setDocForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>URL / Pfad</Label><Input value={docForm.url} onChange={e => setDocForm(f => ({ ...f, url: e.target.value }))} /></div>
            <div><Label>Typ</Label>
              <Select value={docForm.typ} onValueChange={v => setDocForm(f => ({ ...f, typ: v as DienstleisterDokument["typ"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DL_DOKUMENT_TYPEN.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end mt-4"><Button onClick={handleAddDoc}>Hinzufügen</Button></div>
        </DialogContent>
      </Dialog>

      {/* Objekt Link Dialog */}
      <Dialog open={objektDialogOpen} onOpenChange={setObjektDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Objekt verknüpfen</DialogTitle></DialogHeader>
          <div className="space-y-2 mt-4">
            {allObjekte.map(obj => {
              const linked = (dl.objektIds || []).includes(obj.id);
              return (
                <div key={obj.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer" onClick={() => { handleToggleObjekt(obj.id, obj.titel); }}>
                  <Checkbox checked={linked} />
                  <div>
                    <p className="text-sm font-medium">{obj.titel}</p>
                    <p className="text-xs text-muted-foreground">{obj.ort}</p>
                  </div>
                </div>
              );
            })}
            {allObjekte.length === 0 && <p className="text-sm text-muted-foreground">Keine Objekte vorhanden</p>}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
