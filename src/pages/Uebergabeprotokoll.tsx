import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Plus, Trash2 } from "lucide-react";
import { getMieter } from "@/lib/mieterStore";
import { generateUebergabeProtokollPDF, getDefaultProtokollData, type UebergabeProtokollData } from "@/lib/uebergabeprotokollPdf";
import { toast } from "@/hooks/use-toast";

export default function Uebergabeprotokoll() {
  const mieter = getMieter();
  const [mieterId, setMieterId] = useState("");
  const [typ, setTyp] = useState<"einzug" | "auszug">("einzug");
  const [data, setData] = useState<UebergabeProtokollData | null>(null);

  const handleMieterSelect = (id: string) => {
    setMieterId(id);
    const m = mieter.find(mi => mi.id === id);
    if (m) setData(getDefaultProtokollData(m, typ));
  };

  const handleTypChange = (t: "einzug" | "auszug") => {
    setTyp(t);
    const m = mieter.find(mi => mi.id === mieterId);
    if (m) setData(getDefaultProtokollData(m, t));
  };

  const handleExport = async () => {
    if (!data) { toast({ title: "Bitte Mieter wählen", variant: "destructive" }); return; }
    const doc = await generateUebergabeProtokollPDF(data);
    doc.save(`Uebergabeprotokoll_${data.mieter.nachname}.pdf`);
    toast({ title: "Übergabeprotokoll als PDF exportiert" });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Übergabeprotokoll" subtitle="Einzugs- & Auszugs-Dokumentation mit Raumzustand, Zählerständen & Schlüsseln" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Grunddaten</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Mieter</Label>
                <Select value={mieterId} onValueChange={handleMieterSelect}>
                  <SelectTrigger><SelectValue placeholder="Mieter wählen" /></SelectTrigger>
                  <SelectContent>{mieter.map(m => <SelectItem key={m.id} value={m.id}>{m.vorname} {m.nachname}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Typ</Label>
                  <Select value={typ} onValueChange={v => handleTypChange(v as "einzug" | "auszug")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="einzug">Einzug</SelectItem>
                      <SelectItem value="auszug">Auszug</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Datum</Label><DateInput value={data?.datum || ""} onChange={v => data && setData({ ...data, datum: v })} /></div>
              </div>
            </CardContent>
          </Card>

          {data && (
            <Card>
              <CardHeader><CardTitle>Zählerstände</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.zaehlerstaende.map((z, i) => (
                  <div key={i} className="grid grid-cols-4 gap-2 items-center">
                    <span className="text-sm font-medium">{z.typ}</span>
                    <Input placeholder="Nr." value={z.zaehlerNr} onChange={e => { const nz = [...data.zaehlerstaende]; nz[i] = { ...nz[i], zaehlerNr: e.target.value }; setData({ ...data, zaehlerstaende: nz }); }} />
                    <Input placeholder="Alt" value={z.standAlt} onChange={e => { const nz = [...data.zaehlerstaende]; nz[i] = { ...nz[i], standAlt: e.target.value }; setData({ ...data, zaehlerstaende: nz }); }} />
                    <Input placeholder="Neu" value={z.standNeu} onChange={e => { const nz = [...data.zaehlerstaende]; nz[i] = { ...nz[i], standNeu: e.target.value }; setData({ ...data, zaehlerstaende: nz }); }} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {data && (
            <>
              <Card>
                <CardHeader><CardTitle>Raumzustand</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {data.raeume.map((r, i) => (
                    <div key={i} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{r.raum}</span>
                        <Select value={r.zustand} onValueChange={v => { const nr = [...data.raeume]; nr[i] = { ...nr[i], zustand: v as any }; setData({ ...data, raeume: nr }); }}>
                          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gut">✓ Gut</SelectItem>
                            <SelectItem value="normal">○ Normal</SelectItem>
                            <SelectItem value="maengel">✗ Mängel</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Input value={r.maengel} onChange={e => { const nr = [...data.raeume]; nr[i] = { ...nr[i], maengel: e.target.value }; setData({ ...data, raeume: nr }); }} placeholder="Mängel beschreiben" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div><Label>Allgemeinzustand</Label><Textarea value={data.allgemeinzustand} onChange={e => setData({ ...data, allgemeinzustand: e.target.value })} rows={2} /></div>
                  <div><Label>Vereinbarungen</Label><Textarea value={data.vereinbarungen} onChange={e => setData({ ...data, vereinbarungen: e.target.value })} rows={2} /></div>
                  <Button onClick={handleExport} className="w-full"><Download className="h-4 w-4 mr-2" />Protokoll als PDF exportieren</Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
