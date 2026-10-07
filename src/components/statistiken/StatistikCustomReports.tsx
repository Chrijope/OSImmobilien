import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download, Save, Trash2 } from "lucide-react";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { cacheGet } from "@/lib/dataCache";
import { useToast } from "@/hooks/use-toast";
import { PIPELINE_STUFEN } from "@/lib/kontaktPipeline";
import { stufenFilterLabel } from "@/lib/pipelineStufen";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface ReportDef {
  id: string;
  name: string;
  columns?: string[];
  filters: {
    pipelineStufe?: string;
    quelle?: string;
    berater?: string;
    fromDate?: string;
    toDate?: string;
  };
}

const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "email", label: "E-Mail" },
  { key: "telefon", label: "Telefon" },
  { key: "berater", label: "Vertriebspartner" },
  { key: "quelle", label: "Quelle" },
  { key: "stufe", label: "Stufe" },
  { key: "erstellt", label: "Erstellt" },
] as const;

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (raw: string) => {
    const v = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${(v ?? "").replace(/"/g, '""')}"`;
  };
  const csv = [
    headers.map(escape).join(","),
    ...rows.map((r) => r.map(escape).join(",")),
  ].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function StatistikCustomReports({ kontakte }: { kontakte: any[] }) {
  const { toast } = useToast();
  const [reports, setReports] = useState<ReportDef[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pipelineStufe, setPipelineStufe] = useState<string>("alle");
  const [quelle, setQuelle] = useState<string>("alle");
  const [berater, setBerater] = useState<string>("alle");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedCols, setSelectedCols] = useState<string[]>([
    "name",
    "email",
    "berater",
    "quelle",
    "stufe",
  ]);

  useEffect(() => {
    const stored = getUserSetting<ReportDef[]>("custom_reports", []);
    setReports(stored || []);
  }, []);

  const quellen = useMemo(() => {
    const set = new Set<string>();
    kontakte.forEach((k) => set.add((k.quelle || "Unbekannt").toString()));
    return Array.from(set).sort();
  }, [kontakte]);

  const berater_liste = useMemo(() => {
    return [...new Set(kontakte.map((k) => k.berater).filter(Boolean))].sort();
  }, [kontakte]);

  const filtered = useMemo(() => {
    return kontakte.filter((k) => {
      if (
        pipelineStufe !== "alle" &&
        (k.meta?.pipelineStufe || "neuer_lead") !== pipelineStufe
      )
        return false;
      if (quelle !== "alle" && (k.quelle || "Unbekannt") !== quelle)
        return false;
      if (berater !== "alle" && k.berater !== berater) return false;
      if (fromDate && k.erstellt_am && k.erstellt_am.slice(0, 10) < fromDate)
        return false;
      if (toDate && k.erstellt_am && k.erstellt_am.slice(0, 10) > toDate)
        return false;
      return true;
    });
  }, [kontakte, pipelineStufe, quelle, berater, fromDate, toDate]);

  const cellValue = (k: any, col: string): string => {
    switch (col) {
      case "name":
        return `${k.vorname || ""} ${k.nachname || ""}`.trim();
      case "email":
        return k.email || "";
      case "telefon":
        return k.telefon || "";
      case "berater":
        return k.berater || "";
      case "quelle":
        return k.quelle || "";
      case "stufe":
        return k.meta?.pipelineStufe || "";
      case "erstellt":
        return k.erstellt_am
          ? new Date(k.erstellt_am).toLocaleDateString("de-DE")
          : "";
      default:
        return "";
    }
  };

  const saveReport = async () => {
    if (!name.trim()) {
      toast({ title: "Bitte Namen vergeben", variant: "destructive" });
      return;
    }
    const def: ReportDef = {
      id: activeId || crypto.randomUUID(),
      name: name.trim(),
      columns: selectedCols,
      filters: { pipelineStufe, quelle, berater, fromDate, toDate },
    };
    const next = activeId
      ? reports.map((r) => (r.id === activeId ? def : r))
      : [...reports, def];
    setReports(next);
    setActiveId(def.id);
    try {
      await setUserSetting("custom_reports", next);
      toast({ title: "Bericht gespeichert", description: def.name });
    } catch (e: any) {
      toast({
        title: "Speichern fehlgeschlagen",
        description: e?.message || "Unbekannt",
        variant: "destructive",
      });
    }
  };

  const loadReport = (id: string) => {
    const r = reports.find((x) => x.id === id);
    if (!r) return;
    setActiveId(r.id);
    setName(r.name);
    const columns = r.columns?.filter((key) =>
      COLUMNS.some((c) => c.key === key),
    );
    if (columns?.length) setSelectedCols(columns);
    setPipelineStufe(r.filters.pipelineStufe || "alle");
    setQuelle(r.filters.quelle || "alle");
    setBerater(r.filters.berater || "alle");
    setFromDate(r.filters.fromDate || "");
    setToDate(r.filters.toDate || "");
  };

  const deleteReport = async (id: string) => {
    const next = reports.filter((r) => r.id !== id);
    setReports(next);
    if (activeId === id) {
      setActiveId(null);
      setName("");
    }
    await setUserSetting("custom_reports", next);
  };

  const exportCsv = () => {
    const cols = COLUMNS.filter((c) => selectedCols.includes(c.key));
    downloadCsv(
      `${(name || "report").replace(/[^a-z0-9-_]/gi, "_")}.csv`,
      cols.map((c) => c.label),
      filtered.map((k) => cols.map((c) => cellValue(k, c.key))),
    );
  };

  const toggleCol = (key: string) => {
    setSelectedCols((prev) =>
      prev.includes(key)
        ? prev.length > 1
          ? prev.filter((c) => c !== key)
          : prev
        : [...prev, key],
    );
  };

  return (
    <div className="space-y-6">
      {reports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gespeicherte Berichte</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center gap-2 border rounded-md px-3 py-1.5 ${activeId === r.id ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <button
                    className="text-sm font-medium"
                    onClick={() => loadReport(r.id)}
                  >
                    {r.name}
                  </button>
                  <button
                    aria-label={`Bericht ${r.name} entfernen`}
                    onClick={() => deleteReport(r.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Report-Builder{" "}
            <InfoTooltip text="Stelle dir eigene Auswertungen aus den Lead-Daten zusammen: Filter nach Pipeline-Stufe, Quelle, Berater und Zeitraum kombinieren, gewünschte Spalten wählen und als CSV exportieren oder unter einem Namen speichern. Gespeicherte Berichte lassen sich oben jederzeit erneut laden." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Berichtsname</Label>
              <Input
                aria-label="Berichtsname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Hot Leads München"
              />
            </div>
            <div>
              <Label>Pipeline-Stufe</Label>
              <Select value={pipelineStufe} onValueChange={setPipelineStufe}>
                <SelectTrigger aria-label="Pipeline-Stufe">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Stufen</SelectItem>
                  {PIPELINE_STUFEN.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {stufenFilterLabel(s.key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quelle</Label>
              <Select value={quelle} onValueChange={setQuelle}>
                <SelectTrigger aria-label="Quelle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Quellen</SelectItem>
                  {quellen.map((q) => (
                    <SelectItem key={q} value={q}>
                      {q}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vertriebspartner</Label>
              <Select value={berater} onValueChange={setBerater}>
                <SelectTrigger aria-label="Vertriebspartner">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Vertriebspartner</SelectItem>
                  {berater_liste.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Erstellt von</Label>
              <Input
                aria-label="Erstellt von"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Erstellt bis</Label>
              <Input
                aria-label="Erstellt bis"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="mb-2 block inline-flex items-center gap-1">
              Spalten{" "}
              <InfoTooltip text="Klick auf einen Badge schaltet die Spalte für Vorschau und CSV-Export an/aus. Mindestens eine Spalte auswählen." />
            </Label>
            <div className="flex flex-wrap gap-2">
              {COLUMNS.map((c) => (
                <Button
                  type="button"
                  size="sm"
                  key={c.key}
                  variant={selectedCols.includes(c.key) ? "default" : "outline"}
                  aria-pressed={selectedCols.includes(c.key)}
                  onClick={() => toggleCol(c.key)}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={saveReport}>
              <Save className="h-4 w-4 mr-2" />
              {activeId ? "Aktualisieren" : "Speichern"}
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-2" />
              CSV-Export
            </Button>
            <Badge variant="outline" className="ml-auto self-center">
              {filtered.length} Datensätze
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vorschau (max. 50)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground text-xs">
                  {COLUMNS.filter((c) => selectedCols.includes(c.key)).map(
                    (c) => (
                      <th key={c.key} className="py-2 px-2">
                        {c.label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map((k) => (
                  <tr key={k.id} className="border-b border-border">
                    {COLUMNS.filter((c) => selectedCols.includes(c.key)).map(
                      (c) => (
                        <td key={c.key} className="py-2 px-2">
                          {cellValue(k, c.key)}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={selectedCols.length}
                      className="text-center text-muted-foreground py-6"
                    >
                      Keine Daten für diese Filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
