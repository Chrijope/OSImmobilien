import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Upload, FileSpreadsheet, Undo2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addKontakteBulk, getKontakte, importZuruecknehmen, letzterImportAusDaten, type KundeData } from "@/lib/kundenStore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PIPELINE_STUFEN } from "@/lib/kontaktPipeline";
import { stufenFilterLabel } from "@/lib/pipelineStufen";
import { createInvestment, updateInvestment, getInvestmentsByKontakt } from "@/lib/investmentsStore";
import { useUser } from "@/contexts/UserContext";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";
import { zahlAusText } from "@/lib/zahlAusText";
import { emailSchluessel, telefonSchluessel } from "@/lib/duplikatCheck";

const ADMIN_ROLES = ["admin", "inhaber", "vertriebsleiter", "testaccount"];

// Stufen, ab denen automatisch ein Investment-Container angelegt werden muss,
// damit der Kontakt im Kundenprofil korrekt weiterlaufen kann.
const STUFEN_MIT_INVESTMENT = new Set<string>([
  "beratungsgespraech", "bonitaetsunterlagen", "objektauswahl",
  "follow_up_objekt", "reservierung", "finanzierung", "notar", "faelligkeit",
  "abrechnung", "abgeschlossen",
]);

/**
 * Merkzettel fuer den letzten Import im localStorage. Damit kann der Knopf
 * "Diesen Import zuruecknehmen" auch nach einem versehentlichen Schliessen
 * des Dialogs noch angeboten werden. Bewusst nur der letzte Stapel, keine
 * Historienverwaltung.
 */
const LETZTER_IMPORT_KEY = "mi_letzter_import";

interface LetzterImport {
  batchId: string;
  anzahl: number;
  datum: string;
}

function ladeLetztenImport(): LetzterImport | null {
  try {
    const raw = localStorage.getItem(LETZTER_IMPORT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.batchId === "string" && parsed.batchId) return parsed;
    return null;
  } catch {
    return null;
  }
}

const CSV_HEADERS = [
  "anrede", "vorname", "nachname", "email", "telefon", "geburtstag",
  "strasse", "hausnummer", "plz", "ort", "quelle", "berater",
  "firma", "position", "objekt", "kaufpreis", "status", "pipelineStufe",
  "finanzierbarkeit", "leadTyp",
  "qualZiel", "qualEinkommen", "qualEigenkapital", "qualBeruflicheSituation",
];

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

// Smart header mapping: maps common external CSV headers to internal field names
const HEADER_ALIASES: Record<string, string> = {
  vorname: "vorname", nachname: "nachname", name: "name",
  "e-mail": "email", email: "email", "e-mail-adresse": "email", emailadresse: "email",
  telefon: "telefon", telefonnummer: "telefon", phone: "telefon", "sekundäretelefonnummer": "telefon2",
  quelle: "quelle", source: "quelle", kanal: "kanal", formular: "formular",
  phase: "phase", status: "status", stage: "phase",
  eigentümer: "berater", owner: "berater", berater: "berater",
  ort: "ort", city: "ort", stadt: "ort",
  strasse: "strasse", straße: "strasse", hausnummer: "hausnummer",
  plz: "plz", postleitzahl: "plz",
  anrede: "anrede", firma: "firma", company: "firma",
  position: "position", objekt: "objekt", kaufpreis: "kaufpreis",
  pipelinestufe: "pipelinestufe", finanzierbarkeit: "finanzierbarkeit",
  leadtyp: "leadtyp", labels: "labels", erstellt: "erstellt",
  geburtstag: "geburtstag",
  "whatsapp-nummer": "whatsapp",
  // Qualifizierungsfragen
  ziel: "ziel", qualziel: "ziel", "wasistdeinziel?": "ziel", "wasistdeinziel": "ziel",
  einkommen: "einkommen", monatlicheseinkommen: "einkommen", qualeinkommen: "einkommen",
  "wievielgeldverdienstdumonatlich?": "einkommen", "wievielgeldverdienstdumonatlich": "einkommen",
  eigenkapital: "eigenkapital", qualeigenkapital: "eigenkapital",
  "wievieleigenkapitalstehtdirzurverfugung?": "eigenkapital",
  "wievieleigenkapitalstehtdirzurverfugung": "eigenkapital",
  beruf: "beruf", berufliches: "beruf", beruflichesituation: "beruf",
  qualberuflichesituation: "beruf",
  "wasistdeinederzeitigeberuflichesituation?": "beruf",
  "wasistdeinederzeitigeberuflichesituation": "beruf",
};

