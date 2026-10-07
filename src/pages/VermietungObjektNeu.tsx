import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addVermietung } from "@/lib/vermietungStore";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Wohneinheit {
  name: string;
  kaltmiete: number;
  flaeche: number;
  zimmer: number;
}

export default function VermietungObjektNeu() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    objektName: "",
    strasse: "",
    plz: "",
    ort: "",
    baujahr: "",
    gesamtFlaeche: "",
    anzahlWohnungen: "",
    notizen: "",
  });
  const [wohneinheiten, setWohneinheiten] = useState<Wohneinheit[]>([
    { name: "WHG 1", kaltmiete: 0, flaeche: 0, zimmer: 2 },
  ]);

  const addWE = () => {
    setWohneinheiten(w => [...w, { name: `WHG ${w.length + 1}`, kaltmiete: 0, flaeche: 0, zimmer: 2 }]);
  };

  const removeWE = (i: number) => {
    setWohneinheiten(w => w.filter((_, idx) => idx !== i));
  };

  const updateWE = (i: number, field: keyof Wohneinheit, value: string | number) => {
    setWohneinheiten(w => w.map((we, idx) => idx === i ? { ...we, [field]: value } : we));
  };

  const handleSave = () => {
    if (!form.objektName) { toast({ title: "Bitte Objektname eingeben" }); return; }
    if (wohneinheiten.length === 0) { toast({ title: "Bitte mindestens eine Wohneinheit anlegen" }); return; }

    const objektId = `hvobj-${Date.now()}`;
    
    wohneinheiten.forEach((we, i) => {
      addVermietung({
        objektId,
        wohneinheitId: `we-${i + 1}`,
        objektName: form.objektName,
        wohneinheitName: we.name || `WHG ${i + 1}`,
        stufe: "leerstehend",
        interessenten: [],
        ausgewaehlterMieterId: "",
        uebergabeDatum: "",
        uebergabeProtokollUrl: "",
        mietvertragUrl: "",
        inseratUrl: "",
        kaltmiete: we.kaltmiete,
      });
    });

    toast({ title: `Objekt "${form.objektName}" mit ${wohneinheiten.length} Einheit(en) angelegt` });
    navigate("/vermietung");
  };

  return (
    <DashboardLayout>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2" onClick={() => navigate("/vermietung")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Zurück zur Vermietung
      </Button>

      <PageHeader title="Neues Vermietungsobjekt" subtitle="Objekt und Wohneinheiten für die Vermietung anlegen" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Objektdaten</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Objektname *</Label><Input value={form.objektName} onChange={e => setForm(f => ({ ...f, objektName: e.target.value }))} placeholder="z.B. Memmingen Südring 14" /></div>
            <div><Label>Straße</Label><Input value={form.strasse} onChange={e => setForm(f => ({ ...f, strasse: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>PLZ</Label><Input value={form.plz} onChange={e => setForm(f => ({ ...f, plz: e.target.value }))} /></div>
              <div className="col-span-2"><Label>Ort</Label><Input value={form.ort} onChange={e => setForm(f => ({ ...f, ort: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Baujahr</Label><Input value={form.baujahr} onChange={e => setForm(f => ({ ...f, baujahr: e.target.value }))} /></div>
              <div><Label>Gesamtfläche (m²)</Label><Input value={form.gesamtFlaeche} onChange={e => setForm(f => ({ ...f, gesamtFlaeche: e.target.value }))} /></div>
            </div>
            <div><Label>Notizen</Label><Textarea value={form.notizen} onChange={e => setForm(f => ({ ...f, notizen: e.target.value }))} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Wohneinheiten ({wohneinheiten.length})</CardTitle>
              <Button size="sm" variant="outline" onClick={addWE}><Plus className="h-4 w-4 mr-1" /> Einheit</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {wohneinheiten.map((we, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Einheit {i + 1}</span>
                  {wohneinheiten.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => removeWE(i)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Bezeichnung</Label><Input value={we.name} onChange={e => updateWE(i, "name", e.target.value)} className="h-8 text-sm" /></div>
                  <div><Label className="text-xs">Kaltmiete (€)</Label><Input type="number" value={we.kaltmiete} onChange={e => updateWE(i, "kaltmiete", +e.target.value)} className="h-8 text-sm" /></div>
                  <div><Label className="text-xs">Fläche (m²)</Label><Input type="number" value={we.flaeche} onChange={e => updateWE(i, "flaeche", +e.target.value)} className="h-8 text-sm" /></div>
                  <div><Label className="text-xs">Zimmer</Label><Input type="number" value={we.zimmer} onChange={e => updateWE(i, "zimmer", +e.target.value)} className="h-8 text-sm" /></div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end mt-6 gap-3">
        <Button variant="outline" onClick={() => navigate("/vermietung")}>Abbrechen</Button>
        <Button onClick={handleSave}>Objekt & Einheiten anlegen</Button>
      </div>
    </DashboardLayout>
  );
}
