import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Upload, ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { addKontakt, getKontakte } from "@/lib/kundenStore";
import { findPotentialDuplicates } from "@/lib/duplikatCheck";

const TEMPLATE_URL = "/dokumente/OS-Immobilien_Bestandskunden_Import_Vorlage.csv";
const HEADERS = [
  "anrede","vorname","nachname","email","telefon","strasse","plz","ort","geburtsdatum","beruf",
  "person2_anrede","person2_vorname","person2_nachname","person2_email","person2_telefon","person2_geburtsdatum",
  "berater_email","tippgeber_email","notiz",
];

const ALLOWED_ROLES = ["admin","inhaber","vertriebsleiter","vertriebspartner","partner","backoffice","individuell","testaccount"];

// Tiny CSV parser: supports quoted fields, commas, escaped quotes, CRLF.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { field += c; }
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else { field += c; }
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim().length > 0));
}

interface Row {
  raw: Record<string, string>;
  errors: string[];
  warnings: string[];
  dupe?: string;
  status: "ok" | "warn" | "error";
}

function validateRow(r: Record<string, string>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!r.vorname?.trim()) errors.push("Vorname fehlt");
  if (!r.nachname?.trim()) errors.push("Nachname fehlt");
  if (!r.email?.trim() && !r.telefon?.trim()) errors.push("E-Mail oder Telefon erforderlich");
  if (r.email && !/^\S+@\S+\.\S+$/.test(r.email.trim())) errors.push("E-Mail ungültig");
  if (r.person2_email && !/^\S+@\S+\.\S+$/.test(r.person2_email.trim())) warnings.push("Person-2-E-Mail ungültig");
  return { errors, warnings };
}