const PHASE_MAP: Record<string, string> = {
  neu: "neuer_lead", new: "neuer_lead",
  qualifiziert: "qualifiziert", qualified: "qualifiziert",
  kontaktiert: "kontaktiert", contacted: "kontaktiert",
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === "," || ch === ";") { result.push(current.trim()); current = ""; }
      else { current += ch; }
    }
  }
  result.push(current.trim());
  return result;
}

function mapHeaders(rawHeaders: string[]): string[] {
  return rawHeaders.map(h => {
    const key = h.toLowerCase().replace(/\s+/g, "").replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u");
    // Try exact match first, then without special chars
    return HEADER_ALIASES[h.toLowerCase().replace(/\s+/g, "")] ||
           HEADER_ALIASES[key] ||
           h.toLowerCase().replace(/\s+/g, "");
  });
}

function splitName(fullName: string): { vorname: string; nachname: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { vorname: "", nachname: "" };
  if (parts.length === 1) return { vorname: parts[0], nachname: "" };
  // Last part = nachname, rest = vorname
  const nachname = parts.pop()!;
  return { vorname: parts.join(" "), nachname };
}

interface ImportExportButtonProps {
  kontakte: KundeData[];
  onImportDone: () => void;
  exportFilename?: string;
  hideImport?: boolean;
  /**
   * Default-Bucket für importierte Kontakte:
   * - "leadverwaltung" → Stufe „neuer_lead" (Default in Lead-Verwaltung)
   * - "kontakte" → Stufe „erstgespraech" (Default in Kontakte / Alle Kontakte)
   * CSV-Werte (status / pipelineStufe) haben weiterhin Vorrang.
   */
  importTarget?: "leadverwaltung" | "kontakte";
}

