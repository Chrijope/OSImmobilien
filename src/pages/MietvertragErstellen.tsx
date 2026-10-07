import { useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Download, Send, FileText } from "lucide-react";
import { getMieterById, addMieterDokument } from "@/lib/mieterStore";
import { toast } from "@/hooks/use-toast";
import jsPDF from "jspdf";

interface VertragFormData {
  vermieterName: string;
  vermieterAdresse: string;
  vermieterOrt: string;
  mieterAnrede: string;
  mieterName: string;
  mieterAdresse: string;
  mieterOrt: string;
  mieterGeburtsdatum: string;
  objektAdresse: string;
  objektOrt: string;
  wohneinheit: string;
  etage: string;
  wohnflaeche: string;
  zimmer: string;
  stellplatz: boolean;
  stellplatzNr: string;
  keller: boolean;
  kellerNr: string;
  mietbeginn: string;
  mietende: string;
  befristet: boolean;
  kaltmiete: string;
  nebenkosten: string;
  kaution: string;
  zahlungTag: string;
  bankName: string;
  bankIban: string;
  bankBic: string;
  kuendigungsfrist: string;
  sondervereinbarungen: string;
  erstelltAm: string;
}

const formatDate = (d: string) => {
  if (!d) return "___________";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return d;
};

const fmt = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MietvertragErstellen() {
  const navigate = useNavigate();
  const { id } = useParams();
  const mieter = getMieterById(id || "");
  const previewRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState<VertragFormData>({
    vermieterName: "OS Immobilien",
    vermieterAdresse: "Musterstraße 1",
    vermieterOrt: "80331 München",
    mieterAnrede: "Herr",
    mieterName: mieter ? `${mieter.vorname} ${mieter.nachname}` : "",
    mieterAdresse: mieter?.strasse || "",
    mieterOrt: mieter ? `${mieter.plz || ""} ${mieter.ort || ""}`.trim() : "",
    mieterGeburtsdatum: mieter?.geburtsdatum || "",
    objektAdresse: mieter?.objektName || "",
    objektOrt: "",
    wohneinheit: mieter?.wohneinheitName || mieter?.wohneinheitId || "",
    etage: "",
    wohnflaeche: "",
    zimmer: "",
    stellplatz: false,
    stellplatzNr: "",
    keller: false,
    kellerNr: "",
    mietbeginn: mieter?.mietvertragBeginn || "",
    mietende: mieter?.mietvertragEnde || "",
    befristet: !!mieter?.mietvertragEnde,
    kaltmiete: mieter?.kaltmiete?.toString() || "0",
    nebenkosten: mieter?.nebenkosten?.toString() || "0",
    kaution: mieter?.kaution?.toString() || "0",
    zahlungTag: "3",
    bankName: "",
    bankIban: mieter?.bankIban || "",
    bankBic: mieter?.bankBic || "",
    kuendigungsfrist: mieter?.kuendigungsfrist || "3 Monate",
    sondervereinbarungen: "",
    erstelltAm: today,
  });

  const u = (field: keyof VertragFormData, value: string | boolean) =>
    setForm(f => ({ ...f, [field]: value }));

  const warmmiete = parseFloat(form.kaltmiete || "0") + parseFloat(form.nebenkosten || "0");

  const generatePdf = () => {
    const doc = new jsPDF();
    const margin = 20;
    let y = 25;
    const lh = 6;
    const pw = 170;

    const addLine = (text: string, bold = false, size = 10) => {
      doc.setFontSize(size);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      const lines = doc.splitTextToSize(text, pw);
      lines.forEach((line: string) => {
        if (y > 270) { doc.addPage(); y = 25; }
        doc.text(line, margin, y);
        y += lh;
      });
    };

    const addGap = (h = 4) => { y += h; };

    // Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("MIETVERTRAG", 105, y, { align: "center" });
    y += 12;

    addLine("für Wohnraum nach §§ 535 ff. BGB", false, 10);
    addGap(6);

    // Vertragsparteien
    addLine("§ 1 Vertragsparteien", true, 12);
    addGap(2);
    addLine("Vermieter:");
    addLine(`${form.vermieterName}`);
    addLine(`${form.vermieterAdresse}, ${form.vermieterOrt}`);
    addGap(3);
    addLine("Mieter:");
    addLine(`${form.mieterAnrede} ${form.mieterName}`);
    if (form.mieterAdresse) addLine(`${form.mieterAdresse}, ${form.mieterOrt}`);
    if (form.mieterGeburtsdatum) addLine(`geboren am ${formatDate(form.mieterGeburtsdatum)}`);
    addGap(6);

    // Mietobjekt
    addLine("§ 2 Mietobjekt", true, 12);
    addGap(2);
    addLine(`Objekt: ${form.objektAdresse}${form.objektOrt ? ", " + form.objektOrt : ""}`);
    addLine(`Wohneinheit: ${form.wohneinheit}${form.etage ? ", " + form.etage : ""}`);
    if (form.wohnflaeche) addLine(`Wohnfläche: ca. ${form.wohnflaeche} m²`);
    if (form.zimmer) addLine(`Zimmer: ${form.zimmer}`);
    if (form.stellplatz) addLine(`Stellplatz Nr.: ${form.stellplatzNr || "–"}`);
    if (form.keller) addLine(`Kellerabteil Nr.: ${form.kellerNr || "–"}`);
    addGap(6);

    // Mietdauer
    addLine("§ 3 Mietdauer", true, 12);
    addGap(2);
    addLine(`Das Mietverhältnis beginnt am ${formatDate(form.mietbeginn)}.`);
    if (form.befristet && form.mietende) {
      addLine(`Das Mietverhältnis ist befristet bis zum ${formatDate(form.mietende)}.`);
    } else {
      addLine("Das Mietverhältnis wird auf unbestimmte Zeit geschlossen.");
    }
    addLine(`Die Kündigungsfrist beträgt ${form.kuendigungsfrist} zum Monatsende.`);
    addGap(6);

    // Miete
    addLine("§ 4 Miete", true, 12);
    addGap(2);
    addLine(`Kaltmiete: ${fmt(parseFloat(form.kaltmiete || "0"))} € monatlich`);
    addLine(`Betriebskostenvorauszahlung: ${fmt(parseFloat(form.nebenkosten || "0"))} € monatlich`);
    addLine(`Gesamtmiete (Warmmiete): ${fmt(warmmiete)} € monatlich`, true);
    addGap(2);
    addLine(`Die Miete ist bis zum ${form.zahlungTag}. eines jeden Monats im Voraus zu entrichten.`);
    if (form.bankIban) {
      addGap(2);
      addLine("Bankverbindung des Vermieters:");
      if (form.bankName) addLine(`Bank: ${form.bankName}`);
      addLine(`IBAN: ${form.bankIban}`);
      if (form.bankBic) addLine(`BIC: ${form.bankBic}`);
    }
    addGap(6);

    // Kaution
    addLine("§ 5 Kaution", true, 12);
    addGap(2);
    addLine(`Der Mieter zahlt eine Kaution in Höhe von ${fmt(parseFloat(form.kaution || "0"))} €.`);
    addLine("Die Kaution kann in drei gleichen monatlichen Raten gezahlt werden.");
    addLine("Die erste Rate ist bei Mietbeginn fällig.");
    addGap(6);

    // Sondervereinbarungen
    if (form.sondervereinbarungen) {
      addLine("§ 6 Sondervereinbarungen", true, 12);
      addGap(2);
      addLine(form.sondervereinbarungen);
      addGap(6);
    }

    // Schlussbestimmungen
    addLine(`§ ${form.sondervereinbarungen ? "7" : "6"} Schlussbestimmungen`, true, 12);
    addGap(2);
    addLine("Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform.");
    addLine("Sollte eine Bestimmung dieses Vertrages unwirksam sein, so wird die");
    addLine("Wirksamkeit der übrigen Bestimmungen davon nicht berührt.");
    addGap(12);

    // Unterschriften
    addLine(`${form.vermieterOrt}, den ${formatDate(form.erstelltAm)}`);
    addGap(12);
    doc.line(margin, y, margin + 65, y);
    doc.line(margin + 90, y, margin + pw, y);
    y += 5;
    addLine("Vermieter                                                                    Mieter");

    return doc;
  };

  const handleDownload = () => {
    const doc = generatePdf();
    doc.save(`Mietvertrag_${form.mieterName.replace(/\s+/g, "_")}.pdf`);
    toast({ title: "Mietvertrag als PDF heruntergeladen" });
  };

  const handleSaveToMieter = () => {
    if (!mieter) return;
    addMieterDokument(mieter.id, {
      name: `Mietvertrag ${form.wohneinheit} – ${formatDate(form.erstelltAm)}`,
      url: "",
      typ: "mietvertrag",
    });
    toast({ title: "Mietvertrag in Mieter-Dokumenten gespeichert" });
  };

  const handleSendToMieter = () => {
    handleDownload();
    if (mieter) handleSaveToMieter();
    toast({ title: `Mietvertrag an ${form.mieterName} gesendet`, description: "PDF wurde erstellt und in den Dokumenten hinterlegt." });
  };

  return (
    <DashboardLayout>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => navigate(mieter ? `/mieter/${mieter.id}` : "/mieter")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Zurück
      </Button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Mietvertrag erstellen</h1>
          <p className="text-sm text-muted-foreground">{form.mieterName ? `Für: ${form.mieterName}` : "Neuen Mietvertrag erstellen"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownload}><Download className="h-4 w-4 mr-2" /> PDF Download</Button>
          <Button onClick={handleSendToMieter}><Send className="h-4 w-4 mr-2" /> An Mieter senden</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* LEFT: Form */}
        <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
          {/* Vermieter */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Vermieter</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label className="text-xs">Name / Firma</Label><Input value={form.vermieterName} onChange={e => u("vermieterName", e.target.value)} className="h-8" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Adresse</Label><Input value={form.vermieterAdresse} onChange={e => u("vermieterAdresse", e.target.value)} className="h-8" /></div>
                <div><Label className="text-xs">PLZ / Ort</Label><Input value={form.vermieterOrt} onChange={e => u("vermieterOrt", e.target.value)} className="h-8" /></div>
              </div>
            </CardContent>
          </Card>

          {/* Mieter */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Mieter</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Anrede</Label>
                  <Select value={form.mieterAnrede} onValueChange={v => u("mieterAnrede", v)}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Herr">Herr</SelectItem><SelectItem value="Frau">Frau</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="col-span-2"><Label className="text-xs">Name</Label><Input value={form.mieterName} onChange={e => u("mieterName", e.target.value)} className="h-8" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Adresse</Label><Input value={form.mieterAdresse} onChange={e => u("mieterAdresse", e.target.value)} className="h-8" /></div>
                <div><Label className="text-xs">PLZ / Ort</Label><Input value={form.mieterOrt} onChange={e => u("mieterOrt", e.target.value)} className="h-8" /></div>
              </div>
              <div><Label className="text-xs">Geburtsdatum</Label><DateInput value={form.mieterGeburtsdatum} onChange={v => u("mieterGeburtsdatum", v)} className="h-8" /></div>
            </CardContent>
          </Card>

          {/* Mietobjekt */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Mietobjekt</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Objekt</Label><Input value={form.objektAdresse} onChange={e => u("objektAdresse", e.target.value)} className="h-8" /></div>
                <div><Label className="text-xs">PLZ / Ort</Label><Input value={form.objektOrt} onChange={e => u("objektOrt", e.target.value)} className="h-8" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">Wohneinheit</Label><Input value={form.wohneinheit} onChange={e => u("wohneinheit", e.target.value)} className="h-8" /></div>
                <div><Label className="text-xs">Etage</Label><Input value={form.etage} onChange={e => u("etage", e.target.value)} className="h-8" /></div>
                <div><Label className="text-xs">Zimmer</Label><Input value={form.zimmer} onChange={e => u("zimmer", e.target.value)} className="h-8" /></div>
              </div>
              <div><Label className="text-xs">Wohnfläche (m²)</Label><Input value={form.wohnflaeche} onChange={e => u("wohnflaeche", e.target.value)} className="h-8" /></div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2"><Switch checked={form.stellplatz} onCheckedChange={v => u("stellplatz", v)} /><Label className="text-xs">Stellplatz</Label></div>
                {form.stellplatz && <Input value={form.stellplatzNr} onChange={e => u("stellplatzNr", e.target.value)} placeholder="Nr." className="h-8 w-24" />}
                <div className="flex items-center gap-2"><Switch checked={form.keller} onCheckedChange={v => u("keller", v)} /><Label className="text-xs">Keller</Label></div>
                {form.keller && <Input value={form.kellerNr} onChange={e => u("kellerNr", e.target.value)} placeholder="Nr." className="h-8 w-24" />}
              </div>
            </CardContent>
          </Card>

          {/* Mietdauer */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Mietdauer & Kündigung</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Mietbeginn</Label><DateInput value={form.mietbeginn} onChange={v => u("mietbeginn", v)} className="h-8" /></div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.befristet} onCheckedChange={v => u("befristet", v)} />
                  <Label className="text-xs">Befristet</Label>
                </div>
              </div>
              {form.befristet && <div><Label className="text-xs">Mietende</Label><DateInput value={form.mietende} onChange={v => u("mietende", v)} className="h-8" /></div>}
              <div><Label className="text-xs">Kündigungsfrist</Label><Input value={form.kuendigungsfrist} onChange={e => u("kuendigungsfrist", e.target.value)} className="h-8" /></div>
            </CardContent>
          </Card>

          {/* Miete & Kaution */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Miete & Kaution</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">Kaltmiete (€)</Label><Input type="number" value={form.kaltmiete} onChange={e => u("kaltmiete", e.target.value)} className="h-8" /></div>
                <div><Label className="text-xs">Nebenkosten (€)</Label><Input type="number" value={form.nebenkosten} onChange={e => u("nebenkosten", e.target.value)} className="h-8" /></div>
                <div><Label className="text-xs">Warmmiete</Label><div className="h-8 flex items-center text-sm font-bold text-primary">{fmt(warmmiete)} €</div></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Kaution (€)</Label><Input type="number" value={form.kaution} onChange={e => u("kaution", e.target.value)} className="h-8" /></div>
                <div><Label className="text-xs">Zahlung bis zum (Tag)</Label><Input type="number" value={form.zahlungTag} onChange={e => u("zahlungTag", e.target.value)} className="h-8" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">Bank</Label><Input value={form.bankName} onChange={e => u("bankName", e.target.value)} className="h-8" /></div>
                <div><Label className="text-xs">IBAN</Label><Input value={form.bankIban} onChange={e => u("bankIban", e.target.value)} className="h-8" /></div>
                <div><Label className="text-xs">BIC</Label><Input value={form.bankBic} onChange={e => u("bankBic", e.target.value)} className="h-8" /></div>
              </div>
            </CardContent>
          </Card>

          {/* Sonder */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Sondervereinbarungen</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={form.sondervereinbarungen} onChange={e => u("sondervereinbarungen", e.target.value)} rows={4} placeholder="Optionale Sondervereinbarungen..." />
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Preview */}
        <div className="sticky top-4">
          <Card className="max-h-[calc(100vh-200px)] overflow-y-auto">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Vertragsvorschau</CardTitle>
            </CardHeader>
            <CardContent>
              <div ref={previewRef} className="bg-white text-black p-8 rounded border text-sm leading-relaxed font-serif space-y-5" style={{ minHeight: 600 }}>
                <h1 className="text-xl font-bold text-center mb-6 tracking-wide">MIETVERTRAG</h1>
                <p className="text-center text-xs text-gray-500 mb-8">für Wohnraum nach §§ 535 ff. BGB</p>

                <div>
                  <h2 className="font-bold text-sm mb-2">§ 1 Vertragsparteien</h2>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="font-semibold">Vermieter:</p>
                      <p>{form.vermieterName}</p>
                      <p>{form.vermieterAdresse}</p>
                      <p>{form.vermieterOrt}</p>
                    </div>
                    <div>
                      <p className="font-semibold">Mieter:</p>
                      <p>{form.mieterAnrede} {form.mieterName}</p>
                      {form.mieterAdresse && <p>{form.mieterAdresse}</p>}
                      {form.mieterOrt && <p>{form.mieterOrt}</p>}
                      {form.mieterGeburtsdatum && <p>geb. am {formatDate(form.mieterGeburtsdatum)}</p>}
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="font-bold text-sm mb-2">§ 2 Mietobjekt</h2>
                  <div className="text-xs space-y-1">
                    <p><strong>Objekt:</strong> {form.objektAdresse}{form.objektOrt ? `, ${form.objektOrt}` : ""}</p>
                    <p><strong>Wohneinheit:</strong> {form.wohneinheit}{form.etage ? `, ${form.etage}` : ""}</p>
                    {form.wohnflaeche && <p><strong>Wohnfläche:</strong> ca. {form.wohnflaeche} m²</p>}
                    {form.zimmer && <p><strong>Zimmer:</strong> {form.zimmer}</p>}
                    {form.stellplatz && <p><strong>Stellplatz:</strong> Nr. {form.stellplatzNr || "–"}</p>}
                    {form.keller && <p><strong>Keller:</strong> Nr. {form.kellerNr || "–"}</p>}
                  </div>
                </div>

                <div>
                  <h2 className="font-bold text-sm mb-2">§ 3 Mietdauer</h2>
                  <div className="text-xs space-y-1">
                    <p>Das Mietverhältnis beginnt am <strong>{formatDate(form.mietbeginn)}</strong>.</p>
                    {form.befristet && form.mietende ? (
                      <p>Das Mietverhältnis ist befristet bis zum <strong>{formatDate(form.mietende)}</strong>.</p>
                    ) : (
                      <p>Das Mietverhältnis wird auf unbestimmte Zeit geschlossen.</p>
                    )}
                    <p>Die Kündigungsfrist beträgt {form.kuendigungsfrist} zum Monatsende.</p>
                  </div>
                </div>

                <div>
                  <h2 className="font-bold text-sm mb-2">§ 4 Miete</h2>
                  <div className="text-xs space-y-1">
                    <div className="grid grid-cols-2 gap-1">
                      <span>Kaltmiete:</span><span className="text-right">{fmt(parseFloat(form.kaltmiete || "0"))} €</span>
                      <span>Betriebskostenvorauszahlung:</span><span className="text-right">{fmt(parseFloat(form.nebenkosten || "0"))} €</span>
                      <span className="font-bold border-t pt-1">Warmmiete:</span><span className="text-right font-bold border-t pt-1">{fmt(warmmiete)} €</span>
                    </div>
                    <p className="mt-2">Die Miete ist bis zum {form.zahlungTag}. eines jeden Monats im Voraus zu entrichten.</p>
                    {form.bankIban && (
                      <div className="mt-2 p-2 bg-gray-50 rounded">
                        <p className="font-semibold">Bankverbindung:</p>
                        {form.bankName && <p>Bank: {form.bankName}</p>}
                        <p>IBAN: {form.bankIban}</p>
                        {form.bankBic && <p>BIC: {form.bankBic}</p>}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h2 className="font-bold text-sm mb-2">§ 5 Kaution</h2>
                  <p className="text-xs">Der Mieter zahlt eine Kaution in Höhe von <strong>{fmt(parseFloat(form.kaution || "0"))} €</strong>. Die Kaution kann in drei gleichen monatlichen Raten gezahlt werden. Die erste Rate ist bei Mietbeginn fällig.</p>
                </div>

                {form.sondervereinbarungen && (
                  <div>
                    <h2 className="font-bold text-sm mb-2">§ 6 Sondervereinbarungen</h2>
                    <p className="text-xs whitespace-pre-wrap">{form.sondervereinbarungen}</p>
                  </div>
                )}

                <div className="mt-8 pt-6 border-t">
                  <p className="text-xs mb-10">{form.vermieterOrt}, den {formatDate(form.erstelltAm)}</p>
                  <div className="grid grid-cols-2 gap-12 text-xs">
                    <div>
                      <div className="border-b border-black mb-1 h-8" />
                      <p>Vermieter</p>
                    </div>
                    <div>
                      <div className="border-b border-black mb-1 h-8" />
                      <p>Mieter</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
