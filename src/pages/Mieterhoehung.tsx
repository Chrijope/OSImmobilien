import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, Download } from "lucide-react";
import { getMieter } from "@/lib/mieterStore";
import type { MieterhoehungData } from "@/lib/mieterhoehungPdf";
import { toast } from "@/hooks/use-toast";

export default function Mieterhoehung() {
  const mieter = getMieter();
  const [form, setForm] = useState({
    mieterId: "",
    aktuelleKaltmiete: "",
    neueKaltmiete: "",
    begruendung: "mietspiegel" as MieterhoehungData["begruendung"],
    wirksamAb: "",
  });

  const handleExport = async () => {
    const m = mieter.find(mi => mi.id === form.mieterId);
    if (!m || !form.aktuelleKaltmiete || !form.neueKaltmiete) {
      toast({ title: "Bitte alle Pflichtfelder ausfüllen", variant: "destructive" });
      return;
    }
    const { generateMieterhoehungPDF } = await import("@/lib/mieterhoehungPdf");
    const doc = generateMieterhoehungPDF({
      mieter: m,
      alteMiete: Number(form.aktuelleKaltmiete),
      neueMiete: Number(form.neueKaltmiete),
      erhoehungAb: form.wirksamAb || new Date().toISOString().slice(0, 10),
      begruendung: form.begruendung,
      absenderFirma: "MOREImmo",
      absenderAdresse: "Musterstraße 1, 80000 München",
    });
    doc.save(`Mieterhoehung_${m.nachname}.pdf`);
    toast({ title: "Mieterhöhungsschreiben als PDF exportiert" });
  };

  const diff = Number(form.neueKaltmiete) - Number(form.aktuelleKaltmiete);
  const pct = Number(form.aktuelleKaltmiete) > 0 ? ((diff / Number(form.aktuelleKaltmiete)) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <PageHeader title="Mieterhöhung" subtitle="Mietanpassungen nach §558 BGB – Mietspiegel, Index & Modernisierung" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />Mieterhöhung berechnen</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Mieter</Label>
              <Select value={form.mieterId} onValueChange={v => setForm(f => ({ ...f, mieterId: v }))}>
                <SelectTrigger><SelectValue placeholder="Mieter wählen" /></SelectTrigger>
                <SelectContent>{mieter.map(m => <SelectItem key={m.id} value={m.id}>{m.vorname} {m.nachname}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Erhöhungsart</Label>
              <Select value={form.begruendung} onValueChange={v => setForm(f => ({ ...f, begruendung: v as MieterhoehungData["begruendung"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mietspiegel">Mietspiegel (§558 BGB)</SelectItem>
                  <SelectItem value="index">Indexmiete (§557b BGB)</SelectItem>
                  <SelectItem value="modernisierung">Modernisierung (§559 BGB)</SelectItem>
                  <SelectItem value="staffel">Staffelmiete</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Aktuelle Kaltmiete (€)</Label><Input type="number" value={form.aktuelleKaltmiete} onChange={e => setForm(f => ({ ...f, aktuelleKaltmiete: e.target.value }))} /></div>
              <div><Label>Neue Kaltmiete (€)</Label><Input type="number" value={form.neueKaltmiete} onChange={e => setForm(f => ({ ...f, neueKaltmiete: e.target.value }))} /></div>
            </div>
            <div><Label>Wirksam ab</Label><DateInput value={form.wirksamAb} onChange={v => setForm(f => ({ ...f, wirksamAb: v }))} /></div>
            <Button onClick={handleExport} className="w-full"><Download className="h-4 w-4 mr-2" />PDF exportieren</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Vorschau</CardTitle></CardHeader>
          <CardContent>
            {form.mieterId && form.aktuelleKaltmiete && form.neueKaltmiete ? (
              <div className="space-y-4 text-sm">
                <div className="p-4 rounded-lg bg-muted">
                  <p className="font-bold text-lg">Erhöhung: {diff > 0 ? "+" : ""}{diff.toFixed(2)} € ({pct}%)</p>
                  <p className="text-muted-foreground mt-1">
                    {form.begruendung === "mietspiegel" && "Anpassung an ortsübliche Vergleichsmiete. Max. 20% in 3 Jahren (Kappungsgrenze)."}
                    {form.begruendung === "index" && "Anpassung gemäß Verbraucherpreisindex nach §557b BGB."}
                    {form.begruendung === "modernisierung" && "Umlegung von Modernisierungskosten nach §559 BGB. Max. 8% p.a."}
                    {form.begruendung === "staffel" && "Vereinbarte Staffelerhöhung gemäß Mietvertrag."}
                  </p>
                </div>
                <div className="border rounded-lg p-4 space-y-2">
                  <p><span className="text-muted-foreground">Mieter:</span> {mieter.find(m => m.id === form.mieterId)?.vorname} {mieter.find(m => m.id === form.mieterId)?.nachname}</p>
                  <p><span className="text-muted-foreground">Alte Miete:</span> {Number(form.aktuelleKaltmiete).toLocaleString("de-DE")} €</p>
                  <p><span className="text-muted-foreground">Neue Miete:</span> {Number(form.neueKaltmiete).toLocaleString("de-DE")} €</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-12">Bitte Daten eingeben für die Vorschau.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