export function ImportExportButton({ kontakte, onImportDone, exportFilename = "kontakte", hideImport, importTarget = "kontakte" }: ImportExportButtonProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const canExport = ADMIN_ROLES.includes(String(user?.role || ""));
  // Wenn Export nicht erlaubt UND Import versteckt ist, macht der Button keinen Sinn.
  const showButton = canExport || !hideImport;
  const [dialogOpen, setDialogOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Ziel-Stufe für den nächsten CSV-Import (Default abhängig vom Bucket)
  const defaultStufe = importTarget === "leadverwaltung" ? "neuer_lead" : "erstgespraech_geplant";
  const [targetStufe, setTargetStufe] = useState<string>(defaultStufe);

  const handleExport = () => {
    const header = CSV_HEADERS.join(";");
    const rows = kontakte.map(k =>
      CSV_HEADERS.map(h => escapeCSV(String((k as any)[h] ?? ""))).join(";")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFilename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export erfolgreich ✓", description: `${kontakte.length} Kontakte exportiert.` });
  };

  const [importing, setImporting] = useState(false);
  const [fortschritt, setFortschritt] = useState<{ fertig: number; gesamt: number } | null>(null);
  // Letzter Import (aus localStorage), fuer den Zuruecknehmen-Knopf
  const [letzterImport, setLetzterImport] = useState<LetzterImport | null>(() => ladeLetztenImport());
  // Ohne Browser-Merkzettel (anderer Rechner, geleerter Speicher) den letzten
  // Import beim Oeffnen des Dialogs aus den Daten selbst herleiten.
  useEffect(() => {
    if (!dialogOpen || letzterImport) return;
    const abgeleitet = letzterImportAusDaten();
    if (abgeleitet) setLetzterImport(abgeleitet);
  }, [dialogOpen, letzterImport]);
  const [ruecknahmeDialogOffen, setRuecknahmeDialogOffen] = useState(false);
  const [ruecknahmeLaeuft, setRuecknahmeLaeuft] = useState(false);
  const [ruecknahmeFortschritt, setRuecknahmeFortschritt] = useState<{ fertig: number; gesamt: number } | null>(null);

  const handleRuecknahme = async () => {
    if (!letzterImport || ruecknahmeLaeuft) return;
    setRuecknahmeLaeuft(true);
    setRuecknahmeFortschritt({ fertig: 0, gesamt: letzterImport.anzahl });
    try {
      const ergebnis = await importZuruecknehmen(letzterImport.batchId, {
        geloeschtVonName: user?.name,
        onFortschritt: (fertig, gesamt) => setRuecknahmeFortschritt({ fertig, gesamt }),
      });
      toast({
        title: ergebnis.fehler > 0 ? "Import teilweise zurückgenommen" : "Import zurückgenommen ✓",
        description: `${ergebnis.verschoben} Kontakte in den Papierkorb verschoben${ergebnis.fehler > 0 ? `, ${ergebnis.fehler} fehlgeschlagen` : ""}.`,
        variant: ergebnis.fehler > 0 ? "destructive" : "default",
      });
      if (ergebnis.fehler === 0) {
        try { localStorage.removeItem(LETZTER_IMPORT_KEY); } catch { /* ignorieren */ }
        setLetzterImport(null);
      }
      onImportDone();
    } catch (e: any) {
      toast({
        title: "Zurücknehmen fehlgeschlagen",
        description: e?.message || "Bitte in ein paar Sekunden erneut versuchen.",
        variant: "destructive",
      });
    } finally {
      setRuecknahmeLaeuft(false);
      setRuecknahmeFortschritt(null);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Eine Batch-ID pro CSV-Upload → erlaubt späteres Filtern / Rückgängigmachen
    const importBatchId = (typeof crypto !== "undefined" && (crypto as any).randomUUID)
      ? (crypto as any).randomUUID()
      : `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      // BOM entfernen + leere Zeilen + Kommentar-Zeilen (#) überspringen
      const cleaned = text.replace(/^\uFEFF/, "");
      const lines = cleaned
        .split(/\r?\n/)
        .map(l => l.replace(/^\uFEFF/, ""))
        .filter(l => l.trim() && !l.trim().startsWith("#"));
      if (lines.length < 2) {
        toast({ title: "Fehler", description: "Die CSV-Datei enthält keine Daten.", variant: "destructive" });
        return;
      }
      const rawHeaders = parseCSVLine(lines[0]);
      const headers = mapHeaders(rawHeaders);
      const hasVorname = headers.includes("vorname");
      const hasNachname = headers.includes("nachname");
      const hasName = headers.includes("name");
      let errors = 0;
      const skipReasons: string[] = [];

      setImporting(true);
      setFortschritt({ fertig: 0, gesamt: lines.length - 1 });

      // Bestehende Kontakte einmal indizieren. Ohne diesen Index waere die
      // Dublettenpruefung pro Zeile eine volle Suche, also quadratischer
      // Aufwand: bei 10.000 Zeilen zig Millionen Vergleiche.
      // Vergleichsformen aus duplikatCheck.ts, damit "0171 …" und "+49 171 …"
      // als dieselbe Nummer gelten. Der gleiche Name allein ueberspringt hier
      // bewusst keine Zeile, weil der Import Treffer ohne Rueckfrage auslaesst.
      const vorhandeneMails = new Set<string>();
      const vorhandeneTelefone = new Set<string>();
      for (const k of getKontakte()) {
        const m = emailSchluessel(k.email);
        if (m) vorhandeneMails.add(m);
        const t = telefonSchluessel(k.telefon);
        if (t) vorhandeneTelefone.add(t);
      }
      let doubletten = 0;

      // Schritt 1: Datei vollständig lesen und aufbereiten. Erst danach wird
      // geschrieben, damit ein Formatfehler nicht auf halber Strecke auffällt.
      const vorbereitet: (Partial<KundeData> & { vorname: string; nachname: string; __stufe: string })[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ""; });

        let vorname = "";
        let nachname = "";

        if (hasVorname || hasNachname) {
          vorname = (row.vorname || "").trim();
          nachname = (row.nachname || "").trim();
        }
        // Fallback: split "name" column
        if (!vorname && !nachname && hasName && row.name?.trim()) {
          const split = splitName(row.name);
          vorname = split.vorname;
          nachname = split.nachname;
        }

        // Skip rows with no name at all
        if (!vorname && !nachname) {
          errors++;
          if (skipReasons.length < 3) skipReasons.push(`Zeile ${i + 1}: kein Vor-/Nachname`);
          continue;
        }
        // If only one part, use it as nachname
        if (!nachname && vorname) { nachname = vorname; vorname = ""; }

        const mail = emailSchluessel(row.email);
        const tel = telefonSchluessel(row.telefon);
        // Dubletten sowohl gegen den Bestand als auch innerhalb der Datei.
        if ((mail && vorhandeneMails.has(mail)) || (tel && vorhandeneTelefone.has(tel))) {
          doubletten++;
          continue;
        }
        if (mail) vorhandeneMails.add(mail);
        if (tel) vorhandeneTelefone.add(tel);

        // Quelle: aus CSV übernehmen, sonst Default "CSV-Upload"
        const quelle = (row.quelle || "").trim() || "CSV-Upload";
        const importedStufe = ((row.pipelinestufe as string) || (row.pipelineStufe as string) || targetStufe || "").trim();

        vorbereitet.push({
          __stufe: importedStufe,
            anrede: (row.anrede || "").trim(),
            vorname,
            nachname,
            email: (row.email || "").trim(),
            telefon: (row.telefon || "").trim(),
            geburtstag: (row.geburtstag || "").trim(),
            strasse: (row.strasse || "").trim(),
            hausnummer: (row.hausnummer || "").trim(),
            plz: (row.plz || "").trim(),
            ort: (row.ort || "").trim(),
            quelle,
            // berater/zustaendig_id absichtlich nicht setzen → automatische
            // Zuweisung an den importierenden Nutzer.
            firma: (row.firma || "").trim(),
            position: (row.position || "").trim(),
            objekt: (row.objekt || "").trim(),
            // Dieselbe Umwandlung wie in allen Formularen. Vorher stand hier
            // eine eigene, die den Tausenderpunkt nicht kannte: Aus "650.000"
            // wurden 650, aus "1.250.000" wurde gar keine Zahl.
            kaufpreis: zahlAusText(row.kaufpreis),
            // Reihenfolge der Vorrangregeln:
            //   1. Wert in der CSV-Zeile (`pipelinestufe`-Spalte)
            //   2. vom User im Dialog gewählte Ziel-Stufe
            //   3. Default für den Bucket
            status: (row.status as any) || (targetStufe === "neuer_lead" ? "neu" : "kontaktiert"),
            pipelineStufe: (row.pipelinestufe as any) || (row.pipelineStufe as any) || (targetStufe as any),
            finanzierbarkeit: (row.finanzierbarkeit || "").trim(),
            leadTyp: ((row.leadtyp || row.leadTyp || "manuell") as any),
            // Qualifizierungsfragen
            qualZiel: (row.ziel || "").trim() || undefined,
            qualEinkommen: (row.einkommen || "").trim() || undefined,
            qualEigenkapital: (row.eigenkapital || "").trim() || undefined,
            qualBeruflicheSituation: (row.beruf || "").trim() || undefined,
        });
      }

      // Schritt 2: in Stapeln zu 500 schreiben. Die Kundennummer vergibt die
      // Datenbank, deshalb sind gleichzeitige Inserts unbedenklich.
      const ergebnis = await addKontakteBulk(
        vorbereitet.map(({ __stufe, ...rest }) => rest),
        {
          importBatchId,
          metaBasis: { kontaktTyp: "eigen", herkunftKanal: "CSV-Upload" },
          onFortschritt: (fertig, gesamt) => setFortschritt({ fertig, gesamt }),
        },
      );
      const imported = ergebnis.angelegt;
      errors += ergebnis.fehler;
      skipReasons.push(...ergebnis.meldungen.slice(0, 3 - skipReasons.length));

      // Schritt 3: Investments fuer die wenigen Zeilen nachziehen, die schon
      // weiter hinten in der Pipeline stehen. Der DB-Trigger
      // `auto_create_investment_for_kontakt` hat beim Einfuegen bereits je
      // Kontakt ein Investment in Stufe "erstgespraech" angelegt; nach dem
      // Neuladen am Ende von addKontakteBulk liegt es im Cache. Deshalb hier
      // nur die Stufe des vorhandenen Investments anpassen statt ein zweites
      // anzulegen (das war vorher eine Doppelungsfalle, weil der Cache das
      // Trigger-Investment noch nicht kannte).
      for (const zeile of ergebnis.zeilen) {
        const stufe = String(zeile?.meta?.pipelineStufe || "");
        if (!STUFEN_MIT_INVESTMENT.has(stufe)) continue;
        try {
          const vorhandene = getInvestmentsByKontakt(zeile.id);
          if (vorhandene.length > 0) {
            if (vorhandene[0].pipelineStufe !== stufe) {
              updateInvestment(vorhandene[0].id, { pipelineStufe: stufe as any });
            }
          } else {
            // Rueckfallebene, falls der Trigger nichts angelegt hat
            const inv = await createInvestment(zeile.id, zeile.objekt || undefined);
            updateInvestment(inv.id, { pipelineStufe: stufe as any });
          }
        } catch (invErr) {
          console.warn("Auto-Investment für CSV-Import fehlgeschlagen:", invErr);
        }
      }

      setImporting(false);
      setFortschritt(null);
      // Letzten Import merken, damit "Zuruecknehmen" auch nach einem
      // versehentlichen Schliessen des Dialogs noch angeboten werden kann.
      if (imported > 0) {
        const eintrag: LetzterImport = { batchId: importBatchId, anzahl: imported, datum: new Date().toISOString() };
        try { localStorage.setItem(LETZTER_IMPORT_KEY, JSON.stringify(eintrag)); } catch { /* ignorieren */ }
        setLetzterImport(eintrag);
      }
      const headerInfo = !hasVorname && !hasNachname && !hasName
        ? ` Hinweis: keine Spalte "vorname"/"nachname"/"name" erkannt. Header gefunden: ${rawHeaders.join(", ")}`
        : "";
      toast({
        title: imported > 0 ? "Import abgeschlossen ✓" : "Import fehlgeschlagen",
        description: `${imported} Kontakte importiert${doubletten > 0 ? `, ${doubletten} Dubletten übersprungen` : ""}${errors > 0 ? `, ${errors} Zeilen fehlerhaft` : ""}.${headerInfo}${skipReasons.length ? " | " + skipReasons.join(" · ") : ""}`,
        variant: imported === 0 ? "destructive" : "default",
      });
      onImportDone();
      // Dialog bewusst offen lassen: In der Zusammenfassung erscheint der
      // Knopf "Diesen Import zuruecknehmen".
    };
    reader.readAsText(file, "UTF-8");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDownloadTemplate = () => {
    const a = document.createElement("a");
    a.href = "/dokumente/OS-Immobilien_Import_Vorlage.csv";
    a.download = "OS-Immobilien_Import_Vorlage.csv";
    a.click();
  };

  if (!showButton) return null;
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1" onClick={() => setDialogOpen(true)}>
        <FileSpreadsheet className="h-4 w-4" />
        {canExport ? (hideImport ? "Export" : "Import / Export") : "Import"}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent overlayClassName={NUR_POPUP_OVERLAY} className="max-w-md">
          <DialogHeader><DialogTitle>{canExport ? (hideImport ? "Daten Export" : "Daten Import / Export") : "Daten Import"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {canExport && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Export</h4>
              <p className="text-xs text-muted-foreground">Exportiert alle aktuell angezeigten {kontakte.length} Kontakte als CSV-Datei.</p>
              <Button variant="outline" className="w-full gap-2" onClick={handleExport}>
                <Download className="h-4 w-4" /> CSV exportieren
              </Button>
            </div>
            )}

            {!hideImport && (
              <div className={`${canExport ? "border-t pt-4 " : ""}space-y-2`}>
                <h4 className="text-sm font-medium">Import</h4>
                <p className="text-xs text-muted-foreground">
                  Importiere Kontakte aus einer CSV-Datei. Pflichtfelder: Vorname, Nachname.
                  Trennzeichen: Semikolon (;) oder Komma (,).
                </p>
                <div className="rounded-md border bg-muted/40 p-2 space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Erkannte Spaltenüberschriften (Reihenfolge frei wählbar):
                  </p>
                  <p className="text-[11px] font-mono leading-relaxed text-foreground/80 break-words">
                    anrede; vorname; nachname; email; telefon; geburtstag;
                    strasse; hausnummer; plz; ort; quelle;
                    ziel; einkommen; eigenkapital; beruf
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Qualifizierungsfragen:
                    <br />• <span className="font-medium">ziel</span> = Was ist dein Ziel?
                    <br />• <span className="font-medium">einkommen</span> = Wie viel Geld verdienst du monatlich?
                    <br />• <span className="font-medium">eigenkapital</span> = Wie viel Eigenkapital steht dir zur Verfügung?
                    <br />• <span className="font-medium">beruf</span> = Was ist deine derzeitige berufliche Situation?
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Tipp: Lade zuerst die Vorlage herunter – sie enthält die exakten Spaltennamen + 2 Beispielzeilen.
                  </p>
                </div>
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={handleDownloadTemplate}>
                  <Download className="h-3 w-3" /> Vorlage herunterladen
                </Button>
                <div className="space-y-1 pt-2 border-t">
                  <Label className="text-xs font-medium">Ziel-Pipeline-Stufe für diesen Import</Label>
                  <Select value={targetStufe} onValueChange={setTargetStufe}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PIPELINE_STUFEN
                        .filter(s => !["abgeschlossen","archiviert","verloren"].includes(s.key))
                        .map(s => (
                          <SelectItem key={s.key} value={s.key} className="text-xs">{stufenFilterLabel(s.key)}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Alle Kontakte starten in dieser Stufe und werden als <span className="font-medium">Eigenkontakt</span> markiert.
                    Eine Spalte <code className="font-mono">pipelinestufe</code> in der CSV überschreibt diese Vorgabe pro Zeile.
                  </p>
                </div>
                <label className="block">
                  <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleImport} />
                  <Button className="w-full gap-2" onClick={() => fileRef.current?.click()} disabled={importing}>
                    {importing ? (
                      <>
                        <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                        {fortschritt
                          ? `Importiere ${fortschritt.fertig} von ${fortschritt.gesamt}...`
                          : "Importiere..."}
                      </>
                    ) : (
                      <><Upload className="h-4 w-4" /> CSV importieren</>
                    )}
                  </Button>
                </label>
                {importing && fortschritt && fortschritt.gesamt > 0 && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.round((fortschritt.fertig / fortschritt.gesamt) * 100)}%` }}
                    />
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Keine Mengenbegrenzung: Die Datei wird in Stapeln zu 500 Kontakten geschrieben.
                  Dubletten mit gleicher E-Mail oder Telefonnummer werden übersprungen.
                </p>
                {letzterImport && !importing && (
                  <div className="rounded-md border p-2 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Letzter Import: {letzterImport.anzahl.toLocaleString("de-DE")} Kontakte
                      am {new Date(letzterImport.datum).toLocaleDateString("de-DE")}.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1 text-xs text-destructive"
                      onClick={() => setRuecknahmeDialogOffen(true)}
                      disabled={ruecknahmeLaeuft}
                    >
                      {ruecknahmeLaeuft ? (
                        <>
                          <span className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                          {ruecknahmeFortschritt
                            ? `Nehme zurück, ${ruecknahmeFortschritt.fertig} von ${ruecknahmeFortschritt.gesamt}...`
                            : "Nehme zurück..."}
                        </>
                      ) : (
                        <><Undo2 className="h-3 w-3" /> Diesen Import zurücknehmen</>
                      )}
                    </Button>
                    {ruecknahmeLaeuft && ruecknahmeFortschritt && ruecknahmeFortschritt.gesamt > 0 && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-destructive transition-all"
                          style={{ width: `${Math.round((ruecknahmeFortschritt.fertig / ruecknahmeFortschritt.gesamt) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={ruecknahmeDialogOffen} onOpenChange={setRuecknahmeDialogOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import zurücknehmen?</AlertDialogTitle>
            <AlertDialogDescription>
              Verschiebt alle {letzterImport?.anzahl.toLocaleString("de-DE")} gerade importierten
              Kontakte in den Papierkorb. Der Papierkorb kann wiederherstellen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setRuecknahmeDialogOffen(false); void handleRuecknahme(); }}>
              Zurücknehmen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
