import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getMieterById, updateMieter, addMieterDokument, removeMieterDokument,
  updateMieterZahlung, addMieterZahlung, deleteMieterZahlung,
  DOKUMENT_TYPEN, type Mieter, type MieterDokument, type MieterZahlung
} from "@/lib/mieterStore";
import {
  getMahnungEmailHtml, getMahnstufenConfig, getMahnungTemplateData,
  type Mahnstufe
} from "@/lib/mahnungShared";
import { getZaehlerstaendeByMieter, ZAEHLER_TYPEN, ANLASS_LABELS } from "@/lib/zaehlerstandStore";
import { getKautionByMieter, berechneKautionZinsen, berechneRueckzahlung } from "@/lib/kautionStore";
import { getKommunikationByMieter, KOMM_TYPEN, RICHTUNG_LABELS } from "@/lib/kommunikationStore";
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, FileText, Plus, Trash2, Pencil,
  CheckCircle, XCircle, AlertTriangle, CreditCard, Home, User, Send, Download,
  Gauge, Banknote, MessageSquare, TrendingUp, ClipboardCheck
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PhoneInput } from "@/components/ui/phone-input";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  aktiv: { label: "Aktiv", variant: "default" },
  gekuendigt: { label: "Gekündigt", variant: "destructive" },
  ausgezogen: { label: "Ausgezogen", variant: "secondary" },
  neu: { label: "Neu", variant: "outline" },
};

const zahlungsStatusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  bezahlt: { label: "Bezahlt", color: "text-green-600", icon: <CheckCircle className="h-3.5 w-3.5 text-green-600" /> },
  teilweise: { label: "Teilweise", color: "text-orange-500", icon: <AlertTriangle className="h-3.5 w-3.5 text-orange-500" /> },
  offen: { label: "Offen", color: "text-blue-500", icon: <CreditCard className="h-3.5 w-3.5 text-blue-500" /> },
  ueberfaellig: { label: "Überfällig", color: "text-red-500", icon: <XCircle className="h-3.5 w-3.5 text-red-500" /> },
  gemahnt: { label: "Gemahnt", color: "text-red-700", icon: <AlertTriangle className="h-3.5 w-3.5 text-red-700" /> },
};

