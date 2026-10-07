import { useState, useMemo } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, Calculator, FileText, AlertTriangle, Download } from "lucide-react";
import { getBKAs, berechneBKA, generateBKAPDF, type Betriebskostenabrechnung, type BKAErgebnis } from "@/lib/betriebskostenStore";
import { toast } from "@/hooks/use-toast";

export default function BetriebskostenabrechnungPage() {
  const liveVersion = useLiveVersion(["betriebskosten"]);
  const bkas = useMemo(() => getBKAs(), [liveVersion]);
  const [selectedId, setSelectedId] = useState<string>("");

  const selectedBKA = bkas.find(b => b.id === selectedId);
  const ergebnisse = selectedBKA ? berechneBKA(selectedBKA) : [];

  const statusColor: Record<Betriebskostenabrechnung["status"], string> = {
    entwurf: "bg-muted text-muted-foreground",
    erstellt: "bg-blue-100 text-blue-800",
    versendet: "bg-green-100 text-green-800",
  };

  const handleExportPdf = (erg: BKAErgebnis) => {
    if (!selectedBKA) return;
    const doc = generateBKAPDF(selectedBKA, erg, "OS Immobilien", "Am Ostbahnhof 1, 15749 Mittenwalde");
    doc.save(`BKA_${selectedBKA.abrechnungsJahr}_${erg.mieterName.replace(/\s/g, "_")}.pdf`);
    toast({ title: "BKA als PDF exportiert", description: `Für ${erg.mieterName}` });
  };

  const handleExportAll = () => {
    if (!selectedBKA || ergebnisse.length === 0) return;
    ergebnisse.forEach(erg => {
      const doc = generateBKAPDF(selectedBKA, erg, "OS Immobilien", "Am Ostbahnhof 1, 15749 Mittenwalde");
      doc.save(`BKA_${selectedBKA.abrechnungsJahr}_${erg.mieterName.replace(/\s/g, "_")}.pdf`);
    });
    toast({ title: `${ergebnisse.length} BKA-PDFs exportiert` });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Betriebskostenabrechnung" subtitle="BKA nach §2 BetrKV – Verteilerschlüssel, Kostenarten & Abrechnung" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 text-center"><Receipt className="h-8 w-8 mx-auto mb-2 text-primary" /><p className="text-2xl font-bold">{bkas.length}</p><p className="text-sm text-muted-foreground">Abrechnungen</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><Calculator className="h-8 w-8 mx-auto mb-2 text-orange-500" /><p className="text-2xl font-bold">{bkas.filter(b => b.status === "entwurf").length}</p><p className="text-sm text-muted-foreground">Entwürfe</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><FileText className="h-8 w-8 mx-auto mb-2 text-blue-500" /><p className="text-2xl font-bold">{bkas.filter(b => b.status === "erstellt").length}</p><p className="text-sm text-muted-foreground">Erstellt</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><AlertTriangle className="h-8 w-8 mx-auto mb-2 text-green-500" /><p className="text-2xl font-bold">{bkas.filter(b => b.status === "versendet").length}</p><p className="text-sm text-muted-foreground">Versendet</p></CardContent></Card>
      </div>

      {/* BKA Selector + Detail */}
      {bkas.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle>BKA auswählen & exportieren</CardTitle>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="w-80"><SelectValue placeholder="Abrechnung wählen" /></SelectTrigger>
                <SelectContent>
                  {bkas.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.objektName} – {b.abrechnungsJahr} ({b.zeitraumVon} bis {b.zeitraumBis})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {selectedBKA ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="bg-muted rounded-lg p-3"><p className="text-muted-foreground text-xs">Objekt</p><p className="font-medium">{selectedBKA.objektName}</p></div>
                  <div className="bg-muted rounded-lg p-3"><p className="text-muted-foreground text-xs">Zeitraum</p><p className="font-medium">{selectedBKA.zeitraumVon} – {selectedBKA.zeitraumBis}</p></div>
                  <div className="bg-muted rounded-lg p-3"><p className="text-muted-foreground text-xs">Kostenarten</p><p className="font-medium">{selectedBKA.kostenarten.length}</p></div>
                  <div className="bg-muted rounded-lg p-3"><p className="text-muted-foreground text-xs">Einheiten</p><p className="font-medium">{selectedBKA.einheiten.length}</p></div>
                </div>

                {/* Kostenarten */}
                <div>
                  <h4 className="text-sm font-semibold mb-2">Kostenarten</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left"><th className="pb-2">Kostenart</th><th className="pb-2">Schlüssel</th><th className="pb-2 text-right">Betrag</th></tr></thead>
                      <tbody>
                        {selectedBKA.kostenarten.map(k => (
                          <tr key={k.id} className="border-b border-border/50">
                            <td className="py-1.5">{k.bezeichnung}</td>
                            <td className="py-1.5"><Badge variant="outline" className="text-[10px]">{k.verteilerschluessel}</Badge></td>
                            <td className="py-1.5 text-right font-medium">{k.betrag.toLocaleString("de-DE")} €</td>
                          </tr>
                        ))}
                        <tr className="font-bold"><td className="py-2">Gesamt</td><td></td><td className="py-2 text-right">{selectedBKA.kostenarten.reduce((s, k) => s + k.betrag, 0).toLocaleString("de-DE")} €</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Ergebnisse pro Mieter */}
                {ergebnisse.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold">Ergebnis pro Mieter</h4>
                      <Button size="sm" variant="outline" onClick={handleExportAll}><Download className="h-3.5 w-3.5 mr-1" />Alle PDFs exportieren</Button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b text-left"><th className="pb-2">Mieter</th><th className="pb-2">Einheit</th><th className="pb-2 text-right">Kosten</th><th className="pb-2 text-right">Vorauszahlung</th><th className="pb-2 text-right">Ergebnis</th><th className="pb-2 text-right">Export</th></tr></thead>
                        <tbody>
                          {ergebnisse.map(e => (
                            <tr key={e.mieterId} className="border-b border-border/50">
                              <td className="py-2 font-medium">{e.mieterName}</td>
                              <td className="py-2 text-muted-foreground">{e.wohneinheitName}</td>
                              <td className="py-2 text-right">{e.kostenGesamt.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</td>
                              <td className="py-2 text-right">{e.vorauszahlungen.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</td>
                              <td className={`py-2 text-right font-bold ${e.nachzahlung > 0 ? "text-red-600" : "text-green-600"}`}>
                                {e.nachzahlung > 0 ? "+" : ""}{e.nachzahlung.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                              </td>
                              <td className="py-2 text-right">
                                <Button size="sm" variant="ghost" className="h-7" onClick={() => handleExportPdf(e)}>
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-6">Wähle eine Abrechnung aus, um Details und Exportoptionen zu sehen.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Fallback if no BKAs */}
      {bkas.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Noch keine Betriebskostenabrechnungen erstellt.</p>
            <p className="text-sm mt-2">BKA werden pro Objekt erstellt und hier zusammengefasst.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