export default function BestandskundenImportCsv() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [filename, setFilename] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; skipped: number; failed: number } | null>(null);

  if (!ALLOWED_ROLES.includes(user.role)) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-muted-foreground">Du hast keine Berechtigung für den CSV-Import.</div>
      </DashboardLayout>
    );
  }

  const stats = useMemo(() => {
    const ok = rows.filter(r => r.status === "ok").length;
    const warn = rows.filter(r => r.status === "warn").length;
    const err = rows.filter(r => r.status === "error").length;
    return { ok, warn, err };
  }, [rows]);

  const handleFile = async (file: File) => {
    setFilename(file.name);
    setResult(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) { toast({ title: "Leere Datei", variant: "destructive" }); return; }
    const header = parsed[0].map(h => h.trim().toLowerCase());
    const idx: Record<string, number> = {};
    for (const h of HEADERS) idx[h] = header.indexOf(h);
    const missing = HEADERS.filter(h => ["vorname","nachname"].includes(h) && idx[h] === -1);
    if (missing.length > 0) {
      toast({ title: "CSV-Header fehlerhaft", description: `Pflicht-Spalten fehlen: ${missing.join(", ")}`, variant: "destructive" });
      return;
    }
    const allKontakte = getKontakte();
    const out: Row[] = [];
    for (let i = 1; i < parsed.length; i++) {
      const cols = parsed[i];
      const raw: Record<string, string> = {};
      for (const h of HEADERS) raw[h] = idx[h] >= 0 ? (cols[idx[h]] || "").trim() : "";
      const { errors, warnings } = validateRow(raw);
      let dupe: string | undefined;
      if (errors.length === 0) {
        const matches = findPotentialDuplicates({ vorname: raw.vorname, nachname: raw.nachname, email: raw.email, telefon: raw.telefon }, allKontakte);
        if (matches.length > 0) {
          dupe = `${matches[0].grund}: ${matches[0].detail}`;
          warnings.push(`Mögliches Duplikat (${dupe})`);
        }
      }
      out.push({
        raw, errors, warnings, dupe,
        status: errors.length > 0 ? "error" : warnings.length > 0 ? "warn" : "ok",
      });
    }
    setRows(out);
  };

  const doImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    const batchId = crypto.randomUUID();
    let ok = 0, skipped = 0, failed = 0;
    for (const r of rows) {
      if (r.status === "error") { skipped++; continue; }
      if (r.dupe) { skipped++; continue; }
      try {
        const raw = r.raw;
        const person2 = (raw.person2_vorname || raw.person2_nachname) ? {
          anrede: raw.person2_anrede, vorname: raw.person2_vorname, nachname: raw.person2_nachname,
          email: raw.person2_email, telefon: raw.person2_telefon, geburtsdatum: raw.person2_geburtsdatum,
        } : undefined;
        await addKontakt({
          anrede: raw.anrede, vorname: raw.vorname, nachname: raw.nachname,
          email: raw.email, telefon: raw.telefon,
          strasse: raw.strasse, plz: raw.plz, ort: raw.ort,
          geburtstag: raw.geburtsdatum, position: raw.beruf,
          quelle: "bestandsimport_csv",
          pipelineStufe: "bestandsimport" as any,
          status: "neu",
          meta: {
            kontaktTyp: "eigen",
            herkunftKanal: "Bestandsimport (CSV)",
            bestandSeit: new Date().toISOString(),
            importBatchId: batchId,
            ...(raw.notiz ? { notiz: raw.notiz } : {}),
            ...(raw.berater_email ? { beraterEmail: raw.berater_email } : {}),
            ...(raw.tippgeber_email ? { tippgeberEmail: raw.tippgeber_email } : {}),
            ...(person2 ? { person2 } : {}),
          },
        } as any);
        ok++;
      } catch (e) {
        console.error("Import row failed", e);
        failed++;
      }
    }
    setImporting(false);
    setResult({ ok, skipped, failed });
    toast({ title: `Import abgeschlossen: ${ok} angelegt, ${skipped} übersprungen, ${failed} Fehler` });
  };

  const hasBlockers = stats.err > 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Bestandskunden CSV-Import" subtitle="Mehrere Bestandskontakte gleichzeitig hochladen" />

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => navigate("/bestandskunden-import")}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Zurück
              </Button>
              <a href={TEMPLATE_URL} download className="inline-flex">
                <Button variant="outline"><Download className="h-4 w-4 mr-2" /> Vorlage herunterladen</Button>
              </a>
              <input
                type="file"
                accept=".csv,text/csv"
                ref={fileRef}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <Button onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> CSV auswählen
              </Button>
              {filename && <div className="text-sm text-muted-foreground">{filename}</div>}
            </div>

            <div className="text-xs text-muted-foreground">
              Pflicht-Spalten: <code>vorname</code>, <code>nachname</code>, plus mindestens <code>email</code> ODER <code>telefon</code>. Person 2 in derselben Zeile (Spalten <code>person2_*</code>). Berater optional über <code>berater_email</code>.
            </div>

            {rows.length > 0 && (
              <>
                <div className="flex items-center gap-3 text-sm">
                  <Badge variant="default" className="bg-green-600">{stats.ok} OK</Badge>
                  <Badge variant="secondary">{stats.warn} Warnungen</Badge>
                  <Badge variant="destructive">{stats.err} Fehler</Badge>
                </div>

                <div className="border rounded-md max-h-[50vh] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>E-Mail / Telefon</TableHead>
                        <TableHead>Person 2</TableHead>
                        <TableHead>Hinweise</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r, i) => (
                        <TableRow key={i} className={r.status === "error" ? "bg-destructive/5" : r.status === "warn" ? "bg-yellow-500/5" : ""}>
                          <TableCell className="text-xs text-muted-foreground">{i + 2}</TableCell>
                          <TableCell>
                            {r.status === "ok" && <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>}
                            {r.status === "warn" && <Badge variant="secondary"><AlertTriangle className="h-3 w-3 mr-1" />Warn</Badge>}
                            {r.status === "error" && <Badge variant="destructive">Fehler</Badge>}
                          </TableCell>
                          <TableCell>{r.raw.vorname} {r.raw.nachname}</TableCell>
                          <TableCell className="text-xs">{r.raw.email || "—"}<br />{r.raw.telefon || ""}</TableCell>
                          <TableCell className="text-xs">{(r.raw.person2_vorname || r.raw.person2_nachname) ? `${r.raw.person2_vorname} ${r.raw.person2_nachname}` : "—"}</TableCell>
                          <TableCell className="text-xs">
                            {r.errors.map((e, k) => <div key={`e${k}`} className="text-destructive">{e}</div>)}
                            {r.warnings.map((w, k) => <div key={`w${k}`} className="text-yellow-700 dark:text-yellow-400">{w}</div>)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    Fehler-Zeilen und Duplikate werden beim Import übersprungen. Berater wird aus E-Mail-Lookup ermittelt (Fallback: aktueller Nutzer).
                  </div>
                  <Button onClick={doImport} disabled={importing || rows.length === 0 || (stats.ok + stats.warn === 0)}>
                    {importing ? "Importiere…" : `${stats.ok + stats.warn} Bestandskontakte importieren`}
                  </Button>
                </div>

                {result && (
                  <div className="rounded-md border bg-muted/30 p-4 text-sm">
                    <strong>Ergebnis:</strong> {result.ok} angelegt, {result.skipped} übersprungen, {result.failed} Fehler.
                    {result.ok > 0 && (
                      <Button variant="link" className="ml-2" onClick={() => navigate("/bestandskunden-import")}>Zur Bestandsliste →</Button>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}