export default function MieterDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [mieter, setMieter] = useState<Mieter | undefined>(() => getMieterById(id || ""));
  const [editOpen, setEditOpen] = useState(false);
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [zahlungDialogOpen, setZahlungDialogOpen] = useState(false);
  const [editZahlung, setEditZahlung] = useState<MieterZahlung | null>(null);
  const [editForm, setEditForm] = useState<Partial<Mieter>>({});
  const [docForm, setDocForm] = useState({ name: "", url: "", typ: "sonstiges" as MieterDokument["typ"] });
  const [zahlungForm, setZahlungForm] = useState<Partial<MieterZahlung>>({
    monat: "", kaltmiete: 0, nebenkosten: 0, betragGezahlt: 0, status: "offen", gezahltAm: "", notiz: "",
  });
  const [mahnungOpen, setMahnungOpen] = useState(false);
  const [mahnungZahlung, setMahnungZahlung] = useState<MieterZahlung | null>(null);
  const [mahnStufe, setMahnStufe] = useState<Mahnstufe>(1);
  const [mahnFrist, setMahnFrist] = useState(14);
  const [mahnSending, setMahnSending] = useState(false);

  const reload = () => setMieter(getMieterById(id || ""));

  if (!mieter) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-muted-foreground">Mieter nicht gefunden.</p>
          <Button variant="outline" onClick={() => navigate("/mieter")}>Zurück</Button>
        </div>
      </DashboardLayout>
    );
  }

  const status = statusConfig[mieter.status] || statusConfig.neu;
  const gesamtMiete = mieter.kaltmiete + mieter.nebenkosten;

  const zahlungen = mieter.zahlungen || [];
  const offeneZahlungen = zahlungen.filter(z => z.status === "offen" || z.status === "ueberfaellig" || z.status === "gemahnt");
  const bezahlteZahlungen = zahlungen.filter(z => z.status === "bezahlt");
  const ueberfaellig = zahlungen.filter(z => z.status === "ueberfaellig" || z.status === "gemahnt");

  const openEdit = () => {
    setEditForm({
      vorname: mieter.vorname, nachname: mieter.nachname, email: mieter.email, telefon: mieter.telefon,
      strasse: mieter.strasse, plz: mieter.plz, ort: mieter.ort, geburtsdatum: mieter.geburtsdatum,
      kaltmiete: mieter.kaltmiete, nebenkosten: mieter.nebenkosten, kaution: mieter.kaution,
      mietvertragBeginn: mieter.mietvertragBeginn, mietvertragEnde: mieter.mietvertragEnde,
      status: mieter.status, notizen: mieter.notizen, bankIban: mieter.bankIban,
      einzugsdatum: mieter.einzugsdatum, auszugsdatum: mieter.auszugsdatum,
      kuendigungsdatum: mieter.kuendigungsdatum, kuendigungsfrist: mieter.kuendigungsfrist,
    });
    setEditOpen(true);
  };

  const handleSaveEdit = () => {
    updateMieter(mieter.id, editForm);
    reload();
    setEditOpen(false);
    toast({ title: "Mieter aktualisiert" });
  };

  const handleAddDoc = () => {
    if (!docForm.name) { toast({ title: "Bitte Dokumentname eingeben" }); return; }
    addMieterDokument(mieter.id, docForm);
    reload();
    setDocDialogOpen(false);
    setDocForm({ name: "", url: "", typ: "sonstiges" });
    toast({ title: "Dokument hinzugefügt" });
  };

  const handleRemoveDoc = (docId: string) => {
    removeMieterDokument(mieter.id, docId);
    reload();
    toast({ title: "Dokument entfernt" });
  };

  const handleZahlungUpdate = (z: MieterZahlung, newStatus: MieterZahlung["status"], betrag?: number) => {
    updateMieterZahlung(mieter.id, z.id, {
      status: newStatus,
      gezahltAm: newStatus === "bezahlt" ? new Date().toISOString().split("T")[0] : z.gezahltAm,
      betragGezahlt: betrag !== undefined ? betrag : (newStatus === "bezahlt" ? z.kaltmiete + z.nebenkosten : z.betragGezahlt),
    });
    reload();
    toast({ title: `Zahlung ${newStatus === "bezahlt" ? "als bezahlt markiert" : "aktualisiert"}` });
  };

  const openNewZahlung = () => {
    const now = new Date();
    setZahlungForm({
      monat: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      kaltmiete: mieter.kaltmiete,
      nebenkosten: mieter.nebenkosten,
      betragGezahlt: 0,
      status: "offen",
      gezahltAm: "",
      notiz: "",
    });
    setEditZahlung(null);
    setZahlungDialogOpen(true);
  };

  const openEditZahlung = (z: MieterZahlung) => {
    setZahlungForm({ ...z });
    setEditZahlung(z);
    setZahlungDialogOpen(true);
  };

  const handleSaveZahlung = () => {
    if (!zahlungForm.monat) { toast({ title: "Bitte Monat eingeben" }); return; }
    if (editZahlung) {
      updateMieterZahlung(mieter.id, editZahlung.id, zahlungForm);
      toast({ title: "Zahlung aktualisiert" });
    } else {
      addMieterZahlung(mieter.id, {
        monat: zahlungForm.monat || "",
        kaltmiete: zahlungForm.kaltmiete || 0,
        nebenkosten: zahlungForm.nebenkosten || 0,
        betragGezahlt: zahlungForm.betragGezahlt || 0,
        status: (zahlungForm.status as MieterZahlung["status"]) || "offen",
        gezahltAm: zahlungForm.gezahltAm || "",
        notiz: zahlungForm.notiz || "",
      });
      toast({ title: "Zahlung angelegt" });
    }
    reload();
    setZahlungDialogOpen(false);
  };

  const handleDeleteZahlung = (zahlungId: string) => {
    deleteMieterZahlung(mieter.id, zahlungId);
    reload();
    toast({ title: "Zahlung gelöscht" });
  };

  const ABSENDER_FIRMA = "MOREImmo";
  const ABSENDER_ADRESSE = "Wendelsteinstraße 19, 83075 Bad Feilnbach";

  const openMahnung = (z: MieterZahlung) => {
    setMahnungZahlung(z);
    setMahnStufe(z.status === "gemahnt" ? 2 : 1);
    setMahnFrist(stufeToFrist(z.status === "gemahnt" ? 2 : 1));
    setMahnungOpen(true);
  };

  const stufeToFrist = (s: Mahnstufe): number => s === 1 ? 14 : s === 2 ? 10 : 7;
  const mahnConfig = getMahnstufenConfig();

  const handleMahnungPdf = async () => {
    if (!mahnungZahlung) return;
    const { generateMahnungPDF } = await import("@/lib/mahnungPdf");
    const pdf = generateMahnungPDF({
      mieter, zahlung: mahnungZahlung, stufe: mahnStufe,
      fristTage: mahnFrist, absenderFirma: ABSENDER_FIRMA, absenderAdresse: ABSENDER_ADRESSE,
    });
    pdf.save(`${mahnConfig[mahnStufe].titel}_${mieter.nachname}_${mahnungZahlung.monat}.pdf`);
    // Update status to gemahnt
    updateMieterZahlung(mieter.id, mahnungZahlung.id, { status: "gemahnt", notiz: `${mahnConfig[mahnStufe].titel} erstellt am ${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}` });
    reload();
    toast({ title: `${mahnConfig[mahnStufe].titel} als PDF heruntergeladen` });
  };

  const handleMahnungEmail = async () => {
    if (!mahnungZahlung || !mieter.email) {
      toast({ title: "Keine E-Mail-Adresse hinterlegt", variant: "destructive" });
      return;
    }
    setMahnSending(true);
    try {
      const templateData = getMahnungTemplateData({
        mieter, zahlung: mahnungZahlung, stufe: mahnStufe,
        fristTage: mahnFrist, absenderFirma: ABSENDER_FIRMA, absenderAdresse: ABSENDER_ADRESSE,
      });
      const { error } = await supabase.functions.invoke("send-mahnung", {
        body: {
          to: mieter.email,
          mieterName: `${mieter.vorname} ${mieter.nachname}`,
          templateData,
        },
      });
      if (error) throw error;
      // Update status
      updateMieterZahlung(mieter.id, mahnungZahlung.id, { status: "gemahnt", notiz: `${mahnConfig[mahnStufe].titel} per E-Mail versendet am ${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}` });
      reload();
      setMahnungOpen(false);
      toast({ title: `${mahnConfig[mahnStufe].titel} per E-Mail versendet`, description: `An: ${mieter.email}` });
    } catch (err) {
      console.error("Mahnung email error:", err);
      toast({ title: "E-Mail-Versand fehlgeschlagen", description: "Bitte versuche es erneut oder lade die PDF herunter.", variant: "destructive" });
    } finally {
      setMahnSending(false);
    }
  };

  const formatMonat = (m: string) => {
    const [y, mo] = m.split("-");
    const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    return `${months[parseInt(mo) - 1]} ${y}`;
  };

  return (
    <DashboardLayout>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => navigate("/mieter")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Zurück zur Mieterliste
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{mieter.vorname} {mieter.nachname}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={status.variant}>{status.label}</Badge>
                {mieter.objektName && <span className="text-sm text-muted-foreground">{mieter.objektName} · {mieter.wohneinheitName || mieter.wohneinheitId}</span>}
              </div>
            </div>
          </div>
        </div>
        <Button onClick={openEdit}><Pencil className="h-4 w-4 mr-2" /> Bearbeiten</Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Kaltmiete</p>
          <p className="text-lg font-bold">{mieter.kaltmiete.toLocaleString("de-DE")} €</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Nebenkosten</p>
          <p className="text-lg font-bold">{mieter.nebenkosten.toLocaleString("de-DE")} €</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Warmmiete</p>
          <p className="text-lg font-bold text-primary">{gesamtMiete.toLocaleString("de-DE")} €</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Kaution</p>
          <p className="text-lg font-bold">{mieter.kaution.toLocaleString("de-DE")} €</p>
          {mieter.kautionEingegangen ? <CheckCircle className="h-3.5 w-3.5 text-green-500 mx-auto mt-1" /> : <XCircle className="h-3.5 w-3.5 text-red-500 mx-auto mt-1" />}
        </CardContent></Card>
        <Card className={ueberfaellig.length > 0 ? "border-red-200 dark:border-red-900" : ""}>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">Offene Zahlungen</p>
            <p className={`text-lg font-bold ${ueberfaellig.length > 0 ? "text-red-500" : ""}`}>{offeneZahlungen.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="stammdaten">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="stammdaten">Stammdaten</TabsTrigger>
          <TabsTrigger value="zahlungen">Zahlungen ({zahlungen.length})</TabsTrigger>
          <TabsTrigger value="dokumente">Dokumente ({mieter.dokumente.length})</TabsTrigger>
          <TabsTrigger value="vertrag">Vertrag</TabsTrigger>
          <TabsTrigger value="zaehler"><Gauge className="h-3.5 w-3.5 mr-1" />Zähler</TabsTrigger>
          <TabsTrigger value="kaution"><Banknote className="h-3.5 w-3.5 mr-1" />Kaution</TabsTrigger>
          <TabsTrigger value="kommunikation"><MessageSquare className="h-3.5 w-3.5 mr-1" />Kommunikation</TabsTrigger>
        </TabsList>

        {/* STAMMDATEN */}
        <TabsContent value="stammdaten">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Kontaktdaten</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {mieter.email && <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" />{mieter.email}</div>}
                {mieter.telefon && <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" />{mieter.telefon}</div>}
                {(mieter.strasse || mieter.ort) && <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" />{mieter.strasse}, {mieter.plz} {mieter.ort}</div>}
                {mieter.geburtsdatum && <div className="flex items-center gap-2 text-sm"><Calendar className="h-4 w-4 text-muted-foreground" />Geb.: {new Date(mieter.geburtsdatum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</div>}
                {mieter.bankIban && <div className="flex items-center gap-2 text-sm"><CreditCard className="h-4 w-4 text-muted-foreground" />IBAN: {mieter.bankIban}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Objekt & Wohneinheit</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm"><Home className="h-4 w-4 text-muted-foreground" />{mieter.objektName || mieter.objektId}</div>
                <div className="flex items-center gap-2 text-sm"><Home className="h-4 w-4 text-muted-foreground" />{mieter.wohneinheitName || mieter.wohneinheitId}</div>
                {mieter.einzugsdatum && <div className="text-sm text-muted-foreground">Einzug: {new Date(mieter.einzugsdatum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</div>}
                {mieter.auszugsdatum && <div className="text-sm text-muted-foreground">Auszug: {new Date(mieter.auszugsdatum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</div>}
              </CardContent>
            </Card>

            {mieter.notizen && (
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-base">Notizen</CardTitle></CardHeader>
                <CardContent><p className="text-sm whitespace-pre-wrap">{mieter.notizen}</p></CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ZAHLUNGEN */}
        <TabsContent value="zahlungen">
          <div className="mt-4">
            {ueberfaellig.length > 0 && (
              <Card className="mb-4 border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
                <CardContent className="pt-4 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="font-semibold text-red-700 dark:text-red-400">{ueberfaellig.length} überfällige Zahlung(en)</p>
                    <p className="text-xs text-muted-foreground">Summe: {ueberfaellig.reduce((s, z) => s + z.kaltmiete + z.nebenkosten - z.betragGezahlt, 0).toLocaleString("de-DE")} € ausstehend</p>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Zahlungsübersicht</CardTitle>
                  <Button size="sm" onClick={openNewZahlung}><Plus className="h-4 w-4 mr-1" /> Neue Zahlung</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="pb-2 font-medium">Monat</th>
                        <th className="pb-2 font-medium text-right">Soll</th>
                        <th className="pb-2 font-medium text-right">Gezahlt</th>
                        <th className="pb-2 font-medium text-right">Differenz</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Datum</th>
                        <th className="pb-2 font-medium text-right">Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...zahlungen].reverse().map(z => {
                        const soll = z.kaltmiete + z.nebenkosten;
                        const diff = z.betragGezahlt - soll;
                        const cfg = zahlungsStatusConfig[z.status] || zahlungsStatusConfig.offen;
                        return (
                          <tr key={z.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 font-medium">{formatMonat(z.monat)}</td>
                            <td className="py-2 text-right">{soll.toLocaleString("de-DE")} €</td>
                            <td className="py-2 text-right">{z.betragGezahlt.toLocaleString("de-DE")} €</td>
                            <td className={`py-2 text-right font-medium ${diff < 0 ? "text-red-500" : diff > 0 ? "text-green-600" : ""}`}>
                              {diff !== 0 ? `${diff > 0 ? "+" : ""}${diff.toLocaleString("de-DE")} €` : "–"}
                            </td>
                            <td className="py-2"><span className={`flex items-center gap-1 ${cfg.color}`}>{cfg.icon}{cfg.label}</span></td>
                            <td className="py-2 text-muted-foreground">{z.gezahltAm ? new Date(z.gezahltAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–"}</td>
                            <td className="py-2 text-right">
                              <div className="flex gap-1 justify-end">
                                {z.status !== "bezahlt" && (
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleZahlungUpdate(z, "bezahlt")}>
                                    <CheckCircle className="h-3 w-3 mr-1" /> Bezahlt
                                  </Button>
                                )}
                                {(z.status === "ueberfaellig" || z.status === "gemahnt" || z.status === "offen") && (
                                  <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => openMahnung(z)}>
                                    <Mail className="h-3 w-3 mr-1" /> Mahnen
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEditZahlung(z)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => handleDeleteZahlung(z.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {zahlungen.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Keine Zahlungen vorhanden</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* DOKUMENTE */}
        <TabsContent value="dokumente">
          <div className="mt-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Dokumente & Unterlagen</h3>
              <Button size="sm" onClick={() => setDocDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Dokument hinzufügen</Button>
            </div>
            <div className="grid gap-3">
              {mieter.dokumente.map(doc => (
                <Card key={doc.id}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">{DOKUMENT_TYPEN.find(t => t.value === doc.typ)?.label} · {new Date(doc.erstelltAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {doc.url && <Button size="sm" variant="ghost" onClick={() => window.open(doc.url, "_blank")}>Öffnen</Button>}
                      <Button size="sm" variant="ghost" onClick={() => handleRemoveDoc(doc.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {mieter.dokumente.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Keine Dokumente hinterlegt</p>}
            </div>
          </div>
        </TabsContent>

        {/* VERTRAG */}
        <TabsContent value="vertrag">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Vertragsdaten</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Vertragsbeginn</span><span className="font-medium">{mieter.mietvertragBeginn ? new Date(mieter.mietvertragBeginn).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Vertragsende</span><span className="font-medium">{mieter.mietvertragEnde ? new Date(mieter.mietvertragEnde).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "Unbefristet"}</span></div>
                {mieter.kuendigungsfrist && <div className="flex justify-between"><span className="text-muted-foreground">Kündigungsfrist</span><span className="font-medium">{mieter.kuendigungsfrist}</span></div>}
                {mieter.kuendigungsdatum && <div className="flex justify-between"><span className="text-muted-foreground">Kündigung zum</span><span className="font-medium text-destructive">{new Date(mieter.kuendigungsdatum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</span></div>}
                <Button className="w-full mt-4" onClick={() => navigate(`/mieter/${mieter.id}/mietvertrag`)}>
                  <FileText className="h-4 w-4 mr-2" /> Mietvertrag erstellen
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Finanzübersicht</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Kaltmiete</span><span className="font-medium">{mieter.kaltmiete.toLocaleString("de-DE")} €</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Nebenkosten</span><span className="font-medium">{mieter.nebenkosten.toLocaleString("de-DE")} €</span></div>
                <div className="flex justify-between border-t pt-2"><span className="font-medium">Warmmiete</span><span className="font-bold text-primary">{gesamtMiete.toLocaleString("de-DE")} €</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Kaution</span><span className="font-medium">{mieter.kaution.toLocaleString("de-DE")} € {mieter.kautionEingegangen ? "✓" : "✗"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Gesamteinnahmen</span><span className="font-medium">{(bezahlteZahlungen.reduce((s, z) => s + z.betragGezahlt, 0)).toLocaleString("de-DE")} €</span></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        {/* ZÄHLERSTÄNDE */}
        <TabsContent value="zaehler">
          <div className="mt-4 space-y-4">
            {(() => {
              const staende = getZaehlerstaendeByMieter(mieter.id);
              return staende.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Gauge className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>Noch keine Zählerstände für diesen Mieter erfasst.</p>
                    <Button className="mt-4" onClick={() => navigate("/zaehlerstaende")}>
                      <Plus className="h-4 w-4 mr-2" />Ablesung erfassen
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold">Zählerstände ({staende.length})</h3>
                    <Button size="sm" onClick={() => navigate("/zaehlerstaende")}><Plus className="h-4 w-4 mr-1" />Neue Ablesung</Button>
                  </div>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b text-left"><th className="pb-2">Typ</th><th className="pb-2">Zähler-Nr.</th><th className="pb-2 text-right">Stand</th><th className="pb-2">Datum</th><th className="pb-2">Anlass</th></tr></thead>
                          <tbody>
                            {staende.map(s => {
                              const t = ZAEHLER_TYPEN.find(z => z.value === s.typ);
                              return (
                                <tr key={s.id} className="border-b border-border/50">
                                  <td className="py-2 font-medium">{t?.label || s.typ}</td>
                                  <td className="py-2 text-muted-foreground">{s.zaehlerNr}</td>
                                  <td className="py-2 text-right font-medium">{s.stand.toLocaleString("de-DE")} {t?.einheit}</td>
                                  <td className="py-2 text-muted-foreground">{new Date(s.ableseDatum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                                  <td className="py-2"><Badge variant="outline" className="text-[10px]">{ANLASS_LABELS.find(a => a.value === s.anlass)?.label || s.anlass}</Badge></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              );
            })()}
          </div>
        </TabsContent>

        {/* KAUTION */}
        <TabsContent value="kaution">
          <div className="mt-4 space-y-4">
            {(() => {
              const kaution = getKautionByMieter(mieter.id);
              if (!kaution) return (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Banknote className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>Keine Kaution für diesen Mieter erfasst.</p>
                    <Button className="mt-4" onClick={() => navigate("/kautionen")}>
                      <Plus className="h-4 w-4 mr-2" />Kaution erfassen
                    </Button>
                  </CardContent>
                </Card>
              );
              const zinsen = berechneKautionZinsen(kaution);
              const rueck = berechneRueckzahlung(kaution);
              const statusLabels: Record<string, string> = { offen: "Offen", vollstaendig: "Vollständig", teilweise: "Teilweise", rueckzahlung: "Rückzahlung", abgeschlossen: "Abgeschlossen" };
              return (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader><CardTitle className="text-base">Kautionsdaten</CardTitle></CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Betrag</span><span className="font-bold">{kaution.betrag.toLocaleString("de-DE")} €</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="outline">{statusLabels[kaution.status]}</Badge></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Eingezahlt am</span><span>{kaution.eingezahltAm ? new Date(kaution.eingezahltAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Zinssatz</span><span>{kaution.zinssatz}% p.a.</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Aufgelaufene Zinsen</span><span className="font-medium text-green-600">{zinsen.toFixed(2)} €</span></div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-base">Ratenzahlung (§551 BGB)</CardTitle></CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">1. Rate</span><span>{kaution.rate1.toLocaleString("de-DE")} € {kaution.rate1Datum && `(${new Date(kaution.rate1Datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })})`}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">2. Rate</span><span>{kaution.rate2.toLocaleString("de-DE")} € {kaution.rate2Datum && `(${new Date(kaution.rate2Datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })})`}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">3. Rate</span><span>{kaution.rate3.toLocaleString("de-DE")} € {kaution.rate3Datum && `(${new Date(kaution.rate3Datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })})`}</span></div>
                      <div className="border-t pt-3 mt-3">
                        <p className="text-xs font-semibold">Rückzahlung bei Auszug</p>
                        <div className="flex justify-between mt-1"><span className="text-muted-foreground">Brutto (inkl. Zinsen)</span><span>{rueck.brutto.toFixed(2)} €</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Einbehalte</span><span className="text-red-500">-{rueck.einbehalte.toFixed(2)} €</span></div>
                        <div className="flex justify-between font-bold"><span>Auszahlungsbetrag</span><span className="text-primary">{rueck.netto.toFixed(2)} €</span></div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
          </div>
        </TabsContent>

        {/* KOMMUNIKATION */}
        <TabsContent value="kommunikation">
          <div className="mt-4 space-y-4">
            {(() => {
              const komm = getKommunikationByMieter(mieter.id);
              return komm.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>Noch keine Kommunikation mit diesem Mieter dokumentiert.</p>
                    <Button className="mt-4" onClick={() => navigate("/hv-kommunikation")}>
                      <Plus className="h-4 w-4 mr-2" />Eintrag erstellen
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold">Kommunikationsverlauf ({komm.length})</h3>
                    <Button size="sm" onClick={() => navigate("/hv-kommunikation")}><Plus className="h-4 w-4 mr-1" />Neuer Eintrag</Button>
                  </div>
                  <Card>
                    <CardContent className="pt-4 space-y-3">
                      {komm.slice(0, 15).map(k => {
                        const typInfo = KOMM_TYPEN.find(t => t.value === k.typ);
                        return (
                          <div key={k.id} className="flex items-start gap-3 border-b pb-3 last:border-0">
                            <span className="text-lg mt-0.5">{typInfo?.emoji || "📝"}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">{k.betreff}</p>
                                <Badge variant="outline" className="text-[10px] shrink-0">{k.richtung === "eingehend" ? "↙" : k.richtung === "ausgehend" ? "↗" : "📌"} {RICHTUNG_LABELS.find(r => r.value === k.richtung)?.label}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{new Date(k.datum).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} · {typInfo?.label}</p>
                              {k.inhalt && <p className="text-sm mt-1 text-muted-foreground line-clamp-2">{k.inhalt}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </>
              );
            })()}
          </div>
        </TabsContent>

        {/* Quick Actions for related modules */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Button variant="outline" className="h-auto py-3 flex flex-col gap-1" onClick={() => navigate("/uebergabeprotokoll")}>
            <ClipboardCheck className="h-5 w-5" />
            <span className="text-xs">Übergabeprotokoll</span>
          </Button>
          <Button variant="outline" className="h-auto py-3 flex flex-col gap-1" onClick={() => navigate("/mieterhoehung")}>
            <TrendingUp className="h-5 w-5" />
            <span className="text-xs">Mieterhöhung</span>
          </Button>
          <Button variant="outline" className="h-auto py-3 flex flex-col gap-1" onClick={() => navigate("/betriebskostenabrechnung")}>
            <CreditCard className="h-5 w-5" />
            <span className="text-xs">BK-Abrechnung</span>
          </Button>
        </div>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Mieter bearbeiten</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div><Label>Vorname</Label><Input value={editForm.vorname || ""} onChange={e => setEditForm(f => ({ ...f, vorname: e.target.value }))} /></div>
            <div><Label>Nachname</Label><Input value={editForm.nachname || ""} onChange={e => setEditForm(f => ({ ...f, nachname: e.target.value }))} /></div>
            <div><Label>E-Mail</Label><Input value={editForm.email || ""} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>Telefon</Label><PhoneInput value={editForm.telefon || ""} onChange={v => setEditForm(f => ({ ...f, telefon: v }))} /></div>
            <div><Label>Straße</Label><Input value={editForm.strasse || ""} onChange={e => setEditForm(f => ({ ...f, strasse: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-2"><div><Label>PLZ</Label><Input value={editForm.plz || ""} onChange={e => setEditForm(f => ({ ...f, plz: e.target.value }))} /></div><div className="col-span-2"><Label>Ort</Label><Input value={editForm.ort || ""} onChange={e => setEditForm(f => ({ ...f, ort: e.target.value }))} /></div></div>
            <div><Label>Geburtsdatum</Label><DateInput value={editForm.geburtsdatum || ""} onChange={v => setEditForm(f => ({ ...f, geburtsdatum: v }))} /></div>
            <div><Label>IBAN</Label><Input value={editForm.bankIban || ""} onChange={e => setEditForm(f => ({ ...f, bankIban: e.target.value }))} /></div>
            <div><Label>Kaltmiete (€)</Label><Input type="number" value={editForm.kaltmiete || 0} onChange={e => setEditForm(f => ({ ...f, kaltmiete: +e.target.value }))} /></div>
            <div><Label>Nebenkosten (€)</Label><Input type="number" value={editForm.nebenkosten || 0} onChange={e => setEditForm(f => ({ ...f, nebenkosten: +e.target.value }))} /></div>
            <div><Label>Kaution (€)</Label><Input type="number" value={editForm.kaution || 0} onChange={e => setEditForm(f => ({ ...f, kaution: +e.target.value }))} /></div>
            <div><Label>Status</Label>
              <Select value={editForm.status || "neu"} onValueChange={v => setEditForm(f => ({ ...f, status: v as Mieter["status"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="neu">Neu</SelectItem><SelectItem value="aktiv">Aktiv</SelectItem>
                  <SelectItem value="gekuendigt">Gekündigt</SelectItem><SelectItem value="ausgezogen">Ausgezogen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Vertragsbeginn</Label><DateInput value={editForm.mietvertragBeginn || ""} onChange={v => setEditForm(f => ({ ...f, mietvertragBeginn: v }))} /></div>
            <div><Label>Vertragsende</Label><DateInput value={editForm.mietvertragEnde || ""} onChange={v => setEditForm(f => ({ ...f, mietvertragEnde: v }))} /></div>
            <div><Label>Einzugsdatum</Label><DateInput value={editForm.einzugsdatum || ""} onChange={v => setEditForm(f => ({ ...f, einzugsdatum: v }))} /></div>
            <div><Label>Kündigungsdatum</Label><DateInput value={editForm.kuendigungsdatum || ""} onChange={v => setEditForm(f => ({ ...f, kuendigungsdatum: v }))} /></div>
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
            <div><Label>URL / Pfad</Label><Input value={docForm.url} onChange={e => setDocForm(f => ({ ...f, url: e.target.value }))} placeholder="z.B. /dokumente/..." /></div>
            <div><Label>Typ</Label>
              <Select value={docForm.typ} onValueChange={v => setDocForm(f => ({ ...f, typ: v as MieterDokument["typ"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOKUMENT_TYPEN.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end mt-4"><Button onClick={handleAddDoc}>Hinzufügen</Button></div>
        </DialogContent>
      </Dialog>

      {/* Zahlung Dialog (New / Edit) */}
      <Dialog open={zahlungDialogOpen} onOpenChange={setZahlungDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editZahlung ? "Zahlung bearbeiten" : "Neue Zahlung anlegen"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Monat (YYYY-MM) *</Label><Input type="month" value={zahlungForm.monat || ""} onChange={e => setZahlungForm(f => ({ ...f, monat: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Kaltmiete (€)</Label><Input type="number" value={zahlungForm.kaltmiete || 0} onChange={e => setZahlungForm(f => ({ ...f, kaltmiete: +e.target.value }))} /></div>
              <div><Label>Nebenkosten (€)</Label><Input type="number" value={zahlungForm.nebenkosten || 0} onChange={e => setZahlungForm(f => ({ ...f, nebenkosten: +e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Betrag gezahlt (€)</Label><Input type="number" value={zahlungForm.betragGezahlt || 0} onChange={e => setZahlungForm(f => ({ ...f, betragGezahlt: +e.target.value }))} /></div>
              <div><Label>Gezahlt am</Label><DateInput value={zahlungForm.gezahltAm || ""} onChange={v => setZahlungForm(f => ({ ...f, gezahltAm: v }))} /></div>
            </div>
            <div><Label>Status</Label>
              <Select value={zahlungForm.status || "offen"} onValueChange={v => setZahlungForm(f => ({ ...f, status: v as MieterZahlung["status"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="offen">Offen</SelectItem>
                  <SelectItem value="bezahlt">Bezahlt</SelectItem>
                  <SelectItem value="teilweise">Teilweise</SelectItem>
                  <SelectItem value="ueberfaellig">Überfällig</SelectItem>
                  <SelectItem value="gemahnt">Gemahnt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notiz</Label><Input value={zahlungForm.notiz || ""} onChange={e => setZahlungForm(f => ({ ...f, notiz: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end mt-4"><Button onClick={handleSaveZahlung}>{editZahlung ? "Speichern" : "Anlegen"}</Button></div>
        </DialogContent>
      </Dialog>
      {/* Mahnung Dialog */}
      <Dialog open={mahnungOpen} onOpenChange={setMahnungOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Zahlungsmahnung erstellen
            </DialogTitle>
          </DialogHeader>
          {mahnungZahlung && (
            <div className="space-y-4 mt-2">
              {/* Mieter & Zahlung Info */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-sm font-medium">{mieter.vorname} {mieter.nachname}</p>
                <p className="text-xs text-muted-foreground">{mieter.objektName} · {mieter.wohneinheitName}</p>
                <div className="flex justify-between text-sm mt-2">
                  <span>Monat: <strong>{formatMonat(mahnungZahlung.monat)}</strong></span>
                  <span className="text-destructive font-bold">
                    {((mahnungZahlung.kaltmiete + mahnungZahlung.nebenkosten) - mahnungZahlung.betragGezahlt).toLocaleString("de-DE")} € offen
                  </span>
                </div>
              </div>

              {/* Mahnstufe */}
              <div>
                <Label>Mahnstufe</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {([1, 2, 3] as Mahnstufe[]).map(s => (
                    <button
                      key={s}
                      onClick={() => { setMahnStufe(s); setMahnFrist(stufeToFrist(s)); }}
                      className={`p-3 rounded-lg border text-center transition-all ${
                        mahnStufe === s
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="text-xs font-bold">{mahnConfig[s].titel}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Stufe {s}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Frist */}
              <div>
                <Label>Zahlungsfrist (Tage)</Label>
                <Input type="number" value={mahnFrist} onChange={e => setMahnFrist(+e.target.value)} min={3} max={30} className="mt-1" />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Frist bis: {new Date(Date.now() + mahnFrist * 86400000).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </p>
              </div>

              {/* Preview Text */}
              <div className="bg-muted/30 rounded-lg p-3 border border-border">
                <p className="text-xs font-semibold mb-1">Vorschau – {mahnConfig[mahnStufe].titel}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{mahnConfig[mahnStufe].textIntro}</p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={handleMahnungPdf}>
                  <Download className="h-4 w-4 mr-2" /> PDF herunterladen
                </Button>
                <Button className="flex-1" onClick={handleMahnungEmail} disabled={mahnSending || !mieter.email}>
                  <Send className="h-4 w-4 mr-2" /> {mahnSending ? "Wird gesendet..." : "Per E-Mail senden"}
                </Button>
              </div>
              {!mieter.email && <p className="text-xs text-destructive">Keine E-Mail-Adresse hinterlegt – bitte zuerst im Profil ergänzen.</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
